// Reddit Paranormal Adapter
// Fetches posts from paranormal-related subreddits using Arctic Shift API
// (Reddit blocks direct server-side requests from cloud environments)

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Arctic Shift API base URL (free Reddit archive)
const ARCTIC_SHIFT_API = 'https://arctic-shift.photon-reddit.com/api';

// Map subreddits to categories
const SUBREDDIT_CATEGORIES: Record<string, string> = {
  // UFOs & Aliens
  'UFOs': 'ufos_aliens',
  'ufo': 'ufos_aliens',
  'aliens': 'ufos_aliens',
  'UAP': 'ufos_aliens',
  // Ghosts & Hauntings
  'Ghosts': 'ghosts_hauntings',
  'ghosts': 'ghosts_hauntings',
  'Paranormal': 'ghosts_hauntings',
  'Thetruthishere': 'ghosts_hauntings',
  'Haunted': 'ghosts_hauntings',
  // Cryptids
  'bigfoot': 'cryptids',
  'cryptids': 'cryptids',
  'cryptozoology': 'cryptids',
  'skinwalkers': 'cryptids',
  // Psychological Experiences
  'Glitch_in_the_Matrix': 'psychological_experiences',
  'NDE': 'psychological_experiences',
  'Tulpas': 'psychological_experiences',
  // Consciousness Practices
  'AstralProjection': 'consciousness_practices',
  'LucidDreaming': 'consciousness_practices',
  'Psychonaut': 'consciousness_practices',
  // Psychic Phenomena
  'Psychic': 'psychic_phenomena',
  // Multi-category
  'HighStrangeness': 'combination'
};

// Arctic Shift post interface (matches Reddit's data structure)
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
}

interface ArcticShiftResponse {
  data: ArcticShiftPost[];
}

// Parse a Reddit/Arctic Shift post into a ScrapedReport
function parseRedditPost(post: ArcticShiftPost): ScrapedReport | null {
  // Skip non-text posts or very short posts
  if (!post.is_self || !post.selftext || post.selftext.length < 100) {
    return null;
  }

  // Skip removed/deleted posts
  if (post.selftext === '[removed]' || post.selftext === '[deleted]') {
    return null;
  }

  // Get category from subreddit
  const category = SUBREDDIT_CATEGORIES[post.subreddit] || 'combination';

  // Clean the text (Reddit uses markdown)
  const description = post.selftext
    .replace(/\n{3,}/g, '\n\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  // Create summary
  const summary = description.length > 200
    ? description.substring(0, 197) + '...'
    : description;

  // Extract potential location from text
  const locationMatch = description.match(
    /(?:in|at|near|from)\s+([A-Z][a-zA-Z]+(?:,?\s+[A-Z]{2})?(?:,?\s+(?:USA|US|United States|Canada|UK))?)/
  );
  const locationName = locationMatch ? locationMatch[1] : undefined;

  // Extract state/country if found
  let stateProvince: string | undefined;
  let country: string | undefined;

  if (locationName) {
    const stateMatch = locationName.match(/,?\s*([A-Z]{2})(?:,|\s|$)/);
    if (stateMatch) {
      stateProvince = stateMatch[1];
      country = 'United States';
    }
  }

  // Convert UTC timestamp to date
  const eventDate = new Date(post.created_utc * 1000).toISOString().split('T')[0];

  // Extract tags
  const tags: string[] = [post.subreddit.toLowerCase()];
  const lowerText = description.toLowerCase();

  // Add flair as tag if present
  if (post.link_flair_text) {
    tags.push(post.link_flair_text.toLowerCase().replace(/\s+/g, '-'));
  }

  // Content-based tags
  if (lowerText.includes('encounter') || lowerText.includes('sighting')) {
    tags.push('encounter');
  }
  if (lowerText.includes('experience') || lowerText.includes('happened to me')) {
    tags.push('personal-experience');
  }
  if (lowerText.includes('photo') || lowerText.includes('video') || lowerText.includes('evidence')) {
    tags.push('evidence');
  }
  if (lowerText.includes('childhood') || lowerText.includes('when i was young') || lowerText.includes('as a kid')) {
    tags.push('childhood-experience');
  }

  // Determine credibility based on engagement and detail
  let credibility: 'low' | 'medium' | 'high' = 'medium';

  const hasHighEngagement = post.score > 100 || post.num_comments > 20;
  const hasDetailedText = description.length > 1000;
  const hasLocation = !!locationName;

  if (hasHighEngagement && hasDetailedText) {
    credibility = 'high';
  } else if (description.length < 300 && post.score < 10) {
    credibility = 'low';
  }

  return {
    title: post.title.length > 150 ? post.title.substring(0, 147) + '...' : post.title,
    summary,
    description,
    category,
    location_name: locationName,
    country,
    state_province: stateProvince,
    event_date: eventDate,
    credibility,
    source_type: 'reddit',
    original_report_id: `reddit-${post.id}`,
    tags
  };
}

// Fetch posts from a subreddit using Arctic Shift API
async function fetchSubreddit(
  subreddit: string,
  limit: number,
  rateLimitMs: number
): Promise<ScrapedReport[]> {
  const reports: ScrapedReport[] = [];

  // Use Arctic Shift API - free Reddit archive that doesn't block server requests
  // Get posts from the last 2 years
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const afterDate = twoYearsAgo.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Arctic Shift search endpoint - /api/posts/search
  const url = new URL(`${ARCTIC_SHIFT_API}/posts/search`);
  url.searchParams.set('subreddit', subreddit);
  url.searchParams.set('after', afterDate);
  url.searchParams.set('limit', Math.min(limit, 100).toString());
  url.searchParams.set('sort', 'desc'); // Newest first

  try {
    console.log(`[Reddit/ArcticShift] Fetching from: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ParaDocs/1.0 (Paranormal Research Database)',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Reddit/ArcticShift] API error for r/${subreddit}: ${response.status} - ${errorText}`);
      return reports;
    }

    const data: ArcticShiftResponse = await response.json();

    if (!data?.data || !Array.isArray(data.data)) {
      console.log(`[Reddit/ArcticShift] Invalid response structure for r/${subreddit}`);
      return reports;
    }

    // Filter for text posts with good engagement
    for (const post of data.data) {
      // Skip low engagement posts
      if (post.score < 10) continue;
      // Skip non-self posts (links, images)
      if (!post.is_self) continue;

      const report = parseRedditPost(post);
      if (report) {
        reports.push(report);
      }
    }

    console.log(`[Reddit/ArcticShift] Successfully fetched ${reports.length} posts from r/${subreddit}`);
    return reports;

  } catch (error) {
    console.error(`[Reddit/ArcticShift] Error fetching r/${subreddit}:`, error instanceof Error ? error.message : 'Unknown');
    return reports;
  }
}

