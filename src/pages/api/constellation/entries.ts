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
    // GET: Fetch user's constellation entries
    if (req.method === 'GET') {
      const { report_id } = req.query

      // If report_id is provided, get single entry for that report
      if (report_id) {
        const { data, error } = await supabase
          .from('constellation_entries')
          .select('*')
          .eq('user_id', user.id)
          .eq('report_id', report_id)
          .maybeSingle()

        if (error && error.code !== '42P01') throw error
        return res.status(200).json({ entry: data || null })
      }

      // Otherwise, get all entries with report details
      const { data, error } = await supabase
        .from('constellation_entries')
        .select(`
          *,
          report:reports(id, title, slug, category, location_name, event_date, summary)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        if (error.code === '42P01') return res.status(200).json({ entries: [] })
        throw error
      }

      return res.status(200).json({ entries: data || [] })
    }

    // POST: Create or update a constellation entry
    if (req.method === 'POST') {
      const { report_id, note, verdict, tags } = req.body

      if (!report_id) {
        return res.status(400).json({ error: 'report_id is required' })
      }

      const validVerdicts = ['compelling', 'inconclusive', 'skeptical', 'needs_info']
      if (verdict && !validVerdicts.includes(verdict)) {
        return res.status(400).json({ error: 'Invalid verdict' })
      }

      // Clean tags: lowercase, trim, dedupe, strip leading #
      const cleanTags = (tags || [])
        .map((t: string) => t.trim().toLowerCase().replace(/^#/, ''))
        .filter((t: string) => t.length > 0)
        .filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i)

      // Upsert: create or update
      const { data, error } = await supabase
        .from('constellation_entries')
        .upsert({
          user_id: user.id,
          report_id,
          note: note || '',
          verdict: verdict || 'needs_info',
          tags: cleanTags,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,report_id' })
        .select()
        .single()

      if (error) throw error

      return res.status(200).json({ entry: data, created: true })
    }

    // DELETE: Remove a constellation entry
    if (req.method === 'DELETE') {
      const { entry_id } = req.body

      if (!entry_id) {
        return res.status(400).json({ error: 'entry_id is required' })
      }

      const { error } = await supabase
        .from('constellation_entries')
        .delete()
        .eq('id', entry_id)
        .eq('user_id', user.id)

      if (error) throw error

      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('Constellation entries error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
