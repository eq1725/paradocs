// YouTube Adapter
// Fetches video metadata from paranormal YouTube channels and converts them into reports

import { SourceAdapter, AdapterResult, ScrapedReport, ScrapedMediaItem } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Default paranormal channels mapping
const DEFAULT_CHANNELS = [
  { id: 'UC4FEXKLbg6mGCkPEtEKKkFA', name: 'Nukes Top 5', category: 'ghosts_hauntings' },
  { id: 'UCYUKGBpn93pX2dBF0EmeLPg', name: 'MrBallen', category: 'combination' },
  { id: 'UCnM5iMGiKsZg-iOlIO2ZkdQ', name: 'Bedtime Stories', category: 'combination' },
  { id: 'UC7lOx1MReQ0_WIQtbo_zDdw', name: 'The Why Files', category: 'combination' },
];

// YouTube API response interfaces
interface YouTubeSearchResponse {
  items?: Array<{
    id: {
      videoId: string;
    };
  }>;
  error?: {
    message: string;
  };
}

interface YouTubeVideoResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title: string;
      description: string;
      publishedAt: string;
      thumbnails?: {
        high?: {
          url: string;
        };
        default?: {
          url: string;
        };
      };
      tags?: string[];
      channelTitle: string;
    };
    statistics?: {
      viewCount: string;
      likeCount: string;
      commentCount: string;
    };
    contentDetails?: {
      duration: string;
    };
  }>;
  error?: {
    message: string;
  };
}

// Extract video IDs from search response
function extractVideoIds(searchResponse: YouTubeSearchResponse): string[] {
  if (!searchResponse.items) {
    return [];
  }
  return searchResponse.items
    .filter(item => item.id?.videoId)
    .map(item => item.id.videoId);
}

// Convert YouTube duration (PT format) to human-readable string
function parseDuration(duration: string): string {
  // Format: PT1H30M45S
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = duration.match(regex);

  if (!matches) return duration;

  const hours = matches[1] || '0';
  const minutes = matches[2] || '0';
  const seconds = matches[3] || '0';

  const parts = [];
  if (parseInt(hours) > 0) parts.push(`${hours}h`);
  if (parseInt(minutes) > 0) parts.push(`${minutes}m`);
  if (parseInt(seconds) > 0) parts.push(`${seconds}s`);

  return parts.length > 0 ? parts.join(' ') : '0s';
}

// Convert video data to ScrapedReport
function convertVideoToReport(
  video: {
    id: string;
    snippet?: {
      title: string;
      description: string;
      publishedAt: string;
      thumbnails?: {
        high?: {
          url: string;
        };
        default?: {
          url: string;
        };
      };
      tags?: string[];
      channelTitle: string;
    };
    statistics?: {
      viewCount: string;
      likeCount: string;
      commentCount: string;
    };
    contentDetails?: {
      duration: string;
    };
  },
  channelName: string,
  category: string
): ScrapedReport | null {
  if (!video.snippet) {
    return null;
  }

  const { title, description, publishedAt, thumbnails, tags, channelTitle } = video.snippet;
  const { viewCount, likeCount, commentCount } = video.statistics || {};
  const { duration } = video.contentDetails || {};

  // Truncate description to 5000 chars
  const truncatedDescription = description.length > 5000
    ? description.substring(0, 5000)
    : description;

  // Create summary from first 200 chars
  const summary = truncatedDescription.length > 200
    ? truncatedDescription.substring(0, 200)
    : truncatedDescription;

  // Combine tags with channel name
  const reportTags: string[] = [channelName];
  if (tags && Array.isArray(tags)) {
    reportTags.push(...tags);
  }

  // Create thumbnail media item
  const media: ScrapedMediaItem[] = [];
  const thumbnailUrl = thumbnails?.high?.url || thumbnails?.default?.url;
  if (thumbnailUrl) {
    media.push({
      type: 'image',
      url: thumbnailUrl,
      isPrimary: true,
    });
  }

  // Parse numeric values
  const views = viewCount ? parseInt(viewCount, 10) : undefined;
  const likes = likeCount ? parseInt(likeCount, 10) : undefined;
  const comments = commentCount ? parseInt(commentCount, 10) : undefined;

  return {
    original_report_id: video.id,
    source_type: 'youtube',
    source_label: channelName,
    source_url: `https://youtube.com/watch?v=${video.id}`,
    title,
    description: truncatedDescription,
    summary,
    category,
    credibility: 'medium',
    tags: reportTags,
    event_date: publishedAt,
    event_date_precision: 'unknown',
    media,
    metadata: {
      videoId: video.id,
      viewCount: views,
      likeCount: likes,
      commentCount: comments,
      channelTitle,
      duration: duration ? parseDuration(duration) : undefined,
    },
  };
}

