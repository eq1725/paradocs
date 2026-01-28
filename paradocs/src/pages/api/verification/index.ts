/**
 * Verification Requests API
 * GET /api/verification - List verification requests (moderators only)
 * POST /api/verification - Submit a verification request
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    // Only moderators and admins can list all requests
    if (profile?.role !== 'moderator' && profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' })
    }

    const { status = 'pending', limit = 20, offset = 0 } = req.query

    try {
      const { data: requests, error, count } = await supabase
        .from('verification_requests')
        .select(\`
          *,
          report:reports(id, title, slug, category, credibility, submitted_by),
          requester:profiles!verification_requests_requester_id_fkey(id, username, display_name),
          reviewer:profiles!verification_requests_reviewer_id_fkey(id, username, display_name)
        \`, { count: 'exact' })
        .eq('status', status)
        .order('created_at', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1)

      if (error) throw error

      return res.status(200).json({
        requests: requests || [],
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset),
      })
    } catch (error) {
      console.error('Error fetching verification requests:', error)
      return res.status(500).json({ error: 'Failed to fetch requests' })
    }
  }

  if (req.method === 'POST') {
    const { report_id, request_type, evidence_description, supporting_links } = req.body

    if (!report_id || !request_type) {
      return res.status(400).json({ error: 'Report ID and request type are required' })
    }

    try {
      // Check if report exists
      const { data: report, error: reportError } = await supabase
        .from('reports')
        .select('id, submitted_by, credibility')
        .eq('id', report_id)
        .single()

      if (reportError || !report) {
        return res.status(404).json({ error: 'Report not found' })
      }

      // Check if user is the report owner
      if (report.submitted_by !== user.id && profile?.role !== 'moderator' && profile?.role !== 'admin') {
        return res.status(403).json({ error: 'Only report owners can request verification' })
      }

      // Check for existing pending request
      const { data: existingRequest } = await supabase
        .from('verification_requests')
        .select('id')
        .eq('report_id', report_id)
        .eq('status', 'pending')
        .single()

      if (existingRequest) {
        return res.status(400).json({ error: 'A pending verification request already exists for this report' })
      }

      // Create verification request
      const { data: newRequest, error: insertError } = await supabase
        .from('verification_requests')
        .insert({
          report_id,
          requester_id: user.id,
          request_type,
          evidence_description,
          supporting_links: supporting_links || [],
          status: 'pending',
        })
        .select()
        .single()

      if (insertError) throw insertError

      return res.status(201).json({
        message: 'Verification request submitted successfully',
        request: newRequest,
      })
    } catch (error) {
      console.error('Error creating verification request:', error)
      return res.status(500).json({ error: 'Failed to submit request' })
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({ error: \`Method \${req.method} not allowed\` })
}
