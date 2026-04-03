// YouTube Adapter
// Fetches video metadata AND top comments from paranormal YouTube channels
// Comments are a rich source of first-hand experiencer accounts
// Supports: channel video scraping, search-based discovery, comment extraction

import { SourceAdapter, AdapterResult, ScrapedReport, ScrapedMediaItem } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Default paranormal channels mapping — expanded from original 4
const DEFAULT_CHANNELS = [
  { id: 'UC4FEXKLbg6mGCkPEtEKKkFA', name: 'Nukes Top 5', category: 'ghosts_hauntings' },
  { id: 'UCYUKGBpn93pX2dBF0EmeLPg', name: 'MrBallen', category: 'combination' },
  { id: 'UCnM5iMGiKsZg-iOlIO2ZkdQ', name: 'Bedtime Stories', category: 'combination' },
  { id: 'UC7lOx1MReQ0_WIQtbo_zDdw', name: 'The Why Files', category: 'combination' },
  { id: 'UCsvhSap9PYhblkW7GyP0K8A', name: 'Nexpo', category: 'combination' },
  { id: 'UC-2YHgc363EdcusLIBbgxzg', name: 'Joe Rogan - UFO Clips', category: 'ufos_aliens' },
  { id: 'UCBSCOzV8_jDgRqRi5aVJNYg', name: 'MUFON', category: 'ufos_aliens' },
  { id: 'UCrUrxK4JnBBPcS4VRQ1_wFg', name: 'Bob Gymlan', category: 'cryptids' },
];

// Search queries for finding relevant videos beyond specific channels
const DEFAULT_SEARCH_QUERIES = [
  'UFO sighting personal experience',
  'near death experience story',
  'ghost encounter real experience',
  'bigfoot sighting eyewitness',
  'paranormal experience true story',
];

// Minimum comment length to be considered an experiencer report
const MIN_COMMENT_LENGTH = 300;

// Minimum upvotes on a comment to be considered quality
const MIN_COMMENT_LIKES = 5;

