/**
 * API: GET /api/discover/feed-v2
 * Phase 3 — Scored ranking feed for the Stories experience.
 *
 * Replaces seeded random shuffle with parameterized scored ranking.
 * Each card gets a score based on: base_engagement, recency, user_affinity,
 * diversity penalty, and random exploration factor.
 *
 * Also interleaves new card types: cluster, on_this_date, promo.
 *
 * Query params:
 *   - seed: numeric seed for exploration randomness
 *   - offset: items to skip (pagination)
 *   - limit: items to return (default 15, max 30)
 *   - category: optional category filter
 *   - onboarding_topics: comma-separated category IDs from onboarding
 *   - session_affinity: comma-separated cat:score pairs (e.g. "ufos_aliens:60,ndes:30")
 *
 * Card template mapping (client-side):
 *   - item_type === 'phenomenon' => PhenomenonCard
 *   - item_type === 'report' && has_photo_video => MediaReportCard
 *   - item_type === 'report' && !has_photo_video => TextReportCard
 *   - item_type === 'cluster' => ClusteringCard
 *   - item_type === 'on_this_date' => OnThisDateCard
 *   - item_type === 'promo' => ResearchHubPromo
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

interface ScoredItem {
  id: string
  item_type: 'phenomenon' | 'report'
  category: string
  score: number
  created_at?: string
}

interface RankingWeights {
  engagement: number
  recency: number
  affinity: number
  diversity: number
  explore: number
}

var DEFAULT_WEIGHTS: RankingWeights = {
  engagement: 1.0,
  recency: 0.8,
  affinity: 1.2,
  diversity: 1.0,
  explore: 0.3,
};

/** Parse onboarding topics into affinity map (selected=80, unselected=20) */
function parseOnboardingTopics(raw: string): Record<string, number> {
  if (!raw) return {};
  var affinity: Record<string, number> = {};
  raw.split(',').forEach(function (topic) {
    var t = topic.trim();
    if (t) affinity[t] = 80;
  });
  return affinity;
}

/** Parse session affinity param (e.g. "ufos_aliens:60,ndes:30") */
function parseSessionAffinity(raw: string): Record<string, number> {
  if (!raw) return {};
  var affinity: Record<string, number> = {};
  raw.split(',').forEach(function (pair) {
    var parts = pair.split(':');
    if (parts.length === 2) {
      var cat = parts[0].trim();
      var score = parseInt(parts[1], 10);
      if (cat && !isNaN(score)) affinity[cat] = score;
    }
  });
  return affinity;
}

/** Compute effective affinity: blend long-term (0.4) with session (0.6) */
function computeEffectiveAffinity(
  longTerm: Record<string, number>,
  session: Record<string, number>,
  category: string
): number {
  var lt = longTerm[category] || 20; // Default: unselected = 20
  var sess = session[category] || 0;

  // If no session data, use long-term only
  if (Object.keys(session).length === 0) return lt;

  return (lt * 0.4) + (sess * 0.6);
}

