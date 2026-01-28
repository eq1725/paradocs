/**
 * Collection Reports API
 * POST - Add a report to collection
 * DELETE - Remove a report from collection
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerClient()
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Collection ID is required' })
  }

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Check collection access
  const { data: collection, error: collectionError } = await supabase
    .from('collections')
    .select('user_id')
    .eq('id', id)
    .single()

  if (collectionError || !collection) {
    return res.status(404).json({ error: 'Collection not found' })
  }

  // Check if user has edit access
  let hasAccess = collection.user_id === user.id

  if (!hasAccess) {
    const { data: collaborator } = await supabase
      .from('collection_collaborators')
      .select('role')
      .eq('collection_id', id)
      .eq('user_id', user.id)
      .single()

    hasAccess = collaborator?.role === 'editor' || collaborator?.role === 'admin'
  }

  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied' })
  }

  if (req.method === 'POST') {
    const { report_id, user_notes, tags } = req.body

    if (!report_id) {
      return res.status(400).json({ error: 'Report ID is required' })
    }

    // Check if report exists
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id')
      .eq('id', report_id)
      .single()

    if (reportError || !report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // Add report to collection
    const { data: collectionReport, error } = await supabase
      .from('collection_reports')
      .insert({
        collection_id: id,
        report_id,
        user_notes: user_notes || null,
        tags: tags || []
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Report already in collection' })
      }
      console.error('Error adding report to collection:', error)
      return res.status(500).json({ error: 'Failed to add report to collection' })
    }

    return res.status(201).json({ collectionReport })

  } else if (req.method === 'DELETE') {
    const { report_id } = req.body

    if (!report_id) {
      return res.status(400).json({ error: 'Report ID is required' })
    }

    const { error } = await supabase
      .from('collection_reports')
      .delete()
      .eq('collection_id', id)
      .eq('report_id', report_id)

    if (error) {
      console.error('Error removing report from collection:', error)
      return res.status(500).json({ error: 'Failed to remove report from collection' })
    }

    return res.status(200).json({ success: true })

  } else if (req.method === 'PUT') {
    // Update report notes/tags in collection
    const { report_id, user_notes, tags } = req.body

    if (!report_id) {
      return res.status(400).json({ error: 'Report ID is required' })
    }

    const updates: Record<string, unknown> = {}
    if (user_notes !== undefined) updates.user_notes = user_notes
    if (tags !== undefined) updates.tags = tags

    const { data: collectionReport, error } = await supabase
      .from('collection_reports')
      .update(updates)
      .eq('collection_id', id)
      .eq('report_id', report_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating collection report:', error)
      return res.status(500).json({ error: 'Failed to update' })
    }

    return res.status(200).json({ collectionReport })

  } else {
    res.setHeader('Allow', ['POST', 'DELETE', 'PUT'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }
}
