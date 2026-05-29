/**
 * standing.service.ts — V11.17.42
 *
 * Server-side computation for the two-axis Standing system.
 *
 * Panel memo: docs/BADGE_SYSTEM_PANEL.md
 * Migration: supabase/migrations/20260529_user_standing.sql
 *
 * Cost shape: pure DB reads from existing tables. No external API.
 *   ~6 cheap count queries per user. The nightly cron iterates only
 *   users with activity in the last 60 days, so the working set stays
 *   small even at 100k accounts.
 *
 * Sam's call: thresholds live here as a config constant, not in the
 * DB. Retunable without a migration.
 */

import { createServerClient } from '../supabase'
import {
  CATALOGUE_NAMES,
  CONTRIBUTION_NAMES,
  StandingAxis,
  StandingDisplay,
  StandingProgress,
  StandingRow,
  StandingTier,
  pickInlineLabel,
} from '../standing/types'

// =====================================================================
// THRESHOLDS — calibrated against panel-recommended distribution
// (~60% / 25% / 12% / 3% landing in tiers 1..4 respectively).
// Sam plans to re-tune within ±20% once we have a week of live data
// post-launch. Multi-condition tops (AND clauses) are non-negotiable —
// single-threshold tops are gameable in a weekend.
// =====================================================================

interface CatalogueThresholds {
  tier: StandingTier
  min_saves: number
  min_active_days: number
  min_account_age_days: number
}

interface ContributionThresholds {
  tier: StandingTier
  min_reports: number
  min_comments: number
  min_journal: number
  min_account_age_days: number
  /** When true, ALL of the above mins must be met. When false, ANY. */
  require_all: boolean
}

// Tier 1 is the default — always met. Iterate top-down; the first
// row whose conditions are satisfied wins.
var CATALOGUE_LADDER: CatalogueThresholds[] = [
  {
    tier: 4,
    min_saves: 250,
    min_active_days: 180,
    min_account_age_days: 365,
  },
  {
    tier: 3,
    min_saves: 100,
    min_active_days: 90,
    min_account_age_days: 0,
  },
  // Tier 2 is OR (saves OR active days) per memo section 4.3.
  // Encoded as: either threshold counts, accomplished by setting the
  // other to 0. We special-case the OR rule for tier 2 in the matcher
  // below; this row's values are the displayed numbers.
  {
    tier: 2,
    min_saves: 25,
    min_active_days: 30,
    min_account_age_days: 0,
  },
]

var CONTRIBUTION_LADDER: ContributionThresholds[] = [
  // Steward: 25 reports AND ≥1y account age. (Moderation-strike clause
  // deferred — we don't yet have a strikes table; treat as zero.)
  {
    tier: 4,
    min_reports: 25,
    min_comments: 0,
    min_journal: 0,
    min_account_age_days: 365,
    require_all: true,
  },
  // Correspondent: 5 reports OR 25 accepted comments OR 10 shared journal entries.
  {
    tier: 3,
    min_reports: 5,
    min_comments: 25,
    min_journal: 10,
    min_account_age_days: 0,
    require_all: false,
  },
  // Contributor: 1 accepted report OR 5 accepted comments.
  {
    tier: 2,
    min_reports: 1,
    min_comments: 5,
    min_journal: 0,
    min_account_age_days: 0,
    require_all: false,
  },
]

/**
 * Stale window after which /api/standing/me will recompute on read
 * rather than serving the cached row. The nightly cron keeps active
 * users fresh; this guards against silent stagnation for someone
 * who recently became eligible for the next tier and is staring at
 * their profile waiting for it to update.
 */
export var STANDING_STALE_MS = 24 * 60 * 60 * 1000

// =====================================================================
// COMPUTE
// =====================================================================

interface RawCounts {
  saves: number
  active_days: number
  account_age_days: number
  reports: number
  comments: number
  journal: number
}

async function loadRawCounts(userId: string): Promise<RawCounts> {
  var supabase = createServerClient()
  var nowMs = Date.now()

  // Run the six count queries in parallel. Each is an indexed lookup
  // on user_id; the working set is tiny.
  var [
    profileRes,
    savedReportsRes,
    savedPhenomenaRes,
    streakRes,
    reportsRes,
    commentsRes,
    journalRes,
  ] = await Promise.all([
    (supabase.from('profiles') as any).select('created_at').eq('id', userId).single(),
    supabase.from('saved_reports').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('saved_phenomena').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    (supabase.from('user_streaks') as any).select('total_active_days').eq('user_id', userId).single(),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('submitted_by', userId).eq('status', 'approved'),
    supabase.from('report_comments').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'approved').is('deleted_at', null),
    (supabase.from('journal_entries') as any).select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_private', false),
  ])

  var createdAt = (profileRes && profileRes.data && (profileRes.data as any).created_at) || null
  var accountAgeDays = 0
  if (createdAt) {
    var createdMs = new Date(createdAt).getTime()
    if (!isNaN(createdMs)) accountAgeDays = Math.floor((nowMs - createdMs) / (24 * 3600 * 1000))
  }

  var savedReportsCount = (savedReportsRes && savedReportsRes.count) || 0
  var savedPhenomenaCount = (savedPhenomenaRes && savedPhenomenaRes.count) || 0
  var activeDays = (streakRes && streakRes.data && (streakRes.data as any).total_active_days) || 0
  var reportsCount = (reportsRes && reportsRes.count) || 0
  var commentsCount = (commentsRes && commentsRes.count) || 0
  var journalCount = (journalRes && journalRes.count) || 0

  return {
    saves: savedReportsCount + savedPhenomenaCount,
    active_days: activeDays,
    account_age_days: accountAgeDays,
    reports: reportsCount,
    comments: commentsCount,
    journal: journalCount,
  }
}

