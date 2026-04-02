// Reddit V2 Paranormal Adapter
// Fetches posts from paranormal-related subreddits using Arctic Shift API
// Expanded subreddit coverage with category mapping
// Replaces the original reddit adapter with bulk-import capabilities

import { SourceAdapter, AdapterResult, ScrapedReport, ScrapedMediaItem } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Arctic Shift API endpoints (try in order)
const ARCTIC_SHIFT_ENDPOINTS = [
  'https://arctic-shift.photon-reddit.com/api',
  'https://api.arcticshift.app/v1',
];

// Expanded subreddit mapping with categories
const SUBREDDIT_CATEGORIES: Record<string, string> = {
  'Paranormal': 'ghosts_hauntings',
  'Glitch_in_the_Matrix': 'psychological_experiences',
  'Thetruthishere': 'ghosts_hauntings',
  'UFOs': 'ufos_aliens',
  'HighStrangeness': 'combination',
  'Ghosts': 'ghosts_hauntings',
  'Cryptids': 'cryptids',
  'NDE': 'psychological_experiences',
  'Experiencers': 'combination',
  'AstralProjection': 'consciousness_practices',
  'Humanoidencounters': 'ufos_aliens',
  'Missing411': 'psychological_experiences',
  'Skinwalkers': 'cryptids',
  'CrawlerSightings': 'cryptids',
};

// Arctic Shift post interface
interface ArcticShiftPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  created_utc: number;
  score: number;
  num_comments: number;
  url: string;
  permalink: string;
  link_flair_text?: string;
  is_self: boolean;
  // Crosspost detection fields
  crosspost_parent_list?: Array<{ id: string; subreddit: string }>;
  crosspost_parent?: string;
  // Media-related fields
  is_video?: boolean;
  media?: {
    reddit_video?: {
      fallback_url: string;
      height: number;
      width: number;
      duration?: number;
    };
  };
  gallery_data?: {
    items: Array<{
      media_id: string;
      id: number;
    }>;
  };
  media_metadata?: Record<string, {
    e: string;
    m?: string;
    s?: { u: string; x: number; y: number };
    p?: Array<{ u: string; x: number; y: number }>;
  }>;
  preview?: {
    images: Array<{
      source: { url: string; width: number; height: number };
      resolutions?: Array<{ url: string; width: number; height: number }>;
    }>;
  };
  thumbnail?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

interface ArcticShiftResponse {
  data: ArcticShiftPost[];
}

// Clean Reddit's HTML-encoded URLs
function cleanRedditUrl(url: string): string {
  return url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Check if URL is a direct image link
function isImageUrl(url: string): boolean {
  if (!url) return false;
  return /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url) ||
         /i\.redd\.it\//i.test(url) ||
         /i\.imgur\.com\//i.test(url) ||
         /preview\.redd\.it\//i.test(url);
}

// Check if URL is a Reddit video
function isRedditVideoUrl(url: string): boolean {
  if (!url) return false;
  return /v\.redd\.it\//i.test(url);
}

// Extract image URLs from text content
function extractImageUrlsFromText(text: string): string[] {
  if (!text) return [];

  const urls: string[] = [];

  // Match common image hosting URLs
  const urlRegex = /https?:\/\/[^\s\)\]]+\.(jpg|jpeg|png|gif|webp)(\?[^\s\)\]]*)?\b/gi;
  const matches = text.match(urlRegex) || [];

  for (const match of matches) {
    const cleanUrl = cleanRedditUrl(match);
    if (!urls.includes(cleanUrl)) {
      urls.push(cleanUrl);
    }
  }

  // Look for i.redd.it and i.imgur.com links
  const redditImageRegex = /https?:\/\/i\.redd\.it\/[a-zA-Z0-9]+/gi;
  const imgurImageRegex = /https?:\/\/i\.imgur\.com\/[a-zA-Z0-9]+/gi;

  const redditMatches = text.match(redditImageRegex) || [];
  const imgurMatches = text.match(imgurImageRegex) || [];

  for (const match of [...redditMatches, ...imgurMatches]) {
    const cleanUrl = cleanRedditUrl(match);
    if (!urls.includes(cleanUrl)) {
      urls.push(cleanUrl);
    }
  }

  return urls;
}

