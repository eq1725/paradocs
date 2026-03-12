/**
 * GET    /api/research-hub/theories         — List user's theories
 * POST   /api/research-hub/theories         — Create theory
 * PUT    /api/research-hub/theories?id=uuid — Update theory
 * DELETE /api/research-hub/theories?id=uuid — Delete theory
 * POST   /api/research-hub/theories?id=uuid&action=publish — Publish theory
 * POST   /api/research-hub/theories?id=uuid&action=unpublish — Unpublish theory
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  var supabase = createServerClient()

  var token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  var authResult = await supabase.auth.getUser(token)
  if (authResult.error || !authResult.data.user) {
    return res.status(401).json({ error: 'Invalid token' })
  }
  var user = authResult.data.user

  try {
    // GET: List theories
    if (req.method === 'GET') {
      var includePublic = req.query.public === 'true'

      try {
        var query = supabase
          .from('constellation_theories')
          .select('*')

        if (includePublic) {
          // Show user's own + all public theories
          query = query.or('user_id.eq.' + user.id + ',is_public.eq.true')
        } else {
          query = query.eq('user_id', user.id)
        }

        var listResult = await query.order('created_at', { ascending: false })

        if (listResult.error) {
          if (listResult.error.code === '42P01') {
            return res.status(200).json({ theories: [] })
          }
          throw listResult.error
        }

        return res.status(200).json({ theories: listResult.data || [] })
      } catch (error: any) {
        if (error.code === '42P01') {
          return res.status(200).json({ theories: [] })
        }
        throw error
      }
    }

    // POST: Create theory OR publish/unpublish
    if (req.method === 'POST') {
      var action = req.query.action as string | undefined
      var theoryId = req.query.id as string | undefined

      // Publish/unpublish action
      if (action && theoryId) {
        var now = new Date().toISOString()
        var updateData: Record<string, any> = {}

        if (action === 'publish') {
          updateData.is_public = true
          updateData.published_at = now
        } else if (action === 'unpublish') {
          updateData.is_public = false
          updateData.published_at = null
        } else {
          return res.status(400).json({ error: 'Invalid action. Use "publish" or "unpublish".' })
        }

        updateData.updated_at = now

        var publishResult = await (supabase
          .from('constellation_theories') as any)
          .update(updateData)
          .eq('id', theoryId)
          .eq('user_id', user.id)
          .select()
          .single()

        if (publishResult.error) {
          if (publishResult.error.code === '42P01') {
            return res.status(500).json({ error: 'Table does not exist' })
          }
          throw publishResult.error
        }

        return res.status(200).json({ theory: publishResult.data })
      }

      // Create new theory
      var createBody = req.body
      if (!createBody.title || !createBody.thesis) {
        return res.status(400).json({ error: 'title and thesis are required' })
      }

      var createNow = new Date().toISOString()

      var createResult = await (supabase
        .from('constellation_theories') as any)
        .insert({
          user_id: user.id,
          title: createBody.title,
          thesis: createBody.thesis,
          artifact_ids: createBody.artifact_ids || [],
          connection_ids: createBody.connection_ids || [],
          case_file_id: createBody.case_file_id || null,
          is_public: false,
          created_at: createNow,
          updated_at: createNow,
        })
        .select()
        .single()

      if (createResult.error) {
        if (createResult.error.code === '42P01') {
          return res.status(500).json({ error: 'Table does not exist' })
        }
        throw createResult.error
      }

      return res.status(201).json({ theory: createResult.data, created: true })
    }

    // PUT: Update theory
    if (req.method === 'PUT') {
      var updateId = req.query.id as string
      if (!updateId) {
        return res.status(400).json({ error: 'id query parameter required' })
      }

      var updateBody = req.body
      var updateFields: Record<string, any> = { updated_at: new Date().toISOString() }

      if (updateBody.title !== undefined) updateFields.title = updateBody.title
      if (updateBody.thesis !== undefined) updateFields.thesis = updateBody.thesis
      if (updateBody.artifact_ids !== undefined) updateFields.artifact_ids = updateBody.artifact_ids
      if (updateBody.connection_ids !== undefined) updateFields.connection_ids = updateBody.connection_ids
      if (updateBody.case_file_id !== undefined) updateFields.case_file_id = updateBody.case_file_id

      var updateResult = await (supabase
        .from('constellation_theories') as any)
        .update(updateFields)
        .eq('id', updateId)
        .eq('user_id', user.id)
        .select()
        .single()

      if (updateResult.error) {
        if (updateResult.error.code === '42P01') {
          return res.status(500).json({ error: 'Table does not exist' })
        }
        throw updateResult.error
      }

      return res.status(200).json({ theory: updateResult.data })
    }

    // DELETE: Remove theory
    if (req.method === 'DELETE') {
      var deleteId = req.query.id as string
      if (!deleteId) {
        return res.status(400).json({ error: 'id query parameter required' })
      }

      var deleteResult = await supabase
        .from('constellation_theories')
        .delete()
        .eq('id', deleteId)
        .eq('user_id', user.id)

      if (deleteResult.error) {
        if (deleteResult.error.code === '42P01') {
          return res.status(500).json({ error: 'Table does not exist' })
        }
        throw deleteResult.error
      }

      return res.status(200).json({ deleted: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Theories API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
