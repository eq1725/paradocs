/**
 * API: POST /api/admin/generate-connections
 *
 * Batch job to generate AI-detected connections between reports.
 * Analyzes reports for geographic, temporal, characteristic, and
 * cross-phenomenon correlations.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

var MAX_REPORTS_PER_RUN = 50;
var MAX_CONNECTIONS_PER_REPORT = 8;
var MIN_STRENGTH_THRESHOLD = 0.4;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var authHeader = req.headers.authorization;
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    var supabase = createServerClient();
    var stats = { processed: 0, connections_created: 0, errors: 0 };

    var sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    var reportsResult = await supabase
      .from('reports')
      .select('id, title, slug, category, description, location_name, latitude, longitude, event_date, tags')
      .eq('status', 'approved')
      .or('connections_last_analyzed.is.null,connections_last_analyzed.lt.' + sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(MAX_REPORTS_PER_RUN);

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
        await processReportConnections(supabase, reports[i]);
        stats.processed++;
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

async function processReportConnections(supabase: any, report: any) {
  // Strategy 1: Geographic proximity (within 100km)
  var geoCandidates: any[] = [];
  if (report.latitude && report.longitude) {
    var latRange = 100 / 111;
    var lngRange = 100 / (111 * Math.cos(report.latitude * Math.PI / 180));
    var geoResult = await supabase
      .from('reports')
      .select('id, title, slug, category, description, location_name, latitude, longitude, event_date, tags')
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
      .select('id, title, slug, category, description, location_name, latitude, longitude, event_date, tags')
      .neq('id', report.id)
      .eq('status', 'approved')
      .eq('category', report.category)
      .gte('event_date', thirtyBefore)
      .lte('event_date', thirtyAfter)
      .limit(20);
    temporalCandidates = tempResult.data || [];
  }

  // Strategy 3: Cross-category with shared tags
  var crossCandidates: any[] = [];
  var reportTags = report.tags || [];
  if (reportTags.length > 0) {
    var tagResult = await supabase
      .from('reports')
      .select('id, title, slug, category, description, location_name, latitude, longitude, event_date, tags')
      .neq('id', report.id)
      .neq('category', report.category)
      .eq('status', 'approved')
      .overlaps('tags', reportTags)
      .limit(15);
    crossCandidates = tagResult.data || [];
  }

  // Deduplicate candidates
  var seen = new Set<string>();
  seen.add(report.id);
  var allCandidates: any[] = [];

  var addCandidates = function(candidates: any[], source: string) {
    for (var j = 0; j < candidates.length; j++) {
      if (!seen.has(candidates[j].id)) {
        seen.add(candidates[j].id);
        allCandidates.push({ report: candidates[j], source: source });
      }
    }
  };

  addCandidates(geoCandidates, 'geographic');
  addCandidates(temporalCandidates, 'temporal');
  addCandidates(crossCandidates, 'cross_phenomenon');

  if (allCandidates.length === 0) {
    await supabase
      .from('reports')
      .update({ connections_last_analyzed: new Date().toISOString() })
      .eq('id', report.id);
    return;
  }

  // Score and generate explanations for top candidates
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
}

function scoreConnections(sourceReport: any, candidates: any[]) {
  var results: any[] = [];

  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i].report;
    var source = candidates[i].source;
    var strength = 0;
    var type = source;
    var explanation = '';
    var funFact = '';

    // Geographic scoring
    if (source === 'geographic' && sourceReport.latitude && candidate.latitude) {
      var dist = haversineDistance(
        sourceReport.latitude, sourceReport.longitude,
        candidate.latitude, candidate.longitude
      );
      if (dist < 10) {
        strength = 0.9;
        explanation = 'These reports occurred within ' + Math.round(dist) + 'km of each other';
        funFact = 'Reports from the same area often share environmental factors that may explain clusters of sightings.';
      } else if (dist < 30) {
        strength = 0.7;
        explanation = 'Both reports come from the same region, roughly ' + Math.round(dist) + 'km apart';
        funFact = 'Geographic clustering is one of the strongest indicators of genuine anomalous activity.';
      } else if (dist < 100) {
        strength = 0.5;
        explanation = 'These reports are from the broader same area, about ' + Math.round(dist) + 'km apart';
        funFact = 'Many famous paranormal hotspots span areas of 50-100km.';
      }
      type = 'geographic';
    }

    // Temporal scoring
    if (source === 'temporal' && sourceReport.event_date && candidate.event_date) {
      var daysDiff = Math.abs(
        new Date(sourceReport.event_date).getTime() - new Date(candidate.event_date).getTime()
      ) / (1000 * 60 * 60 * 24);
      if (daysDiff < 3) {
        strength = Math.max(strength, 0.85);
        explanation = 'These events occurred within ' + Math.round(daysDiff) + ' day(s) of each other';
        funFact = 'Clusters of reports within days are called flaps - among the most studied patterns.';
      } else if (daysDiff < 7) {
        strength = Math.max(strength, 0.7);
        explanation = 'Both events happened within the same week';
      } else if (daysDiff < 30) {
        strength = Math.max(strength, 0.5);
        explanation = 'These events occurred within the same month';
      }
      type = 'temporal';
    }

    // Cross-phenomenon scoring
    if (source === 'cross_phenomenon') {
      var sharedTags = (sourceReport.tags || []).filter(function(t: string) {
        return (candidate.tags || []).includes(t);
      });
      if (sharedTags.length >= 3) {
        strength = Math.max(strength, 0.8);
        explanation = 'Different phenomenon types sharing ' + sharedTags.length + ' characteristics: ' + sharedTags.slice(0, 3).join(', ');
        funFact = 'Cross-phenomenon connections suggest deeper patterns that transcend traditional categorization.';
      } else if (sharedTags.length >= 2) {
        strength = Math.max(strength, 0.6);
        explanation = 'Cross-category reports sharing traits: ' + sharedTags.join(', ');
      } else if (sharedTags.length >= 1) {
        strength = Math.max(strength, 0.45);
        explanation = 'Different categories with a shared characteristic: ' + sharedTags[0];
      }
      type = 'cross_phenomenon';
    }

    // Boost for same location name
    if (sourceReport.location_name && candidate.location_name) {
      var sourceLoc = sourceReport.location_name.toLowerCase();
      var candLoc = candidate.location_name.toLowerCase();
      if (sourceLoc === candLoc) {
        strength = Math.min(1.0, strength + 0.15);
        explanation = explanation + '. Both reference: ' + sourceReport.location_name;
      }
    }

    if (strength > 0) {
      results.push({
        targetId: candidate.id,
        type: type,
        strength: Math.round(strength * 100) / 100,
        explanation: explanation,
        funFact: funFact || null
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