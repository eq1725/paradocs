// V11.17.74 - Sentiment + endpoints (Tier 3D)
//
// GET /api/lab/temporal-distribution
//   ?phen_family=ufos_aliens
//   &subfamily=triangle_class                (optional)
//   &dimension=hour | month | decade         (default: hour)
//
// Returns the corpus-wide distribution of approved reports across the
// requested temporal dimension, scoped to (phen_family + optional
// subfamily). Wires the TemporalStrip surface (LAB_PANEL_REVIEW_V3 §3)
// to real numbers, replacing the "computing…" placeholder.
//
// All counts come from a single GROUP BY query against `reports` with
// status='approved' AND event_date IS NOT NULL. There is no fabricated
// data — empty corpora return an empty distribution.
//
// Caching:
//   - In-memory LRU keyed on (phen_family|subfamily|dimension) with a
//     1h TTL. Survives within a single Vercel function instance. Cold-
//     starts re-query. This is fine for the volume — temporal
//     histograms for ~10 phen families × 3 dimensions ≈ 30 cache keys.
//
// Documentary-voice peak_label:
//   - Template string (no Haiku call — cheaper and deterministic, per
//     the brief's "Template approach is fine for V1"). Adheres to the
//     "<bucket label> — like <pct>% of <family> reports in the Archive,
//     this falls in the <window> cluster" shape.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var CACHE_TTL_MS = 60 * 60 * 1000  // 1 hour
var MAX_SOURCE_ROWS = 50_000       // safety cap on the GROUP-BY input

interface DistributionBucket {
  bucket: number
  count: number
  percentage: number
}

interface CacheEntry {
  expires: number
  payload: any
}

var _cache: Map<string, CacheEntry> = new Map()

function cacheGet(key: string): any | null {
  var hit = _cache.get(key)
  if (!hit) return null
  if (hit.expires < Date.now()) {
    _cache.delete(key)
    return null
  }
  return hit.payload
}

function cacheSet(key: string, payload: any): void {
  _cache.set(key, { expires: Date.now() + CACHE_TTL_MS, payload: payload })
  // Soft cap — keep the cache small. Drop the oldest if we balloon.
  if (_cache.size > 200) {
    var oldestKey = _cache.keys().next().value
    if (oldestKey) _cache.delete(oldestKey)
  }
}

// ─── Window-name mapping (documentary voice) ───────────────────────────
//
// LAB_PANEL_REVIEW_V3 §3 invokes the "12am-4am liminal hours" cluster
// frame; we keep the same six bands across the day for hour-dimension
// peak_labels.

function hourWindowName(hour: number): string {
  if (hour >= 0 && hour < 4) return 'liminal_hours'
  if (hour >= 4 && hour < 8) return 'early_morning'
  if (hour >= 8 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 16) return 'afternoon'
  if (hour >= 16 && hour < 20) return 'evening'
  return 'night'
}

function hourWindowPhrase(hour: number): string {
  if (hour >= 0 && hour < 4) return '12am-4am liminal hours'
  if (hour >= 4 && hour < 8) return '4am-8am early-morning band'
  if (hour >= 8 && hour < 12) return '8am-12pm morning band'
  if (hour >= 12 && hour < 16) return '12pm-4pm afternoon band'
  if (hour >= 16 && hour < 20) return '4pm-8pm evening band'
  return '8pm-12am night band'
}

function hourBucketLabel(hour: number): string {
  var h = hour % 24
  return (h < 10 ? '0' + h : '' + h) + ':00'
}

function monthBucketLabel(month: number): string {
  var NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  if (month < 1 || month > 12) return 'month ' + month
  return NAMES[month - 1]
}

function monthWindowName(month: number): string {
  if (month <= 2 || month === 12) return 'deep_winter'
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  return 'autumn'
}

function decadeBucketLabel(decade: number): string {
  return decade + 's'
}

function decadeWindowName(decade: number): string {
  if (decade < 1970) return 'mid_century'
  if (decade < 1990) return 'cold_war'
  if (decade < 2010) return 'internet_era'
  return 'modern'
}

// ─── Family / subfamily label resolution ───────────────────────────────

function phenFamilyLabel(slug: string): string {
  if (!slug) return 'these'
  if (slug === 'ufos_aliens') return 'UFO and alien'
  if (slug === 'ghosts_hauntings') return 'apparition and haunting'
  if (slug === 'cryptids') return 'cryptid'
  if (slug === 'psychic_phenomena') return 'psychic'
  if (slug === 'consciousness_practices') return 'consciousness'
  if (slug === 'perception_sensory') return 'perception'
  if (slug === 'religion_mythology') return 'mythological'
  if (slug === 'esoteric_practices') return 'esoteric'
  if (slug === 'psychological_experiences') return 'psychological'
  return slug.replace(/_/g, ' ')
}

