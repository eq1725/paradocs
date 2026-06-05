/**
 * POST /api/onboarding/submit
 *
 * V9.11 — atomic create-first-report endpoint.
 *
 * Called AFTER the user has completed magic-link auth (we have a
 * session). Takes the experience data they entered before the magic
 * link and writes it as their first report. The DB trigger created
 * the profile automatically when auth.users got its row.
 *
 * Pipeline:
 *   1. Bearer auth → user id
 *   2. Run experience text through Claude Haiku moderation (the
 *      permissive paranormal-aware variant)
 *   3. If REJECTED → 422 with friendly error (don't write anything)
 *   4. Insert report with:
 *        title          — from input or auto-generated from first 80 chars
 *        slug           — generated from title + a short hash (avoid collisions)
 *        summary        — first 200 chars of description (or input.summary)
 *        description    — full experience text
 *        category       — user-picked or AI-suggested default
 *        location_*     — optional
 *        event_date     — optional
 *        status         — 'approved' if moderation clean, 'pending' if PENDING
 *                         (admins can review later via /admin/report-review)
 *        submitted_by   — current user id
 *        anonymous_submission — from `share_anonymously` toggle (column name matches /submit.tsx)
 *        visibility     — 'radar_only' | 'public' | 'private' (mapped to
 *                         existing visibility column or new one)
 *   5. Return { ok, report_id, slug, decision }
 *
 * Frontend then triggers a RADAR match call against the new report_id.
 *
 * Note: schema uses `anonymous_submission` (matches /submit.tsx). Earlier
 * versions of this file mistakenly used `is_anonymous` which doesn't exist
 * in the reports table — fixed in V9.11.5.
 * Visibility uses status='approved' as the default public state and
 * an explicit `is_private` flag for the RADAR-only / private modes
 * — actual schema impl matches the existing patterns of
 * /submit + saved_reports.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { moderateExperience } from '@/lib/services/text-moderation-experience.service'
import { suggestOnboardingTitle } from '@/lib/services/onboarding-title.service'
import { generateAndSaveConsolidatedAI, isConsolidatedAIEnabled } from '@/lib/services/consolidated-ai.service'
import { generateAndSaveParadocsAnalysis } from '@/lib/services/paradocs-analysis.service'

// V11.17.41 — Bumped serverless function timeout. Synchronous AI
// generation on submit takes 5-15s typically, occasionally up to 30s on
// retries. Vercel Pro tier supports up to 300s; this is well under.
export var config = {
  maxDuration: 60,
}

interface SubmitPayload {
  description: string                 // required, 30-2000 chars
  title?: string                      // optional, auto-generated if missing
  category?: string                   // optional, defaults to 'combination'
  /** V9.11.1 — primary phenomenon_types FK (from /start picker). */
  phenomenon_type_id?: string | null
  /** V9.11.3 — cross-disciplinary tags (writes to report_tags). */
  additional_type_ids?: string[]

  // V9.11.3 — deep-details fields (all optional)
  event_date?: string | null          // YYYY-MM-DD or year/decade string
  event_date_precision?: 'exact' | 'month' | 'year' | 'decade'
  event_time?: string | null
  duration_minutes?: number | null

  location_name?: string | null
  location_description?: string | null
  city?: string | null
  state_province?: string | null
  country?: string | null
  latitude?: string | null
  longitude?: string | null
  /**
   * Panel-feedback (May 2026): submitted experiences must enforce
   * location at submit-time. The precision tier drives the report-page
   * map widget render — 'exact' shows a pin, 'city/region' shows a
   * radius circle, 'country' shows just a chip. Derived from which
   * location fields the user provided (lat+lng → exact, city → city,
   * state → region, country → country). Defaults to 'exact' when not
   * provided so behavior matches the historical row format.
   */
  location_precision?: 'exact' | 'city' | 'region' | 'country' | null

  witness_count?: number | null
  submitter_was_witness?: boolean

  has_physical_evidence?: boolean
  has_photo_video?: boolean
  has_official_report?: boolean
  evidence_summary?: string | null

  visibility?: 'radar_only' | 'public' | 'private'   // first-report privacy
  share_anonymously?: boolean         // hide identity on RADAR
  tags?: string[]
}