// YouTube API response interfaces
interface YouTubeVideoItem {
  id: string;
  snippet?: {
    title: string;
    description: string;
    publishedAt: string;
    thumbnails?: {
      high?: { url: string };
      default?: { url: string };
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
}

interface YouTubeSearchResponse {
  items?: Array<{
    id: {
      videoId: string;
    };
  }>;
  nextPageToken?: string;
  error?: {
    message: string;
  };
}

interface YouTubeVideoResponse {
  items?: YouTubeVideoItem[];
  error?: {
    message: string;
  };
}

interface YouTubeCommentThread {
  id: string;
  snippet: {
    topLevelComment: {
      id: string;
      snippet: {
        textDisplay: string;
        textOriginal: string;
        authorDisplayName: string;
        authorProfileImageUrl?: string;
        likeCount: number;
        publishedAt: string;
        updatedAt: string;
        videoId: string;
      };
    };
    totalReplyCount: number;
    videoId: string;
  };
}

interface YouTubeCommentResponse {
  items?: YouTubeCommentThread[];
  nextPageToken?: string;
  error?: {
    message: string;
  };
}

// Extract video IDs from search response
function extractVideoIds(searchResponse: YouTubeSearchResponse): string[] {
  if (!searchResponse.items) return [];
  return searchResponse.items
    .filter(item => item.id?.videoId)
    .map(item => item.id.videoId);
}

// Convert YouTube duration (PT format) to human-readable string
function parseDuration(duration: string): string {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = duration.match(regex);
  if (!matches) return duration;

  const hours = matches[1] || '0';
  const minutes = matches[2] || '0';
  const seconds = matches[3] || '0';

  const parts: string[] = [];
  if (parseInt(hours) > 0) parts.push(`${hours}h`);
  if (parseInt(minutes) > 0) parts.push(`${minutes}m`);
  if (parseInt(seconds) > 0) parts.push(`${seconds}s`);

  return parts.length > 0 ? parts.join(' ') : '0s';
}

// Strip HTML tags from YouTube comment text
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Detect if a comment is likely a first-hand experiencer account
function isExperiencerComment(text: string): boolean {
  const lowerText = text.toLowerCase();

  // Must be in first person
  const firstPersonIndicators = [
    /\bi\s+(saw|seen|witnessed|experienced|had|was|remember|recall|woke up|looked up|noticed)\b/i,
    /\bmy\s+(experience|encounter|sighting|story|account)\b/i,
    /\bhappened to me\b/i,
    /\bi was\s+\d+\s+(years old|at the time)\b/i,
    /\bthis happened\s+(in|back|when|to me)\b/i,
    /\bi'll never forget\b/i,
    /\bi still (remember|think about|can't explain)\b/i,
  ];

  const hasFirstPerson = firstPersonIndicators.some(p => p.test(text));
  if (!hasFirstPerson) return false;

  // Should contain narrative elements (not just opinions)
  const narrativeIndicators = [
    /\b(then|suddenly|after that|next thing|at that point|when i|while i)\b/i,
    /\b(looked|turned|ran|drove|walked|heard|felt|saw|noticed|woke)\b/i,
    /\b(night|morning|evening|around \d|at \d|outside|bedroom|road|highway)\b/i,
  ];

  const narrativeCount = narrativeIndicators.filter(p => p.test(text)).length;
  return narrativeCount >= 2;
}

// Determine category from video title/description and comment content
function inferCategoryFromContext(
  videoTitle: string,
  videoCategory: string,
  commentText: string
): string {
  const combined = (videoTitle + ' ' + commentText).toLowerCase();

  if (/\b(ufo|uap|flying saucer|alien|abduct|craft|spaceship)\b/.test(combined)) return 'ufos_aliens';
  if (/\b(nde|near.death|died and came back|flatlined|afterlife|tunnel of light)\b/.test(combined)) return 'psychological_experiences';
  if (/\b(ghost|haunt|spirit|appari|poltergeist|shadow figure|shadow person)\b/.test(combined)) return 'ghosts_hauntings';
  if (/\b(bigfoot|sasquatch|cryptid|creature|wendigo|skinwalker|dogman)\b/.test(combined)) return 'cryptids';
  if (/\b(astral|out of body|obe|lucid dream|sleep paralysis)\b/.test(combined)) return 'consciousness_practices';
  if (/\b(psychic|telepathy|premonition|precognition|remote viewing)\b/.test(combined)) return 'psychic_phenomena';

  return videoCategory || 'combination';
}

// Convert video data to ScrapedReport
function convertVideoToReport(
  video: YouTubeVideoItem,
  channelName: string,
  category: string
): ScrapedReport | null {
  if (!video || !video.snippet) return null;

  const { title, description, publishedAt, thumbnails, tags, channelTitle } = video.snippet;
  const { viewCount, likeCount, commentCount } = video.statistics || {};
  const { duration } = video.contentDetails || {};

  const truncatedDescription = description.length > 5000
    ? description.substring(0, 5000)
    : description;

  const summary = truncatedDescription.length > 200
    ? truncatedDescription.substring(0, 200)
    : truncatedDescription;

  const reportTags: string[] = ['youtube', channelName.toLowerCase().replace(/\s+/g, '-')];
  if (tags && Array.isArray(tags)) {
    reportTags.push(...tags.slice(0, 10)); // Cap at 10 tags from YouTube
  }

  const media: ScrapedMediaItem[] = [];
  const thumbnailUrl = thumbnails?.high?.url || thumbnails?.default?.url;
  if (thumbnailUrl) {
    media.push({ type: 'image', url: thumbnailUrl, isPrimary: true });
  }

  const views = viewCount ? parseInt(viewCount, 10) : undefined;
  const likes = likeCount ? parseInt(likeCount, 10) : undefined;
  const comments = commentCount ? parseInt(commentCount, 10) : undefined;

  return {
    original_report_id: `yt-video-${video.id}`,
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
      contentKind: 'video',
    },
  };
}

// Convert a YouTube comment to a ScrapedReport
function convertCommentToReport(
  comment: YouTubeCommentThread,
  videoTitle: string,
  videoCategory: string,
  channelName: string
): ScrapedReport | null {
  const snippet = comment.snippet.topLevelComment.snippet;
  const cleanText = stripHtml(snippet.textOriginal || snippet.textDisplay);

  // Quality filters
  if (cleanText.length < MIN_COMMENT_LENGTH) return null;
  if (snippet.likeCount < MIN_COMMENT_LIKES) return null;
  if (!isExperiencerComment(cleanText)) return null;

  const category = inferCategoryFromContext(videoTitle, videoCategory, cleanText);

  // Generate a meaningful title from the comment
  const firstSentence = cleanText.split(/[.!?\n]/).filter(s => s.trim().length > 15)[0] || '';
  const title = firstSentence.length > 10
    ? firstSentence.trim().substring(0, 120) + (firstSentence.length > 120 ? '...' : '')
    : `Experience shared on "${videoTitle.substring(0, 80)}"`;

  const summary = cleanText.length > 300
    ? cleanText.substring(0, 297) + '...'
    : cleanText;

  return {
    original_report_id: `yt-comment-${comment.snippet.topLevelComment.id}`,
    source_type: 'youtube',
    source_label: `YouTube comment on ${channelName}`,
    source_url: `https://youtube.com/watch?v=${snippet.videoId}&lc=${comment.snippet.topLevelComment.id}`,
    title,
    description: cleanText,
    summary,
    category,
    credibility: snippet.likeCount > 50 ? 'medium' : 'low',
    tags: ['youtube', 'youtube-comment', 'experiencer-account', channelName.toLowerCase().replace(/\s+/g, '-')],
    event_date: snippet.publishedAt,
    event_date_precision: 'unknown',
    metadata: {
      videoId: snippet.videoId,
      videoTitle,
      commentId: comment.snippet.topLevelComment.id,
      authorName: snippet.authorDisplayName,
      likeCount: snippet.likeCount,
      replyCount: comment.snippet.totalReplyCount,
      channelName,
      contentKind: 'comment',
    },
  };
}

// Fetch comments for a video
async function fetchVideoComments(
  videoId: string,
  apiKey: string,
  maxComments: number = 100
): Promise<YouTubeCommentThread[]> {
  const allComments: YouTubeCommentThread[] = [];
  let pageToken: string | undefined;

  while (allComments.length < maxComments) {
    const params = new URLSearchParams({
      part: 'snippet',
      videoId,
      order: 'relevance',
      maxResults: Math.min(100, maxComments - allComments.length).toString(),
      textFormat: 'plainText',
      key: apiKey,
    });

    if (pageToken) {
      params.append('pageToken', pageToken);
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/commentThreads?${params}`
      );

      if (!response.ok) {
        // Comments disabled or other error — not fatal
        break;
      }

      const data: YouTubeCommentResponse = await response.json() as YouTubeCommentResponse;

      if (data.error || !data.items) break;

      allComments.push(...data.items);
      pageToken = data.nextPageToken as string | undefined;

      if (!pageToken) break;
    } catch {
      break;
    }
  }

  return allComments;
}

// Main adapter implementation
export const youtubeAdapter: SourceAdapter = {
  name: 'youtube',

  async scrape(config: Record<string, any>, limit: number = 50): Promise<AdapterResult> {
    const apiKey = config.apiKey || process.env.YOUTUBE_API_KEY;

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
    const includeComments = config.includeComments !== false; // Default: true
    const maxCommentsPerVideo = config.maxCommentsPerVideo || 100;
    const searchQueries = config.searchQueries || DEFAULT_SEARCH_QUERIES;
    const includeSearch = config.includeSearch === true; // Default: false (save API quota)

    const allReports: ScrapedReport[] = [];
    const errors: string[] = [];
    const seenVideoIds = new Set<string>();

    try {
      console.log(`[YouTube] Starting scrape. Limit: ${limit}, Comments: ${includeComments}`);

      // ===== PHASE 1: Channel videos =====
      for (const channel of channels) {
        if (allReports.length >= limit) break;

        try {
          await delay(rateLimitMs);
          console.log(`[YouTube] Fetching videos from ${channel.name}...`);

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
            errors.push(`Failed to search ${channel.name}: ${(errorData as any).error?.message || `HTTP ${searchResponse.status}`}`);
            continue;
          }

          const searchData: YouTubeSearchResponse = await searchResponse.json() as YouTubeSearchResponse;
          if (searchData.error) {
            errors.push(`YouTube API error for ${channel.name}: ${searchData.error.message}`);
            continue;
          }

          const videoIds = extractVideoIds(searchData).filter(id => !seenVideoIds.has(id));
          videoIds.forEach(id => seenVideoIds.add(id));

          if (videoIds.length === 0) {
            console.log(`[YouTube] No new videos found in ${channel.name}`);
            continue;
          }

          await delay(rateLimitMs);

          // Get detailed video information
          const videoParams = new URLSearchParams({
            part: 'snippet,statistics,contentDetails',
            id: videoIds.join(','),
            key: apiKey,
          });

          const videoUrl = `https://www.googleapis.com/youtube/v3/videos?${videoParams}`;
          const videoResponse = await fetch(videoUrl);

          if (!videoResponse.ok) {
            const errorData = await videoResponse.json().catch(() => ({})) as Record<string, any>;
            errors.push(`Failed to get video details from ${channel.name}: ${(errorData as any).error?.message || `HTTP ${videoResponse.status}`}`);
            continue;
          }

          const videoData: YouTubeVideoResponse = await videoResponse.json() as YouTubeVideoResponse;
          if (videoData.error || !videoData.items) continue;

          // Convert videos to reports + fetch comments
          for (const video of videoData.items) {
            if (allReports.length >= limit) break;

            // Add the video itself as a report
            const videoReport = convertVideoToReport(video, channel.name, channel.category);
            if (videoReport) {
              allReports.push(videoReport);
            }

            // Fetch and process comments for this video
            if (includeComments && video.statistics?.commentCount && parseInt(video.statistics.commentCount) > 0) {
              try {
                await delay(rateLimitMs);
                const comments = await fetchVideoComments(video.id!, apiKey, maxCommentsPerVideo);

                let commentReports = 0;
                for (const comment of comments) {
                  if (allReports.length >= limit) break;

                  const commentReport = convertCommentToReport(
                    comment,
                    video.snippet?.title || '',
                    channel.category,
                    channel.name
                  );

                  if (commentReport) {
                    allReports.push(commentReport);
                    commentReports++;
                  }
                }

                if (commentReports > 0) {
                  console.log(`[YouTube] Extracted ${commentReports} experiencer comments from "${video.snippet?.title?.substring(0, 40)}..."`);
                }
              } catch (commentErr) {
                // Comments extraction failure is non-fatal
                console.log(`[YouTube] Comment extraction failed for ${video.id}: ${commentErr}`);
              }
            }
          }

          console.log(`[YouTube] Processed ${videoData.items.length} videos from ${channel.name}, total reports: ${allReports.length}`);
        } catch (channelError: unknown) {
          errors.push(`Error processing ${channel.name}: ${channelError instanceof Error ? channelError.message : String(channelError)}`);
        }
      }

      // ===== PHASE 2: Search-based discovery (optional) =====
      if (includeSearch && allReports.length < limit) {
        for (const query of searchQueries) {
          if (allReports.length >= limit) break;

          try {
            await delay(rateLimitMs);
            console.log(`[YouTube] Searching: "${query}"...`);

            const searchParams = new URLSearchParams({
              part: 'snippet',
              q: query,
              type: 'video',
              order: 'relevance',
              maxResults: '10',
              key: apiKey,
            });

            if (publishedAfter) {
              searchParams.append('publishedAfter', publishedAfter);
            }

            const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams}`;
            const searchResponse = await fetch(searchUrl);

            if (!searchResponse.ok) continue;

            const searchData: YouTubeSearchResponse = await searchResponse.json() as YouTubeSearchResponse;
            if (searchData.error || !searchData.items) continue;

            const videoIds = extractVideoIds(searchData).filter(id => !seenVideoIds.has(id));
            videoIds.forEach(id => seenVideoIds.add(id));

            if (videoIds.length === 0) continue;

            await delay(rateLimitMs);

            const videoParams = new URLSearchParams({
              part: 'snippet,statistics,contentDetails',
              id: videoIds.join(','),
              key: apiKey,
            });

            const videoResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videoParams}`);
            if (!videoResponse.ok) continue;

            const videoData: YouTubeVideoResponse = await videoResponse.json() as YouTubeVideoResponse;
            if (!videoData.items) continue;

            for (const video of videoData.items) {
              if (allReports.length >= limit) break;
              const report = convertVideoToReport(video, 'YouTube Search', 'combination');
              if (report) allReports.push(report);
            }
          } catch {
            // Non-fatal
          }
        }
      }

      console.log(`[YouTube] Scrape complete. Total reports: ${allReports.length} (videos + comments)`);

      return {
        success: allReports.length > 0,
        reports: allReports,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };

    } catch (error: unknown) {
      console.error('[YouTube] Scrape failed:', error);
      return {
        success: false,
        reports: allReports,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
};
