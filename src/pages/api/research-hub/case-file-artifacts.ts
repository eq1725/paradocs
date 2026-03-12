/**
 * POST /api/research-hub/case-file-artifacts
 * DELETE /api/research-hub/case-file-artifacts?case_file_id=uuid&artifact_id=uuid
 *
 * Handles the relationship between case files and artifacts
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const supabase = createServerClient()

  // Authenticate user
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  try {
    // POST: Add artifact to case file
    if (req.method === 'POST') {
      const { case_file_id, artifact_id } = req.body

      if (!case_file_id || !artifact_id) {
        return res.status(400).json({ error: 'case_file_id and artifact_id are required' })
      }

      try {
        // Verify case file belongs to user
        const { data: caseFile, error: caseFileError } = await supabase
          .from('constellation_case_files')
          .select('id')
          .eq('id', case_file_id)
          .eq('user_id', user.id)
          .maybeSingle()

        if (caseFileError && caseFileError.code !== '42P01') {
          throw caseFileError
        }

        if (!caseFile && caseFileError?.code !== '42P01') {
          return res.status(403).json({ error: 'Case file not found or access denied' })
        }

        // Verify artifact belongs to user
        const { data: artifact, error: artifactError } = await supabase
          .from('constellation_artifacts')
          .select('id')
          .eq('id', artifact_id)
          .eq('user_id', user.id)
          .maybeSingle()

        if (artifactError && artifactError.code !== '42P01') {
          throw artifactError
        }

        if (!artifact && artifactError?.code !== '42P01') {
          return res.status(403).json({ error: 'Artifact not found or access denied' })
        }

        // Get the max sort_order for this case file
        const { data: existingRelations } = await supabase
          .from('constellation_case_file_artifacts')
          .select('sort_order')
          .eq('case_file_id', case_file_id)
          .order('sort_order', { ascending: false })
          .limit(1)

        const sortOrder = (existingRelations?.[0]?.sort_order || 0) + 1

        const { data: relation, error } = await supabase
          .from('constellation_case_file_artifacts')
          .insert({
            case_file_id,
            artifact_id,
            added_at: new Date().toISOString(),
            sort_order: sortOrder
          })
          .select()
          .single()

        if (error) {
          if (error.code === '42P01') {
            return res.status(500).json({ error: 'constellation_case_file_artifacts table does not exist' })
          }
          throw error
        }

        return res.status(201).json({ relation, created: true })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(500).json({ error: 'constellation_case_file_artifacts table does not exist' })
        }
        throw error
      }
    }

    // DELETE: Remove artifact from case file
    if (req.method === 'DELETE') {
      const { case_file_id, artifact_id } = req.query

      if (!case_file_id || !artifact_id) {
        return res.status(400).json({ error: 'case_file_id and artifact_id query parameters are required' })
      }

      try {
        // Verify case file belongs to user
        const { data: caseFile } = await supabase
          .from('constellation_case_files')
          .select('id')
          .eq('id', case_file_id as string)
          .eq('user_id', user.id)
          .maybeSingle()

        if (!caseFile) {
          return res.status(403).json({ error: 'Case file not found or access denied' })
        }

        const { error } = await supabase
          .from('constellation_case_file_artifacts')
          .delete()
          .eq('case_file_id', case_file_id as string)
          .eq('artifact_id', artifact_id as string)

        if (error) {
          if (error.code === '42P01') {
            return res.status(500).json({ error: 'constellation_case_file_artifacts table does not exist' })
          }
          throw error
        }

        return res.status(200).json({ deleted: true })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(500).json({ error: 'constellation_case_file_artifacts table does not exist' })
        }
        throw error
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Case File Artifacts API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