function makeSlug(title: string, salt: string): string {
  var base = (title || 'experience')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  if (!base) base = 'experience'
  return base + '-' + salt.slice(0, 6)
}

function makeTitle(description: string): string {
  var trimmed = description.trim()
  if (!trimmed) return 'Untitled experience'
  var firstLine = trimmed.split(/[\n.!?]/)[0].trim()
  if (firstLine.length >= 10 && firstLine.length <= 90) return firstLine
  return trimmed.slice(0, 80) + (trimmed.length > 80 ? '…' : '')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  var authHeader = req.headers.authorization || ''
  var accessToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!accessToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' })
  }

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  var { data: userData, error: authErr } = await admin.auth.getUser(accessToken)
  if (authErr || !userData?.user) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' })
  }
  var userId = userData.user.id

  var p = (req.body || {}) as SubmitPayload
  var description = (p.description || '').toString().trim()
  if (description.length < 30) {
    return res.status(400).json({ ok: false, error: 'Description must be at least 30 characters.' })
  }
  if (description.length > 2000) {
    return res.status(400).json({ ok: false, error: 'Description must be 2000 characters or fewer.' })
  }

  // Moderation
  var mod = await moderateExperience(description)
  if (mod.decision === 'rejected') {
    return res.status(422).json({
      ok: false,
      error: 'We couldn\'t use that description. Please rephrase and try again.',
      reason: 'experience_rejected',
      moderation: { categories: mod.categories },
    })
  }

  // Build the report row.
  //
  // Title resolution order (panel-feedback May 2026):
  //   1. User-typed title (or accepted Haiku suggestion from the
  //      client-side suggest-title call). Strongest signal — the user
  //      saw it and approved it.
  //   2. Server-side Haiku call. The client may have skipped or hadn't
  //      finished suggesting before submit fired; we run the same
  //      generator here as a fallback so we don't fall back to the
  //      truncated-first-sentence fallback. (Chase's feedback was
  //      that the truncated-first-sentence titles look like a body
  //      preview, not a title.)
  //   3. makeTitle first-sentence — last-resort safety net when Haiku
  //      is unconfigured or errors out.
  var clientTitle = (p.title || '').toString().trim()
  var title: string
  if (clientTitle) {
    title = clientTitle
  } else {
    var generated = await suggestOnboardingTitle(description, p.category || null)
    if (generated.title) {
      title = generated.title
    } else {
      title = makeTitle(description)
    }
  }
  var summary = description.slice(0, 200) + (description.length > 200 ? '…' : '')
  // V11 — 'combination' was removed in migration 20260520; fall back to
  // 'psychological_experiences' as the broadest experiencer-content bucket.
  var category = (p.category || 'psychological_experiences').toString()
  var slug = makeSlug(title, userId.replace(/-/g, ''))

  // Pending mod → status='pending' so admin sees it before public render.
  // Approved mod → status='approved' and the visibility flag controls
  // who can see it.
  var status = mod.decision === 'pending' ? 'pending' : 'approved'

  var insert: any = {
    title,
    slug,
    summary,
    description,
    category,
    status,
    submitted_by: userId,
    // V9.11.5 #11 — without this, /lab's RADAR tab couldn't find the
    // user's onboarding submission (it filters source_type='user_submission')
    // and showed the legacy ExperienceOnboarding intake on top of the
    // already-submitted report. Mirrors what /submit.tsx writes.
    source_type: 'user_submission',
    anonymous_submission: !!p.share_anonymously,
    // Visibility-related — we store an extra column to mark RADAR-only
    // vs public reports. Approved + visibility='radar_only' means the
    // report appears in RADAR matching but doesn't show in the public
    // browse feed. Public is the default approved-state behavior.
    visibility: p.visibility === 'private' ? 'private'
              : p.visibility === 'public' ? 'public'
              : 'radar_only',
  }
  // V9.11.3 — date precision is mutually exclusive: exact dates go in
  // `event_date`, anything else goes in `event_date_raw` so we don't
  // pretend we have day-precision when the user said "2003" or "1990s".
  // Mirrors the /submit page's column write pattern.
  if (p.event_date) {
    var prec = p.event_date_precision || 'exact'
    if (prec === 'exact') {
      insert.event_date = p.event_date
      insert.event_date_precision = 'exact'
      insert.event_date_approximate = false
      if (p.event_time) insert.event_time = p.event_time
    } else {
      insert.event_date_raw = p.event_date
      insert.event_date_precision = prec
      insert.event_date_approximate = true
    }
  }
  if (typeof p.duration_minutes === 'number') insert.event_duration_minutes = p.duration_minutes
  if (typeof p.witness_count === 'number') insert.witness_count = p.witness_count
  if (typeof p.submitter_was_witness === 'boolean') insert.submitter_was_witness = p.submitter_was_witness

  if (p.location_name) insert.location_name = p.location_name
  if (p.location_description) insert.location_description = p.location_description
  if (p.city) insert.city = p.city
  if (p.state_province) insert.state_province = p.state_province
  if (p.country) insert.country = p.country
  if (p.latitude) insert.latitude = parseFloat(p.latitude)
  if (p.longitude) insert.longitude = parseFloat(p.longitude)

  // Panel-feedback (May 2026): derive + persist location_precision so
  // the report page map widget knows whether to drop a pin or render
  // a radius circle. We trust an explicitly supplied precision over
  // the client-derived one but fall back to deriving it from the
  // fields present. Defaults to 'exact' to preserve historical
  // behavior for any caller that doesn't pass the field at all.
  var derivedPrecision: 'exact' | 'city' | 'region' | 'country' = 'exact'
  if (p.latitude && p.longitude) derivedPrecision = 'exact'
  else if (p.city) derivedPrecision = 'city'
  else if (p.state_province) derivedPrecision = 'region'
  else if (p.country) derivedPrecision = 'country'
  insert.location_precision = p.location_precision || derivedPrecision

  // Panel-feedback (May 2026): submitted experiences must have at
  // least an approximate date or year. If none provided, the row
  // would render with a blank date label on the report page and miss
  // the temporal-pattern surfaces. The /start client enforces this
  // too; this is the belt-and-suspenders server-side check.
  var hasAnyDate = !!(p.event_date || (insert.event_date_raw && insert.event_date_raw.length > 0))
  if (!hasAnyDate) {
    return res.status(400).json({
      ok: false,
      error: 'Please pick at least a year for when this happened — even an approximate one helps us place your experience.',
      reason: 'missing_event_date',
    })
  }

  // Panel-feedback (May 2026): reject future dates. The UI caps the
  // picker but free-text year / decade modes can still slip through,
  // and a malicious client can post anything. Cap at today.
  var futureDateRejected = (function () {
    var nowYear = new Date().getFullYear()
    if (insert.event_date && typeof insert.event_date === 'string') {
      // event_date is YYYY-MM-DD; compare lexicographically.
      var todayStr = new Date().toISOString().split('T')[0]
      if (insert.event_date > todayStr) return true
    }
    if (insert.event_date_raw && typeof insert.event_date_raw === 'string') {
      // Match a 4-digit year anywhere in the raw string and reject if > current year.
      var yearMatch = insert.event_date_raw.match(/(\d{4})/)
      if (yearMatch) {
        var year = parseInt(yearMatch[1], 10)
        if (year > nowYear) return true
      }
    }
    return false
  })()
  if (futureDateRejected) {
    return res.status(400).json({
      ok: false,
      error: 'Event date cannot be in the future.',
      reason: 'future_event_date',
    })
  }

  // Panel-feedback (May 2026): same for location — at minimum a
  // country chip. Without any location at all the report page map
  // can't render and the Today feed can't pin the report.
  var hasAnyLocation = !!(p.latitude && p.longitude) || !!p.city || !!p.state_province || !!p.country
  if (!hasAnyLocation) {
    return res.status(400).json({
      ok: false,
      error: 'Please add where this happened — even just a country helps. You can be as specific or general as you want.',
      reason: 'missing_location',
    })
  }

  if (typeof p.has_physical_evidence === 'boolean') insert.has_physical_evidence = p.has_physical_evidence
  if (typeof p.has_photo_video === 'boolean') insert.has_photo_video = p.has_photo_video
  if (typeof p.has_official_report === 'boolean') insert.has_official_report = p.has_official_report
  if (p.evidence_summary) insert.evidence_summary = p.evidence_summary

  if (Array.isArray(p.tags) && p.tags.length > 0) insert.tags = p.tags
  if (p.phenomenon_type_id) insert.phenomenon_type_id = p.phenomenon_type_id
  insert.onboarding_first_report = true

  var { data: inserted, error: insertErr } = await (admin
    .from('reports') as any)
    .insert(insert)
    .select('id, slug')
    .single()

  if (insertErr) {
    console.error('[OnboardingSubmit] insert error:', insertErr.message)
    return res.status(500).json({ ok: false, error: 'Failed to save your experience. Try again.' })
  }

  // V11.17.52 — location safety net. Same hook as ingestion engine:
  // if the submitter didn't fill in a location but mentioned one in
  // their description/title, Haiku-extract + geocode and persist.
  // Best-effort, non-blocking.
  if (!insert.location_name) {
    try {
      var locSvc = await import('@/lib/services/location-extraction.service')
      var resolved = await locSvc.extractAndGeocodeLocation({
        title: insert.title || null,
        summary: insert.summary || null,
        description: insert.description || null,
      })
      if (resolved) {
        await (admin.from('reports') as any).update({
          location_name: resolved.location_name,
          city: resolved.city,
          state_province: resolved.state_province,
          country: resolved.country,
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          location_precision: resolved.location_precision,
          // V11.17.83 — propagate centroid-fallback signal.
          coords_synthetic: resolved.coords_synthetic === true,
        }).eq('id', (inserted as any).id)
        console.log('[OnboardingSubmit] Backfilled location: "' + resolved.location_name + '" (' + resolved.confidence + ')')
      }
    } catch (locErr: any) {
      console.warn('[OnboardingSubmit] Location safety net failed: ' + (locErr?.message || locErr))
    }
  }

  // V9.11.1 — when a primary phenomenon_type was picked, also write the
  // join-table row so the report shows up in /phenomena/[slug] feeds and
  // the dashboard counts. /submit does the same; we mirror it.
  // V9.11.3 — also write any additional_type_ids as non-primary tags
  // (cross-disciplinary tagging from the "Related experiences" section).
  var tagRows: any[] = []
  if (p.phenomenon_type_id) {
    tagRows.push({
      report_id: (inserted as any).id,
      phenomenon_type_id: p.phenomenon_type_id,
      is_primary: true,
      relevance_score: 1.0,
    })
  }
  if (Array.isArray(p.additional_type_ids)) {
    var seen: Record<string, boolean> = {}
    if (p.phenomenon_type_id) seen[p.phenomenon_type_id] = true
    p.additional_type_ids.forEach(function (id) {
      if (!id || seen[id]) return
      seen[id] = true
      tagRows.push({
        report_id: (inserted as any).id,
        phenomenon_type_id: id,
        is_primary: false,
        relevance_score: 0.8,
      })
    })
  }
  if (tagRows.length > 0) {
    try {
      await (admin.from('report_tags') as any).insert(tagRows)
    } catch (e: any) {
      console.error('[OnboardingSubmit] report_tags insert failed:', e?.message)
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // V11.17.41 — Synchronous AI generation gate
  // ──────────────────────────────────────────────────────────────────
  //
  // Before V11.17.41 the submit handler returned immediately after the
  // row inserted, leaving paradocs_narrative / paradocs_assessment /
  // feed_hook NULL. The report page rendered the "Paradocs is analyzing
  // this account..." placeholder for the alpha tester indefinitely
  // because nothing ever filled in those fields — the batch ingestion
  // engine.ts AI path doesn't run on user_submission rows.
  //
  // Fix: call the same AI service the engine uses, await completion,
  // then apply the same demotion gate the engine applies. Status flips
  // to 'pending_review' (or 'archived' for high-conf anomaly hits)
  // when the AI fails or the anomaly self-check rejects the row. Only
  // a successful AI generation that passes the gate leaves the row
  // publicly viewable as 'approved'.
  //
  // User-experience cost: submit waits ~5-15s instead of returning
  // instantly. Acceptable trade for the alpha tester seeing a complete
  // report on first load instead of a perpetual skeleton.

  var newReportId = (inserted as any).id
  var finalStatus: string = status  // 'approved' or 'pending' from moderation
  var aiOk = false
  var demoteReason: string | null = null

  // Only run AI when moderation said 'approved' — pending-moderation rows
  // stay 'pending' until admin clears them, then the admin-side AI path
  // (or this handler on resubmit) fills the fields.
  if (status === 'approved') {
    try {
      var useConsolidated = isConsolidatedAIEnabled()
      if (useConsolidated) {
        var consolidatedRes = await generateAndSaveConsolidatedAI(newReportId)
        aiOk = !!consolidatedRes.success
        if (!aiOk) {
          // Fallback to multi-call path so we don't end up with NULL fields
          // because consolidated returned an error.
          try {
            aiOk = !!(await generateAndSaveParadocsAnalysis(newReportId))
          } catch (_e) { aiOk = false }
        }
      } else {
        aiOk = !!(await generateAndSaveParadocsAnalysis(newReportId))
      }
    } catch (aiErr: any) {
      console.error('[OnboardingSubmit] AI generation threw for ' + newReportId + ':', aiErr?.message || aiErr)
      aiOk = false
    }

    // Mirror the engine.ts demotion logic: re-read the row, check
    // narrative + pull_quote + anomaly gate, demote as appropriate.
    try {
      var { data: postRow } = await admin
        .from('reports')
        .select('paradocs_narrative, paradocs_assessment')
        .eq('id', newReportId)
        .single()
      var assess: any = postRow ? (postRow as any).paradocs_assessment : null
      var hasNarrative = !!(postRow && (postRow as any).paradocs_narrative && (postRow as any).paradocs_narrative.trim().length > 0)
      var pullQuote = assess && typeof assess === 'object' ? assess.pull_quote : null
      var hasPullQuote = !!(pullQuote && typeof pullQuote === 'string' && pullQuote.trim().length > 0)
      var ac = assess && typeof assess === 'object' ? assess.anomalous_content_check : null
      var acAnomalous: string | null = null
      var acConfidence: number = 0
      var acGenre: string = ''
      if (ac && typeof ac === 'object') {
        acAnomalous = typeof ac.anomalous === 'string' ? ac.anomalous : null
        acConfidence = typeof ac.confidence === 'number' ? ac.confidence : 0
        acGenre = typeof ac.genre === 'string' ? ac.genre : ''
      }
      var anomalyAutoArchive = acAnomalous === 'no' && acConfidence >= 0.9
      var anomalyPending = acAnomalous === 'no' && acConfidence >= 0.7 && acConfidence < 0.9
      var demoteTarget: 'pending_review' | 'archived' = 'pending_review'
      if (!aiOk) demoteReason = 'AI generation failed during submit'
      else if (!hasNarrative) demoteReason = 'paradocs_narrative empty after generation'
      else if (!hasPullQuote) demoteReason = 'pull_quote empty after generation'
      else if (anomalyAutoArchive) {
        demoteReason = 'Haiku anomaly gate — auto-archived (V11.17.41) — genre=' + (acGenre || 'unspecified') + ' conf=' + acConfidence.toFixed(2)
        demoteTarget = 'archived'
      }
      else if (anomalyPending) {
        demoteReason = 'Haiku anomaly gate — pending (V11.17.41) — genre=' + (acGenre || 'unspecified') + ' conf=' + acConfidence.toFixed(2)
        demoteTarget = 'pending_review'
      }
      if (demoteReason) {
        await admin
          .from('reports')
          .update({ status: demoteTarget, updated_at: new Date().toISOString() })
          .eq('id', newReportId)
        finalStatus = demoteTarget
        console.log('[OnboardingSubmit] Demoted ' + newReportId + ' to ' + demoteTarget + ' (' + demoteReason + ')')
      }
    } catch (gateErr: any) {
      console.error('[OnboardingSubmit] demotion gate failed (non-fatal) for ' + newReportId + ':', gateErr?.message || gateErr)
    }
  }

  return res.status(200).json({
    ok: true,
    report_id: newReportId,
    slug: (inserted as any).slug,
    decision: mod.decision,
    moderation: mod.decision === 'pending' ? { reason: mod.reason } : undefined,
    // V11.17.41 — let the frontend know whether the report is publicly
    // visible. Status='pending_review' or 'archived' means the user
    // should see a "thanks, we're reviewing this" screen instead of
    // a link to the report page that will 404 or show empty.
    status: finalStatus,
    ai_ready: aiOk && finalStatus === 'approved',
    demote_reason: demoteReason,
  })
}
