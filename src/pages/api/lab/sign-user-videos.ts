// V11.17.78 - submission card upgrade
//
// POST /api/lab/sign-user-videos
//
// Body: { report_ids: string[] }
//
// Returns: { videos: Record<reportId, { videoUrl, posterUrl, durationSec }> }
//
// Why this endpoint exists: signUserVideoUrl needs SERVICE_ROLE_KEY to
// create signed URLs against private storage buckets, so it can't run
// in the browser. The lab.tsx client-side `loadReports` flow POSTs the
// ids of the user's video-bearing reports here, the server signs them
// with the service role, and returns the URL triples for the dossier
// card.
//
// Ownership: we verify every requested report id belongs to the
// authed user. A token-thief can't sign arbitrary other people's
// videos through this endpoint.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { signUserVideosForReports } from '@/lib/lab/sign-user-video'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'unauthorized' })

  var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await authClient.auth.getUser(token)
  var authedUser = userResult.data.user
  if (!authedUser) return res.status(401).json({ error: 'unauthorized' })
  var userId: string = authedUser.id

  var body = req.body || {}
  var reportIds: string[] = Array.isArray(body.report_ids) ? body.report_ids.filter(function (x: any) { return typeof x === 'string' && x.length > 0 }) : []
  if (reportIds.length === 0) {
    return res.status(200).json({ videos: {} })
  }
  if (reportIds.length > 50) {
    return res.status(400).json({ error: 'too_many_ids', limit: 50 })
  }

  // Verify ownership via service role.
  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  var ownedResp: any = await (svc.from('reports') as any)
    .select('id, has_video, submitted_by, source_type')
    .in('id', reportIds)
  if (ownedResp.error) {
    return res.status(500).json({ error: 'fetch_failed', detail: ownedResp.error.message })
  }
  var ownedRows: any[] = (ownedResp.data || []).filter(function (r: any) {
    return r && r.submitted_by === userId && r.source_type === 'user_submission'
  })
  if (ownedRows.length === 0) return res.status(200).json({ videos: {} })

  try {
    var signed = await signUserVideosForReports(ownedRows.map(function (r: any) {
      return { id: r.id, has_video: !!r.has_video }
    }))
    var out: Record<string, { videoUrl: string | null; posterUrl: string | null; durationSec: number | null; segments: unknown[] | null }> = {}
    signed.forEach(function (v, rid) {
      out[rid] = {
        videoUrl: v.videoUrl,
        posterUrl: v.posterUrl,
        durationSec: v.durationSec,
        segments: v.segments as any,
      }
    })
    return res.status(200).json({ videos: out })
  } catch (e: any) {
    return res.status(500).json({ error: 'sign_failed', detail: e?.message || String(e) })
  }
}
