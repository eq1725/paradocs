// V11.18.1 — Sprint 1A-2 — GET /api/lab/patterns/list
//
// Returns the published `findings_catalogue` rows for the Patterns
// surface. The endpoint is namespaced under /api/lab/ (NOT /api/patterns/,
// which is taken by the legacy `detected_patterns` feature). The
// user-facing route still lives at `/lab/patterns` per V2 roadmap §2.2.
//
// Query params:
//   limit            (default 5; max 50)
//   with_user_overlay  ("1" to compute the personalized overlay slab;
//                       requires a Bearer access token, no-ops otherwise)
//
// Response shape:
//   {
//     findings: [
//       {
//         id, slug, eyebrow_type, headline, descriptor,
//         phen_families: [{family_slug, family_label, count,
//                          total_in_family, pct}, ...],
//         denominator_n, denominator_n_label, interpretive_sentence,
//         representative_report_ids,
//         user_overlay: null | {
//           matches: <int>,
//           total: <int>,
//           traits_matched: [<descriptor_family>, ...],
//         },
//       },
//       ...
//     ]
//   }
//
// Caching: Cache-Control: s-maxage=300 (edge 5 min). User-overlay calls
// bypass cache because they're per-user (the overlay branch sets
// Cache-Control: private, no-store).
//
// Per V2 roadmap §9 R1 — the user_overlay must NEVER fabricate counts.
// We compute `matches` as the number of the user's approved reports
// whose category is one of the Finding's families AND whose tag set
// contains the Finding's descriptor_family keywords. If any check fails
// (no auth, no reports, lookup error), we set user_overlay to null.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'
import { getDescriptorKeywords } from '@/lib/patterns/descriptor-vocabulary'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// V11.18.4 — Sprint 1B. Keyword vocabulary moved to the shared module
// `src/lib/patterns/descriptor-vocabulary.ts` (consumed here AND by
// data-query-executor.ts). The two used to drift; one source now.

interface FindingRow {
  id: string
  slug: string
  eyebrow_type: string
  headline: string
  descriptor: string
  phen_families: any
  denominator_n: number
  denominator_n_label: string
  interpretive_sentence: string
  representative_report_ids: any
  publish_order: number | null
}

interface UserOverlay {
  matches: number
  total: number
  traits_matched: string[]
}

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
      var descs = (assess as any).descriptors
      if (Array.isArray(descs)) {
        for (var j = 0; j < descs.length; j++) {
          if (descs[j]) out.push(String(descs[j]).toLowerCase())
        }
      }
    }
    var text = ((row.title || '') + ' ' + (row.summary || '') + ' ' + (row.description || ''))
      .toLowerCase()
    if (text.trim().length > 0) out.push(text)
  } catch (_e) { /* defensive */ }
  return out
}

function tokensIncludeDescriptor(tokens: string[], descriptor: string): boolean {
  var keywords = getDescriptorKeywords(descriptor)
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i]
    for (var j = 0; j < keywords.length; j++) {
      if (t.indexOf(keywords[j]) !== -1) return true
    }
  }
  return false
}

async function computeOverlaysForUser(
  svc: any,
  userId: string,
  findings: FindingRow[],
): Promise<Record<string, UserOverlay | null>> {
  var out: Record<string, UserOverlay | null> = {}
  try {
    var reportsRes = await svc
      .from('reports')
      .select('id, category, tags, paradocs_assessment, title, summary, description')
      .eq('submitted_by', userId)
      .eq('status', 'approved')
      .limit(50)
    var rows: any[] = (reportsRes.data as any[]) || []
    var total = rows.length
    if (total === 0) {
      findings.forEach(function (f) { out[f.id] = null })
      return out
    }

    findings.forEach(function (f) {
      try {
        var famSlugs: string[] = []
        if (Array.isArray(f.phen_families)) {
          for (var i = 0; i < f.phen_families.length; i++) {
            famSlugs.push(String((f.phen_families[i] as any).family_slug))
          }
        }
        var matches = 0
        for (var ri = 0; ri < rows.length; ri++) {
          var r = rows[ri]
          if (!r.category) continue
          if (famSlugs.indexOf(String(r.category)) === -1) continue
          var tokens = readReportTokens(r)
          if (tokensIncludeDescriptor(tokens, f.descriptor)) matches++
        }
        if (matches >= 1) {
          out[f.id] = {
            matches: matches,
            total: total,
            traits_matched: [f.descriptor],
          }
        } else {
          out[f.id] = null
        }
      } catch (_e) {
        out[f.id] = null
      }
    })
  } catch (_e) {
    findings.forEach(function (f) { out[f.id] = null })
  }
  return out
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var limitRaw = req.query.limit
  var limit = 5
  if (typeof limitRaw === 'string') {
    var n = parseInt(limitRaw, 10)
    if (isFinite(n) && n > 0) limit = Math.min(n, 50)
  }

  var withOverlay = req.query.with_user_overlay === '1'

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase env not configured' })
  }
  var svc = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  var listRes: any
  try {
    listRes = await (svc.from('findings_catalogue' as any) as any)
      .select('id, slug, eyebrow_type, headline, descriptor, phen_families, denominator_n, denominator_n_label, interpretive_sentence, representative_report_ids, publish_order')
      .eq('published', true)
      .order('publish_order', { ascending: true, nullsFirst: false })
      .limit(limit)
  } catch (e: any) {
    return res.status(500).json({ error: 'query failed', detail: e?.message || String(e) })
  }

  if (listRes?.error) {
    // If the table doesn't exist yet (migration not applied), return empty.
    if (String(listRes.error.message || '').toLowerCase().indexOf('does not exist') !== -1) {
      return res.status(200).json({ findings: [] })
    }
    return res.status(500).json({ error: listRes.error.message })
  }

  var findings: FindingRow[] = ((listRes.data as any[]) || []).map(function (r) { return r as FindingRow })

  // Optional per-user overlay.
  var overlayMap: Record<string, UserOverlay | null> = {}
  var bearer: string | null = null
  var authHeader = req.headers.authorization || ''
  if (typeof authHeader === 'string' && authHeader.indexOf('Bearer ') === 0) {
    bearer = authHeader.substring(7).trim() || null
  }
  if (withOverlay && bearer && SUPABASE_ANON_KEY) {
    try {
      var anon = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: 'Bearer ' + bearer } },
      })
      var userRes = await anon.auth.getUser()
      var uid = userRes.data?.user?.id || null
      if (uid) {
        overlayMap = await computeOverlaysForUser(svc, uid, findings)
      }
    } catch (_e) { /* overlays default to null */ }
  }

  var payload = findings.map(function (f) {
    return {
      id: f.id,
      slug: f.slug,
      eyebrow_type: f.eyebrow_type,
      headline: f.headline,
      descriptor: f.descriptor,
      phen_families: f.phen_families,
      denominator_n: f.denominator_n,
      denominator_n_label: f.denominator_n_label,
      interpretive_sentence: f.interpretive_sentence,
      representative_report_ids: f.representative_report_ids,
      user_overlay: overlayMap[f.id] || null,
    }
  })

  // Cache strategy: anonymous list calls cache 5 min at the edge.
  // Authed calls with `with_user_overlay` bypass cache entirely.
  if (withOverlay && bearer) {
    res.setHeader('Cache-Control', 'private, no-store')
  } else {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
  }
  res.status(200).json({ findings: payload })
}
