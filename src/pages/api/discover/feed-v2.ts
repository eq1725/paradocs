/**
 * API: GET /api/discover/feed-v2
 * Phase 2 — Mixed content feed for the Stories experience.
 *
 * Returns a deterministically shuffled feed of BOTH phenomena AND reports,
 * interleaved for variety. Each item has an `item_type` field so the client
 * can pick the right card template.
 *
 * Query params:
 *   - seed: numeric seed for deterministic shuffle (generated per session on client)
 *   - offset: items to skip (pagination)
 *   - limit: items to return (default 15, max 30)
 *   - category: optional category filter
 *
 * Card template mapping (done client-side based on returned data):
 *   - item_type === 'phenomenon' => PhenomenonCard
 *   - item_type === 'report' && has_photo_video => MediaReportCard
 *   - item_type === 'report' && !has_photo_video => TextReportCard
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/** Seeded PRNG (mulberry32) */
function seededRandom(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle with seeded PRNG */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  var shuffled = arr.slice();
  var rand = seededRandom(seed);
  for (var i = shuffled.length - 1; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1));
    var temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

interface ScoredItem {
  id: string
  item_type: 'phenomenon' | 'report'
  category: string
  score: number
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var supabase = getSupabase();
    var limit = Math.min(parseInt(req.query.limit as string) || 15, 30);
    var offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    var seed = parseInt(req.query.seed as string) || 12345;
    var category = (req.query.category as string) || '';

    var placeholderUrl = 'https://bhkbctdmwnowfmqpksed.supabase.co/storage/v1/object/public/phenomena-images/default-cryptid.jpg';

    // ---- Fetch phenomena candidates ----
    var phenQuery = supabase
      .from('phenomena')
      .select('id, category, report_count, primary_image_url, ai_description, ai_quick_facts')
      .eq('status', 'active')
      .not('ai_summary', 'is', null);

    if (category) phenQuery = phenQuery.eq('category', category);

    var { data: phenCandidates, error: phenError } = await phenQuery
      .order('report_count', { ascending: false })
      .limit(800);

    if (phenError) {
      console.error('[Feed V2] Phenomena query error:', phenError);
    }

    // ---- Fetch report candidates ----
    var reportQuery = supabase
      .from('reports')
      .select('id, category, credibility, upvotes, view_count, has_photo_video, has_physical_evidence, content_type')
      .eq('status', 'approved')
      .not('summary', 'is', null);

    if (category) reportQuery = reportQuery.eq('category', category);

    var { data: reportCandidates, error: reportError } = await reportQuery
      .order('view_count', { ascending: false })
      .limit(400);

    if (reportError) {
      console.error('[Feed V2] Report query error:', reportError);
    }

    var allPhen = phenCandidates || [];
    var allReports = reportCandidates || [];

    if (allPhen.length === 0 && allReports.length === 0) {
      return res.status(200).json({ items: [], hasMore: false, totalAvailable: 0 });
    }

    // ---- Score phenomena (0-8 scale) ----
    var scoredPhen: ScoredItem[] = allPhen.map(function (item) {
      var score = 1;
      if (item.primary_image_url && item.primary_image_url !== placeholderUrl) score += 3;
      if (item.ai_description) score += 1;
      if (item.ai_quick_facts) score += 1;
      if (item.report_count > 0) score += 1;
      if (item.report_count >= 5) score += 1;
      return { id: item.id, item_type: 'phenomenon' as const, category: item.category, score: score };
    });

    // ---- Score reports (0-8 scale) ----
    var scoredReports: ScoredItem[] = allReports.map(function (item) {
      var score = 1;
      if (item.has_photo_video) score += 3;
      if (item.has_physical_evidence) score += 1;
      if (item.credibility === 'high') score += 2;
      else if (item.credibility === 'medium') score += 1;
      if (item.upvotes > 3) score += 1;
      if (item.content_type === 'historical_case') score += 1;
      return { id: item.id, item_type: 'report' as const, category: item.category, score: Math.min(score, 8) };
    });

    // ---- Merge and tier ----
    var allScored = scoredPhen.concat(scoredReports);
    allScored.sort(function (a, b) { return b.score - a.score; });

    var highTier = seededShuffle(
      allScored.filter(function (s) { return s.score >= 6; }), seed
    );
    var midTier = seededShuffle(
      allScored.filter(function (s) { return s.score >= 3 && s.score < 6; }), seed + 1
    );
    var lowTier = seededShuffle(
      allScored.filter(function (s) { return s.score < 3; }), seed + 2
    );

    // Interleave 3:1:1 (explore-exploit)
    var interleaved: ScoredItem[] = [];
    var hi = 0, mi = 0, lo = 0;
    while (hi < highTier.length || mi < midTier.length || lo < lowTier.length) {
      for (var k = 0; k < 3 && hi < highTier.length; k++) {
        interleaved.push(highTier[hi++]);
      }
      if (mi < midTier.length) interleaved.push(midTier[mi++]);
      if (lo < lowTier.length) interleaved.push(lowTier[lo++]);
    }

