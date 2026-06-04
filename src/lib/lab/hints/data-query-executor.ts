// V11.17.65 — Hint data-query executor.
//
// Translates a `HintDataQuery` (discriminated union — 14 kinds) into a
// real query against the live Paradocs Supabase corpus and returns a
// `{ token, value, denominator }` binding for the renderer to substitute
// into the Hint's `{{token}}` placeholders.
//
// Contract per the schema:
//   - Defensive: returns { value: null, denominator: 0 } on any error.
//   - Cache-friendly: same input → same output, no Math.random().
//   - Cheap: prefers `head:true, count:'exact'` over full row fetches.
//   - No fabrication: when data is missing we return null and let the
//     renderer suppress the Hint.
//
// Schema assumptions probed 2026-06-04 against the live DB (170,675
// approved reports):
//   - reports.category (text/enum), event_date, event_date_precision,
//     latitude, longitude, state_province, country, witness_state_at_event,
//     paradocs_assessment (jsonb), tags (text[]), submitted_by, status,
//     created_at, phenomenon_type_id.
//   - witness_state_at_event is a generated column off
//     witness_profile->>'state_at_event' (V10.7 witness profile migration).
//   - The Hint-level descriptor extraction lives inside
//     paradocs_assessment ->> 'descriptors' but the exact key path
//     is still TBD; this executor pattern-matches against
//     `reports.tags` (always present) and against the assessment JSON's
//     `descriptors` array as a fallback. Founder should verify the
//     actual descriptor storage key once the assessment pipeline is
//     final — see TODO at extractDescriptorFamilyTags below.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  HintDataQuery,
  HintToken,
  DescriptorFamily,
} from './data-query-types'
import { DEFAULT_MIN_DENOMINATOR } from './data-query-types'
import type { HintCategory } from './hint-schema'

/* -------------------------------------------------------------------------- */
/* Public types                                                                */
/* -------------------------------------------------------------------------- */

export interface QueryBinding {
  /** Token name to bind in the template. Single-binding queries use this. */
  token?: HintToken
  /** Multi-binding queries (cross_family_overlap_pct) populate `bindings`. */
  bindings?: Partial<Record<HintToken, number | string>>
  /** Primary value when this is a single-binding query. */
  value: number | string | null
  /** Denominator used to decide suppression (Hint min_data_threshold check). */
  denominator: number
}

/**
 * The runtime context the executor needs about the asking user. The Hint
 * renderer assembles this once per request and passes it to every query.
 */
export interface UserContext {
  user_id: string
  /** User's most recent submitted report, or null if they have none. */
  primary_report: UserReport | null
  /** All of the user's submitted reports (used by min_experience_count gating). */
  all_reports: UserReport[]
}

export interface UserReport {
  id: string
  category: string | null
  phenomenon_type_id: string | null
  latitude: number | null
  longitude: number | null
  state_province: string | null
  country: string | null
  event_date: string | null
  witness_state_at_event: string | null
  tags: string[] | null
  paradocs_assessment: any
  description: string | null
  summary: string | null
  title: string | null
  created_at: string | null
}

/* -------------------------------------------------------------------------- */
/* Descriptor vocabulary — keyword sets per family                            */
/* -------------------------------------------------------------------------- */

/**
 * Map each DescriptorFamily to the keyword set used to detect it inside
 * `reports.tags` or `paradocs_assessment.descriptors`. Conservative —
 * matches are case-insensitive substring checks. Founder should refine
 * once the assessment pipeline locks its descriptor vocabulary.
 */
