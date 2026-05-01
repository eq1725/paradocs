/**
 * /api/user/saved-phenomena
 *
 * Mirror of /api/user/saved.ts but for phenomena (encyclopedia entries).
 * Backs the /discover (Today) save flow when the user right-swipes a
 * PhenomenonCard. See supabase/migrations/20260501_saved_phenomena.sql.
 *
 * GET    — list user's saved phenomena (with full phenomena join), paginated
 *          ?collections_only=true  → return distinct collection names
 *          ?collection=__uncategorized__ → null collection only
 *          ?collection=<name>      → filter to that collection
 * POST   — save a phenomenon (idempotent). Body: { phenomenon_id, collection_name? }
 * DELETE — remove a saved phenomenon. Body: { phenomenon_id }
 * PATCH  — move a saved phenomenon to a different collection.
 *          Body: { phenomenon_id, collection_name }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const supabase = createServerClient()

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
      if (req.query.collections_only === 'true') {
        const { data, error } = await (supabase.from('saved_phenomena' as any) as any)
          .select('collection_name')
          .eq('user_id', user.id)
          .not('collection_name', 'is', null)
          .order('collection_name')
        if (error) throw error
        const collections = Array.from(
          new Set((data || []).map((d: any) => d.collection_name).filter(Boolean))
        )
        return res.status(200).json({ collections })
      }

      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const offset = (page - 1) * limit
      const collection = req.query.collection as string | undefined

      let query: any = (supabase.from('saved_phenomena' as any) as any)
        .select(`
          id,
          phenomenon_id,
          collection_name,
          created_at,
          phenomenon:phenomena!saved_phenomena_phenomenon_id_fkey(
            id, name, slug, category, ai_summary, ai_description,
            ai_quick_facts, primary_image_url, report_count,
            primary_regions, first_reported_date, aliases, feed_hook
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (collection === '__uncategorized__') {
        query = query.is('collection_name', null)
      } else if (collection) {
        query = query.eq('collection_name', collection)
      }

      const { data, error } = await query
      if (error) throw error

      let countQuery: any = (supabase.from('saved_phenomena' as any) as any)
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
        limit,
      })
    } catch (error: any) {
      console.error('Error fetching saved phenomena:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  if (req.method === 'POST') {
    try {
      const { phenomenon_id, collection_name } = req.body

      if (!phenomenon_id) {
        return res.status(400).json({ error: 'phenomenon_id is required' })
      }

      // The `saved_phenomena` table was added in migration 20260501. Until
      // database.types.ts is regenerated, the supabase client doesn't know
      // about it — we use `as any` casts on the chain to silence false
      // positive type errors. Runtime is correct.
      const sp = supabase.from('saved_phenomena' as any) as any

      const { data: existing } = await sp
        .select('id')
        .eq('user_id', user.id)
        .eq('phenomenon_id', phenomenon_id)
        .maybeSingle()

      if (existing) {
        if (collection_name !== undefined) {
          await (supabase.from('saved_phenomena' as any) as any)
            .update({ collection_name: collection_name || null })
            .eq('id', existing.id)
        }
        return res.status(200).json({ message: 'Already saved', id: existing.id })
      }

      const { data, error } = await (supabase.from('saved_phenomena' as any) as any)
        .insert({
          user_id: user.id,
          phenomenon_id,
          collection_name: collection_name || null,
        })
        .select('id')
        .single()
      if (error) throw error

      return res.status(201).json({ message: 'Saved', id: (data as any).id })
    } catch (error: any) {
      console.error('Error saving phenomenon:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { phenomenon_id, collection_name } = req.body
      if (!phenomenon_id) {
        return res.status(400).json({ error: 'phenomenon_id is required' })
      }
      const { error } = await (supabase.from('saved_phenomena' as any) as any)
        .update({ collection_name: collection_name || null })
        .eq('user_id', user.id)
        .eq('phenomenon_id', phenomenon_id)
      if (error) throw error
      return res.status(200).json({ message: 'Collection updated' })
    } catch (error: any) {
      console.error('Error updating phenomenon collection:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { phenomenon_id } = req.body
      if (!phenomenon_id) {
        return res.status(400).json({ error: 'phenomenon_id is required' })
      }
      const { error } = await (supabase.from('saved_phenomena' as any) as any)
        .delete()
        .eq('user_id', user.id)
        .eq('phenomenon_id', phenomenon_id)
      if (error) throw error
      return res.status(200).json({ message: 'Removed' })
    } catch (error: any) {
      console.error('Error removing saved phenomenon:', error)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
