import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { assessQuality, getStatusFromScore, isObviouslyLowQuality } from '@/lib/ingestion/filters'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Subreddit category mapping
const SUBREDDIT_CATEGORIES: Record<string, string> = {
  'paranormal': 'ghosts_hauntings',
  'ufos': 'ufos_aliens',
  'ufo': 'ufos_aliens',
  'aliens': 'ufos_aliens',
  'uap': 'ufos_aliens',
  'ghosts': 'ghosts_hauntings',
  'thetruthishere': 'ghosts_hauntings',
  'haunted': 'ghosts_hauntings',
  'bigfoot': 'cryptids',
  'cryptids': 'cryptids',
  'cryptozoology': 'cryptids',
  'skinwalkers': 'cryptids',
  'glitch_in_the_matrix': 'psychological_experiences',
  'highstrangeness': 'combination',
  'nde': 'psychological_experiences',
  'astralprojection': 'consciousness_practices',
  'luciddreaming': 'consciousness_practices',
  'psychonaut': 'consciousness_practices',
  'psychic': 'psychic_phenomena'
}

function generateSlug(title: string, originalReportId: string, sourceType: string): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60)

  const uniqueKey = `${sourceType}-${originalReportId}`
  let hash = 0
  for (let i = 0; i < uniqueKey.length; i++) {
    const char = uniqueKey.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  const hashStr = Math.abs(hash).toString(36).substring(0, 8)

  return `${baseSlug}-${hashStr}`
}

interface RedditPost {
  id: string
  title: string
  selftext?: string
  author: string
  subreddit: string
  created_utc: number
  score: number
  num_comments?: number
  permalink?: string
  link_flair_text?: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { posts } = req.body as { posts: RedditPost[] }

    if (!posts || !Array.isArray(posts)) {
      return res.status(400).json({ error: 'posts array is required' })
    }

    let inserted = 0
    let skipped = 0
    let rejected = 0
    let errors = 0

    for (const post of posts) {
      try {
        const textContent = post.selftext || ''

        // Skip invalid posts
        if (!textContent || textContent.length < 100 ||
            textContent === '[removed]' || textContent === '[deleted]') {
          rejected++
          continue
        }

        // Clean text
        const description = textContent
          .replace(/\n{3,}/g, '\n\n')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim()

        const title = post.title.length > 150 ? post.title.substring(0, 147) + '...' : post.title

        // Quick quality check
        if (isObviouslyLowQuality(title, description)) {
          rejected++
          continue
        }

        // Get category
        const subredditLower = post.subreddit.toLowerCase()
        const category = SUBREDDIT_CATEGORIES[subredditLower] || 'combination'

        // Create summary
        const summary = description.length > 200 ? description.substring(0, 197) + '...' : description

        // Extract location and country if present
        let locationName: string | undefined
        let country: string | undefined

        // Try to find location patterns
        const locationPatterns = [
          // "in City, State" or "in City, ST"
          /(?:in|at|near|from)\s+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})\b/,
          // "in City, Country"
          /(?:in|at|near|from)\s+([A-Z][a-zA-Z\s]+,\s*(?:USA|US|United States|Canada|UK|Australia|Ireland|Scotland|England|Wales|Germany|France|Japan|Mexico|Brazil|India|China))/i,
          // "Location: City" pattern
          /Location:\s*([A-Z][a-zA-Z\s,]+?)(?:\.|$|\n)/,
          // Just city/state
          /(?:in|at|near|from)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/
        ]

        for (const pattern of locationPatterns) {
          const match = description.match(pattern)
          if (match) {
            locationName = match[1].trim()
            break
          }
        }

        // Try to determine country from text
        const countryPatterns: [RegExp, string][] = [
          [/\b(?:USA|US|United States|America)\b/i, 'United States'],
          [/\bCanada\b/i, 'Canada'],
          [/\b(?:UK|United Kingdom|Britain|England|Scotland|Wales)\b/i, 'United Kingdom'],
          [/\bAustralia\b/i, 'Australia'],
          [/\bIreland\b/i, 'Ireland'],
          [/\bGermany\b/i, 'Germany'],
          [/\bFrance\b/i, 'France'],
          [/\bJapan\b/i, 'Japan'],
          [/\bMexico\b/i, 'Mexico'],
          [/\bBrazil\b/i, 'Brazil'],
          [/\bIndia\b/i, 'India'],
          [/\bChina\b/i, 'China'],
          [/\bPhilippines\b/i, 'Philippines'],
          [/\bNew Zealand\b/i, 'New Zealand'],
        ]

        for (const [pattern, countryName] of countryPatterns) {
          if (pattern.test(description) || pattern.test(post.title)) {
            country = countryName
            break
          }
        }

        // If location contains a US state abbreviation and no country found, assume US
        if (!country && locationName) {
          const usStates = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/
          if (usStates.test(locationName)) {
            country = 'United States'
          }
        }

        // Convert timestamp
        const eventDate = new Date(post.created_utc * 1000).toISOString().split('T')[0]

        // Tags
        const tags: string[] = [subredditLower]
        if (post.link_flair_text) {
          tags.push(post.link_flair_text.toLowerCase().replace(/\s+/g, '-'))
        }

        // Credibility
        let credibility: 'low' | 'medium' | 'high' = 'medium'
        const hasHighEngagement = (post.score || 0) > 100 || (post.num_comments || 0) > 20
        const hasDetailedText = description.length > 1000
        if (hasHighEngagement && hasDetailedText) {
          credibility = 'high'
        } else if (description.length < 300 && (post.score || 0) < 10) {
          credibility = 'low'
        }

        const originalReportId = `reddit-${post.id}`
        const permalink = post.permalink || `/r/${post.subreddit}/comments/${post.id}`
        const slug = generateSlug(title, originalReportId, 'reddit')

        // Check for existing
        const { data: existing } = await supabaseAdmin
          .from('reports')
          .select('id')
          .eq('original_report_id', originalReportId)
          .eq('source_type', 'reddit')
          .single()

        if (existing) {
          skipped++
          continue
        }

        // Insert report
        const { error: insertError } = await supabaseAdmin
          .from('reports')
          .insert({
            title,
            slug,
            summary,
            description,
            category,
            location_name: locationName,
            country: country, // Only set if we can determine it from content
            event_date: eventDate,
            credibility,
            source_type: 'reddit',
            original_report_id: originalReportId,
            status: 'approved',
            tags,
            source_label: `r/${post.subreddit}`,
            source_url: `https://reddit.com${permalink}`,
            upvotes: 0,
            view_count: 0
          })

        if (insertError) {
          if (insertError.code === '23505') {
            skipped++
          } else {
            errors++
            console.error('Insert error:', insertError.message)
          }
        } else {
          inserted++
        }
      } catch (err) {
        errors++
      }
    }

    res.status(200).json({
      success: true,
      result: {
        total: posts.length,
        inserted,
        skipped,
        rejected,
        errors
      }
    })
  } catch (error) {
    console.error('Direct import error:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Import failed'
    })
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}
