/**
 * API: GET /api/discover/related-cards
 *
 * Returns full FeedItemV2-shaped cards related to a given item.
 * Used by the horizontal swipe-through feature on /discover.
 *
 * Query params:
 *   - id: the item ID (required)
 *   - type: 'phenomenon' | 'report' (required)
 *
 * For phenomena: returns reports tagged with that phenomenon_type_id,
 *   plus other phenomena in the same category.
 * For reports: returns other reports in the same category (preferring
 *   same phenomenon_type), plus the associated phenomenon entry.
 *
 * Returns up to 8 related cards, each shaped like a feed-v2 item.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
var placeholderUrl = 'https://bhkbctdmwnowfmqpksed.supabase.co/storage/v1/object/public/phenomena-images/default-cryptid.jpg'

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var id = req.query.id as string
  var itemType = req.query.type as string

  if (!id || !itemType) {
    return res.status(400).json({ error: 'id and type are required' })
  }

  try {
    var supabase = getSupabase()
    var items: any[] = []

    if (itemType === 'phenomenon') {
      items = await getRelatedForPhenomenon(supabase, id)
    } else if (itemType === 'report') {
      items = await getRelatedForReport(supabase, id)
    } else {
      return res.status(400).json({ error: 'type must be phenomenon or report' })
    }

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

    return res.status(200).json({ items: items })
  } catch (error) {
    console.error('[Related Cards] Error:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      items: [],
    })
  }
}

/**
 * For a phenomenon: get experiencer reports tagged with it,
 * plus sibling phenomena in the same category.
 */
async function getRelatedForPhenomenon(supabase: any, phenomenonId: string) {
  // Get the phenomenon itself for category info
  var { data: phenomenon } = await supabase
    .from('phenomena')
    .select('id, category, name')
    .eq('id', phenomenonId)
    .single()

  if (!phenomenon) return []

  var results: any[] = []

  // 1. Reports tagged with this phenomenon
  var { data: taggedReports } = await supabase
    .from('reports')
    .select('id, title, slug, summary, category, country, city, state_province, event_date, credibility, upvotes, view_count, comment_count, has_photo_video, has_physical_evidence, content_type, location_name, source_type, source_label, created_at, phenomenon_type_id, feed_hook')
    .eq('phenomenon_type_id', phenomenonId)
    .eq('status', 'approved')
    .not('summary', 'is', null)
    .order('view_count', { ascending: false })
    .limit(5)

  if (taggedReports && taggedReports.length > 0) {
    // Fetch media for reports with photo/video
    var mediaReportIds = taggedReports.filter(function (r: any) { return r.has_photo_video }).map(function (r: any) { return r.id })
    var mediaMap: Record<string, any> = {}

    if (mediaReportIds.length > 0) {
      var { data: mediaData } = await supabase
        .from('report_media')
        .select('report_id, media_type, url, thumbnail_url, caption, is_primary')
        .in('report_id', mediaReportIds)
        .limit(mediaReportIds.length * 2)

      if (mediaData) {
        mediaData.forEach(function (m: any) {
          if (!mediaMap[m.report_id] || m.is_primary) {
            mediaMap[m.report_id] = m
          }
        })
      }
    }

    taggedReports.forEach(function (r: any) {
      var media = mediaMap[r.id]
      results.push({
        item_type: 'report',
        id: r.id,
        title: r.title,
        slug: r.slug,
        summary: r.summary,
        feed_hook: r.feed_hook || null,
        category: r.category,
        country: r.country,
        city: r.city,
        state_province: r.state_province,
        event_date: r.event_date,
        credibility: r.credibility,
        upvotes: r.upvotes,
        view_count: r.view_count,
        comment_count: r.comment_count,
        has_photo_video: r.has_photo_video,
        has_physical_evidence: r.has_physical_evidence,
        content_type: r.content_type,
        location_name: r.location_name,
        source_type: r.source_type,
        source_label: r.source_label,
        created_at: r.created_at,
        phenomenon_type: { name: phenomenon.name, slug: '', category: phenomenon.category },
        primary_media: media ? {
          type: media.media_type,
          url: media.url,
          thumbnail_url: media.thumbnail_url,
          caption: media.caption,
        } : null,
        associated_image_url: null,
        associated_image_source: null,
      })
    })
  }

  // 2. Sibling phenomena in the same category (excluding self)
  var { data: siblings } = await supabase
    .from('phenomena')
    .select('id, name, slug, category, icon, ai_summary, ai_description, ai_quick_facts, primary_image_url, report_count, primary_regions, first_reported_date, aliases')
    .eq('category', phenomenon.category)
    .eq('status', 'active')
    .neq('id', phenomenonId)
    .not('ai_summary', 'is', null)
    .order('report_count', { ascending: false })
    .limit(4)

  if (siblings) {
    siblings.forEach(function (p: any) {
      results.push({
        item_type: 'phenomenon',
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        icon: p.icon,
        ai_summary: p.ai_summary,
        ai_description: p.ai_description,
        ai_quick_facts: p.ai_quick_facts,
        primary_image_url: p.primary_image_url,
        report_count: p.report_count,
        primary_regions: p.primary_regions,
        first_reported_date: p.first_reported_date,
        aliases: p.aliases,
      })
    })
  }

  return results.slice(0, 8)
}

