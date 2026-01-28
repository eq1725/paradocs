/**
 * Single Saved Search API
 * GET - Get saved search details and run it
 * PUT - Update saved search
 * DELETE - Delete saved search
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerClient()
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Saved search ID is required' })
  }

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    // Get saved search
    const { data: savedSearch, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('Error fetching saved search:', error)
      return res.status(404).json({ error: 'Saved search not found' })
    }

    // Optionally run the search and return results
    const { run } = req.query

    if (run === 'true') {
      // Build query based on saved filters
      let query = supabase
        .from('reports')
        .select('id, title, slug, summary, category, event_date, location_name, country, credibility, has_photo_video')
        .eq('status', 'approved')

      // Apply text search if present
      if (savedSearch.search_query) {
        query = query.textSearch('search_vector', savedSearch.search_query)
      }

      // Apply filters
      const filters = savedSearch.filters || {}

      if (filters.category) {
        query = query.eq('category', filters.category)
      }

      if (filters.country) {
        query = query.eq('country', filters.country)
      }

      if (filters.credibility) {
        query = query.eq('credibility', filters.credibility)
      }

      if (filters.has_photo_video !== undefined) {
        query = query.eq('has_photo_video', filters.has_photo_video)
      }

      if (filters.date_from) {
        query = query.gte('event_date', filters.date_from)
      }

      if (filters.date_to) {
        query = query.lte('event_date', filters.date_to)
      }

      // Order and limit
      query = query.order('created_at', { ascending: false }).limit(50)

      const { data: results, error: searchError } = await query

      if (searchError) {
        console.error('Error running saved search:', searchError)
        return res.status(500).json({ error: 'Failed to run search' })
      }

      // Update last checked timestamp
      await supabase
        .from('saved_searches')
        .update({ last_checked_at: new Date().toISOString() })
        .eq('id', id)

      return res.status(200).json({ savedSearch, results })
    }

    return res.status(200).json({ savedSearch })

  } else if (req.method === 'PUT') {
    // Check ownership
    const { data: existing } = await supabase
      .from('saved_searches')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const { name, description, search_query, filters, alerts_enabled, alert_frequency } = req.body

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name.trim()
    if (description !== undefined) updates.description = description?.trim() || null
    if (search_query !== undefined) updates.search_query = search_query
    if (filters !== undefined) updates.filters = filters
    if (alerts_enabled !== undefined) updates.alerts_enabled = alerts_enabled
    if (alert_frequency !== undefined) updates.alert_frequency = alert_frequency

    const { data: savedSearch, error } = await supabase
      .from('saved_searches')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating saved search:', error)
      return res.status(500).json({ error: 'Failed to update saved search' })
    }

    return res.status(200).json({ savedSearch })

  } else if (req.method === 'DELETE') {
    // Check ownership
    const { data: existing } = await supabase
      .from('saved_searches')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const { error } = await supabase
      .from('saved_searches')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting saved search:', error)
      return res.status(500).json({ error: 'Failed to delete saved search' })
    }

    return res.status(200).json({ success: true })

  } else {
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }
}
