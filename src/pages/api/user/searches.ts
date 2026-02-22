/**
 * GET /api/user/searches
 * Returns user's saved searches ordered by updated_at (descending)
 *
 * POST /api/user/searches
 * Creates a new saved search
 * Body: { name, description?, search_query?, filters, alerts_enabled?, alert_frequency? }
 *
 * PATCH /api/user/searches
 * Updates a saved search
 * Body: { id, name?, description?, filters?, alerts_enabled?, alert_frequency? }
 *
 * DELETE /api/user/searches
 * Deletes a saved search
 * Query param: id
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const supabase = createServerClient()

  // Get authenticated user
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('saved_searches')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

      if (error) throw error

      return res.status(200).json({
        searches: data || []
      })
    } catch (error: any) {
      console.error('Error fetching saved searches:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, description, search_query, filters, alerts_enabled, alert_frequency } = req.body

      // Validate required fields
      if (!name) {
        return res.status(400).json({ error: 'name is required' })
      }

      if (!filters) {
        return res.status(400).json({ error: 'filters is required' })
      }

      const { data, error } = await supabase
        .from('saved_searches')
        .insert({
          user_id: user.id,
          name,
          description: description || null,
          search_query: search_query || null,
          filters,
          alerts_enabled: alerts_enabled ?? false,
          alert_frequency: alert_frequency || null,
          new_results_count: 0
        })
        .select('*')
        .single()

      if (error) throw error

      return res.status(201).json({ message: 'Saved search created', search: data })
    } catch (error: any) {
      console.error('Error creating saved search:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { id, name, description, filters, alerts_enabled, alert_frequency } = req.body

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      // Build update object with only provided fields
      const updateData: any = {
        updated_at: new Date().toISOString()
      }

      if (name !== undefined) updateData.name = name
      if (description !== undefined) updateData.description = description || null
      if (filters !== undefined) updateData.filters = filters
      if (alerts_enabled !== undefined) updateData.alerts_enabled = alerts_enabled
      if (alert_frequency !== undefined) updateData.alert_frequency = alert_frequency || null

      const { data, error } = await supabase
        .from('saved_searches')
        .update(updateData)
        .eq('user_id', user.id)
        .eq('id', id)
        .select('*')
        .single()

      if (error) throw error

      if (!data) {
        return res.status(404).json({ error: 'Saved search not found' })
      }

      return res.status(200).json({ message: 'Saved search updated', search: data })
    } catch (error: any) {
      console.error('Error updating saved search:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.query

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      const { error } = await supabase
        .from('saved_searches')
        .delete()
        .eq('user_id', user.id)
        .eq('id', id)

      if (error) throw error

      return res.status(200).json({ message: 'Saved search deleted' })
    } catch (error: any) {
      console.error('Error deleting saved search:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
