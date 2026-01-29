/**
 * Academic Observation Data API
 *
 * Returns structured observation data for academic/research purposes
 * Extracts key details from report and any associated academic_observations record
 * Updated: Jan 29, 2026
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Extract structured data from report description using patterns
function extractObservationDetails(report: any) {
  const description = report.description?.toLowerCase() || ''

  // Extract duration patterns
  let durationSeconds: number | null = null
  const durationMatch = description.match(/(\d+)\s*(second|minute|hour|min|sec|hr)s?/i)
  if (durationMatch) {
    const value = parseInt(durationMatch[1])
    const unit = durationMatch[2].toLowerCase()
    if (unit.startsWith('sec')) durationSeconds = value
    else if (unit.startsWith('min')) durationSeconds = value * 60
    else if (unit.startsWith('hour') || unit.startsWith('hr')) durationSeconds = value * 3600
  }

  // Extract shape
  const shapes = ['disc', 'saucer', 'triangle', 'triangular', 'sphere', 'spherical', 'orb', 'oval',
    'cigar', 'cylinder', 'rectangular', 'diamond', 'chevron', 'boomerang', 'light', 'formation']
  let detectedShape: string | null = null
  for (const shape of shapes) {
    if (description.includes(shape)) {
      detectedShape = shape.charAt(0).toUpperCase() + shape.slice(1)
      break
    }
  }

  // Extract colors
  const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'white', 'silver', 'metallic',
    'glowing', 'bright', 'dim', 'pulsating', 'multicolored']
  const detectedColors = colors.filter(c => description.includes(c))

  // Extract motion
  const motions = ['hovering', 'stationary', 'moving', 'fast', 'slow', 'erratic', 'zigzag',
    'ascending', 'descending', 'disappeared', 'vanished']
  const detectedMotion = motions.find(m => description.includes(m)) || null

  // Extract sound
  let sound: string | null = 'unknown'
  if (description.includes('silent') || description.includes('no sound') || description.includes('no noise')) {
    sound = 'silent'
  } else if (description.includes('humming') || description.includes('hum')) {
    sound = 'humming'
  } else if (description.includes('buzzing')) {
    sound = 'buzzing'
  } else if (description.includes('roaring') || description.includes('loud')) {
    sound = 'loud'
  }

  // Detect witness count from description
  let witnessCount = report.witness_count || 1
  if (description.includes('we saw') || description.includes('we observed') ||
      description.includes('my friend') || description.includes('my family')) {
    witnessCount = Math.max(witnessCount, 2)
  }

  return {
    durationSeconds,
    detectedShape,
    detectedColors,
    detectedMotion,
    sound,
    witnessCount
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Report slug is required' })
  }

  try {
    // Get report data
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select(`
        id, title, slug, description, summary,
        event_date, event_time, event_time_approximate,
        location_name, state_province, country, latitude, longitude,
        witness_count, duration_seconds, duration_text,
        has_photo_video, has_physical_evidence, has_official_report,
        evidence_summary, tags, category, source_type, source_url,
        credibility_score, created_at
      `)
      .eq('slug', slug)
      .eq('status', 'approved')
      .single()

    if (reportError || !report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // Try to get academic observation record if exists
    const { data: academicData } = await supabase
      .from('academic_observations')
      .select('*')
      .eq('report_id', report.id)
      .single()

    // Extract additional details from description
    const extracted = extractObservationDetails(report)

    // Build the structured academic data response
    const structuredData = {
      // Core Identification
      caseId: report.id,
      caseSlug: report.slug,
      title: report.title,

      // Temporal Data
      temporal: {
        eventDate: report.event_date,
        eventTime: report.event_time,
        timeApproximate: report.event_time_approximate || false,
        durationSeconds: academicData?.observation_duration_seconds || report.duration_seconds || extracted.durationSeconds,
        durationText: report.duration_text,
        timeCertainty: academicData?.time_certainty || (report.event_time_approximate ? 'approximate' : 'reported'),
        reportedAt: report.created_at
      },

      // Location Data
      location: {
        name: report.location_name,
        stateProvince: report.state_province,
        country: report.country,
        coordinates: report.latitude && report.longitude ? {
          latitude: report.latitude,
          longitude: report.longitude,
          precision: 'approximate' // Most reports use city-level coords
        } : null,
        locationType: academicData?.observation_location_type || null
      },

      // Observer Information
      observer: {
        witnessCount: academicData?.other_witnesses_count || extracted.witnessCount,
        experienceLevel: academicData?.observer_experience_level || null,
        visualAids: academicData?.observer_visual_aids || null,
        physicalState: academicData?.observer_physical_state || null,
        emotionalState: academicData?.observer_emotional_state || null
      },

      // Object Characteristics
      phenomenon: {
        objectCount: academicData?.object_count || 1,
        shape: academicData?.object_shape || extracted.detectedShape,
        colors: academicData?.object_color || (extracted.detectedColors.length > 0 ? extracted.detectedColors : null),
        brightness: academicData?.object_brightness || null,
        sound: academicData?.object_sound || extracted.sound,
        sizeApparent: academicData?.object_size_apparent || null,
        sizeEstimated: academicData?.object_size_estimated || null
      },

      // Motion Characteristics
      motion: {
        type: academicData?.motion_type || extracted.detectedMotion,
        speedApparent: academicData?.motion_speed_apparent || null,
        direction: academicData?.motion_direction || null,
        altitudeApparent: academicData?.motion_altitude_apparent || null,
        maneuvers: academicData?.motion_maneuvers || null
      },

      // Environmental Conditions
      environment: {
        weather: academicData?.weather_conditions || null,
        ambientLighting: academicData?.ambient_lighting || null,
        lightPollution: academicData?.urban_light_pollution || null,
        terrain: academicData?.terrain_description || null
      },

      // Evidence & Documentation
      documentation: {
        hasPhotoVideo: report.has_photo_video || false,
        hasPhysicalEvidence: report.has_physical_evidence || false,
        hasOfficialReport: report.has_official_report || false,
        evidenceSummary: report.evidence_summary,
        methods: academicData?.documentation_methods || null,
        timing: academicData?.documentation_timing || null
      },

      // Physical Effects
      effects: {
        onObserver: academicData?.physical_effects_observer || null,
        onEnvironment: academicData?.physical_effects_environment || null,
        physicalEvidenceCollected: academicData?.physical_evidence_collected || false,
        evidenceDescription: academicData?.physical_evidence_description || null
      },

      // Data Quality Metrics
      quality: {
        dataQualityScore: academicData?.data_quality_score || null,
        completenessScore: academicData?.completeness_score || null,
        credibilityScore: report.credibility_score,
        sourceType: report.source_type,
        sourceUrl: report.source_url,
        collectionMethod: academicData?.collection_method || 'self-reported'
      },

      // Classification
      classification: {
        category: report.category,
        tags: report.tags || []
      },

      // Raw Data Access
      rawDescription: report.description,
      rawSummary: report.summary,

      // Metadata
      metadata: {
        hasStructuredData: !!academicData,
        lastUpdated: academicData?.last_updated_at || report.created_at,
        dataCollector: academicData?.data_collector_id || null
      }
    }

    return res.status(200).json(structuredData)
  } catch (error) {
    console.error('Error fetching academic data:', error)
    return res.status(500).json({ error: 'Failed to fetch academic data' })
  }
}
