/**
 * POST /api/constellation/case-files/accept-invite
 *
 * Given a one-time invite token, associate the invited email's collaborator
 * row with the currently-authenticated user and mark it accepted. If the
 * caller's email doesn't match the invite's pending_email, reject.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization?.replace('Bearer ', '')
  if (!authHeader) return res.status(401).json({ error: 'Sign in to accept this invite' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' })

  const { token } = (req.body || {}) as { token?: string }
  if (!token || typeof token !== 'string' || token.length < 24) {
    return res.status(400).json({ error: 'Invalid invite token' })
  }

  const { data: invite, error } = await supabase
    .from('constellation_case_file_collaborators')
    .select('id, case_file_id, pending_email, invite_token_expires_at, role')
    .eq('invite_token', token)
    .maybeSingle()

  if (error) {
    console.error('[case-files:accept-lookup]', error)
    return res.status(500).json({ error: 'Lookup failed' })
  }
  if (!invite) return res.status(404).json({ error: 'Invite not found or already accepted' })

  // Expiry check
  if (invite.invite_token_expires_at && new Date(invite.invite_token_expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: 'This invite has expired. Ask the case file owner to re-invite you.' })
  }

  // Email match — invite's pending_email must equal the signed-in user's.
  const userEmail = user.email?.toLowerCase() || ''
  const inviteEmail = (invite.pending_email || '').toLowerCase()
  if (inviteEmail && inviteEmail !== userEmail) {
    return res.status(403).json({
      error: 'This invite was sent to a different email. Sign in with ' + inviteEmail + ' to accept.',
    })
  }

  // Finalize: attach user_id, clear pending_email + token, stamp accepted_at.
  const { error: updateErr } = await supabase
    .from('constellation_case_file_collaborators')
    .update({
      user_id: user.id,
      pending_email: null,
      invite_token: null,
      invite_token_expires_at: null,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invite.id)

  if (updateErr) {
    // If this trips the unique_active_collaborator constraint it means the
    // user is somehow already a collaborator via another row — delete the
    // duplicate invite and return OK.
    if (updateErr.code === '23505') {
      await supabase.from('constellation_case_file_collaborators').delete().eq('id', invite.id)
      return res.status(200).json({ case_file_id: invite.case_file_id, alreadyMember: true })
    }
    console.error('[case-files:accept-finalize]', updateErr)
    return res.status(400).json({ error: updateErr.message })
  }

  return res.status(200).json({ case_file_id: invite.case_file_id, role: invite.role })
}
