import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { generateAndSaveParadocsAnalysis } from '@/lib/services/paradocs-analysis.service'

var supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// V11 (May 2026) — Admin-approval Sonnet trigger.
//
// When the engine inserts an ingested report with status='approved' (score
// ≥ source threshold), Sonnet analysis runs synchronously in the engine.
// But when a report lands in pending_review and an admin promotes it
// later, the original Sonnet path is bypassed — leaving paradocs_narrative,
// feed_hook, answer_line, paradocs_assessment all null. The report renders
// nearly-empty on /report/[slug] because scrubIndexReport() nullifies the
// raw description and the AI fields are missing.
//
// This helper closes that gap: after an admin approves a batch, we fire
// generateAndSaveParadocsAnalysis for each report that's missing
// paradocs_narrative. Runs in parallel with a small concurrency limit so
// we don't spike the Anthropic API. Service has its own retry orchestrator.
//
// Failures are captured into the response payload (analysisErrors[]) so
// the admin UI can surface them — the status update itself is NOT rolled
// back on Sonnet failure (the manual backfill script is the fallback).
const APPROVAL_SONNET_CONCURRENCY = 3
async function runApprovalSonnetForBatch(reportIds: string[]): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}> {
  if (!reportIds || reportIds.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, errors: [] }
  }

  // Filter to only those that actually need analysis (skip ones already populated).
  var { data: needsAnalysis } = await supabaseAdmin
    .from('reports')
    .select('id, paradocs_narrative')
    .in('id', reportIds)
    .or('paradocs_narrative.is.null,paradocs_narrative.eq.')

  var targets: string[] = (needsAnalysis || []).map(function (r: any) { return r.id })
  if (targets.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, errors: [] }
  }

  var succeeded = 0
  var failed = 0
  var errors: Array<{ id: string; error: string }> = []

  // Simple chunked parallelism — process in groups of APPROVAL_SONNET_CONCURRENCY
  for (var i = 0; i < targets.length; i += APPROVAL_SONNET_CONCURRENCY) {
    var chunk = targets.slice(i, i + APPROVAL_SONNET_CONCURRENCY)
    var results = await Promise.all(chunk.map(function (id) {
      return generateAndSaveParadocsAnalysis(id)
        .then(function (ok: boolean) {
          return { id: id, ok: ok, err: ok ? null : 'analysis returned false' }
        })
        .catch(function (e: any) {
          return { id: id, ok: false, err: (e && e.message) || String(e) }
        })
    }))
    for (var j = 0; j < results.length; j++) {
      var r = results[j]
      if (r.ok) {
        succeeded++
      } else {
        failed++
        errors.push({ id: r.id, error: r.err || 'unknown' })
      }
    }
  }

  return { attempted: targets.length, succeeded: succeeded, failed: failed, errors: errors }
}

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
    .select('id, title, slug, description, summary, category, location_name, location_description, country, state_province, city, latitude, longitude, event_date, event_time, event_date_precision, event_date_raw, event_date_approximate, event_duration_minutes, witness_count, submitter_was_witness, has_physical_evidence, has_photo_video, has_official_report, evidence_summary, source_type, source_url, source_label, original_report_id, status, credibility, paradocs_assessment, paradocs_narrative, created_at, updated_at, tags, submitted_by, anonymous_submission', { count: 'exact' })

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

    // Fire Sonnet analysis for any approved reports missing paradocs_narrative.
    // This is what makes the admin queue a true safety net: a reviewer clicks
    // Approve and the report goes live with full AI copy populated.
    var analysisStats = await runApprovalSonnetForBatch(reportIds)

    return res.status(200).json({
      success: true,
      action: 'approved',
      count: reportIds.length,
      analysis: analysisStats,
    })
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
