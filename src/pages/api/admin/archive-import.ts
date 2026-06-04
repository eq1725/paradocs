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
import {
  normalizeLocation,
  geocodeWithFallback,
  makeSupabaseGeocodeCache,
} from '@/lib/ingestion/utils/normalize-location'
import { extractAndGeocodeLocation } from '@/lib/services/location-extraction.service'

var supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// V11.17.21 — Subreddit → category mapping for Reddit archive imports.
// parseRedditPost doesn't set category; some posts get one from downstream
// keyword detection but most don't. The reports.category column is NOT NULL,
// so we fall back to a subreddit-inferred category before insert. Priority
// subs map to the underserved priority categories (Path B targets);
// everything else lands in 'psychological_experiences' (the catch-all for
// "anomalous first-person experience reports that don't fit a specific
// cryptid/UFO/ghost cat").
function inferCategoryFromSubreddit(subreddit: string | null | undefined): string {
  if (!subreddit) return 'psychological_experiences'
  var sub = subreddit.toLowerCase().replace(/^r\//, '').replace(/^\//, '')
  // Consciousness practices
  if (['astralprojection', 'luciddreaming', 'meditation', 'oobe', 'outofbody', 'oobs'].indexOf(sub) >= 0) return 'consciousness_practices'
  // Psychic phenomena
  if (['psychic', 'mediums', 'psychicabilities', 'precognition', 'telepathy', 'esp'].indexOf(sub) >= 0) return 'psychic_phenomena'
  // Perception / sensory
  if (['glitch_in_the_matrix', 'mandela_effect', 'sleepparalysisstories', 'derealization', 'depersonalization', 'dpdr'].indexOf(sub) >= 0) return 'perception_sensory'
  // Religion / mythology
  if (['paganism', 'exorcism', 'demonology', 'spirituality', 'angels', 'archangels'].indexOf(sub) >= 0) return 'religion_mythology'
  // Esoteric practices
  if (['witchcraft', 'wicca', 'occult', 'tarot', 'ouija', 'magick'].indexOf(sub) >= 0) return 'esoteric_practices'
  // Cryptids
  if (['cryptids', 'cryptozoology', 'bigfoot', 'sasquatch', 'dogman', 'mothman', 'skinwalkers'].indexOf(sub) >= 0) return 'cryptids'
  // UFOs / aliens
  if (['ufos', 'ufob', 'aliens', 'aliensjustsayhi', 'experiencers'].indexOf(sub) >= 0) return 'ufos_aliens'
  // Ghosts / hauntings
  if (['ghosts', 'paranormal', 'thetruthishere', 'hauntings', 'ghoststories'].indexOf(sub) >= 0) return 'ghosts_hauntings'
  // Catch-all for any unrecognized sub
  return 'psychological_experiences'
}

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

      // V11.14 — Drop low-score-rejected reports BEFORE insert. The filter
      // passed them (no hard-fail pattern matched), but the score binned
      // them as 'rejected'. Inserting them would (a) waste a Haiku batch
      // call on something the score already gave up on, and (b) clutter
      // the admin queue with placeholder rows after the AI inevitably
      // returns INSUFFICIENT. Treat as a soft-filter rejection.
      if (initialStatus === 'rejected') {
        result.filtered++
        rejectionReasons['score_rejected'] = (rejectionReasons['score_rejected'] || 0) + 1
        continue
      }

      // 6. V11.14.7 — Borderline policy: NO admin queue at scale.
      //
      // Previously: `pending_review` reports stayed in pending_review even
      // after smartReEvaluate promoted them, deferring admin review until
      // narrative landed. At 10k scale that meant ~1500 reports queued,
      // and at 100k it'd be ~15k. Untenable.
      //
      // New policy: every report inserted is either auto-approve-worthy
      // (high score OR smartReEvaluate promotes via date+location/
      // first-person/specificity signals) OR it's dropped at insert
      // time. No more pending_review landings.
      //
      // The batch worker honors metadata.score_status: 'approved' →
      // auto-promote post-AI; this preserves clean separation of "score
      // good enough" from "AI returned usable output" (which can still
      // auto-reject via INSUFFICIENT path).
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
          // Promoted — write score_status='approved' so batch worker
          // auto-publishes once AI completes.
          initialStatus = 'approved'
        } else {
          // Borderline + no strong promote signals → drop. Don't burn
          // an AI batch slot on something we'd reject anyway after
          // manual review.
          result.filtered++
          rejectionReasons['score_borderline_no_signals'] = (rejectionReasons['score_borderline_no_signals'] || 0) + 1
          continue
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

      // 8. V11.14 — normalizeLocation: fold country aliases, look up
      //    country_code (Italy → IT, India → IN, etc.), set
      //    location_precision based on what fields we have
      //    (city → 'exact', state → 'region', country only →
      //    'country', nothing → 'unknown'). Runs MapTiler/Nominatim
      //    geocode when city+state+country combo allows it. This
      //    was missing from my initial endpoint — caused Italy
      //    reports to have country_code=null + precision='exact'
      //    + no coords, which broke the map view.
      var normalizedLocation: any = null
      try {
        normalizedLocation = await normalizeLocation(
          {
            city: report.city || null,
            state_province: report.state_province || null,
            country: report.country || null,
            country_code: (report as any).country_code || null,
            location_name: locName || null,
            latitude: typeof report.latitude === 'number' ? report.latitude : null,
            longitude: typeof report.longitude === 'number' ? report.longitude : null,
          },
          {
            geocoder: 'maptiler',
            geocodeFn: geocodeWithFallback,
            cache: makeSupabaseGeocodeCache(supabaseAdmin),
          },
        )
      } catch (normErr) {
        console.log('[archive-import] normalizeLocation error (non-fatal): ' + (normErr as any)?.message)
      }

      // 9. V11.14 — Status flow for archive-import path:
      //   - All inserts land at status='pending_review' (no live AI
      //     yet; can't promote to 'approved' until narrative +
      //     pull_quote populate).
      //   - The quality-score decision is stored on metadata.score
      //     so the batch worker knows whether to AUTO-promote after
      //     AI succeeds.
      //     -  metadata.score_status='approved' → batch worker
      //        promotes to 'approved' when AI completes
      //     -  metadata.score_status='pending_review' → stays
      //        pending_review even after AI; admin review needed
      //   - This means the admin queue only gets borderline-score
      //     reports, not everything. Reports that scored cleanly
      //     auto-publish once their AI content lands.
      var scoreStatus = initialStatus  // 'approved' | 'pending_review'

      // 10. Build insert payload (matches engine.ts shape)
      var slug = generateSlug(report.title || 'untitled', report.original_report_id || null, report.source_type || 'reddit')
      var insertData: Record<string, any> = {
        title: report.title,
        slug: slug,
        summary: report.summary,
        description: report.description,
        // V11.17.21 — Fallback to subreddit-inferred category when the
        // parser/keyword-detector didn't set one. Satisfies the
        // reports.category NOT NULL constraint without dropping otherwise-
        // valid Reddit experience reports.
        category: report.category || inferCategoryFromSubreddit((post as any).subreddit),
        location_name: normalizedLocation ? normalizedLocation.location_name : locName,
        country: normalizedLocation ? normalizedLocation.country : (report.country || null),
        country_code: normalizedLocation ? normalizedLocation.country_code : (report as any).country_code || null,
        state_province: normalizedLocation ? normalizedLocation.state_province : report.state_province,
        city: normalizedLocation ? normalizedLocation.city : report.city,
        latitude: normalizedLocation ? normalizedLocation.latitude : report.latitude,
        longitude: normalizedLocation ? normalizedLocation.longitude : report.longitude,
        coords_synthetic: normalizedLocation ? !!normalizedLocation.coords_synthetic : false,
        event_date: report.event_date,
        event_date_precision: report.event_date_precision || 'unknown',
        credibility: report.credibility || 'medium',
        source_type: report.source_type,
        original_report_id: report.original_report_id,
        status: 'pending_review',
        tags: report.tags || [],
        source_label: report.source_label || 'reddit',
        source_url: report.source_url,
        upvotes: 0,
        view_count: 0,
        report_type: 'ingested',
        metadata: {
          location_precision: normalizedLocation ? normalizedLocation.location_precision : (report.location_precision || 'unknown'),
          // V11.14 — stored so the batch worker knows whether to
          // auto-promote to 'approved' after AI completes, or keep
          // at 'pending_review' for admin curation.
          score_status: scoreStatus,
          quality_score: qualityScore.total,
        },
      }
      if ((report as any).event_date_extracted_from) insertData.event_date_extracted_from = (report as any).event_date_extracted_from
      if ((report as any).source_published_at) insertData.source_published_at = (report as any).source_published_at
      if (report.witness_count && report.witness_count > 0) insertData.witness_count = report.witness_count
      if (report.has_photo_video) insertData.has_photo_video = true

      // V11.17.52 — location safety net. If the adapter + normalize
      // both produced no location, Haiku-extract from title/summary/
      // description. Best-effort + non-blocking.
      if (!insertData.location_name) {
        try {
          var resolved = await extractAndGeocodeLocation({
            title: insertData.title || null,
            summary: insertData.summary || null,
            description: insertData.description || null,
          })
          if (resolved) {
            insertData.location_name = resolved.location_name
            insertData.city = resolved.city
            insertData.state_province = resolved.state_province
            insertData.country = resolved.country
            insertData.latitude = resolved.latitude
            insertData.longitude = resolved.longitude
            insertData.metadata.location_precision = resolved.location_precision
          }
        } catch { /* leave insertData.location_name null */ }
      }

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
