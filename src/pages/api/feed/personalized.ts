import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface FeedSection {
  id: string
  title: string
  subtitle?: string
  reports: any[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    var authHeader = req.headers.authorization
    var userId: string | null = null
    var userInterests: string[] = []
    var userLocation: { lat: number; lng: number } | null = null
    var savedReportIds: string[] = []

    // Get user data if authenticated
    if (authHeader) {
      var token = authHeader.replace('Bearer ', '')
      var { data: { user } } = await supabase.auth.getUser(token)
      if (user) {
        userId = user.id

        // Get personalization
        var { data: prefs } = await supabase
          .from('user_personalization')
          .select('interested_categories, location_latitude, location_longitude')
          .eq('user_id', userId)
          .single()

        if (prefs) {
          userInterests = prefs.interested_categories || []
          if (prefs.location_latitude && prefs.location_longitude) {
            userLocation = { lat: prefs.location_latitude, lng: prefs.location_longitude }
          }
        }

        // Get saved report IDs
        var { data: saves } = await supabase
          .from('saved_reports')
          .select('report_id')
          .eq('user_id', userId)
          .limit(10)

        savedReportIds = saves?.map(function(s) { return s.report_id }) || []
      }
    }

    var sections: FeedSection[] = []

    // 1. "For You" - personalized based on interests
    if (userInterests.length > 0) {
      var { data: forYou } = await supabase
        .from('reports')
        .select('id, title, slug, summary, category, country, city, state_province, event_date, credibility, upvotes, view_count, comment_count, created_at, phenomenon_type:phenomenon_types(name, category, slug)')
        .eq('status', 'approved')
        .in('category', userInterests)
        .order('created_at', { ascending: false })
        .limit(8)

      if (forYou && forYou.length > 0) {
        sections.push({
          id: 'for_you',
          title: 'For You',
          subtitle: 'Based on your interests',
          reports: forYou
        })
      }
    }

    // 2. "Trending This Week" - most viewed/reacted in last 7 days
    var weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    var { data: trending } = await supabase
      .from('reports')
      .select('id, title, slug, summary, category, country, city, state_province, event_date, credibility, upvotes, view_count, comment_count, created_at, phenomenon_type:phenomenon_types(name, category, slug)')
      .eq('status', 'approved')
      .gte('created_at', weekAgo.toISOString())
      .order('view_count', { ascending: false })
      .limit(8)

    // If not enough recent, fallback to all-time popular
    if (!trending || trending.length < 3) {
      var { data: popular } = await supabase
        .from('reports')
        .select('id, title, slug, summary, category, country, city, state_province, event_date, credibility, upvotes, view_count, comment_count, created_at, phenomenon_type:phenomenon_types(name, category, slug)')
        .eq('status', 'approved')
        .order('view_count', { ascending: false })
        .limit(8)

      if (popular && popular.length > 0) {
        sections.push({
          id: 'trending',
          title: 'Trending',
          subtitle: 'Most popular reports',
          reports: popular
        })
      }
    } else {
      sections.push({
        id: 'trending',
        title: 'Trending This Week',
        subtitle: 'Most viewed in the last 7 days',
        reports: trending
      })
    }

    // 3. "Near You" - geo-filtered if location available
    if (userLocation) {
      // Simple bounding box: ~100 miles = ~1.5 degrees
      var latRange = 1.5
      var lngRange = 1.5

      var { data: nearby } = await supabase
        .from('reports')
        .select('id, title, slug, summary, category, country, city, state_province, event_date, credibility, upvotes, view_count, created_at, latitude, longitude, phenomenon_type:phenomenon_types(name, category, slug)')
        .eq('status', 'approved')
        .gte('latitude', userLocation.lat - latRange)
        .lte('latitude', userLocation.lat + latRange)
        .gte('longitude', userLocation.lng - lngRange)
        .lte('longitude', userLocation.lng + lngRange)
        .order('created_at', { ascending: false })
        .limit(8)

      if (nearby && nearby.length > 0) {
        sections.push({
          id: 'near_you',
          title: 'Near You',
          subtitle: 'Reports from your area',
          reports: nearby
        })
      }
    }

    // 4. "Because You Saved" - related to saved reports
    if (savedReportIds.length > 0) {
      var { data: savedReports } = await supabase
        .from('reports')
        .select('phenomenon_type_id')
        .in('id', savedReportIds)

      var phenIds = savedReports?.map(function(r) { return r.phenomenon_type_id }).filter(Boolean) || []
      var uniquePhenIds = phenIds.filter(function(id, index) { return phenIds.indexOf(id) === index })

      if (uniquePhenIds.length > 0) {
        var { data: related } = await supabase
          .from('reports')
          .select('id, title, slug, summary, category, country, city, state_province, event_date, credibility, upvotes, view_count, created_at, phenomenon_type:phenomenon_types(name, category, slug)')
          .eq('status', 'approved')
          .in('phenomenon_type_id', uniquePhenIds)
          .not('id', 'in', '(' + savedReportIds.join(',') + ')')
          .order('created_at', { ascending: false })
          .limit(8)

        if (related && related.length > 0) {
          sections.push({
            id: 'because_saved',
            title: 'Because You Saved',
            subtitle: 'Related to your bookmarks',
            reports: related
          })
        }
      }
    }

    // 5. "Recently Added" - newest reports
    var { data: recent } = await supabase
      .from('reports')
      .select('id, title, slug, summary, category, country, city, state_province, event_date, credibility, upvotes, view_count, comment_count, created_at, phenomenon_type:phenomenon_types(name, category, slug)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(8)

    if (recent && recent.length > 0) {
      sections.push({
        id: 'recent',
        title: 'Recently Added',
        subtitle: 'Fresh reports from the field',
        reports: recent
      })
    }

    return res.status(200).json({ sections: sections })
  } catch (error) {
    console.error('Feed error:', error)
    return res.status(500).json({ error: 'Failed to generate feed' })
  }
}
