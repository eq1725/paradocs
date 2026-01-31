// Ingestion Filters Module
// Centralized exports for quality filtering and title improvement

export {
  // Quality filter functions
  filterContent,
  assessQuality,
  calculateQualityScore,
  getStatusFromScore,
  isObviouslyLowQuality,
  // Quality filter patterns (for adapters that need custom checks)
  META_POST_PATTERNS,
  NON_EXPERIENCE_PATTERNS,
  FICTION_PATTERNS,
  LOW_EFFORT_PATTERNS,
  SPAM_URL_PATTERNS,
  // Source credibility
  BFRO_CLASS_BOOST,
  // Types
  type QualityScore,
  type FilterResult,
} from './quality-filter';

export {
  // Title improvement functions
  improveTitle,
  analyzeTitleQuality,
  generateImprovedTitle,
  fixBasicTitleIssues,
} from './title-improver';

// Source label configuration
export const SOURCE_LABELS: Record<string, { label: string; displayName: string; icon?: string }> = {
  'reddit': { label: 'Reddit', displayName: 'Reddit', icon: 'reddit' },
  'bfro': { label: 'BFRO', displayName: 'BFRO Database', icon: 'database' },
  'nuforc': { label: 'NUFORC', displayName: 'NUFORC', icon: 'database' },
  'mufon': { label: 'MUFON', displayName: 'MUFON', icon: 'database' },
  'wikipedia': { label: 'Wikipedia', displayName: 'Wikipedia', icon: 'book' },
  'shadowlands': { label: 'Shadowlands', displayName: 'Shadowlands', icon: 'ghost' },
  'ghostsofamerica': { label: 'GoA', displayName: 'Ghosts of America', icon: 'ghost' },
  'user': { label: 'User', displayName: 'User Submitted', icon: 'user' },
};

/**
 * Get the display label for a source type
 */
export function getSourceLabel(sourceType: string, subreddit?: string): string {
  if (sourceType === 'reddit' && subreddit) {
    return `r/${subreddit}`;
  }
  return SOURCE_LABELS[sourceType]?.displayName || sourceType;
}

/**
 * Get the short label for a source type (for badges)
 */
export function getSourceShortLabel(sourceType: string): string {
  return SOURCE_LABELS[sourceType]?.label || sourceType;
}
