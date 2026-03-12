/**
 * GET /api/research-hub/case-files
 * POST /api/research-hub/case-files
 * PUT /api/research-hub/case-files
 * DELETE /api/research-hub/case-files?id=uuid
 *
 * Handles case file management for the Research Hub
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
    // GET: List user's case files with artifact counts
    if (req.method === 'GET') {
      try {
        const { data: caseFiles, error } = await supabase
          .from('constellation_case_files')
          .select('*')
          .eq('user_id', user.id)
          .order('sort_order', { ascending: true })

        if (error) {
          if (error.code === '42P01') {
            return res.status(200).json({ caseFiles: [] })
          }
          throw error
        }

        // Get artifact counts for each case file
        const caseFilesWithCounts = await Promise.all(
          (caseFiles || []).map(async (caseFile) => {
            const { count, error: countError } = await supabase
              .from('constellation_case_file_artifacts')
              .select('*', { count: 'exact', head: true })
              .eq('case_file_id', caseFile.id)

            if (countError && countError.code !== '42P01') {
              throw countError
            }

            return {
              ...caseFile,
              artifact_count: count || 0
            }
          })
        )

        return res.status(200).json({ caseFiles: caseFilesWithCounts })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(200).json({ caseFiles: [] })
        }
        throw error
      }
    }

    // POST: Create new case file
    if (req.method === 'POST') {
      const {
        title,
        description,
        cover_color = '#3B82F6',
        icon = 'folder',
        visibility = 'private'
      } = req.body

      if (!title) {
        return res.status(400).json({ error: 'title is required' })
      }

      try {
        const caseFileId = crypto.randomUUID()
        const now = new Date().toISOString()

        // Get the max sort_order for this user
        const { data: existingFiles } = await supabase
          .from('constellation_case_files')
          .select('sort_order')
          .eq('user_id', user.id)
          .order('sort_order', { ascending: false })
          .limit(1)

        const sortOrder = (existingFiles?.[0]?.sort_order || 0) + 1

        const { data: caseFile, error } = await supabase
          .from('constellation_case_files')
          .insert({
            id: caseFileId,
            user_id: user.id,
            title,
            description: description || null,
            cover_color,
            icon,
            visibility,
            sort_order: sortOrder,
            created_at: now,
            updated_at: now
          })
          .select()
          .single()

        if (error) {
          if (error.code === '42P01') {
            return res.status(500).json({ error: 'constellation_case_files table does not exist' })
          }
          throw error
        }

        return res.status(201).json({
          caseFile: {
            ...caseFile,
            artifact_count: 0
          },
          created: true
        })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(500).json({ error: 'constellation_case_files table does not exist' })
        }
        throw error
      }
    }

    // PUT: Update case file
    if (req.method === 'PUT') {
      const {
        id,
        title,
        description,
        cover_color,
        icon,
        visibility,
        sort_order
      } = req.body

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      try {
        const updateData: Record<string, any> = {
          updated_at: new Date().toISOString()
        }

        if (title !== undefined) updateData.title = title
        if (description !== undefined) updateData.description = description
        if (cover_color !== undefined) updateData.cover_color = cover_color
        if (icon !== undefined) updateData.icon = icon
        if (visibility !== undefined) updateData.visibility = visibility
        if (sort_order !== undefined) updateData.sort_order = sort_order

        const { data: caseFile, error } = await supabase
          .from('constellation_case_files')
          .update(updateData)
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single()

        if (error) {
          if (error.code === '42P01') {
            return res.status(500).json({ error: 'constellation_case_files table does not exist' })
          }
          throw error
        }

        if (!caseFile) {
          return res.status(404).json({ error: 'Case file not found' })
        }

        // Get artifact count
        const { count } = await supabase
          .from('constellation_case_file_artifacts')
          .select('*', { count: 'exact', head: true })
          .eq('case_file_id', id)

        return res.status(200).json({
          caseFile: {
            ...caseFile,
            artifact_count: count || 0
          }
        })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(500).json({ error: 'constellation_case_files table does not exist' })
        }
        throw error
      }
    }

    // DELETE: Delete case file (keep artifacts)
    if (req.method === 'DELETE') {
      const { id } = req.query

      if (!id) {
        return res.status(400).json({ error: 'id query parameter is required' })
      }

      try {
        // Remove the case file (artifacts remain unorganized)
        const { error } = await supabase
          .from('constellation_case_files')
          .delete()
          .eq('id', id as string)
          .eq('user_id', user.id)

        if (error) {
          if (error.code === '42P01') {
            return res.status(500).json({ error: 'constellation_case_files table does not exist' })
          }
          throw error
        }

        // Clean up junction table entries (optional, but helps with cleanup)
        await supabase
          .from('constellation_case_file_artifacts')
          .delete()
          .eq('case_file_id', id as string)

        return res.status(200).json({ deleted: true })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(500).json({ error: 'constellation_case_files table does not exist' })
        }
        throw error
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Case Files API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
