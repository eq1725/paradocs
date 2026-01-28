/**
 * Similar Reports API
 * GET /api/reports/[id]/similar - Find reports similar to a given report
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface SimilarReport {
  id: string
  title: string
  category: string
  location: string
  country: string
  date_of_encounter: string
  similarity_score: number
  matching_factors: string[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }

  const { id } = req.query
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Report ID is required' })
  }

  const supabase = createServerClient()

  try {
    // Get the source report
    const { data: sourceReport, error: reportError } = await supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single()

    if (reportError || !sourceReport) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // Check if we have an embedding for this report
    let { data: embedding } = await supabase
      .from('report_embeddings')
      .select('embedding')
      .eq('report_id', id)
      .single()

    // If no embedding exists, create one
    if (!embedding?.embedding) {
      const contentToEmbed = `
        Title: ${sourceReport.title}
        Category: ${sourceReport.category}
        Location: ${sourceReport.location}, ${sourceReport.country}
        Description: ${sourceReport.description}
        Date: ${sourceReport.date_of_encounter}
        Time: ${sourceReport.time_of_encounter}
        Weather: ${sourceReport.weather_conditions}
        Duration: ${sourceReport.duration}
      `.trim()

      try {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: contentToEmbed,
        })

        const newEmbedding = embeddingResponse.data[0].embedding

        // Store the embedding
        await supabase.from('report_embeddings').upsert({
          report_id: id,
          embedding: newEmbedding,
          content_hash: Buffer.from(contentToEmbed).toString('base64').slice(0, 64),
        })

        embedding = { embedding: newEmbedding }
      } catch (embError) {
        console.error('Error creating embedding:', embError)
        // Fall back to content-based similarity
      }
    }

    let similarReports: SimilarReport[] = []

    // Try vector similarity first
    if (embedding?.embedding) {
      const { data: vectorResults, error: vectorError } = await supabase
        .rpc('match_reports_by_embedding', {
          query_embedding: embedding.embedding,
          match_threshold: 0.7,
          match_count: limit + 1, // +1 to exclude self
        })

      if (!vectorError && vectorResults) {
        similarReports = vectorResults
          .filter((r: any) => r.id !== id)
          .slice(0, limit)
          .map((r: any) => ({
            id: r.id,
            title: r.title,
            category: r.category,
            location: r.location,
            country: r.country,
            date_of_encounter: r.date_of_encounter,
            similarity_score: Math.round(r.similarity * 100),
            matching_factors: determineMatchingFactors(sourceReport, r),
          }))
      }
    }

    // Fall back to content-based similarity if vector search didn't work
    if (similarReports.length === 0) {
      const { data: contentResults } = await supabase
        .from('reports')
        .select('id, title, category, location, country, date_of_encounter, description, latitude, longitude')
        .eq('status', 'approved')
        .neq('id', id)
        .limit(100)

      if (contentResults) {
        // Score each report based on content similarity
        const scored = contentResults.map(r => {
          let score = 0
          const factors: string[] = []

          // Category match (high weight)
          if (r.category === sourceReport.category) {
            score += 30
            factors.push('Same category')
          }

          // Country match
          if (r.country === sourceReport.country) {
            score += 15
            factors.push('Same country')
          }

          // Location proximity (if coordinates available)
          if (r.latitude && r.longitude && sourceReport.latitude && sourceReport.longitude) {
            const distance = calculateDistance(
              sourceReport.latitude, sourceReport.longitude,
              r.latitude, r.longitude
            )
            if (distance < 50) {
              score += 25
              factors.push('Within 50km')
            } else if (distance < 200) {
              score += 15
              factors.push('Within 200km')
            }
          }

          // Date proximity (within same year)
          if (r.date_of_encounter && sourceReport.date_of_encounter) {
            const daysDiff = Math.abs(
              new Date(r.date_of_encounter).getTime() - new Date(sourceReport.date_of_encounter).getTime()
            ) / (1000 * 60 * 60 * 24)

            if (daysDiff < 30) {
              score += 20
              factors.push('Within 30 days')
            } else if (daysDiff < 365) {
              score += 10
              factors.push('Within same year')
            }
          }

          // Description keyword overlap
          const sourceWords = new Set(sourceReport.description?.toLowerCase().split(/\W+/) || [])
          const targetWords = new Set(r.description?.toLowerCase().split(/\W+/) || [])
          const overlap = [...sourceWords].filter(w => w.length > 4 && targetWords.has(w)).length
          if (overlap > 5) {
            score += 10
            factors.push('Similar description')
          }

          return {
            ...r,
            similarity_score: Math.min(score, 100),
            matching_factors: factors,
          }
        })

        similarReports = scored
          .filter(r => r.similarity_score > 20)
          .sort((a, b) => b.similarity_score - a.similarity_score)
          .slice(0, limit)
          .map(r => ({
            id: r.id,
            title: r.title,
            category: r.category,
            location: r.location,
            country: r.country,
            date_of_encounter: r.date_of_encounter,
            similarity_score: r.similarity_score,
            matching_factors: r.matching_factors,
          }))
      }
    }

    return res.status(200).json({
      source_report: {
        id: sourceReport.id,
        title: sourceReport.title,
        category: sourceReport.category,
      },
      similar_reports: similarReports,
      total_found: similarReports.length,
    })

  } catch (error) {
    console.error('Similar reports error:', error)
    return res.status(500).json({ error: 'Failed to find similar reports' })
  }
}

function determineMatchingFactors(source: any, target: any): string[] {
  const factors: string[] = []

  if (source.category === target.category) factors.push('Same category')
  if (source.country === target.country) factors.push('Same country')
  if (source.location === target.location) factors.push('Same location')

  return factors
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