// Extract media from a Reddit post
function extractMediaFromPost(post: ArcticShiftPost): ScrapedMediaItem[] {
  const media: ScrapedMediaItem[] = [];
  const seenUrls = new Set<string>();

  const addMedia = (item: ScrapedMediaItem) => {
    const normalizedUrl = cleanRedditUrl(item.url);
    if (!seenUrls.has(normalizedUrl)) {
      seenUrls.add(normalizedUrl);
      media.push({ ...item, url: normalizedUrl });
    }
  };

  // Check post URL for direct images
  if (post.url && isImageUrl(post.url)) {
    addMedia({
      type: 'image',
      url: post.url,
      isPrimary: true
    });
  }

  // Check for Reddit video
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

  // Check for gallery posts
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

  // Check preview images
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

  // Extract image URLs from selftext
  const selftext = post.selftext || '';
  const textImageUrls = extractImageUrlsFromText(selftext);
  for (const url of textImageUrls) {
    addMedia({
      type: 'image',
      url,
      isPrimary: media.length === 0
    });
  }

  return media;
}

// Check if post content is deleted or removed
function isDeletedOrRemoved(text: string): boolean {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return normalized === '[deleted]' || normalized === '[removed]';
}

// Convert Unix timestamp to ISO date string
function timestampToIsoDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

// Determine credibility based on Reddit score
function getCredibilityFromScore(score: number): 'low' | 'medium' | 'high' {
  if (score > 500) return 'high';
  if (score > 200) return 'medium';
  return 'low';
}

// Extract tags from post
function extractTags(post: ArcticShiftPost, subreddit: string): string[] {
  const tags: string[] = [subreddit.toLowerCase()];

  // Add flair as tag if available
  if (post.link_flair_text) {
    const flairTag = post.link_flair_text.toLowerCase().replace(/\s+/g, '-');
    tags.push(flairTag);
  }

  // Add score-based tags
  if (post.score > 500) tags.push('popular');
  if (post.score > 1000) tags.push('trending');

  // Add engagement tags
  if (post.num_comments > 100) tags.push('high-engagement');

  return tags;
}

// Convert post to ScrapedReport
function postToReport(post: ArcticShiftPost): ScrapedReport {
  const subreddit = post.subreddit;
  const category = SUBREDDIT_CATEGORIES[subreddit] || 'combination';
  const credibility = getCredibilityFromScore(post.score);
  const summary = post.selftext.substring(0, 200);
  const eventDate = timestampToIsoDate(post.created_utc);
  const media = extractMediaFromPost(post);
  const tags = extractTags(post, subreddit);

  return {
    original_report_id: post.id,
    source_type: 'reddit',
    source_label: `r/${subreddit}`,
    source_url: `https://reddit.com${post.permalink}`,
    title: post.title,
    description: post.selftext,
    summary,
    category,
    credibility,
    tags,
    event_date: eventDate,
    event_date_precision: 'unknown',
    metadata: {
      score: post.score,
      num_comments: post.num_comments,
      author: post.author,
      subreddit,
      reddit_id: post.id,
      link_flair_text: post.link_flair_text || null,
    },
    media: media.length > 0 ? media : undefined,
  };
}