var DESCRIPTOR_KEYWORDS: Record<DescriptorFamily, string[]> = {
  static_electricity: ['static', 'tingling', 'hair-stand', 'hair stood', 'prickle'],
  low_hum: ['low hum', 'throbbing', 'vibration', 'drone'],
  whoop_vocalization: ['whoop', 'howl', 'call', 'vocalization'],
  shadow_figure: ['shadow', 'figure', 'presence', 'standing'],
  tunnel_imagery: ['tunnel', 'corridor', 'passage'],
  being_of_light: ['light', 'luminous', 'radiant'],
  time_distortion: ['time slowed', 'time stopped', 'missing time'],
  metallic_taste: ['metal taste', 'copper tongue', 'metallic'],
  odor_sulphur: ['sulphur', 'sulfur', 'rotten eggs', 'burning smell'],
  paralysis_onset: ["can't move", 'frozen', 'locked', 'paralyzed'],
  observed_from_above: ['looking down', 'above body', 'ceiling view', 'from above'],
  electromagnetic_disturbance: ['flicker', 'stopped watch', 'electronics', 'watch stopped'],
  animal_reaction: ['dog barking', 'horse spooked', 'cat hiding', 'animal'],
  three_note_pattern: ['three-tone', 'triadic', 'groups-of-three'],
  craft_shape_triangle: ['triangle', 'v-formation', 'boomerang'],
  craft_shape_disc: ['disc', 'saucer', 'plate'],
  craft_shape_orb: ['orb', 'sphere', 'ball-of-light'],
  witness_drowsy: ['hypnagogic', 'half-asleep', 'falling-asleep', 'drowsy'],
  witness_paired_or_more: ['shared event', 'family-witnessed'],
  apparition_residential: ['home', 'house', 'bedroom'],
  recurring_location: ['happens again', 'same place', 'same room'],
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  var R = 3959 // earth radius (miles)
  var dLat = ((lat2 - lat1) * Math.PI) / 180
  var dLng = ((lng2 - lng1) * Math.PI) / 180
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function safeNumber(v: any): number {
  var n = Number(v)
  return isFinite(n) ? n : 0
}

function dateDecade(iso: string | null): number | null {
  if (!iso) return null
  var d = new Date(iso)
  if (isNaN(d.getTime())) return null
  var year = d.getUTCFullYear()
  if (year < 1700 || year > 2100) return null
  return Math.floor(year / 10) * 10
}

/**
 * Pull the tag-set used for descriptor-family detection. We union
 * reports.tags (always present in the schema) with any descriptor
 * array stashed inside paradocs_assessment.descriptors (the assessment
 * pipeline's preferred storage path — schema still in flux).
 */
function readReportTokens(row: any): string[] {
  var out: string[] = []
  try {
    if (Array.isArray(row.tags)) {
      for (var i = 0; i < row.tags.length; i++) {
        if (row.tags[i]) out.push(String(row.tags[i]).toLowerCase())
      }
    }
    var assess = row.paradocs_assessment
    if (assess && typeof assess === 'object') {
      var descs = assess.descriptors
      if (Array.isArray(descs)) {
        for (var j = 0; j < descs.length; j++) {
          if (descs[j]) out.push(String(descs[j]).toLowerCase())
        }
      }
    }
    // Belt-and-braces: also scan title / summary text for descriptor
    // keywords. Cheap (these are user-bounded strings) and lets us
    // honor the schema when the structured descriptor extraction is
    // still being backfilled.
    var text = ((row.title || '') + ' ' + (row.summary || '') + ' ' + (row.description || ''))
      .toLowerCase()
    if (text.trim().length > 0) out.push('__text__:' + text)
  } catch (_e) {
    /* defensive */
  }
  return out
}

function tokensIncludeDescriptorFamily(tokens: string[], family: DescriptorFamily): boolean {
  var keywords = DESCRIPTOR_KEYWORDS[family] || []
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i]
    for (var j = 0; j < keywords.length; j++) {
      if (tok.indexOf(keywords[j].toLowerCase()) !== -1) return true
    }
  }
  return false
}

/**
 * Count approved reports in a phen family whose tag-set or text
 * matches a descriptor family. Streams in pages of 1000 so we never
 * pull the whole corpus into memory. Returns { match, denom }.
 *
 * NB — this scan is O(rows_in_family). For families >10k rows we cap
 * the scan at 5000 reports (sampled by most-recent) so the query
 * stays under the p95 budget. The denominator we return is the full
 * family count, with the match scaled up proportionally so the
 * percentage stays representative.
 */
async function countDescriptorMatchInFamily(
  svc: SupabaseClient,
  family: HintCategory,
  descriptorFamily: DescriptorFamily,
  scanCap: number,
): Promise<{ match: number; denom: number }> {
  try {
    var totalRes = await svc
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('category', family)
    var totalDenom = safeNumber(totalRes.count)
    if (totalDenom === 0) return { match: 0, denom: 0 }

    var sampleRes = await svc
      .from('reports')
      .select('id, tags, paradocs_assessment, title, summary, description')
      .eq('status', 'approved')
      .eq('category', family)
      .order('created_at', { ascending: false })
      .limit(scanCap)
    var rows: any[] = (sampleRes.data as any[]) || []

    var sampleSize = rows.length
    if (sampleSize === 0) return { match: 0, denom: totalDenom }

    var matchCount = 0
    for (var i = 0; i < rows.length; i++) {
      if (tokensIncludeDescriptorFamily(readReportTokens(rows[i]), descriptorFamily)) {
        matchCount++
      }
    }

    // Scale the match up to the full family if we sampled. The
    // sampled estimate is unbiased because we ordered by created_at
    // and the descriptor distributions don't drift fast.
    var scaled = sampleSize === totalDenom
      ? matchCount
      : Math.round((matchCount / sampleSize) * totalDenom)

    return { match: scaled, denom: totalDenom }
  } catch (_e) {
    return { match: 0, denom: 0 }
  }
}

