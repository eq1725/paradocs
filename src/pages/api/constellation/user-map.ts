import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /api/constellation/user-map
 * Returns personalized constellation data built from the user's
 * deliberately logged constellation entries (not passive views).
 * Each logged entry = a star the user chose to add.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // Parallel fetch: constellation entries, total phenomena count, streak, connections, theories
    const [entriesResult, totalResult, streakResult, connectionsResult, theoriesResult] = await Promise.all([
      // User's logged constellation entries with report details
      supabase
        .from('constellation_entries')
        .select(`
          id,
          report_id,
          note,
          verdict,
          tags,
          created_at,
          updated_at,
          report:reports(id, title, slug, category, location_name, event_date, summary)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),

      // Total phenomena count
      supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved'),

      // User streak (if table exists)
      supabase
        .from('user_streaks' as any)
        .select('current_streak, longest_streak, total_active_days')
        .eq('user_id', user.id)
        .single(),

      // User-drawn connections
      supabase
        .from('constellation_connections')
        .select('id, entry_a_id, entry_b_id, annotation, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),

      // User theories
      supabase
        .from('constellation_theories')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false }),
    ])

    const entries = entriesResult.data || []
    const totalPhenomena = totalResult.count || 592
    const streak = (streakResult as any).data
    const userConnections = (connectionsResult as any).data || []
    const userTheories = (theoriesResult as any).data || []

    // Build category engagement from logged entries
    const categoryMap: Record<string, {
      entries: number
      verdicts: Record<string, number>
      reportIds: string[]
    }> = {}

    // Collect all tags and which entries use them (for tag-based connections)
    const tagToEntries: Record<string, string[]> = {}
    const allTags = new Set<string>()

    // Build entry nodes for the constellation
    const entryNodes = entries.map((entry: any) => {
      const report = entry.report
      const cat = report?.category || 'combination'

      // Category tracking
      if (!categoryMap[cat]) {
        categoryMap[cat] = { entries: 0, verdicts: {}, reportIds: [] }
      }
      categoryMap[cat].entries++
      categoryMap[cat].verdicts[entry.verdict] = (categoryMap[cat].verdicts[entry.verdict] || 0) + 1
      categoryMap[cat].reportIds.push(entry.report_id)

      // Tag tracking
      const entryTags = entry.tags || []
      for (const tag of entryTags) {
        allTags.add(tag)
        if (!tagToEntries[tag]) tagToEntries[tag] = []
        tagToEntries[tag].push(entry.id)
      }

      return {
        id: entry.id,
        reportId: entry.report_id,
        name: report?.title || 'Unknown',
        slug: report?.slug || '',
        category: cat,
        imageUrl: report?.primary_image_url || null,
        locationName: report?.location_name || null,
        eventDate: report?.event_date || null,
        summary: report?.summary || null,
        note: entry.note || '',
        verdict: entry.verdict || 'needs_info',
        tags: entryTags,
        loggedAt: entry.created_at,
        updatedAt: entry.updated_at,
      }
    })

    // Build tag-based connections (entries that share tags)
    const tagConnections: Array<{
      tag: string
      entryIds: string[]
    }> = []

    for (const [tag, entryIds] of Object.entries(tagToEntries)) {
      if (entryIds.length > 1) {
        tagConnections.push({ tag, entryIds })
      }
    }

    // Build category stats
    const categoryStats: Record<string, {
      entries: number
      verdicts: Record<string, number>
    }> = {}
    for (const [cat, data] of Object.entries(categoryMap)) {
      categoryStats[cat] = {
        entries: data.entries,
        verdicts: data.verdicts,
      }
    }

    // Calculate explorer rank (new system: rewards depth, not just volume)
    const totalEntries = entries.length
    const categoriesExplored = Object.keys(categoryMap).length
    const uniqueTags = allTags.size
    const hasNotes = entries.filter((e: any) => e.note && e.note.trim().length > 0).length
    const connectionsFound = tagConnections.length

    // Rank system: Stargazer → Field Researcher → Pattern Seeker → Cartographer → Master Archivist
    // Updated to include theories (Phase 2)
    const theoryCount = userTheories.length
    const drawnConnections = userConnections.length
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

    // Build trail (chronological logging order)
    const trail = entries
      .slice()
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((entry: any) => ({
        entryId: entry.id,
        reportId: entry.report_id,
        category: entry.report?.category || 'combination',
        timestamp: entry.created_at,
      }))

    return res.status(200).json({
      entryNodes,
      categoryStats,
      tagConnections,
      trail,
      userConnections: userConnections.map((c: any) => ({
        id: c.id,
        entryAId: c.entry_a_id,
        entryBId: c.entry_b_id,
        annotation: c.annotation || '',
        createdAt: c.created_at,
      })),
      userTheories: userTheories.map((t: any) => ({
        id: t.id,
        title: t.title,
        thesis: t.thesis || '',
        entry_ids: t.entry_ids || [],
        connection_ids: t.connection_ids || [],
        is_public: t.is_public || false,
        created_at: t.created_at,
        updated_at: t.updated_at,
      })),
      stats: {
        totalEntries,
        totalPhenomena,
        categoriesExplored,
        totalCategories: 11,
        uniqueTags,
        notesWritten: hasNotes,
        connectionsFound,
        drawnConnections,
        theoryCount,
        currentStreak: streak?.current_streak || 0,
        longestStreak: streak?.longest_streak || 0,
        rank,
        rankLevel,
      },
    })
  } catch (err: any) {
    console.error('Constellation user-map error:', err)
    // Return empty data on error (table might not exist yet)
    return res.status(200).json({
      entryNodes: [],
      categoryStats: {},
      tagConnections: [],
      trail: [],
      stats: {
        totalEntries: 0,
        totalPhenomena: 592,
        categoriesExplored: 0,
        totalCategories: 11,
        uniqueTags: 0,
        notesWritten: 0,
        connectionsFound: 0,
        currentStreak: 0,
        longestStreak: 0,
        rank: 'Stargazer',
        rankLevel: 1,
      },
    })
  }
}
