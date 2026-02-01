/**
 * Admin API: POST /api/admin/delete-reports
 *
 * Deletes reports by slug or ID
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

  const { slugs, ids } = req.body as { slugs?: string[]; ids?: string[] }

  if (!slugs?.length && !ids?.length) {
    return res.status(400).json({ error: 'Provide slugs or ids array' })
  }

  try {
    const results: { slug?: string; id?: string; success: boolean; error?: string }[] = []

    // Delete by slugs
    if (slugs?.length) {
      for (const slug of slugs) {
        const { error } = await supabaseAdmin
          .from('reports')
          .delete()
          .eq('slug', slug)

        results.push({
          slug,
          success: !error,
          error: error?.message
        })
      }
    }

    // Delete by IDs
    if (ids?.length) {
      for (const id of ids) {
        const { error } = await supabaseAdmin
          .from('reports')
          .delete()
          .eq('id', id)

        results.push({
          id,
          success: !error,
          error: error?.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return res.status(200).json({
      message: `Deleted ${successCount} reports, ${failCount} failed`,
      results
    })

  } catch (error) {
    console.error('[Delete Reports] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
