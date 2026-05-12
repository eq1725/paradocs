/**
 * POST /api/user/profile-update
 *
 * V9.9 P3 — server-side profile save with bio moderation.
 *
 * Originally settings.tsx upserted directly to Supabase from the
 * client. That was fine for fields with no abuse vector (display
 * name, notification settings) but for the bio field — public,
 * free-form text — we need a server-side moderation gate.
 *
 * Pipeline:
 *   1. Bearer auth → user id
 *   2. If bio changed (or first set): run moderation via Claude Haiku
 *      a. APPROVED → save bio normally
 *      b. PENDING  → save bio + flag bio_pending_review = true
 *                    (bio still visible to user; admin queue can
 *                    review). Future: hide from public profile until
 *                    review clears.
 *      c. REJECTED → reject save with friendly error; don't write bio
 *   3. Update profile row with the rest of the patch
 *
 * Returns:
 *   { ok: true, decision: 'approved' | 'pending', moderation?: {...} }
 *   { ok: false, error: '...', reason: 'bio_rejected' }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { moderateText } from '@/lib/services/text-moderation.service'

interface PatchPayload {
  username?: string | null
  display_name?: string | null
  avatar_url?: string | null
  bio?: string | null
  notification_settings?: any
  constellation_public?: boolean
  /** V10.3 follow-up — controls whether the user appears in other researchers' Overlap lists. */
  researcher_overlap_visible?: boolean
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

  var patch = (req.body || {}) as PatchPayload

  // Sanity: only allow whitelisted keys.
  var update: any = {}
  if ('username' in patch) update.username = patch.username
  if ('display_name' in patch) update.display_name = patch.display_name
  if ('avatar_url' in patch) update.avatar_url = patch.avatar_url
  if ('notification_settings' in patch) update.notification_settings = patch.notification_settings
  if ('constellation_public' in patch) update.constellation_public = patch.constellation_public
  if ('researcher_overlap_visible' in patch) update.researcher_overlap_visible = patch.researcher_overlap_visible
  // Bio is handled separately below after moderation.

  // V9.9 P3 — bio moderation. Fetch the previous bio so we only run
  // moderation when it actually changed (saves cost on every settings
  // save where bio is unchanged).
  var bioModeration: any = null
  if ('bio' in patch) {
    var newBio = (patch.bio || '').toString().trim()
    var { data: prev } = await (admin
      .from('profiles') as any)
      .select('bio')
      .eq('id', userId)
      .single()
    var prevBio = ((prev as any)?.bio || '').trim()
    if (newBio === prevBio) {
      // No change — skip moderation, copy through as-is.
      update.bio = patch.bio
    } else {
      var modResult = await moderateText(newBio, 'bio')
      bioModeration = modResult
      if (modResult.decision === 'rejected') {
        return res.status(422).json({
          ok: false,
          error: 'Your bio contains content we can\'t allow. Please revise and try again.',
          reason: 'bio_rejected',
          moderation: { categories: modResult.categories, decisionReason: modResult.reason },
        })
      }
      update.bio = patch.bio
      // Pending → save the bio but flag it for admin review.
      update.bio_moderation_decision = modResult.decision
      update.bio_moderation_categories = modResult.categories || []
      update.bio_pending_review = modResult.decision === 'pending'
      update.bio_moderation_at = new Date().toISOString()
    }
  }

  update.updated_at = new Date().toISOString()

  var { error: updateErr } = await (admin
    .from('profiles') as any)
    .update(update)
    .eq('id', userId)
  if (updateErr) {
    // Surface unique-violation specifically (username collision).
    var msg = updateErr.message || ''
    if (msg.indexOf('duplicate key') > -1 || msg.indexOf('unique') > -1) {
      return res.status(409).json({ ok: false, error: 'Username already taken.', reason: 'username_taken' })
    }
    console.error('[ProfileUpdate] error:', msg)
    return res.status(500).json({ ok: false, error: 'Failed to save profile.' })
  }

  return res.status(200).json({
    ok: true,
    decision: bioModeration?.decision || 'approved',
    moderation: bioModeration ? {
      decision: bioModeration.decision,
      reason: bioModeration.reason,
      categories: bioModeration.categories,
    } : undefined,
  })
}
