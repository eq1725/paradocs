/**
 * POST   /api/constellation/case-files/:id/artifacts        — add artifact(s)
 * DELETE /api/constellation/case-files/:id/artifacts?aid=X  — remove one artifact
 *
 * Ownership: the endpoint verifies both the case file AND the artifact belong
 * to the authenticated user before performing the action. (RLS on the
 * junction table would do this too, but we verify at the API boundary so
 * errors surface as clean 403s rather than opaque RLS denials.)
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const caseFileId = req.query.id as string
  if (!caseFileId) return res.status(400).json({ error: 'case file id required' })

  // Verify the case file belongs to the caller before any mutation.
  const { data: owned } = await supabase
    .from('constellation_case_files')
    .select('id')
    .eq('id', caseFileId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!owned) return res.status(404).json({ error: 'Case file not found' })

  if (req.method === 'POST') {
    const { artifact_id, artifact_ids } = (req.body || {}) as {
      artifact_id?: string; artifact_ids?: string[]
    }
    // Accept either a single id or a batch.
    const ids: string[] = artifact_id ? [artifact_id] : (Array.isArray(artifact_ids) ? artifact_ids : [])
    if (ids.length === 0) return res.status(400).json({ error: 'artifact_id required' })

    // Verify ownership of every artifact (don't let a user stuff someone
    // else's artifact into their case file).
    const { data: myArtifacts } = await supabase
      .from('constellation_artifacts')
      .select('id')
      .in('id', ids)
      .eq('user_id', user.id)
    const myArtifactIds = new Set((myArtifacts || []).map(a => a.id))
    const validIds = ids.filter(id => myArtifactIds.has(id))
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid artifacts to add' })
    }

    const rows = validIds.map(id => ({
      case_file_id: caseFileId,
      artifact_id: id,
    }))

    // Upsert on the composite primary key (case_file_id, artifact_id) so
    // re-adding an existing link is a no-op rather than an error.
    const { error } = await supabase
      .from('constellation_case_file_artifacts')
      .upsert(rows, { onConflict: 'case_file_id,artifact_id' })

    if (error) {
      console.error('[case-files:add-artifact]', error)
      return res.status(400).json({ error: error.message })
    }

    return res.status(200).json({ added: validIds.length })
  }

  if (req.method === 'DELETE') {
    const artifactId = (req.query.aid as string) || (req.body?.artifact_id as string)
    if (!artifactId) return res.status(400).json({ error: 'aid query param required' })

    const { error } = await supabase
      .from('constellation_case_file_artifacts')
      .delete()
      .eq('case_file_id', caseFileId)
      .eq('artifact_id', artifactId)

    if (error) {
      console.error('[case-files:remove-artifact]', error)
      return res.status(400).json({ error: error.message })
    }

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
