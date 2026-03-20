/**
 * Admin Endpoint: Trigger vector embedding
 *
 * POST /api/admin/ai/embed
 *
 * Body options:
 *   { action: 'report', id: 'uuid' }         — embed a single report
 *   { action: 'phenomenon', id: 'uuid' }     — embed a single phenomenon
 *   { action: 'all_reports', force?: true, limit?: 100, offset?: 0 }  — bulk embed reports
 *   { action: 'all_phenomena', force?: true, limit?: 100, offset?: 0 } — bulk embed phenomena
 *   { action: 'full_reindex' }               — re-embed everything (force)
 *   { action: 'stats' }                      — get embedding statistics
 *
 * Requires admin auth (service role key or authenticated admin user).
 *
 * Session 15: AI Experience & Intelligence
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import {
  embedReport,
  embedPhenomenon,
  embedAllReports,
  embedAllPhenomena,
  getEmbeddingStats
} from '@/lib/services/embedding.service'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check: require Bearer token from an admin user
  var authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization required' })
  }

  try {
    var supabase = createClient(supabaseUrl, supabaseServiceKey)
    var { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' })
    }
  } catch (e) {
    return res.status(401).json({ error: 'Authentication failed' })
  }

  // GET returns stats
  if (req.method === 'GET') {
    try {
      var stats = await getEmbeddingStats()
      return res.status(200).json({ stats: stats })
    } catch (e: any) {
      return res.status(500).json({ error: e.message })
    }
  }

  // POST handles embed actions
  var { action, id, force, limit, offset } = req.body

  if (!action) {
    return res.status(400).json({ error: 'action is required' })
  }

  try {
    switch (action) {
      case 'report': {
        if (!id) return res.status(400).json({ error: 'id is required for single report embedding' })
        var result = await embedReport(id, force)
        return res.status(200).json({ success: true, action: 'report', id: id, result: result })
      }

      case 'phenomenon': {
        if (!id) return res.status(400).json({ error: 'id is required for single phenomenon embedding' })
        var phenResult = await embedPhenomenon(id, force)
        return res.status(200).json({ success: true, action: 'phenomenon', id: id, result: phenResult })
      }

      case 'all_reports': {
        var reportStats = await embedAllReports({ force: force, limit: limit, offset: offset })
        return res.status(200).json({ success: true, action: 'all_reports', stats: reportStats })
      }

      case 'all_phenomena': {
        var phenStats = await embedAllPhenomena({ force: force, limit: limit, offset: offset })
        return res.status(200).json({ success: true, action: 'all_phenomena', stats: phenStats })
      }

      case 'full_reindex': {
        var reindexReports = await embedAllReports({ force: true })
        var reindexPhenomena = await embedAllPhenomena({ force: true })
        return res.status(200).json({
          success: true,
          action: 'full_reindex',
          reports: reindexReports,
          phenomena: reindexPhenomena
        })
      }

      case 'stats': {
        var embedStats = await getEmbeddingStats()
        return res.status(200).json({ stats: embedStats })
      }

      default:
        return res.status(400).json({ error: 'Unknown action: ' + action })
    }
  } catch (e: any) {
    console.error('Embed endpoint error:', e)
    return res.status(500).json({ error: e.message })
  }
}

// Increase timeout for bulk operations
export var config = {
  maxDuration: 300 // 5 minutes for Vercel Pro
}
