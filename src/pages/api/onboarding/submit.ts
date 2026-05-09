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
  var title = (p.title || '').toString().trim() || makeTitle(description)
  var summary = description.slice(0, 200) + (description.length > 200 ? '…' : '')
  // V9.11.1 — default to canonical 'combination' (catch-all category) instead
  // of the legacy 'unexplained_event' string the prerelease used.
  var category = (p.category || 'combination').toString()
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

  return res.status(200).json({
    ok: true,
    report_id: (inserted as any).id,
    slug: (inserted as any).slug,
    decision: mod.decision,
    moderation: mod.decision === 'pending' ? { reason: mod.reason } : undefined,
  })
}
