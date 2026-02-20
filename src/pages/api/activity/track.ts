import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get user from auth header
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const { action_type, phenomenon_id, category, metadata } = req.body

    if (!action_type || !['view', 'save', 'search', 'explore_category'].includes(action_type)) {
      return res.status(400).json({ error: 'Invalid action_type' })
    }

    // Insert activity record
    const { error } = await supabase
      .from('user_activity')
      .insert({
        user_id: user.id,
        action_type,
        phenomenon_id: phenomenon_id || null,
        category: category || null,
        metadata: metadata || {},
      })

    if (error) {
      // If table doesn't exist, fail gracefully
      if (error.code === '42P01') {
        console.warn('user_activity table does not exist yet')
        return res.status(200).json({ ok: true, warning: 'table_not_ready' })
      }
      throw error
    }

    return res.status(200).json({ ok: true })
  } catch (err: any) {
    console.error('Activity tracking error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
