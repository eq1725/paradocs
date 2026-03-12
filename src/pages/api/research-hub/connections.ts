/**
 * GET /api/research-hub/connections
 * POST /api/research-hub/connections
 * PUT /api/research-hub/connections
 * DELETE /api/research-hub/connections?id=uuid
 *
 * Handles connections between artifacts
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
    // GET: List user's connections with artifact info
    if (req.method === 'GET') {
      try {
        const { data: connections, error } = await supabase
          .from('constellation_connections')
          .select(`
            *,
            artifact_a:artifact_a_id(id, title, source_type),
            artifact_b:artifact_b_id(id, title, source_type)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (error) {
          if (error.code === '42P01') {
            return res.status(200).json({ connections: [] })
          }
          throw error
        }

        return res.status(200).json({ connections: connections || [] })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(200).json({ connections: [] })
        }
        throw error
      }
    }

    // POST: Create connection between artifacts
    if (req.method === 'POST') {
      const {
        artifact_a_id,
        artifact_b_id,
        relationship_type,
        annotation,
        strength = 1
      } = req.body

      if (!artifact_a_id || !artifact_b_id || !relationship_type) {
        return res.status(400).json({
          error: 'artifact_a_id, artifact_b_id, and relationship_type are required'
        })
      }

      if (artifact_a_id === artifact_b_id) {
        return res.status(400).json({ error: 'Cannot create connection from artifact to itself' })
      }

      try {
        // Verify both artifacts belong to user
        const { data: artifactA } = await supabase
          .from('constellation_artifacts')
          .select('id')
          .eq('id', artifact_a_id)
          .eq('user_id', user.id)
          .maybeSingle()

        const { data: artifactB } = await supabase
          .from('constellation_artifacts')
          .select('id')
          .eq('id', artifact_b_id)
          .eq('user_id', user.id)
          .maybeSingle()

        if (!artifactA || !artifactB) {
          return res.status(403).json({ error: 'One or both artifacts not found or access denied' })
        }

        const connectionId = crypto.randomUUID()
        const now = new Date().toISOString()

        const { data: connection, error } = await supabase
          .from('constellation_connections')
          .insert({
            id: connectionId,
            user_id: user.id,
            artifact_a_id,
            artifact_b_id,
            relationship_type,
            annotation: annotation || null,
            ai_suggested: false,
            ai_confidence: null,
            strength: strength || 1,
            created_at: now
          })
          .select(`
            *,
            artifact_a:artifact_a_id(id, title, source_type),
            artifact_b:artifact_b_id(id, title, source_type)
          `)
          .single()

        if (error) {
          if (error.code === '42P01') {
            return res.status(500).json({ error: 'constellation_connections table does not exist' })
          }
          throw error
        }

        return res.status(201).json({ connection, created: true })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(500).json({ error: 'constellation_connections table does not exist' })
        }
        throw error
      }
    }

    // PUT: Update connection
    if (req.method === 'PUT') {
      const {
        id,
        relationship_type,
        annotation,
        strength
      } = req.body

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      try {
        const updateData: Record<string, any> = {}

        if (relationship_type !== undefined) updateData.relationship_type = relationship_type
        if (annotation !== undefined) updateData.annotation = annotation
        if (strength !== undefined) updateData.strength = strength

        const { data: connection, error } = await supabase
          .from('constellation_connections')
          .update(updateData)
          .eq('id', id)
          .eq('user_id', user.id)
          .select(`
            *,
            artifact_a:artifact_a_id(id, title, source_type),
            artifact_b:artifact_b_id(id, title, source_type)
          `)
          .single()

        if (error) {
          if (error.code === '42P01') {
            return res.status(500).json({ error: 'constellation_connections table does not exist' })
          }
          throw error
        }

        if (!connection) {
          return res.status(404).json({ error: 'Connection not found' })
        }

        return res.status(200).json({ connection })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(500).json({ error: 'constellation_connections table does not exist' })
        }
        throw error
      }
    }

    // DELETE: Remove connection
    if (req.method === 'DELETE') {
      const { id } = req.query

      if (!id) {
        return res.status(400).json({ error: 'id query parameter is required' })
      }

      try {
        const { error } = await supabase
          .from('constellation_connections')
          .delete()
          .eq('id', id as string)
          .eq('user_id', user.id)

        if (error) {
          if (error.code === '42P01') {
            return res.status(500).json({ error: 'constellation_connections table does not exist' })
          }
          throw error
        }

        return res.status(200).json({ deleted: true })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(500).json({ error: 'constellation_connections table does not exist' })
        }
        throw error
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Connections API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
