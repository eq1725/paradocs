// Reddit Paranormal Adapter
// Fetches posts from paranormal-related subreddits using Arctic Shift API
// (Reddit blocks direct server-side requests from cloud environments)

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Arctic Shift API base URL (free Reddit archive)
// Trying multiple API endpoints for reliability
const ARCTIC_SHIFT_ENDPOINTS = [
  'https://arctic-shift.photon-reddit.com/api',
  'https://api.arcticshift.app/v1',
];

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

// Arctic Shift comment interface
interface ArcticShiftComment {
  id: string;
  body: string;
  author: string;
  created_utc: number;
  score: number;
  parent_id: string;
  link_id: string;
}

// Patterns that indicate a "meta" post (asking for stories, not sharing one)
const META_POST_PATTERNS = [
  // Asking for experiences
  /\b(share your|tell me about|tell us about|what's your|what are your)\b/i,
  /\b(looking for|searching for|collecting) (stories|experiences|accounts)\b/i,
  /\b(anyone have|does anyone have|has anyone had|who has had)\b/i,
  /\b(anyone else|has anyone else|did anyone else)\b/i,
  // Research/media requests
  /\b(i'm (making|creating|writing|working on)|for my (book|podcast|channel|video|documentary|research|project|zine))\b/i,
  /\b(gathering|collecting|compiling) (stories|experiences|data)\b/i,
  // Challenges/contests
  /\b(challenge|contest|giveaway)\b/i,
  // Questions seeking multiple responses
  /\bwhat (paranormal|supernatural|strange|weird|creepy) (experience|thing|event)s? (have you|did you)\b/i,
  // Discussion prompts
  /\b(discussion|megathread|weekly thread)\b/i,
  // Theory/consensus questions (not sightings)
  /\b(what('s| is) (the|your) (consensus|theory|opinion|take|thoughts?)( on)?)\b/i,
  /\b(what do (you|we|people) think (about|of))\b/i,
  /\b(how do (you|we) explain)\b/i,
  /\b(can (someone|anyone) explain)\b/i,
  /\b(theories? (about|on|regarding))\b/i,
  /\b(years later|decades later|looking back)\b/i,
  // Opinion polls
  /\b(poll|vote|which (do you|would you))\b/i,
  /\bif you had to (choose|pick)\b/i,
  // Historical discussion (not personal experience)
  /\b(historical|famous|well-known|documented) (case|event|incident|sighting)\b/i,
  /\b(the|this) (case|event|incident) (of|from)\b/i,
];

// Patterns that indicate the title is asking a question (not reporting)
const QUESTION_TITLE_PATTERNS = [
  /^(what|why|how|where|when|who|which|is|are|do|does|did|can|could|should|would|has|have)\b.+\?$/i,
  /\b(thoughts\??|opinions?\??|theories?\??|explain\??)$/i,
  /\bwhat do you think\b/i,
  /\bdoes anyone (know|think|believe)\b/i,
];

// Patterns that indicate art, merchandise, or promotional content (NOT sightings)
const NON_SIGHTING_PATTERNS = [
  // Art and crafts
  /\b(i (made|drew|painted|created|designed|crafted|stitched|knitted|crocheted))\b/i,
  /\b(my (art|artwork|drawing|painting|sketch|illustration|design|craft|creation))\b/i,
  /\b(cross[- ]?stitch|embroidery|crochet|knitting|quilting|woodworking|sculpture)\b/i,
  /\b(fan ?art|oc|original character|commission)\b/i,
  /\b(digital art|traditional art|pixel art|3d model)\b/i,
  // Merchandise and promotional
  /\b(for sale|buy now|shop|store|etsy|redbubble|teepublic|amazon)\b/i,
  /\b(merch|merchandise|t-shirt|shirt|poster|sticker|mug|print)\b/i,
  /\b(link in (bio|comments|description)|check out my)\b/i,
  /\b(free download|download free|pattern free)\b/i,
  // Media/entertainment (not experiences)
  /\b(movie|film|show|series|episode|trailer|review|rating)\b/i,
  /\b(game|video ?game|indie game|rpg|tabletop)\b/i,
  /\b(podcast episode|new episode|latest episode)\b/i,
  /\b(book release|new book|my novel|my book)\b/i,
  // Memes and jokes
  /\b(meme|shitpost|joke|lol|lmao|funny)\b/i,
  /\b(wrong answers only|caption this)\b/i,
  // Tattoos
  /\b(my (new )?tattoo|got (a |this )?tattoo|tattoo (design|idea|artist))\b/i,
  // Cosplay
  /\b(cosplay|costume|dressed as|dressed up as)\b/i,
  // News/articles about phenomena (not personal experiences)
  /\b(article|news|report says|according to|scientists|researchers found)\b/i,
];

// URL patterns that indicate promotional/spam content
const SPAM_URL_PATTERNS = [
  /etsy\.com/i,
  /redbubble\.com/i,
  /teepublic\.com/i,
  /society6\.com/i,
  /zazzle\.com/i,
  /spreadshirt\.com/i,
  /cafepress\.com/i,
  /teespring\.com/i,
  /printful\.com/i,
  /creativelycrafting\.com/i,
  /patreon\.com/i,
  /ko-fi\.com/i,
  /buymeacoffee\.com/i,
  /gumroad\.com/i,
  /linktr\.ee/i,
  /bit\.ly/i,
  /tinyurl\.com/i,
];

// Check if a post is a "meta" post asking for stories rather than sharing one
function isMetaPost(post: ArcticShiftPost): boolean {
  const title = post.title?.toLowerCase() || '';
  const text = post.selftext?.toLowerCase() || '';
  const combined = `${title} ${text}`;

  // Check against meta patterns
  for (const pattern of META_POST_PATTERNS) {
    if (pattern.test(combined)) {
      return true;
    }
  }

  // Check if title is a question asking for opinions/theories (not a personal report)
  for (const pattern of QUESTION_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      return true;
    }
  }

  // Titles that are just questions often indicate prompts
  if (title.endsWith('?')) {
    // Question titles with these words are usually discussion prompts, not experiences
    const promptWords = ['your', 'you', 'anyone', 'has', 'does', 'what', 'who', 'share', 'think', 'consensus', 'theory', 'opinion', 'explain'];
    if (promptWords.some(word => title.includes(word))) {
      return true;
    }
    // Short question titles (< 15 words) are often prompts
    if (title.split(' ').length < 15) {
      return true;
    }
  }

  return false;
}

// Check if a post is art, merchandise, promotional, or other non-sighting content
function isNonSightingContent(post: ArcticShiftPost): { isNonSighting: boolean; reason?: string } {
  const title = post.title?.toLowerCase() || '';
  const text = post.selftext?.toLowerCase() || '';
  const combined = `${title} ${text}`;

  // Check against non-sighting patterns
  for (const pattern of NON_SIGHTING_PATTERNS) {
    if (pattern.test(combined)) {
      const match = combined.match(pattern);
      return { isNonSighting: true, reason: `matches pattern: ${match?.[0]}` };
    }
  }

  // Check for spam/promotional URLs in the text
  for (const urlPattern of SPAM_URL_PATTERNS) {
    if (urlPattern.test(text)) {
      return { isNonSighting: true, reason: `contains promotional URL` };
    }
  }

  // Check for external links that aren't news sources or image hosts
  const urlMatches = text.match(/https?:\/\/[^\s\)]+/gi) || [];
  const allowedDomains = [
    'reddit.com', 'redd.it', 'imgur.com', 'i.redd.it', 'v.redd.it',
    'youtube.com', 'youtu.be', 'twitter.com', 'x.com',
    'wikipedia.org', 'bbc.com', 'cnn.com', 'nytimes.com',
    'nuforc.org', 'mufon.com'
  ];

  for (const url of urlMatches) {
    const isAllowed = allowedDomains.some(domain => url.toLowerCase().includes(domain));
    if (!isAllowed && !url.includes('.jpg') && !url.includes('.png') && !url.includes('.gif')) {
      // Check if it looks like a shop/promotional link
      if (/\.(com|net|org|shop|store)\//.test(url)) {
        return { isNonSighting: true, reason: `contains external link: ${url.substring(0, 50)}` };
      }
    }
  }

  // Check for common art post flairs
  const artFlairs = ['art', 'artwork', 'oc', 'fan art', 'fanart', 'meme', 'humor', 'merchandise', 'merch'];
  if (post.link_flair_text && artFlairs.some(flair => post.link_flair_text?.toLowerCase().includes(flair))) {
    return { isNonSighting: true, reason: `has art/meme flair: ${post.link_flair_text}` };
  }

  // Title patterns that suggest non-sighting content
  const titleOnlyPatterns = [
    /^(i made|i drew|i painted|i created|my art|here's my|check out my)/i,
    /^(new|my new) (tattoo|design|artwork|creation)/i,
    /:[\)\(D]|\s[\)\(D]$/,  // Smileys in title often indicate casual/meme posts
  ];

  for (const pattern of titleOnlyPatterns) {
    if (pattern.test(title)) {
      return { isNonSighting: true, reason: `title suggests non-sighting: ${title.substring(0, 40)}` };
    }
  }

  return { isNonSighting: false };
}

// Fetch comments from a post using Arctic Shift API
async function fetchPostComments(
  postId: string,
  subreddit: string,
  postTitle: string,
  limit: number = 20
): Promise<ScrapedReport[]> {
  const reports: ScrapedReport[] = [];

  try {
    // Arctic Shift comments endpoint
    const url = `https://arctic-shift.photon-reddit.com/api/comments/search?link_id=t3_${postId}&limit=${limit}`;
    console.log(`[Reddit/ArcticShift] Fetching comments for post ${postId}: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ParaDocs/1.0 (Paranormal Research Database)',
      }
    });

    if (!response.ok) {
      console.log(`[Reddit/ArcticShift] Failed to fetch comments for ${postId}: ${response.status}`);
      return reports;
    }

    const data = await response.json();
    const comments: ArcticShiftComment[] = Array.isArray(data) ? data : (data.data || []);

    console.log(`[Reddit/ArcticShift] Found ${comments.length} comments for post ${postId}`);

    // Get category from subreddit
    const category = SUBREDDIT_CATEGORIES[subreddit] || 'combination';

    for (const comment of comments) {
      // Skip short comments, deleted, or low quality
      if (!comment.body || comment.body.length < 150) continue;
      if (comment.body === '[removed]' || comment.body === '[deleted]') continue;
      if (comment.score < 0) continue;

      // Clean the comment text
      const description = comment.body
        .replace(/\n{3,}/g, '\n\n')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();

      // Create summary
      const summary = description.length > 200
        ? description.substring(0, 197) + '...'
        : description;

      // Create a title from the first sentence or truncate
      const firstSentence = description.match(/^[^.!?]+[.!?]/);
      const title = firstSentence
        ? (firstSentence[0].length > 100 ? firstSentence[0].substring(0, 97) + '...' : firstSentence[0])
        : (description.substring(0, 97) + '...');

      // Convert UTC timestamp to date
      const eventDate = new Date(comment.created_utc * 1000).toISOString().split('T')[0];

      // Extract tags
      const tags: string[] = [subreddit.toLowerCase(), 'comment-experience'];
      const lowerText = description.toLowerCase();

      if (lowerText.includes('encounter') || lowerText.includes('sighting')) {
        tags.push('encounter');
      }
      if (lowerText.includes('experience') || lowerText.includes('happened to me')) {
        tags.push('personal-experience');
      }

      reports.push({
        title,
        summary,
        description,
        category,
        event_date: eventDate,
        credibility: comment.score > 50 ? 'high' : (comment.score > 10 ? 'medium' : 'low'),
        source_type: 'reddit',
        original_report_id: `reddit-comment-${comment.id}`,
        tags,
        // New quality system fields
        source_label: `r/${subreddit}`,
        source_url: `https://reddit.com/r/${subreddit}/comments/${postId}`,
        metadata: {
          subreddit,
          postTitle,
          commentScore: comment.score,
          isComment: true
        }
      });
    }

    console.log(`[Reddit/ArcticShift] Extracted ${reports.length} valid comment experiences from post ${postId}`);

  } catch (error) {
    console.error(`[Reddit/ArcticShift] Error fetching comments:`, error instanceof Error ? error.message : 'Unknown');
  }

  return reports;
}

// Parse a Reddit/Arctic Shift post into a ScrapedReport
function parseRedditPost(post: ArcticShiftPost): ScrapedReport | null {
  // Arctic Shift might use different field names - handle both cases
  // Try selftext first, then self_text, then body
  const textContent = post.selftext || (post as any).self_text || (post as any).body || '';
  const isSelfPost = post.is_self !== false; // Allow undefined/null as self posts

  // Skip non-text posts or very short posts
  if (!isSelfPost || !textContent || textContent.length < 100) {
    console.log(`[Reddit/ArcticShift] parseRedditPost rejected: is_self=${post.is_self}, textLength=${textContent.length}, title="${post.title?.substring(0, 30)}"`);
    return null;
  }

  // Skip removed/deleted posts
  if (textContent === '[removed]' || textContent === '[deleted]') {
    console.log(`[Reddit/ArcticShift] parseRedditPost rejected: deleted/removed post`);
    return null;
  }

  // Get category from subreddit
  const category = SUBREDDIT_CATEGORIES[post.subreddit] || 'combination';

  // Clean the text (Reddit uses markdown)
  const description = textContent
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

  // Default to United States for Reddit posts since Reddit is predominantly US-based
  // This improves geographic analytics accuracy
  if (!country) {
    country = 'United States';
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
    tags,
    // New quality system fields
    source_label: `r/${post.subreddit}`,
    source_url: `https://reddit.com${post.permalink}`,
    metadata: {
      subreddit: post.subreddit,
      postId: post.id,
      score: post.score,
      numComments: post.num_comments,
      flair: post.link_flair_text
    }
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

  // Try multiple endpoint formats
  const urlVariants = [
    // Format 1: photon-reddit.com
    `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${subreddit}&after=${afterDate}&limit=${Math.min(limit, 100)}&sort=desc`,
    // Format 2: Alternative with different params
    `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${encodeURIComponent(subreddit)}&limit=${Math.min(limit, 100)}`,
  ];

  for (const urlString of urlVariants) {
    try {
      console.log(`[Reddit/ArcticShift] Trying: ${urlString}`);

      const response = await fetch(urlString, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ParaDocs/1.0 (Paranormal Research Database; contact: admin@paradocs.com)',
        }
      });

      console.log(`[Reddit/ArcticShift] Response status for r/${subreddit}: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Could not read error body');
        console.error(`[Reddit/ArcticShift] API error for r/${subreddit}: ${response.status} - ${errorText.substring(0, 200)}`);
        continue; // Try next URL variant
      }

      const responseText = await response.text();
      console.log(`[Reddit/ArcticShift] Response length for r/${subreddit}: ${responseText.length} chars`);

      let data: ArcticShiftResponse;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`[Reddit/ArcticShift] JSON parse error for r/${subreddit}: ${responseText.substring(0, 200)}`);
        continue;
      }

      // Debug: log response structure
      const dataKeys = typeof data === 'object' && data !== null ? Object.keys(data) : ['not an object'];
      console.log(`[Reddit/ArcticShift] Response keys for r/${subreddit}: ${dataKeys.join(', ')}`);
      console.log(`[Reddit/ArcticShift] Response sample for r/${subreddit}: ${JSON.stringify(data).substring(0, 500)}`);

      // Handle different response structures
      let posts: ArcticShiftPost[] = [];
      if (Array.isArray(data)) {
        console.log(`[Reddit/ArcticShift] Response is array with ${data.length} items`);
        posts = data as unknown as ArcticShiftPost[];
      } else if (data?.data && Array.isArray(data.data)) {
        console.log(`[Reddit/ArcticShift] Response has data array with ${data.data.length} items`);
        posts = data.data;
      } else {
        console.log(`[Reddit/ArcticShift] Unexpected response structure for r/${subreddit}`);
        continue;
      }

      console.log(`[Reddit/ArcticShift] Found ${posts.length} raw posts for r/${subreddit}`);

      // Debug: Log first post structure to understand the data
      if (posts.length > 0) {
        const firstPost = posts[0];
        console.log(`[Reddit/ArcticShift] First post structure: id=${firstPost.id}, score=${firstPost.score}, is_self=${firstPost.is_self}, selftext_length=${firstPost.selftext?.length || 0}, title="${firstPost.title?.substring(0, 50)}"`);
      }

      // Filter for text posts (relaxed engagement filter for archived data)
      let skippedLowScore = 0;
      let skippedNotSelf = 0;
      let skippedMetaPost = 0;
      let skippedNonSighting = 0;
      let skippedParseFailed = 0;
      let commentReportsAdded = 0;

      for (const post of posts) {
        // Only skip heavily downvoted posts (score < 0)
        // Arctic Shift archives posts with their original scores, many good posts have low scores
        if (post.score !== undefined && post.score !== null && post.score < 0) {
          skippedLowScore++;
          continue;
        }
        // Skip non-self posts (links, images) - but allow if is_self is undefined
        if (post.is_self === false) {
          skippedNotSelf++;
          continue;
        }

        // Check if this is art, merchandise, or other non-sighting content
        const nonSightingCheck = isNonSightingContent(post);
        if (nonSightingCheck.isNonSighting) {
          console.log(`[Reddit/ArcticShift] Non-sighting content filtered: "${post.title?.substring(0, 50)}..." (${nonSightingCheck.reason})`);
          skippedNonSighting++;
          continue;
        }

        // Check if this is a meta/prompt post (asking for stories, not sharing one)
        if (isMetaPost(post)) {
          console.log(`[Reddit/ArcticShift] Meta post detected: "${post.title?.substring(0, 50)}..." (${post.num_comments} comments)`);
          skippedMetaPost++;

          // If the post has good engagement, fetch comments as they contain the actual experiences
          if (post.num_comments >= 5) {
            try {
              const commentReports = await fetchPostComments(post.id, subreddit, post.title, 15);
              reports.push(...commentReports);
              commentReportsAdded += commentReports.length;
              console.log(`[Reddit/ArcticShift] Added ${commentReports.length} comment experiences from meta post`);
            } catch (err) {
              console.log(`[Reddit/ArcticShift] Failed to fetch comments for meta post: ${err}`);
            }
          }
          continue;
        }

        const report = parseRedditPost(post);
        if (report) {
          reports.push(report);
        } else {
          skippedParseFailed++;
        }
      }

      console.log(`[Reddit/ArcticShift] Filtering results for r/${subreddit}: passed=${reports.length}, skippedLowScore=${skippedLowScore}, skippedNotSelf=${skippedNotSelf}, skippedMetaPost=${skippedMetaPost}, skippedNonSighting=${skippedNonSighting}, skippedParseFailed=${skippedParseFailed}, commentReports=${commentReportsAdded}`);

      if (reports.length > 0) {
        console.log(`[Reddit/ArcticShift] Successfully fetched ${reports.length} posts from r/${subreddit}`);
        return reports;
      }

    } catch (error) {
      console.error(`[Reddit/ArcticShift] Error fetching r/${subreddit}:`, error instanceof Error ? error.message : 'Unknown');
      continue; // Try next URL variant
    }
  }

  console.log(`[Reddit/ArcticShift] All endpoints failed for r/${subreddit}`);
  return reports;
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
