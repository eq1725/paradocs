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
import { computeUserCategoryWeights, mergeWeights } from '@/lib/services/feed-personalization.service';

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
  // Tier 3 additions: tracked for diversity step.
  source_type?: string | null
}

/**
 * Haversine distance in kilometers between two lat/lng pairs.
 * Used by Tier 3 location-proximity scoring.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  var R = 6371
  var dLat = (lat2 - lat1) * Math.PI / 180
  var dLng = (lng2 - lng1) * Math.PI / 180
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
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
    // Panel-feedback (May 2026 — 3rd round, Tier 1):
    //   The static 12345 seed meant every visitor saw the exact same
    //   feed order. We now derive the seed from user_id (if provided)
    //   + day so the order varies between users and between days but
    //   stays stable within a session. Client can still pass explicit
    //   seed for paginated continuity.
    var userIdSeed = (req.query.user_id as string) || ''
    var clientSeed = parseInt(req.query.seed as string)
    var seed: number
    if (!isNaN(clientSeed) && clientSeed !== 0) {
      seed = clientSeed
    } else {
      var dayStamp = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
      var hash = 0
      var seedSource = userIdSeed + ':' + dayStamp
      for (var hi = 0; hi < seedSource.length; hi++) {
        hash = ((hash << 5) - hash) + seedSource.charCodeAt(hi)
        hash |= 0
      }
      seed = Math.abs(hash) || 12345
    }
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

    // Panel-feedback (May 2026 — 4th round, Tier 2):
    // Layer in per-user category weights derived from saved_reports +
    // thumbs feedback events. The personalization signals reflect
    // actual user behavior and dominate the onboarding intent. Empty
    // weights map = pre-launch / cold user; we fall through to the
    // existing onboarding-only path silently.
    var personalizedWeights: Record<string, number> = {}
    if (userIdSeed) {
      try {
        personalizedWeights = await computeUserCategoryWeights(supabase, userIdSeed)
      } catch (e: any) {
        console.warn('[Feed V2] personalization failed (proceeding with onboarding only):', e?.message)
      }
    }
    var longTermAffinity = mergeWeights(onboardingAffinity, personalizedWeights)

    var isColdStart = Object.keys(longTermAffinity).length === 0 && Object.keys(sessionAffinity).length === 0;

    // ---- Tier 3: location proximity + source diversity ----
    // Panel-feedback (May 2026 — 4th round): if the user has at least
    // one report with lat/lng, geographically-near content gets a
    // small bonus. Capped so it never dominates over freshness or
    // engagement. Pulled here once per request rather than per-card.
    var userReportLocations: Array<{ lat: number; lng: number }> = []
    if (userIdSeed) {
      try {
        var { data: userReports } = await supabase
          .from('reports')
          .select('latitude, longitude')
          .eq('submitted_by', userIdSeed)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .limit(10)
        if (userReports && userReports.length > 0) {
          userReportLocations = (userReports as any[])
            .map(function (r: any) {
              return { lat: Number(r.latitude), lng: Number(r.longitude) }
            })
            .filter(function (l) { return !isNaN(l.lat) && !isNaN(l.lng) })
        }
      } catch { /* silent */ }
    }

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
    // Panel-feedback (May 2026 — 4th round, Tier 3): include latitude,
    // longitude, source_type, has_video so the scoring loop can apply
    // location-proximity and source-diversity bonuses.
    var reportQuery = supabase
      .from('reports')
      .select('id, category, credibility, upvotes, view_count, has_photo_video, has_video, has_physical_evidence, content_type, feed_hook, created_at, latitude, longitude, source_type')
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
      var affinity = computeEffectiveAffinity(longTermAffinity, sessionAffinity, itemCategory);

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

    // Score reports — feed_hook presence is a major quality signal.
    // Panel-feedback (May 2026 — 3rd round, Tier 1 + Tier 3): added
    // boost for first-party user video submissions (has_video), a
    // freshness multiplier for very recent (< 48h) user content,
    // and a location-proximity bonus for users whose own reports
    // have lat/lng (Tier 3). Source type is tracked on the
    // ScoredItem for the diversity-constraint step.
    var nowMs = Date.now()
    var FRESH_WINDOW_MS = 48 * 60 * 60 * 1000
    var PROXIMITY_NEAR_KM = 80     // within 80km = strong proximity bonus
    var PROXIMITY_REGION_KM = 500  // within 500km = light bonus
    var scoredReports: ScoredItem[] = allReports.map(function (item: any) {
      var quality = 1;
      if (item.feed_hook) quality += 3;
      if (item.has_photo_video) quality += 2;
      if (item.has_video === true) quality += 3;
      if (item.has_physical_evidence) quality += 1;
      if (item.credibility === 'high') quality += 2;
      else if (item.credibility === 'medium') quality += 1;
      if (item.upvotes > 3) quality += 1;
      if (item.content_type === 'historical_case') quality += 1;
      if (item.created_at) {
        var ageMs = nowMs - new Date(item.created_at).getTime()
        if (ageMs >= 0 && ageMs < FRESH_WINDOW_MS) {
          quality += 2
        }
      }
      // Tier 3: location proximity bonus. If the user has at least
      // one report with coordinates, find the closest user-location
      // and bump quality based on distance. We use the closest
      // distance across all user reports — if any one of their
      // reports is nearby, the candidate "feels local."
      if (userReportLocations.length > 0 && item.latitude != null && item.longitude != null) {
        var lat = Number(item.latitude)
        var lng = Number(item.longitude)
        if (!isNaN(lat) && !isNaN(lng)) {
          var minDistKm = Infinity
          for (var li = 0; li < userReportLocations.length; li++) {
            var d = haversineKm(lat, lng, userReportLocations[li].lat, userReportLocations[li].lng)
            if (d < minDistKm) minDistKm = d
          }
          if (minDistKm < PROXIMITY_NEAR_KM) quality += 2
          else if (minDistKm < PROXIMITY_REGION_KM) quality += 1
        }
      }
      var scored = scoreItem(item.id, 'report', item.category, Math.min(quality, 14), item.created_at);
      scored.source_type = item.source_type || null
      return scored
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
    // Tier 3: track recent source_types so the feed doesn't run a
    // long string of e.g. NUFORC reports back-to-back. Soft cap at
    // 3 consecutive same-source.
    var lastSource = '';
    var sourceStreak = 0;
    var MAX_CONSECUTIVE_SOURCE = 3;
    // Panel-feedback (May 2026 — 7th round): cap phenomenon
    // spotlights so they're occasional inserts (every 4-6 cards)
    // rather than batched. Reports (text + video) are the spine of
    // the feed; phenomena are punctuation.
    var phenomenaSinceLast = Infinity
    var MIN_GAP_BETWEEN_PHENOMENA = 4

    while (pool.length > 0) {
      var pickIdx = -1;

      for (var ci = 0; ci < Math.min(pool.length, 20); ci++) {
        var candidate = pool[ci];
        var catOk = catStreak < maxConsecutiveCat || candidate.category !== lastCat;
        var typeOk = typeStreak < 3 || candidate.item_type !== lastType;
        var srcOk = sourceStreak < MAX_CONSECUTIVE_SOURCE
                    || !candidate.source_type
                    || candidate.source_type !== lastSource;
        // Phenomenon-card pacing: skip if it would land within the
        // min-gap window after the previous phenomenon card.
        var phenOk = candidate.item_type !== 'phenomenon' || phenomenaSinceLast >= MIN_GAP_BETWEEN_PHENOMENA;
        if (catOk && typeOk && srcOk && phenOk) { pickIdx = ci; break; }
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

      // Source diversity tracking. Empty source_type (e.g. phenomena
      // items) doesn't count toward the streak.
      if (pick.source_type) {
        if (pick.source_type === lastSource) sourceStreak++
        else { sourceStreak = 1; lastSource = pick.source_type }
      } else {
        sourceStreak = 0
        lastSource = ''
      }

      // Phenomenon pacing tracker.
      if (pick.item_type === 'phenomenon') {
        phenomenaSinceLast = 0
      } else {
        phenomenaSinceLast++
      }
    }

    // ---- V9.2 — Pin Today's Lead to position 0 ----
    // Only on offset=0 (first page) AND when no category filter is
    // active (otherwise we'd break the V9.0.1 filter contract).
    // Reads the daily_leads row for today's UTC date.
    if (offset === 0 && !category) {
      var todayUtcStr = new Date().toISOString().substring(0, 10);
      var { data: leadRow } = await supabase
        .from('daily_leads')
        .select('phenomenon_id, report_id')
        .eq('lead_date', todayUtcStr)
        .maybeSingle();

      if (leadRow) {
        var leadId: string | null = leadRow.phenomenon_id || leadRow.report_id || null;
        var leadType: 'phenomenon' | 'report' = leadRow.phenomenon_id ? 'phenomenon' : 'report';
        if (leadId) {
          var leadIdx = diversified.findIndex(function (d) { return d.id === leadId; });
          if (leadIdx > 0) {
            // Already in feed — move to position 0
            var leadItem = diversified.splice(leadIdx, 1)[0];
            diversified.unshift(leadItem);
          } else if (leadIdx < 0) {
            // Not in scored set (filtered out by quality or limit) —
            // prepend a stub so the renderer fetches it from DB.
            diversified.unshift({
              id: leadId,
              item_type: leadType,
              category: '',
              score: 99999,
              created_at: undefined,
            });
          }
          // leadIdx === 0 → already correctly positioned, no-op
        }
      }
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
        .select('id, name, slug, category, icon, ai_summary, ai_description, ai_quick_facts, feed_hook, anchor_case_hook, anchor_when, anchor_where, anchor_witness, unresolved_tension, primary_image_url, report_count, primary_regions, first_reported_date, aliases')
        .in('id', phenIds);

      if (fullPhen) {
        fullPhen.forEach(function (p) { phenMap[p.id] = p; });
      }
    }

    if (reportIds.length > 0) {
      var { data: fullReports } = await (supabase
        .from('reports') as any)
        .select('id, title, slug, summary, category, country, city, state_province, event_date, event_date_precision, credibility, upvotes, view_count, comment_count, has_photo_video, has_physical_evidence, has_video, content_type, location_name, source_type, source_label, created_at, phenomenon_type_id, feed_hook, paradocs_narrative, metadata, anchor_case_hook, anchor_when, anchor_where, anchor_witness, unresolved_tension')
        .in('id', reportIds);

      if (fullReports) {
        fullReports.forEach(function (r) { reportMap[r.id] = r; });
      }

      // Panel-feedback (May 2026 — 3rd round): join report_videos
      // for any report with has_video=true. Returns a primary
      // playback URL + transcript segments so the feed card can
      // render an inline player with captions.
      var videoReportIds = fullReports
        ? fullReports.filter(function (r: any) { return r.has_video === true }).map(function (r: any) { return r.id })
        : []
      if (videoReportIds.length > 0) {
        var { data: videoRows } = await supabase
          .from('report_videos')
          .select('id, report_id, storage_bucket, storage_path, mime_type, duration_sec, transcript_segments, transcript_lang')
          .in('report_id', videoReportIds)
          .eq('status', 'ready')
          .order('published_at', { ascending: false, nullsFirst: false } as any)

        if (videoRows && videoRows.length > 0) {
          // Generate signed playback URLs in parallel. 4h TTL — long
          // enough for a feed-scroll session even with browser tabs
          // left open. Re-fetch the feed for fresher URLs after that.
          var SIGNED_TTL_SEC = 4 * 60 * 60
          var withUrls = await Promise.all(videoRows.map(async function (v: any) {
            var bucket = v.storage_bucket || 'report_videos'
            // V10.7.E.7 — derive the sibling poster path by swapping
            // the video file's extension to .jpg. Convention set by
            // upload-url.ts. Sign both URLs in parallel; the poster
            // URL is optional (the front-end falls back to no poster
            // if missing, no fatal effect on playback).
            var posterPath: string | null = null
            try {
              var p = (v.storage_path as string) || ''
              var dot = p.lastIndexOf('.')
              if (dot > 0) posterPath = p.substring(0, dot) + '.jpg'
            } catch (_) { /* leave poster null */ }

            try {
              var signResults = await Promise.all([
                (supabase.storage as any)
                  .from(bucket)
                  .createSignedUrl(v.storage_path, SIGNED_TTL_SEC),
                posterPath
                  ? (supabase.storage as any).from(bucket).createSignedUrl(posterPath, SIGNED_TTL_SEC).catch(function () { return null })
                  : Promise.resolve(null),
              ])
              var signed: any = signResults[0]
              var posterSigned: any = signResults[1]
              if (signed?.data?.signedUrl) {
                return {
                  ...v,
                  playback_url: signed.data.signedUrl,
                  poster_url: posterSigned?.data?.signedUrl || null,
                }
              }
              // V10.7.E — QA #3 (May 2026). The previous catch swallowed
              // every signed-URL failure silently, so a misconfigured
              // bucket or RLS rule looked identical to a healthy feed
              // and the front-end fell through to the text card. Log
              // the failure mode explicitly so Vercel logs make this
              // obvious next time.
              console.warn('[feed-v2] createSignedUrl returned no URL', {
                video_id: v.id,
                report_id: v.report_id,
                bucket: bucket,
                storage_path: v.storage_path,
                signed_error: signed?.error?.message || null,
              })
            } catch (e: any) {
              console.warn('[feed-v2] createSignedUrl threw', {
                video_id: v.id,
                report_id: v.report_id,
                bucket: v.storage_bucket || 'report_videos',
                storage_path: v.storage_path,
                message: e?.message || String(e),
              })
            }
            return v
          }))

          // Pick the most-recently-published video per report and attach.
          withUrls.forEach(function (v: any) {
            if (!reportMap[v.report_id]) return
            // First write wins (already sorted by published_at desc above).
            if (reportMap[v.report_id].video) return
            reportMap[v.report_id].video = {
              video_id: v.id,
              playback_url: v.playback_url || null,
              poster_url: v.poster_url || null,
              segments: v.transcript_segments || null,
              duration_sec: v.duration_sec,
              transcript_lang: v.transcript_lang || null,
            }
          })
        }
      }

      // Resolve phenomenon type names from the phenomenon_types table (the FK target)
      var ptIds = fullReports ? fullReports.filter(function (r) { return r.phenomenon_type_id; }).map(function (r) { return r.phenomenon_type_id; }) : [];
      if (ptIds.length > 0) {
        var { data: ptData } = await supabase
          .from('phenomenon_types')
          .select('id, name, slug, category, icon')
          .in('id', ptIds);

        if (ptData) {
          var ptMap: Record<string, any> = {};
          ptData.forEach(function (pt) { ptMap[pt.id] = pt; });
          Object.keys(reportMap).forEach(function (rid) {
            var r = reportMap[rid];
            if (r.phenomenon_type_id && ptMap[r.phenomenon_type_id]) {
              var pt = ptMap[r.phenomenon_type_id];
              r.phenomenon_type = { id: pt.id, name: pt.name, slug: pt.slug || '', category: pt.category };
            }
          });
        }
      }

      // Get associated images from linked phenomena (via report_phenomena junction)
      var reportIdsNoMedia = fullReports ? fullReports.filter(function (r) { return !r.has_photo_video; }).map(function (r) { return r.id; }) : [];
      if (reportIdsNoMedia.length > 0) {
        var { data: rpLinks } = await supabase
          .from('report_phenomena')
          .select('report_id, phenomenon_id')
          .in('report_id', reportIdsNoMedia);

        if (rpLinks && rpLinks.length > 0) {
          var phenIds = Array.from(new Set(rpLinks.map(function (l) { return l.phenomenon_id; })));
          var { data: phenData } = await supabase
            .from('phenomena')
            .select('id, name, primary_image_url')
            .in('id', phenIds);

          if (phenData) {
            var phenImgMap: Record<string, any> = {};
            phenData.forEach(function (ph) { phenImgMap[ph.id] = ph; });
            rpLinks.forEach(function (link) {
              var r = reportMap[link.report_id];
              var ph = phenImgMap[link.phenomenon_id];
              if (r && ph && ph.primary_image_url && ph.primary_image_url !== placeholderUrl && !r.associated_image_url) {
                r.associated_image_url = ph.primary_image_url;
                r.associated_image_source = ph.name;
              }
            });
          }
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
          // V8 Tier 1 — anchor-case fields (cold-open hook, signal
          // chips, unresolved tension). Card uses these as the new
          // lead when present; falls back to feed_hook otherwise.
          anchor_case_hook: p.anchor_case_hook || null,
          anchor_when: p.anchor_when || null,
          anchor_where: p.anchor_where || null,
          anchor_witness: p.anchor_witness || null,
          unresolved_tension: p.unresolved_tension || null,
          primary_image_url: p.primary_image_url,
          report_count: p.report_count,
          primary_regions: p.primary_regions,
          first_reported_date: p.first_reported_date,
          aliases: p.aliases,
        };
      } else {
        var r = reportMap[slot.id];
        if (!r) return null;
        // For index reports (anything that isn't curated/editorial), the
        // DB `summary` field may be a verbatim first-300-chars excerpt of
        // the source narrative. We never ship that to the client — swap
        // in an AI-generated alternative (paradocs_narrative / feed_hook).
        //
        // V10.7.E (QA #3, May 2026) — user_submission rows ARE safe to
        // surface raw summary for: it's the user's own first-person
        // account (or Whisper transcription of it). Previously these
        // rows were treated like ingested third-party content and had
        // their summary blanked, leaving the card body empty.
        var isSafeSummarySource = r.source_type === 'curated'
          || r.source_type === 'editorial'
          || r.source_type === 'user_submission';
        var safeSummary = r.summary;
        if (!isSafeSummarySource) {
          var n = r.paradocs_narrative;
          safeSummary = (n ? (n.length > 200 ? n.slice(0, 197).trim() + '...' : n) : null) || r.feed_hook || null;
        }
        return {
          item_type: 'report',
          id: r.id,
          title: r.title,
          slug: r.slug,
          summary: safeSummary,
          feed_hook: r.feed_hook || null,
          paradocs_narrative: r.paradocs_narrative || null,
          // V9.0 — anchor case fields. Card uses these as the new lead
          // when present; falls back to feed_hook → summary otherwise.
          anchor_case_hook: r.anchor_case_hook || null,
          anchor_when: r.anchor_when || null,
          anchor_where: r.anchor_where || null,
          anchor_witness: r.anchor_witness || null,
          unresolved_tension: r.unresolved_tension || null,
          category: r.category,
          country: r.country,
          city: r.city,
          state_province: r.state_province,
          event_date: r.event_date,
          event_date_precision: r.event_date_precision || null,
          credibility: r.credibility,
          upvotes: r.upvotes,
          view_count: r.view_count,
          comment_count: r.comment_count,
          has_photo_video: r.has_photo_video,
          has_physical_evidence: r.has_physical_evidence,
          // V10.7.E (QA #3) — pass through has_video + the joined video
          // object (signed playback URL + transcript segments) so the
          // feed renderer can choose the TikTok-style VideoReportCard
          // for approved user video submissions. Previously these two
          // fields were computed inside the handler but never returned
          // in the response, so the front-end check
          // `report.has_video && report.video?.playback_url` always
          // failed and the card fell through to the text branch.
          has_video: r.has_video || false,
          video: r.video || null,
          content_type: r.content_type,
          location_name: r.location_name,
          source_type: r.source_type,
          source_label: r.source_label,
          created_at: r.created_at,
          phenomenon_type: r.phenomenon_type || null,
          primary_media: r.primary_media || null,
          associated_image_url: r.associated_image_url || null,
          associated_image_source: r.associated_image_source || null,
          metadata: r.metadata || null,
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
