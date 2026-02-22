// Advanced Quality Scoring Pipeline
// Evaluates each report on 10 dimensions for a comprehensive quality score
// Designed to run on both ingestion (ScrapedReport) and existing DB reports

import { ScrapedReport } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface DimensionScore {
  score: number;      // 0-10 normalized score for this dimension
  weight: number;     // How much this dimension matters (multiplier)
  weighted: number;   // score * weight
  details: string;    // Human-readable explanation
}

export interface QualityReport {
  // Overall
  totalScore: number;       // 0-100 composite score
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendedStatus: 'approved' | 'pending_review' | 'rejected';

  // 10 Individual dimensions
  dimensions: {
    evidenceStrength: DimensionScore;
    witnessCredibility: DimensionScore;
    descriptionDetail: DimensionScore;
    locationSpecificity: DimensionScore;
    temporalPrecision: DimensionScore;
    sourceReliability: DimensionScore;
    corroborationPotential: DimensionScore;
    narrativeCoherence: DimensionScore;
    contentOriginality: DimensionScore;
    dataCompleteness: DimensionScore;
  };

  // Metadata
  scoredAt: string;
  version: string;
}

// Input type that works for both scraped reports and DB rows
export interface ScoringInput {
  title: string;
  summary?: string;
  description: string;
  category?: string;
  location_name?: string | null;
  country?: string | null;
  state_province?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  event_date?: string | null;
  event_time?: string | null;
  witness_count?: number;
  has_physical_evidence?: boolean;
  has_photo_video?: boolean;
  has_official_report?: boolean;
  evidence_summary?: string | null;
  source_type?: string | null;
  credibility?: string | null;
  tags?: string[];
  metadata?: Record<string, any>;
}

const SCORER_VERSION = '2.0.0';

// ============================================================================
// DIMENSION 1: EVIDENCE STRENGTH (weight: 1.2)
// Physical evidence, photos/video, official reports
// ============================================================================

function scoreEvidenceStrength(input: ScoringInput): DimensionScore {
  let score = 0;
  const factors: string[] = [];

  // Physical evidence flag
  if (input.has_physical_evidence) {
    score += 3;
    factors.push('physical evidence claimed');
  }

  // Photo/video evidence
  if (input.has_photo_video) {
    score += 2.5;
    factors.push('photo/video evidence');
  }

  // Official report filed
  if (input.has_official_report) {
    score += 2;
    factors.push('official report filed');
  }

  // Evidence summary provided
  if (input.evidence_summary && input.evidence_summary.length > 20) {
    score += 1.5;
    factors.push('evidence summary provided');
  }

  // Description mentions evidence
  const desc = input.description.toLowerCase();
  const evidenceTerms = [
    'photograph', 'photo', 'video', 'recording', 'footage',
    'physical evidence', 'trace', 'imprint', 'mark', 'burn',
    'sample', 'radiation', 'electromagnetic', 'radar',
    'police report', 'military', 'faa', 'official'
  ];
  const evidenceMentions = evidenceTerms.filter(t => desc.includes(t)).length;
  score += Math.min(evidenceMentions * 0.5, 1);

  score = Math.min(score, 10);
  const weight = 1.2;

  return {
    score,
    weight,
    weighted: Math.round(score * weight * 10) / 10,
    details: factors.length > 0 ? factors.join('; ') : 'no evidence indicators'
  };
}

// ============================================================================
// DIMENSION 2: WITNESS CREDIBILITY (weight: 1.0)
// Multiple witnesses, named witnesses, professional backgrounds
// ============================================================================

