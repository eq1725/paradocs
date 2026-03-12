/**
 * GET /api/research-hub/artifacts
 * POST /api/research-hub/artifacts
 * DELETE /api/research-hub/artifacts?id=uuid
 *
 * Handles artifact management for the Research Hub
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import { createHash } from 'crypto'

function normalizeUrl(rawUrl: string): string {
  try {
    var parsed = new URL(rawUrl)
    var stripParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', 'si']
    stripParams.forEach(function(p) { parsed.searchParams.delete(p) })
    parsed.hostname = parsed.hostname.toLowerCase()
    var normalized = parsed.toString()
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1)
    return normalized
  } catch {
    return rawUrl.trim().toLowerCase()
  }
}

function hashUrl(url: string): string {
  return createHash('sha256').update(normalizeUrl(url)).digest('hex')
}

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
    // GET: List artifacts with pagination and filtering
    if (req.method === 'GET') {
      const {
        case_file_id,
        source_type,
        verdict,
        tag,
        sort_by = 'created_at',
        page = '1',
        per_page = '50'
      } = req.query

      const pageNum = parseInt(page as string, 10)
      const perPageNum = Math.min(parseInt(per_page as string, 10), 100)
      const offset = (pageNum - 1) * perPageNum

      // Validate sort_by
      const validSortFields = ['created_at', 'extracted_date', 'title']
      const sortField = validSortFields.includes(sort_by as string) ? (sort_by as string) : 'created_at'

      try {
        let query = supabase
          .from('constellation_artifacts')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)

        // Filter by case_file_id via junction table if provided
        if (case_file_id) {
          const { data: caseFileArtifacts, error: junctionError } = await supabase
            .from('constellation_case_file_artifacts')
            .select('artifact_id')
            .eq('case_file_id', case_file_id as string)

          if (junctionError && junctionError.code !== '42P01') {
            throw junctionError
          }

          const artifactIds = caseFileArtifacts?.map((row: any) => row.artifact_id) || []
          if (artifactIds.length === 0) {
            return res.status(200).json({
              artifacts: [],
              total: 0,
              page: pageNum,
              per_page: perPageNum
            })
          }

          query = query.in('id', artifactIds)
        }

        // Apply filters
        if (source_type) {
          query = query.eq('source_type', source_type)
        }

        if (verdict) {
          query = query.eq('verdict', verdict)
        }

        if (tag) {
          query = query.contains('tags', [tag])
        }

        // Apply sorting
        query = query.order(sortField, { ascending: false })

        // Apply pagination
        query = query.range(offset, offset + perPageNum - 1)

        const { data: artifacts, error, count } = await query

        if (error) {
          if (error.code === '42P01') {
            return res.status(200).json({
              artifacts: [],
              total: 0,
              page: pageNum,
              per_page: perPageNum
            })
          }
          throw error
        }

        return res.status(200).json({
          artifacts: artifacts || [],
          total: count || 0,
          page: pageNum,
          per_page: perPageNum
        })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(200).json({
            artifacts: [],
            total: 0,
            page: pageNum,
            per_page: perPageNum
          })
        }
        throw error
      }
    }

    // POST: Create artifact from report or URL
    if (req.method === 'POST') {
      const {
        source_type,
        report_id,
        external_url,
        title,
        thumbnail_url,
        source_platform,
        extracted_date,
        extracted_location,
        user_note,
        verdict,
        tags,
        metadata_json,
        case_file_id
      } = req.body

      // Validate required fields
      if (!source_type || !title) {
        return res.status(400).json({ error: 'source_type and title are required' })
      }

      try {
        const artifactId = crypto.randomUUID()
        const now = new Date().toISOString()

        // Compute URL hash for dedup if external URL provided
        var urlHash: string | null = null
        if (external_url) {
          urlHash = hashUrl(external_url)
        }

        const { data: artifact, error } = await supabase
          .from('constellation_artifacts')
          .insert({
            id: artifactId,
            user_id: user.id,
            source_type,
            report_id: report_id || null,
            external_url: external_url || null,
            external_url_hash: urlHash,
            title,
            thumbnail_url: thumbnail_url || null,
            source_platform: source_platform || null,
            extracted_date: extracted_date || null,
            extracted_location: extracted_location || null,
            user_note: user_note || null,
            verdict: verdict || null,
            tags: tags || [],
            metadata_json: metadata_json || {},
            created_at: now,
            updated_at: now
          })
          .select()
          .single()

        if (error) {
          if (error.code === '42P01') {
            return res.status(500).json({ error: 'constellation_artifacts table does not exist' })
          }
          throw error
        }

        // Track external URL in flywheel signals table
        if (external_url && urlHash && artifact) {
          try {
            // Try to upsert — increment save_count if exists, insert if new
            await supabase.rpc('upsert_external_url_signal', {
              p_url_hash: urlHash,
              p_canonical_url: normalizeUrl(external_url),
              p_source_type: source_type,
              p_title: title,
              p_thumbnail_url: thumbnail_url || null,
            })
          } catch {
            // Flywheel tracking is non-critical — ignore errors
            // The RPC function may not exist yet; that's OK
          }
        }

        // If case_file_id provided, add artifact to that case file
        if (case_file_id && artifact) {
          const { error: junctionError } = await supabase
            .from('constellation_case_file_artifacts')
            .insert({
              case_file_id,
              artifact_id: artifact.id,
              added_at: now,
              sort_order: 0
            })

          if (junctionError && junctionError.code !== '42P01') {
            throw junctionError
          }
        }

        return res.status(201).json({ artifact, created: true })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(500).json({ error: 'constellation_artifacts table does not exist' })
        }
        throw error
      }
    }

    // DELETE: Remove artifact by id
    if (req.method === 'DELETE') {
      const { id } = req.query

      if (!id) {
        return res.status(400).json({ error: 'id query parameter is required' })
      }

      try {
        // Delete from junction table first (if it exists)
        await supabase
          .from('constellation_case_file_artifacts')
          .delete()
          .eq('artifact_id', id as string)

        const { error } = await supabase
          .from('constellation_artifacts')
          .delete()
          .eq('id', id as string)
          .eq('user_id', user.id)

        if (error) {
          if (error.code === '42P01') {
            return res.status(500).json({ error: 'constellation_artifacts table does not exist' })
          }
          throw error
        }

        return res.status(200).json({ deleted: true })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(500).json({ error: 'constellation_artifacts table does not exist' })
        }
        throw error
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Artifacts API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
