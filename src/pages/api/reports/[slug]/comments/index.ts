/**
 * GET  /api/reports/[slug]/comments
 * POST /api/reports/[slug]/comments
 *
 * V9.12 Phase 2.D — Comment threads.
 *
 * GET (no auth required):
 *   Returns approved, non-deleted comments for the report,
 *   ordered by created_at ascending. Includes author display info
 *   (username, display_name, avatar_url). Top-level + replies in
 *   one flat array; client groups by parent_id for rendering.
 *
 * POST (auth required):
 *   Body: { body: string, parent_id?: UUID }
 *   - Validates body length (1-2000 chars; DB enforces too)
 *   - Runs moderateText(body, 'comment')
 *   - If rejected: persists with status='rejected' + reason; the
 *     row is visible only to the author so they get feedback that
 *     their comment didn't pass
 *   - If approved: persists with status='approved'; immediately
 *     visible in public reads
 *   - If pending (moderation service errored): persist as approved
 *     so we don't silently drop user content (fail-open matches
 *     the experience-moderation pattern)
 *
 * Returns: { comment } on POST, { comments: [...] } on GET.
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { moderateText } from '@/lib/services/text-moderation.service'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

var MAX_BODY_LEN = 2000
var MIN_BODY_LEN = 1

async function resolveReportId(svc: any, slug: string): Promise<string | null> {
  var result = await svc.from('reports').select('id').eq('slug', slug).limit(1).single()
  if (result && result.data) return result.data.id
  return null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  var slug = String(req.query.slug || '').trim()
  if (!slug) return res.status(400).json({ error: 'Missing slug' })

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  var reportId = await resolveReportId(svc, slug)
  if (!reportId) return res.status(404).json({ error: 'Report not found' })

  if (req.method === 'GET') {
    // Public read — joins profile fields for author display.
    var result = await svc
      .from('report_comments')
      .select('id, report_id, user_id, parent_id, body, created_at, edited_at')
      .eq('report_id', reportId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(500)
    var rows: any[] = (result && result.data) || []

    // Fetch author profiles in one shot.
    var userIds = Array.from(new Set(rows.map(function (r: any) { return r.user_id })))
    var profilesMap: Record<string, any> = {}
    if (userIds.length > 0) {
      var pResult = await svc
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', userIds)
      var prows: any[] = (pResult && pResult.data) || []
      prows.forEach(function (p: any) { profilesMap[p.id] = p })
    }

    var comments = rows.map(function (r: any) {
      var p = profilesMap[r.user_id] || {}
      return {
        id: r.id,
        parent_id: r.parent_id,
        body: r.body,
        created_at: r.created_at,
        edited_at: r.edited_at,
        author: {
          user_id: r.user_id,
          username: p.username || null,
          display_name: p.display_name || null,
          avatar_url: p.avatar_url || null,
        },
      }
    })

    return res.status(200).json({ comments: comments, total: comments.length })
  }

  if (req.method === 'POST') {
    // Auth required.
    var authHeader = req.headers.authorization || ''
    var token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Not authenticated' })

    var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: 'Bearer ' + token } },
    })
    var userResult = await authClient.auth.getUser(token)
    var user = userResult.data.user
    if (!user) return res.status(401).json({ error: 'Invalid session' })

    var body = String((req.body && req.body.body) || '').trim()
    var parentId = req.body && req.body.parent_id ? String(req.body.parent_id) : null

    if (body.length < MIN_BODY_LEN) return res.status(400).json({ error: 'Comment cannot be empty' })
    if (body.length > MAX_BODY_LEN) return res.status(400).json({ error: 'Comment too long (max ' + MAX_BODY_LEN + ' chars)' })

    // Optional: validate parent_id belongs to the same report.
    if (parentId) {
      var parentCheck = await svc.from('report_comments').select('id, report_id').eq('id', parentId).single()
      if (!parentCheck.data || parentCheck.data.report_id !== reportId) {
        return res.status(400).json({ error: 'Invalid parent comment' })
      }
    }

    // Moderation. Fails open per moderateText() contract.
    var moderation = await moderateText(body, 'comment')
    var status = 'approved'
    var moderationReason: string | null = null
    if (moderation.decision === 'rejected') {
      status = 'rejected'
      moderationReason = moderation.reason || 'Did not pass community guidelines.'
    } else if (moderation.decision === 'pending') {
      // We treat 'pending' as approved at insert time — the comment
      // is visible publicly. If the human-review queue later flips
      // it to rejected, RLS will hide it from public reads.
      status = 'approved'
      moderationReason = moderation.reason || null
    }

    var insertResult = await (svc.from('report_comments') as any)
      .insert({
        report_id: reportId,
        user_id: user.id,
        parent_id: parentId,
        body: body,
        status: status,
        moderation_reason: moderationReason,
      })
      .select('id, report_id, user_id, parent_id, body, status, moderation_reason, created_at')
      .single()

    if (insertResult.error) {
      console.error('comments insert error:', insertResult.error)
      return res.status(500).json({ error: 'Failed to post comment' })
    }

    var inserted = insertResult.data

    // Pull author profile for response so the client can render
    // immediately without re-fetching the whole thread.
    var pResult2 = await svc.from('profiles').select('username, display_name, avatar_url').eq('id', user.id).single()
    var prof: any = (pResult2 && pResult2.data) || {}

    return res.status(201).json({
      comment: {
        id: inserted.id,
        parent_id: inserted.parent_id,
        body: inserted.body,
        status: inserted.status,
        moderation_reason: inserted.moderation_reason,
        created_at: inserted.created_at,
        author: {
          user_id: user.id,
          username: prof.username || null,
          display_name: prof.display_name || null,
          avatar_url: prof.avatar_url || null,
        },
      },
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
