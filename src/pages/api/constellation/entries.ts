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

      // SYNC: Also create/update matching Research Hub artifact
      let artifactId: string | null = null
      try {
        // Get report details for artifact title
        const { data: report } = await supabase
          .from('reports')
          .select('title, slug, category')
          .eq('id', report_id)
          .single()

        const artifactData = {
          user_id: user.id,
          source_type: 'paradocs_report',
          report_id: report_id,
          title: report?.title || 'Logged Report',
          user_note: note || '',
          verdict: verdict || 'needs_info',
          tags: cleanTags,
          updated_at: new Date().toISOString(),
        }

        // Check if artifact already exists for this report
        const { data: existingArtifact } = await supabase
          .from('constellation_artifacts')
          .select('id')
          .eq('user_id', user.id)
          .eq('report_id', report_id)
          .maybeSingle()

        if (existingArtifact) {
          // Update existing artifact
          await supabase
            .from('constellation_artifacts')
            .update({
              user_note: artifactData.user_note,
              verdict: artifactData.verdict,
              tags: artifactData.tags,
              updated_at: artifactData.updated_at,
            })
            .eq('id', existingArtifact.id)
          artifactId = existingArtifact.id
        } else {
          // Create new artifact
          const { data: newArtifact } = await supabase
            .from('constellation_artifacts')
            .insert({
              ...artifactData,
              created_at: new Date().toISOString(),
            })
            .select('id')
            .single()
          if (newArtifact) artifactId = newArtifact.id
        }
      } catch (syncErr) {
        // Sync is non-critical — log but don't fail the request
        console.error('Constellation -> Research Hub sync error:', syncErr)
      }

      return res.status(200).json({ entry: data, artifactId, created: true })
    }

    // DELETE: Remove a constellation entry
    if (req.method === 'DELETE') {
      const { entry_id } = req.body

      if (!entry_id) {
        return res.status(400).json({ error: 'entry_id is required' })
      }

      // Get the entry's report_id before deleting so we can cascade to Research Hub
      const { data: entryToDelete } = await supabase
        .from('constellation_entries')
        .select('report_id')
        .eq('id', entry_id)
        .eq('user_id', user.id)
        .maybeSingle()

      const { error } = await supabase
        .from('constellation_entries')
        .delete()
        .eq('id', entry_id)
        .eq('user_id', user.id)

      if (error) throw error

      // CASCADE: Also delete matching Research Hub artifact
      if (entryToDelete?.report_id) {
        try {
          // Find and delete the artifact linked to this report
          const { data: artifact } = await supabase
            .from('constellation_artifacts')
            .select('id')
            .eq('user_id', user.id)
            .eq('report_id', entryToDelete.report_id)
            .maybeSingle()

          if (artifact) {
            // Delete junction table entries first
            await supabase
              .from('constellation_case_file_artifacts')
              .delete()
              .eq('artifact_id', artifact.id)

            await supabase
              .from('constellation_artifacts')
              .delete()
              .eq('id', artifact.id)
              .eq('user_id', user.id)
          }
        } catch (syncErr) {
          console.error('Constellation delete -> Research Hub cascade error:', syncErr)
        }
      }

      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('Constellation entries error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
