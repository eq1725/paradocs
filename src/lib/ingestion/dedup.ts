// Fuzzy Deduplication Engine
// Identifies duplicate or near-duplicate reports using title, location, and date similarity
// Operates both during ingestion (real-time) and as a batch process on existing reports

// ============================================================================
// TYPES
// ============================================================================

export interface DedupCandidate {
  id: string;
  title: string;
  location_name: string | null;
  city: string | null;
  state_province: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  event_date: string | null;
  source_type: string | null;
  original_report_id: string | null;
  description?: string;
  created_at?: string;
}

export interface DedupMatch {
  reportA: string;  // id
  reportB: string;  // id
  titleSimilarity: number;      // 0-1
  locationSimilarity: number;   // 0-1
  dateSimilarity: number;       // 0-1
  contentSimilarity: number;    // 0-1
  overallScore: number;         // 0-1 weighted composite
  confidence: 'definite' | 'likely' | 'possible';
  details: string;
}

export interface DedupResult {
  totalCompared: number;
  duplicatesFound: number;
  matches: DedupMatch[];
  duration: number;
}

// ============================================================================
// STRINE SIMILARITY â€” Levenshtein-based with normalization
// ============================================================================

/**
 * Calculate normalized Levenshtein similarity between two strings.
 * Returns 0-1 where 1 is identical.
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1 === s2) return 1;

  const len1 = s1.length;
  const len2 = s2.length;

  // For very different lengths, skip expensive computation
  if (Math.abs(len1 - len2) > Math.max(len1, len2) * 0.5) return 0;

  // Optimized Levenshtein with single-row DP
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1;

  // Cap at 200 chars for performance
  const capped1 = s1.substring(0, 200);
  const capped2 = s2.substring(0, 200);
  const n = capped1.length;
  const m = capped2.length;

  let prev = new Array(m + 1);
  let curr = new Array(m + 1);

  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      if (capped1[i - 1] === capped2[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }

  const distance = prev[m];
  return 1 - (distance / Math.max(n, m));
}

/**
 * Token-based Jaccard similarity.
 * Better for catching reworded titles ("UFO over Denver" vs "Denver UFO sighting").
 */
function tokenSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const stopWords = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'but',
    'is', 'was', 'were', 'are', 'be', 'been', 'being',
    'my', 'i', 'me', 'we', 'our', 'you', 'your',
    'this', 'that', 'these', 'those', 'it', 'its',
    'with', 'from', 'for', 'by', 'about', 'into',
    'just', 'very', 'really', 'so', 'had', 'have', 'has',
    'report', 'sighting', 'encounter', 'experience', 'witnessed',
  ]);

  const tokenize = (s: string): Set<string> => {
    const tokens = s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 2 && !stopWords.has(t));
    return new Set(tokens);
  };

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  const tokensAArr = Array.from(tokensA);
  for (let i = 0; i < tokensAArr.length; i++) {
    if (tokensB.has(tokensAArr[i])) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Combined title similarity using both Levenshtein and token-based approaches.
 * Takes the higher of the two since they catch different types of similarity.
 */
export function titleSimilarity(a: string, b: string): number {
  const lev = levenshteinSimilarity(a, b);
  const tok = tokenSimilarity(a, b);
  return Math.max(lev, tok);
}

// ============================================================================
// LOCATION SIMILARITY
// ============================================================================

/**
 * Haversine distance between two GPS coordinates in km.
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Location similarity score (0-1).
 * Uses GPS coordinates when available, falls back to string matching on location fields.
 */
export function locationSimilarity(a: DedupCandidate, b: DedupCandidate): number {
  // Both have coordinates
  if (a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null) {
    const distKm = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    // Within 1km = 1.0, within 10km = 0.8, within 50km = 0.5, within 200km = 0.2
    if (distKm <= 1) return 1.0;
    if (distKm <= 10) return 0.8;
    if (distKm <= 50) return 0.5;
    if (distKm <= 200) return 0.2;
    return 0;
  }

  // Fall back to string matching
  let score = 0;
  let comparisons = 0;

  // Same country
  if (a.country && b.country) {
    comparisons++;
    if (a.country.toLowerCase() === b.country.toLowerCase()) score += 0.2;
  }

  // Same state/province
  if (a.state_province && b.state_province) {
    comparisons++;
    if (a.state_province.toLowerCase() === b.state_province.toLowerCase()) score += 0.3;
  }

  // Same city
  if (a.city && b.city) {
    comparisons++;
    const citySim = levenshteinSimilarity(a.city, b.city);
    score += citySim * 0.3;
  }

  // Location name similarity
  if (a.location_name && b.location_name) {
    comparisons++;
    const locSim = levenshteinSimilarity(a.location_name, b.location_name);
    score += locSim * 0.2;
  }

  if (comparisons === 0) return 0;
  return Math.min(score, 1);
}

// ============================================================================
// DATE SIMILARITY
// ============================================================================

/**
 * Date similarity score (0-1).
 * Same day = 1.0, within a week = 0.8, within a month = 0.5, within a year = 0.2
 */
export function dateSimilarity(dateA: string | null, dateB: string | null): number {
  if (!dateA || !dateB) return 0;

  try {
    const a = new Date(dateA);
    const b = new Date(dateB);

    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;

    const diffMs = Math.abs(a.getTime() - b.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays <= 1) return 1.0;
    if (diffDays <= 7) return 0.8;
    if (diffDays <= 30) return 0.5;
    if (diffDays <= 365) return 0.2;
    return 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// CONTENT SIMILARITY (lightweight â€” compares description fingerprints)
// ============================================================================

/**
 * Generate a fingerprint of the description for fast similarity comparison.
 * Uses shingling (n-gram sets) for fuzzy content matching.
 */
function generateShingles(text: string, shingleSize: number = 3): Set<string> {
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const words = normalized.split(' ');
  const shingles = new Set<string>();

  for (let i = 0; i <= words.length - shingleSize; i++) {
    shingles.add(words.slice(i, i + shingleSize).join(' '));
  }

  return shingles;
}

/**
 * Content similarity using shingled Jaccard.
 * More robust than raw string comparison for detecting rewrites.
 */
export function contentSimilarity(descA: string, descB: string): number {
  if (!descA || !descB) return 0;

  // For very short texts, fall back to token similarity
  if (descA.length < 100 || descB.length < 100) {
    return tokenSimilarity(descA, descB);
  }

  const shinglesA = generateShingles(descA);
  const shinglesB = generateShingles(descB);

  if (shinglesA.size === 0 || shinglesB.size === 0) return 0;

  let intersection = 0;
  const shinglesAArr = Array.from(shinglesA);
  for (let i = 0; i < shinglesAArr.length; i++) {
    if (shinglesB.has(shinglesAArr[i])) intersection++;
  }

  const union = shinglesA.size + shinglesB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ============================================================================
// COMPOSITE DUPLICATE DETECTION
// ============================================================================

const WEIGHTS = {
  title: 0.30,
  location: 0.25,
  date: 0.20,
  content: 0.25,
};

/**
 * Compare two candidates and return a match if they appear to be duplicates.
 * Returns null if they're not similar enough.
 */
export function compareCandidates(a: DedupCandidate, b: DedupCandidate): DedupMatch | null {
  // Skip if same exact report
  if (a.id === b.id) return null;

  // Skip if same source + same original_report_id (already handled by unique constraint)
  if (a.source_type === b.source_type &&
      a.original_report_id && b.original_report_id &&
      a.original_report_id === b.original_report_id) {
    return null;
  }

  const tSim = titleSimilarity(a.title, b.title);
  const lSim = locationSimilarity(a, b);
  const dSim = dateSimilarity(a.event_date, b.event_date);

  // Quick rejection: if title AND location are both low, skip expensive content comparison
  if (tSim < 0.3 && lSim < 0.3) return null;

  // Content comparison (only if other signals are promising)
  const cSim = (a.description && b.description)
    ? contentSimilarity(a.description, b.description)
    : 0;

  const overall = (
    tSim * WEIGHTS.title +
    lSim * WEIGHTS.location +
    dSim * WEIGHTS.date +
    cSim * WEIGHTS.content
  );

  // Threshold: 0.5 minimum to be considered a possible duplicate
  if (overall < 0.45) return null;

  // Confidence levels
  let confidence: DedupMatch['confidence'];
  if (overall >= 0.85) confidence = 'definite';
  else if (overall >= 0.65) confidence = 'likely';
  else confidence = 'possible';

  // Build details string
  const parts: string[] = [];
  if (tSim >= 0.7) parts.push('similar titles (' + Math.round(tSim * 100) + '%)');
  if (lSim >= 0.5) parts.push('same area (' + Math.round(lSim * 100) + '%)');
  if (dSim >= 0.5) parts.push('similar dates (' + Math.round(dSim * 100) + '%)');
  if (cSim >= 0.4) parts.push('similar content (' + Math.round(cSim * 100) + '%)');

  return {
    reportA: a.id,
    reportB: b.id,
    titleSimilarity: Math.round(tSim * 100) / 100,
    locationSimilarity: Math.round(lSim * 100) / 100,
    dateSimilarity: Math.round(dSim * 100) / 100,
    contentSimilarity: Math.round(cSim * 100) / 100,
    overallScore: Math.round(overall * 100) / 100,
    confidence,
    details: parts.join('; ') || 'moderate cross-signal similarity',
  };
}

// ============================================================================
// BATCH DEDUP â€” scan existing reports for duplicates
// ============================================================================

/**
 * Find duplicates within a set of candidates.
 * Uses blocking by location bucket to avoid O(n^2) full comparison.
 *
 * Blocking strategy:
 * 1. Group by state_province (or country if no state)
 * 2. Within each block, compare all pairs
 * 3. Also compare across blocks for reports with no location
 */
export function findDuplicates(candidates: DedupCandidate[]): DedupResult {
  const startTime = Date.now();
  const matches: DedupMatch[] = [];
  let totalCompared = 0;

  // Build location blocks
  const blocks = new Map<string, DedupCandidate[]>();
  const noLocation: DedupCandidate[] = [];

  for (const c of candidates) {
    const key = (c.state_province || c.country || '').toLowerCase().trim();
    if (key) {
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key)!.push(c);
    } else {
      noLocation.push(c);
    }
  }

  // Compare within each block
  const blockEntries = Array.from(blocks.entries());
  for (let bi = 0; bi < blockEntries.length; bi++) {
    const [_key, block] = blockEntries[bi];
    for (let i = 0; i < block.mÑ‹›[™ÝÈJHÂˆ›Üˆ
]ˆHH
ÈNÈˆ›ØÚË›[™ÝÈŠÊÊHÂˆÝ[ÛÛ\\™Y
ÊÎÂˆÛÛœÝX]ÚHÛÛ\\™PØ[™Y]\Ê›ØÚÖÚWK›ØÚÖÚ—JNÂˆYˆ
X]Ú
HX]Ú\Ëœ\Ú
X]Ú
NÂˆBˆB‚ˆËÈÛÛ\\™H›Ë[ØØ][Ûˆ™\ÜÈYØZ[œÝ\È›ØÚÂˆ›Üˆ
ÛÛœÝ›ÓØÈÙˆ›ÓØØ][ÛŠHÂˆ›Üˆ
ÛÛœÝ›ØÚÔ™\ÜÙˆ›ØÚÊHÂˆÝ[ÛÛ\\™Y
ÊÎÂˆÛÛœÝX]ÚHÛÛ\\™PØ[™Y]\Ê›ÓØË›ØÚÔ™\Ü
NÂˆYˆ
X]Ú
HX]Ú\Ëœ\Ú
X]Ú
NÂˆBˆBˆB‚ˆËÈÛÛ\\™H›Ë[ØØ][Ûˆ™\ÜÈYØZ[œÝXXÚÝ\‚ˆ›Üˆ
]HHÈH›ÓØØ][Û‹›[™ÝÈJÊÊHÂˆ›Üˆ
]ˆHH
ÈNÈˆ›ÓØØ][Û‹›[™ÝÈŠÊÊHÂˆÝ[ÛÛ\\™Y
ÊÎÂˆÛÛœÝX]ÚHÛÛ\\™PØ[™Y]\Ê›ÓØØ][Û–ÚWK›ÓØØ][Û–Ú—JNÂˆYˆ
X]Ú
HX]Ú\Ëœ\Ú
X]Ú
NÂˆBˆB‚ˆËÈÛÜžHÛÛ™šY[˜ÙH
YÚ\Ýš\œÝ
BˆX]Ú\ËœÛÜ

KŠHOˆ‹›Ý™\˜[ØÛÜ™HHK›Ý™\˜[ØÛÜ™JNÂ‚ˆ™]\›ˆÂˆÝ[ÛÛ\\™Yˆ\XØ]\Ñ›Ý[™ˆX]Ú\Ë›[™ÝˆX]Ú\Ëˆ\˜][ÛŽˆ]K››ÝÊ
HHÝ\[YKˆNÂŸB‚‹ÊŠ‚ˆ
ˆÚXÚÈHÚ[™ÛH[˜ÛÛZ[™È™\ÜYØZ[œÝ^\Ý[™ÈØ[™Y]\Ë‚ˆ
ˆ\ÙY\š[™È[™Ù\Ý[ÛˆÈ™]™[[œÙ\[™È\XØ]\Ë‚ˆ
‹Â™^Ü[˜Ý[ÛˆÚXÚÑ›Ü‘\XØ]Jˆ[˜ÛÛZ[™ÎˆY\Ø[™Y]Kˆ^\Ý[™ÎˆY\Ø[™Y]V×BŠNˆY\X]Ú[Âˆ]™\ÝX]ÚˆY\X]Ú[H[Â‚ˆ›Üˆ
ÛÛœÝØ[™Y]HÙˆ^\Ý[™ÊHÂˆÛÛœÝX]ÚHÛÛ\\™PØ[™Y]\Ê[˜ÛÛZ[™ËØ[™Y]JNÂˆYˆ
X]Ú	‰ˆ
X™\ÝX]ÚX]Ú›Ý™\˜[ØÛÜ™Hˆ™\ÝX]Ú›Ý™\˜[ØÛÜ™JJHÂˆ™\ÝX]ÚHX]ÚÂˆBˆB‚ˆ™]\›ˆ™\ÝX]ÚÂŸB‚‹ËÈOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOB‹ËÈÓÓ•S•’P¡$ÅEUŽ%NUì
 * Generate a compact fingerprint for a report.
 * Two reports with the same fingerprint are definitely duplicates.
  
/ÂŠ?/ Used as a fast pre-check before running full fuzzy comparison.
  
/ÂŠ? generateFingerprint(title: string, eventDate: string | null, location: string | null): string {
  const normalizedTitle = title.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 40);

  const normalizedDate = eventDate
    ? eventDate.substring(0, 10)  // YYYY-MM-DD
    : 'nodate';

  const normalizedLocation = (location || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 20);

  return `${normalizedTitle}|${normalizedDate}|${normalizedLocation}`;
}
