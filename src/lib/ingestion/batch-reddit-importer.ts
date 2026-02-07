// Batch Reddit Data Importer
// Processes large Reddit data dumps (zstd-compressed NDJSON) from Arctic Shift / Academic Torrents

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ScrapedReport, ScrapedMediaItem } from './types';
import {
  assessQuality,
  getStatusFromScore,
  improveTitleWithAI,
  getSourceLabel,
  isObviouslyLowQuality,
} from './filters';
import { parseLocation } from './utils/location-parser';
import * as readline from 'readline';
import * as fs from 'fs';
import * as zlib from 'zlib';
import { spawn } from 'child_process';

// Subreddit category mapping (same as reddit adapter)
const SUBREDDIT_CATEGORIES: Record<string, string> = {
  'UFOs': 'ufos_aliens',
  'ufo': 'ufos_aliens',
  'aliens': 'ufos_aliens',
  'UAP': 'ufos_aliens',
  'Ghosts': 'ghosts_hauntings',
  'ghosts': 'ghosts_hauntings',
  'Paranormal': 'ghosts_hauntings',
  'Thetruthishere': 'ghosts_hauntings',
  'Haunted': 'ghosts_hauntings',
  'bigfoot': 'cryptids',
  'cryptids': 'cryptids',
  'cryptozoology': 'cryptids',
  'skinwalkers': 'cryptids',
  'Glitch_in_the_Matrix': 'psychological_experiences',
  'NDE': 'psychological_experiences',
  'Tulpas': 'psychological_experiences',
  'AstralProjection': 'consciousness_practices',
  'LucidDreaming': 'consciousness_practices',
  'Psychonaut': 'consciousness_practices',
  'Psychic': 'psychic_phenomena',
  'HighStrangeness': 'combination'
};

// Target subreddits for paranormal content
export const TARGET_SUBREDDITS = new Set([
  'paranormal', 'ufos', 'ghosts', 'thetruthishere', 'highstrangeness',
  'cryptids', 'bigfoot', 'aliens', 'skinwalkers', 'glitch_in_the_matrix',
  'ufo', 'uap', 'nde', 'astral projection', 'luciddreaming', 'psychonaut',
  'psychic', 'cryptozoology', 'haunted', 'tulpas'
]);

// Reddit post interface (matches dump format for both submissions and comments)
interface RedditPost {
  id: string;
  title?: string;          // Submissions have title, comments don't
  selftext?: string;       // Submission body
  self_text?: string;      // Alternative field name
  body?: string;           // Comment body
  author: string;
  subreddit: string;
  created_utc: number;
  score: number;
  num_comments?: number;
  url?: string;
  permalink?: string;
  link_flair_text?: string;
  is_self?: boolean;
  // Comment-specific fields
  parent_id?: string;      // t1_xxx for reply to comment, t3_xxx for reply to post
  link_id?: string;        // t3_xxx - the submission this comment belongs to
  // Media fields
  preview?: {
    images?: Array<{
      source?: { url: string; width: number; height: number };
      resolutions?: Array<{ url: string; width: number; height: number }>;
    }>;
    reddit_video_preview?: { fallback_url: string; width: number; height: number };
  };
  media?: {
    reddit_video?: { fallback_url: string; width: number; height: number };
  };
  secure_media?: {
    reddit_video?: { fallback_url: string; width: number; height: number };
  };
  gallery_data?: {
    items: Array<{ media_id: string; caption?: string }>;
  };
  media_metadata?: Record<string, {
    s?: { u?: string; x?: number; y?: number };  // Source image
    p?: Array<{ u: string; x: number; y: number }>;  // Previews
  }>;
  is_video?: boolean;
  is_gallery?: boolean;
  post_hint?: string;  // 'image', 'hosted:video', 'rich:video', 'link', 'self'
}

// Import progress tracking
export interface ImportProgress {
  totalLines: number;
  processedLines: number;
  matchedSubreddit: number;
  passedFilters: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  errors: number;
  startTime: number;
  lastUpdate: number;
}

// Import options
export interface BatchImportOptions {
  filePath: string;
  subreddits?: string[];  // If not specified, uses TARGET_SUBREDDITS
  batchSize?: number;     // Records to process before DB commit (default 100)
  limit?: number;         // Max records to import (for testing)
  skipDuplicates?: boolean;
  useAITitles?: boolean;  // Whether to use AI title enhancement (slower but better)
  onProgress?: (progress: ImportProgress) => void;
}

