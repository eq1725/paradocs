import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface FeedSection {
  id: string
  title: string
  subtitle?: string
  type: 'reports' | 'phenomena' | 'mixed'
  reports?: any[]
  phenomena?: any[]
}

// Shared select fields for reports — includes everything needed for rich cards
var REPORT_SELECT = [
  'id', 'title', 'slug', 'summary', 'category', 'country', 'city',
  'state_province', 'event_date', 'credibility', 'upvotes', 'view_count',
  'comment_count', 'created_at', 'location_name', 'source_type', 'source_label',
  'has_photo_video', 'has_physical_evidence', 'content_type'
].join(', ')

var REPORT_SELECT_WITH_PHENOMENA = REPORT_SELECT + ', phenomenon_type:phenomena!reports_phenomenon_type_id_fkey(name, category, slug)'

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
      var { data: authData } = await supabase.auth.getUser(token)
      if (authData && authData.user) {
        userId = authData.user.id

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

        savedReportIds = (saves || []).map(function(s) { return s.report_id })
      }
    }

    var sections: FeedSection[] = []

    // === SECTION 1: Encyclopedia Spotlight (everyone sees this) ===
    // Show richly-enriched phenomena with images — the "wow" factor
    var placeholderUrl = 'https://bhkbctdmwnowfmqpksed.supabase.co/storage/v1/object/public/phenomena-images/default-cryptid.jpg'

    var { data: spotlightPhenomena } = await supabase
      .from('phenomena')
      .select('id, name, slug, category, icon, ai_summary, ai_quick_facts, primary_image_url, report_count, aliases')
      .eq('status', 'active')
      .not('ai_summary', 'is', null)
      .not('primary_image_url', 'is', null)
      .neq('primary_image_url', placeholderUrl)
      .order('report_count', { ascending: false })
      .limit(8)

    if (spotlightPhenomena && spotlightPhenomena.length > 0) {
      sections.push({
        id: 'spotlight',
        title: 'Encyclopedia Spotlight',
        subtitle: 'Dive into the world\u2019s most documented phenomena',
        type: 'phenomena',
        phenomena: spotlightPhenomena
      })
    }

    // === SECTION 2: "For You" (authenticated users with interests) ===
    if (userInterests.length > 0) {
      var { data: forYou } = await supabase
        .from('reports')
        .select(REPORT_SELECT_WITH_PHENOMENA)
        .eq('status', 'approved')
        .in('category', userInterests)
        .order('created_at', { ascending: false })
        .limit(8)

      if (forYou && forYou.length > 0) {
        sections.push({
          id: 'for_you',
          title: 'For You',
          subtitle: 'Based on your interests',
          type: 'reports',
          reports: forYou
        })
      }
    }

    // === SECTION 3: "Trending" (everyone) ===
    var weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    var { data: trending } = await supabase
      .from('reports')
      .select(REPORT_SELECT_WITH_PHENOMENA)
      .eq('status', 'approved')
      .gte('created_at', weekAgo.toISOString())
      .order('view_count', { ascending: false })
      .limit(8)

    // If not enough recent, fallback to all-time popular
    if (!trending || trending.length < 3) {
      var { data: popular } = await supabase
        .from('reports')
        .select(REPORT_SELECT_WITH_PHENOMENA)
        .eq('status', 'approved')
        .order('view_count', { ascending: false })
        .limit(8)

      sections.push({
        id: 'trending',
        title: 'Most Popular',
        subtitle: 'The reports people keep coming back to',
        type: 'reports',
        reports: popular || []
      })
    } else {
      sections.push({
        id: 'trending',
        title: 'Trending This Week',
        subtitle: 'Most viewed in the last 7 days',
        type: 'reports',
        reports: trending
      })
    }

    // === SECTION 4: Category highlights (everyone — rotate through categories) ===
    // Pick 2-3 interesting category sections based on what has the most content
    var categoryOrder = [
      { key: 'cryptids', title: 'Cryptid Encounters', subtitle: 'Bigfoot, Mothman, and creatures beyond explanation' },
      { key: 'ufos_aliens', title: 'UFO & Alien Reports', subtitle: 'Lights in the sky and close encounters' },
      { key: 'ghosts_hauntings', title: 'Ghost Stories & Hauntings', subtitle: 'Spirits, apparitions, and haunted places' },
      { key: 'psychological_experiences', title: 'Unexplained Experiences', subtitle: 'NDEs, sleep paralysis, and the edges of consciousness' },
      { key: 'consciousness_practices', title: 'Consciousness & Beyond', subtitle: 'Astral projection, meditation, and altered states' },
    ]

    // Use the day of the year to rotate which categories we show (variety for return visitors)
    var dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000)
    var startIdx = dayOfYear % categoryOrder.length
    var categoriesToShow = []
    for (var ci = 0; ci < 2; ci++) {
      categoriesToShow.push(categoryOrder[(startIdx + ci) % categoryOrder.length])
    }

    for (var catIdx = 0; catIdx < categoriesToShow.length; catIdx++) {
      var cat = categoriesToShow[catIdx]
      var { data: catReports } = await supabase
        .from('reports')
        .select(REPORT_SELECT_WITH_PHENOMENA)
        .eq('status', 'approved')
        .eq('category', cat.key)
        .order('upvotes', { ascending: false })
        .limit(6)

      if (catReports && catReports.length >= 2) {
        sections.push({
          id: 'category_' + cat.key,
          title: cat.title,
          subtitle: cat.subtitle,
          type: 'reports',
          reports: catReports
        })
      }
    }

    // === SECTION 5: "Near You" (authenticated with location) ===
    if (userLocation) {
      var latRange = 1.5
      var lngRange = 1.5
      var { data: nearby } = await supabase
        .from('reports')
        .select(REPORT_SELECT_WITH_PHENOMENA + ', latitude, longitude')
        .eq('status', 'approved')
        .gte('latitude', userLocation.lat - latRange)
        .lte('latitude', userLocation.lat + latRange)
        .gte('longitude', userLocation.lng - lngRange)
        .lte('longitude', userLocation.lng + lngRange)
        .order('created_at', { ascending: false })
        .limit(6)

      if (nearby && nearby.length > 0) {
        sections.push({
          id: 'near_you',
          title: 'Near You',
          subtitle: 'Reports from your area',
          type: 'reports',
          reports: nearby
        })
      }
    }

    // === SECTION 6: "Because You Saved" (authenticated with saves) ===
    if (savedReportIds.length > 0) {
      var { data: savedReports } = await supabase
        .from('reports')
        .select('phenomenon_type_id')
        .eq('status', 'approved')
        .in('id', savedReportIds)

      var phenIds = []
      var seen: Record<string, boolean> = {}
      if (savedReports) {
        for (var si = 0; si < savedReports.length; si++) {
          var pid = savedReports[si].phenomenon_type_id
          if (pid && !seen[pid]) {
            seen[pid] = true
            phenIds.push(pid)
          }
        }
      }

      if (phenIds.length > 0) {
        var { data: related } = await supabase
          .from('reports')
          .select(REPORT_SELECT_WITH_PHENOMENA)
          .eq('status', 'approved')
          .in('phenomenon_type_id', phenIds)
          .not('id', 'in', '(' + savedReportIds.join(',') + ')')
          .order('created_at', { ascending: false })
          .limit(6)

        if (related && related.length > 0) {
          sections.push({
            id: 'because_saved',
            title: 'Because You Saved',
            subtitle: 'Related to your bookmarks',
            type: 'reports',
            reports: related
          })
        }
      }
    }

    // === SECTION 7: "Recently Added" (everyone) ===
    var { data: recent } = await supabase
      .from('reports')
      .select(REPORT_SELECT_WITH_PHENOMENA)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(8)

    if (recent && recent.length > 0) {
      sections.push({
        id: 'recent',
        title: 'Recently Added',
        subtitle: 'Fresh reports from the field',
        type: 'reports',
        reports: recent
      })
    }

    // Cache for 60s for anonymous, 30s for authenticated
    if (!userId) {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
    } else {
      res.setHeader('Cache-Control', 'private, max-age=30')
    }

    return res.status(200).json({ sections: sections })
  } catch (error) {
    console.error('Feed error:', error)
    return res.status(500).json({ error: 'Failed to generate feed' })
  }
}
