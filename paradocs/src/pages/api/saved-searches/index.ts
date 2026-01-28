/**
 * Saved Searches API
 * GET - List user's saved searches
 * POST - Create a new saved search
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import { canPerformAction, incrementUsage } from '@/lib/subscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerClient()

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    // List user's saved searches
    const { data: savedSearches, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching saved searches:', error)
      return res.status(500).json({ error: 'Failed to fetch saved searches' })
    }

    return res.status(200).json({ savedSearches })

  } else if (req.method === 'POST') {
    // Check if user can create saved searches
    const canCreate = await canPerformAction(user.id, 'create_saved_search')

    if (!canCreate.allowed) {
      return res.status(403).json({
        error: 'Saved search limit reached',
        limit: canCreate.limit,
        remaining: canCreate.remaining,
        upgrade: true
      })
    }

    const { name, description, search_query, filters, alerts_enabled, alert_frequency } = req.body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Search name is required' })
    }

    // Create saved search
    const { data: savedSearch, error } = await supabase
      .from('saved_searches')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        search_query: search_query || null,
        filters: filters || {},
        alerts_enabled: alerts_enabled || false,
        alert_frequency: alert_frequency || 'daily'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating saved search:', error)
      return res.status(500).json({ error: 'Failed to create saved search' })
    }

    // Increment usage
    await incrementUsage(user.id, 'saved_searches_created')

    return res.status(201).json({ savedSearch })

  } else {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }
}