// Initialize Supabase
function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Generate URL-safe slug
function generateSlug(title: string, originalReportId: string, sourceType: string): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);

  const uniqueKey = `${sourceType}-${originalReportId}`;
  let hash = 0;
  for (let i = 0; i < uniqueKey.length; i++) {
    const char = uniqueKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hashStr = Math.abs(hash).toString(36).substring(0, 8);

  return `${baseSlug}-${hashStr}`;
}

// Generate a title from comment body (for comments that lack titles)
function generateTitleFromBody(body: string, subreddit: string): string {
  // Clean the body first
  const cleanBody = body
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Try to find a good opening sentence
  const firstSentence = cleanBody.match(/^[^.!?]+[.!?]/)?.[0] || '';

  if (firstSentence.length >= 20 && firstSentence.length <= 120) {
    return firstSentence.trim();
  }

  // Otherwise truncate intelligently
  if (cleanBody.length <= 100) {
    return cleanBody;
  }

  // Find a good break point (word boundary)
  const truncated = cleanBody.substring(0, 100);
  const lastSpace = truncated.lastIndexOf(' ');
  const title = lastSpace > 50 ? truncated.substring(0, lastSpace) : truncated;

  return title + '...';
}

// Detect if this is a comment (vs a submission)
function isComment(post: RedditPost): boolean {
  return !post.title && (!!post.body || !!post.parent_id);
}

// Check if URL is a known image host
function isImageUrl(url: string): boolean {
  if (!url) return false;
  const imageHosts = ['i.redd.it', 'i.imgur.com', 'imgur.com', 'preview.redd.it'];
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

  const isKnownHost = imageHosts.some(host => url.includes(host));
  const hasImageExtension = imageExtensions.some(ext => url.toLowerCase().includes(ext));

  return isKnownHost || hasImageExtension;
}

// Check if URL is a video
function isVideoUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('v.redd.it') || url.includes('.mp4') || url.includes('youtube.com') || url.includes('youtu.be');
}

// Extract media items from a Reddit post
function extractMedia(post: RedditPost): ScrapedMediaItem[] {
  const media: ScrapedMediaItem[] = [];

  // 1. Check for gallery posts (multiple images)
  if (post.is_gallery && post.gallery_data && post.media_metadata) {
    for (const item of post.gallery_data.items) {
      const metadata = post.media_metadata[item.media_id];
      if (metadata?.s?.u) {
        // Reddit HTML-encodes URLs in metadata
        const url = metadata.s.u.replace(/&amp;/g, '&');
        media.push({
          type: 'image',
          url,
          width: metadata.s.x,
          height: metadata.s.y,
          caption: item.caption,
          isPrimary: media.length === 0,
        });
      }
    }
    return media;
  }

  // 2. Check for video posts
  if (post.is_video) {
    const videoData = post.media?.reddit_video || post.secure_media?.reddit_video;
    if (videoData?.fallback_url) {
      media.push({
        type: 'video',
        url: videoData.fallback_url,
        width: videoData.width,
        height: videoData.height,
        isPrimary: true,
      });
    }
    // Also get thumbnail from preview
    if (post.preview?.images?.[0]?.source) {
      const thumb = post.preview.images[0].source;
      media.push({
        type: 'image',
        url: thumb.url.replace(/&amp;/g, '&'),
        width: thumb.width,
        height: thumb.height,
        caption: 'Video thumbnail',
        isPrimary: false,
      });
    }
    return media;
  }

  // 3. Check for image posts via preview
  if (post.preview?.images?.[0]?.source) {
    const source = post.preview.images[0].source;
    media.push({
      type: 'image',
      url: source.url.replace(/&amp;/g, '&'),
      width: source.width,
      height: source.height,
      isPrimary: true,
    });
    return media;
  }

  // 4. Check URL directly for image/video links
  if (post.url && !post.is_self) {
    if (isImageUrl(post.url)) {
      media.push({
        type: 'image',
        url: post.url,
        isPrimary: true,
      });
    } else if (isVideoUrl(post.url)) {
      media.push({
        type: 'video',
        url: post.url,
        isPrimary: true,
      });
    }
  }

  return media;
}

