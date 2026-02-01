/**
 * Admin API: POST /api/admin/backfill-reddit-country
 *
 * Updates Reddit posts that don't have a country set to default to "United States"
 * since Reddit is predominantly US-based
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const dryRun = req.query.dryRun === 'true'

  try {
    console.log(`[Backfill Reddit Country] Starting (dryRun: ${dryRun})...`)

    // Find Reddit reports without a country
    const { data: reports, error: fetchError } = await supabaseAdmin
      .from('reports')
      .select('id, title, source_type, country')
      .eq('source_type', 'reddit')
      .is('country', null)
      .limit(50000)

    if (fetchError) throw fetchError

    const toUpdate = reports || []
    console.log(`[Backfill Reddit Country] Found ${toUpdate.length} Reddit reports without country`)

    const samples = toUpdate.slice(0, 10).map(r => ({
      id: r.id,
      title: r.title?.substring(0, 50) || '',
      currentCountry: r.country
    }))

    if (!dryRun && toUpdate.length > 0) {
      // Update in batches
      const batchSize = 500
      let updated = 0

      for (let i = 0; i < toUpdate.length; i += batchSize) {
        const batch = toUpdate.slice(i, i + batchSize)
        const ids = batch.map(r => r.id)

        const { error: updateError } = await supabaseAdmin
          .from('reports')
          .update({ country: 'United States' })
          .in('id', ids)

        if (updateError) {
          console.error(`[Backfill Reddit Country] Batch update failed:`, updateError)
        } else {
          updated += batch.length
        }
      }

      console.log(`[Backfill Reddit Country] Updated ${updated} reports`)
    }

    return res.status(200).json({
      success: true,
      dryRun,
      totalFound: toUpdate.length,
      updated: dryRun ? 0 : toUpdate.length,
      samples
    })

  } catch (error) {
    console.error('[Backfill Reddit Country] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
