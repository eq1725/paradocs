/**
 * GET /api/discover/clusters — Clustering cards for the feed.
 *
 * V11.17.41 — Redesign per docs/CLUSTER_CARD_REDESIGN_PANEL.md.
 *
 * Returns up to 5 cluster cards. The discover consumer picks one of
 * them per session via sessionSeed % length (so the feed isn't always
 * "California UFOs").
 *
 * Each cluster card carries:
 *   - cluster_type / type_label   — eyebrow on the card
 *   - headline                    — templated fact ("196 UFO reports from California this week.")
 *   - body                        — shape sentence. Haiku-generated when we can
 *                                   defensibly identify a shared characteristic;
 *                                   templated fallback otherwise.
 *   - baseline_text (optional)    — "Twice the usual week", surfaced only when
 *                                   the cluster type supports it AND a 4-week
 *                                   trailing average exists to compare against.
 *   - category / category_label   — slug + human label (no client lookup needed)
 *   - report_count / time_range / location_summary / linked_report_ids
 *
 * Cache: 10 minutes at the CDN edge so recent ingestion flows through
 * within a session.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { generateClusterFinding } from '@/lib/services/cluster-finding.service'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

// V11.18.12 — Sprint 1E. Per-cluster representative report row used to
// fill the ClusteringCard's substance zone. Title + location + relative
// date string; one row tapped routes the user to /report/<slug>. The
// API joins three of these per cluster (the first three of
// `linked_report_ids`).
interface ClusterRepresentativeReport {
  id: string
  slug: string
  title: string
  location_short: string | null
  date_short: string | null
}

interface ClusterCard {
  id: string
  type: 'geographic_cluster' | 'temporal_burst' | 'category_trend' | 'milestone'
  // V11.18.13 — Sprint 1E fixes. Alias of `type` so the consumer
  // ClusteringCard.tsx interface (which uses `cluster_type`) gets the
  // value through Object.assign in discover.tsx.
  cluster_type: 'geographic_cluster' | 'temporal_burst' | 'category_trend' | 'milestone'
  type_label: string
  headline: string
  body: string
  baseline_text?: string
  category: string
  category_label: string
  report_count: number
  time_range: string
  location_summary?: string
  linked_report_ids: string[]
  // V11.18.12 — Sprint 1E. 3-row representative-report list rendered in
  // the ClusteringCard's substance zone. Always returned (possibly
  // empty when the cluster's linked rows are missing or unparseable);
  // the card hides the section when empty.
  representative_reports: ClusterRepresentativeReport[]
  generated_at: string
  // Legacy fields retained for the brief consumer-deploy lag window.
  // Will be cleaned up after the new ClusteringCard is in prod for a
  // few days.
  headline_legacy: string
  subheadline_legacy: string
}

// ─────────────────────────────────────────────────────────────────────
// Type labels (corner pill copy)
// ─────────────────────────────────────────────────────────────────────

var TYPE_LABEL: Record<string, string> = {
  geographic_cluster: 'Geographic cluster',
  temporal_burst: 'Recent burst',
  category_trend: 'Category trend',
  milestone: 'Milestone',
}

// ─────────────────────────────────────────────────────────────────────
// Headline templates per type. The number is embedded in the sentence
// (one appearance — no separate numeric hero block).
// ─────────────────────────────────────────────────────────────────────

function headlineFor(
  type: ClusterCard['type'],
  categoryLabel: string,
  count: number,
  locationLabel: string | undefined,
  timeRange: string,
): string {
  // Strip the trailing "& <other>" combinator so the headline reads
  // naturally — "UFOs & Aliens" → "UFO" / "Alien" sounds wrong as a
  // singular, so we keep the label as-is but rely on the sentence
  // shape to carry the noun.
  var nounLabel = categoryLabel
  switch (type) {
    case 'geographic_cluster': {
      var place = locationLabel || 'one region'
      var win = timeRangeToShort(timeRange)
      return count + ' ' + nounLabel + ' reports from ' + place + ' ' + win + '.'
    }
    case 'temporal_burst': {
      var winT = timeRangeToShort(timeRange)
      return count + ' ' + nounLabel + ' reports ' + winT + '.'
    }
    case 'category_trend': {
      var winC = timeRangeToShort(timeRange)
      return nounLabel + ' is rising ' + winC + '.'
    }
    case 'milestone':
      return 'Paradocs just passed ' + count + ' ' + nounLabel + ' reports.'
    default:
      return count + ' ' + nounLabel + ' reports ' + timeRangeToShort(timeRange) + '.'
  }
}

function timeRangeToShort(range: string): string {
  // "Past 7 days" → "this week"; "Past 30 days" → "this month";
  // anything else flows through unchanged.
  if (/past\s*7\s*days/i.test(range)) return 'this week'
  if (/past\s*30\s*days/i.test(range)) return 'this month'
  if (/past\s*24\s*hours?/i.test(range)) return 'today'
  return range.toLowerCase()
}

// ─────────────────────────────────────────────────────────────────────
// Body fallback — flat templated sentence when Haiku is unavailable
// or returns "INSUFFICIENT". Quiet and declarative.
// ─────────────────────────────────────────────────────────────────────

function fallbackBody(
  type: ClusterCard['type'],
  categoryLabel: string,
  locationLabel: string | undefined,
): string {
  switch (type) {
    case 'geographic_cluster':
      return 'Reports cluster across ' + (locationLabel || 'the region') + '.'
    case 'temporal_burst':
      return 'Recent reports concentrate on the latest stretch of the window.'
    case 'category_trend':
      return categoryLabel + ' activity is up against the trailing average.'
    case 'milestone':
      return 'A round-number marker for the catalogue.'
    default:
      return ''
  }
}

// ─────────────────────────────────────────────────────────────────────
// Baseline ratio — for temporal_burst (and optionally geographic) we
// compare current 7-day count to a 4-week trailing average. Only emit
// a line when the ratio is ≥ 1.5× AND we have at least 4 weeks of
// history to compare against.
// ─────────────────────────────────────────────────────────────────────

function baselineLineFromRatio(currentWeekly: number, weeklyAvg: number): string | undefined {
  if (!weeklyAvg || weeklyAvg < 1) return undefined
  var ratio = currentWeekly / weeklyAvg
  if (ratio < 1.5) return undefined
  // Round to one decimal; floor to integer when ratio is clean.
  var rounded = ratio >= 3 ? Math.round(ratio) + '×' : (Math.round(ratio * 10) / 10) + '×'
  if (rounded === '2×') return 'Twice the usual week.'
  if (rounded === '3×') return 'Three times the usual week.'
  return rounded + ' the usual week.'
}

// ─────────────────────────────────────────────────────────────────────

// V11.18.12 — Sprint 1E. Build a short "City, ST" / "ST, Country" /
// "Country" label for cluster-card rep-report rows. Falls back to the
// truthiest available scrap so the line is never blank.
function shortLocationLabel(r: any): string | null {
  if (!r) return null
  var city = (r.city || '').trim()
  var state = (r.state_province || '').trim()
  var country = (r.country || '').trim()
  if (city && state) return city + ', ' + state
  if (city && country) return city + ', ' + country
  if (state && country) return state + ', ' + country
  if (state) return state
  if (city) return city
  if (country) return country
  if (r.location_text) return String(r.location_text)
  return null
}

// V11.18.12 — Sprint 1E. Relative-time label sized for the cluster
// substance row: "2 days ago" / "yesterday" / "today" / "last week".
// We anchor on `event_date` when present (the witnessed date), else
// `created_at` (the ingest date). Long-form falls back to the
// fmtShortDate format ("Mar 14, 2003") for events more than a year out.
function relativeTimeLabel(isoEvent: string | null | undefined, isoCreated: string | null | undefined): string | null {
  var iso = isoEvent || isoCreated || null
  if (!iso) return null
  try {
    var d = new Date(iso)
    if (isNaN(d.getTime())) return null
    var now = Date.now()
    var diffMs = now - d.getTime()
    var diffDays = Math.floor(diffMs / 86400000)
    if (diffDays < 0) {
      // Future-dated — fall back to absolute.
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return diffDays + ' days ago'
    if (diffDays < 14) return 'last week'
    if (diffDays < 30) return Math.floor(diffDays / 7) + ' weeks ago'
    if (diffDays < 365) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return null
  }
}

// V11.18.12 — Sprint 1E. Pull title/location/date for the first three
// linked-report IDs of a cluster.
//
// V11.18.13 / V11.18.16 history retained above. V11.18.19 — Sprint 1G.
// The founder reported the California UFO cluster still showing an
// empty substance zone despite V11.18.16's `fallbackContext` backstop.
// Three hardenings this pass:
//
//   1) The fallback ALWAYS runs whenever the IN-query returns < 3
//      rows. Previously the fallback was gated on
//      `out.length < 3 && fallbackContext && fallbackContext.category`,
//      which was correct, but the function signature now refuses to be
//      called without a category (defensive log + early return). Every
//      caller in this file already passes a category.
//
//   2) The fallback widens from a 7-day window to a 30-day window.
//      The cluster itself is assembled from a 7-day window (so any
//      missing IDs are most plausibly between-query status changes or
//      ingest-side recency drift) but the substance zone is allowed to
//      pull from a slightly wider band so the card never reads empty
//      just because the past 7 days were too narrow to refill.
//
//   3) A single structured `[loadClusterReports]` log line per
//      invocation captures the diagnostic the founder asked for —
//      cluster shape, IN-query count, fallback count, final total.
//      Lands in Vercel logs even on the success path so the operator
//      can confirm the backstop fired without grepping multiple lines.
//
// Returns up to 3 ClusterRepresentativeReports. May return < 3 (or 0)
// when both the IN-query and the fallback come up empty (e.g. all
// linked reports were deleted AND no other reports in the same shape
// exist within the 30-day window — the cluster will still render but
// the ClusteringCard's substance zone shows the V11.18.19 placeholder
// instead of an empty block).
async function loadClusterReports(
  supabase: any,
  ids: string[],
  fallbackContext: { category: string; state?: string; clusterIdForLog?: string },
): Promise<ClusterRepresentativeReport[]> {
  var firstThree = (ids || []).slice(0, 3)
  var out: ClusterRepresentativeReport[] = []
  var inQueryRowCount = 0

  // ── 1) Resolve the linked IDs (when present). ───────────────────────
  try {
    if (firstThree.length > 0) {
      var repsRes: any = await supabase
        .from('reports')
        .select('id, slug, title, city, state_province, country, location_text, event_date, created_at, status')
        .in('id', firstThree)
      var rows: any[] = (repsRes && repsRes.data) || []
      inQueryRowCount = rows.length
      var byId: Record<string, any> = {}
      for (var i = 0; i < rows.length; i++) byId[String(rows[i].id)] = rows[i]
      for (var j = 0; j < firstThree.length; j++) {
        var r = byId[firstThree[j]]
        if (!r) continue
        out.push({
          id: String(r.id),
          slug: String(r.slug || r.id),
          title: String(r.title || 'Untitled account'),
          location_short: shortLocationLabel(r),
          date_short: relativeTimeLabel(r.event_date, r.created_at),
        })
      }
    }
  } catch (e: any) {
    console.warn('[loadClusterReports] in-query threw', {
      message: e && e.message,
      ids: firstThree,
      cluster: fallbackContext.clusterIdForLog || null,
    })
  }

  // ── 2) Fallback. Always runs when the IN-query produced < 3 rows. ──
  // V11.18.19 — Sprint 1G. Widen to 30 days so the cluster never
  // renders empty just because the recent-7-days window was thin
  // and the IN-query missed.
  var fallbackRowCount = 0
  if (out.length < 3) {
    if (!fallbackContext.category) {
      console.warn('[loadClusterReports] no fallback category — cannot top up empty cluster', {
        cluster: fallbackContext.clusterIdForLog || null,
        in_query_returned: inQueryRowCount,
        out_after_in_query: out.length,
      })
    } else {
      try {
        var seenIds: Record<string, boolean> = {}
        out.forEach(function (r) { seenIds[r.id] = true })
        var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        var query: any = supabase
          .from('reports')
          .select('id, slug, title, city, state_province, country, location_text, event_date, created_at')
          .eq('status', 'approved')
          .eq('category', fallbackContext.category)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(12)
        if (fallbackContext.state) {
          query = query.eq('state_province', fallbackContext.state)
        }
        var fbRes: any = await query
        var fbRows: any[] = (fbRes && fbRes.data) || []
        fallbackRowCount = fbRows.length
        for (var k = 0; k < fbRows.length && out.length < 3; k++) {
          var fb = fbRows[k]
          if (seenIds[String(fb.id)]) continue
          seenIds[String(fb.id)] = true
          out.push({
            id: String(fb.id),
            slug: String(fb.slug || fb.id),
            title: String(fb.title || 'Untitled account'),
            location_short: shortLocationLabel(fb),
            date_short: relativeTimeLabel(fb.event_date, fb.created_at),
          })
        }
      } catch (e: any) {
        console.warn('[loadClusterReports] fallback threw', {
          message: e && e.message,
          category: fallbackContext.category,
          state: fallbackContext.state || null,
          cluster: fallbackContext.clusterIdForLog || null,
        })
      }
    }
  }

  // ── 3) Structured single-line diagnostic — ALWAYS emitted. ─────────
  // Founder asked for: `cluster=X, in_query=N, fallback=M, total=K`.
  // This is the single line that surfaces in Vercel logs on every
  // cluster build so the operator can audit the backstop on demand.
  console.log('[loadClusterReports]', {
    cluster: fallbackContext.clusterIdForLog || null,
    category: fallbackContext.category,
    state: fallbackContext.state || null,
    ids_supplied: firstThree.length,
    in_query: inQueryRowCount,
    fallback: fallbackRowCount,
    total: out.length,
  })

  return out
}

function categoryLabelOf(slug: string): string {
  var cfg = (CATEGORY_CONFIG as any)[slug]
  if (cfg && cfg.label) return cfg.label
  // Fallback: title-case the slug
  return String(slug || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, function (c: string) { return c.toUpperCase() })
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    var supabase = getSupabase()
    var clusters: ClusterCard[] = []
    var nowIso = new Date().toISOString()

    // ── Geographic clusters: 3+ approved reports in same state + cat in 7 days
    var sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    var fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()

    var { data: geoRaw } = await supabase
      .from('reports')
      .select('id, category, state_province, country')
      .eq('status', 'approved')
      .not('state_province', 'is', null)
      .gte('created_at', sevenDaysAgo)

    // Trailing-4-week counts per (state, category) so we can emit a
    // baseline ratio for the strongest geographic clusters.
    var { data: geoTrailingRaw } = await supabase
      .from('reports')
      .select('category, state_province')
      .eq('status', 'approved')
      .not('state_province', 'is', null)
      .gte('created_at', fourWeeksAgo)
      .lt('created_at', sevenDaysAgo)

    var trailingByKey: Record<string, number> = {}
    ;(geoTrailingRaw || []).forEach(function (r: any) {
      var key = (r.state_province || '') + '|' + (r.category || '')
      trailingByKey[key] = (trailingByKey[key] || 0) + 1
    })

    if (geoRaw && geoRaw.length > 0) {
      var geoGroups: Record<string, any[]> = {}
      geoRaw.forEach(function (r: any) {
        var key = (r.state_province || '') + '|' + (r.category || '')
        if (!geoGroups[key]) geoGroups[key] = []
        geoGroups[key].push(r)
      })

      // V11.18.21 — Surgical fix #1. Sort + slice BEFORE the Haiku
      // loop. The endpoint only ever serves 5 clusters via
      // sessionSeed % length, but the prior code built a Haiku finding
      // for EVERY (state, category) group with ≥ 3 reports — 64+
      // serial 12s-timeout Haiku calls in production, vs the 15s
      // Vercel function ceiling. We now take the top 8 by report_count
      // (a 5-card pool + small headroom for the slice-by-N picker)
      // and only call Haiku for those. See
      // docs/CLUSTERS_ENDPOINT_DIAGNOSIS.md for the full trace.
      var topGeographic = Object.keys(geoGroups)
        .map(function (k) { return { key: k, group: geoGroups[k] } })
        .filter(function (e) { return e.group.length >= 3 })
        .sort(function (a, b) { return b.group.length - a.group.length })
        .slice(0, 8)

      // V11.18.21 — Surgical fix #2. Promise.all the per-cluster work.
      // Within a cluster the Haiku call and the rep-report fetch are
      // independent; across clusters everything is independent. Run
      // them concurrently so total wall-clock collapses to
      // max(Haiku) ≈ 1–3s rather than 8 × (Haiku + Supabase RTT).
      var geographicCards = await Promise.all(topGeographic.map(async function (entry) {
        var keyG = entry.key
        var group = entry.group
        var parts = keyG.split('|')
        var state = parts[0]
        var catSlug = parts[1]
        var catLabel = categoryLabelOf(catSlug)
        var firstCountry = group[0].country || ''
        var locationLabel = state + (firstCountry ? ', ' + firstCountry : '')
        var ids = group.map(function (r: any) { return r.id })

        var headline = headlineFor('geographic_cluster', catLabel, group.length, state, 'Past 7 days')

        // Trailing 4-week weekly average for this (state, category).
        var trailingTotal = trailingByKey[keyG] || 0
        var weeklyAvg = trailingTotal > 0 ? trailingTotal / 3 : 0  // 3 prior weeks (week 0 = current)
        var baselineText = baselineLineFromRatio(group.length, weeklyAvg)

        var clusterIdGeo = 'geo-' + keyG.replace(/[^a-z0-9]/gi, '-')

        // V11.18.21 — Inner Promise.all. Haiku finding + rep-report
        // fetch run side by side. Both already swallow errors
        // (`.catch(() => null)` / try/catch in helper) so a single
        // failure can't reject the whole cluster.
        var pair = await Promise.all([
          generateClusterFinding({
            cluster_type: 'geographic_cluster',
            category_label: catLabel,
            location_summary: locationLabel,
            report_count: group.length,
            time_range: 'Past 7 days',
            linked_report_ids: ids,
          }).catch(function () { return null }),
          loadClusterReports(supabase, ids, {
            category: catSlug,
            state: state,
            clusterIdForLog: clusterIdGeo,
          }),
        ])
        var haikuBody = pair[0]
        var repReports = pair[1]

        var body = haikuBody || fallbackBody('geographic_cluster', catLabel, state)

        var card: ClusterCard = {
          id: clusterIdGeo,
          type: 'geographic_cluster',
          // V11.18.13 — Sprint 1E fixes. Emit cluster_type in addition
          // to `type` so the ClusterCardData interface on the
          // ClusteringCard component (which expects `cluster_type`) gets
          // the value through Object.assign in discover.tsx. Without
          // this the milestone-dot conditional was always false; not a
          // substance-zone blocker but corrects a quiet shape drift.
          cluster_type: 'geographic_cluster',
          type_label: TYPE_LABEL.geographic_cluster,
          headline: headline,
          body: body,
          baseline_text: baselineText,
          category: catSlug,
          category_label: catLabel,
          report_count: group.length,
          time_range: 'Past 7 days',
          location_summary: locationLabel,
          linked_report_ids: ids,
          representative_reports: repReports,
          generated_at: nowIso,
          headline_legacy: group.length + ' ' + catLabel + ' reports from ' + state,
          subheadline_legacy: 'A concentration of activity detected in ' + state + ' over the past week.',
        }
        return card
      }))

      for (var gi = 0; gi < geographicCards.length; gi++) {
        clusters.push(geographicCards[gi])
      }
    }

    // ── Temporal bursts: unusual volume in a category vs. monthly avg
    var { data: recentCounts } = await supabase
      .from('reports')
      .select('id, category')
      .eq('status', 'approved')
      .gte('created_at', sevenDaysAgo)

    var { data: monthlyCounts } = await supabase
      .from('reports')
      .select('category')
      .eq('status', 'approved')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    if (recentCounts && monthlyCounts) {
      var weeklyByCat: Record<string, number> = {}
      var monthlyByCat: Record<string, number> = {}
      var weeklyIdsByCat: Record<string, string[]> = {}

      recentCounts.forEach(function (r: any) {
        weeklyByCat[r.category] = (weeklyByCat[r.category] || 0) + 1
        if (!weeklyIdsByCat[r.category]) weeklyIdsByCat[r.category] = []
        if (weeklyIdsByCat[r.category].length < 24) weeklyIdsByCat[r.category].push(r.id)
      })
      monthlyCounts.forEach(function (r: any) {
        monthlyByCat[r.category] = (monthlyByCat[r.category] || 0) + 1
      })

      // V11.18.21 — Surgical fix #1 (temporal-burst arm). Filter the
      // candidates THEN sort + cap to top 4 before any Haiku work.
      // Categories with the largest weekly counts win ties — same
      // shape as the geographic arm.
      var topBursts = Object.keys(weeklyByCat)
        .filter(function (catB) {
          var weeklyAvgB = (monthlyByCat[catB] || 0) / 4
          var thisWeek = weeklyByCat[catB]
          return thisWeek > weeklyAvgB * 1.5 && thisWeek >= 5
        })
        .sort(function (a, b) { return weeklyByCat[b] - weeklyByCat[a] })
        .slice(0, 4)

      // V11.18.21 — Surgical fix #2 (temporal-burst arm). Promise.all
      // across the (small) burst pool; inner Promise.all for
      // Haiku + rep-report fetch.
      var burstCards = await Promise.all(topBursts.map(async function (catB) {
        var weeklyAvgB = (monthlyByCat[catB] || 0) / 4
        var thisWeek = weeklyByCat[catB]
        var catLabelB = categoryLabelOf(catB)
        var headlineB = headlineFor('temporal_burst', catLabelB, thisWeek, undefined, 'Past 7 days')
        var baselineB = baselineLineFromRatio(thisWeek, weeklyAvgB)
        var idsB = weeklyIdsByCat[catB] || []
        var clusterIdBurst = 'burst-' + catB

        var pairB = await Promise.all([
          generateClusterFinding({
            cluster_type: 'temporal_burst',
            category_label: catLabelB,
            report_count: thisWeek,
            time_range: 'Past 7 days',
            linked_report_ids: idsB,
          }).catch(function () { return null }),
          loadClusterReports(supabase, idsB, {
            category: catB,
            clusterIdForLog: clusterIdBurst,
          }),
        ])
        var haikuBodyB = pairB[0]
        var repReportsB = pairB[1]

        var bodyB = haikuBodyB || fallbackBody('temporal_burst', catLabelB, undefined)

        var card: ClusterCard = {
          id: 'burst-' + catB,
          type: 'temporal_burst',
          // V11.18.13 — Sprint 1E fixes. See geographic_cluster above.
          cluster_type: 'temporal_burst',
          type_label: TYPE_LABEL.temporal_burst,
          headline: headlineB,
          body: bodyB,
          baseline_text: baselineB,
          category: catB,
          category_label: catLabelB,
          report_count: thisWeek,
          time_range: 'Past 7 days',
          linked_report_ids: idsB,
          representative_reports: repReportsB,
          generated_at: nowIso,
          headline_legacy: catLabelB + ' activity surging',
          subheadline_legacy: thisWeek + ' reports this week.',
        }
        return card
      }))

      for (var bi = 0; bi < burstCards.length; bi++) {
        clusters.push(burstCards[bi])
      }
    }

    // Sort: geographic clusters first (more specific), then bursts; ties broken by count.
    clusters.sort(function (a, b) {
      if (a.type === 'geographic_cluster' && b.type !== 'geographic_cluster') return -1
      if (a.type !== 'geographic_cluster' && b.type === 'geographic_cluster') return 1
      return b.report_count - a.report_count
    })

    // Top 5 to feed the variety logic in discover.tsx.
    clusters = clusters.slice(0, 5)

    // V11.18.21 — Surgical fix #3. Bump CDN cache from 60s → 1 hour
    // with a 5-minute SWR. Clusters are weekly-rollup shapes that
    // drift over hours/days, not seconds — the 60s TTL was tuned for
    // V11.18.13's tight QA loop and now mostly serves a hot
    // fallback-mask for the cold-path timeout. A 1-hour edge cache
    // slashes load on the function dramatically and is safe for the
    // cadence at which geographic clusters actually shift.
    // `public` so Vercel's edge actually honours it; `stale-while-
    // revalidate=300` gives the next user a fresh response within
    // five minutes of expiry without ever waiting on a cold rebuild.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=300')

    return res.status(200).json({ clusters: clusters })
  } catch (error) {
    console.error('[Clusters] Error:', error)
    return res.status(500).json({ error: 'Internal error' })
  }
}

// V11.18.21 — Surgical fix #4. Bump the Vercel function ceiling to
// 30s. With fixes #1+#2 the endpoint should respond in 3–5s on a
// cold execution, but this is belt+suspenders — a one-off Haiku
// stall at the 12s client-side timeout still has 18s of headroom
// instead of blowing past the platform default (10–15s on Pro Node)
// mid-response. No other route on /api/discover/* sets maxDuration
// so this is local to clusters and reversible.
export const config = {
  maxDuration: 30,
}