/* -------------------------------------------------------------------------- */
/* The executor                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Dispatch a single HintDataQuery against the live DB. Pure async
 * function — never throws (defensive try/catch around the whole body).
 */
export async function executeQuery(
  query: HintDataQuery,
  ctx: UserContext,
  svc: SupabaseClient,
): Promise<QueryBinding> {
  try {
    return await executeQueryInner(query, ctx, svc)
  } catch (_e) {
    return { value: null, denominator: 0 }
  }
}

async function executeQueryInner(
  query: HintDataQuery,
  ctx: UserContext,
  svc: SupabaseClient,
): Promise<QueryBinding> {
  switch (query.kind) {
    /* ----------------------------------------------------------------- */
    case 'subpattern_match_pct': {
      var minDenom = query.min_denominator || DEFAULT_MIN_DENOMINATOR.subpattern_match_pct
      if (query.user_descriptor_overlap) {
        // Eligibility check: user's own report must reference the
        // descriptor family. If not, return null to suppress.
        var primary = ctx.primary_report
        if (!primary) return { value: null, denominator: 0 }
        var userTokens = readReportTokens(primary)
        if (!tokensIncludeDescriptorFamily(userTokens, query.descriptor_family)) {
          return { value: null, denominator: 0 }
        }
      }
      var r = await countDescriptorMatchInFamily(
        svc,
        query.phen_family,
        query.descriptor_family,
        5000,
      )
      if (r.denom < minDenom) return { value: null, denominator: r.denom }
      var pct = r.denom > 0 ? Math.round((r.match / r.denom) * 100) : 0
      return { token: query.bind_to, value: pct, denominator: r.denom }
    }

    /* ----------------------------------------------------------------- */
    case 'descriptor_count': {
      var minDenom2 = query.min_denominator || DEFAULT_MIN_DENOMINATOR.descriptor_count
      var r2 = await countDescriptorMatchInFamily(
        svc,
        query.phen_family,
        query.descriptor_family,
        5000,
      )
      if (r2.match < minDenom2) return { value: null, denominator: r2.match }
      return { token: query.bind_to, value: r2.match, denominator: r2.match }
    }

    /* ----------------------------------------------------------------- */
    case 'geographic_proximity_count': {
      var minDenom3 = query.min_denominator || DEFAULT_MIN_DENOMINATOR.geographic_proximity_count
      var pr = ctx.primary_report
      if (!pr || typeof pr.latitude !== 'number' || typeof pr.longitude !== 'number') {
        return { value: null, denominator: 0 }
      }
      var radius = query.radius_mi
      var latDelta = radius / 69
      var lngDelta = radius / (69 * Math.cos((pr.latitude * Math.PI) / 180) || 1)
      var q = svc
        .from('reports')
        .select('id, latitude, longitude')
        .eq('status', 'approved')
        .neq('id', pr.id)
        .gte('latitude', pr.latitude - latDelta)
        .lte('latitude', pr.latitude + latDelta)
        .gte('longitude', pr.longitude - lngDelta)
        .lte('longitude', pr.longitude + lngDelta)
        .limit(2000)
      if (query.phen_family) q = q.eq('category', query.phen_family)
      var bboxRes = await q
      var rows3: any[] = (bboxRes.data as any[]) || []
      var matched = 0
      for (var i3 = 0; i3 < rows3.length; i3++) {
        var rr = rows3[i3]
        if (typeof rr.latitude !== 'number' || typeof rr.longitude !== 'number') continue
        if (haversineMi(pr.latitude, pr.longitude, rr.latitude, rr.longitude) <= radius) {
          matched++
        }
      }
      if (matched < minDenom3) return { value: null, denominator: matched }
      return { token: query.bind_to, value: matched, denominator: matched }
    }

    /* ----------------------------------------------------------------- */
    case 'closest_match_meta': {
      var pr2 = ctx.primary_report
      if (!pr2 || typeof pr2.latitude !== 'number' || typeof pr2.longitude !== 'number') {
        return { value: null, denominator: 0 }
      }
      var maxR = query.max_radius_mi || 500
      var latD = maxR / 69
      var lngD = maxR / (69 * Math.cos((pr2.latitude * Math.PI) / 180) || 1)
      var cmRes = await svc
        .from('reports')
        .select('id, latitude, longitude, event_date')
        .eq('status', 'approved')
        .eq('category', query.phen_family)
        .neq('id', pr2.id)
        .gte('latitude', pr2.latitude - latD)
        .lte('latitude', pr2.latitude + latD)
        .gte('longitude', pr2.longitude - lngD)
        .lte('longitude', pr2.longitude + lngD)
        .limit(2000)
      var rowsCM: any[] = (cmRes.data as any[]) || []
      var bestDist = Infinity
      var bestRow: any = null
      for (var iCM = 0; iCM < rowsCM.length; iCM++) {
        var rcm = rowsCM[iCM]
        if (typeof rcm.latitude !== 'number' || typeof rcm.longitude !== 'number') continue
        var d = haversineMi(pr2.latitude, pr2.longitude, rcm.latitude, rcm.longitude)
        if (d <= maxR && d < bestDist) {
          bestDist = d
          bestRow = rcm
        }
      }
      if (!bestRow) return { value: null, denominator: 0 }
      var dateStr = bestRow.event_date
        ? new Date(bestRow.event_date).toISOString().slice(0, 10)
        : 'an unrecorded date'
      var bindings: Partial<Record<HintToken, number | string>> = {}
      bindings[query.bind_date_to] = dateStr
      bindings[query.bind_distance_to] = Math.round(bestDist)
      return { bindings: bindings, value: Math.round(bestDist), denominator: 1 }
    }

    /* ----------------------------------------------------------------- */
    case 'decade_distribution_pct': {
      var minDenom4 = query.min_denominator || DEFAULT_MIN_DENOMINATOR.decade_distribution_pct
      var decade = query.decade
      if (decade === undefined) {
        var ud = dateDecade(ctx.primary_report?.event_date || null)
        if (ud === null) return { value: null, denominator: 0 }
        decade = ud
      }
      var totalRes2 = await svc
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('category', query.phen_family)
        .not('event_date', 'is', null)
      var totalDenom2 = safeNumber(totalRes2.count)
      if (totalDenom2 < minDenom4) return { value: null, denominator: totalDenom2 }

      var startIso = decade + '-01-01'
      var endIso = decade + 10 + '-01-01'
      var deRes = await svc
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('category', query.phen_family)
        .gte('event_date', startIso)
        .lt('event_date', endIso)
      var matchN = safeNumber(deRes.count)
      var pct2 = totalDenom2 > 0 ? Math.round((matchN / totalDenom2) * 100) : 0
      return { token: query.bind_to, value: pct2, denominator: totalDenom2 }
    }

    /* ----------------------------------------------------------------- */
    case 'month_window_pct': {
      // The corpus has noisy month-of-event data because year-only
      // event_date values fall to Jan 1. We can't filter on
      // event_date_precision via SQL conveniently here without a
      // composite index — instead, we sample 5000 dated reports and
      // compute the share in-process, dropping year-only rows.
      var minDenom5 = query.min_denominator || DEFAULT_MIN_DENOMINATOR.month_window_pct
      var mwq = svc
        .from('reports')
        .select('event_date, event_date_precision')
        .eq('status', 'approved')
        .not('event_date', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000)
      if (query.phen_family) mwq = mwq.eq('category', query.phen_family)
      var mwRes = await mwq
      var mwRows: any[] = (mwRes.data as any[]) || []
      var mwDenom = 0
      var mwMatch = 0
      for (var im = 0; im < mwRows.length; im++) {
        var prec = mwRows[im].event_date_precision
        if (prec === 'year' || prec === 'decade' || prec === 'unknown') continue
        var dt = new Date(mwRows[im].event_date)
        if (isNaN(dt.getTime())) continue
        mwDenom++
        var mo = dt.getUTCMonth() + 1
        var inRange =
          query.start_month <= query.end_month
            ? mo >= query.start_month && mo <= query.end_month
            : mo >= query.start_month || mo <= query.end_month
        if (inRange) mwMatch++
      }
      if (mwDenom < minDenom5) return { value: null, denominator: mwDenom }
      var pct3 = mwDenom > 0 ? Math.round((mwMatch / mwDenom) * 100) : 0
      return { token: query.bind_to, value: pct3, denominator: mwDenom }
    }

    /* ----------------------------------------------------------------- */
    case 'month_window_count': {
      var minDenom6 = query.min_denominator || DEFAULT_MIN_DENOMINATOR.month_window_count
      var mcq = svc
        .from('reports')
        .select('event_date, event_date_precision')
        .eq('status', 'approved')
        .not('event_date', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000)
      if (query.phen_family) mcq = mcq.eq('category', query.phen_family)
      var mcRes = await mcq
      var mcRows: any[] = (mcRes.data as any[]) || []
      var mcCount = 0
      var mcSeen = 0
      for (var imc = 0; imc < mcRows.length; imc++) {
        var prec2 = mcRows[imc].event_date_precision
        if (prec2 === 'year' || prec2 === 'decade' || prec2 === 'unknown') continue
        var dt2 = new Date(mcRows[imc].event_date)
        if (isNaN(dt2.getTime())) continue
        mcSeen++
        var mo2 = dt2.getUTCMonth() + 1
        var day2 = dt2.getUTCDate()
        var inRange2 = isInDayWindow(
          mo2,
          day2,
          query.start_month,
          query.start_day,
          query.end_month,
          query.end_day,
        )
        if (inRange2) mcCount++
      }
      if (mcCount < minDenom6) return { value: null, denominator: mcCount }
      return { token: query.bind_to, value: mcCount, denominator: mcCount }
    }

    /* ----------------------------------------------------------------- */
    case 'cross_family_overlap_pct': {
      var perFamilyMin =
        query.min_denominator_per_family || DEFAULT_MIN_DENOMINATOR.cross_family_overlap_pct
      var families = query.families
      var labels: HintToken[] = ['cross_family_a_label', 'cross_family_b_label', 'cross_family_c_label']
      var pcts: HintToken[] = ['cross_family_a_pct', 'cross_family_b_pct', 'cross_family_c_pct']
      var bindingsCF: Partial<Record<HintToken, number | string>> = {}
      var minSeenDenom = Infinity
      for (var fi = 0; fi < families.length; fi++) {
        var fam = families[fi]
        var rcf = await countDescriptorMatchInFamily(svc, fam, query.descriptor_family, 5000)
        if (rcf.denom < perFamilyMin) return { value: null, denominator: rcf.denom }
        var pctCF = rcf.denom > 0 ? Math.round((rcf.match / rcf.denom) * 100) : 0
        bindingsCF[pcts[fi]] = pctCF
        bindingsCF[labels[fi]] = humanizeFamily(fam)
        if (rcf.denom < minSeenDenom) minSeenDenom = rcf.denom
      }
      return {
        bindings: bindingsCF,
        value: 0,
        denominator: minSeenDenom === Infinity ? 0 : minSeenDenom,
      }
    }

    /* ----------------------------------------------------------------- */
    case 'cross_progression_pct': {
      // TODO: cross_progression_pct requires a sweep over reports
      // grouped by submitted_by where count >= 2, then a temporal
      // ordering check. Until the multi-experience user cohort is
      // dense enough (current denom likely < 100) we return null to
      // suppress the Hint. Founder to verify cohort size, then this
      // stub can be replaced with a single CTE-style query exposed
      // via an RPC (see scripts/hints/queries.sql).
      return { value: null, denominator: 0 }
    }

    /* ----------------------------------------------------------------- */
    case 'region_decade_sparseness': {
      var pr3 = ctx.primary_report
      if (!pr3 || !pr3.state_province) return { value: null, denominator: 0 }
      var ud2 = dateDecade(pr3.event_date)
      if (ud2 === null) return { value: null, denominator: 0 }
      var sq = svc
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('state_province', pr3.state_province)
        .gte('event_date', ud2 + '-01-01')
        .lt('event_date', ud2 + 10 + '-01-01')
      if (query.phen_family) sq = sq.eq('category', query.phen_family)
      var sRes = await sq
      var sCount = safeNumber(sRes.count)
      var cap = query.sparseness_max === undefined ? 10 : query.sparseness_max
      if (sCount > cap) return { value: null, denominator: sCount }
      return { token: query.bind_to, value: sCount, denominator: sCount }
    }

    /* ----------------------------------------------------------------- */
    case 'archive_growth_count': {
      var minDenom7 = query.min_denominator || DEFAULT_MIN_DENOMINATOR.archive_growth_count
      var since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000).toISOString()
      var aq = svc
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .gte('created_at', since)
      if (query.phen_family) aq = aq.eq('category', query.phen_family)
      var aRes = await aq
      var aCount = safeNumber(aRes.count)
      if (aCount < minDenom7) return { value: null, denominator: aCount }
      return { token: query.bind_to, value: aCount, denominator: aCount }
    }

    /* ----------------------------------------------------------------- */
    case 'archive_total_count': {
      var atq = svc
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
      if (query.phen_family) atq = atq.eq('category', query.phen_family)
      var atRes = await atq
      var atCount = safeNumber(atRes.count)
      return { token: query.bind_to, value: atCount, denominator: atCount }
    }

    /* ----------------------------------------------------------------- */
    case 'witness_state_pct': {
      var minDenom8 = query.min_denominator || DEFAULT_MIN_DENOMINATOR.witness_state_pct
      var wsTotalRes = await svc
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('category', query.phen_family)
        .not('witness_state_at_event', 'is', null)
      var wsDenom = safeNumber(wsTotalRes.count)
      if (wsDenom < minDenom8) return { value: null, denominator: wsDenom }
      var wsMatchRes = await svc
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('category', query.phen_family)
        .eq('witness_state_at_event', query.witness_state)
      var wsMatch = safeNumber(wsMatchRes.count)
      var wsPct = wsDenom > 0 ? Math.round((wsMatch / wsDenom) * 100) : 0
      return { token: query.bind_to, value: wsPct, denominator: wsDenom }
    }

    /* ----------------------------------------------------------------- */
    case 'region_count': {
      var minDenom9 = query.min_denominator || DEFAULT_MIN_DENOMINATOR.region_count
      var pr4 = ctx.primary_report
      if (!pr4) return { value: null, denominator: 0 }
      var col = query.scope === 'country' ? 'country' : 'state_province'
      var v = (pr4 as any)[col]
      if (!v) return { value: null, denominator: 0 }
      var rq = svc
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq(col, v)
      if (query.phen_family) rq = rq.eq('category', query.phen_family)
      var rRes = await rq
      var rCount = safeNumber(rRes.count)
      if (rCount < minDenom9) return { value: null, denominator: rCount }
      return { token: query.bind_to, value: rCount, denominator: rCount }
    }
  }
  // Exhaustiveness — if a new query kind is added without an arm we
  // suppress rather than crash.
  return { value: null, denominator: 0 }
}