// Main adapter implementation
export const youtubeAdapter: SourceAdapter = {
  name: 'youtube',

  async scrape(config: Record<string, any>, limit: number = 50): Promise<AdapterResult> {
    const apiKey = config.apiKey || process.env.YOUTUBE_API_KEY;

    // Check for API key
    if (!apiKey) {
      return {
        success: false,
        reports: [],
        error: 'YOUTUBE_API_KEY environment variable is not set. Please provide a valid YouTube Data API v3 key.',
      };
    }

    const channels = config.channels || DEFAULT_CHANNELS;
    const rateLimitMs = config.rateLimitMs || 500;
    const publishedAfter = config.publishedAfter;

    const allReports: ScrapedReport[] = [];
    const errors: string[] = [];

    try {
      console.log('[YouTube] Starting scrape...');

      // Process each channel
      for (const channel of channels) {
        if (allReports.length >= limit) break;

        try {
          await delay(rateLimitMs);

          console.log(`[YouTube] Fetching videos from ${channel.name}...`);

          // Step 1: Search for videos in the channel
          const searchParams = new URLSearchParams({
            part: 'snippet',
            channelId: channel.id,
            type: 'video',
            order: 'date',
            maxResults: Math.min(50, limit - allReports.length).toString(),
            key: apiKey,
          });

          if (publishedAfter) {
            searchParams.append('publishedAfter', publishedAfter);
          }

          const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams}`;
          const searchResponse = await fetch(searchUrl);

          if (!searchResponse.ok) {
            const errorData = await searchResponse.json().catch(() => ({})) as Record<string, any>;
            const errorMsg = (errorData as any).error?.message || `HTTP ${searchResponse.status}`;
            errors.push(`Failed to search ${channel.name}: ${errorMsg}`);
            continue;
          }

          const searchData: YouTubeSearchResponse = await searchResponse.json() as YouTubeSearchResponse;

          if (searchData.error) {
            errors.push(`YouTube API error for ${channel.name}: ${searchData.error.message}`);
            continue;
          }

          const videoIds = extractVideoIds(searchData);

          if (videoIds.length === 0) {
            console.log(`[YouTube] No videos found in ${channel.name}`);
            continue;
          }

          console.log(`[YouTube] Found ${videoIds.length} videos in ${channel.name}`);

          await delay(rateLimitMs);

          // Step 2: Get detailed video information
          const videoParams = new URLSearchParams({
            part: 'snippet,statistics,contentDetails',
            id: videoIds.join(','),
            key: apiKey,
          });

          const videoUrl = `https://www.googleapis.com/youtube/v3/videos?${videoParams}`;
          const videoResponse = await fetch(videoUrl);

          if (!videoResponse.ok) {
            const errorData = await videoResponse.json().catch(() => ({})) as Record<string, any>;
            const errorMsg = (errorData as any).error?.message || `HTTP ${videoResponse.status}`;
            errors.push(`Failed to get video details from ${channel.name}: ${errorMsg}`);
            continue;
          }

          const videoData: YouTubeVideoResponse = await videoResponse.json() as YouTubeVideoResponse;

          if (videoData.error) {
            errors.push(`YouTube API error getting details for ${channel.name}: ${videoData.error.message}`);
            continue;
          }

          if (!videoData.items) {
            console.log(`[YouTube] No video details returned for ${channel.name}`);
            continue;
          }

          // Step 3: Convert videos to reports
          for (const video of videoData.items) {
            if (allReports.length >= limit) break;

            const report = convertVideoToReport(video, channel.name, channel.category);
            if (report) {
              allReports.push(report);
            }
          }

          console.log(`[YouTube] Processed ${Math.min(videoData.items.length, limit - allReports.length)} videos from ${channel.name}`);

        } catch (channelError: unknown) {
          const errorMessage = channelError instanceof Error ? channelError.message : String(channelError);
          errors.push(`Error processing ${channel.name}: ${errorMessage}`);
        }
      }

      console.log(`[YouTube] Scrape complete. Total reports: ${allReports.length}`);

      return {
        success: allReports.length > 0,
        reports: allReports,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };

    } catch (error: unknown) {
      console.error('[YouTube] Scrape failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        reports: allReports,
        error: errorMessage,
      };
    }
  },
};