// Fetch posts from a single subreddit
async function fetchSubredditPosts(
  subreddit: string,
  baseUrl: string,
  perSubLimit: number,
  minScore: number
): Promise<ScrapedReport[]> {
  // Arctic Shift API only supports: subreddit, author, after, before, limit, title, selftext
  // We filter for self posts and min text length client-side
  // Request more than needed since we'll filter down
  const fetchLimit = Math.min(perSubLimit * 3, 250);
  const endpoint = `${baseUrl}/posts/search?subreddit=${subreddit}&limit=${fetchLimit}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        'User-Agent': 'Paradocs/1.0 (paranormal reports aggregator)',
      },
    });

    if (!response.ok) {
      console.error(`[Reddit V2] Failed to fetch r/${subreddit}: HTTP ${response.status}`);
      return [];
    }

    const data: ArcticShiftResponse = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      console.warn(`[Reddit V2] Unexpected response format for r/${subreddit}`);
      return [];
    }

    // Filter and convert posts
    const reports: ScrapedReport[] = [];
    const seenContentHashes = new Set<string>();

    for (const post of data.data) {
      // Skip deleted/removed posts
      if (isDeletedOrRemoved(post.selftext)) {
        continue;
      }

      // Apply minimum score filter
      if (post.score < minScore) {
        continue;
      }

      // Skip link posts (we want self posts only)
      if (!post.is_self) {
        continue;
      }

      // Skip very short content
      if (!post.selftext || post.selftext.length < 200) {
        continue;
      }

      // Skip crossposts — keep only the original to avoid duplicates
      if (post.crosspost_parent_list && post.crosspost_parent_list.length > 0) {
        continue;
      }
      if (post.crosspost_parent) {
        continue;
      }

      // Content-level dedup: skip posts with near-identical text within this batch
      // Uses first 200 chars normalized as a fingerprint
      const contentFingerprint = post.selftext.substring(0, 200).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seenContentHashes.has(contentFingerprint)) {
        continue;
      }
      seenContentHashes.add(contentFingerprint);

      const report = postToReport(post);
      reports.push(report);
    }

    return reports;
  } catch (error) {
    console.error(`[Reddit V2] Error fetching r/${subreddit}:`, error);
    return [];
  }
}

// Find working Arctic Shift endpoint
async function findWorkingEndpoint(): Promise<string | null> {
  for (const endpoint of ARCTIC_SHIFT_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}/posts/search?subreddit=Paranormal&limit=1`, {
        headers: {
          'User-Agent': 'Paradocs/1.0 (paranormal reports aggregator)',
        },
      });

      if (response.ok) {
        console.log(`[Reddit V2] Using Arctic Shift endpoint: ${endpoint}`);
        return endpoint;
      }
    } catch (error) {
      // Try next endpoint
    }
  }

  console.error('[Reddit V2] No working Arctic Shift endpoints available');
  return null;
}

// Main adapter implementation
const redditV2Adapter: SourceAdapter = {
  name: 'reddit-v2',

  async scrape(config: Record<string, any>, limit?: number): Promise<AdapterResult> {
    try {
      // Configuration parameters
      const subreddits = config.subreddits || Object.keys(SUBREDDIT_CATEGORIES);
      const minScore = config.minScore ?? 10;
      const afterEpoch = config.afterEpoch ?? 0;
      const perSubLimit = Math.ceil((limit || 500) / subreddits.length);

      // Find working Arctic Shift endpoint
      const baseUrl = await findWorkingEndpoint();
      if (!baseUrl) {
        return {
          success: false,
          reports: [],
          error: 'No Arctic Shift endpoints available',
        };
      }

      const allReports: ScrapedReport[] = [];

      // Fetch posts from each subreddit
      for (let i = 0; i < subreddits.length; i++) {
        const subreddit = subreddits[i];

        // Rate limiting: 1 second delay between subreddit fetches
        if (i > 0) {
          await delay(1000);
        }

        console.log(`[Reddit V2] Fetching r/${subreddit}...`);

        const reports = await fetchSubredditPosts(
          subreddit,
          baseUrl,
          perSubLimit,
          minScore
        );

        // Filter by epoch if provided
        if (afterEpoch > 0) {
          const filtered = reports.filter(report => {
            if (!report.event_date) return true;
            const timestamp = new Date(report.event_date).getTime() / 1000;
            return timestamp >= afterEpoch;
          });
          allReports.push(...filtered);
        } else {
          allReports.push(...reports);
        }

        // Stop if we have enough reports
        if (allReports.length >= (limit || 500)) {
          break;
        }
      }

      // Trim to requested limit
      const finalReports = allReports.slice(0, limit || 500);

      return {
        success: true,
        reports: finalReports,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Reddit V2] Scrape error:', errorMessage);

      return {
        success: false,
        reports: [],
        error: errorMessage,
      };
    }
  },
};

export { redditV2Adapter };
