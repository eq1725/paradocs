/**
 * API Route: /api/admin/ai/generate-hooks
 *
 * Admin endpoint for generating feed hooks for reports.
 * Supports single report, batch missing, force-all, and stats actions.
 *
 * Session 10: Data Ingestion & Pipeline
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import {
  generateAndSaveFeedHook,
  generateHooksBatch,
  getFeedHookStats
} from '@/lib/services/feed-hook.service'

function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey)
}

function getSupabaseUser(req: NextApiRequest) {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: req.headers.authorization || '',
      },
    },
  })
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Auth check
    var supabaseUser = getSupabaseUser(req)
    var authHeader = req.headers.authorization
    var userId: string | null = null

    if (authHeader && authHeader.startsWith('Bearer ')) {
      var token = authHeader.substring(7)
      var { data: authData } = await supabaseUser.auth.getUser(token)
      userId = authData?.user?.id || null
    }

    // Check admin key fallback
    var adminKey = req.headers['x-admin-key']
    var isAdminKey = adminKey === process.env.ADMIN_API_KEY

    if (!userId && !isAdminKey) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // If user auth, verify admin role
    if (userId && !isAdminKey) {
      var supabaseAdmin = getSupabaseAdmin()
      var { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      if (!profile || profile.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' })
      }
    }

    var { action, id, force, limit } = req.body
    var supabase = getSupabaseAdmin()

    // Action: stats — get hook generation statistics
    if (action === 'stats') {
      var stats = await getFeedHookStats()
      return res.status(200).json({ success: true, stats: stats })
    }

    // Action: single — generate hook for one report
    if (action === 'single') {
      if (!id) {
        return res.status(400).json({ error: 'Report ID required for single action' })
      }
      var hook = await generateAndSaveFeedHook(id)
      return res.status(200).json({
        success: !!hook,
        hook: hook,
        reportId: id
      })
    }

    // Action: all_missing — batch generate for reports without hooks
    if (action === 'all_missing') {
      var queryLimit = limit || 100

      var { data: reports, error: queryError } = await supabase
        .from('reports')
        .select('id')
        .eq('status', 'approved')
        .is('feed_hook', null)
        .order('created_at', { ascending: true })
        .limit(queryLimit)

      if (queryError || !reports) {
        return res.status(500).json({ error: 'Failed to query reports: ' + (queryError?.message || 'unknown') })
      }

      if (reports.length === 0) {
        return res.status(200).json({ success: true, message: 'All approved reports already have hooks', generated: 0 })
      }

      var ids = reports.map(function(r) { return r.id })
      var batchResult = await generateHooksBatch(ids, { force: false })

      return res.status(200).json({
        success: true,
        total_queried: reports.length,
        generated: batchResult.generated,
        skipped: batchResult.skipped,
        failed: batchResult.failed,
        errors: batchResult.errors.slice(0, 10) // Limit error output
      })
    }

    // Action: all — force regenerate for all approved reports
    if (action === 'all') {
      var allLimit = limit || 50

      var { data: allReports, error: allError } = await supabase
        .from('reports')
        .select('id')
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
        .limit(allLimit)

      if (allError || !allReports) {
        return res.status(500).json({ error: 'Failed to query reports: ' + (allError?.message || 'unknown') })
      }

      var allIds = allReports.map(function(r) { return r.id })
      var allResult = await generateHooksBatch(allIds, { force: !!force })

      return res.status(200).json({
        success: true,
        total_queried: allReports.length,
        generated: allResult.generated,
        skipped: allResult.skipped,
        failed: allResult.failed,
        errors: allResult.errors.slice(0, 10)
      })
    }

    return res.status(400).json({ error: 'Invalid action. Use: single, all_missing, all, stats' })

  } catch (error: any) {
    console.error('[generate-hooks] Error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
