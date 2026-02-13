/**
 * API: /api/user/digests
 *
 * GET - Fetch user's digest history
 *   ?id=<digest_id> - Fetch a single digest (also marks it as read)
 *   ?limit=10&offset=0 - Paginated list
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import { markDigestRead } from '@/lib/services/digest.service'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = createServerClient()

  // Authenticate
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { id, limit = '10', offset = '0' } = req.query

    if (id && typeof id === 'string') {
      // Fetch single digest
      const { data, error } = await (supabase
        .from('weekly_digests') as any)
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (error || !data) {
        return res.status(404).json({ error: 'Digest not found' })
      }

      // Mark as read if not already
      if (!data.read_at) {
        await markDigestRead(id)
        data.read_at = new Date().toISOString()
      }

      return res.status(200).json(data)
    }

    // Fetch list
    const pageLimit = Math.min(parseInt(limit as string) || 10, 50)
    const pageOffset = parseInt(offset as string) || 0

    const { data, error, count } = await (supabase
      .from('weekly_digests') as any)
      .select('id, week_start, week_end, read_at, email_sent_at, created_at, digest_data', { count: 'exact' })
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .range(pageOffset, pageOffset + pageLimit - 1)

    if (error) {
      console.error('[Digests API] Error:', error)
      return res.status(500).json({ error: 'Failed to fetch digests' })
    }

    return res.status(200).json({
      digests: data || [],
      total: count || 0,
      limit: pageLimit,
      offset: pageOffset,
    })
  } catch (error) {
    console.error('[Digests API] Exception:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