function pickCatalogueTier(raw: RawCounts): StandingTier {
  for (var i = 0; i < CATALOGUE_LADDER.length; i++) {
    var row = CATALOGUE_LADDER[i]
    if (row.tier === 4 || row.tier === 3) {
      // AND semantics for the top two tiers.
      var meetsSaves = raw.saves >= row.min_saves
      var meetsDays = raw.active_days >= row.min_active_days
      var meetsAge = raw.account_age_days >= row.min_account_age_days
      if (meetsSaves && meetsDays && meetsAge) return row.tier
    } else if (row.tier === 2) {
      // OR semantics for tier 2 per memo section 4.3.
      var meetsSavesT2 = raw.saves >= row.min_saves
      var meetsDaysT2 = raw.active_days >= row.min_active_days
      if (meetsSavesT2 || meetsDaysT2) return 2
    }
  }
  return 1
}

function pickContributionTier(raw: RawCounts): StandingTier {
  for (var i = 0; i < CONTRIBUTION_LADDER.length; i++) {
    var row = CONTRIBUTION_LADDER[i]
    var meetsAge = raw.account_age_days >= row.min_account_age_days
    if (!meetsAge) continue
    if (row.require_all) {
      // For Steward we only check reports + account age; comments /
      // journal mins are zero so they always pass.
      var meetsReports = raw.reports >= row.min_reports
      if (meetsReports) return row.tier
    } else {
      var meetsR = row.min_reports > 0 && raw.reports >= row.min_reports
      var meetsC = row.min_comments > 0 && raw.comments >= row.min_comments
      var meetsJ = row.min_journal > 0 && raw.journal >= row.min_journal
      if (meetsR || meetsC || meetsJ) return row.tier
    }
  }
  return 1
}

// =====================================================================
// PERSIST
// =====================================================================

/**
 * Compute fresh standing from source tables and upsert into
 * user_standing. Preserves the `*_since` timestamps when a tier
 * doesn't change.
 */
export async function recomputeStanding(userId: string): Promise<StandingRow | null> {
  var supabase = createServerClient()
  var raw = await loadRawCounts(userId)

  var catalogue_tier = pickCatalogueTier(raw)
  var contribution_tier = pickContributionTier(raw)

  // Read existing row to preserve `since` timestamps when unchanged.
  var prevRes = await (supabase.from('user_standing') as any)
    .select('*')
    .eq('user_id', userId)
    .single()
  var prev: StandingRow | null = (prevRes && prevRes.data) || null

  var now = new Date().toISOString()
  var catalogue_since = prev && prev.catalogue_tier === catalogue_tier
    ? prev.catalogue_since
    : now
  var contribution_since = prev && prev.contribution_tier === contribution_tier
    ? prev.contribution_since
    : now

  var row = {
    user_id: userId,
    catalogue_tier: catalogue_tier,
    contribution_tier: contribution_tier,
    catalogue_since: catalogue_since,
    contribution_since: contribution_since,
    saves_count: raw.saves,
    active_days: raw.active_days,
    account_age_days: raw.account_age_days,
    reports_count: raw.reports,
    comments_count: raw.comments,
    journal_count: raw.journal,
    computed_at: now,
  }

  var upsertRes = await (supabase.from('user_standing') as any)
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .single()

  if (upsertRes.error) {
    console.warn('[standing] upsert error for ' + userId + ': ' + upsertRes.error.message)
    return null
  }
  return upsertRes.data as StandingRow
}

/**
 * Read the user's current standing. Recomputes on the fly if missing
 * or older than STANDING_STALE_MS.
 */
export async function getStandingForUser(userId: string): Promise<StandingRow | null> {
  var supabase = createServerClient()
  var res = await (supabase.from('user_standing') as any)
    .select('*')
    .eq('user_id', userId)
    .single()
  var row: StandingRow | null = (res && res.data) || null

  if (!row) {
    return await recomputeStanding(userId)
  }

  var computedMs = new Date(row.computed_at).getTime()
  if (isNaN(computedMs) || Date.now() - computedMs > STANDING_STALE_MS) {
    return await recomputeStanding(userId)
  }
  return row
}

/**
 * Batch read for many users (e.g. annotating a comment thread with
 * each author's standing). No recompute — uses whatever's cached.
 * Callers that need fresh data should call recomputeStanding directly.
 */
