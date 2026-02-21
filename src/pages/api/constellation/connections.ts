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
    // GET: Fetch user's connections
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('constellation_connections')
        .select(`
          *,
          entry_a:constellation_entries!constellation_connections_entry_a_id_fkey(
            id, report_id, note, verdict, tags,
            report:reports(id, title, slug, category)
          ),
          entry_b:constellation_entries!constellation_connections_entry_b_id_fkey(
            id, report_id, note, verdict, tags,
            report:reports(id, title, slug, category)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        if (error.code === '42P01') return res.status(200).json({ connections: [] })
        throw error
      }

      return res.status(200).json({ connections: data || [] })
    }

    // POST: Create a connection between two entries
    if (req.method === 'POST') {
      const { entry_a_id, entry_b_id, annotation } = req.body

      if (!entry_a_id || !entry_b_id) {
        return res.status(400).json({ error: 'entry_a_id and entry_b_id are required' })
      }

      if (entry_a_id === entry_b_id) {
        return res.status(400).json({ error: 'Cannot connect an entry to itself' })
      }

      // Verify both entries belong to user
      const { data: entries, error: entryErr } = await supabase
        .from('constellation_entries')
        .select('id')
        .eq('user_id', user.id)
        .in('id', [entry_a_id, entry_b_id])

      if (entryErr) throw entryErr
      if (!entries || entries.length !== 2) {
        return res.status(400).json({ error: 'One or both entries not found' })
      }

      // Normalize order (smaller UUID first) to prevent duplicates
      const [a, b] = [entry_a_id, entry_b_id].sort()

      // Check for existing connection
      const { data: existing } = await supabase
        .from('constellation_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('entry_a_id', a)
        .eq('entry_b_id', b)
        .maybeSingle()

      if (existing) {
        // Update existing connection
        const { data, error } = await supabase
          .from('constellation_connections')
          .update({ annotation: annotation || '', updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single()

        if (error) throw error
        return res.status(200).json({ connection: data, updated: true })
      }

      const { data, error } = await supabase
        .from('constellation_connections')
        .insert({
          user_id: user.id,
          entry_a_id: a,
          entry_b_id: b,
          annotation: annotation || '',
        })
        .select()
        .single()

      if (error) throw error
      return res.status(200).json({ connection: data, created: true })
    }

    // PUT: Update a connection annotation
    if (req.method === 'PUT') {
      const { connection_id, annotation } = req.body

      if (!connection_id) {
        return res.status(400).json({ error: 'connection_id is required' })
      }

      const { data, error } = await supabase
        .from('constellation_connections')
        .update({ annotation: annotation || '', updated_at: new Date().toISOString() })
        .eq('id', connection_id)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) throw error
      return res.status(200).json({ connection: data })
    }

    // DELETE: Remove a connection
    if (req.method === 'DELETE') {
      const { connection_id } = req.body

      if (!connection_id) {
        return res.status(400).json({ error: 'connection_id is required' })
      }

      const { error } = await supabase
        .from('constellation_connections')
        .delete()
        .eq('id', connection_id)
        .eq('user_id', user.id)

      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('Constellation connections error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
