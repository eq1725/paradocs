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