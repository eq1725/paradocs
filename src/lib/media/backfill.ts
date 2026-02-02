// Media Backfill Script
// Re-processes existing Reddit reports to extract and analyze media

import { createClient } from '@supabase/supabase-js';
import { analyzeMediaWithAI } from './ai-tagger';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get Supabase admin client
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Image URL patterns
const IMAGE_URL_PATTERNS = [
  /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i,
  /i\.redd\.it\//i,
  /i\.imgur\.com\//i,
  /preview\.redd\.it\//i,
];

function isImageUrl(url: string): boolean {
  if (!url) return false;
  return IMAGE_URL_PATTERNS.some(pattern => pattern.test(url));
}

function cleanRedditUrl(url: string): string {
  return url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Extract image URLs from text
function extractImageUrlsFromText(text: string): string[] {
  if (!text) return [];
  const urls: string[] = [];

  const urlRegex = /https?:\/\/[^\s\)\]]+\.(jpg|jpeg|png|gif|webp)(\?[^\s\)\]]*)?\b/gi;
  const matches = text.match(urlRegex) || [];

  for (const match of matches) {
    const cleanUrl = cleanRedditUrl(match);
    if (!urls.includes(cleanUrl)) {
      urls.push(cleanUrl);
    }
  }

  const redditImageRegex = /https?:\/\/i\.redd\.it\/[a-zA-Z0-9]+/gi;
  const imgurImageRegex = /https?:\/\/i\.imgur\.com\/[a-zA-Z0-9]+/gi;

  for (const match of [...(text.match(redditImageRegex) || []), ...(text.match(imgurImageRegex) || [])]) {
    const cleanUrl = cleanRedditUrl(match);
    if (!urls.includes(cleanUrl)) {
      urls.push(cleanUrl);
    }
  }

  return urls;
}