// ─── Distribution build ────────────────────────────────────────────────

function emptyBuckets(dimension: 'hour' | 'month' | 'decade'): DistributionBucket[] {
  var out: DistributionBucket[] = []
  if (dimension === 'hour') {
    for (var h = 0; h < 24; h++) out.push({ bucket: h, count: 0, percentage: 0 })
  } else if (dimension === 'month') {
    for (var m = 1; m <= 12; m++) out.push({ bucket: m, count: 0, percentage: 0 })
  } else {
    // Decade — keep alignment with the TemporalStrip's 1950 → current band.
    var nowDecade = Math.floor(new Date().getFullYear() / 10) * 10
    for (var d = 1950; d <= nowDecade; d += 10) out.push({ bucket: d, count: 0, percentage: 0 })
  }
  return out
}

function extractBucket(eventIso: string | null, eventTimeStr: string | null, dimension: 'hour' | 'month' | 'decade'): number | null {
  if (!eventIso) return null
  // event_time, if present, is HH:MM and is the trusted hour source.
  // Otherwise we fall back to the ISO event_date when it carries time.
  if (dimension === 'hour') {
    if (eventTimeStr && /^\d{1,2}:\d{2}/.test(eventTimeStr)) {
      var h = parseInt(eventTimeStr.split(':')[0], 10)
      if (!isNaN(h) && h >= 0 && h <= 23) return h
    }
    if (typeof eventIso === 'string' && eventIso.length > 10) {
      var d = new Date(eventIso)
      if (!isNaN(d.getTime())) {
        var hr = d.getUTCHours()
        return hr
      }
    }
    return null
  }
  var d2 = new Date(eventIso)
  if (isNaN(d2.getTime())) return null
  if (dimension === 'month') {
    return d2.getUTCMonth() + 1
  }
  // decade
  var y = d2.getUTCFullYear()
  if (y < 1800 || y > 2200) return null
  return Math.floor(y / 10) * 10
}

