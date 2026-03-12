/**
 * GET /api/research-hub/hub-data
 *
 * Main data loader for Research Hub. Returns full payload for a given view.
 * Query param: view (board|timeline|map|constellation)
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

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
    const { view = 'board' } = req.query
    const validViews = ['board', 'timeline', 'map', 'constellation']
    const selectedView = validViews.includes(view as string) ? (view as string) : 'board'

    const now = new Date().toISOString()

    // Fetch artifacts
    let artifactsData: any[] = []
    try {
      const { data: artifacts, error } = await supabase
        .from('constellation_artifacts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error && error.code !== '42P01') {
        throw error
      }

      artifactsData = artifacts || []
    } catch (error: any) {
      if (error.code !== '42P01') {
        throw error
      }
    }

    // Filter artifacts by view requirements
    let filteredArtifacts = artifactsData
    if (selectedView === 'map') {
      // For map view, only include artifacts with coordinates
      filteredArtifacts = artifactsData.filter((a) => a.coordinates && a.coordinates !== null)
    } else if (selectedView === 'timeline') {
      // For timeline view, only include artifacts with extracted_date or created_at
      filteredArtifacts = artifactsData.filter(
        (a) => a.extracted_date || a.created_at
      )
    }

    // Fetch case files and organize artifacts
    let caseFilesData: any[] = []
    const artifactsByCase: Record<string, any[]> = {}

    try {
      const { data: caseFiles, error } = await supabase
        .from('constellation_case_files')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })

      if (error && error.code !== '42P01') {
        throw error
      }

      caseFilesData = caseFiles || []

      // Get artifact associations for each case file
      if (caseFilesData.length > 0) {
        for (const caseFile of caseFilesData) {
          try {
            const { data: relations, error: relError } = await supabase
              .from('constellation_case_file_artifacts')
              .select('artifact_id, sort_order')
              .eq('case_file_id', caseFile.id)
              .order('sort_order', { ascending: true })

            if (relError && relError.code !== '42P01') {
              throw relError
            }

            const caseArtifactIds = relations?.map((r: any) => r.artifact_id) || []
            artifactsByCase[caseFile.id] = filteredArtifacts.filter((a) =>
              caseArtifactIds.includes(a.id)
            )
          } catch (error: any) {
            if (error.code !== '42P01') {
              throw error
            }
          }
        }
      }
    } catch (error: any) {
      if (error.code !== '42P01') {
        throw error
      }
    }

    // Organize response based on view
    let organizedArtifacts: any = filteredArtifacts

    if (selectedView === 'board') {
      // For board view, group artifacts by case file with an "unsorted" group
      organizedArtifacts = {}

      // Add artifacts for each case file
      for (const caseFile of caseFilesData) {
        organizedArtifacts[caseFile.id] = {
          caseFile,
          artifacts: artifactsByCase[caseFile.id] || []
        }
      }

      // Add unsorted artifacts
      const usedArtifactIds = new Set(
        Object.values(artifactsByCase).flatMap((arr: any[]) => arr.map((a) => a.id))
      )
      const unsortedArtifacts = filteredArtifacts.filter(
        (a) => !usedArtifactIds.has(a.id)
      )
      organizedArtifacts['unsorted'] = {
        caseFile: {
          id: 'unsorted',
          title: 'Unsorted',
          description: 'Artifacts not yet organized into case files'
        },
        artifacts: unsortedArtifacts
      }
    }

    // Fetch connections
    let connectionsData: any[] = []
    try {
      const { data: connections, error } = await supabase
        .from('constellation_connections')
        .select(`
          *,
          artifact_a:artifact_a_id(id, title, source_type),
          artifact_b:artifact_b_id(id, title, source_type)
        `)
        .eq('user_id', user.id)

      if (error && error.code !== '42P01') {
        throw error
      }

      connectionsData = connections || []
    } catch (error: any) {
      if (error.code !== '42P01') {
        throw error
      }
    }

    // Fetch insights
    let insightsData: any[] = []
    try {
      let query = supabase
        .from('constellation_ai_insights')
        .select('*')
        .eq('user_id', user.id)
        .eq('dismissed', false)

      if (selectedView && selectedView !== 'board') {
        query = query.eq('primary_view', selectedView as string)
      }

      query = query.or('expires_at.is.null,expires_at.gt.' + now)

      const { data: insights, error } = await query
        .order('created_at', { ascending: false })
        .limit(20)

      if (error && error.code !== '42P01') {
        throw error
      }

      insightsData = insights || []
    } catch (error: any) {
      if (error.code !== '42P01') {
        throw error
      }
    }

    // Build stats
    const stats = {
      totalArtifacts: filteredArtifacts.length,
      totalCaseFiles: caseFilesData.length,
      totalConnections: connectionsData.length,
      activeInsights: insightsData.length,
      categoriesExplored: new Set(
        filteredArtifacts
          .filter((a) => a.source_type)
          .map((a) => a.source_type)
      ).size
    }

    return res.status(200).json({
      artifacts: organizedArtifacts,
      caseFiles: caseFilesData,
      connections: connectionsData,
      insights: insightsData,
      stats,
      view: selectedView
    })
  } catch (error: any) {
    console.error('Hub data API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
