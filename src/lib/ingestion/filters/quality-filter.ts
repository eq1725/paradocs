// Shared Quality Filter Module
// Centralized filtering and quality scoring for all ingestion adapters

import { ScrapedReport } from '../types';

// ============================================================================
// REJECTION PATTERNS - Content that should NOT be ingested
// ============================================================================

// Meta posts that ask for stories rather than share experiences
export const META_POST_PATTERNS = [
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
];

// Art, merchandise, and promotional content
export const NON_EXPERIENCE_PATTERNS = [
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
  /\b(movie|film|show|series|episode|trailer|review|rating)\s+(about|of|for)/i,
  /\b(game|video ?game|indie game|rpg|tabletop)\b/i,
  /\b(podcast episode|new episode|latest episode)\b/i,
  /\b(book release|new book|my novel|my book)\b/i,
  // Memes and jokes
  /\b(meme|shitpost|joke|lol|lmao|rofl)\b/i,
  /\b(wrong answers only|caption this)\b/i,
  // Tattoos and cosplay
  /\b(my (new )?tattoo|got (a |this )?tattoo|tattoo (design|idea|artist))\b/i,
  /\b(cosplay|costume|dressed as|dressed up as)\b/i,
  // News/articles (not personal experiences)
  /\b(according to|scientists|researchers found|study shows|report says)\b/i,
];

// Fiction markers - stories that are explicitly fictional
export const FICTION_PATTERNS = [
  /\b(creative writing|fiction|short story|writing prompt)\b/i,
  /\b(inspired by|based on the game|fan fiction|fanfic)\b/i,
  /\b(in this movie|in the show|in the book|in the game)\b/i,
  /\b(nosleep|creepypasta|let me tell you a story)\b/i,
  /\b(part \d+|chapter \d+|continued from)\b/i,
  /\b(trigger warning.*fiction|this is fictional|not a true story)\b/i,
];

// Low-effort content markers
export const LOW_EFFORT_PATTERNS = [
  /^.{0,50}$/,  // Very short content (less than 50 chars)
  /^[A-Z\s!?.]{20,}$/,  // All caps
  /[!?]{3,}/,  // Excessive punctuation
  /(.)\1{4,}/,  // Repeated characters (aaaaa, !!!!!!)
  /^(help|what|why|how|does|is|can|should)\s/i,  // Questions only
];

// Spam URL patterns
export const SPAM_URL_PATTERNS = [
  /etsy\.com/i,
  /redbubble\.com/i,
  /teepublic\.com/i,
  /society6\.com/i,
  /zazzle\.com/i,
  /spreadshirt\.com/i,
  /cafepress\.com/i,
  /teespring\.com/i,
  /printful\.com/i,
  /patreon\.com/i,
  /ko-fi\.com/i,
  /buymeacoffee\.com/i,
  /gumroad\.com/i,
  /linktr\.ee/i,
  /bit\.ly/i,
  /tinyurl\.com/i,
  /onlyfans\.com/i,
];

// ============================================================================
// QUALITY SCORING SYSTEM
// ============================================================================

export interface QualityScore {
  total: number;  // 0-100
  lengthScore: number;  // 0-25
  detailScore: number;  // 0-25
  coherenceScore: number;  // 0-25
  sourceScore: number;  // 0-25
  breakdown: {
    wordCount: number;
    hasLocation: boolean;
    hasDate: boolean;
    hasWitnesses: boolean;
    hasTimeOfDay: boolean;
    hasWeather: boolean;
    sentenceCount: number;
    avgSentenceLength: number;
    sourceCredibility: string;
  };
}

export interface FilterResult {
  passed: boolean;
  reason?: string;
  qualityScore?: QualityScore;
}

// Source credibility rankings (0-25 scale)
const SOURCE_CREDIBILITY: Record<string, number> = {
  'bfro': 22,        // Established organization with standards
  'nuforc': 20,      // Long-running database with verification
  'mufon': 22,       // Major UFO organization
  'wikipedia': 18,   // Curated but secondary source
  'reddit': 15,      // User-submitted, variable quality
  'shadowlands': 12, // Less moderated
  'ghostsofamerica': 12, // Community submissions
  'default': 10,
};

// BFRO class mapping for additional source credibility boost
export const BFRO_CLASS_BOOST: Record<string, number> = {
  'Class A': 5,   // Clear sighting
  'Class B': 2,   // Possible sighting
  'Class C': 0,   // Secondhand
};

/**
 * Calculate length score based on description word count
 * Diminishing returns after optimal length
 */
function calculateLengthScore(text: string): number {
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

  if (wordCount < 50) return Math.floor(wordCount / 5);  // 0-10 for short
  if (wordCount < 150) return 10 + Math.floor((wordCount - 50) / 10);  // 10-20
  if (wordCount < 500) return 20 + Math.floor((wordCount - 150) / 70);  // 20-25
  return 25;  // Max score for 500+ words
}