/**
 * For a report: get the associated phenomenon (if any),
 * other reports in the same category, and reports tagged
 * with the same phenomenon_type.
 */
async function getRelatedForReport(supabase: any, reportId: string) {
  // Get the report itself
  var { data: report } = await supabase
    .from('reports')
    .select('id, category, phenomenon_type_id')
    .eq('id', reportId)
    .single()

  if (!report) return []

  var results: any[] = []
  var seenIds: Record<string, boolean> = {}
  seenIds[reportId] = true

  // 1. If linked to a phenomenon, include that phenomenon entry
  if (report.phenomenon_type_id) {
    var { data: phen } = await supabase
      .from('phenomena')
      .select('id, name, slug, category, icon, ai_summary, ai_description, ai_quick_facts, primary_image_url, report_count, primary_regions, first_reported_date, aliases')
      .eq('id', report.phenomenon_type_id)
      .single()

    if (phen) {
      seenIds[phen.id] = true
      results.push({
        item_type: 'phenomenon',
        id: phen.id,
        name: phen.name,
        slug: phen.slug,
        category: phen.category,
        icon: phen.icon,
        ai_summary: phen.ai_summary,
        ai_description: phen.ai_description,
        ai_quick_facts: phen.ai_quick_facts,
        primary_image_url: phen.primary_image_url,
        report_count: phen.report_count,
        primary_regions: phen.primary_regions,
        first_reported_date: phen.first_reported_date,
        aliases: phen.aliases,
      })
    }

    // 2. Other reports tagged with the same phenomenon
    var { data: siblingReports } = await supabase
      .from('reports')
      .select('id, title, slug, summary, category, country, city, state_province, event_date, credibility, upvotes, view_count, comment_count, has_photo_video, has_physical_evidence, content_type, location_name, source_type, source_label, created_at, phenomenon_type_id, feed_hook')
      .eq('phenomenon_type_id', report.phenomenon_type_id)
      .eq('status', 'approved')
      .neq('id', reportId)
      .not('summary', 'is', null)
      .order('view_count', { ascending: false })
      .limit(4)

    if (siblingReports) {
      var sibMediaIds = siblingReports.filter(function (r: any) { return r.has_photo_video }).map(function (r: any) { return r.id })
      var sibMediaMap: Record<string, any> = {}

      if (sibMediaIds.length > 0) {
        var { data: sibMedia } = await supabase
          .from('report_media')
          .select('report_id, media_type, url, thumbnail_url, caption, is_primary')
          .in('report_id', sibMediaIds)
          .limit(sibMediaIds.length * 2)

        if (sibMedia) {
          sibMedia.forEach(function (m: any) {
            if (!sibMediaMap[m.report_id] || m.is_primary) {
              sibMediaMap[m.report_id] = m
            }
          })
        }
      }

      siblingReports.forEach(function (r: any) {
        if (seenIds[r.id]) return
        seenIds[r.id] = true
        var media = sibMediaMap[r.id]
        results.push({
          item_type: 'report',
          id: r.id,
          title: r.title,
          slug: r.slug,
          summary: r.summary,
          feed_hook: r.feed_hook || null,
          category: r.category,
          country: r.country,
          city: r.city,
          state_province: r.state_province,
          event_date: r.event_date,
          credibility: r.credibility,
          upvotes: r.upvotes,
          view_count: r.view_count,
          comment_count: r.comment_count,
          has_photo_video: r.has_photo_video,
          has_physical_evidence: r.has_physical_evidence,
          content_type: r.content_type,
          location_name: r.location_name,
          source_type: r.source_type,
          source_label: r.source_label,
          created_at: r.created_at,
          phenomenon_type: phen ? { name: phen.name, slug: phen.slug, category: phen.category } : null,
          primary_media: media ? {
            type: media.media_type,
            url: media.url,
            thumbnail_url: media.thumbnail_url,
            caption: media.caption,
          } : null,
          associated_image_url: null,
          associated_image_source: null,
        })
      })
    }
  }

  // 3. Fill remaining with same-category reports
  var remaining = 8 - results.length
  if (remaining > 0) {
    var excludeIds = Object.keys(seenIds)
    var { data: catReports } = await supabase
      .from('reports')
      .select('id, title, slug, summary, category, country, city, state_province, event_date, credibility, upvotes, view_count, comment_count, has_photo_video, has_physical_evidence, content_type, location_name, source_type, source_label, created_at, phenomenon_type_id, feed_hook')
      .eq('category', report.category)
      .eq('status', 'approved')
      .not('id', 'in', '(' + excludeIds.join(',') + ')')
      .not('summary', 'is', null)
      .order('view_count', { ascending: false })
      .limit(remaining)

    if (catReports) {
      // Resolve phenomenon info for these reports
      var ptIds = catReports.filter(function (r: any) { return r.phenomenon_type_id }).map(function (r: any) { return r.phenomenon_type_id })
      var ptMap: Record<string, any> = {}

      if (ptIds.length > 0) {
        var { data: ptData } = await supabase
          .from('phenomena')
          .select('id, name, slug, category, primary_image_url')
          .in('id', ptIds)

        if (ptData) {
          ptData.forEach(function (pt: any) { ptMap[pt.id] = pt })
        }
      }

      // Fetch media
      var catMediaIds = catReports.filter(function (r: any) { return r.has_photo_video }).map(function (r: any) { return r.id })
      var catMediaMap: Record<string, any> = {}

      if (catMediaIds.length > 0) {
        var { data: catMedia } = await supabase
          .from('report_media')
          .select('report_id, media_type, url, thumbnail_url, caption, is_primary')
          .in('report_id', catMediaIds)
          .limit(catMediaIds.length * 2)

        if (catMedia) {
          catMedia.forEach(function (m: any) {
            if (!catMediaMap[m.report_id] || m.is_primary) {
              catMediaMap[m.report_id] = m
            }
          })
        }
      }

      catReports.forEach(function (r: any) {
        if (seenIds[r.id]) return
        seenIds[r.id] = true
        var pt = r.phenomenon_type_id ? ptMap[r.phenomenon_type_id] : null
        var media = catMediaMap[r.id]
        results.push({
          item_type: 'report',
          id: r.id,
          title: r.title,
          slug: r.slug,
          summary: r.summary,
          feed_hook: r.feed_hook || null,
          category: r.category,
          country: r.country,
          city: r.city,
          state_province: r.state_province,
          event_date: r.event_date,
          credibility: r.credibility,
          upvotes: r.upvotes,
          view_count: r.view_count,
          comment_count: r.comment_count,
          has_photo_video: r.has_photo_video,
          has_physical_evidence: r.has_physical_evidence,
          content_type: r.content_type,
          location_name: r.location_name,
          source_type: r.source_type,
          source_label: r.source_label,
          created_at: r.created_at,
          phenomenon_type: pt ? { name: pt.name, slug: pt.slug, category: pt.category } : null,
          primary_media: media ? {
            type: media.media_type,
            url: media.url,
            thumbnail_url: media.thumbnail_url,
            caption: media.caption,
          } : null,
          associated_image_url: pt && !r.has_photo_video && pt.primary_image_url && pt.primary_image_url !== placeholderUrl
            ? pt.primary_image_url : null,
          associated_image_source: pt && !r.has_photo_video && pt.primary_image_url && pt.primary_image_url !== placeholderUrl
            ? pt.name : null,
        })
      })
    }
  }

  return results.slice(0, 8)
}