// Main adapter implementation
export const redditAdapter: SourceAdapter = {
  name: 'reddit',

  async scrape(config: Record<string, any>, limit: number = 50): Promise<AdapterResult> {
    const rateLimitMs = config.rate_limit_ms || 1000; // Arctic Shift is more lenient than Reddit
    const subreddits = config.subreddits || [
      // High-value paranormal subreddits
      'Paranormal',
      'UFOs',
      'Thetruthishere',
      'HighStrangeness',
      'Ghosts',
      'cryptids',
      'Glitch_in_the_Matrix',
      'bigfoot',
      'aliens',
      'skinwalkers'
    ];

    const allReports: ScrapedReport[] = [];
    const errors: string[] = [];

    try {
      console.log('[Reddit/ArcticShift] Starting scrape via Arctic Shift archive...');

      const reportsPerSubreddit = Math.ceil(limit / subreddits.length);

      for (const subreddit of subreddits) {
        if (allReports.length >= limit) break;

        console.log(`[Reddit/ArcticShift] Fetching r/${subreddit}...`);

        await delay(rateLimitMs);

        try {
          const subredditReports = await fetchSubreddit(subreddit, reportsPerSubreddit, rateLimitMs);
          console.log(`[Reddit/ArcticShift] Found ${subredditReports.length} valid posts in r/${subreddit}`);

          // Add reports up to limit
          const remaining = limit - allReports.length;
          allReports.push(...subredditReports.slice(0, remaining));
        } catch (subError) {
          const errorMsg = `r/${subreddit}: ${subError instanceof Error ? subError.message : 'Unknown error'}`;
          console.error(`[Reddit/ArcticShift] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      console.log(`[Reddit/ArcticShift] Scrape complete. Total reports: ${allReports.length}`);

      return {
        success: allReports.length > 0,
        reports: allReports,
        error: errors.length > 0 ? errors.join('; ') : undefined
      };

    } catch (error) {
      console.error('[Reddit/ArcticShift] Scrape failed:', error);
      return {
        success: false,
        reports: allReports,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};
