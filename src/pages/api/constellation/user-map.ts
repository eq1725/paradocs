import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /api/constellation/user-map
 * Returns personalized constellation data for the authenticated user:
 * - Category engagement levels (how many phenomena viewed per category)
 * - Individual phenomena the user has interacted with
 * - Chronological trail of exploration
 * - Explorer rank and stats
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

    // Parallel fetch: user activity, saved reports, total phenomena count
    const [activityResult, savedResult, totalResult, streakResult] = await Promise.all([
      // User activity (views, saves)
      supabase
        .from('user_activity')
        .select('phenomenon_id, action_type, category, created_at, metadata')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(500),

      // Saved reports
      supabase
        .from('saved_reports')
        .select('report_id, created_at')
        .eq('user_id', user.id),

      // Total phenomena count
      supabase
        .from('phenomena')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),

      // User streak
      supabase
        .from('user_streaks' as any)
        .select('current_streak, longest_streak, total_active_days')
        .eq('user_id', user.id)
        .single(),
    ])

    const activities = activityResult.data || []
    const savedReports = savedResult.data || []
    const totalPhenomena = totalResult.count || 592
    const streak = (streakResult as any).data

    // Build category engagement map
    const categoryEngagement: Record<string, { views: number; saves: number; phenomena: Set<string> }> = {}
    const phenomenaViewed: Map<string, { firstViewed: string; viewCount: number; category: string }> = new Map()
    const trail: { phenomenonId: string; timestamp: string; category: string }[] = []
    const savedSet = new Set(savedReports.map((s: any) => s.report_id))

    for (const activity of activities) {
      const cat = activity.category || 'combination'

      if (!categoryEngagement[cat]) {
        categoryEngagement[cat] = { views: 0, saves: 0, phenomena: new Set() }
      }

      if (activity.action_type === 'view' && activity.phenomenon_id) {
        categoryEngagement[cat].views++
        categoryEngagement[cat].phenomena.add(activity.phenomenon_id)

        const existing = phenomenaViewed.get(activity.phenomenon_id)
        if (existing) {
          existing.viewCount++
        } else {
          phenomenaViewed.set(activity.phenomenon_id, {
            firstViewed: activity.created_at,
            viewCount: 1,
            category: cat,
          })
        }

        trail.push({
          phenomenonId: activity.phenomenon_id,
          timestamp: activity.created_at,
          category: cat,
        })
      }

      if (activity.action_type === 'save' && activity.phenomenon_id) {
        categoryEngagement[cat].saves++
      }
    }

    // Fetch phenomenon details for viewed ones
    const phenomenonIds = Array.from(phenomenaViewed.keys()).slice(0, 100)
    let phenomenaDetails: any[] = []

    if (phenomenonIds.length > 0) {
      const { data } = await supabase
        .from('phenomena')
        .select('id, name, slug, category, primary_image_url, danger_level')
        .in('id', phenomenonIds)

      phenomenaDetails = data || []
    }

    // Build phenomenon nodes with user context
    const phenomenonNodes = phenomenaDetails.map(p => {
      const userContext = phenomenaViewed.get(p.id)
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        imageUrl: p.primary_image_url,
        dangerLevel: p.danger_level,
        firstViewed: userContext?.firstViewed,
        viewCount: userContext?.viewCount || 0,
        isSaved: savedSet.has(p.id),
      }
    })

    // Calculate explorer rank
    const totalViewed = phenomenaViewed.size
    const categoriesExplored = Object.keys(categoryEngagement).length
    let rank = 'Casual Stargazer'
    let rankLevel = 1
    if (totalViewed >= 100) { rank = 'Master Cartographer'; rankLevel = 4 }
    else if (totalViewed >= 50) { rank = 'Seasoned Explorer'; rankLevel = 3 }
    else if (totalViewed >= 10) { rank = 'Amateur Astronomer'; rankLevel = 2 }

    // Serialize category engagement (convert Sets to counts)
    const categoryStats: Record<string, { views: number; saves: number; uniquePhenomena: number }> = {}
    for (const [cat, data] of Object.entries(categoryEngagement)) {
      categoryStats[cat] = {
        views: data.views,
        saves: data.saves,
        uniquePhenomena: data.phenomena.size,
      }
    }

    return res.status(200).json({
      categoryStats,
      phenomenonNodes,
      trail: trail.slice(-50), // Last 50 trail entries
      stats: {
        totalViewed,
        totalPhenomena,
        categoriesExplored,
        totalCategories: 11,
        currentStreak: streak?.current_streak || 0,
        longestStreak: streak?.longest_streak || 0,
        totalSaved: savedReports.length,
        rank,
        rankLevel,
      },
    })
  } catch (err: any) {
    console.error('Constellation user-map error:', err)
    // Return empty data on error (table might not exist yet)
    return res.status(200).json({
      categoryStats: {},
      phenomenonNodes: [],
      trail: [],
      stats: {
        totalViewed: 0,
        totalPhenomena: 592,
        categoriesExplored: 0,
        totalCategories: 11,
        currentStreak: 0,
        longestStreak: 0,
        totalSaved: 0,
        rank: 'Casual Stargazer',
        rankLevel: 1,
      },
    })
  }
}
