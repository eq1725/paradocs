import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /api/constellation/public-profile?username=xxx
 * Returns public constellation data for a researcher profile.
 * No auth required — only returns public data.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { username } = req.query
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username is required' })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Find user by username (display_name in profiles)
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, created_at, constellation_public')
      .or(`display_name.ilike.${username},username.ilike.${username}`)
      .maybeSingle()

    if (profileErr || !profile) {
      return res.status(404).json({ error: 'Researcher not found' })
    }

    // Check if profile is public
    if (!profile.constellation_public) {
      return res.status(200).json({
        profile: {
          displayName: profile.display_name,
          avatarUrl: profile.avatar_url,
          isPublic: false,
        },
        private: true,
      })
    }

    const userId = profile.id

    // Parallel fetch: entries, connections, theories
    const [entriesResult, connectionsResult, theoriesResult] = await Promise.all([
      supabase
        .from('constellation_entries')
        .select(`
          id, report_id, note, verdict, tags, created_at,
          report:reports(id, title, slug, category, location_name, event_date, summary, primary_image_url)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),

      supabase
        .from('constellation_connections')
        .select('id, entry_a_id, entry_b_id, annotation, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),

      supabase
        .from('constellation_theories')
        .select('*')
        .eq('user_id', userId)
        .eq('is_public', true)
        .order('updated_at', { ascending: false }),
    ])

    const entries = entriesResult.data || []
    const connections = connectionsResult.data || []
    const theories = theoriesResult.data || []

    // Build stats
    const categories = new Set(entries.map((e: any) => e.report?.category).filter(Boolean))
    const allTags = new Set<string>()
    const tagToEntries: Record<string, string[]> = {}

    entries.forEach((e: any) => {
      (e.tags || []).forEach((t: string) => {
        allTags.add(t)
        if (!tagToEntries[t]) tagToEntries[t] = []
        tagToEntries[t].push(e.id)
      })
    })

    const tagConnections = Object.entries(tagToEntries)
      .filter(([_, ids]) => ids.length > 1)
      .map(([tag, entryIds]) => ({ tag, entryIds }))

    // Rank calculation
    const totalEntries = entries.length
    const categoriesExplored = categories.size
    const theoryCount = theories.length
    let rank = 'Stargazer'
    let rankLevel = 1
    if (totalEntries >= 100 && theoryCount >= 5 && categoriesExplored >= 8) {
      rank = 'Master Archivist'; rankLevel = 5
    } else if (totalEntries >= 50 && theoryCount >= 3 && categoriesExplored >= 5) {
      rank = 'Cartographer'; rankLevel = 4
    } else if (totalEntries >= 25 && theoryCount >= 1) {
      rank = 'Pattern Seeker'; rankLevel = 3
    } else if (totalEntries >= 10 && categoriesExplored >= 3) {
      rank = 'Field Researcher'; rankLevel = 2
    }

    // Verdict distribution
    const verdictCounts: Record<string, number> = {}
    entries.forEach((e: any) => {
      verdictCounts[e.verdict] = (verdictCounts[e.verdict] || 0) + 1
    })

    // Top categories by entry count
    const categoryCounts: Record<string, number> = {}
    entries.forEach((e: any) => {
      const cat = e.report?.category || 'combination'
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    })
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }))

    // Entry nodes for map
    const entryNodes = entries.map((entry: any) => ({
      id: entry.id,
      reportId: entry.report_id,
      name: entry.report?.title || 'Unknown',
      slug: entry.report?.slug || '',
      category: entry.report?.category || 'combination',
      imageUrl: entry.report?.primary_image_url || null,
      verdict: entry.verdict,
      tags: entry.tags || [],
      loggedAt: entry.created_at,
    }))

    return res.status(200).json({
      profile: {
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        joinedAt: profile.created_at,
        isPublic: true,
      },
      stats: {
        totalEntries,
        categoriesExplored,
        uniqueTags: allTags.size,
        connectionsDrawn: connections.length,
        theoriesCreated: theories.length,
        rank,
        rankLevel,
        verdictCounts,
        topCategories,
      },
      entryNodes,
      connections: connections.map((c: any) => ({
        id: c.id,
        entryAId: c.entry_a_id,
        entryBId: c.entry_b_id,
        annotation: c.annotation,
      })),
      theories: theories.map((t: any) => ({
        id: t.id,
        title: t.title,
        thesis: t.thesis,
        entryIds: t.entry_ids,
        connectionIds: t.connection_ids,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
      tagConnections,
    })
  } catch (err: any) {
    console.error('Public profile error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