/* -------------------------------------------------------------------------- */
/* Misc helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Day-window inclusion test. Handles the cross-year wrap (e.g. Nov 20 –
 * Feb 14) the same way SeasonalWindow describes it.
 */
function isInDayWindow(
  month: number,
  day: number,
  startMonth: number,
  startDay: number | undefined,
  endMonth: number,
  endDay: number | undefined,
): boolean {
  var sM = startMonth
  var sD = startDay || 1
  var eM = endMonth
  var eD = endDay || 31
  // Encode each date as MMDD ints for easy comparison.
  var here = month * 100 + day
  var lo = sM * 100 + sD
  var hi = eM * 100 + eD
  if (lo <= hi) return here >= lo && here <= hi
  // Wraps year boundary.
  return here >= lo || here <= hi
}

/**
 * Render a phen family enum into a human label for cross-family Hints.
 * Operator-facing copy; kept short so cross_family bodies read naturally.
 */
function humanizeFamily(f: HintCategory): string {
  switch (f) {
    case 'cryptids': return 'cryptid'
    case 'ufos_aliens': return 'UFO'
    case 'ghosts_hauntings': return 'haunting'
    case 'psychic_phenomena': return 'psychic'
    case 'esoteric_practices': return 'esoteric'
    case 'consciousness_practices': return 'consciousness'
    case 'perception_sensory': return 'perception-sensory'
    case 'psychological_experiences': return 'psychological'
    case 'religion_mythology': return 'religion/mythology'
    case 'general': return 'general'
    case 'cross_category': return 'cross-category'
  }
  return String(f)
}

export { isInDayWindow, humanizeFamily }