function scoreWitnessCredibility(input: ScoringInput): DimensionScore {
  let score = 2; // Base score - someone reported something
  const factors: string[] = [];
  const desc = input.description.toLowerCase();

  // Multiple witnesses
  const witnessCount = input.witness_count || 1;
  if (witnessCount >= 5) {
    score += 3;
    factors.push(witnessCount + ' witnesses');
  } else if (witnessCount >= 3) {
    score += 2.5;
    factors.push(witnessCount + ' witnesses');
  } else if (witnessCount >= 2) {
    score += 1.5;
    factors.push('multiple witnesses');
  }

  // Named/identified witnesses in description
  if (/\b(my (wife|husband|partner|friend|brother|sister|mother|father|son|daughter|neighbor|colleague))\b/i.test(desc)) {
    score += 1;
    factors.push('named relation as witness');
  }

  // Professional/credibility markers
  const credibleTerms = [
    'pilot', 'officer', 'police', 'military', 'scientist', 'professor',
    'doctor', 'engineer', 'astronomer', 'meteorologist', 'ranger',
    'firefighter', 'security', 'air traffic'
  ];
  const credibleMatches = credibleTerms.filter(t => desc.includes(t));
  if (credibleMatches.length > 0) {
    score += 2;
    factors.push('credible witness background: ' + credibleMatches[0]);
  }

  // Willingness to be identified (not anonymous)
  if (/\b(my name is|i am [A-Z]|identified|contact me)\b/i.test(input.description)) {
    score += 1;
    factors.push('witness self-identified');
  }

  score = Math.min(score, 10);
  const weight = 1.0;

  return {
    score,
    weight,
    weighted: Math.round(score * weight * 10) / 10,
    details: factors.length > 0 ? factors.join('; ') : 'single anonymous witness'
  };
}

// ============================================================================
// DIMENSION 3: DESCRIPTION DETAIL (weight: 1.3)
// Word count, sensory details, specific measurements
// ============================================================================

function scoreDescriptionDetail(input: ScoringInput): DimensionScore {
  let score = 0;
  const factors: string[] = [];
  const desc = input.description;
  const wordCount = desc.split(/\s+/).filter(w => w.length > 0).length;

  // Word count (0-3 points)
  if (wordCount >= 500) {
    score += 3;
    factors.push(wordCount + ' words (detailed)');
  } else if (wordCount >= 200) {
    score += 2;
    factors.push(wordCount + ' words (moderate)');
  } else if (wordCount >= 100) {
    score += 1;
    factors.push(wordCount + ' words (brief)');
  } else {
    factors.push(wordCount + ' words (thin)');
  }

  // Sensory details (0-2 points)
  const sensoryPatterns = [
    /\b(saw|seen|looked|appeared|visible|bright|dark|glowing|shining|luminous|color|colou?r|red|green|blue|white|orange)\b/i,
    /\b(heard|sound|noise|silent|loud|humming|buzzing|roaring|whisper|screech|bang|crack)\b/i,
    /\b(felt|feeling|sensation|cold|hot|warm|tingling|pressure|vibrat|electric|numb)\b/i,
    /\b(smell|odor|stench|sulfur|ozone|burning|metallic)\b/i,
  ];
  const sensoryCount = sensoryPatterns.filter(p => p.test(desc)).length;
  score += Math.min(sensoryCount * 0.5, 2);
  if (sensoryCount > 0) factors.push(sensoryCount + ' sensory types');

  // Physical measurements/descriptions (0-2 points)
  const measurePatterns = [
    /\b\d+\s*(foot|feet|ft|inch|meter|metre|yard|mile|km)\b/i,
    /\b(size of|as big as|as large as|about \d+)\b/i,
    /\b(altitude|elevation|height|diameter|wingspan)\b/i,
    /\b(speed|mph|kph|knots|mach)\b/i,
  ];
  const measureCount = measurePatterns.filter(p => p.test(desc)).length;
  score += Math.min(measureCount, 2);
  if (measureCount > 0) factors.push('physical measurements');

  // Behavioral details (0-1.5 points)
  const behaviorPatterns = [
    /\b(moved|hovered|flew|descended|ascended|zigzag|darted|glided|vanished|disappeared|materialized)\b/i,
    /\b(approached|retreated|circled|followed|chased|fled|ran|walked|crawled)\b/i,
  ];
  const behaviorCount = behaviorPatterns.filter(p => p.test(desc)).length;
  score += Math.min(behaviorCount * 0.75, 1.5);
  if (behaviorCount > 0) factors.push('behavioral details');

  // Summary quality (0-0.5 points)
  if (input.summary && input.summary.length > 50 && input.summary.length < 500) {
    score += 0.5;
  }

  score = Math.min(score, 10);
  const weight = 1.3;

  return {
    score,
    weight,
    weighted: Math.round(score * weight * 10) / 10,
    details: factors.join('; ') || 'minimal detail'
  };
}

