// Reddit Paranormal Adapter
// Fetches posts from paranormal-related subreddits using Reddit's public JSON API

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

// Reddit post interface
interface RedditPost {
  kind: string;
  data: {
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
  };
}

interface RedditResponse {
  data: {
    children: RedditPost[];
    after: string | null;
  };
}

// Parse a Reddit post into a ScrapedReport
function parseRedditPost(post: RedditPost['data']): ScrapedReport | null {
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

// Fetch posts from a subreddit
async function fetchSubreddit(
  subreddit: string,
  limit: number,
  rateLimitMs: number
): Promise<ScrapedReport[]> {
  const reports: ScrapedReport[] = [];

  // Try multiple endpoints - Reddit blocks some server-side requests
  const endpoints = [
    `https://old.reddit.com/r/${subreddit}/hot.json?limit=${Math.min(limit, 100)}`,
    `https://www.reddit.com/r/${subreddit}/hot.json?limit=${Math.min(limit, 100)}&raw_json=1`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });

      if (!response.ok) {
        console.log(`[Reddit] Endpoint failed for r/${subreddit}: ${response.status}, trying next...`);
        continue; // Try next endpoint
      }

      const data: RedditResponse = await response.json();

      if (!data?.data?.children) {
        console.log(`[Reddit] Invalid response structure for r/${subreddit}, trying next...`);
        continue;
      }

      for (const post of data.data.children) {
        const report = parseRedditPost(post.data);
        if (report) {
          reports.push(report);
        }
      }

      // If we got here, the endpoint worked
      console.log(`[Reddit] Successfully fetched ${reports.length} posts from r/${subreddit}`);
      return reports;

    } catch (error) {
      console.log(`[Reddit] Error with endpoint for r/${subreddit}:`, error instanceof Error ? error.message : 'Unknown');
      continue; // Try next endpoint
    }
  }

  // All endpoints failed
  console.error(`[Reddit] All endpoints failed for r/${subreddit}`);
  return reports;
}

// Main adapter implementation
export const redditAdapter: SourceAdapter = {
  name: 'reddit',

  async scrape(config: Record<string, any>, limit: number = 50): Promise<AdapterResult> {
    const rateLimitMs = config.rate_limit_ms || 2000; // Reddit rate limits
    const subreddits = config.subreddits || [
      // From research list
      'aliens',
      'Tulpas',
      'ghosts',
      'NDE',
      'Psychonaut',
      // Additional high-value subreddits
      'Paranormal',
      'UFOs',
      'Thetruthishere',
      'cryptids',
      'HighStrangeness'
    ];

    const allReports: ScrapedReport[] = [];
    const errors: string[] = [];

    try {
      console.log('[Reddit] Starting scrape...');

      const reportsPerSubreddit = Math.ceil(limit / subreddits.length);

      for (const subreddit of subreddits) {
        if (allReports.length >= limit) break;

        console.log(`[Reddit] Fetching r/${subreddit}...`);

        await delay(rateLimitMs);

        const subredditReports = await fetchSubreddit(subreddit, reportsPerSubreddit, rateLimitMs);
        console.log(`[Reddit] Found ${subredditReports.length} posts in r/${subreddit}`);

        // Add reports up to limit
        const remaining = limit - allReports.length;
        allReports.push(...subredditReports.slice(0, remaining));
      }

      console.log(`[Reddit] Scrape complete. Total reports: ${allReports.length}`);

      return {
        success: allReports.length > 0,
        reports: allReports,
        error: errors.length > 0 ? errors.join('; ') : undefined
      };

    } catch (error) {
      console.error('[Reddit] Scrape failed:', error);
      return {
        success: false,
        reports: allReports,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};