interface ArcticShiftPost {
  id: string;
  url: string;
  selftext: string;
  is_video?: boolean;
  media?: {
    reddit_video?: {
      fallback_url: string;
      height: number;
      width: number;
    };
  };
  gallery_data?: {
    items: Array<{ media_id: string; id: number }>;
  };
  media_metadata?: Record<string, {
    s?: { u: string; x: number; y: number };
  }>;
  preview?: {
    images: Array<{
      source: { url: string; width: number; height: number };
    }>;
  };
  thumbnail?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

interface MediaItem {
  type: 'image' | 'video';
  url: string;
  width?: number;
  height?: number;
  isPrimary?: boolean;
}

// Extract media from Arctic Shift post data
function extractMediaFromPost(post: ArcticShiftPost): MediaItem[] {
  const media: MediaItem[] = [];
  const seenUrls = new Set<string>();

  const addMedia = (item: MediaItem) => {
    const normalizedUrl = cleanRedditUrl(item.url);
    if (!seenUrls.has(normalizedUrl)) {
      seenUrls.add(normalizedUrl);
      media.push({ ...item, url: normalizedUrl });
    }
  };

  // 1. Direct image URL
  if (post.url && isImageUrl(post.url)) {
    addMedia({ type: 'image', url: post.url, isPrimary: true });
  }

  // 2. Reddit video
  if (post.is_video && post.media?.reddit_video) {
    const video = post.media.reddit_video;
    addMedia({
      type: 'video',
      url: video.fallback_url,
      width: video.width,
      height: video.height,
      isPrimary: media.length === 0
    });
  }

  // 3. Gallery posts
  if (post.gallery_data && post.media_metadata) {
    for (const item of post.gallery_data.items) {
      const meta = post.media_metadata[item.media_id];
      if (meta?.s?.u) {
        addMedia({
          type: 'image',
          url: meta.s.u,
          width: meta.s.x,
          height: meta.s.y,
          isPrimary: media.length === 0
        });
      }
    }
  }

  // 4. Preview images
  if (post.preview?.images?.length && media.length === 0) {
    const preview = post.preview.images[0];
    if (preview.source?.url) {
      addMedia({
        type: 'image',
        url: preview.source.url,
        width: preview.source.width,
        height: preview.source.height,
        isPrimary: true
      });
    }
  }

  // 5. Extract from selftext
  const selftext = post.selftext || '';
  const textImageUrls = extractImageUrlsFromText(selftext);
  for (const url of textImageUrls) {
    addMedia({ type: 'image', url, isPrimary: media.length === 0 });
  }

  // 6. Thumbnail fallback
  if (media.length === 0 && post.thumbnail &&
      !['self', 'default', 'nsfw', 'spoiler', ''].includes(post.thumbnail) &&
      post.thumbnail.startsWith('http')) {
    addMedia({
      type: 'image',
      url: post.thumbnail,
      width: post.thumbnail_width,
      height: post.thumbnail_height,
      isPrimary: true
    });
  }

  return media;
}

// Fetch post from Arctic Shift by ID
async function fetchPostFromArcticShift(postId: string): Promise<ArcticShiftPost | null> {
  try {
    const url = `https://arctic-shift.photon-reddit.com/api/posts/search?ids=${postId}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ParaDocs/1.0 (Media Backfill)'
      }
    });

    if (!response.ok) {
      console.log(`[Backfill] Failed to fetch post ${postId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const posts = Array.isArray(data) ? data : (data.data || []);

    return posts.length > 0 ? posts[0] : null;
  } catch (error) {
    console.error(`[Backfill] Error fetching post ${postId}:`, error);
    return null;
  }
}

export interface BackfillResult {
  totalProcessed: number;
  mediaFound: number;
  mediaInserted: number;
  aiTagged: number;
  errors: number;
}

export interface BackfillOptions {
  limit?: number;           // Max reports to process
  runAiAnalysis?: boolean;  // Whether to run AI tagging
  dryRun?: boolean;         // Don't actually insert, just report
  batchSize?: number;       // Reports per batch
  delayMs?: number;         // Delay between batches
}

/**
 * Backfill media for existing Reddit reports
 */
export async function backfillRedditMedia(options: BackfillOptions = {}): Promise<BackfillResult> {
  const {
    limit = 100,
    runAiAnalysis = true,
    dryRun = false,
    batchSize = 10,
    delayMs = 2000
  } = options;

  const supabase = getSupabaseAdmin();
  const result: BackfillResult = {
    totalProcessed: 0,
    mediaFound: 0,
    mediaInserted: 0,
    aiTagged: 0,
    errors: 0
  };

  console.log(`[Backfill] Starting media backfill (limit: ${limit}, dryRun: ${dryRun})`);

  // Find Reddit reports without media
  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select(`
      id,
      original_report_id,
      title,
      description
    `)
    .eq('source_type', 'reddit')
    .eq('status', 'approved')
    .not('original_report_id', 'like', 'reddit-comment-%')
    .limit(limit);

  if (reportsError) {
    console.error('[Backfill] Error fetching reports:', reportsError);
    return result;
  }

  console.log(`[Backfill] Found ${reports?.length || 0} Reddit reports to check`);

  // Filter to only reports without media
  const reportsWithoutMedia: typeof reports = [];
  for (const report of reports || []) {
    const { count } = await supabase
      .from('report_media')
      .select('*', { count: 'exact', head: true })
      .eq('report_id', report.id);

    if (!count || count === 0) {
      reportsWithoutMedia.push(report);
    }
  }

  console.log(`[Backfill] ${reportsWithoutMedia.length} reports need media extraction`);

  // Process in batches
  for (let i = 0; i < reportsWithoutMedia.length; i += batchSize) {
    const batch = reportsWithoutMedia.slice(i, i + batchSize);
    console.log(`[Backfill] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(reportsWithoutMedia.length / batchSize)}`);

    for (const report of batch) {
      result.totalProcessed++;

      try {
        // Extract Reddit post ID from original_report_id
        const postId = report.original_report_id.replace('reddit-', '');

        // First try to extract from description (cheaper than API call)
        let mediaItems: MediaItem[] = extractImageUrlsFromText(report.description || '').map(url => ({
          type: 'image' as const,
          url,
          isPrimary: false
        }));

        // If no media in description, fetch from Arctic Shift
        if (mediaItems.length === 0) {
          const post = await fetchPostFromArcticShift(postId);
          if (post) {
            mediaItems = extractMediaFromPost(post);
          }
        }

        if (mediaItems.length > 0) {
          // Filter out broken/invalid media URLs before counting
          const validMediaItems = mediaItems.filter(item => {
            const lowerUrl = item.url.toLowerCase();
            // Skip known broken image patterns
            if (lowerUrl.includes('deleted') ||
                lowerUrl.includes('removed') ||
                lowerUrl.includes('if you are looking for an image') ||
                lowerUrl.includes('imgur.com/removed') ||
                lowerUrl.includes('i.imgur.com/removed')) {
              console.log(`[Backfill] Skipping known broken URL: ${item.url.substring(0, 50)}...`);
              return false;
            }
            return true;
          });

          // Deduplicate by URL
          const seenUrls = new Set<string>();
          const dedupedMediaItems = validMediaItems.filter(item => {
            const normalizedUrl = item.url.replace(/&amp;/g, '&').toLowerCase();
            if (seenUrls.has(normalizedUrl)) return false;
            seenUrls.add(normalizedUrl);
            return true;
          });

          if (dedupedMediaItems.length > 0) {
            result.mediaFound += dedupedMediaItems.length;
            console.log(`[Backfill] Found ${dedupedMediaItems.length} media items for "${report.title?.substring(0, 40)}..."`);

            // Ensure first item is primary
            dedupedMediaItems[0].isPrimary = true;
          }

          if (!dryRun && dedupedMediaItems.length > 0) {
            // Insert media records
            for (const mediaItem of dedupedMediaItems) {
              const { data: insertedMedia, error: insertError } = await supabase
                .from('report_media')
                .insert({
                  report_id: report.id,
                  media_type: mediaItem.type,
                  url: mediaItem.url,
                  is_primary: mediaItem.isPrimary || false
                })
                .select('id')
                .single();

              if (!insertError && insertedMedia) {
                result.mediaInserted++;

                // Run AI analysis if enabled
                if (runAiAnalysis && mediaItem.type === 'image') {
                  try {
                    const aiResult = await analyzeMediaWithAI(mediaItem.url, 'image');
                    if (aiResult.tags.length > 0) {
                      await supabase
                        .from('report_media')
                        .update({
                          ai_tags: aiResult.tags,
                          ai_description: aiResult.description,
                          ai_analyzed_at: new Date().toISOString()
                        })
                        .eq('id', insertedMedia.id);

                      result.aiTagged++;
                      console.log(`[Backfill] AI tags: ${aiResult.tags.slice(0, 5).join(', ')}`);
                    }
                  } catch (aiError) {
                    console.warn('[Backfill] AI analysis failed:', aiError);
                  }
                }
              } else if (insertError) {
                console.error('[Backfill] Insert error:', insertError);
                result.errors++;
              }
            }

            // Update report tags to include 'has-media'
            const { data: existingReport } = await supabase
              .from('reports')
              .select('tags')
              .eq('id', report.id)
              .single();

            const existingTags = existingReport?.tags || [];
            if (!existingTags.includes('has-media')) {
              await supabase
                .from('reports')
                .update({ tags: [...existingTags, 'has-media'] })
                .eq('id', report.id);
            }
          }
        }
      } catch (error) {
        console.error(`[Backfill] Error processing report:`, error);
        result.errors++;
      }
    }

    // Rate limiting between batches
    if (i + batchSize < reportsWithoutMedia.length) {
      console.log(`[Backfill] Waiting ${delayMs}ms before next batch...`);
      await delay(delayMs);
    }
  }

  console.log(`[Backfill] Complete:`, result);
  return result;
}

/**
 * Run AI analysis on existing media that hasn't been analyzed
 */
export async function backfillAiTags(options: { limit?: number; dryRun?: boolean } = {}): Promise<{ analyzed: number; errors: number }> {
  const { limit = 100, dryRun = false } = options;
  const supabase = getSupabaseAdmin();

  const result = { analyzed: 0, errors: 0 };

  // Find media without AI tags
  const { data: unanalyzedMedia, error } = await supabase
    .from('report_media')
    .select('id, url, media_type')
    .is('ai_analyzed_at', null)
    .eq('media_type', 'image')
    .limit(limit);

  if (error) {
    console.error('[Backfill AI] Error fetching media:', error);
    return result;
  }

  console.log(`[Backfill AI] Found ${unanalyzedMedia?.length || 0} images to analyze`);

  for (const media of unanalyzedMedia || []) {
    try {
      const aiResult = await analyzeMediaWithAI(media.url, 'image');

      if (!dryRun) {
        await supabase
          .from('report_media')
          .update({
            ai_tags: aiResult.tags,
            ai_description: aiResult.description,
            ai_analyzed_at: new Date().toISOString()
          })
          .eq('id', media.id);
      }

      result.analyzed++;
      console.log(`[Backfill AI] Tagged: ${aiResult.tags.slice(0, 5).join(', ')}`);

      // Rate limiting
      await delay(1000);
    } catch (error) {
      console.error('[Backfill AI] Error:', error);
      result.errors++;
    }
  }

  return result;
}
