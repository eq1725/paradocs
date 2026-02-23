import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function getUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return null
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return { user, supabase }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUser(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })
  const { user, supabase } = auth

  try {
    // GET: Fetch user's theories
    if (req.method === 'GET') {
      const { theory_id } = req.query

      if (theory_id) {
        const { data, error } = await supabase
          .from('constellation_theories')
          .select('*')
          .eq('id', theory_id)
          .eq('user_id', user.id)
          .single()

        if (error) throw error
        return res.status(200).json({ theory: data })
      }

      const { data, error } = await supabase
        .from('constellation_theories')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

      if (error) {
        if (error.code === '42P01') return res.status(200).json({ theories: [] })
        throw error
      }

      return res.status(200).json({ theories: data || [] })
    }

    // POST: Create a theory
    if (req.method === 'POST') {
      const { title, thesis, entry_ids, connection_ids, is_public } = req.body

      if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' })
      }

      // Validate entry_ids belong to user
      if (entry_ids && entry_ids.length > 0) {
        const { data: entries } = await supabase
          .from('constellation_entries')
          .select('id')
          .eq('user_id', user.id)
          .in('id', entry_ids)

        if (!entries || entries.length !== entry_ids.length) {
          return res.status(400).json({ error: 'Some entries not found or unauthorized' })
        }
      }

      // Validate connection_ids belong to user
      if (connection_ids && connection_ids.length > 0) {
        const { data: connw } = await supabase
          .from('constellation_connections')
          .select('id')
          .eq('user_id', user.id)
          .in('id', connection_ids)

        if (!conns || conns.length !== connection_ids.length) {
          return res.status(400).json({ error: 'Some connections not found or unauthorized' })
        }
      }

      const { data, error } = await supabase
        .from('constellation_theories')
        .insert({
          user_id: user.id,
          title: title.trim(),
          thesis: thesis || '',
          entry_ids: entry_ids || [],
          connection_ids: connection_ids || [],
          is_public: is_public || false,
        })
        .select()
        .single()

      if (error) throw error
      return res.status(200).json({ theory: data, created: true })
    }

    // PUT: Update a theory
    if (req.method === 'PUT') {
      const { theory_id, title, thesis, entry_ids, connection_ids, is_public } = req.body

      if (!theory_id) {
        return res.status(400).json({ error: 'theory_id is required' })
      }

      const updates: any = { updated_at: new Date().toISOString() }
      if (title !== undefined) updates.title = title.trim()
      if (thesis !== undefined) updates.thesis = thesis
      if (entry_ids !== undefined) updates.entry_ids = entry_ids
      if (connection_ids !== undefined) updates.connection_ids = connection_ids
      if (is_public !== undefined) updates.is_public = is_public

      const { data, error } = await supabase
        .from('constellation_theories')
        .update(updates)
        .eq('id', theory_id)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) throw error
      return res.status(200).json({ theory: data })
    }

    // DELETE: Remove a theory
    if (req.method === 'DELETE') {
      const { theory_id } = req.body

      if (!theory_id) {
        return res.status(400).json({ error: 'theory_id is required' })
      }

      const { error } = await supabase
        .from('constellation_theories')
        .delete()
        .eq('id', theory_id)
        .eq('user_id', user.id)

      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('Constellation theories error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
