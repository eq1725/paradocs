// Title Improvement Engine
// Detects problematic titles and generates improved versions

// Category-specific phenomenon descriptors
const PHENOMENON_DESCRIPTORS: Record<string, string[]> = {
  'ufos_aliens': ['UFO', 'UAP', 'Unidentified Object', 'Strange Lights', 'Craft', 'Aerial Phenomenon'],
  'ghosts_hauntings': ['Apparition', 'Spirit', 'Haunting', 'Paranormal Activity', 'Shadow Figure', 'Presence'],
  'cryptids': ['Creature', 'Cryptid', 'Unknown Animal', 'Bipedal Figure', 'Large Animal'],
  'psychological_experiences': ['Strange Experience', 'Unexplained Event', 'Reality Glitch', 'Time Anomaly'],
  'consciousness_practices': ['Out-of-Body Experience', 'Astral Experience', 'Lucid Dream', 'Consciousness Event'],
  'psychic_phenomena': ['Psychic Experience', 'Precognition', 'Telepathic Event', 'Intuitive Experience'],
  'combination': ['Paranormal Experience', 'Strange Encounter', 'Unexplained Event'],
};

// Generic titles that should be improved
const GENERIC_TITLE_PATTERNS = [
  /^(ufo|ghost|bigfoot|creature|spirit|entity)\s*(sighting|encounter|experience)?$/i,
  /^(my|a|the)\s*(strange|weird|creepy|scary)\s*(experience|story|encounter)$/i,
  /^(true|real)\s*(story|experience|encounter)$/i,
  /^what\s+(happened|i saw|i experienced)/i,
  /^something\s+(strange|weird|happened)/i,
  /^i\s+(saw|heard|experienced|encountered)\s+(something|it)/i,
  /^\d{4}[-\/]\d{2}[-\/]\d{2}$/,  // Just a date
  /^report\s*#?\d+$/i,  // Just a report number
  /^(unknown|untitled|no title)/i,
];

// Title quality issues
interface TitleIssue {
  type: 'too_short' | 'too_long' | 'all_caps' | 'no_caps' | 'generic' | 'date_only' | 'location_only' | 'question';
  description: string;
}

/**
 * Analyze a title for quality issues
 */
export function analyzeTitleQuality(title: string): TitleIssue[] {
  const issues: TitleIssue[] = [];

  // Check length
  if (title.length < 15) {
    issues.push({ type: 'too_short', description: 'Title is too short to be descriptive' });
  }
  if (title.length > 100) {
    issues.push({ type: 'too_long', description: 'Title is too long' });
  }

  // Check capitalization
  if (title === title.toUpperCase() && title.length > 10) {
    issues.push({ type: 'all_caps', description: 'Title is in all caps' });
  }
  if (title === title.toLowerCase() && title.length > 10) {
    issues.push({ type: 'no_caps', description: 'Title has no capitalization' });
  }

  // Check for generic patterns
  for (const pattern of GENERIC_TITLE_PATTERNS) {
    if (pattern.test(title.trim())) {
      issues.push({ type: 'generic', description: 'Title is too generic' });
      break;
    }
  }

  // Check if it's just a date
  if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(title.trim())) {
    issues.push({ type: 'date_only', description: 'Title is just a date' });
  }

  // Check if it's just a location
  if (/^[A-Z][a-z]+,?\s*[A-Z]{2}$/i.test(title.trim())) {
    issues.push({ type: 'location_only', description: 'Title is just a location' });
  }

  // Check if it's a question (often not descriptive of the experience)
  if (title.trim().endsWith('?') && title.split(' ').length < 8) {
    issues.push({ type: 'question', description: 'Title is a short question' });
  }

  return issues;
}

/**
 * Extract key details from description for title generation
 */
