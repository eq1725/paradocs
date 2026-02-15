/**
 * GET /api/user/saved
 * Returns user's saved reports with pagination
 * Optional query params: collection (filter by collection name), collections_only (list collection names)
 *
 * POST /api/user/saved
 * Saves a report to user's list (idempotent), optionally to a collection
 *
 * DELETE /api/user/saved
 * Removes a report from saved list
 *
 * PATCH /api/user/saved
 * Move a saved report to a different collection
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
      // If requesting just collection names
      if (req.query.collections_only === 'true') {
        const { data, error } = await supabase
          .from('saved_reports')
          .select('collection_name')
          .eq('user_id', user.id)
          .not('collection_name', 'is', null)
          .order('collection_name')

        if (error) throw error

        const collections = [...new Set((data || []).map(d => d.collection_name).filter(Boolean))]
        return res.status(200).json({ collections })
      }

      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const offset = (page - 1) * limit
      const collection = req.query.collection as string | undefined

      let query = supabase
        .from('saved_reports')
        .select(`
          id,
          report_id,
          collection_name,
          created_at,
          report:reports!saved_reports_report_id_fkey(
            id, title, slug, summary, category, country, city, state_province,
            event_date, credibility, upvotes, view_count, comment_count,
            has_photo_video, has_physical_evidence, featured, location_name,
            source_type, source_label, created_at
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      // Filter by collection
      if (collection === '__uncategorized__') {
        query = query.is('collection_name', null)
      } else if (collection) {
        query = query.eq('collection_name', collection)
      }

      const { data, error } = await query
      if (error) throw error

      // Get total count
      let countQuery = supabase
        .from('saved_reports')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)

      if (collection === '__uncategorized__') {
        countQuery = countQuery.is('collection_name', null)
      } else if (collection) {
        countQuery = countQuery.eq('collection_name', collection)
      }

      const { count } = await countQuery

      return res.status(200).json({
        saved: data || [],
        total: count || 0,
        page,
        limit
      })
    } catch (error: any) {
      console.error('Error fetching saved reports:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  if (req.method === 'POST') {
    try {
      const { report_id, collection_name } = req.body

      if (!report_id) {
        return res.status(400).json({ error: 'report_id is required' })
      }

      // Check if already saved
      const { data: existing } = await supabase
        .from('saved_reports')
        .select('id')
        .eq('user_id', user.id)
        .eq('report_id', report_id)
        .maybeSingle()

      if (existing) {
        // If already saved, update collection if provided
        if (collection_name !== undefined) {
          await supabase
            .from('saved_reports')
            .update({ collection_name: collection_name || null })
            .eq('id', existing.id)
        }
        return res.status(200).json({ message: 'Already saved', id: existing.id })
      }

      const { data, error } = await supabase
        .from('saved_reports')
        .insert({
          user_id: user.id,
          report_id,
          collection_name: collection_name || null
        })
        .select('id')
        .single()

      if (error) throw error

      return res.status(201).json({ message: 'Saved', id: data.id })
    } catch (error: any) {
      console.error('Error saving report:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { report_id, collection_name } = req.body

      if (!report_id) {
        return res.status(400).json({ error: 'report_id is required' })
      }

      const { error } = await supabase
        .from('saved_reports')
        .update({ collection_name: collection_name || null })
        .eq('user_id', user.id)
        .eq('report_id', report_id)

      if (error) throw error

      return res.status(200).json({ message: 'Collection updated' })
    } catch (error: any) {
      console.error('Error updating collection:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { report_id } = req.body

      if (!report_id) {
        return res.status(400).json({ error: 'report_id is required' })
      }

      const { error } = await supabase
        .from('saved_reports')
        .delete()
        .eq('user_id', user.id)
        .eq('report_id', report_id)

      if (error) throw error

      return res.status(200).json({ message: 'Removed' })
    } catch (error: any) {
      console.error('Error removing saved report:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
