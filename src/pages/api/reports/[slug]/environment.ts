/**
 * Environmental Context API
 *
 * Returns astronomical and environmental data for a report's date/time
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getEnvironmentalContext } from '@/lib/services/astronomical.service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { slug } = req.query

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Report slug is required' })
  }

  try {
    // Get report data including metadata for field-research sources
    const { data: report, error } = await supabase
      .from('reports')
      .select('id, event_date, event_time, latitude, longitude, source_type, category, metadata, tags, description')
      .eq('slug', slug)
      .eq('status', 'approved')
      .single()

    if (error || !report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // For cryptid/field-research reports, return terrain/field context from metadata
    // instead of astronomical data. BFRO and similar sources store ENVIRONMENT
    // and TIME AND CONDITIONS sections in metadata. Also used when no event_date.
    var isCryptidCategory = (report as any).category === 'cryptids'
    var isFieldResearchSource = ['bfro'].indexOf((report as any).source_type) !== -1
    if (!report.event_date || isCryptidCategory || isFieldResearchSource) {
      const meta = (report as any).metadata || {}
      const tags = (report as any).tags || []
      const desc = ((report as any).description || '').toLowerCase()

      // Extract terrain tags from the report's tag array
      var terrainTags: string[] = []
      var terrainKeywords = ['forest', 'mountainous', 'swamp', 'near-water', 'remote', 'residential', 'rural']
      for (var i = 0; i < terrainKeywords.length; i++) {
        if (tags.indexOf(terrainKeywords[i]) !== -1) terrainTags.push(terrainKeywords[i])
      }

      // Extract time-of-day from event_time (24-hour DB field), metadata, or tags
      var timeOfDay = 'Unknown'

      // First priority: use the stored event_time (24-hour format like "15:45")
      if (report.event_time) {
        var etMatch = report.event_time.match(/^(\d{1,2}):(\d{2})/)
        if (etMatch) {
          var etHour = parseInt(etMatch[1], 10)
          if (etHour >= 5 && etHour < 8) timeOfDay = 'Dawn/Morning'
          else if (etHour >= 8 && etHour < 12) timeOfDay = 'Morning'
          else if (etHour >= 12 && etHour < 14) timeOfDay = 'Afternoon'
          else if (etHour >= 14 && etHour < 17) timeOfDay = 'Afternoon'
          else if (etHour >= 17 && etHour < 20) timeOfDay = 'Dusk/Evening'
          else if (etHour >= 20 || etHour < 5) timeOfDay = 'Night'
        }
      }

      // Fallback: check tags and metadata keywords
      if (timeOfDay === 'Unknown') {
        if (tags.indexOf('night') !== -1) timeOfDay = 'Night'
        else if (tags.indexOf('day') !== -1) timeOfDay = 'Day'
        if (meta.timeAndConditions) {
          var tcLower = meta.timeAndConditions.toLowerCase()
          // Try parsing a numeric time from conditions text
          var tcTimeMatch = tcLower.match(/(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/)
          if (tcTimeMatch) {
            var tcHour = parseInt(tcTimeMatch[1], 10)
            var tcMeridiem = (tcTimeMatch[3] || '').replace(/\./g, '')
            if (tcMeridiem === 'pm' && tcHour < 12) tcHour = tcHour + 12
            else if (tcMeridiem === 'am' && tcHour === 12) tcHour = 0
            else if (!tcMeridiem) {
              // Infer from context: "sunny" = daytime, "dark" = night
              var isDayCtx = /\b(sunny|daylight|clear sky|partly cloudy|overcast|bright)\b/.test(tcLower)
              var isNightCtx = /\b(dark|stars|moon|pitch black)\b/.test(tcLower)
              if (isDayCtx && tcHour >= 1 && tcHour <= 6) tcHour = tcHour + 12
              else if (isNightCtx && tcHour >= 7 && tcHour <= 11) tcHour = tcHour + 12
              else if (!isDayCtx && !isNightCtx && tcHour >= 1 && tcHour <= 6) tcHour = tcHour + 12
            }
            if (tcHour >= 5 && tcHour < 8) timeOfDay = 'Dawn/Morning'
            else if (tcHour >= 8 && tcHour < 12) timeOfDay = 'Morning'
            else if (tcHour >= 12 && tcHour < 17) timeOfDay = 'Afternoon'
            else if (tcHour >= 17 && tcHour < 20) timeOfDay = 'Dusk/Evening'
            else if (tcHour >= 20 || tcHour < 5) timeOfDay = 'Night'
          }
          // If still unknown, try keyword matching
          if (timeOfDay === 'Unknown' || timeOfDay === 'Day') {
            if (/\b(dusk|sunset|evening)\b/.test(tcLower)) timeOfDay = 'Dusk/Evening'
            else if (/\b(dawn|sunrise|morning)\b/.test(tcLower)) timeOfDay = 'Dawn/Morning'
            else if (/\b(night|midnight|dark)\b/.test(tcLower)) timeOfDay = 'Night'
            else if (/\b(afternoon|midday|noon)\b/.test(tcLower)) timeOfDay = 'Afternoon'
          }
        }
      }

      // Extract season from description or time/conditions
      var season = 'Unknown'
      var seasonText = (meta.timeAndConditions || '') + ' ' + desc
      if (/\b(summer|june|july|august)\b/i.test(seasonText)) season = 'Summer'
      else if (/\b(winter|december|january|february|snow)\b/i.test(seasonText)) season = 'Winter'
      else if (/\b(spring|march|april|may)\b/i.test(seasonText)) season = 'Spring'
      else if (/\b(fall|autumn|september|october|november)\b/i.test(seasonText)) season = 'Fall'

      // Determine activity context from description
      var activityTags: string[] = []
      var activityKeywords = ['camping', 'hunting', 'hiking', 'driving', 'fishing']
      for (var j = 0; j < activityKeywords.length; j++) {
        if (tags.indexOf(activityKeywords[j]) !== -1) activityTags.push(activityKeywords[j])
      }

      return res.status(200).json({
        reportId: report.id,
        eventDate: null,
        eventTime: report.event_time,
        dataAvailable: false,
        // Field context available even without a date
        fieldContextAvailable: !!(meta.environment || meta.timeAndConditions || terrainTags.length > 0),
        fieldContext: {
          environment: meta.environment || null,
          timeAndConditions: meta.timeAndConditions || null,
          terrainTags: terrainTags,
          activityTags: activityTags,
          timeOfDay: timeOfDay,
          season: season,
          category: (report as any).category,
        },
        reason: 'No event date available — showing field context instead'
      })
    }

    // Use actual latitude if available; pass null if no coordinates
    // so the service can indicate location-dependent data is unavailable
    const latitude = report.latitude || null
    const context = getEnvironmentalContext(
      report.event_date,
      report.event_time,
      latitude
    )

    return res.status(200).json({
      reportId: report.id,
      eventDate: report.event_date,
      eventTime: report.event_time,
      dataAvailable: true,
      coordinatesAvailable: !!(report.latitude && report.longitude),
      ...context
    })
  } catch (error) {
    console.error('Error fetching environmental context:', error)
    return res.status(500).json({ error: 'Failed to fetch environmental context' })
  }
}
