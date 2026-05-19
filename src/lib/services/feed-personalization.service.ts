/**
 * feed-personalization.service — per-user category weights
 *
 * Panel-feedback (May 2026 — 4th round, Tier 2). Reads the user's
 * positive engagement signals (saved_reports + recent thumbs_up
 * feed_events) and negative signals (thumbs_down events) to produce
 * a per-category weight vector consumed by feed-v2's affinity score.
 *
 * Weights are normalized to a 0-100 range so they slot in alongside
 * the existing onboarding-topics affinity (which also lives at 0-100).
 *
 * The "freshness" of a signal matters — a save from 2 weeks ago is
 * weaker than a save from yesterday. We weight by decay so the user's
 * current interests dominate.
 *
 * SWC: var + function() form.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CategoryWeights {
  [category: string]: number
}

interface SavedRow {
  report_id: string
  created_at: string
  reports: { category: string } | null | { category: string }[]
}

interface FeedEventRow {
  phenomenon_category: string | null
  event_type: string
  created_at: string
}

var DECAY_HALF_LIFE_DAYS = 14
var SAVE_BASE_WEIGHT = 8        // each save adds this to the category's raw score
var THUMBS_UP_BASE_WEIGHT = 5   // each thumbs_up adds this
var THUMBS_DOWN_BASE_WEIGHT = -8 // thumbs_down strongly suppresses
var MAX_NORMALIZED = 100

function decayMultiplier(createdAt: string): number {
  try {
    var ageMs = Date.now() - new Date(createdAt).getTime()
    var ageDays = ageMs / (1000 * 60 * 60 * 24)
    if (ageDays < 0) return 1
    return Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS)
  } catch {
    return 1
  }
}

/**
 * Compute the per-category weight map for a given user. Returns an
 * empty object on any failure (caller falls through to existing
 * onboarding-only affinity).
 *
 * Why we use the service-role client: feed_events RLS only lets
 * admins read all events; saved_reports RLS only lets the owner
 * read their own. Caller already validated the user_id matches the
 * caller's auth, so we use the service role to bypass RLS and run
 * a single combined query.
 */
export async function computeUserCategoryWeights(
  admin: SupabaseClient,
  userId: string,
): Promise<CategoryWeights> {
  if (!userId) return {}

  try {
    // 1. Saved reports — the strongest "I like this" signal.
    var { data: savedRows } = await admin
      .from('saved_reports')
      .select('report_id, created_at, reports(category)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200)

    var raw: CategoryWeights = {}

    var saved = (savedRows as any[] as SavedRow[]) || []
    for (var i = 0; i < saved.length; i++) {
      var row = saved[i]
      var cat = ''
      if (row.reports) {
        if (Array.isArray(row.reports)) cat = row.reports[0]?.category || ''
        else cat = (row.reports as { category: string }).category || ''
      }
      if (!cat) continue
      var decay = decayMultiplier(row.created_at)
      raw[cat] = (raw[cat] || 0) + SAVE_BASE_WEIGHT * decay
    }

    // 2. Recent thumbs events — explicit signal flowing in faster than saves.
    var { data: eventRows } = await admin
      .from('feed_events')
      .select('phenomenon_category, event_type, created_at')
      .eq('user_id', userId)
      .in('event_type', ['thumbs_up', 'thumbs_down'])
      .order('created_at', { ascending: false })
      .limit(500)

    var events = (eventRows as any[] as FeedEventRow[]) || []
    for (var j = 0; j < events.length; j++) {
      var ev = events[j]
      if (!ev.phenomenon_category) continue
      var decay2 = decayMultiplier(ev.created_at)
      var base = ev.event_type === 'thumbs_up' ? THUMBS_UP_BASE_WEIGHT : THUMBS_DOWN_BASE_WEIGHT
      raw[ev.phenomenon_category] = (raw[ev.phenomenon_category] || 0) + base * decay2
    }

    // 3. Normalize to 0-MAX_NORMALIZED. Negatives stay negative.
    var keys = Object.keys(raw)
    if (keys.length === 0) return {}

    var max = 0
    for (var k = 0; k < keys.length; k++) {
      if (raw[keys[k]] > max) max = raw[keys[k]]
    }
    if (max <= 0) return raw // user has only negative signals — return them as-is

    var out: CategoryWeights = {}
    for (var k2 = 0; k2 < keys.length; k2++) {
      var v = raw[keys[k2]]
      // Positive → 0..MAX_NORMALIZED; negative → 0..-MAX_NORMALIZED/2 (so
      // thumbs-down suppresses but never fully zeros a category — we
      // still want the user to see SOME diversity).
      if (v >= 0) {
        out[keys[k2]] = Math.round((v / max) * MAX_NORMALIZED)
      } else {
        out[keys[k2]] = Math.round(Math.max(v, -MAX_NORMALIZED / 2))
      }
    }
    return out
  } catch (e: any) {
    console.warn('[feed-personalization] compute failed:', e?.message)
    return {}
  }
}

/**
 * Merge personalization weights with the explicit onboarding-topics
 * affinity. Personalization signals override onboarding when both
 * disagree — the user's actual behavior is a stronger signal than
 * what they ticked in onboarding.
 */
export function mergeWeights(
  onboarding: Record<string, number>,
  personalized: CategoryWeights,
): Record<string, number> {
  var out: Record<string, number> = { ...onboarding }
  var pkeys = Object.keys(personalized)
  for (var i = 0; i < pkeys.length; i++) {
    var k = pkeys[i]
    var pVal = personalized[k]
    var oVal = out[k]
    if (oVal == null) {
      out[k] = pVal
    } else {
      // Weighted blend favoring personalization (70/30) since it
      // reflects current behavior, not initial intent.
      out[k] = Math.round(0.3 * oVal + 0.7 * pVal)
    }
  }
  return out
}
