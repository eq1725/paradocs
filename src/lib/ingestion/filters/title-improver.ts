// Title Improvement Engine
// Detects problematic titles and generates improved versions
// Uses hybrid approach: Key Feature + Location + Date fallback

// Detailed phenomenon patterns for key feature extraction
const PHENOMENON_PATTERNS: Record<string, Array<{ pattern: RegExp; title: string; priority: number }>> = {
  'ghosts_hauntings': [
    // Shadow figures
    { pattern: /\b(shadow\s*(figure|person|man|people)|dark\s*figure|black\s*(figure|mass|shape))\b/i, title: 'Shadow Figure Encounter', priority: 10 },
    { pattern: /\b(hat\s*man|man\s*in\s*(a\s*)?hat)\b/i, title: 'Hat Man Sighting', priority: 10 },
    // Apparitions
    { pattern: /\b(full[\s-]?body\s*apparition|see[\s-]?through|transparent\s*(figure|person))\b/i, title: 'Full-Body Apparition', priority: 10 },
    { pattern: /\b(apparition|ghost\s*(of|appeared)|spirit\s*appeared)\b/i, title: 'Ghostly Apparition', priority: 8 },
    { pattern: /\b(white\s*(figure|lady|woman)|lady\s*in\s*white)\b/i, title: 'White Lady Apparition', priority: 10 },
    // Specific haunting types
    { pattern: /\b(poltergeist|objects?\s*(moved?|flying|thrown)|things?\s*(moved?|flying))\b/i, title: 'Poltergeist Activity', priority: 10 },
    { pattern: /\b(evp|electronic\s*voice|voice\s*recording)\b/i, title: 'EVP Recording', priority: 10 },
    { pattern: /\b(cold\s*spot|sudden(ly)?\s*cold|temperature\s*drop)\b/i, title: 'Cold Spot Phenomenon', priority: 7 },
    { pattern: /\b(orb|ball\s*of\s*light|floating\s*light)\b/i, title: 'Orb Manifestation', priority: 8 },
    // Sounds
    { pattern: /\b(disembodied\s*voice|voice\s*with\s*no|heard\s*(a\s*)?(voice|whisper|someone))\b/i, title: 'Disembodied Voice', priority: 9 },
    { pattern: /\b(footsteps?|walking|pacing)\s*(upstairs|downstairs|above|in\s*the)?\b/i, title: 'Phantom Footsteps', priority: 7 },
    { pattern: /\b(knocking|banging|tapping)\s*(on|at|sound)?\b/i, title: 'Unexplained Knocking', priority: 7 },
    // Feelings/presence
    { pattern: /\b(watched|being\s*watched|eyes\s*on\s*me|someone\s*there)\b/i, title: 'Presence Felt', priority: 5 },
    { pattern: /\b(touched|grabbed|pushed|pulled)\s*(by|me|my)?\b/i, title: 'Physical Contact', priority: 8 },
    { pattern: /\b(sleep\s*paralysis|couldn\'t\s*move|paralyzed|frozen)\b/i, title: 'Sleep Paralysis Entity', priority: 9 },
    // Location types
    { pattern: /\b(haunted\s*(house|home|building|hotel|hospital))\b/i, title: 'Haunted Location', priority: 6 },
    { pattern: /\b(cemetery|graveyard|grave)\b/i, title: 'Cemetery Encounter', priority: 7 },
    // Glowing figures
    { pattern: /\b(glow(ing|ed)?\s*(figure|white|person)|figure\s*glow)\b/i, title: 'Glowing Figure', priority: 9 },
  ],
  'ufos_aliens': [
    // Craft shapes
    { pattern: /\b(triangle|triangular)\s*(craft|object|ufo|shape)?\b/i, title: 'Black Triangle UFO', priority: 10 },
    { pattern: /\b(disc|saucer|flying\s*saucer)\b/i, title: 'Disc-Shaped Craft', priority: 10 },
    { pattern: /\b(cigar[\s-]?shaped?|cylinder|cylindrical)\b/i, title: 'Cigar-Shaped Object', priority: 10 },
    { pattern: /\b(tic[\s-]?tac|pill[\s-]?shaped?|oval)\b/i, title: 'Tic-Tac UFO', priority: 10 },
    { pattern: /\b(sphere|spherical|ball)\s*(of\s*light|shaped|ufo)?\b/i, title: 'Spherical Object', priority: 8 },
    // Light phenomena
    { pattern: /\b(orb|orbs|ball\s*of\s*light|light\s*ball)\b/i, title: 'Luminous Orb', priority: 8 },
    { pattern: /\b(flash|flashing|pulsing|pulsating)\s*(light|object)?\b/i, title: 'Pulsating Lights', priority: 7 },
    { pattern: /\b(beam\s*of\s*light|light\s*beam|searchlight)\b/i, title: 'Light Beam Phenomenon', priority: 9 },
    { pattern: /\b(formation|multiple\s*(lights|objects|ufos))\b/i, title: 'UFO Formation', priority: 9 },
    // Encounters
    { pattern: /\b(abduct|taken|aboard|inside\s*(the|a)\s*(craft|ship))\b/i, title: 'Abduction Experience', priority: 10 },
    { pattern: /\b(alien|grey|gray|being|entity|creature)\s*(encounter|contact|saw)?\b/i, title: 'Entity Encounter', priority: 9 },
    { pattern: /\b(close\s*encounter|landed|landing)\b/i, title: 'Close Encounter', priority: 9 },
    { pattern: /\b(missing\s*time|lost\s*time|time\s*loss)\b/i, title: 'Missing Time Event', priority: 10 },
    // Behavior
    { pattern: /\b(hover|hovering|stationary)\b/i, title: 'Hovering Object', priority: 6 },
    { pattern: /\b(zigzag|erratic|impossible\s*(movement|maneuver))\b/i, title: 'Erratic Movement UFO', priority: 8 },
    { pattern: /\b(silent|no\s*sound|soundless)\b/i, title: 'Silent Craft', priority: 6 },
  ],
  'cryptids': [
    // Bigfoot types
    { pattern: /\b(bigfoot|sasquatch|squatch)\b/i, title: 'Bigfoot Encounter', priority: 10 },
    { pattern: /\b(yeti|abominable)\b/i, title: 'Yeti Sighting', priority: 10 },
    { pattern: /\b(yowie)\b/i, title: 'Yowie Sighting', priority: 10 },
    { pattern: /\b(skunk\s*ape)\b/i, title: 'Skunk Ape Sighting', priority: 10 },
    // Other cryptids
    { pattern: /\b(dogman|dog[\s-]?man|werewolf|wolf[\s-]?man)\b/i, title: 'Dogman Encounter', priority: 10 },
    { pattern: /\b(skinwalker|skin[\s-]?walker)\b/i, title: 'Skinwalker Encounter', priority: 10 },
    { pattern: /\b(wendigo)\b/i, title: 'Wendigo Encounter', priority: 10 },
    { pattern: /\b(mothman|moth[\s-]?man)\b/i, title: 'Mothman Sighting', priority: 10 },
    { pattern: /\b(thunderbird|giant\s*bird)\b/i, title: 'Thunderbird Sighting', priority: 10 },
    { pattern: /\b(chupacabra)\b/i, title: 'Chupacabra Sighting', priority: 10 },
    { pattern: /\b(crawler|pale\s*crawler)\b/i, title: 'Crawler Sighting', priority: 10 },
    { pattern: /\b(rake|the\s*rake)\b/i, title: 'The Rake Encounter', priority: 10 },
    // Generic creature descriptions
    { pattern: /\b(bipedal|two[\s-]?leg(ged)?|upright)\s*(creature|figure|animal)?\b/i, title: 'Bipedal Creature', priority: 7 },
    { pattern: /\b(hairy|furry|hair[\s-]?covered)\s*(creature|figure|man|being)?\b/i, title: 'Hairy Humanoid', priority: 8 },
    { pattern: /\b(glowing|red|yellow)\s*eyes?\b/i, title: 'Red-Eyed Creature', priority: 8 },
    { pattern: /\b(giant|huge|massive|enormous)\s*(creature|animal|figure)?\b/i, title: 'Giant Creature', priority: 7 },
    // Evidence
    { pattern: /\b(footprint|track|print)\b/i, title: 'Cryptid Tracks Found', priority: 8 },
    { pattern: /\b(howl|scream|vocalization|call|roar)\b/i, title: 'Unknown Vocalization', priority: 7 },
    { pattern: /\b(tree[\s-]?knock|wood[\s-]?knock)\b/i, title: 'Wood Knock Heard', priority: 8 },
  ],
  'psychological_experiences': [
    { pattern: /\b(glitch\s*(in|the)?\s*(matrix|reality)|reality\s*glitch)\b/i, title: 'Glitch in the Matrix', priority: 10 },
    { pattern: /\b(doppelganger|double|duplicate\s*(of\s*)?(me|myself))\b/i, title: 'Doppelganger Encounter', priority: 10 },
    { pattern: /\b(mandela\s*effect|false\s*memory|remember\s*differently)\b/i, title: 'Mandela Effect', priority: 10 },
    { pattern: /\b(time\s*slip|slipped?\s*(through|in)\s*time)\b/i, title: 'Time Slip Experience', priority: 10 },
    { pattern: /\b(deja\s*vu|already\s*happened)\b/i, title: 'Déjà Vu Experience', priority: 7 },
    { pattern: /\b(vanish|disappear|gone\s*missing|ceased\s*to\s*exist)\b/i, title: 'Vanishing Object', priority: 8 },
    { pattern: /\b(alternate\s*(reality|timeline|dimension)|parallel)\b/i, title: 'Alternate Reality', priority: 9 },
  ],
  'consciousness_practices': [
    { pattern: /\b(out[\s-]?of[\s-]?body|obe|astral\s*project)\b/i, title: 'Out-of-Body Experience', priority: 10 },
    { pattern: /\b(near[\s-]?death|nde|died\s*and\s*(came|returned))\b/i, title: 'Near-Death Experience', priority: 10 },
    { pattern: /\b(lucid\s*dream|aware\s*(in|during)\s*(the\s*)?dream)\b/i, title: 'Lucid Dream', priority: 9 },
    { pattern: /\b(astral\s*(travel|plane|realm))\b/i, title: 'Astral Travel', priority: 9 },
    { pattern: /\b(meditation|meditat(ed|ing))\b/i, title: 'Meditation Vision', priority: 6 },
  ],
  'psychic_phenomena': [
    { pattern: /\b(precognit|premonition|foresaw|foresee|knew.*before)\b/i, title: 'Precognitive Experience', priority: 10 },
    { pattern: /\b(telepath|read\s*(my|their)\s*(mind|thought)|mind\s*read)\b/i, title: 'Telepathic Experience', priority: 10 },
    { pattern: /\b(remote\s*view|saw\s*(something|somewhere)\s*far)\b/i, title: 'Remote Viewing', priority: 10 },
    { pattern: /\b(psychic\s*dream|dream(ed|t)?\s*(about|of).*came\s*true)\b/i, title: 'Prophetic Dream', priority: 9 },
    { pattern: /\b(empath|felt\s*(their|others)\s*(emotions?|feelings?))\b/i, title: 'Empathic Experience', priority: 8 },
  ],
};

// Fallback descriptors when no specific pattern matches
const FALLBACK_DESCRIPTORS: Record<string, string> = {
  'ufos_aliens': 'UFO Sighting',
  'ghosts_hauntings': 'Paranormal Experience',
  'cryptids': 'Creature Sighting',
  'psychological_experiences': 'Strange Experience',
  'consciousness_practices': 'Consciousness Experience',
  'psychic_phenomena': 'Psychic Experience',
  'combination': 'Unexplained Event',
  'biological_factors': 'Biological Anomaly',
  'perception_sensory': 'Sensory Experience',
  'religion_mythology': 'Spiritual Experience',
  'esoteric_practices': 'Esoteric Experience',
  'multi_disciplinary': 'Multi-Faceted Experience',
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
 * Extract phenomenon type from description using detailed patterns
 */
function extractPhenomenon(description: string, category: string): string {
  const patterns = PHENOMENON_PATTERNS[category];

  if (patterns) {
    // Sort by priority (highest first) and find first match
    const sortedPatterns = [...patterns].sort((a, b) => b.priority - a.priority);

    for (const { pattern, title } of sortedPatterns) {
      if (pattern.test(description)) {
        return title;
      }
    }
  }

  // Return fallback descriptor for category
  return FALLBACK_DESCRIPTORS[category] || FALLBACK_DESCRIPTORS['combination'];
}

/**
 * Extract key details from description for title generation
 */
function extractKeyDetails(description: string, category: string): {
  phenomenon: string;
  keyFeature?: string;
  location?: string;
  timeContext?: string;
} {
  const details: ReturnType<typeof extractKeyDetails> = {
    phenomenon: extractPhenomenon(description, category)
  };

  // Extract additional key features that add context
  const featurePatterns = [
    { pattern: /\b(chased|followed|pursued)\b/i, feature: 'Pursuit' },
    { pattern: /\b(multiple witnesses|we all saw|group of us|family saw)\b/i, feature: 'Multiple Witnesses' },
    { pattern: /\b(photograph|photo|video|recorded|on camera)\b/i, feature: 'Documented' },
    { pattern: /\b(recurring|happened again|multiple times|keeps happening)\b/i, feature: 'Recurring' },
    { pattern: /\b(childhood|as a (kid|child)|when I was young|grew up)\b/i, feature: 'Childhood' },
    { pattern: /\b(family home|parents.?\s*house|grandparents?)\b/i, feature: 'Family Home' },
    { pattern: /\b(camping|woods|forest|hiking|trail)\b/i, feature: 'in the Woods' },
    { pattern: /\b(highway|road|driving|car)\b/i, feature: 'on the Road' },
    { pattern: /\b(bedroom|bed|sleep|woke)\b/i, feature: 'Bedroom' },
    { pattern: /\b(workplace|work|office|job)\b/i, feature: 'at Work' },
  ];

  for (const { pattern, feature } of featurePatterns) {
    if (pattern.test(description)) {
      details.keyFeature = feature;
      break;
    }
  }

  // Extract location from text
  const locationPatterns = [
    // State abbreviations
    /(?:in|from|near)\s+([A-Z][a-z]+(?:ville|town|burg|field|port|land)?),?\s*([A-Z]{2})\b/,
    // City, State format
    /(?:in|from|near)\s+([A-Z][a-z]+),?\s+(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming)\b/i,
    // Just state
    /(?:in|from)\s+(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming)\b/i,
    // Country
    /(?:in|from)\s+(Australia|Canada|UK|England|Scotland|Ireland|Germany|France|Mexico|Brazil|Japan)\b/i,
  ];

  for (const pattern of locationPatterns) {
    const match = description.match(pattern);
    if (match) {
      // Get the most specific location found
      if (match[2]) {
        details.location = `${match[1]}, ${match[2]}`;
      } else if (match[1]) {
        details.location = match[1];
      }
      break;
    }
  }

  // Extract time context
  const timeMatch = description.match(
    /\b(in the (?:early )?(?:morning|afternoon|evening)|at night|around midnight|at dawn|at dusk|late at night|3\s*a\.?m\.?)\b/i
  );
  if (timeMatch) {
    details.timeContext = timeMatch[1];
  }

  return details;
}

/**
 * Format a date for title use
 */
function formatDateForTitle(date: Date | string | null | undefined): string | null {
  if (!date) return null;

  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return null;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return null;
  }
}

/**
 * Generate an improved title from description and metadata
 * Uses hybrid approach: Key Feature + Location + Date fallback
 */
export function generateImprovedTitle(
  originalTitle: string,
  description: string,
  category: string,
  location?: string,
  eventDate?: Date | string | null
): string {
  const details = extractKeyDetails(description, category);

  // The phenomenon is our primary descriptor (always present)
  let newTitle = details.phenomenon;

  // Add key feature if it provides meaningful context
  if (details.keyFeature) {
    // Some features integrate naturally, others need formatting
    if (['in the Woods', 'on the Road', 'at Work'].includes(details.keyFeature)) {
      newTitle = `${newTitle} ${details.keyFeature}`;
    } else if (details.keyFeature === 'Childhood' || details.keyFeature === 'Family Home') {
      newTitle = `${details.keyFeature} ${newTitle}`;
    } else if (details.keyFeature === 'Bedroom') {
      newTitle = `${newTitle} in ${details.keyFeature}`;
    } else if (details.keyFeature === 'Multiple Witnesses') {
      newTitle = `${newTitle} - ${details.keyFeature}`;
    } else if (details.keyFeature === 'Documented') {
      newTitle = `${newTitle} Caught on Camera`;
    } else if (details.keyFeature === 'Recurring') {
      newTitle = `Recurring ${newTitle}`;
    }
  }

  // Add location if available (priority 1 for uniqueness)
  const locationStr = location || details.location;
  if (locationStr && locationStr.length < 25) {
    // Clean up location string
    const cleanLocation = locationStr.replace(/,?\s*(USA|US|United States)$/i, '').trim();
    if (cleanLocation) {
      newTitle = `${newTitle} - ${cleanLocation}`;
    }
  }

  // If no location, add date for uniqueness (priority 2)
  if (!locationStr) {
    const dateStr = formatDateForTitle(eventDate);
    if (dateStr) {
      newTitle = `${newTitle} - ${dateStr}`;
    }
  }

  // Ensure proper capitalization (title case)
  newTitle = newTitle
    .split(' ')
    .map((word, i) => {
      // Don't capitalize small words unless first or after dash
      const smallWords = ['a', 'an', 'the', 'in', 'on', 'at', 'by', 'for', 'of', 'to'];
      if (i > 0 && smallWords.includes(word.toLowerCase()) && !newTitle.split(' ')[i-1]?.endsWith('-')) {
        return word.toLowerCase();
      }
      // Handle hyphenated words
      if (word.includes('-')) {
        return word.split('-').map(part =>
          part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        ).join('-');
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  // Truncate if too long
  if (newTitle.length > 80) {
    newTitle = newTitle.substring(0, 77) + '...';
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
  location?: string,
  eventDate?: Date | string | null
): { title: string; wasImproved: boolean; originalTitle?: string } {
  const issues = analyzeTitleQuality(originalTitle);

  // If no issues, keep original
  if (issues.length === 0) {
    return { title: originalTitle, wasImproved: false };
  }

  // Generate improved title
  const improvedTitle = generateImprovedTitle(originalTitle, description, category, location, eventDate);

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
 * Force generate a new title regardless of quality analysis
 * Used for backfilling when we want consistent titles
 */
export function forceGenerateTitle(
  description: string,
  category: string,
  location?: string,
  eventDate?: Date | string | null
): string {
  return generateImprovedTitle('', description, category, location, eventDate);
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

/**
 * Check if a title is a generic fallback title that needs AI enhancement
 */
export function isGenericFallbackTitle(title: string): boolean {
  const genericPatterns = [
    /^(Paranormal Experience|UFO Sighting|Creature Sighting|Strange Experience|Consciousness Experience|Psychic Experience|Unexplained Event|Biological Anomaly|Sensory Experience|Spiritual Experience|Esoteric Experience|Multi-Faceted Experience)\s*-\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i,
    /^(Paranormal Experience|UFO Sighting|Creature Sighting|Strange Experience)\s*-\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}$/i,
  ];

  return genericPatterns.some(pattern => pattern.test(title.trim()));
}

/**
 * Get the fallback descriptor for a category
 */
export function getFallbackDescriptor(category: string): string {
  return FALLBACK_DESCRIPTORS[category] || FALLBACK_DESCRIPTORS['combination'];
}

/**
 * Async version: Generate an improved title using AI for unique elements
 * This should be used for new ingestion to ensure title uniqueness
 */
export async function generateImprovedTitleWithAI(
  originalTitle: string,
  description: string,
  category: string,
  location?: string,
  eventDate?: Date | string | null
): Promise<string> {
  // First, try pattern-based extraction
  const details = extractKeyDetails(description, category);

  // Check if we got a specific phenomenon or just a fallback
  const fallbackTitle = FALLBACK_DESCRIPTORS[category] || FALLBACK_DESCRIPTORS['combination'];
  const isUsingFallback = details.phenomenon === fallbackTitle;

  // If we have a specific phenomenon match, use the regular flow
  if (!isUsingFallback) {
    return generateImprovedTitle(originalTitle, description, category, location, eventDate);
  }

  // For fallback cases, use AI to extract unique elements
  try {
    const { extractTitleElements, buildTitleSuffix } = await import('../../services/ai-title.service');

    const elements = await extractTitleElements(description);
    const aiSuffix = buildTitleSuffix(elements);

    if (aiSuffix) {
      // Use AI-extracted elements for uniqueness
      let title = `${details.phenomenon} - ${aiSuffix}`;

      // Truncate if too long
      if (title.length > 80) {
        title = title.substring(0, 77) + '...';
      }

      return title;
    }
  } catch (error) {
    console.error('[Title] AI extraction failed, using fallback:', error);
  }

  // If AI fails, fall back to regular generation
  return generateImprovedTitle(originalTitle, description, category, location, eventDate);
}

/**
 * Async version of improveTitle that uses AI for generic titles
 */
export async function improveTitleWithAI(
  originalTitle: string,
  description: string,
  category: string,
  location?: string,
  eventDate?: Date | string | null
): Promise<{ title: string; wasImproved: boolean; originalTitle?: string }> {
  const issues = analyzeTitleQuality(originalTitle);

  // If no issues, keep original
  if (issues.length === 0) {
    return { title: originalTitle, wasImproved: false };
  }

  // Generate improved title with AI
  const improvedTitle = await generateImprovedTitleWithAI(originalTitle, description, category, location, eventDate);

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
