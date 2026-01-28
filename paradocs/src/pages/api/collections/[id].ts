/**
 * Single Collection API
 * GET - Get collection details with reports
 * PUT - Update collection
 * DELETE - Delete collection
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerClient()
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Collection ID is required' })
  }

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    // Get collection with reports
    const { data: collection, error } = await supabase
      .from('collections')
      .select(`
        *,
        collection_reports (
          id,
          user_notes,
          tags,
          added_at,
          report:reports (
            id,
            title,
            slug,
            summary,
            category,
            event_date,
            location_name,
            country,
            credibility,
            has_photo_video
          )
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching collection:', error)
      return res.status(404).json({ error: 'Collection not found' })
    }

    // Check access
    if (collection.user_id !== user.id && !collection.is_public) {
      // Check if user is a collaborator
      const { data: collaborator } = await supabase
        .from('collection_collaborators')
        .select('role')
        .eq('collection_id', id)
        .eq('user_id', user.id)
        .single()

      if (!collaborator) {
        return res.status(403).json({ error: 'Access denied' })
      }
    }

    return res.status(200).json({ collection })

  } else if (req.method === 'PUT') {
    // Check ownership
    const { data: existing } = await supabase
      .from('collections')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const { name, description, color, icon, is_public } = req.body

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name.trim()
    if (description !== undefined) updates.description = description?.trim() || null
    if (color !== undefined) updates.color = color
    if (icon !== undefined) updates.icon = icon
    if (is_public !== undefined) updates.is_public = is_public

    const { data: collection, error } = await supabase
      .from('collections')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating collection:', error)
      return res.status(500).json({ error: 'Failed to update collection' })
    }

    return res.status(200).json({ collection })

  } else if (req.method === 'DELETE') {
    // Check ownership
    const { data: existing } = await supabase
      .from('collections')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const { error } = await supabase
      .from('collections')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting collection:', error)
      return res.status(500).json({ error: 'Failed to delete collection' })
    }

    return res.status(200).json({ success: true })

  } else {
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }
}