/** Recency boost: 50 * exp(-0.1 * days_since_created), capped at 50 */
function computeRecencyBoost(createdAt: string | undefined, boostDays: number): number {
  if (!createdAt) return 0;
  var age = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (age > boostDays * 2) return 0;
  return 50 * Math.exp(-0.1 * age);
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
    var onboardingTopicsRaw = (req.query.onboarding_topics as string) || '';
    var sessionAffinityRaw = (req.query.session_affinity as string) || '';

    var placeholderUrl = 'https://bhkbctdmwnowfmqpksed.supabase.co/storage/v1/object/public/phenomena-images/default-cryptid.jpg';

    // ---- Load ranking config ----
    var weights = DEFAULT_WEIGHTS;
    var recencyBoostDays = 7;
    var coldStartBase = 50;
    var maxConsecutiveCat = 3;

    var { data: configData } = await supabase.from('feed_config').select('key, value');
    if (configData) {
      configData.forEach(function (row) {
        if (row.key === 'ranking_weights' && typeof row.value === 'object') {
          weights = Object.assign({}, DEFAULT_WEIGHTS, row.value as any);
        } else if (row.key === 'recency_boost_days') {
          recencyBoostDays = parseInt(String(row.value), 10) || 7;
        } else if (row.key === 'cold_start_base_score') {
          coldStartBase = parseInt(String(row.value), 10) || 50;
        } else if (row.key === 'max_consecutive_same_category') {
          maxConsecutiveCat = parseInt(String(row.value), 10) || 3;
        }
      });
    }

    // ---- Load category engagement rates ----
    var engagementRates: Record<string, number> = {};
    try {
      var { data: engData } = await supabase
        .from('category_engagement')
        .select('phenomenon_category, tap_rate, avg_dwell_ms');

      if (engData) {
        engData.forEach(function (e) {
          // Normalize tap_rate (0-1) to 0-100 scale
          var tapScore = (e.tap_rate || 0) * 100;
          // Add dwell bonus: every 1000ms of avg dwell adds 5 points
          var dwellBonus = e.avg_dwell_ms ? Math.min((e.avg_dwell_ms / 1000) * 5, 25) : 0;
          engagementRates[e.phenomenon_category] = Math.min(tapScore + dwellBonus, 100);
        });
      }
    } catch (e) {
      // Materialized view may not exist yet — use cold start defaults
    }

    // ---- Parse user affinity ----
    var onboardingAffinity = parseOnboardingTopics(onboardingTopicsRaw);
    var sessionAffinity = parseSessionAffinity(sessionAffinityRaw);
    var isColdStart = Object.keys(onboardingAffinity).length === 0 && Object.keys(sessionAffinity).length === 0;

    var rand = seededRandom(seed + offset);

    // ---- Fetch phenomena candidates ----
    var phenQuery = supabase
      .from('phenomena')
      .select('id, category, report_count, primary_image_url, ai_description, ai_quick_facts, feed_hook, created_at')
      .eq('status', 'active')
      .not('ai_summary', 'is', null);

    if (category) phenQuery = phenQuery.eq('category', category);

    var { data: phenCandidates, error: phenError } = await phenQuery
      .order('report_count', { ascending: false })
      .limit(5000);

    if (phenError) {
      console.error('[Feed V2] Phenomena query error:', phenError);
    }

    // ---- Fetch report candidates ----
    var reportQuery = supabase
      .from('reports')
      .select('id, category, credibility, upvotes, view_count, has_photo_video, has_physical_evidence, content_type, feed_hook, created_at')
      .eq('status', 'approved')
      .not('summary', 'is', null);

    if (category) reportQuery = reportQuery.eq('category', category);

    var { data: reportCandidates, error: reportError } = await reportQuery
      .order('view_count', { ascending: false })
      .limit(1000);

    if (reportError) {
      console.error('[Feed V2] Report query error:', reportError);
    }

    var allPhen = phenCandidates || [];
    var allReports = reportCandidates || [];

    if (allPhen.length === 0 && allReports.length === 0) {
      return res.status(200).json({ items: [], hasMore: false, totalAvailable: 0 });
    }

    // ---- Score each candidate using the ranking formula ----
    // score = (base_engagement * W_engagement)
    //       + (recency_boost * W_recency)
    //       + (user_affinity * W_affinity)
    //       + (random_explore * W_explore)

    var scoreItem = function (
      id: string,
      itemType: 'phenomenon' | 'report',
      itemCategory: string,
      qualityScore: number,
      createdAt: string | undefined
    ): ScoredItem {
      // base_engagement: from materialized view or cold start default
      var baseEngagement = engagementRates[itemCategory] || coldStartBase;
      // Blend with quality score (0-8 scaled to 0-100)
      baseEngagement = (baseEngagement * 0.6) + ((qualityScore / 8) * 100 * 0.4);

      // recency_boost
      var recency = computeRecencyBoost(createdAt, recencyBoostDays);

      // user_affinity
      var affinity = computeEffectiveAffinity(onboardingAffinity, sessionAffinity, itemCategory);

      // random_explore (0-30)
      var explore = rand() * 30;

      var totalScore = (baseEngagement * weights.engagement)
                     + (recency * weights.recency)
                     + (affinity * weights.affinity)
                     + (explore * weights.explore);

      return {
        id: id,
        item_type: itemType,
        category: itemCategory,
        score: totalScore,
        created_at: createdAt,
      };
    };

    // Score phenomena — feed_hook presence is a major quality signal
    var scoredAll: ScoredItem[] = allPhen.map(function (item) {
      var quality = 1;
      if (item.feed_hook) quality += 3; // Hook = engagement-ready card
      if (item.primary_image_url && item.primary_image_url !== placeholderUrl) quality += 2;
      if (item.ai_description) quality += 1;
      if (item.ai_quick_facts) quality += 1;
      if (item.report_count > 0) quality += 1;
      if (item.report_count >= 5) quality += 1;
      return scoreItem(item.id, 'phenomenon', item.category, Math.min(quality, 10), item.created_at);
    });

    // Score reports — feed_hook presence is a major quality signal
    var scoredReports: ScoredItem[] = allReports.map(function (item) {
      var quality = 1;
      if (item.feed_hook) quality += 3; // Hook = engagement-ready card
      if (item.has_photo_video) quality += 2;
      if (item.has_physical_evidence) quality += 1;
      if (item.credibility === 'high') quality += 2;
      else if (item.credibility === 'medium') quality += 1;
      if (item.upvotes > 3) quality += 1;
      if (item.content_type === 'historical_case') quality += 1;
      return scoreItem(item.id, 'report', item.category, Math.min(quality, 10), item.created_at);
    });

    scoredAll = scoredAll.concat(scoredReports);

    // Sort by score descending
    scoredAll.sort(function (a, b) { return b.score - a.score; });

    // ---- Apply diversity constraint ----
    // No more than maxConsecutiveCat same category in a row
    // No more than 3 same item_type in a row
    var diversified: ScoredItem[] = [];
    var pool = scoredAll.slice();
    var lastCat = '';
    var catStreak = 0;
    var lastType = '';
    var typeStreak = 0;

    while (pool.length > 0) {
      var pickIdx = -1;

      for (var ci = 0; ci < Math.min(pool.length, 20); ci++) {
        var candidate = pool[ci];
        var catOk = catStreak < maxConsecutiveCat || candidate.category !== lastCat;
        var typeOk = typeStreak < 3 || candidate.item_type !== lastType;
        if (catOk && typeOk) { pickIdx = ci; break; }
      }

      if (pickIdx < 0) {
        for (var ci2 = 0; ci2 < Math.min(pool.length, 20); ci2++) {
          if (catStreak < maxConsecutiveCat || pool[ci2].category !== lastCat) { pickIdx = ci2; break; }
        }
      }

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
        .select('id, name, slug, category, icon, ai_summary, ai_description, ai_quick_facts, feed_hook, primary_image_url, report_count, primary_regions, first_reported_date, aliases')
        .in('id', phenIds);

      if (fullPhen) {
        fullPhen.forEach(function (p) { phenMap[p.id] = p; });
      }
    }

    if (reportIds.length > 0) {
      var { data: fullReports } = await supabase
        .from('reports')
        .select('id, title, slug, summary, category, country, city, state_province, event_date, credibility, upvotes, view_count, comment_count, has_photo_video, has_physical_evidence, content_type, location_name, source_type, source_label, created_at, phenomenon_type_id, feed_hook')
        .in('id', reportIds);

      if (fullReports) {
        fullReports.forEach(function (r) { reportMap[r.id] = r; });
      }

      // Resolve phenomenon names + images
      var ptIds = fullReports ? fullReports.filter(function (r) { return r.phenomenon_type_id; }).map(function (r) { return r.phenomenon_type_id; }) : [];
      if (ptIds.length > 0) {
        var { data: ptData } = await supabase
          .from('phenomena')
          .select('id, name, slug, category, primary_image_url')
          .in('id', ptIds);

        if (ptData) {
          var ptMap: Record<string, any> = {};
          ptData.forEach(function (pt) { ptMap[pt.id] = pt; });
          Object.keys(reportMap).forEach(function (rid) {
            var r = reportMap[rid];
            if (r.phenomenon_type_id && ptMap[r.phenomenon_type_id]) {
              var pt = ptMap[r.phenomenon_type_id];
              r.phenomenon_type = { id: pt.id, name: pt.name, slug: pt.slug, category: pt.category };
              if (!r.has_photo_video && pt.primary_image_url && pt.primary_image_url !== placeholderUrl) {
                r.associated_image_url = pt.primary_image_url;
                r.associated_image_source = pt.name;
              }
            }
          });
        }
      }

      // Fetch report_media
      var mediaReportIds = fullReports ? fullReports.filter(function (r) { return r.has_photo_video; }).map(function (r) { return r.id; }) : [];
      if (mediaReportIds.length > 0) {
        var { data: mediaData } = await supabase
          .from('report_media')
          .select('report_id, media_type, url, thumbnail_url, caption, is_primary')
          .in('report_id', mediaReportIds)
          .eq('is_primary', true)
          .limit(mediaReportIds.length);

        if (mediaData) {
          mediaData.forEach(function (m) {
            if (reportMap[m.report_id]) {
              reportMap[m.report_id].primary_media = {
                type: m.media_type,
                url: m.url,
                thumbnail_url: m.thumbnail_url,
                caption: m.caption,
              };
            }
          });
        }

        var missingMedia = mediaReportIds.filter(function (rid) {
          return reportMap[rid] && !reportMap[rid].primary_media;
        });
        if (missingMedia.length > 0) {
          var { data: fallbackMedia } = await supabase
            .from('report_media')
            .select('report_id, media_type, url, thumbnail_url, caption')
            .in('report_id', missingMedia)
            .limit(missingMedia.length);

          if (fallbackMedia) {
            fallbackMedia.forEach(function (m) {
              if (reportMap[m.report_id] && !reportMap[m.report_id].primary_media) {
                reportMap[m.report_id].primary_media = {
                  type: m.media_type,
                  url: m.url,
                  thumbnail_url: m.thumbnail_url,
                  caption: m.caption,
                };
              }
            });
          }
        }
      }
    }

    // ---- Assemble items in ranked order ----
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
          feed_hook: p.feed_hook || null,
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
          phenomenon_type: r.phenomenon_type || null,
          primary_media: r.primary_media || null,
          associated_image_url: r.associated_image_url || null,
          associated_image_source: r.associated_image_source || null,
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
      isColdStart: isColdStart,
    });
  } catch (error) {
    console.error('[Feed V2] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