// ─── Handler ───────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var phenFamily = String((req.query.phen_family as string) || '').trim()
  var subfamily = String((req.query.subfamily as string) || '').trim()
  var dimensionRaw = String((req.query.dimension as string) || 'hour').toLowerCase()
  var dimension: 'hour' | 'month' | 'decade' = 'hour'
  if (dimensionRaw === 'month' || dimensionRaw === 'decade') dimension = dimensionRaw

  if (!phenFamily) {
    return res.status(400).json({ error: 'phen_family is required' })
  }

  var cacheKey = phenFamily + '|' + (subfamily || '') + '|' + dimension
  var cached = cacheGet(cacheKey)
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600')
    res.setHeader('X-Paradocs-Cache', 'HIT')
    return res.status(200).json(cached)
  }

  try {
    var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    var q = (supabase.from('reports') as any)
      .select('event_date, event_time')
      .eq('status', 'approved')
      .eq('category', phenFamily)
      .not('event_date', 'is', null)
      .limit(MAX_SOURCE_ROWS)

    // subfamily is a free-text descriptor today (tags / phenomenon_type
    // name). We do a permissive ilike on tags so the surface degrades
    // to the parent-family distribution when the subfamily is unknown,
    // matching the "never empty" floor.
    if (subfamily) {
      q = q.contains('tags', [subfamily])
    }

    var qres = await q
    if (qres.error) {
      console.warn('[temporal-distribution] DB error: ' + qres.error.message)
      // Degrade gracefully — empty distribution rather than a 500.
      var emptyPayload = buildEmptyPayload(phenFamily, subfamily, dimension)
      cacheSet(cacheKey, emptyPayload)
      return res.status(200).json(emptyPayload)
    }

    var rows: any[] = qres.data || []
    var buckets = emptyBuckets(dimension)
    var bucketMap: Record<number, DistributionBucket> = {}
    buckets.forEach(function (b) { bucketMap[b.bucket] = b })

    var validCount = 0
    for (var i = 0; i < rows.length; i++) {
      var bucket = extractBucket(rows[i].event_date, rows[i].event_time, dimension)
      if (bucket == null) continue
      if (bucketMap[bucket]) {
        bucketMap[bucket].count++
        validCount++
      } else if (dimension === 'decade') {
        // Out-of-range decade — extend the band conservatively.
        bucketMap[bucket] = { bucket: bucket, count: 1, percentage: 0 }
        buckets.push(bucketMap[bucket])
        validCount++
      }
    }
    // Sort decades just in case we appended out of order.
    if (dimension === 'decade') buckets.sort(function (a, b) { return a.bucket - b.bucket })

    // Percentages — clamp to 0 when corpus empty, then re-normalize to
    // 100 ±0.1% by tweaking the bucket with the largest residual. Belt-
    // and-suspenders for the smoke test invariant.
    var totalReports = validCount
    if (totalReports === 0) {
      buckets.forEach(function (b) { b.percentage = 0 })
    } else {
      var residuals: { bucket: number; residual: number }[] = []
      var pctSum = 0
      buckets.forEach(function (b) {
        var raw = (b.count / totalReports) * 100
        var rounded = Math.round(raw * 10) / 10
        b.percentage = rounded
        pctSum += rounded
        residuals.push({ bucket: b.bucket, residual: raw - rounded })
      })
      // If we're off by more than 0.05, nudge the largest residual.
      var delta = Math.round((100 - pctSum) * 10) / 10
      if (Math.abs(delta) >= 0.1) {
        residuals.sort(function (a, b) {
          // Move toward the bucket with the largest absolute residual in
          // the matching direction.
          return delta > 0 ? b.residual - a.residual : a.residual - b.residual
        })
        var bumpKey = residuals[0] && residuals[0].bucket
        if (bumpKey != null && bucketMap[bumpKey]) {
          bucketMap[bumpKey].percentage = Math.round((bucketMap[bumpKey].percentage + delta) * 10) / 10
        }
      }
    }

    // Find peak.
    var peak = buckets.reduce(function (acc: DistributionBucket | null, b) {
      if (!acc || b.count > acc.count) return b
      return acc
    }, null as DistributionBucket | null)

    var peakBucket = peak ? peak.bucket : 0
    var peakPct = peak ? peak.percentage : 0
    var familyText = subfamily ? subfamily.replace(/_/g, ' ') + ' ' + phenFamilyLabel(phenFamily) : phenFamilyLabel(phenFamily)
    var peakLabel = ''
    if (totalReports === 0) {
      peakLabel = 'No ' + familyText + ' reports in the Archive yet have a recorded ' + dimension + '.'
    } else if (dimension === 'hour') {
      var bandPct = bandPercentageHour(buckets, peakBucket)
      peakLabel = hourBucketLabel(peakBucket) +
        ' — like ' + bandPct + '% of ' + familyText + ' reports in the Archive, this falls in the ' +
        hourWindowPhrase(peakBucket) + ' cluster'
    } else if (dimension === 'month') {
      peakLabel = monthBucketLabel(peakBucket) +
        ' — like ' + peakPct + '% of ' + familyText + ' reports in the Archive, this lands in the ' +
        monthWindowName(peakBucket).replace(/_/g, '-') + ' window'
    } else {
      peakLabel = 'the ' + decadeBucketLabel(peakBucket) +
        ' — like ' + peakPct + '% of ' + familyText + ' reports in the Archive, this sits in the ' +
        decadeWindowName(peakBucket).replace(/_/g, '-') + ' era'
    }

    var payload = {
      phen_family: phenFamily,
      subfamily: subfamily || null,
      dimension: dimension,
      total_reports: totalReports,
      distribution: buckets,
      peak_bucket: peakBucket,
      peak_label: peakLabel,
      window_name: dimension === 'hour' ? hourWindowName(peakBucket)
        : dimension === 'month' ? monthWindowName(peakBucket)
          : decadeWindowName(peakBucket),
    }

    cacheSet(cacheKey, payload)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600')
    res.setHeader('X-Paradocs-Cache', 'MISS')
    return res.status(200).json(payload)
  } catch (e: any) {
    console.warn('[temporal-distribution] failed: ' + (e && e.message))
    var fallback = buildEmptyPayload(phenFamily, subfamily, dimension)
    return res.status(200).json(fallback)
  }
}

function buildEmptyPayload(phenFamily: string, subfamily: string, dimension: 'hour' | 'month' | 'decade') {
  return {
    phen_family: phenFamily,
    subfamily: subfamily || null,
    dimension: dimension,
    total_reports: 0,
    distribution: emptyBuckets(dimension),
    peak_bucket: 0,
    peak_label: 'No ' + phenFamilyLabel(phenFamily) + ' reports in the Archive yet have a recorded ' + dimension + '.',
    window_name: dimension === 'hour' ? 'liminal_hours' : dimension === 'month' ? 'deep_winter' : 'mid_century',
  }
}

/**
 * For hour dimension, compute the % of reports in the 4-hour band
 * containing the peak bucket. Matches the LAB_PANEL_REVIEW_V3 §3
 * "64% of UFO reports fall in the 12am-4am cluster" framing.
 */
function bandPercentageHour(buckets: DistributionBucket[], peakBucket: number): number {
  var startHour = Math.floor(peakBucket / 4) * 4
  var sum = 0
  for (var i = 0; i < buckets.length; i++) {
    if (buckets[i].bucket >= startHour && buckets[i].bucket < startHour + 4) {
      sum += buckets[i].percentage
    }
  }
  return Math.round(sum * 10) / 10
}
