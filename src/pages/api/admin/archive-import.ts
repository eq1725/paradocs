/**
 * /api/admin/archive-import — V11.14
 *
 * Receives a batch of raw Reddit-archive posts (Arctic Shift shape) and
 * runs them through the V11.14 ingestion pipeline:
 *
 *   1. parseRedditPost (reddit.ts) — converts raw post → ScrapedReport
 *   2. PII redactor (redact-pii.ts)
 *   3. Enrichment (report-enricher.ts) — location + date + geocode
 *   4. Quality filter (quality-filter.ts) — META/NON_EXPERIENCE/
 *      DESCRIPTION_LEAD/QUESTION_ONLY/SPAM/FICTION/LOW_EFFORT/
 *      NAME_ONLY/LANGUAGE patterns + quality score
 *   5. Hash-dedup against existing rows (original_report_id + source_type)
 *   6. Insert at status='pending_review' (NOT 'approved' — AI generation
 *      runs separately via the batch worker)
 *
 * Critical design choice: NO live AI generation here. Each post inserts
 * with paradocs_narrative=null; the batch worker picks them up later at
 * 50% off via Anthropic's Message Batches API. Keeps the bulk import
 * fast (no per-post Sonnet/Haiku calls blocking the loop).
 *
 * Request body:
 *   { posts: ArcticShiftPost[] }   // up to ~1000 posts per request
 *
 * Response:
 *   {
 *     received: number,
 *     parsed: number,         // converted to ScrapedReport successfully
 *     duplicates: number,     // hash-dedup'd before processing
 *     filtered: number,       // failed quality filter
 *     inserted: number,       // landed in DB as pending_review
 *     errors: number,         // exceptions during processing
 *     elapsed_ms: number,
 *   }
 *
 * Auth: requires service-role bearer token OR admin session cookie.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { parseRedditPost, ArcticShiftPost } from '@/lib/ingestion/adapters/reddit'
import { redactReportPii } from '@/lib/ingestion/utils/redact-pii'
import { enrichReport } from '@/lib/ingestion/enrichment/report-enricher'
import {
  assessQuality,
  getStatusFromScore,
  isObviouslyLowQuality,
  smartReEvaluate,
} from '@/lib/ingestion/filters'

var supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Generate a slug the same way engine.ts does (so the archive-import
// path produces slugs interoperable with live ingestion slugs).
function generateSlug(title: string, originalId: string | null, sourceType: string): string {
  var titlePart = (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 60)
  var uniqueKey = sourceType + '-' + (originalId || Math.random().toString(36).substring(2, 8))
  // Hash uniqueKey to a short suffix for deterministic + collision-safe
  var hash = 0
  for (var i = 0; i < uniqueKey.length; i++) {
    hash = (hash << 5) - hash + uniqueKey.charCodeAt(i)
    hash = hash & hash
  }
  var suffix = Math.abs(hash).toString(36).substring(0, 6)
  return titlePart + '-' + suffix
}

interface ImportResult {
  received: number
  parsed: number
  duplicates: number
  filtered: number
  inserted: number
  errors: number
  elapsed_ms: number
  rejectionReasons?: Record<string, number>
}

async function processBatch(posts: ArcticShiftPost[]): Promise<ImportResult> {
  var start = Date.now()
  var result: ImportResult = {
    received: posts.length,
    parsed: 0,
    duplicates: 0,
    filtered: 0,
    inserted: 0,
    errors: 0,
    elapsed_ms: 0,
    rejectionReasons: {},
  }

  if (posts.length === 0) {
    result.elapsed_ms = Date.now() - start
    return result
  }

  // ── 1. Pre-fetch all existing original_report_ids in one query for
  //      hash-dedup (cheaper than per-row checks). Reddit ID space is
  //      base36 + small, so we can fit ~5k IDs in a single IN() clause
  //      comfortably. With ~1000 posts/batch this is one round-trip.
  var postIds = posts.map(function (p) { return p.id }).filter(Boolean)
  var dedupSet = new Set<string>()
  try {
    var existing = await supabaseAdmin
      .from('reports')
      .select('original_report_id')
      .eq('source_type', 'reddit')
      .in('original_report_id', postIds)
    if (existing.data) {
      existing.data.forEach(function (r: any) { dedupSet.add(r.original_report_id) })
    }
  } catch (e: any) {
    console.warn('[archive-import] dedup pre-fetch failed (will fall through to per-row insert collision): ' + (e.message || e))
  }

  // ── 2. Process each post sequentially. Parallelism here doesn't
  //      help — Supabase pooler handles concurrency upstream, and the
  //      filter/redactor/enricher are CPU-bound on tiny tokens.
  var rejectionReasons: Record<string, number> = {}
  var toInsert: Array<Record<string, any>> = []

  for (var i = 0; i < posts.length; i++) {
    var post = posts[i]
    try {
      // Hash-dedup
      if (post.id && dedupSet.has(post.id)) {
        result.duplicates++
        continue
      }

      // 1. parseRedditPost → ScrapedReport (or null)
      var report = parseRedditPost(post)
      if (!report) {
        result.filtered++
        rejectionReasons['parse_null'] = (rejectionReasons['parse_null'] || 0) + 1
        continue
      }
      result.parsed++

      // 2. PII redactor — runs BEFORE quality assessment so the filter
      //    sees redacted text. Same order as engine.ts.
      var piiResult = redactReportPii(report)
      if (piiResult.redactedCount > 0) {
        console.log('[archive-import] PII redacted from "' + (report.title || '').substring(0, 40) + '...": ' + piiResult.redactedCount + ' instance(s) [' + piiResult.types.join(', ') + ']')
      }

      // 3. Quick low-quality check (matches engine.ts order)
      if (isObviouslyLowQuality(report.title, report.description)) {
        result.filtered++
        rejectionReasons['obviously_low_quality'] = (rejectionReasons['obviously_low_quality'] || 0) + 1
        continue
      }

      // 4. Enrichment (location + date + geocode). Best-effort —
      //    failure shouldn't block; just less-enriched rows.
      try {
        await enrichReport(report)
      } catch (enrichErr) {
        console.log('[archive-import] enrichment error (non-fatal): ' + (enrichErr as any)?.message)
      }

      // 5. Full quality assessment (filter + score)
      var qualityResult = assessQuality(report, report.metadata)
      if (!qualityResult.passed) {
        result.filtered++
        var reason = qualityResult.reason || 'unknown'
        // Trim long regex-source reasons to first 40 chars for tally
        var reasonKey = reason.substring(0, 40)
        rejectionReasons[reasonKey] = (rejectionReasons[reasonKey] || 0) + 1
        continue
      }

      var qualityScore = qualityResult.qualityScore!
      var initialStatus = getStatusFromScore(qualityScore.total, report.source_type)

      // 6. Smart re-eval for borderline scores (matches engine.ts)
      if (initialStatus === 'pending_review') {
        var reeval = smartReEvaluate(qualityScore, {
          title: report.title,
          description: report.description,
          source_type: report.source_type,
          location_name: report.location_name,
          event_date: report.event_date,
          category: report.category,
        })
        if (reeval.promote) {
          initialStatus = 'pending_review'  // we don't auto-approve at archive stage
          // Note: even if score is high, archive-imported reports stay
          // pending_review until the batch worker populates AI fields.
          // The original engine.ts can promote to 'approved' directly
          // because it runs live AI immediately; archive import defers
          // AI to a separate worker, so 'pending_review' is the right
          // landing status.
        }
      }

      // 7. Structural location-quality check (V11.11)
      var locName = report.location_name
      var hasStructuredGeo = !!(report.city || report.state_province || report.country ||
        (typeof report.latitude === 'number' && typeof report.longitude === 'number'))
      if (locName && !hasStructuredGeo) {
        locName = null as any
        report.location_name = null as any
      }

      // 8. Build insert payload (matches engine.ts shape exactly)
      var slug = generateSlug(report.title || 'untitled', report.original_report_id || null, report.source_type || 'reddit')
      var insertData: Record<string, any> = {
        title: report.title,
        slug: slug,
        summary: report.summary,
        description: report.description,
        category: report.category,
        location_name: locName,
        country: report.country || null,
        state_province: report.state_province,
        city: report.city,
        latitude: report.latitude,
        longitude: report.longitude,
        event_date: report.event_date,
        event_date_precision: report.event_date_precision || 'unknown',
        credibility: report.credibility || 'medium',
        source_type: report.source_type,
        original_report_id: report.original_report_id,
        // V11.14 — Archive imports ALWAYS land at pending_review
        // because we haven't run AI yet. The batch worker promotes
        // to 'approved' when it successfully populates narrative +
        // pull_quote (via the same demotion-gate logic, inverted).
        status: 'pending_review',
        tags: report.tags || [],
        source_label: report.source_label || 'reddit',
        source_url: report.source_url,
        upvotes: 0,
        view_count: 0,
        report_type: 'ingested',
      }
      if ((report as any).event_date_extracted_from) insertData.event_date_extracted_from = (report as any).event_date_extracted_from
      if ((report as any).source_published_at) insertData.source_published_at = (report as any).source_published_at
      if (report.witness_count && report.witness_count > 0) insertData.witness_count = report.witness_count
      if (report.has_photo_video) insertData.has_photo_video = true

      toInsert.push(insertData)
    } catch (perPostErr: any) {
      result.errors++
      console.warn('[archive-import] per-post error for ' + (post.id || '(no id)') + ': ' + (perPostErr?.message || perPostErr))
    }
  }

  // ── 3. Bulk insert in chunks of 100 (Supabase upper bound is higher
  //      but 100 keeps payload size + per-request latency reasonable).
  for (var batchStart = 0; batchStart < toInsert.length; batchStart += 100) {
    var chunk = toInsert.slice(batchStart, batchStart + 100)
    var ins = await supabaseAdmin.from('reports').insert(chunk)
    if (ins.error) {
      // If insert failed due to slug collision (unique constraint on
      // original_report_id+source_type), retry one-at-a-time so we
      // can count duplicates accurately. Other errors increment
      // result.errors and continue.
      console.warn('[archive-import] bulk insert error: ' + ins.error.message + ' — retrying per-row')
      for (var k = 0; k < chunk.length; k++) {
        var row = chunk[k]
        var solo = await supabaseAdmin.from('reports').insert(row)
        if (solo.error) {
          if (solo.error.message && solo.error.message.indexOf('duplicate key') !== -1) {
            result.duplicates++
          } else {
            result.errors++
            console.warn('[archive-import] per-row insert error for slug ' + row.slug + ': ' + solo.error.message)
          }
        } else {
          result.inserted++
        }
      }
    } else {
      result.inserted += chunk.length
    }
  }

  result.elapsed_ms = Date.now() - start
  result.rejectionReasons = rejectionReasons
  return result
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // V11.14 — Auth. Accepts either:
  //   (a) Bearer <SUPABASE_SERVICE_ROLE_KEY> — for the bulk-import
  //       script + any backend automation
  //   (b) Bearer <user-session JWT> with admin email — for occasional
  //       manual invocation from a browser console
  //
  // Note: the older pattern (authHeader.includes('service_role'))
  // doesn't work because Supabase JWTs are base64-encoded — the literal
  // text 'service_role' never appears in the encoded form. Direct
  // string comparison against the env var is the correct check.
  var authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — Bearer token required' })
  }
  var bearerToken = authHeader.replace('Bearer ', '').trim()
  if (!bearerToken) {
    return res.status(401).json({ error: 'Unauthorized — empty bearer token' })
  }

  var serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  var isServiceRole = bearerToken === serviceRoleKey

  if (!isServiceRole) {
    var userCheck = await supabaseAdmin.auth.getUser(bearerToken)
    if (!userCheck.data?.user || userCheck.data.user.email !== 'williamschaseh@gmail.com') {
      return res.status(403).json({ error: 'Forbidden — service role key or admin session required' })
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' })
  }

  var body = req.body
  if (!body || !Array.isArray(body.posts)) {
    return res.status(400).json({ error: 'Body must be { posts: ArcticShiftPost[] }' })
  }

  if (body.posts.length > 1000) {
    return res.status(400).json({ error: 'Batch size limited to 1000 posts per request' })
  }

  try {
    var result = await processBatch(body.posts)
    return res.status(200).json({ success: true, result: result })
  } catch (err: any) {
    console.error('[archive-import] unhandled error: ', err)
    return res.status(500).json({ error: err?.message || String(err) })
  }
}

// Vercel function config: archive-import runs the full filter pipeline
// per post (including a MapTiler geocode for each enriched location).
// 1000 posts × ~300ms each ≈ 5 min worst case. Vercel hobby tier caps
// at 10s; need Pro tier for the 60s cap, or split batches smaller.
export var config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
  maxDuration: 300, // seconds — Vercel Pro/Enterprise tier
}
