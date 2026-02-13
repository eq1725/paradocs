/**
 * Journal API
 *
 * GET    /api/user/journal          — list entries (with pagination, filtering, search)
 * GET    /api/user/journal?id=xxx   — get single entry
 * POST   /api/user/journal          — create entry
 * PUT    /api/user/journal          — update entry
 * DELETE /api/user/journal?id=xxx   — delete entry
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  const userId = session.user.id

  // ── GET: List or fetch single entry ──
  if (req.method === 'GET') {
    const { id, page = '1', limit = '10', entry_type, search, tag, category } = req.query

    // Single entry fetch
    if (id) {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()

      if (error || !data) {
        return res.status(404).json({ error: 'Entry not found' })
      }
      return res.status(200).json({ entry: data })
    }

    // List entries
    const pageNum = parseInt(page as string, 10) || 1
    const limitNum = Math.min(parseInt(limit as string, 10) || 10, 50)

    let query = supabase
      .from('journal_entries')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range((pageNum - 1) * limitNum, pageNum * limitNum - 1)

    if (entry_type && typeof entry_type === 'string') {
      query = query.eq('entry_type', entry_type)
    }

    if (search && typeof search === 'string') {
      query = query.or(
        `title.ilike.%${search}%,body.ilike.%${search}%,hypothesis.ilike.%${search}%,conclusions.ilike.%${search}%`
      )
    }

    if (tag && typeof tag === 'string') {
      query = query.contains('tags', [tag])
    }

    if (category && typeof category === 'string') {
      query = query.contains('linked_categories', [category])
    }

    const { data, count, error } = await query

    if (error) {
      console.error('Error listing journal entries:', error)
      return res.status(500).json({ error: 'Failed to list entries' })
    }

    return res.status(200).json({
      entries: data || [],
      total: count || 0,
      page: pageNum,
      limit: limitNum,
    })
  }

  // ── POST: Create entry ──
  if (req.method === 'POST') {
    const {
      title, entry_type, body, hypothesis, evidence_notes, conclusions,
      linked_report_ids, linked_categories, tags, is_private,
    } = req.body

    if (!title || !entry_type) {
      return res.status(400).json({ error: 'title and entry_type are required' })
    }

    const validTypes = ['observation', 'hypothesis', 'evidence_review', 'field_note', 'connection', 'freeform']
    if (!validTypes.includes(entry_type)) {
      return res.status(400).json({ error: `Invalid entry_type. Must be one of: ${validTypes.join(', ')}` })
    }

    const { data, error } = await supabase
      .from('journal_entries')
      .insert({
        user_id: userId,
        title,
        entry_type,
        body: body || '',
        hypothesis: hypothesis || null,
        evidence_notes: evidence_notes || null,
        conclusions: conclusions || null,
        linked_report_ids: linked_report_ids || [],
        linked_categories: linked_categories || [],
        tags: tags || [],
        is_private: is_private !== false,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating journal entry:', error)
      return res.status(500).json({ error: 'Failed to create entry' })
    }

    // Log activity for streak
    try {
      await supabase.rpc('log_activity_and_update_streak', {
        p_user_id: userId,
        p_activity_type: 'journal_entry',
        p_metadata: { entry_id: data.id, entry_type },
      })
    } catch {
      // Non-critical
    }

    return res.status(201).json({ entry: data })
  }

  // ── PUT: Update entry ──
  if (req.method === 'PUT') {
    const { id, ...updates } = req.body

    if (!id) {
      return res.status(400).json({ error: 'id is required' })
    }

    const { data, error } = await supabase
      .from('journal_entries')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating journal entry:', error)
      return res.status(500).json({ error: 'Failed to update entry' })
    }

    return res.status(200).json({ entry: data })
  }

  // ── DELETE: Delete entry ──
  if (req.method === 'DELETE') {
    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'id query parameter is required' })
    }

    const { error } = await supabase
      .from('journal_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting journal entry:', error)
      return res.status(500).json({ error: 'Failed to delete entry' })
    }

    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