export async function getStandingsForUsers(
  userIds: string[],
): Promise<Record<string, StandingRow>> {
  if (userIds.length === 0) return {}
  var supabase = createServerClient()
  var res = await (supabase.from('user_standing') as any)
    .select('*')
    .in('user_id', userIds)
  var rows: StandingRow[] = (res && res.data) || []
  var out: Record<string, StandingRow> = {}
  rows.forEach(function (r) { out[r.user_id] = r })
  return out
}

// =====================================================================
// PROGRESSION COPY — for the prose line under the profile pills
// =====================================================================

/**
 * Build the "Next: Archivist at 250 saves and one year on Paradocs."
 * prose for one axis. Returns null `next_*` fields when the user is
 * already at the top tier.
 */
export function buildProgress(
  axis: StandingAxis,
  row: StandingRow,
): StandingProgress {
  var current_tier: StandingTier = axis === 'catalogue' ? row.catalogue_tier : row.contribution_tier
  var since: string | null = axis === 'catalogue' ? row.catalogue_since : row.contribution_since

  if (current_tier === 4) {
    return {
      axis: axis,
      current_tier: current_tier,
      current_name: axis === 'catalogue' ? CATALOGUE_NAMES[4] : CONTRIBUTION_NAMES[4],
      since: since,
      next_name: null,
      next_requirements: null,
    }
  }

  // Find the next tier up.
  var nextTier = (current_tier + 1) as StandingTier
  var next_name = axis === 'catalogue' ? CATALOGUE_NAMES[nextTier] : CONTRIBUTION_NAMES[nextTier]
  var next_requirements = ''

  if (axis === 'catalogue') {
    var c = CATALOGUE_LADDER.find(function (r) { return r.tier === nextTier })
    if (c) {
      if (c.tier === 2) {
        // OR — show the more attainable number (saves usually clicks first).
        next_requirements = c.min_saves + ' saves or ' + c.min_active_days + ' days on Paradocs'
      } else if (c.tier === 3) {
        next_requirements = c.min_saves + ' saves and ' + c.min_active_days + ' active days'
      } else if (c.tier === 4) {
        next_requirements = c.min_saves + ' saves, ' + c.min_active_days + ' active days, and one year on Paradocs'
      }
    }
  } else {
    var ct = CONTRIBUTION_LADDER.find(function (r) { return r.tier === nextTier })
    if (ct) {
      if (ct.tier === 2) {
        next_requirements = ct.min_reports + ' submitted report or ' + ct.min_comments + ' accepted comments'
      } else if (ct.tier === 3) {
        next_requirements = ct.min_reports + ' reports, ' + ct.min_comments + ' accepted comments, or ' + ct.min_journal + ' shared journal entries'
      } else if (ct.tier === 4) {
        next_requirements = ct.min_reports + ' submitted reports and one year on Paradocs'
      }
    }
  }

  return {
    axis: axis,
    current_tier: current_tier,
    current_name: axis === 'catalogue' ? CATALOGUE_NAMES[current_tier] : CONTRIBUTION_NAMES[current_tier],
    since: since,
    next_name: next_name,
    next_requirements: next_requirements || null,
  }
}

// =====================================================================
// LAB SUBSCRIBER CHECK
// =====================================================================

/**
 * "Lab subscriber" = anyone on an active non-free paid tier.
 * Single source of truth so the profile pill + the inline diamond
 * agree.
 */
export async function isLabSubscriber(userId: string): Promise<boolean> {
  var supabase = createServerClient()
  var res = await (supabase
    .from('user_subscriptions') as any)
    .select('status, tier:subscription_tiers(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .single()
  if (!res || !res.data) return false
  var name = (res.data as any).tier && (res.data as any).tier.name
  if (!name) return false
  return name !== 'free'
}

/**
 * Same as isLabSubscriber but batch over many users. Returns a Set
 * of user_ids that are Lab subscribers. Used by the comment endpoint
 * to enrich every author in one round-trip.
 */
export async function getLabSubscribersAmong(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  var supabase = createServerClient()
  var res = await (supabase
    .from('user_subscriptions') as any)
    .select('user_id, status, tier:subscription_tiers(name)')
    .in('user_id', userIds)
    .eq('status', 'active')
  var rows: any[] = (res && res.data) || []
  var out = new Set<string>()
  rows.forEach(function (r) {
    var name = r.tier && r.tier.name
    if (name && name !== 'free') out.add(r.user_id)
  })
  return out
}

/**
 * Convenience for inline-mark consumers: returns the StandingDisplay
 * shape ready to render. Caller passes the raw standing row (may be
 * null for users with no row yet) plus the lab flag.
 */
export function buildDisplay(
  row: StandingRow | null | undefined,
  is_lab: boolean,
): StandingDisplay {
  var catalogue = (row ? row.catalogue_tier : 1) as StandingTier
  var contribution = (row ? row.contribution_tier : 1) as StandingTier
  return {
    catalogue_tier: catalogue,
    contribution_tier: contribution,
    inline_label: pickInlineLabel(catalogue, contribution),
    is_lab: is_lab,
  }
}
