/**
 * API: POST /api/admin/generate-connections
 *
 * Batch job to generate connections between reports.
 * Analyzes reports for geographic, temporal, characteristic, and
 * cross-phenomenon correlations.
 *
 * Key improvements over v1:
 * - Skips same-case connections (same case_group) — those are obvious
 * - Generates unique, specific explanations per connection (not boilerplate)
 * - Fixes grammar ("0 day(s)" → "the same day")
 * - Prioritizes cross-category links (most surprising to users)
 * - Uses miles for distance descriptions (US audience)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

var MAX_REPORTS_PER_RUN = 50;
var MAX_CONNECTIONS_PER_REPORT = 8;
var MIN_STRENGTH_THRESHOLD = 0.4;
var KM_TO_MI = 0.621371;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var authHeader = req.headers.authorization;
  var cronSecret = process.env.CRON_SECRET;

  // Allow admin auth OR cron secret
  var authorized = false;
  if (cronSecret && authHeader === 'Bearer ' + cronSecret) {
    authorized = true;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    var token = authHeader.replace('Bearer ', '');
    var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    var anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    var { createClient } = await import('@supabase/supabase-js');
    var userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: 'Bearer ' + token } }
    });
    var { data: userData } = await userClient.auth.getUser();
    if (userData?.user?.email === 'williamschaseh@gmail.com') {
      authorized = true;
    }
  }

  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    var supabase = createServerClient();
    var stats = { processed: 0, connections_created: 0, skipped_same_case: 0, errors: 0 };

    // Optional: process specific slug
    var targetSlug = req.query.slug as string | undefined;

    var query = supabase
      .from('reports')
      .select('id, title, slug, category, description, location_name, latitude, longitude, event_date, tags, case_group')
      .eq('status', 'approved');

    if (targetSlug) {
      query = query.eq('slug', targetSlug);
    } else {
      var sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query
        .or('connections_last_analyzed.is.null,connections_last_analyzed.lt.' + sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(MAX_REPORTS_PER_RUN);
    }

    var reportsResult = await query;

    if (reportsResult.error) {
      console.error('Error fetching reports:', reportsResult.error);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }

    var reports = reportsResult.data || [];
    if (reports.length === 0) {
      return res.status(200).json({ message: 'No reports to process', stats: stats });
    }

    for (var i = 0; i < reports.length; i++) {
      try {
        var result = await processReportConnections(supabase, reports[i]);
        stats.processed++;
        stats.connections_created += result.created;
        stats.skipped_same_case += result.skippedSameCase;
      } catch (err) {
        console.error('Error processing report ' + reports[i].id + ':', err);
        stats.errors++;
      }
    }

    return res.status(200).json({ message: 'Connection generation complete', stats: stats });
  } catch (error) {
    console.error('Generate connections error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function processReportConnections(supabase: any, report: any): Promise<{ created: number; skippedSameCase: number }> {
  var skippedSameCase = 0;

  // Strategy 1: Geographic proximity (within 100km / ~62mi)
  var geoCandidates: any[] = [];
  if (report.latitude && report.longitude) {
    var latRange = 100 / 111;
    var lngRange = 100 / (111 * Math.cos(report.latitude * Math.PI / 180));
    var geoResult = await supabase
      .from('reports')
      .select('id, title, slug, category, description, location_name, latitude, longitude, event_date, tags, case_group')
      .neq('id', report.id)
      .eq('status', 'approved')
      .not('latitude', 'is', null)
      .gte('latitude', report.latitude - latRange)
      .lte('latitude', report.latitude + latRange)
      .gte('longitude', report.longitude - lngRange)
      .lte('longitude', report.longitude + lngRange)
      .limit(20);
    geoCandidates = geoResult.data || [];
  }

  // Strategy 2: Same category, within 30 days of event_date
  var temporalCandidates: any[] = [];
  if (report.event_date) {
    var eventDate = new Date(report.event_date);
    var thirtyBefore = new Date(eventDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var thirtyAfter = new Date(eventDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var tempResult = await supabase
      .from('reports')
      .select('id, title, slug, category, description, location_name, latitude, longitude, event_date, tags, case_group')
      .neq('id', report.id)
      .eq('status', 'approved')
      .eq('category', report.category)
      .gte('event_date', thirtyBefore)
      .lte('event_date', thirtyAfter)
      .limit(20);
    temporalCandidates = tempResult.data || [];
  }

  // Strategy 3: Cross-category with shared tags (most valuable for "Did You Know?")
  var crossCandidates: any[] = [];
  var reportTags = report.tags || [];
  if (reportTags.length > 0) {
    var tagResult = await supabase
      .from('reports')
      .select('id, title, slug, category, description, location_name, latitude, longitude, event_date, tags, case_group')
      .neq('id', report.id)
      .neq('category', report.category)
      .eq('status', 'approved')
      .overlaps('tags', reportTags)
      .limit(15);
    crossCandidates = tagResult.data || [];
  }

  // Deduplicate candidates and filter out same-case reports
  var seen = new Set<string>();
  seen.add(report.id);
  var allCandidates: any[] = [];

  var addCandidates = function(candidates: any[], source: string) {
    for (var j = 0; j < candidates.length; j++) {
      var c = candidates[j];
      if (seen.has(c.id)) continue;
      seen.add(c.id);

      // Skip same case_group — those are obvious, not "Did You Know?" material
      if (report.case_group && c.case_group && report.case_group === c.case_group) {
        skippedSameCase++;
        continue;
      }

      allCandidates.push({ report: c, source: source });
    }
  };

  // Add cross-phenomenon first (highest priority for surprising connections)
  addCandidates(crossCandidates, 'cross_phenomenon');
  addCandidates(geoCandidates, 'geographic');
  addCandidates(temporalCandidates, 'temporal');

  if (allCandidates.length === 0) {
    await supabase
      .from('reports')
      .update({ connections_last_analyzed: new Date().toISOString() })
      .eq('id', report.id);
    return { created: 0, skippedSameCase: skippedSameCase };
  }

  // Score and generate unique explanations
  var connections = scoreConnections(report, allCandidates);
  var topConnections = connections
    .filter(function(c: any) { return c.strength >= MIN_STRENGTH_THRESHOLD; })
    .slice(0, MAX_CONNECTIONS_PER_REPORT);

  if (topConnections.length > 0) {
    // Delete existing connections for this report
    await (supabase
      .from('report_connections') as any)
      .delete()
      .or('source_report_id.eq.' + report.id + ',target_report_id.eq.' + report.id);

    var inserts = topConnections.map(function(conn: any) {
      return {
        source_report_id: report.id,
        target_report_id: conn.targetId,
        connection_type: conn.type,
        connection_strength: conn.strength,
        ai_explanation: conn.explanation,
        fun_fact: conn.funFact
      };
    });

    await (supabase
      .from('report_connections') as any)
      .insert(inserts);
  }

  await supabase
    .from('reports')
    .update({ connections_last_analyzed: new Date().toISOString() })
    .eq('id', report.id);

  return { created: topConnections.length, skippedSameCase: skippedSameCase };
}

function scoreConnections(sourceReport: any, candidates: any[]) {
  var results: any[] = [];

  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i].report;
    var source = candidates[i].source;
    var strength = 0;
    var type = source;
    var explanation = '';
    var funFact: string | null = null;

    // ─── Geographic scoring ────────────────────────────────────
    if (source === 'geographic' && sourceReport.latitude && candidate.latitude) {
      var distKm = haversineDistance(
        sourceReport.latitude, sourceReport.longitude,
        candidate.latitude, candidate.longitude
      );
      var distMi = Math.round(distKm * KM_TO_MI);

      // Build specific explanation with actual location names
      var sourceLoc = sourceReport.location_name || sourceReport.state_province || 'this location';
      var candLoc = candidate.location_name || candidate.state_province || 'nearby';

      if (distKm < 10) {
        strength = 0.9;
        explanation = 'Occurred less than ' + Math.max(distMi, 1) + ' mile' + (distMi !== 1 ? 's' : '') + ' from ' + candLoc;
      } else if (distKm < 30) {
        strength = 0.7;
        explanation = 'Reported roughly ' + distMi + ' miles from ' + candLoc;
      } else if (distKm < 100) {
        strength = 0.5;
        explanation = 'Both occurred in the broader ' + (sourceReport.state_province || 'same region') + ' area, about ' + distMi + ' miles apart';
      }

      // Add temporal context if dates are available
      if (sourceReport.event_date && candidate.event_date) {
        var yearDiff = Math.abs(new Date(sourceReport.event_date).getFullYear() - new Date(candidate.event_date).getFullYear());
        if (yearDiff === 0) {
          explanation += ' in the same year';
        } else if (yearDiff <= 5) {
          explanation += ', ' + yearDiff + ' year' + (yearDiff !== 1 ? 's' : '') + ' apart';
        }
      }
      type = 'geographic';
    }

    // ─── Temporal scoring ──────────────────────────────────────
    if (source === 'temporal' && sourceReport.event_date && candidate.event_date) {
      var daysDiff = Math.abs(
        new Date(sourceReport.event_date).getTime() - new Date(candidate.event_date).getTime()
      ) / (1000 * 60 * 60 * 24);

      var candTitle = candidate.title.length > 60 ? candidate.title.substring(0, 57) + '...' : candidate.title;

      if (daysDiff < 1) {
        strength = Math.max(strength, 0.85);
        explanation = 'Occurred on the same day as this report';
      } else if (daysDiff < 3) {
        strength = Math.max(strength, 0.8);
        explanation = 'Happened within ' + Math.round(daysDiff) + ' day' + (Math.round(daysDiff) !== 1 ? 's' : '') + ' of this event';
      } else if (daysDiff < 7) {
        strength = Math.max(strength, 0.7);
        explanation = 'Both events occurred within the same week';
      } else if (daysDiff < 30) {
        strength = Math.max(strength, 0.5);
        explanation = 'Occurred within ' + Math.round(daysDiff) + ' days of each other';
      }

      // Add geographic context if both have locations
      if (sourceReport.state_province && candidate.location_name) {
        var sameState = sourceReport.state_province === candidate.state_province;
        if (sameState) {
          explanation += ', also in ' + sourceReport.state_province;
        } else if (candidate.state_province) {
          explanation += ' — in ' + candidate.state_province;
        }
      }

      type = 'temporal';
    }

    // ─── Cross-phenomenon scoring (most valuable) ─────────────
    if (source === 'cross_phenomenon') {
      var sharedTags = (sourceReport.tags || []).filter(function(t: string) {
        return (candidate.tags || []).includes(t);
      });

      // Filter out very generic tags for the explanation
      var meaningfulTags = sharedTags.filter(function(t: string) {
        return !['historical', 'first-hand-account', 'showcase', '1947'].includes(t);
      });
      var displayTags = meaningfulTags.length > 0 ? meaningfulTags : sharedTags;

      if (sharedTags.length >= 3) {
        strength = Math.max(strength, 0.8);
        explanation = 'Different phenomenon type but shares ' + sharedTags.length + ' traits: ' + displayTags.slice(0, 3).join(', ');
      } else if (sharedTags.length >= 2) {
        strength = Math.max(strength, 0.6);
        explanation = 'Cross-category connection through shared traits: ' + displayTags.join(' and ');
      } else if (sharedTags.length >= 1) {
        strength = Math.max(strength, 0.45);
        explanation = 'Different category but both involve ' + displayTags[0].replace(/-/g, ' ');
      }

      type = 'cross_phenomenon';
    }

    // ─── Same-location boost ──────────────────────────────────
    if (sourceReport.location_name && candidate.location_name) {
      var srcLoc = sourceReport.location_name.toLowerCase();
      var cndLoc = candidate.location_name.toLowerCase();
      if (srcLoc === cndLoc) {
        strength = Math.min(1.0, strength + 0.15);
      }
    }

    if (strength > 0) {
      results.push({
        targetId: candidate.id,
        type: type,
        strength: Math.round(strength * 100) / 100,
        explanation: explanation,
        funFact: funFact
      });
    }
  }

  results.sort(function(a, b) { return b.strength - a.strength; });
  return results;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
