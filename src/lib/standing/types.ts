/**
 * standing/types.ts — V11.17.42
 *
 * Shared types for the Standing system. Lives outside services/ so
 * client components can import without dragging in supabase / Node.
 *
 * Panel memo: docs/BADGE_SYSTEM_PANEL.md
 */

export type StandingAxis = 'catalogue' | 'contribution'

export type StandingTier = 1 | 2 | 3 | 4

/**
 * Tier names in Paradocs voice. Maya led naming; Sam vets thresholds.
 * Tier 1 (default) gets no display treatment in comments — marking
 * the floor is noise.
 */
export var CATALOGUE_NAMES: Record<StandingTier, string> = {
  1: 'Reader',
  2: 'Regular',
  3: 'Keeper',
  4: 'Archivist',
}

export var CONTRIBUTION_NAMES: Record<StandingTier, string> = {
  1: 'Witness',
  2: 'Contributor',
  3: 'Correspondent',
  4: 'Steward',
}

export function nameFor(axis: StandingAxis, tier: StandingTier): string {
  return axis === 'catalogue' ? CATALOGUE_NAMES[tier] : CONTRIBUTION_NAMES[tier]
}

export interface StandingRow {
  user_id: string
  catalogue_tier: StandingTier
  contribution_tier: StandingTier
  catalogue_since: string | null
  contribution_since: string | null
  saves_count: number
  active_days: number
  account_age_days: number
  reports_count: number
  comments_count: number
  journal_count: number
  computed_at: string
}

/**
 * What the UI needs to render the prose progression line on the
 * profile page. `next_label` is null when the user is at the top
 * tier already — render only the current standing without "Next:".
 */
export interface StandingProgress {
  axis: StandingAxis
  current_tier: StandingTier
  current_name: string
  /** ISO timestamp of when the user reached `current_tier`. */
  since: string | null
  /** Null when current_tier === 4. */
  next_name: string | null
  /** Human-readable threshold sentence, e.g. "250 saves and one year on Paradocs". Null at top tier. */
  next_requirements: string | null
}

/**
 * Single object the inline comment-mark and any other consumer need.
 * `inline_label` is the *higher-prestige* tier name to show next to
 * a username, or null when both axes are at tier 1. Contribution
 * wins ties (a Correspondent comment > a Keeper comment).
 */
export interface StandingDisplay {
  catalogue_tier: StandingTier
  contribution_tier: StandingTier
  /** The label to show inline next to a username, tier 2+ only. */
  inline_label: string | null
  /** True when the user is on a paid (Lab) subscription. */
  is_lab: boolean
}

/**
 * Pick the inline label per panel rule:
 *   - tier 2+ only
 *   - Contribution wins ties
 */
export function pickInlineLabel(
  catalogue: StandingTier,
  contribution: StandingTier,
): string | null {
  if (contribution >= 2 && contribution >= catalogue) {
    return CONTRIBUTION_NAMES[contribution]
  }
  if (catalogue >= 2) return CATALOGUE_NAMES[catalogue]
  return null
}
