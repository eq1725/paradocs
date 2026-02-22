/**
 * POST /api/admin/infer-locations
 *
 * Batch infer locations for reports missing location data.
 * Uses deep text analysis on title/summary/description to extract
 * location information from narrative content.
 *
 * Query params:
 * - limit: Max reports to process (default 100)
 * - dry: If 'true', preview without updating
 * - mode: 'missing' (no location at all) | 'incomplete' (has location_name but no coords) | 'all'
 * - min_confidence: Minimum confidence to apply (default 0.5)
 *
 * Can be chained with /api/admin/geocode to first infer locations,
 * then geocode the inferred location_names to coordinates.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { inferLocation, InferredLocation } from '@/lib/ingestion/utils/location-inferrer'

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey)
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const limit = parseInt(req.query.limit as string) || 100
  const dryRun = req.query.dry === 'true'
  const mode = (req.query.mode as string) || 'missing'
  const minConfidence = parseFloat(req.query.min_confidence as string) || 0.5

  try {
    const supabase = getSupabaseAdmin()

    // Build query based on mode
    let query = supabase
      .from('reports')
      .select('id, title, summary, description, location_name, city, state_province, country, latitude, longitude')

    if (mode === 'missing') {
      // Reports with no location info at all
      query = query
        .is('location_name', null)
        .is('latitude', null)
    } else if (mode === 'incomplete') {
      // Reports with location_name but no coordinates
      query = query
        .not('location_name', 'is', null)
        .is('latitude', null)
    } else {
      // All reports without coordinates
      query = query.is('latitude', null)
    }

    const { data: reports, error: fetchError } = await query
      .order('created_at', { ascending: false })
      .limit(limit)

    if (fetchError) {
      return res.status(500).json({ error: 'Failed to fetch reports', details: fetchError })
    }

    if (!reports || reports.length === 0) {
      return res.json({
        message: 'No reports need location inference',
        processed: 0,
        inferred: 0
      })
    }

    console.log(`[Location Inference] Processing ${reports.length} reports (mode: ${mode}, min_confidence: ${minConfidence})...`)

    const results: Array<{
      id: string
      title: string
      existing_location: string | null
      inferred: InferredLocation | null
      applied: boolean
      reason?: string
    }> = []

    let inferredCount = 0
    let appliedCount = 0
    let skippedCount = 0

    const confidenceDistribution: Record<string, number> = {
      'high (0.8+)': 0,
      'medium (0.5-0.8)': 0,
      'low (<0.5)': 0
    }

    const sourceDistribution: Record<string, number> = {}

    for (const report of reports) {
      try {
        const inferred = inferLocation(
          report.title,
          report.summary || '',
          report.description || '',
          {
            location_name: report.location_name,
            city: report.city,
            state_province: report.state_province,
            country: report.country,
            latitude: report.latitude,
            longitude: report.longitude,
          }
        )

        if (!inferred) {
          results.push({
            id: report.id,
            title: report.title?.substring(0, 60),
            existing_location: report.location_name,
            inferred: null,
            applied: false,
            reason: 'No location found in text'
          })
          skippedCount++
          continue
        }

        inferredCount++

        // Track distributions
        if (inferred.confidence >= 0.8) {
          confidenceDistribution['high (0.8+)']++
        } else if (inferred.confidence >= 0.5) {
          confidenceDistribution['medium (0.5-0.8)']++
        } else {
          confidenceDistribution['low (<0.5)']++
        }

        sourceDistribution[inferred.source] = (sourceDistribution[inferred.source] || 0) + 1

        // Only apply if meets confidence threshold
        if (inferred.confidence < minConfidence) {
          results.push({
            id: report.id,
            title: report.title?.substring(0, 60),
            existing_location: report.location_name,
            inferred,
            applied: false,
            reason: `Confidence ${inferred.confidence.toFixed(2)} below threshold ${minConfidence}`
          })
          skippedCount++
          continue
        }

        // Build update object
        const updateData: Record<string, any> = {
          updated_at: new Date().toISOString()
        }

        // Only fill in missing fields — don't overwrite existing data
        if (!report.location_name && inferred.locationName) {
          updateData.location_name = inferred.locationName
        }
        if (!report.city && inferred.city) {
          updateData.city = inferred.city
        }
        if (!report.state_province && inferred.stateProvince) {
          updateData.state_province = inferred.stateProvince
        }
        if (!report.country && inferred.country) {
          updateData.country = inferred.country
        }
        if (!report.latitude && inferred.latitude) {
          updateData.latitude = inferred.latitude
        }
        if (!report.longitude && inferred.longitude) {
          updateData.longitude = inferred.longitude
        }

        // Only update if we have something new to add
        if (Object.keys(updateData).length <= 1) {
          // Only updated_at — nothing new
          results.push({
            id: report.id,
            title: report.title?.substring(0, 60),
            existing_location: report.location_name,
            inferred,
            applied: false,
            reason: 'No new data to add (existing fields already populated)'
          })
          skippedCount++
          continue
        }

        if (!dryRun) {
          const { error: updateError } = await supabase
            .from('reports')
            .update(updateData)
            .eq('id', report.id)

          if (updateError) {
            console.error(`[Location Inference] Update error for ${report.id}:`, updateError)
            results.push({
              id: report.id,
              title: report.title?.substring(0, 60),
              existing_location: report.location_name,
              inferred,
              applied: false,
              reason: `Update error: ${updateError.message}`
            })
            continue
          }
        }

        appliedCount++
        results.push({
          id: report.id,
          title: report.title?.substring(0, 60),
          existing_location: report.location_name,
          inferred,
          applied: true
        })

      } catch (reportError) {
        console.error(`[Location Inference] Error processing report:`, reportError)
        skippedCount++
      }
    }

    // Count remaining reports that could benefit from inference
    const { count: remainingMissing } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .is('location_name', null)
      .is('latitude', null)

    const { count: remainingIncomplete } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .not('location_name', 'is', null)
      .is('latitude', null)

    return res.json({
      dryRun,
      mode,
      minConfidence,
      processed: reports.length,
      inferred: inferredCount,
      applied: appliedCount,
      skipped: skippedCount,
      remaining: {
        missing_location: remainingMissing || 0,
        missing_coordinates: remainingIncomplete || 0
      },
      distributions: {
        confidence: confidenceDistribution,
        source: sourceDistribution
      },
      examples: results.slice(0, 25)
    })

  } catch (error) {
    console.error('[Location Inference] Error:', error)
    return res.status(500).json({
      error: 'Location inference failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Extended timeout for batch processing
export const config = {
  maxDuration: 300
}
