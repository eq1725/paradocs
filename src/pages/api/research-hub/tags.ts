/**
 * GET /api/research-hub/tags
 *
 * Returns all unique tags used by the authenticated user across their artifacts.
 * Used for tag suggestions in ArtifactQuickAdd.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var supabase = createServerClient()

  var token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  var authResult = await supabase.auth.getUser(token)
  if (authResult.error || !authResult.data.user) {
    return res.status(401).json({ error: 'Invalid token' })
  }
  var user = authResult.data.user

  try {
    // Fetch all artifacts for this user that have tags
    var result = await supabase
      .from('constellation_artifacts')
      .select('tags')
      .eq('user_id', user.id)
      .not('tags', 'eq', '{}')

    if (result.error) {
      if (result.error.code === '42P01') {
        return res.status(200).json({ tags: [] })
      }
      throw result.error
    }

    // Flatten and count tag occurrences
    var tagCounts: Record<string, number> = {}
    if (result.data) {
      for (var i = 0; i < result.data.length; i++) {
        var row = result.data[i] as any
        if (row.tags && Array.isArray(row.tags)) {
          for (var j = 0; j < row.tags.length; j++) {
            var tag = row.tags[j]
            if (tag && typeof tag === 'string') {
              var lower = tag.toLowerCase().trim()
              if (lower) {
                tagCounts[lower] = (tagCounts[lower] || 0) + 1
              }
            }
          }
        }
      }
    }

    // Sort by frequency (most used first)
    var sortedTags = Object.keys(tagCounts).sort(function(a, b) {
      return tagCounts[b] - tagCounts[a]
    })

    return res.status(200).json({ tags: sortedTags })
  } catch (error: any) {
    console.error('Tags API error:', error)
    return res.status(500).json({ error: 'Failed to fetch tags' })
  }
}
