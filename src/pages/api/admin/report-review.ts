import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Auth check — require service role key or admin session
  var authHeader = req.headers.authorization || ''
  var isServiceRole = authHeader.startsWith('Bearer ') && authHeader.includes('service_role')

  if (!isServiceRole) {
    // Check session-based auth
    var token = req.cookies['sb-bhkbctdmwnowfmqpksed-auth-token']
    if (!token) {
      // Try authorization header as session token
      var bearerToken = authHeader.replace('Bearer ', '')
      if (!bearerToken) {
        return res.status(401).json({ error: 'Unauthorized' })
      }
      var { data: userData } = await supabaseAdmin.auth.getUser(bearerToken)
      if (!userData?.user || userData.user.email !== 'williamschaseh@gmail.com') {
        return res.status(403).json({ error: 'Forbidden' })
      }
    }
  }

  if (req.method === 'GET') {
    return handleGet(req, res)
  } else if (req.method === 'POST') {
    return handlePost(req, res)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  var status = (req.query.status as string) || 'pending'
  var source = req.query.source as string
  var page = parseInt(req.query.page as string) || 1
  var limit = parseInt(req.query.limit as string) || 20
  var offset = (page - 1) * limit

  // Build query
  var query = supabaseAdmin
    .from('reports')
    .select('id, title, slug, description, summary, category, location_name, event_date, source_type, source_url, source_label, original_report_id, status, credibility, paradocs_assessment, paradocs_narrative, created_at, tags, submitted_by', { count: 'exact' })

  // "pending" filter shows both 'pending' and 'pending_review' — these are
  // reports awaiting admin action (user submissions start as 'pending',
  // ingested reports start as 'pending_review')
  if (status === 'pending') {
    query = query.in('status', ['pending', 'pending_review'])
  } else {
    query = query.eq('status', status)
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (source === 'ingested') {
    // "ingested" = everything that isn't a user submission
    query = query.neq('source_type', 'user_submission')
  } else if (source) {
    query = query.eq('source_type', source)
  }

  var { data: reports, count, error } = await query

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  // Get summary stats
  var { data: statsData } = await supabaseAdmin
    .from('reports')
    .select('status, source_type')

  var stats = {
    pending: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
    flagged: 0,
    by_source: {} as Record<string, number>
  }

  if (statsData) {
    for (var i = 0; i < statsData.length; i++) {
      var r = statsData[i]
      if (r.status === 'pending' || r.status === 'pending_review') {
        if (r.status === 'pending') stats.pending++
        else stats.pending_review++
        stats.by_source[r.source_type] = (stats.by_source[r.source_type] || 0) + 1
      } else if (r.status === 'approved') {
        stats.approved++
      } else if (r.status === 'rejected') {
        stats.rejected++
      } else if (r.status === 'flagged') {
        stats.flagged++
      }
    }
  }

  return res.status(200).json({
    reports: reports || [],
    total: count || 0,
    page: page,
    limit: limit,
    stats: stats
  })
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  var action = req.body.action as string
  var reportIds = req.body.reportIds as string[]

  if (!action || !reportIds || reportIds.length === 0) {
    return res.status(400).json({ error: 'Missing action or reportIds' })
  }

  if (action === 'approve') {
    var { error } = await supabaseAdmin
      .from('reports')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .in('id', reportIds)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ success: true, action: 'approved', count: reportIds.length })
  }

  if (action === 'reject') {
    var { error: rejectError } = await supabaseAdmin
      .from('reports')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .in('id', reportIds)

    if (rejectError) {
      return res.status(500).json({ error: rejectError.message })
    }

    return res.status(200).json({ success: true, action: 'rejected', count: reportIds.length })
  }

  return res.status(400).json({ error: 'Invalid action. Use "approve" or "reject".' })
}
