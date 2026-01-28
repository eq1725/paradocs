/**
 * Natural Language Search API
 * POST /api/search/natural - Search reports using natural language queries
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface ParsedQuery {
  categories: string[]
  locations: string[]
  countries: string[]
  dateRange: { start?: string; end?: string }
  keywords: string[]
  hasMedia: boolean | null
  credibility: string[]
  timeOfDay: string | null
  sortBy: string
  limit: number
}

const SYSTEM_PROMPT = `You are a search query parser for a paranormal reports database.
Parse the user's natural language query into structured search filters.

Available categories: ufo, ghost, cryptid, alien, paranormal, unexplained, other
Credibility levels: verified, credible, unverified, disputed
Time of day: morning, afternoon, evening, night

Return a JSON object with these fields:
- categories: array of category strings (empty if not specified)
- locations: array of location/city names (empty if not specified)
- countries: array of country names (empty if not specified)
- dateRange: object with start and end dates in YYYY-MM-DD format (null if not specified)
- keywords: array of important search terms from the query
- hasMedia: true if user wants reports with photos/videos, false if without, null if not specified
- credibility: array of credibility levels (empty if not specified)
- timeOfDay: morning/afternoon/evening/night or null
- sortBy: "relevance", "date_desc", "date_asc", or "credibility"
- limit: number of results (default 20, max 100)

Examples:
"UFO sightings near Area 51 in the 1990s" -> categories: ["ufo"], locations: ["Area 51"], dateRange: {start: "1990-01-01", end: "1999-12-31"}
"Recent ghost encounters with photos" -> categories: ["ghost"], hasMedia: true, sortBy: "date_desc"
"Bigfoot sightings in Pacific Northwest" -> categories: ["cryptid"], locations: ["Pacific Northwest"], keywords: ["bigfoot"]

Only return the JSON object, no other text.`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }

  const { query } = req.body

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required' })
  }

  const supabase = createServerClient()

  // Get user if authenticated
  const { data: { user } } = await supabase.auth.getUser()

  const startTime = Date.now()

  try {
    // Parse the natural language query using GPT
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })

    const parsedContent = completion.choices[0].message.content
    if (!parsedContent) {
      throw new Error('Failed to parse query')
    }

    const parsed: ParsedQuery = JSON.parse(parsedContent)

    // Build Supabase query
    let dbQuery = supabase
      .from('reports')
      .select('id, title, category, description, location, country, date_of_encounter, time_of_encounter, credibility, has_photo_video, latitude, longitude, created_at')
      .eq('status', 'approved')

    // Apply category filter
    if (parsed.categories.length > 0) {
      dbQuery = dbQuery.in('category', parsed.categories)
    }

    // Apply country filter
    if (parsed.countries.length > 0) {
      const countryPatterns = parsed.countries.map(c => `%${c}%`)
      dbQuery = dbQuery.or(countryPatterns.map(p => `country.ilike.${p}`).join(','))
    }

    // Apply location filter (search in location field)
    if (parsed.locations.length > 0) {
      const locationPatterns = parsed.locations.map(l => `%${l}%`)
      const locationFilters = locationPatterns.map(p => `location.ilike.${p}`).join(',')
      dbQuery = dbQuery.or(locationFilters)
    }

    // Apply date range
    if (parsed.dateRange.start) {
      dbQuery = dbQuery.gte('date_of_encounter', parsed.dateRange.start)
    }
    if (parsed.dateRange.end) {
      dbQuery = dbQuery.lte('date_of_encounter', parsed.dateRange.end)
    }

    // Apply media filter
    if (parsed.hasMedia !== null) {
      dbQuery = dbQuery.eq('has_photo_video', parsed.hasMedia)
    }

    // Apply credibility filter
    if (parsed.credibility.length > 0) {
      dbQuery = dbQuery.in('credibility', parsed.credibility)
    }

    // Apply time of day filter
    if (parsed.timeOfDay) {
      const timeRanges: Record<string, [string, string]> = {
        morning: ['06:00', '12:00'],
        afternoon: ['12:00', '18:00'],
        evening: ['18:00', '21:00'],
        night: ['21:00', '06:00'],
      }
      const range = timeRanges[parsed.timeOfDay]
      if (range) {
        if (parsed.timeOfDay === 'night') {
          dbQuery = dbQuery.or(`time_of_encounter.gte.${range[0]},time_of_encounter.lt.${range[1]}`)
        } else {
          dbQuery = dbQuery.gte('time_of_encounter', range[0]).lt('time_of_encounter', range[1])
        }
      }
    }

    // Apply sorting
    switch (parsed.sortBy) {
      case 'date_desc':
        dbQuery = dbQuery.order('date_of_encounter', { ascending: false, nullsFirst: false })
        break
      case 'date_asc':
        dbQuery = dbQuery.order('date_of_encounter', { ascending: true, nullsFirst: false })
        break
      case 'credibility':
        dbQuery = dbQuery.order('credibility', { ascending: false })
        break
      default:
        dbQuery = dbQuery.order('created_at', { ascending: false })
    }

    // Apply limit
    const limit = Math.min(parsed.limit || 20, 100)
    dbQuery = dbQuery.limit(limit)

    // Execute query
    const { data: reports, error: queryError } = await dbQuery

    if (queryError) {
      throw queryError
    }

    // If keywords are specified, filter results by keyword relevance
    let filteredReports = reports || []
    if (parsed.keywords.length > 0) {
      const keywordLower = parsed.keywords.map(k => k.toLowerCase())
      filteredReports = filteredReports.filter(r => {
        const searchText = `${r.title} ${r.description} ${r.location}`.toLowerCase()
        return keywordLower.some(k => searchText.includes(k))
      })
    }

    const executionTime = Date.now() - startTime

    // Log the query for analytics
    if (user) {
      await supabase.from('natural_language_queries').insert({
        user_id: user.id,
        query_text: query,
        parsed_filters: parsed,
        result_count: filteredReports.length,
        execution_time_ms: executionTime,
      })
    }

    // Track AI usage
    if (user) {
      await supabase.from('ai_query_history').insert({
        user_id: user.id,
        query_type: 'natural_language_search',
        query_input: { query, parsed },
        query_output: { result_count: filteredReports.length },
        tokens_used: completion.usage?.total_tokens || 0,
      })
    }

    return res.status(200).json({
      query: query,
      parsed_filters: parsed,
      results: filteredReports,
      total_results: filteredReports.length,
      execution_time_ms: executionTime,
      suggestions: generateSearchSuggestions(parsed, filteredReports.length),
    })

  } catch (error) {
    console.error('Natural language search error:', error)
    return res.status(500).json({ error: 'Failed to process search query' })
  }
}

function generateSearchSuggestions(parsed: ParsedQuery, resultCount: number): string[] {
  const suggestions: string[] = []

  if (resultCount === 0) {
    suggestions.push('Try broadening your search by removing some filters')
    if (parsed.dateRange.start || parsed.dateRange.end) {
      suggestions.push('Try expanding the date range')
    }
    if (parsed.categories.length > 0) {
      suggestions.push('Try searching across all categories')
    }
  } else if (resultCount > 50) {
    suggestions.push('Add more specific criteria to narrow down results')
    if (parsed.categories.length === 0) {
      suggestions.push('Try filtering by a specific category')
    }
    if (!parsed.dateRange.start) {
      suggestions.push('Try specifying a time period')
    }
  }

  return suggestions
}