// Parse a Reddit dump post into ScrapedReport
function parseRedditDumpPost(post: RedditPost): ScrapedReport | null {
  const isCommentPost = isComment(post);
  const textContent = isCommentPost
    ? post.body
    : (post.selftext || post.self_text || post.body || '');

  // Extract media from post
  const media = isCommentPost ? [] : extractMedia(post);
  const hasMedia = media.length > 0;

  // Determine minimum text length based on content type
  // - Comments need 200+ chars (no context)
  // - Posts with media can have less text (50 chars) since the image IS the content
  // - Text-only posts need 100+ chars
  let minLength: number;
  if (isCommentPost) {
    minLength = 200;
  } else if (hasMedia) {
    minLength = 50;  // Allow shorter text for image/video posts
  } else {
    minLength = 100;
  }

  // Skip posts without enough content
  // But allow media posts with just a title (textContent might be empty)
  if (!hasMedia && (!textContent || textContent.length < minLength)) {
    return null;
  }

  // For media posts, use title as description if no text body
  const effectiveTextContent = textContent || (hasMedia && post.title ? post.title : '');

  // Skip removed/deleted posts
  if (effectiveTextContent === '[removed]' || effectiveTextContent === '[deleted]') {
    return null;
  }

  // Get category from subreddit
  const category = SUBREDDIT_CATEGORIES[post.subreddit] ||
                   SUBREDDIT_CATEGORIES[post.subreddit.toLowerCase()] ||
                   'combination';

  // Clean the text
  const description = effectiveTextContent
    .replace(/\n{3,}/g, '\n\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  // Create summary
  const summary = description.length > 200
    ? description.substring(0, 197) + '...'
    : description;

  // Extract potential location using smart parser (handles international locations)
  const parsedLocation = parseLocation(description);
  const locationName = parsedLocation.locationName;
  const stateProvince = parsedLocation.stateProvince;
  const country = parsedLocation.country;

  // Convert UTC timestamp to date
  const eventDate = new Date(post.created_utc * 1000).toISOString().split('T')[0];

  // Extract tags
  const tags: string[] = [post.subreddit.toLowerCase()];
  const lowerText = description.toLowerCase();

  if (post.link_flair_text) {
    tags.push(post.link_flair_text.toLowerCase().replace(/\s+/g, '-'));
  }

  if (lowerText.includes('encounter') || lowerText.includes('sighting')) {
    tags.push('encounter');
  }
  if (lowerText.includes('experience') || lowerText.includes('happened to me')) {
    tags.push('personal-experience');
  }

  // Add comment tag if this is a comment
  if (isCommentPost) {
    tags.push('comment-experience');
  }

  // Add media tags
  if (hasMedia) {
    const hasImage = media.some(m => m.type === 'image');
    const hasVideo = media.some(m => m.type === 'video');
    if (hasImage) tags.push('has-image');
    if (hasVideo) tags.push('has-video');
    if (post.is_gallery) tags.push('gallery');
  }

  // Determine credibility
  // Comments with high upvotes are especially credible (community-validated experiences)
  let credibility: 'low' | 'medium' | 'high' = 'medium';
  const scoreThreshold = isCommentPost ? 50 : 100;  // Lower threshold for comments
  const hasHighEngagement = (post.score || 0) > scoreThreshold || (post.num_comments || 0) > 20;
  const hasDetailedText = description.length > 1000;

  if (hasHighEngagement && hasDetailedText) {
    credibility = 'high';
  } else if (description.length < 300 && (post.score || 0) < 10) {
    credibility = 'low';
  }

  // Build permalink - comments have different URL structure
  let permalink: string;
  if (isCommentPost && post.link_id) {
    // Comment permalink: /r/subreddit/comments/postid/title/commentid
    const linkId = post.link_id.replace('t3_', '');
    permalink = post.permalink || `/r/${post.subreddit}/comments/${linkId}/_/${post.id}`;
  } else {
    permalink = post.permalink || `/r/${post.subreddit}/comments/${post.id}`;
  }

  // Generate title for comments, use existing title for submissions
  let title: string;
  if (isCommentPost) {
    title = generateTitleFromBody(description, post.subreddit);
  } else {
    title = post.title && post.title.length > 150
      ? post.title.substring(0, 147) + '...'
      : (post.title || 'Untitled');
  }

  // Source type distinguishes submissions from comments
  const sourceType = isCommentPost ? 'reddit_comment' : 'reddit';

  return {
    title,
    summary,
    description,
    category,
    location_name: locationName,
    country,
    state_province: stateProvince,
    event_date: eventDate,
    credibility,
    source_type: sourceType,
    original_report_id: `${sourceType}-${post.id}`,
    tags,
    source_label: `r/${post.subreddit}`,
    source_url: `https://reddit.com${permalink}`,
    media: hasMedia ? media : undefined,
    metadata: {
      subreddit: post.subreddit,
      postId: post.id,
      score: post.score,
      numComments: post.num_comments,
      flair: post.link_flair_text,
      batchImport: true,
      isComment: isCommentPost,
      parentId: post.parent_id,
      linkId: post.link_id,
      hasMedia,
      isGallery: post.is_gallery,
      isVideo: post.is_video,
    }
  };
}

// Create a readable stream for zstd compressed files
function createZstdStream(filePath: string): readline.Interface {
  // Use zstd command-line tool if available, otherwise try Node.js zlib
  const isZstd = filePath.endsWith('.zst') || filePath.endsWith('.zstd');

  let inputStream: NodeJS.ReadableStream;

  if (isZstd) {
    // Use zstd CLI tool for decompression (more reliable for large files)
    const zstdProcess = spawn('zstd', ['-d', '-c', filePath]);
    inputStream = zstdProcess.stdout;

    zstdProcess.stderr.on('data', (data) => {
      console.error(`[BatchImport] zstd error: ${data}`);
    });
  } else {
    // Assume uncompressed NDJSON
    inputStream = fs.createReadStream(filePath);
  }

  return readline.createInterface({
    input: inputStream,
    crlfDelay: Infinity
  });
}

// Main batch import function
export async function batchImportRedditDump(options: BatchImportOptions): Promise<ImportProgress> {
  const {
    filePath,
    subreddits,
    batchSize = 100,
    limit,
    skipDuplicates = true,
    useAITitles = false,
    onProgress
  } = options;

  const supabase = getSupabaseAdmin();

  const targetSubs = subreddits
    ? new Set(subreddits.map(s => s.toLowerCase()))
    : TARGET_SUBREDDITS;

  const progress: ImportProgress = {
    totalLines: 0,
    processedLines: 0,
    matchedSubreddit: 0,
    passedFilters: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    rejected: 0,
    errors: 0,
    startTime: Date.now(),
    lastUpdate: Date.now()
  };

  console.log(`[BatchImport] Starting import from: ${filePath}`);
  console.log(`[BatchImport] Target subreddits: ${Array.from(targetSubs).join(', ')}`);
  console.log(`[BatchImport] Batch size: ${batchSize}, Limit: ${limit || 'none'}`);

  const rl = createZstdStream(filePath);
  let batch: ScrapedReport[] = [];

  // Process each line (each line is a JSON object)
  for await (const line of rl) {
    progress.totalLines++;
    progress.processedLines++;

    // Check limit
    if (limit && progress.inserted >= limit) {
      console.log(`[BatchImport] Reached limit of ${limit} records`);
      break;
    }

    // Progress update every 10000 lines
    if (progress.processedLines % 10000 === 0) {
      const elapsed = (Date.now() - progress.startTime) / 1000;
      const rate = progress.processedLines / elapsed;
      console.log(`[BatchImport] Progress: ${progress.processedLines} lines processed, ${progress.matchedSubreddit} matched, ${progress.inserted} inserted (${rate.toFixed(0)} lines/sec)`);

      if (onProgress) {
        progress.lastUpdate = Date.now();
        onProgress(progress);
      }
    }

    try {
      const post: RedditPost = JSON.parse(line);

      // Check if subreddit matches our targets
      if (!post.subreddit || !targetSubs.has(post.subreddit.toLowerCase())) {
        continue;
      }

      progress.matchedSubreddit++;

      // Parse to ScrapedReport format
      const report = parseRedditDumpPost(post);
      if (!report) {
        progress.rejected++;
        continue;
      }

      // Quick quality check
      if (isObviouslyLowQuality(report.title, report.description)) {
        progress.rejected++;
        continue;
      }

      // Full quality assessment
      const qualityResult = assessQuality(report, report.metadata);
      if (!qualityResult.passed) {
        progress.rejected++;
        continue;
      }

      const qualityScore = qualityResult.qualityScore!;
      const status = getStatusFromScore(qualityScore.total);

      if (status === 'rejected') {
        progress.rejected++;
        continue;
      }

      progress.passedFilters++;
      batch.push(report);

      // Process batch when full
      if (batch.length >= batchSize) {
        await processBatch(supabase, batch, progress, skipDuplicates, useAITitles);
        batch = [];
      }

    } catch (parseError) {
      progress.errors++;
      // Skip malformed lines silently (common in large dumps)
    }
  }

  // Process remaining batch
  if (batch.length > 0) {
    await processBatch(supabase, batch, progress, skipDuplicates, useAITitles);
  }

  const elapsed = (Date.now() - progress.startTime) / 1000;
  console.log(`\n[BatchImport] Complete!`);
  console.log(`  Total lines: ${progress.totalLines}`);
  console.log(`  Matched subreddit: ${progress.matchedSubreddit}`);
  console.log(`  Passed filters: ${progress.passedFilters}`);
  console.log(`  Inserted: ${progress.inserted}`);
  console.log(`  Updated: ${progress.updated}`);
  console.log(`  Skipped (duplicates): ${progress.skipped}`);
  console.log(`  Rejected (quality): ${progress.rejected}`);
  console.log(`  Errors: ${progress.errors}`);
  console.log(`  Time: ${elapsed.toFixed(1)} seconds`);

  return progress;
}

// Process a batch of reports
async function processBatch(
  supabase: SupabaseClient,
  batch: ScrapedReport[],
  progress: ImportProgress,
  skipDuplicates: boolean,
  useAITitles: boolean
): Promise<void> {
  for (const report of batch) {
    try {
      // Check for existing report
      if (skipDuplicates) {
        const { data: existing } = await supabase
          .from('reports')
          .select('id')
          .eq('original_report_id', report.original_report_id)
          .eq('source_type', report.source_type)
          .single();

        if (existing) {
          progress.skipped++;
          continue;
        }
      }

      // Optional AI title enhancement (significantly slower)
      let finalTitle = report.title;
      let originalTitle: string | undefined;

      if (useAITitles) {
        try {
          const titleResult = await improveTitleWithAI(
            report.title,
            report.description,
            report.category,
            report.location_name,
            report.event_date
          );
          finalTitle = titleResult.title;
          originalTitle = titleResult.wasImproved ? titleResult.originalTitle : undefined;
        } catch (aiError) {
          // Fall back to original title on AI error
        }
      }

      // Generate slug
      const slug = generateSlug(finalTitle, report.original_report_id, report.source_type);

      // Insert report
      const { error: insertError } = await supabase
        .from('reports')
        .insert({
          title: finalTitle,
          slug,
          summary: report.summary,
          description: report.description,
          category: report.category,
          location_name: report.location_name,
          country: report.country || 'United States',
          state_province: report.state_province,
          city: report.city,
          latitude: report.latitude,
          longitude: report.longitude,
          event_date: report.event_date,
          credibility: report.credibility || 'medium',
          source_type: report.source_type,
          original_report_id: report.original_report_id,
          status: 'approved',
          tags: report.tags || [],
          source_label: report.source_label,
          source_url: report.source_url,
          original_title: originalTitle,
          upvotes: 0,
          view_count: 0
        });

      if (insertError) {
        if (insertError.code === '23505') {
          // Duplicate key - skip
          progress.skipped++;
        } else {
          progress.errors++;
          console.error(`[BatchImport] Insert error: ${insertError.message}`);
        }
      } else {
        progress.inserted++;
      }

    } catch (error) {
      progress.errors++;
    }
  }
}

// Estimate file size / record count
export async function estimateDumpSize(filePath: string): Promise<{ lines: number; sizeBytes: number }> {
  const stats = fs.statSync(filePath);

  // Sample first 10000 lines to estimate
  const rl = createZstdStream(filePath);
  let lineCount = 0;
  let bytesRead = 0;

  for await (const line of rl) {
    lineCount++;
    bytesRead += line.length;
    if (lineCount >= 10000) break;
  }

  // Estimate total based on compression ratio
  const avgLineBytes = bytesRead / lineCount;
  const compressionRatio = 10; // zstd typically achieves 10:1 on JSON
  const estimatedUncompressedSize = stats.size * compressionRatio;
  const estimatedLines = Math.floor(estimatedUncompressedSize / avgLineBytes);

  return {
    lines: estimatedLines,
    sizeBytes: stats.size
  };
}