function extractKeyDetails(description: string, category: string): {
  phenomenon?: string;
  keyFeature?: string;
  location?: string;
  timeContext?: string;
} {
  const lowerDesc = description.toLowerCase();
  const details: ReturnType<typeof extractKeyDetails> = {};

  // Extract phenomenon type based on category and content
  const phenomenonWords = PHENOMENON_DESCRIPTORS[category] || PHENOMENON_DESCRIPTORS['combination'];

  // Look for specific descriptors in the text
  if (category === 'cryptids' || category === 'bigfoot') {
    if (/\b(tall|large|massive|huge)\b/.test(lowerDesc) && /\b(figure|creature|being)\b/.test(lowerDesc)) {
      details.phenomenon = 'Large Bipedal Creature';
    } else if (/\b(hairy|furry|ape-like)\b/.test(lowerDesc)) {
      details.phenomenon = 'Hairy Humanoid';
    } else if (/\b(howl|scream|call)\b/.test(lowerDesc)) {
      details.phenomenon = 'Unknown Creature';
    } else {
      details.phenomenon = phenomenonWords[0];
    }
  } else if (category === 'ufos_aliens') {
    if (/\b(triangle|triangular)\b/.test(lowerDesc)) {
      details.phenomenon = 'Triangular Craft';
    } else if (/\b(disc|saucer)\b/.test(lowerDesc)) {
      details.phenomenon = 'Disc-Shaped Object';
    } else if (/\b(orb|sphere|ball of light)\b/.test(lowerDesc)) {
      details.phenomenon = 'Luminous Orb';
    } else if (/\b(lights?|glow)\b/.test(lowerDesc)) {
      details.phenomenon = 'Strange Lights';
    } else {
      details.phenomenon = 'Unidentified Aerial Object';
    }
  } else if (category === 'ghosts_hauntings') {
    if (/\b(shadow|dark figure|black figure)\b/.test(lowerDesc)) {
      details.phenomenon = 'Shadow Figure';
    } else if (/\b(apparition|transparent|see-through)\b/.test(lowerDesc)) {
      details.phenomenon = 'Apparition';
    } else if (/\b(voice|whisper|heard)\b/.test(lowerDesc)) {
      details.phenomenon = 'Disembodied Voice';
    } else if (/\b(poltergeist|moved|thrown)\b/.test(lowerDesc)) {
      details.phenomenon = 'Poltergeist Activity';
    } else {
      details.phenomenon = 'Paranormal Encounter';
    }
  } else {
    details.phenomenon = phenomenonWords[0];
  }

  // Extract key feature (notable aspect of the experience)
  const featurePatterns = [
    { pattern: /\b(chased|followed|pursued)\b/i, feature: 'Pursuit' },
    { pattern: /\b(missing time|lost time)\b/i, feature: 'Missing Time' },
    { pattern: /\b(paralyzed|couldn\'t move)\b/i, feature: 'Paralysis' },
    { pattern: /\b(multiple witnesses|we all saw)\b/i, feature: 'Multiple Witnesses' },
    { pattern: /\b(physical evidence|footprints?|marks?)\b/i, feature: 'Physical Evidence' },
    { pattern: /\b(photograph|photo|video|recorded)\b/i, feature: 'Documented' },
    { pattern: /\b(recurring|happened again|multiple times)\b/i, feature: 'Recurring' },
    { pattern: /\b(childhood|as a (kid|child)|when I was young)\b/i, feature: 'Childhood' },
  ];

  for (const { pattern, feature } of featurePatterns) {
    if (pattern.test(description)) {
      details.keyFeature = feature;
      break;
    }
  }

  // Extract location
  const locationMatch = description.match(
    /(?:in|at|near|outside)\s+([A-Z][a-z]+(?:,?\s+[A-Z]{2})?(?:,?\s+(?:USA|US|UK|Canada))?)/
  );
  if (locationMatch) {
    details.location = locationMatch[1].trim();
  }

  // Extract time context
  const timeMatch = description.match(
    /\b(in the (?:early )?(?:morning|afternoon|evening)|at night|around midnight|at dawn|at dusk|late at night)\b/i
  );
  if (timeMatch) {
    details.timeContext = timeMatch[1];
  }

  return details;
}

/**
 * Generate an improved title from description and metadata
 */
export function generateImprovedTitle(
  originalTitle: string,
  description: string,
  category: string,
  location?: string
): string {
  const details = extractKeyDetails(description, category);

  // Build title components
  const components: string[] = [];

  // Add phenomenon
  if (details.phenomenon) {
    components.push(details.phenomenon);
  }

  // Add key feature if present
  if (details.keyFeature) {
    components.push(details.keyFeature);
  }

  // Add location
  const locationStr = location || details.location;
  if (locationStr && locationStr.length < 30) {
    components.push(locationStr);
  }

  // Add time context if no other modifiers
  if (components.length < 2 && details.timeContext) {
    components.push(details.timeContext);
  }

  // Construct title
  let newTitle: string;
  if (components.length >= 3) {
    // Full format: "Phenomenon Key Feature - Location"
    newTitle = `${components[0]} ${components[1]} - ${components[2]}`;
  } else if (components.length === 2) {
    // Medium format: "Phenomenon - Location" or "Phenomenon Key Feature"
    if (components[1] === locationStr) {
      newTitle = `${components[0]} - ${components[1]}`;
    } else {
      newTitle = `${components[0]} ${components[1]}`;
    }
  } else if (components.length === 1) {
    // Minimal format: Just phenomenon, try to add context from first sentence
    const firstSentence = description.match(/^[^.!?]+[.!?]/);
    if (firstSentence && firstSentence[0].length < 80) {
      newTitle = firstSentence[0].replace(/[.!?]$/, '');
    } else {
      newTitle = components[0];
    }
  } else {
    // Fallback: Use first sentence or truncated description
    const firstSentence = description.match(/^[^.!?]+[.!?]/);
    if (firstSentence && firstSentence[0].length < 80) {
      newTitle = firstSentence[0].replace(/[.!?]$/, '');
    } else {
      newTitle = description.substring(0, 60) + '...';
    }
  }

  // Ensure proper capitalization
  newTitle = newTitle
    .split(' ')
    .map((word, i) => {
      // Don't capitalize small words unless first
      const smallWords = ['a', 'an', 'the', 'in', 'on', 'at', 'by', 'for', 'of', 'to'];
      if (i > 0 && smallWords.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  // Truncate if too long
  if (newTitle.length > 100) {
    newTitle = newTitle.substring(0, 97) + '...';
  }

  return newTitle;
}

/**
 * Main function: Improve a title if needed
 * Returns the improved title and whether it was changed
 */
export function improveTitle(
  originalTitle: string,
  description: string,
  category: string,
  location?: string
): { title: string; wasImproved: boolean; originalTitle?: string } {
  const issues = analyzeTitleQuality(originalTitle);

  // If no issues, keep original
  if (issues.length === 0) {
    return { title: originalTitle, wasImproved: false };
  }

  // Generate improved title
  const improvedTitle = generateImprovedTitle(originalTitle, description, category, location);

  // Only use improved title if it's actually better
  const improvedIssues = analyzeTitleQuality(improvedTitle);
  if (improvedIssues.length < issues.length || improvedTitle.length > originalTitle.length + 10) {
    return {
      title: improvedTitle,
      wasImproved: true,
      originalTitle
    };
  }

  // Keep original if improvement isn't significantly better
  return { title: originalTitle, wasImproved: false };
}

/**
 * Fix basic title issues without full regeneration
 */
export function fixBasicTitleIssues(title: string): string {
  let fixed = title;

  // Fix all caps
  if (title === title.toUpperCase() && title.length > 3) {
    fixed = title.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  // Fix no caps
  if (title === title.toLowerCase() && title.length > 3) {
    fixed = title.replace(/\b\w/g, c => c.toUpperCase());
  }

  // Remove excessive punctuation
  fixed = fixed.replace(/[!?]{2,}/g, '!');
  fixed = fixed.replace(/\.{3,}/g, '...');

  // Trim and clean whitespace
  fixed = fixed.replace(/\s+/g, ' ').trim();

  return fixed;
}
