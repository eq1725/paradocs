/**
 * GET    /api/constellation/case-files/:id/collaborators   — list
 * POST   /api/constellation/case-files/:id/collaborators   — invite by email
 * DELETE /api/constellation/case-files/:id/collaborators?cid=X — remove
 * PATCH  /api/constellation/case-files/:id/collaborators?cid=X — change role
 *
 * Only the case file owner can manage collaborators. The invite flow sends
 * an email (via Resend when configured) with a one-time accept link; when
 * the invited email already belongs to a Paradocs user we eagerly resolve
 * their user_id so they see the case file immediately under "Shared with me."
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const RESEND_API_KEY = process.env.RESEND_API_KEY
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com'

const VALID_ROLES = new Set(['editor', 'viewer'])
const INVITE_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const caseFileId = req.query.id as string
  if (!caseFileId) return res.status(400).json({ error: 'case file id required' })

  // Verify the caller owns this case file (only owners manage collaborators).
  const { data: owned } = await supabase
    .from('constellation_case_files')
    .select('id, title, user_id')
    .eq('id', caseFileId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!owned) return res.status(404).json({ error: 'Case file not found or you are not the owner' })

  // ── GET: list collaborators ──
  if (req.method === 'GET') {
    const { data: rows, error } = await supabase
      .from('constellation_case_file_collaborators')
      .select(`
        id, role, pending_email, invited_by, created_at, accepted_at,
        user:profiles!constellation_case_file_collaborators_user_id_fkey(
          id, display_name, username, avatar_url
        )
      `)
      .eq('case_file_id', caseFileId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[case-files:list-collaborators]', error)
      return res.status(400).json({ error: error.message })
    }

    return res.status(200).json({
      collaborators: (rows || []).map((r: any) => ({
        id: r.id,
        role: r.role,
        status: r.accepted_at ? 'accepted' : 'pending',
        createdAt: r.created_at,
        acceptedAt: r.accepted_at,
        pendingEmail: r.pending_email,
        user: r.user
          ? {
              id: r.user.id,
              displayName: r.user.display_name,
              username: r.user.username,
              avatarUrl: r.user.avatar_url,
            }
          : null,
      })),
    })
  }

  // ── POST: invite by email ──
  if (req.method === 'POST') {
    const { email, role } = (req.body || {}) as { email?: string; role?: string }
    const cleanEmail = (email || '').trim().toLowerCase()
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Valid email is required' })
    }
    const cleanRole = role && VALID_ROLES.has(role) ? role : 'viewer'

    // Does an account exist for this email? If so, eager-accept (auto-add
    // them as a collaborator). Otherwise create a pending invite row that
    // accepts on click.
    const { data: existingUser } = await supabase.auth.admin.listUsers()
    const match = existingUser?.users?.find(u => u.email?.toLowerCase() === cleanEmail)

    // Can't invite yourself.
    if (match && match.id === user.id) {
      return res.status(400).json({ error: "You're already the owner of this case file" })
    }

    const inviteToken = match ? null : crypto.randomBytes(24).toString('hex')
    const tokenExpires = match ? null : new Date(Date.now() + INVITE_TOKEN_TTL_MS).toISOString()

    const insertPayload: Record<string, unknown> = {
      case_file_id: caseFileId,
      role: cleanRole,
      invited_by: user.id,
      invite_token: inviteToken,
      invite_token_expires_at: tokenExpires,
    }
    if (match) {
      insertPayload.user_id = match.id
      insertPayload.accepted_at = new Date().toISOString()
    } else {
      insertPayload.pending_email = cleanEmail
    }

    const { data: created, error: insErr } = await supabase
      .from('constellation_case_file_collaborators')
      .insert(insertPayload)
      .select()
      .single()

    if (insErr) {
      // Unique constraint → already invited/member.
      if (insErr.code === '23505') {
        return res.status(409).json({ error: 'This person is already a collaborator' })
      }
      console.error('[case-files:invite]', insErr)
      return res.status(400).json({ error: insErr.message })
    }

    // Send invite email. If Resend isn't configured, we silently skip —
    // the owner can manually share the accept link returned in the response.
    const acceptUrl = inviteToken
      ? SITE_URL + '/cases/invite/' + inviteToken
      : null
    let emailStatus: 'sent' | 'skipped_no_resend' | 'failed' = 'skipped_no_resend'
    if (inviteToken && RESEND_API_KEY) {
      try {
        await sendInviteEmail({
          to: cleanEmail,
          caseFileTitle: owned.title,
          inviterName: user.user_metadata?.display_name || user.email || 'A Paradocs researcher',
          acceptUrl: acceptUrl!,
        })
        emailStatus = 'sent'
      } catch (err) {
        console.error('[case-files:invite-email]', err)
        emailStatus = 'failed'
      }
    }

    return res.status(201).json({
      collaborator: {
        id: created.id,
        role: created.role,
        status: created.accepted_at ? 'accepted' : 'pending',
        pendingEmail: created.pending_email,
      },
      acceptUrl,
      emailStatus,
    })
  }

  // ── PATCH: change role ──
  if (req.method === 'PATCH') {
    const cid = req.query.cid as string
    if (!cid) return res.status(400).json({ error: 'cid query param required' })
    const { role } = (req.body || {}) as { role?: string }
    if (!role || !VALID_ROLES.has(role)) {
      return res.status(400).json({ error: 'role must be editor or viewer' })
    }
    const { error } = await supabase
      .from('constellation_case_file_collaborators')
      .update({ role })
      .eq('id', cid)
      .eq('case_file_id', caseFileId)
    if (error) {
      console.error('[case-files:collab-role]', error)
      return res.status(400).json({ error: error.message })
    }
    return res.status(200).json({ ok: true })
  }

  // ── DELETE: remove collaborator (revoke) ──
  if (req.method === 'DELETE') {
    const cid = req.query.cid as string
    if (!cid) return res.status(400).json({ error: 'cid query param required' })
    const { error } = await supabase
      .from('constellation_case_file_collaborators')
      .delete()
      .eq('id', cid)
      .eq('case_file_id', caseFileId)
    if (error) {
      console.error('[case-files:collab-remove]', error)
      return res.status(400).json({ error: error.message })
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// ── Email composition ──

async function sendInviteEmail(opts: {
  to: string
  caseFileTitle: string
  inviterName: string
  acceptUrl: string
}) {
  const { Resend } = await import('resend')
  const resend = new Resend(RESEND_API_KEY)
  await resend.emails.send({
    from: 'Paradocs <invites@beta.discoverparadocs.com>',
    to: opts.to,
    subject: opts.inviterName + ' invited you to investigate "' + opts.caseFileTitle + '" on Paradocs',
    html: buildInviteHtml(opts),
    text: buildInviteText(opts),
  })
}

function buildInviteHtml({ caseFileTitle, inviterName, acceptUrl }: {
  caseFileTitle: string; inviterName: string; acceptUrl: string
}): string {
  const safeTitle = caseFileTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeInviter = inviterName.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `
<!doctype html>
<html>
  <body style="margin:0;background:#0a0a1a;color:#e5e7eb;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:24px 20px;">
      <div style="text-align:center;padding:16px 0;">
        <span style="font-size:28px;">🔭</span>
        <div style="font-weight:700;color:#fff;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;">Paradocs</div>
      </div>
      <div style="background:#111128;border:1px solid #222244;border-radius:12px;padding:24px;">
        <h1 style="margin:0 0 12px;font-size:18px;color:#fff;">
          ${safeInviter} wants to investigate with you
        </h1>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#cbd5e1;">
          You've been invited to collaborate on a paranormal research case file:
        </p>
        <div style="background:#1a1a2e;border-left:3px solid #a855f7;padding:10px 14px;margin:0 0 20px;border-radius:4px;">
          <div style="font-weight:600;color:#fff;font-size:15px;">${safeTitle}</div>
        </div>
        <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#9ca3af;">
          Case files are shared investigations — you'll see the same evidence, patterns, and connections the owner has built, and can contribute your own if given editor access.
        </p>
        <div style="text-align:center;">
          <a href="${acceptUrl}" style="display:inline-block;background:#a855f7;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:10px 20px;border-radius:8px;">
            Accept invitation
          </a>
        </div>
        <p style="margin:24px 0 0;font-size:11px;color:#6b7280;line-height:1.6;">
          This invite expires in 14 days. If you didn't expect it, you can ignore this email — no account will be created.
        </p>
      </div>
      <div style="text-align:center;margin-top:16px;font-size:11px;color:#6b7280;">
        Paradocs · Paranormal research, organized.
      </div>
    </div>
  </body>
</html>`
}

function buildInviteText({ caseFileTitle, inviterName, acceptUrl }: {
  caseFileTitle: string; inviterName: string; acceptUrl: string
}): string {
  return [
    inviterName + ' invited you to collaborate on a Paradocs case file:',
    '',
    '  ' + caseFileTitle,
    '',
    'Accept the invitation:',
    '  ' + acceptUrl,
    '',
    'This invite expires in 14 days.',
    '',
    'Paradocs — paranormal research, organized.',
  ].join('\n')
}