/**
 * Calculate detail score based on specific details present
 */
function calculateDetailScore(text: string): number {
  let score = 0;
  const lowerText = text.toLowerCase();

  // Location details (5 points each, max 10)
  const locationPatterns = [
    /\b(near|at|in|by)\s+[A-Z][a-z]+/,  // Named location
    /\b\d+\s*(mile|kilometer|km|ft|feet|yard|meter)s?\b/i,  // Distance
    /\b(highway|road|street|avenue|route)\s*\d*/i,  // Road reference
    /\b(forest|woods|mountain|lake|river|creek|field|farm|park)\b/i,  // Terrain
  ];
  let locationPoints = 0;
  for (const pattern of locationPatterns) {
    if (pattern.test(text)) locationPoints += 3;
  }
  score += Math.min(locationPoints, 10);

  // Time details (5 points)
  const timePatterns = [
    /\b\d{1,2}:\d{2}\s*(am|pm)?\b/i,  // Specific time
    /\b(morning|afternoon|evening|night|midnight|dawn|dusk)\b/i,
    /\b(around|about|approximately)\s*\d+\s*(am|pm|o'clock)/i,
  ];
  if (timePatterns.some(p => p.test(text))) score += 5;

  // Date details (3 points)
  const datePatterns = [
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
    /\b(last|this)\s+(week|month|year|summer|winter|spring|fall)\b/i,
  ];
  if (datePatterns.some(p => p.test(text))) score += 3;

  // Witness details (4 points)
  if (/\b(witness|saw|observed|noticed|spotted)\b/i.test(lowerText)) score += 2;
  if (/\b(my (wife|husband|friend|brother|sister|mother|father|son|daughter)|we both|together)\b/i.test(lowerText)) score += 2;

  // Physical description (3 points)
  if (/\b(\d+\s*(foot|feet|ft|inch|meter|tall|high|wide|long))\b/i.test(text)) score += 3;

  return Math.min(score, 25);
}

/**
 * Calculate coherence score based on text structure
 */
function calculateCoherenceScore(text: string): number {
  let score = 0;

  // Count sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const sentenceCount = sentences.length;

  // Proper sentence count (5 points)
  if (sentenceCount >= 3) score += 3;
  if (sentenceCount >= 5) score += 2;

  // Average sentence length check (5 points)
  if (sentences.length > 0) {
    const avgLength = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
    if (avgLength >= 8 && avgLength <= 30) score += 5;  // Good sentence length
    else if (avgLength >= 5 && avgLength <= 40) score += 3;  // Acceptable
  }

  // Paragraph structure (5 points)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 50);
  if (paragraphs.length >= 2) score += 3;
  if (paragraphs.length >= 3) score += 2;

  // First person narrative (5 points) - indicates personal experience
  if (/\b(I|we|my|our)\b/.test(text)) score += 3;
  if (/\b(I saw|I heard|I felt|I noticed|I remember|I was)\b/i.test(text)) score += 2;

  // Logical flow indicators (5 points)
  const flowWords = ['then', 'after', 'before', 'suddenly', 'when', 'while', 'as soon as', 'next', 'finally'];
  const flowCount = flowWords.filter(w => text.toLowerCase().includes(w)).length;
  score += Math.min(flowCount, 5);

  return Math.min(score, 25);
}

/**
 * Calculate source credibility score
 */
function calculateSourceScore(sourceType: string, metadata?: Record<string, any>): number {
  let score = SOURCE_CREDIBILITY[sourceType] || SOURCE_CREDIBILITY['default'];

  // Apply BFRO class boost if applicable
  if (sourceType === 'bfro' && metadata?.bfroClass) {
    score += BFRO_CLASS_BOOST[metadata.bfroClass] || 0;
  }

  // Apply Reddit engagement boost
  if (sourceType === 'reddit' && metadata?.score) {
    if (metadata.score > 100) score += 5;
    else if (metadata.score > 50) score += 3;
    else if (metadata.score > 20) score += 1;
  }

  return Math.min(score, 25);
}

/**
 * Calculate complete quality score for a report
 */
export function calculateQualityScore(
  report: ScrapedReport,
  metadata?: Record<string, any>
): QualityScore {
  const text = `${report.title} ${report.description}`;
  const lowerText = text.toLowerCase();

  const lengthScore = calculateLengthScore(report.description);
  const detailScore = calculateDetailScore(text);
  const coherenceScore = calculateCoherenceScore(report.description);
  const sourceScore = calculateSourceScore(report.source_type, metadata);

  const sentences = report.description.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const wordCount = report.description.split(/\s+/).filter(w => w.length > 0).length;

  return {
    total: lengthScore + detailScore + coherenceScore + sourceScore,
    lengthScore,
    detailScore,
    coherenceScore,
    sourceScore,
    breakdown: {
      wordCount,
      hasLocation: !!report.location_name || /\b(near|at|in)\s+[A-Z][a-z]+/.test(text),
      hasDate: !!report.event_date,
      hasWitnesses: /\b(witness|together|we both)\b/i.test(lowerText),
      hasTimeOfDay: /\b(morning|afternoon|evening|night|midnight|dawn|dusk|\d{1,2}:\d{2})\b/i.test(lowerText),
      hasWeather: /\b(rain|snow|fog|cloudy|clear|sunny|storm|wind)\b/i.test(lowerText),
      sentenceCount: sentences.length,
      avgSentenceLength: sentences.length > 0
        ? Math.round(sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length)
        : 0,
      sourceCredibility: report.source_type,
    }
  };
}

// ============================================================================
// MAIN FILTER FUNCTION
// ============================================================================

/**
 * Main filter function - determines if content should be ingested
 * Returns passed: true if content is acceptable, false if it should be rejected
 */
export function filterContent(
  title: string,
  description: string,
  sourceType: string,
  options?: {
    checkMeta?: boolean;
    checkFiction?: boolean;
    checkLowEffort?: boolean;
    checkSpam?: boolean;
    minLength?: number;
  }
): FilterResult {
  const opts = {
    checkMeta: true,
    checkFiction: true,
    checkLowEffort: true,
    checkSpam: true,
    minLength: 100,
    ...options
  };

  const combinedText = `${title} ${description}`;
  const lowerText = combinedText.toLowerCase();

  // Check minimum length
  if (description.length < opts.minLength) {
    return { passed: false, reason: `Content too short (${description.length} < ${opts.minLength} chars)` };
  }

  // Check for deleted/removed content
  if (description === '[removed]' || description === '[deleted]') {
    return { passed: false, reason: 'Content was deleted or removed' };
  }

  // Check meta post patterns
  if (opts.checkMeta) {
    for (const pattern of META_POST_PATTERNS) {
      if (pattern.test(combinedText)) {
        return { passed: false, reason: `Meta post pattern: ${pattern.source.substring(0, 30)}...` };
      }
    }
  }

  // Check non-experience patterns
  for (const pattern of NON_EXPERIENCE_PATTERNS) {
    if (pattern.test(combinedText)) {
      return { passed: false, reason: `Non-experience content: ${pattern.source.substring(0, 30)}...` };
    }
  }

  // Check fiction patterns
  if (opts.checkFiction) {
    for (const pattern of FICTION_PATTERNS) {
      if (pattern.test(combinedText)) {
        return { passed: false, reason: `Fiction marker: ${pattern.source.substring(0, 30)}...` };
      }
    }
  }

  // Check low effort patterns (only for title or very short content)
  if (opts.checkLowEffort && description.length < 200) {
    for (const pattern of LOW_EFFORT_PATTERNS) {
      if (pattern.test(title)) {
        return { passed: false, reason: `Low effort content: ${pattern.source.substring(0, 30)}...` };
      }
    }
  }

  // Check spam URLs
  if (opts.checkSpam) {
    for (const pattern of SPAM_URL_PATTERNS) {
      if (pattern.test(description)) {
        return { passed: false, reason: `Spam URL detected` };
      }
    }
  }

  return { passed: true };
}

/**
 * Full quality assessment - filters and scores content
 * Returns filter result with quality score if passed
 */
export function assessQuality(
  report: ScrapedReport,
  metadata?: Record<string, any>
): FilterResult & { qualityScore?: QualityScore } {
  // First run content filter
  const filterResult = filterContent(
    report.title,
    report.description,
    report.source_type
  );

  if (!filterResult.passed) {
    return filterResult;
  }

  // Calculate quality score
  const qualityScore = calculateQualityScore(report, metadata);

  return {
    passed: true,
    qualityScore
  };
}

/**
 * Determine the status based on quality score
 */
export function getStatusFromScore(score: number): 'approved' | 'pending_review' | 'rejected' {
  if (score >= 70) return 'approved';
  if (score >= 40) return 'pending_review';
  return 'rejected';
}

/**
 * Quick check if content is obviously low quality (for early rejection)
 */
export function isObviouslyLowQuality(title: string, description: string): boolean {
  // Very short
  if (description.length < 50) return true;

  // All caps
  if (title === title.toUpperCase() && title.length > 10) return true;

  // Mostly punctuation or special characters
  const alphanumeric = description.replace(/[^a-zA-Z0-9]/g, '');
  if (alphanumeric.length < description.length * 0.5) return true;

  // Repetitive content
  if (/(.{10,})\1{2,}/.test(description)) return true;

  return false;
}