// ============================================================================
// DIMENSION 4: LOCATION SPECIFICITY (weight: 1.1)
// Coordinates, named places, address-level detail
// ============================================================================

function scoreLocationSpecificity(input: ScoringInput): DimensionScore {
  let score = 0;
  const factors: string[] = [];

  // GPS coordinates
  if (input.latitude != null && input.longitude != null &&
      input.latitude !== 0 && input.longitude !== 0) {
    score += 3;
    factors.push('GPS coordinates');
  }

  // Country
  if (input.country) {
    score += 1;
    factors.push('country: ' + input.country);
  }

  // State/province
  if (input.state_province) {
    score += 1.5;
    factors.push('state/province');
  }

  // City
  if (input.city) {
    score += 1.5;
    factors.push('city specified');
  }

  // Named location
  if (input.location_name && input.location_name.length > 3) {
    score += 1;
    factors.push('named location');
  }

  // Description contains specific location markers
  const desc = input.description;
  const locationDetail = [
    /\b(highway|route|interstate|road|street|avenue|boulevard|lane|drive)\s*(#?\d+|[A-Z])/i,
    /\b(mile marker|exit|junction|intersection)\b/i,
    /\b\d+\s*(north|south|east|west)\s+of\b/i,
    /\b(near|outside|just past|approaching)\s+[A-Z][a-z]+/,
  ];
  const locationDetailCount = locationDetail.filter(p => p.test(desc)).length;
  score += Math.min(locationDetailCount, 2);
  if (locationDetailCount > 0) factors.push('descriptive location markers');

  score = Math.min(score, 10);
  const weight = 1.1;

  return {
    score,
    weight,
    weighted: Math.round(score * weight * 10) / 10,
    details: factors.length > 0 ? factors.join('; ') : 'no location data'
  };
}

// ============================================================================
// DIMENSION 5: TEMPORAL PRECISION (weight: 0.9)
// Exact date, time of day, duration, sequence of events
// ============================================================================

function scoreTemporalPrecision(input: ScoringInput): DimensionScore {
  let score = 0;
  const factors: string[] = [];
  const desc = input.description.toLowerCase();

  // Has event_date field
  if (input.event_date) {
    // Check if it's a specific date vs approximate
    if (/^\d{4}-\d{2}-\d{2}/.test(input.event_date)) {
      score += 3;
      factors.push('specific date');
    } else {
      score += 1.5;
      factors.push('approximate date');
    }
  }

  // Has event_time field
  if (input.event_time) {
    score += 2;
    factors.push('specific time');
  }

  // Time of day in description
  if (/\b\d{1,2}:\d{2}\s*(am|pm|a\.m\.|p\.m\.)?\b/i.test(desc)) {
    score += 1.5;
    factors.push('time mentioned in text');
  } else if (/\b(morning|afternoon|evening|night|midnight|dawn|dusk|noon|sunrise|sunset)\b/.test(desc)) {
    score += 0.75;
    factors.push('time of day referenced');
  }

  // Duration mentioned
  if (/\b(lasted|for about|approximately|roughly)\s+\d+\s*(second|minute|hour|day)/i.test(desc) ||
      (input.metadata?.event_duration_minutes)) {
    score += 1.5;
    factors.push('duration specified');
  }

  // Temporal sequence (events in order)
  const sequenceWords = ['then', 'after that', 'next', 'finally', 'moments later', 'shortly after', 'before', 'afterwards'];
  const sequenceCount = sequenceWords.filter(w => desc.includes(w)).length;
  if (sequenceCount >= 3) {
    score += 2;
    factors.push('detailed temporal sequence');
  } else if (sequenceCount >= 1) {
    score += 1;
    factors.push('basic temporal sequence');
  }

  score = Math.min(score, 10);
  const weight = 0.9;

  return {
    score,
    weight,
    weighted: Math.round(score * weight * 10) / 10,
    details: factors.length > 0 ? factors.join('; ') : 'no temporal data'
  };
}

// ============================================================================
// DIMENSION 6: SOURCE RELIABILITY (weight: 1.1)
// Established databases vs random reddit posts
// ============================================================================

const SOURCE_TIERS: Record<string, { base: number; tier: string }> = {
  'bfro':            { base: 8, tier: 'established org' },
  'nuforc':          { base: 7.5, tier: 'established database' },
  'mufon':           { base: 8, tier: 'established org' },
  'nderf':           { base: 7, tier: 'research database' },
  'iands':           { base: 7, tier: 'research org' },
  'wikipedia':       { base: 6, tier: 'curated secondary' },
  'historical_archive': { base: 7, tier: 'historical' },
  'user':            { base: 5, tier: 'user submitted' },
  'reddit':          { base: 4, tier: 'social media' },
  'ghostsofamerica': { base: 4.5, tier: 'community site' },
  'shadowlands':     { base: 4, tier: 'community site' },
};

function scoreSourceReliability(input: ScoringInput): DimensionScore {
  const sourceType = input.source_type || 'unknown';
  const sourceInfo = SOURCE_TIERS[sourceType] || { base: 3, tier: 'unknown' };
  let score = sourceInfo.base;
  const factors: string[] = [sourceInfo.tier + ' (' + sourceType + ')'];

  // BFRO class boost
  if (sourceType === 'bfro' && input.metadata?.bfroClass) {
    if (input.metadata.bfroClass === 'Class A') {
      score += 2;
      factors.push('Class A sighting');
    } else if (input.metadata.bfroClass === 'Class B') {
      score += 1;
      factors.push('Class B sighting');
    }
  }

  // Reddit engagement boost
  if (sourceType === 'reddit' && input.metadata?.score) {
    if (input.metadata.score > 200) {
      score += 2;
      factors.push('high engagement (' + input.metadata.score + ' upvotes)');
    } else if (input.metadata.score > 50) {
      score += 1;
      factors.push('moderate engagement');
    }
  }

  // Has source URL (verifiable)
  if (input.metadata?.source_url) {
    score += 0.5;
    factors.push('source URL available');
  }

  score = Math.min(score, 10);
  const weight = 1.1;

  return {
    score,
    weight,
    weighted: Math.round(score * weight * 10) / 10,
    details: factors.join('; ')
  };
}

// ============================================================================
// DIMENSION 7: CORROBORATION POTENTIAL (weight: 0.8)
// Can this report be cross-referenced with other data?
// ============================================================================

function scoreCorroborationPotential(input: ScoringInput): DimensionScore {
  let score = 0;
  const factors: string[] = [];
  const desc = input.description.toLowerCase();

  // Has specific date + location = can cross-reference
  if (input.event_date && (input.latitude != null || input.location_name)) {
    score += 3;
    factors.push('date+location for cross-reference');
  }

  // Mentions other witnesses or reports
  if (/\b(other (people|witnesses|reports|sightings)|news|newspaper|reported by|also saw|others have seen)\b/i.test(desc)) {
    score += 2;
    factors.push('references other witnesses/reports');
  }

  // Mentions verifiable external data
  if (/\b(weather report|flight radar|satellite|seismic|police blotter|news article|local paper)\b/i.test(desc)) {
    score += 2;
    factors.push('references verifiable external data');
  }

  // Has tags for categorization
  if (input.tags && input.tags.length >= 2) {
    score += 1;
    factors.push(input.tags.length + ' tags');
  }

  // Named specific location (searchable)
  if (input.city && input.state_province) {
    score += 1;
    factors.push('city+state searchable');
  }

  // Multiple sensory observations (harder to fabricate consistently)
  const sensoryTypes = [
    /\b(saw|visible|light|glow)/i,
    /\b(heard|sound|noise)/i,
    /\b(felt|sensation|temperature)/i,
    /\b(smell|odor)/i,
  ];
  const senseCount = sensoryTypes.filter(p => p.test(desc)).length;
  if (senseCount >= 3) {
    score += 1;
    factors.push('multi-sensory account');
  }

  score = Math.min(score, 10);
  const weight = 0.8;

  return {
    score,
    weight,
    weighted: Math.round(score * weight * 10) / 10,
    details: factors.length > 0 ? factors.join('; ') : 'limited corroboration potential'
  };
}

// ============================================================================
// DIMENSION 8: NARRATIVE COHERENCE (weight: 1.0)
// Logical flow, consistent voice, not rambling/incoherent
// ============================================================================

function scoreNarrativeCoherence(input: ScoringInput): DimensionScore {
  let score = 0;
  const factors: string[] = [];
  const desc = input.description;

  // Sentence structure analysis
  const sentences = desc.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const sentenceCount = sentences.length;

  // Minimum narrative structure (0-2)
  if (sentenceCount >= 5) {
    score += 2;
    factors.push(sentenceCount + ' sentences');
  } else if (sentenceCount >= 3) {
    score += 1;
    factors.push(sentenceCount + ' sentences (short)');
  }

  // Average sentence length — not too short (fragments) or too long (run-ons)
  if (sentences.length > 0) {
    const avgWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
    if (avgWords >= 10 && avgWords <= 25) {
      score += 2;
      factors.push('good sentence length');
    } else if (avgWords >= 6 && avgWords <= 35) {
      score += 1;
      factors.push('acceptable sentence length');
    } else {
      factors.push('irregular sentence length (avg ' + Math.round(avgWords) + ' words)');
    }
  }

  // Paragraph structure
  const paragraphs = desc.split(/\n\n+/).filter(p => p.trim().length > 30);
  if (paragraphs.length >= 3) {
    score += 1.5;
    factors.push('well-structured paragraphs');
  } else if (paragraphs.length >= 2) {
    score += 0.75;
  }

  // First-person consistent voice (not mixing I/he/they randomly)
  const firstPerson = (desc.match(/\bI\b/g) || []).length;
  const thirdPerson = (desc.match(/\b(he|she|they|it)\b/gi) || []).length;
  // Strong first-person narrative is a good sign for experiencer reports
  if (firstPerson > 5 && firstPerson > thirdPerson * 2) {
    score += 1.5;
    factors.push('consistent first-person voice');
  } else if (firstPerson > 0) {
    score += 0.5;
  }

  // Logical flow words
  const flowWords = ['then', 'after', 'before', 'when', 'while', 'suddenly', 'next', 'finally', 'at first', 'eventually', 'later', 'meanwhile'];
  const flowCount = flowWords.filter(w => desc.toLowerCase().includes(w)).length;
  if (flowCount >= 4) {
    score += 2;
    factors.push('strong narrative flow');
  } else if (flowCount >= 2) {
    score += 1;
    factors.push('basic narrative flow');
  }

  // Penalty: excessive caps or exclamation marks (incoherent/ranting)
  const capsRatio = (desc.match(/[A-Z]/g) || []).length / Math.max(desc.length, 1);
  if (capsRatio > 0.4) {
    score -= 2;
    factors.push('excessive caps (penalty)');
  }
  const exclamationRatio = (desc.match(/!/g) || []).length / Math.max(sentenceCount, 1);
  if (exclamationRatio > 2) {
    score -= 1;
    factors.push('excessive exclamation (penalty)');
  }

  score = Math.max(0, Math.min(score, 10));
  const weight = 1.0;

  return {
    score,
    weight,
    weighted: Math.round(score * weight * 10) / 10,
    details: factors.join('; ') || 'minimal narrative'
  };
}

// ============================================================================
// DIMENSION 9: CONTENT ORIGINALITY (weight: 0.8)
// Not copy-pasted, not a template, original language
// ============================================================================

function scoreContentOriginality(input: ScoringInput): DimensionScore {
  let score = 5; // Start neutral — we can't truly detect plagiarism without a corpus
  const factors: string[] = [];
  const desc = input.description;

  // Template/boilerplate detection (negative signals)
  const templatePatterns = [
    /\b(lorem ipsum|test report|sample data|example report)\b/i,
    /\b(copy and paste|copypasta|repost|x-post)\b/i,
    /\b(this is a test|testing 123|ignore this)\b/i,
  ];
  for (const pat of templatePatterns) {
    if (pat.test(desc)) {
      score -= 3;
      factors.push('template/boilerplate detected');
      break;
    }
  }

  // Unique details suggest originality
  // Specific names, places, dates together
  const hasSpecificName = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(desc); // Proper names
  const hasSpecificNumber = /\b\d{3,}\b/.test(desc); // Specific numbers
  const hasUniqueDetail = /\b(license plate|model|make|serial|badge)\b/i.test(desc);

  if (hasSpecificName) { score += 1; factors.push('specific names'); }
  if (hasSpecificNumber) { score += 0.5; factors.push('specific numbers'); }
  if (hasUniqueDetail) { score += 1; factors.push('unique identifying details'); }

  // Personal emotional response (hard to fake at scale)
  const emotionalMarkers = [
    /\b(terrified|scared|frightened|shaking|couldn't sleep|nightmare|haunted me|still think about)\b/i,
    /\b(amazed|awestruck|speechless|couldn't believe|changed my life|never forget)\b/i,
    /\b(confused|puzzled|baffled|no explanation|makes no sense|rational person)\b/i,
  ];
  const emotionCount = emotionalMarkers.filter(p => p.test(desc)).length;
  if (emotionCount >= 2) {
    score += 2;
    factors.push('authentic emotional response');
  } else if (emotionCount >= 1) {
    score += 1;
    factors.push('emotional marker');
  }

  // Repetitive content penalty
  // Check for large repeated blocks
  const words = desc.split(/\s+/);
  if (words.length > 50) {
    const firstHalf = words.slice(0, Math.floor(words.length / 2)).join(' ');
    const secondHalf = words.slice(Math.floor(words.length / 2)).join(' ');
    // Simple similarity check — if halves are very similar, it's likely copy-pasted
    const commonWords = new Set(firstHalf.toLowerCase().split(/\s+/));
    const secondWords = secondHalf.toLowerCase().split(/\s+/);
    const overlap = secondWords.filter(w => commonWords.has(w)).length / secondWords.length;
    if (overlap > 0.8) {
      score -= 2;
      factors.push('repetitive content detected');
    }
  }

  score = Math.max(0, Math.min(score, 10));
  const weight = 0.8;

  return {
    score,
    weight,
    weighted: Math.round(score * weight * 10) / 10,
    details: factors.length > 0 ? factors.join('; ') : 'neutral originality'
  };
}

// ============================================================================
// DIMENSION 10: DATA COMPLETENESS (weight: 0.8)
// How many fields are populated vs empty
// ============================================================================

function scoreDataCompleteness(input: ScoringInput): DimensionScore {
  let score = 0;
  const factors: string[] = [];
  let filled = 0;
  let total = 0;

  // Check each key field
  const fields: Array<{ name: string; value: any; weight: number }> = [
    { name: 'title', value: input.title, weight: 1 },
    { name: 'description', value: input.description && input.description.length > 50, weight: 1 },
    { name: 'summary', value: input.summary && input.summary.length > 10, weight: 0.5 },
    { name: 'category', value: input.category, weight: 0.5 },
    { name: 'location_name', value: input.location_name, weight: 1 },
    { name: 'country', value: input.country, weight: 0.5 },
    { name: 'state_province', value: input.state_province, weight: 0.75 },
    { name: 'city', value: input.city, weight: 0.75 },
    { name: 'coordinates', value: input.latitude != null && input.longitude != null, weight: 1 },
    { name: 'event_date', value: input.event_date, weight: 1 },
    { name: 'source_type', value: input.source_type, weight: 0.5 },
    { name: 'tags', value: input.tags && input.tags.length > 0, weight: 0.5 },
    { name: 'witness_count', value: input.witness_count && input.witness_count > 0, weight: 0.5 },
    { name: 'credibility', value: input.credibility, weight: 0.5 },
  ];

  let totalWeight = 0;
  let filledWeight = 0;

  for (const field of fields) {
    totalWeight += field.weight;
    total++;
    if (field.value) {
      filledWeight += field.weight;
      filled++;
    }
  }

  // Score is proportional to weighted completeness
  score = (filledWeight / totalWeight) * 10;
  factors.push(filled + '/' + total + ' fields populated');

  score = Math.min(score, 10);
  const weight = 0.8;

  return {
    score: Math.round(score * 10) / 10,
    weight,
    weighted: Math.round(score * weight * 10) / 10,
    details: factors.join('; ')
  };
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

/**
 * Score a report across all 10 quality dimensions.
 * Returns a comprehensive QualityReport with 0-100 total score.
 *
 * Dimension weights sum to ~10.0, each dimension 0-10,
 * so raw max is ~100. Normalized to 0-100 scale.
 */
export function scoreReport(input: ScoringInput): QualityReport {
  const dimensions = {
    evidenceStrength: scoreEvidenceStrength(input),
    witnessCredibility: scoreWitnessCredibility(input),
    descriptionDetail: scoreDescriptionDetail(input),
    locationSpecificity: scoreLocationSpecificity(input),
    temporalPrecision: scoreTemporalPrecision(input),
    sourceReliability: scoreSourceReliability(input),
    corroborationPotential: scoreCorroborationPotential(input),
    narrativeCoherence: scoreNarrativeCoherence(input),
    contentOriginality: scoreContentOriginality(input),
    dataCompleteness: scoreDataCompleteness(input),
  };

  // Calculate total
  const totalWeights = Object.values(dimensions).reduce((sum, d) => sum + d.weight, 0);
  const totalWeighted = Object.values(dimensions).reduce((sum, d) => sum + d.weighted, 0);

  // Normalize to 0-100
  const maxPossible = totalWeights * 10; // Each dimension max is 10
  const totalScore = Math.round((totalWeighted / maxPossible) * 100);

  // Grade assignment
  let grade: QualityReport['grade'];
  if (totalScore >= 80) grade = 'A';
  else if (totalScore >= 65) grade = 'B';
  else if (totalScore >= 50) grade = 'C';
  else if (totalScore >= 35) grade = 'D';
  else grade = 'F';

  // Status recommendation
  let recommendedStatus: QualityReport['recommendedStatus'];
  if (totalScore >= 60) recommendedStatus = 'approved';
  else if (totalScore >= 35) recommendedStatus = 'pending_review';
  else recommendedStatus = 'rejected';

  return {
    totalScore,
    grade,
    recommendedStatus,
    dimensions,
    scoredAt: new Date().toISOString(),
    version: SCORER_VERSION,
  };
}

/**
 * Quick score — returns just the total score number.
 * Use for batch operations where you don't need the full breakdown.
 */
export function quickScore(input: ScoringInput): number {
  return scoreReport(input).totalScore;
}

/**
 * Convert a ScrapedReport to ScoringInput
 */
export function fromScrapedReport(report: ScrapedReport): ScoringInput {
  return {
    title: report.title,
    summary: report.summary,
    description: report.description,
    category: report.category,
    location_name: report.location_name,
    country: report.country,
    state_province: report.state_province,
    city: report.city,
    latitude: report.latitude,
    longitude: report.longitude,
    event_date: report.event_date,
    source_type: report.source_type,
    credibility: report.credibility,
    tags: report.tags,
    metadata: report.metadata,
  };
}
