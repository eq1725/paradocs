/**
 * GET /api/admin/preview-report?slug=xxx
 * Returns a report regardless of status — admin only.
 * Used by the report page in ?preview=true mode.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check — admin only
  var authHeader = req.headers.authorization || ''
  var bearerToken = authHeader.replace('Bearer ', '')
  if (!bearerToken) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  var { data: userData } = await supabaseAdmin.auth.getUser(bearerToken)
  if (!userData?.user || userData.user.email !== 'williamschaseh@gmail.com') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  var slug = req.query.slug as string
  if (!slug) {
    return res.status(400).json({ error: 'Missing slug parameter' })
  }

  // Fetch report with service role (bypasses RLS)
  var { data: report, error } = await supabaseAdmin
    .from('reports')
    .select(`
      *,
      phenomenon_type:phenomenon_types(*)
    `)
    .eq('slug', slug)
    .single()

  if (error || !report) {
    return res.status(404).json({ error: 'Report not found' })
  }

  // Fetch media
  var { data: media } = await supabaseAdmin
    .from('report_media')
    .select('*')
    .eq('report_id', report.id)
    .order('is_primary', { ascending: false })

  // Fetch comments
  var { data: comments } = await supabaseAdmin
    .from('comments')
    .select(`
      *,
      user:profiles(*)
    `)
    .eq('report_id', report.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })

  return res.status(200).json({
    report,
    media: media || [],
    comments: comments || [],
  })
}
