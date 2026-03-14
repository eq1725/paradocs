/**
 * PUT /api/research-hub/artifacts/[id]
 *
 * Updates an existing artifact (verdict, user_note, tags, etc.)
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  var supabase = createServerClient()

  // Authenticate user
  var token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  var authResult = await supabase.auth.getUser(token)
  var user = authResult.data.user
  var authError = authResult.error
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  var id = req.query.id
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing artifact id' })
  }

  try {
    if (req.method === 'PUT') {
      var body = req.body || {}

      // Only allow updating specific fields
      var allowedFields: Record<string, any> = {}
      if (body.user_note !== undefined) allowedFields.user_note = body.user_note
      if (body.verdict !== undefined) allowedFields.verdict = body.verdict
      if (body.tags !== undefined) allowedFields.tags = body.tags
      if (body.title !== undefined) allowedFields.title = body.title
      if (body.description !== undefined) allowedFields.description = body.description

      if (Object.keys(allowedFields).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' })
      }

      // Verify artifact belongs to user before updating
      var checkResult = await supabase
        .from('constellation_artifacts')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (checkResult.error || !checkResult.data) {
        return res.status(404).json({ error: 'Artifact not found' })
      }

      var updateResult = await supabase
        .from('constellation_artifacts')
        .update(allowedFields)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()

      if (updateResult.error) {
        console.error('Failed to update artifact:', updateResult.error)
        return res.status(500).json({ error: 'Failed to update artifact' })
      }

      return res.status(200).json(updateResult.data)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('Artifact update error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