    // ---- Content-type variety: no more than 3 same item_type in a row,
    //      and no more than 2 same category in a row ----
    var diversified: ScoredItem[] = [];
    var pool = interleaved.slice();
    var lastCat = '';
    var catStreak = 0;
    var lastType = '';
    var typeStreak = 0;

    while (pool.length > 0) {
      var pickIdx = -1;

      // Try to find an item that satisfies both constraints
      for (var ci = 0; ci < pool.length; ci++) {
        var candidate = pool[ci];
        var catOk = catStreak < 2 || candidate.category !== lastCat;
        var typeOk = typeStreak < 3 || candidate.item_type !== lastType;
        if (catOk && typeOk) { pickIdx = ci; break; }
      }

      // Fallback: relax type constraint
      if (pickIdx < 0) {
        for (var ci2 = 0; ci2 < pool.length; ci2++) {
          if (catStreak < 2 || pool[ci2].category !== lastCat) { pickIdx = ci2; break; }
        }
      }

      // Final fallback: take whatever is next
      if (pickIdx < 0) pickIdx = 0;

      var pick = pool.splice(pickIdx, 1)[0];
      diversified.push(pick);

      if (pick.category === lastCat) catStreak++;
      else { catStreak = 1; lastCat = pick.category; }

      if (pick.item_type === lastType) typeStreak++;
      else { typeStreak = 1; lastType = pick.item_type; }
    }

    var totalAvailable = diversified.length;

    // ---- Paginate ----
    var pageSlice = diversified.slice(offset, offset + limit);
    var phenIds = pageSlice.filter(function (d) { return d.item_type === 'phenomenon'; }).map(function (d) { return d.id; });
    var reportIds = pageSlice.filter(function (d) { return d.item_type === 'report'; }).map(function (d) { return d.id; });

    if (pageSlice.length === 0) {
      return res.status(200).json({ items: [], hasMore: false, totalAvailable: totalAvailable });
    }

    // ---- Fetch full data for each type ----
    var phenMap: Record<string, any> = {};
    var reportMap: Record<string, any> = {};

    if (phenIds.length > 0) {
      var { data: fullPhen } = await supabase
        .from('phenomena')
        .select('id, name, slug, category, icon, ai_summary, ai_description, ai_quick_facts, primary_image_url, report_count, primary_regions, first_reported_date, aliases')
        .in('id', phenIds);

      if (fullPhen) {
        fullPhen.forEach(function (p) { phenMap[p.id] = p; });
      }
    }

    if (reportIds.length > 0) {
      var { data: fullReports } = await supabase
        .from('reports')
        .select('id, title, slug, summary, category, country, city, state_province, event_date, credibility, upvotes, view_count, comment_count, has_photo_video, has_physical_evidence, content_type, location_name, source_type, source_label, created_at, phenomenon_type_id')
        .in('id', reportIds);

      if (fullReports) {
        fullReports.forEach(function (r) { reportMap[r.id] = r; });
      }

      // Resolve phenomenon names for reports that have phenomenon_type_id
      var ptIds = fullReports ? fullReports.filter(function (r) { return r.phenomenon_type_id; }).map(function (r) { return r.phenomenon_type_id; }) : [];
      if (ptIds.length > 0) {
        var { data: ptData } = await supabase
          .from('phenomena')
          .select('id, name, slug, category')
          .in('id', ptIds);

        if (ptData) {
          var ptMap: Record<string, any> = {};
          ptData.forEach(function (pt) { ptMap[pt.id] = pt; });
          Object.keys(reportMap).forEach(function (rid) {
            var r = reportMap[rid];
            if (r.phenomenon_type_id && ptMap[r.phenomenon_type_id]) {
              r.phenomenon_type = ptMap[r.phenomenon_type_id];
            }
          });
        }
      }
    }

    // ---- Assemble in deterministic order ----
    var items = pageSlice.map(function (slot) {
      if (slot.item_type === 'phenomenon') {
        var p = phenMap[slot.id];
        if (!p) return null;
        return {
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
        };
      } else {
        var r = reportMap[slot.id];
        if (!r) return null;
        return {
          item_type: 'report',
          id: r.id,
          title: r.title,
          slug: r.slug,
          summary: r.summary,
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
          phenomenon_type: r.phenomenon_type || null,
        };
      }
    }).filter(function (item) { return item !== null; });

    // Cache pagination requests
    if (offset > 0) {
      res.setHeader('Cache-Control', 'private, max-age=30');
    }

    return res.status(200).json({
      items: items,
      hasMore: (offset + limit) < totalAvailable,
      totalAvailable: totalAvailable,
      offset: offset,
      nextOffset: offset + items.length,
    });
  } catch (error) {
    console.error('[Feed V2] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
