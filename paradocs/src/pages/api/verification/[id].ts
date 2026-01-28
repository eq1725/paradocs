/**
 * Verification Request Review API
 * GET /api/verification/[id] - Get verification request details
 * PATCH /api/verification/[id] - Review/update a verification request (moderators only)
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Request ID is required' })
  }

  const supabase = createServerClient()

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Get user profile for role check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (req.method === 'GET') {
    try {
      const { data: request, error } = await supabase
        .from('verification_requests')
        .select(\`
          *,
          report:reports(*),
          requester:profiles!verification_requests_requester_id_fkey(id, username, display_name, avatar_url),
          reviewer:profiles!verification_requests_reviewer_id_fkey(id, username, display_name, avatar_url)
        \`)
        .eq('id', id)
        .single()

      if (error || !request) {
        return res.status(404).json({ error: 'Verification request not found' })
      }

      // Only moderators or the requester can view
      if (request.requester_id !== user.id && profile?.role !== 'moderator' && profile?.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' })
      }

      return res.status(200).json({ request })
    } catch (error) {
      console.error('Error fetching verification request:', error)
      return res.status(500).json({ error: 'Failed to fetch request' })
    }
  }

  if (req.method === 'PATCH') {
    // Only moderators and admins can review
    if (profile?.role !== 'moderator' && profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Only moderators can review verification requests' })
    }

    const { status, reviewer_notes, new_credibility } = req.body

    if (!status || !['approved', 'rejected', 'needs_more_info'].includes(status)) {
      return res.status(400).json({ error: 'Valid status is required (approved, rejected, needs_more_info)' })
    }

    try {
      // Get the request
      const { data: request, error: fetchError } = await supabase
        .from('verification_requests')
        .select('*, report:reports(id, credibility)')
        .eq('id', id)
        .single()

      if (fetchError || !request) {
        return res.status(404).json({ error: 'Verification request not found' })
      }

      // Update verification request
      const { data: updatedRequest, error: updateError } = await supabase
        .from('verification_requests')
        .update({
          status,
          reviewer_id: user.id,
          reviewer_notes,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      // If approved and new credibility provided, update the report
      if (status === 'approved' && new_credibility) {
        const { error: reportUpdateError } = await supabase
          .from('reports')
          .update({
            credibility: new_credibility,
            moderated_by: user.id,
            moderation_notes: \`Verified via verification request #\${id.slice(0, 8)}: \${reviewer_notes || 'Approved'}\`,
          })
          .eq('id', request.report_id)

        if (reportUpdateError) {
          console.error('Error updating report credibility:', reportUpdateError)
        }

        // Update requester reputation if verified
        if (new_credibility === 'confirmed' || new_credibility === 'high') {
          const { error: repError } = await supabase
            .rpc('increment_reputation', {
              user_id: request.requester_id,
              points: new_credibility === 'confirmed' ? 50 : 25,
            })
          
          if (repError) {
            console.error('Error updating reputation:', repError)
          }
        }
      }

      return res.status(200).json({
        message: \`Verification request \${status}\`,
        request: updatedRequest,
      })
    } catch (error) {
      console.error('Error updating verification request:', error)
      return res.status(500).json({ error: 'Failed to update request' })
    }
  }

  res.setHeader('Allow', ['GET', 'PATCH'])
  return res.status(405).json({ error: \`Method \${req.method} not allowed\` })
}
