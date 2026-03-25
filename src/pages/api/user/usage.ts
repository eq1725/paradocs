/**
 * GET/POST /api/user/usage — Usage tracking for depth gating.
 *
 * GET: Returns today's usage counts for the authenticated user.
 * POST: Increments a specific usage counter.
 *
 * Actions:
 *   - increment_case_view: +1 case view today
 *   - increment_ai_search: +1 AI search this month
 *   - increment_ask_unknown: +1 Ask the Unknown this week
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

async function getUserId(req: NextApiRequest): Promise<string | null> {
  var authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  var token = authHeader.substring(7)
  var supabaseAuth = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  var { data } = await supabaseAuth.auth.getUser(token)
  return data?.user?.id || null
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  var supabase = getSupabase()
  var today = todayStr()

  if (req.method === 'GET') {
    var userId = await getUserId(req)
    if (!userId) {
      return res.status(200).json({ case_views: 0, ai_searches: 0, ask_unknown_count: 0 })
    }

    var { data } = await supabase
      .from('user_usage')
      .select('case_views, ai_searches, ask_unknown_count')
      .eq('user_id', userId)
      .eq('usage_date', today)
      .single()

    return res.status(200).json({
      case_views: data?.case_views || 0,
      ai_searches: data?.ai_searches || 0,
      ask_unknown_count: data?.ask_unknown_count || 0,
    })
  }

  if (req.method === 'POST') {
    var userId2 = await getUserId(req)
    if (!userId2) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    var action = req.body?.action
    if (!action) {
      return res.status(400).json({ error: 'Missing action' })
    }

    // Upsert today's row
    var { data: existing } = await supabase
      .from('user_usage')
      .select('id, case_views, ai_searches, ask_unknown_count')
      .eq('user_id', userId2)
      .eq('usage_date', today)
      .single()

    if (!existing) {
      // Create new row for today
      var initial: Record<string, any> = {
        user_id: userId2,
        usage_date: today,
        case_views: 0,
        ai_searches: 0,
        ask_unknown_count: 0,
      }

      if (action === 'increment_case_view') initial.case_views = 1
      else if (action === 'increment_ai_search') initial.ai_searches = 1
      else if (action === 'increment_ask_unknown') initial.ask_unknown_count = 1

      var { error: insertErr } = await supabase.from('user_usage').insert(initial)
      if (insertErr) {
        console.error('[Usage] Insert error:', insertErr)
        return res.status(500).json({ error: 'Insert failed' })
      }
      return res.status(200).json({ success: true })
    }

    // Update existing row
    var updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (action === 'increment_case_view') {
      updates.case_views = (existing.case_views || 0) + 1
    } else if (action === 'increment_ai_search') {
      updates.ai_searches = (existing.ai_searches || 0) + 1
    } else if (action === 'increment_ask_unknown') {
      updates.ask_unknown_count = (existing.ask_unknown_count || 0) + 1
    } else {
      return res.status(400).json({ error: 'Invalid action' })
    }

    var { error: updateErr } = await supabase
      .from('user_usage')
      .update(updates)
      .eq('id', existing.id)

    if (updateErr) {
      console.error('[Usage] Update error:', updateErr)
      return res.status(500).json({ error: 'Update failed' })
    }

    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
