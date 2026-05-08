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
 *        is_anonymous   — from `share_anonymously` toggle
 *        visibility     — 'radar_only' | 'public' | 'private' (mapped to
 *                         existing visibility column or new one)
 *   5. Return { ok, report_id, slug, decision }
 *
 * Frontend then triggers a RADAR match call against the new report_id.
 *
 * Note: schema uses 'is_anonymous' (column exists per /submit form).
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
  category?: string                   // optional, defaults to 'unexplained_event'
  event_date?: string | null          // YYYY-MM-DD or null
  location_name?: string | null
  city?: string | null
  state_province?: string | null
  country?: string | null
  latitude?: string | null
  longitude?: string | null
  visibility?: 'radar_only' | 'public' | 'private'   // first-report privacy
  share_anonymously?: boolean         // hide identity on RADAR
  // Tier 2 (deep) optional fields:
  witness_count?: number
  duration_minutes?: number
  has_physical_evidence?: boolean
  has_photo_video?: boolean
  evidence_summary?: string | null
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
  var category = (p.category || 'unexplained_event').toString()
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
    is_anonymous: !!p.share_anonymously,
    // Visibility-related — we store an extra column to mark RADAR-only
    // vs public reports. Approved + visibility='radar_only' means the
    // report appears in RADAR matching but doesn't show in the public
    // browse feed. Public is the default approved-state behavior.
    visibility: p.visibility === 'private' ? 'private'
              : p.visibility === 'public' ? 'public'
              : 'radar_only',
  }
  if (p.event_date) insert.event_date = p.event_date
  if (p.location_name) insert.location_name = p.location_name
  if (p.city) insert.city = p.city
  if (p.state_province) insert.state_province = p.state_province
  if (p.country) insert.country = p.country
  if (p.latitude) insert.latitude = parseFloat(p.latitude)
  if (p.longitude) insert.longitude = parseFloat(p.longitude)
  if (typeof p.witness_count === 'number') insert.witness_count = p.witness_count
  if (typeof p.duration_minutes === 'number') insert.duration_minutes = p.duration_minutes
  if (typeof p.has_physical_evidence === 'boolean') insert.has_physical_evidence = p.has_physical_evidence
  if (typeof p.has_photo_video === 'boolean') insert.has_photo_video = p.has_photo_video
  if (p.evidence_summary) insert.evidence_summary = p.evidence_summary
  if (Array.isArray(p.tags) && p.tags.length > 0) insert.tags = p.tags
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

  return res.status(200).json({
    ok: true,
    report_id: (inserted as any).id,
    slug: (inserted as any).slug,
    decision: mod.decision,
    moderation: mod.decision === 'pending' ? { reason: mod.reason } : undefined,
  })
}
