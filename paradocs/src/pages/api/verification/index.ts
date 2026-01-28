/**
 * Expert Verification Network API
 * GET /api/verification/experts - List verified experts
 * POST /api/verification/apply - Apply to become an expert
 * GET /api/verification/report/[id] - Get verifications for a report
 * POST /api/verification/report/[id] - Submit verification (experts only)
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

interface Expert {
  id: string
  display_name: string
  bio: string
  expertise_areas: string[]
  credentials: string
  organization: string
  verification_count: number
  approval_rate: number
  is_verified: boolean
}

interface Verification {
  id: string
  expert: {
    id: string
    display_name: string
    expertise_areas: string[]
  }
  verification_type: string
  status: string
  confidence_level: number
  findings: string
  methodology: string
  created_at: string
}

const EXPERTISE_AREAS = [
  'ufo',
  'ghost',
  'cryptid',
  'photo_analysis',
  'video_analysis',
  'witness_interview',
  'historical_research',
  'scientific_analysis',
  'location_investigation',
]

const VERIFICATION_TYPES = [
  'location_verified',
  'witness_interviewed',
  'evidence_analyzed',
  'plausibility_assessed',
  'historical_context',
  'scientific_review',
]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerClient()

  // GET /api/verification/experts - List experts
  if (req.method === 'GET' && !req.query.report_id) {
    try {
      const {
        expertise,
        limit = '20',
        offset = '0',
      } = req.query

      let query = supabase
        .from('verification_experts')
        .select('id, display_name, bio, expertise_areas, credentials, organization, verification_count, approval_rate, is_verified')
        .eq('is_verified', true)
        .eq('is_active', true)
        .order('verification_count', { ascending: false })

      if (expertise) {
        query = query.contains('expertise_areas', [expertise as string])
      }

      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      )

      const { data: experts, error } = await query

      if (error) throw error

      return res.status(200).json({
        experts: experts || [],
        expertise_options: EXPERTISE_AREAS,
      })

    } catch (error) {
      console.error('List experts error:', error)
      return res.status(500).json({ error: 'Failed to fetch experts' })
    }
  }

  // POST /api/verification/apply - Apply to become expert
  if (req.method === 'POST' && req.body.action === 'apply') {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const {
        display_name,
        bio,
        expertise_areas,
        credentials,
        organization,
        website_url,
      } = req.body

      // Validate required fields
      if (!display_name || !expertise_areas || expertise_areas.length === 0) {
        return res.status(400).json({ error: 'Display name and expertise areas are required' })
      }

      // Validate expertise areas
      const validAreas = expertise_areas.filter((a: string) => EXPERTISE_AREAS.includes(a))
      if (validAreas.length === 0) {
        return res.status(400).json({ error: 'Invalid expertise areas' })
      }

      // Check if already applied
      const { data: existing } = await supabase
        .from('verification_experts')
        .select('id, is_verified')
        .eq('user_id', user.id)
        .single()

      if (existing) {
        if (existing.is_verified) {
          return res.status(400).json({ error: 'You are already a verified expert' })
        }
        return res.status(400).json({ error: 'You have already applied. Application is pending review.' })
      }

      // Submit application
      const { data: application, error: applyError } = await supabase
        .from('verification_experts')
        .insert({
          user_id: user.id,
          display_name,
          bio: bio || '',
          expertise_areas: validAreas,
          credentials: credentials || '',
          organization: organization || '',
          website_url: website_url || '',
          is_verified: false,
          is_active: true,
          applied_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (applyError) throw applyError

      return res.status(201).json({
        message: 'Application submitted successfully',
        application_id: application.id,
        status: 'pending_review',
      })

    } catch (error) {
      console.error('Expert application error:', error)
      return res.status(500).json({ error: 'Failed to submit application' })
    }
  }

  // GET /api/verification?report_id=xxx - Get verifications for a report
  if (req.method === 'GET' && req.query.report_id) {
    try {
      const { report_id } = req.query

      const { data: verifications, error } = await supabase
        .from('expert_verifications')
        .select(`
          id,
          verification_type,
          status,
          confidence_level,
          findings,
          methodology,
          created_at,
          verification_experts (
            id,
            display_name,
            expertise_areas
          )
        `)
        .eq('report_id', report_id)
        .eq('is_public', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Calculate verification summary
      const summary = {
        total_verifications: verifications?.length || 0,
        verified_count: verifications?.filter(v => v.status === 'verified').length || 0,
        disputed_count: verifications?.filter(v => v.status === 'disputed').length || 0,
        avg_confidence: verifications && verifications.length > 0
          ? Math.round(verifications.reduce((sum, v) => sum + (v.confidence_level || 0), 0) / verifications.length)
          : null,
        verification_types: [...new Set(verifications?.map(v => v.verification_type) || [])],
      }

      return res.status(200).json({
        report_id,
        verifications: verifications?.map(v => ({
          id: v.id,
          expert: v.verification_experts,
          verification_type: v.verification_type,
          status: v.status,
          confidence_level: v.confidence_level,
          findings: v.findings,
          methodology: v.methodology,
          created_at: v.created_at,
        })) || [],
        summary,
      })

    } catch (error) {
      console.error('Get verifications error:', error)
      return res.status(500).json({ error: 'Failed to fetch verifications' })
    }
  }

  // POST /api/verification - Submit verification (experts only)
  if (req.method === 'POST' && req.body.report_id) {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      // Check if user is a verified expert
      const { data: expert, error: expertError } = await supabase
        .from('verification_experts')
        .select('id, expertise_areas')
        .eq('user_id', user.id)
        .eq('is_verified', true)
        .eq('is_active', true)
        .single()

      if (expertError || !expert) {
        return res.status(403).json({ error: 'Only verified experts can submit verifications' })
      }

      const {
        report_id,
        verification_type,
        status,
        confidence_level,
        findings,
        evidence_notes,
        methodology,
        is_public = true,
      } = req.body

      // Validate fields
      if (!report_id || !verification_type || !status) {
        return res.status(400).json({
          error: 'report_id, verification_type, and status are required',
        })
      }

      if (!VERIFICATION_TYPES.includes(verification_type)) {
        return res.status(400).json({
          error: `Invalid verification_type. Must be one of: ${VERIFICATION_TYPES.join(', ')}`,
        })
      }

      if (!['pending', 'verified', 'inconclusive', 'disputed', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' })
      }

      // Check if report exists
      const { data: report } = await supabase
        .from('reports')
        .select('id, user_id')
        .eq('id', report_id)
        .single()

      if (!report) {
        return res.status(404).json({ error: 'Report not found' })
      }

      // Check if expert already verified this report with this type
      const { data: existing } = await supabase
        .from('expert_verifications')
        .select('id')
        .eq('report_id', report_id)
        .eq('expert_id', expert.id)
        .eq('verification_type', verification_type)
        .single()

      if (existing) {
        // Update existing verification
        const { data: updated, error: updateError } = await supabase
          .from('expert_verifications')
          .update({
            status,
            confidence_level: confidence_level || null,
            findings: findings || null,
            evidence_notes: evidence_notes || null,
            methodology: methodology || null,
            is_public,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (updateError) throw updateError

        return res.status(200).json({
          message: 'Verification updated',
          verification: updated,
        })
      }

      // Insert new verification
      const { data: verification, error: insertError } = await supabase
        .from('expert_verifications')
        .insert({
          report_id,
          expert_id: expert.id,
          verification_type,
          status,
          confidence_level: confidence_level || null,
          findings: findings || null,
          evidence_notes: evidence_notes || null,
          methodology: methodology || null,
          is_public,
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Update expert's verification count
      await supabase.rpc('increment_verification_count', { expert_id: expert.id })

      // Award reputation points to report submitter if verified
      if (status === 'verified' && report.user_id) {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/reputation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: report.user_id,
            event_type: 'report_verified',
            related_report_id: report_id,
          }),
        }).catch(() => {}) // Don't fail if reputation update fails
      }

      return res.status(201).json({
        message: 'Verification submitted',
        verification,
      })

    } catch (error) {
      console.error('Submit verification error:', error)
      return res.status(500).json({ error: 'Failed to submit verification' })
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({ error: `Method ${req.method} not allowed` })
}
