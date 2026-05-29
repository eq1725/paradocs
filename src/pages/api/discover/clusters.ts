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

interface ClusterCard {
  id: string
  type: 'geographic_cluster' | 'temporal_burst' | 'category_trend' | 'milestone'
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

      for (var keyG of Object.keys(geoGroups)) {
        var group = geoGroups[keyG]
        if (group.length < 3) continue
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

        // v2 — Haiku finding sentence. Falls back to a quiet templated
        // body when Haiku is unavailable or returns INSUFFICIENT.
        var haikuBody = await generateClusterFinding({
          cluster_type: 'geographic_cluster',
          category_label: catLabel,
          location_summary: locationLabel,
          report_count: group.length,
          time_range: 'Past 7 days',
          linked_report_ids: ids,
        }).catch(function () { return null })

        var body = haikuBody || fallbackBody('geographic_cluster', catLabel, state)

        clusters.push({
          id: 'geo-' + keyG.replace(/[^a-z0-9]/gi, '-'),
          type: 'geographic_cluster',
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
          generated_at: nowIso,
          headline_legacy: group.length + ' ' + catLabel + ' reports from ' + state,
          subheadline_legacy: 'A concentration of activity detected in ' + state + ' over the past week.',
        })
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

      for (var catB of Object.keys(weeklyByCat)) {
        var weeklyAvgB = (monthlyByCat[catB] || 0) / 4
        var thisWeek = weeklyByCat[catB]
        if (!(thisWeek > weeklyAvgB * 1.5 && thisWeek >= 5)) continue
        var catLabelB = categoryLabelOf(catB)
        var headlineB = headlineFor('temporal_burst', catLabelB, thisWeek, undefined, 'Past 7 days')
        var baselineB = baselineLineFromRatio(thisWeek, weeklyAvgB)
        var idsB = weeklyIdsByCat[catB] || []
        var haikuBodyB = await generateClusterFinding({
          cluster_type: 'temporal_burst',
          category_label: catLabelB,
          report_count: thisWeek,
          time_range: 'Past 7 days',
          linked_report_ids: idsB,
        }).catch(function () { return null })
        var bodyB = haikuBodyB || fallbackBody('temporal_burst', catLabelB, undefined)
        clusters.push({
          id: 'burst-' + catB,
          type: 'temporal_burst',
          type_label: TYPE_LABEL.temporal_burst,
          headline: headlineB,
          body: bodyB,
          baseline_text: baselineB,
          category: catB,
          category_label: catLabelB,
          report_count: thisWeek,
          time_range: 'Past 7 days',
          linked_report_ids: idsB,
          generated_at: nowIso,
          headline_legacy: catLabelB + ' activity surging',
          subheadline_legacy: thisWeek + ' reports this week.',
        })
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

    // 10-minute CDN cache. Within a session the variety logic picks
    // one cluster from this list via sessionSeed % length.
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800')

    return res.status(200).json({ clusters: clusters })
  } catch (error) {
    console.error('[Clusters] Error:', error)
    return res.status(500).json({ error: 'Internal error' })
  }
}
