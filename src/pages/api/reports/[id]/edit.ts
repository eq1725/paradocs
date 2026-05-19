/**
 * PATCH /api/reports/[id]/edit
 *
 * Panel-feedback (May 2026 — 5th round). Lets a user edit their own
 * report after submission. Re-runs moderation on any text changes.
 * Default = auto-approve clean edits; only suspicious diffs are
 * flagged to admin (which keeps Chase's ~95% auto-approve target).
 *
 * Body (all optional — only supplied fields are updated):
 *   {
 *     title?: string,
 *     description?: string,
 *     category?: string,
 *     event_date?: string,
 *     event_date_precision?: 'exact' | 'month' | 'year' | 'decade',
 *     city?: string, state_province?: string, country?: string,
 *     latitude?: string, longitude?: string,
 *     location_precision?: 'exact' | 'city' | 'region' | 'country',
 *     visibility?: 'public' | 'radar_only' | 'private',
 *     share_anonymously?: boolean,
 *   }
 *
 * Auth: Bearer JWT. Caller must be the report's submitted_by.
 *
 * Returns:
 *   { ok: true, status: 'approved'|'pending', moderation_flagged: boolean }
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { moderateExperience } from '@/lib/services/text-moderation-experience.service'

interface EditBody {
  title?: string
  description?: string
  category?: string
  event_date?: string
  event_date_precision?: 'exact' | 'month' | 'year' | 'decade'
  city?: string
  state_province?: string
  country?: string
  latitude?: string
  longitude?: string
  location_precision?: 'exact' | 'city' | 'region' | 'country'
  visibility?: 'public' | 'radar_only' | 'private'
  share_anonymously?: boolean
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var reportId = (req.query.id as string) || ''
  if (!reportId) return res.status(400).json({ error: 'Missing report id' })

  var authHeader = req.headers.authorization || ''
  var accessToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!accessToken) return res.status(401).json({ error: 'Not authenticated' })

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  var { data: userData, error: authErr } = await admin.auth.getUser(accessToken)
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated' })
  var userId = userData.user.id

  // Ownership check.
  var { data: existing, error: existingErr } = await admin
    .from('reports')
    .select('id, submitted_by, status, description, source_type')
    .eq('id', reportId)
    .maybeSingle()
  if (existingErr || !existing) return res.status(404).json({ error: 'Report not found' })
  if ((existing as any).submitted_by !== userId) {
    return res.status(403).json({ error: 'You can only edit your own reports' })
  }
  if ((existing as any).source_type !== 'user_submission') {
    return res.status(403).json({ error: 'This report is not editable' })
  }

  var body = (req.body || {}) as EditBody

  // ── Validation ──────────────────────────────────────────────
  if (body.description !== undefined) {
    var desc = (body.description || '').trim()
    if (desc.length < 30) return res.status(400).json({ error: 'Description must be at least 30 characters.' })
    if (desc.length > 4000) return res.status(400).json({ error: 'Description must be 4000 characters or fewer.' })
  }
  // Future-date guard (matches publish.ts + onboarding/submit.ts)
  if (body.event_date) {
    var nowYear = new Date().getFullYear()
    var precision = body.event_date_precision || 'exact'
    if (precision === 'exact') {
      var todayStr = new Date().toISOString().split('T')[0]
      if (body.event_date > todayStr) {
        return res.status(400).json({ error: 'Event date cannot be in the future.' })
      }
    } else {
      var yearMatch = body.event_date.match(/(\d{4})/)
      if (yearMatch) {
        var y = parseInt(yearMatch[1], 10)
        if (y > nowYear) return res.status(400).json({ error: 'Event year cannot be in the future.' })
      }
    }
  }

  // ── Moderation: only re-run if description changed ──────────
  // Panel-feedback: target ~95% auto-approve. Clean text edits stay
  // approved; only moderation-flagged edits go back to pending.
  var moderationFlagged = false
  var moderationReason: string | null = null
  if (body.description !== undefined) {
    var prevDesc = (existing as any).description || ''
    if (body.description.trim() !== prevDesc.trim()) {
      try {
        var mod = await moderateExperience(body.description.trim())
        if (mod.decision === 'rejected') {
          return res.status(422).json({
            ok: false,
            error: 'We couldn\'t use that description. Please rephrase and try again.',
            reason: 'experience_rejected',
            moderation: { categories: mod.categories },
          })
        }
        if (mod.decision === 'pending') {
          moderationFlagged = true
          moderationReason = mod.reason || 'pending_review'
        }
      } catch (e: any) {
        console.warn('[reports/edit] moderation failed (proceeding):', e?.message)
      }
    }
  }

  // ── Build the update payload ────────────────────────────────
  var updates: any = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) updates.title = body.title.trim() || updates.title
  if (body.description !== undefined) {
    updates.description = body.description.trim()
    updates.summary = updates.description.slice(0, 200) + (updates.description.length > 200 ? '…' : '')
  }
  if (body.category !== undefined) updates.category = body.category
  if (body.visibility !== undefined) updates.visibility = body.visibility
  if (typeof body.share_anonymously === 'boolean') updates.anonymous_submission = body.share_anonymously

  // Location
  if (body.city !== undefined) updates.city = body.city || null
  if (body.state_province !== undefined) updates.state_province = body.state_province || null
  if (body.country !== undefined) updates.country = body.country || null
  if (body.latitude !== undefined) updates.latitude = body.latitude ? parseFloat(body.latitude) : null
  if (body.longitude !== undefined) updates.longitude = body.longitude ? parseFloat(body.longitude) : null
  if (body.location_precision !== undefined) updates.location_precision = body.location_precision

  // Date — same exact/raw split as publish.ts and onboarding/submit.ts.
  if (body.event_date !== undefined) {
    var prec2 = body.event_date_precision || 'exact'
    if (prec2 === 'exact') {
      updates.event_date = body.event_date || null
      updates.event_date_raw = null
      updates.event_date_precision = 'exact'
      updates.event_date_approximate = false
    } else {
      updates.event_date = null
      updates.event_date_raw = body.event_date || null
      updates.event_date_precision = prec2
      updates.event_date_approximate = true
    }
  }

  // Final status: moderation result, default = approved.
  if (moderationFlagged) {
    updates.status = 'pending'
  } else {
    // Don't down-rank an already-approved report unless the description
    // changed and was flagged. Leave whatever status it had if nothing
    // material changed.
    if (body.description !== undefined && (existing as any).status === 'pending') {
      updates.status = 'approved' // user took action; auto-approve clean edits
    }
  }

  var { error: updateErr } = await (admin.from('reports') as any).update(updates).eq('id', reportId)
  if (updateErr) {
    console.error('[reports/edit] update failed:', updateErr.message)
    return res.status(500).json({ error: 'Failed to save edits' })
  }

  return res.status(200).json({
    ok: true,
    status: updates.status || (existing as any).status,
    moderation_flagged: moderationFlagged,
    moderation_reason: moderationReason,
  })
}
