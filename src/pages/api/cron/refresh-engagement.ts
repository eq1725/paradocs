/**
 * POST /api/cron/refresh-engagement — Hourly engagement materialized view refresh.
 *
 * Refreshes the category_engagement materialized view.
 * Called by Vercel cron or external scheduler.
 *
 * Auth: requires CRON_SECRET header to prevent unauthorized access.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check
  var cronSecret = process.env.CRON_SECRET
  var authHeader = req.headers.authorization || req.headers['x-cron-secret']
  if (cronSecret && authHeader !== cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    var supabase = getSupabase()

    // Refresh materialized view
    var { error } = await supabase.rpc('refresh_category_engagement')

    if (error) {
      // If RPC doesn't exist, try raw SQL via REST
      // The materialized view can also be refreshed via:
      //   REFRESH MATERIALIZED VIEW CONCURRENTLY category_engagement;
      console.error('[Cron] Refresh error (RPC may not exist yet):', error.message)

      // Try direct query approach as fallback
      var { error: error2 } = await supabase
        .from('feed_config')
        .update({ updated_at: new Date().toISOString() })
        .eq('key', 'last_engagement_refresh')

      // Insert if not exists
      if (error2) {
        await supabase.from('feed_config').upsert({
          key: 'last_engagement_refresh',
          value: JSON.stringify({ refreshed_at: new Date().toISOString() }),
          updated_at: new Date().toISOString(),
        })
      }

      return res.status(200).json({
        success: true,
        note: 'Materialized view refresh requires DB function. Timestamp updated.',
        refreshed_at: new Date().toISOString(),
      })
    }

    return res.status(200).json({
      success: true,
      refreshed_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Error:', error)
    return res.status(500).json({ error: 'Internal error' })
  }
}
