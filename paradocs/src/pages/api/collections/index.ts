/**
 * Collections API
 * GET - List user's collections
 * POST - Create a new collection
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
    // List user's collections
    const { data: collections, error } = await supabase
      .from('collections')
      .select(`
        *,
        collection_reports (
          id,
          report_id
        )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching collections:', error)
      return res.status(500).json({ error: 'Failed to fetch collections' })
    }

    return res.status(200).json({ collections })

  } else if (req.method === 'POST') {
    // Check if user can create collections
    const canCreate = await canPerformAction(user.id, 'create_collection')

    if (!canCreate.allowed) {
      return res.status(403).json({
        error: 'Collection limit reached',
        limit: canCreate.limit,
        remaining: canCreate.remaining,
        upgrade: true
      })
    }

    const { name, description, color, icon, is_public } = req.body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Collection name is required' })
    }

    // Create collection
    const { data: collection, error } = await supabase
      .from('collections')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        color: color || '#6366f1',
        icon: icon || 'folder',
        is_public: is_public || false
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating collection:', error)
      return res.status(500).json({ error: 'Failed to create collection' })
    }

    // Increment usage
    await incrementUsage(user.id, 'collections_created')

    return res.status(201).json({ collection })

  } else {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }
}
