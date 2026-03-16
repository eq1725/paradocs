/**
 * API: GET /api/discover/feed
 * Returns a deterministically shuffled feed of phenomena for the TikTok-style discovery experience.
 * No auth required — this is the top-of-funnel hook.
 *
 * Query params:
 *   - seed: numeric seed for deterministic shuffle (generated per session on client)
 *   - offset: how many items to skip (for pagination, replaces cursor)
 *   - limit: number of items to return (default 15, max 30)
 *   - category: optional category filter
 *
 * The seed ensures the same user session always gets the same order,
 * eliminating duplicates for 100+ scrolls without passing huge cursor strings.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Seeded PRNG (mulberry32) — deterministic random from a numeric seed.
 * Same seed always produces the same sequence.
 */
function seededRandom(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using a seeded PRNG.
 * Deterministic: same seed + same input = same output.
 */
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

// In-memory cache for the full ID list to avoid re-fetching on every page
var idCache: { ids: string[]; timestamp: number; category: string } | null = null;
var ID_CACHE_TTL = 60 * 1000; // 1 minute

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

    // --- Legacy cursor support (backward compat) ---
    var legacyCursor = req.query.cursor as string;
    if (legacyCursor && !req.query.offset) {
      // If old client sends cursor, convert to offset
      var seenIds = legacyCursor.split(',').filter(Boolean);
      offset = seenIds.length;
    }

    // Default placeholder URL for comparison
    var placeholderUrl = 'https://bhkbctdmwnowfmqpksed.supabase.co/storage/v1/object/public/phenomena-images/default-cryptid.jpg';

    // Step 1: Fetch ALL eligible IDs with lightweight fields for scoring
    // This is fast — just id, category, report_count, image_url, and content flags
    var cacheKey = category || '__all__';
    var now = Date.now();
    var allIds: Array<{ id: string; category: string; score: number }>;

    if (idCache && idCache.category === cacheKey && (now - idCache.timestamp) < ID_CACHE_TTL) {
      // Use cached — skip the query entirely for pagination requests
      // We still need scores for ordering, so we'll re-fetch full list on cache miss
      allIds = []; // Will be populated from full fetch below
    }

    // Always need the full scored list for deterministic ordering
    var baseQuery = supabase
      .from('phenomena')
      .select('id, category, report_count, primary_image_url, ai_description, ai_quick_facts')
      .eq('status', 'active')
      .not('ai_summary', 'is', null);

    if (category) {
      baseQuery = baseQuery.eq('category', category);
    }

    var { data: allCandidates, error: allError } = await baseQuery
      .order('report_count', { ascending: false })
      .limit(1000);

    if (allError) {
      console.error('[Discover Feed] Query error:', allError);
      return res.status(500).json({ error: 'Failed to fetch feed' });
    }

    if (!allCandidates || allCandidates.length === 0) {
      return res.status(200).json({
        items: [],
        hasMore: false,
        totalAvailable: 0,
      });
    }

    // Step 2: Score each candidate (deterministic — no Math.random())
    var scored = allCandidates.map(function (item) {
      var score = 1;
      if (item.primary_image_url && item.primary_image_url !== placeholderUrl) {
        score += 3;
      }
      if (item.ai_description) score += 1;
      if (item.ai_quick_facts) score += 1;
      if (item.report_count > 0) score += 2;
      if (item.report_count >= 5) score += 1;
      return { id: item.id, category: item.category, score: score };
    });

    // Step 3: Deterministic seeded shuffle with interleaved quality tiers.
    // Instead of showing ALL high-tier first (boring — user sees the same
    // "top 15" every time), we interleave: for every 5 items, pick ~3 high,
    // ~1 mid, ~1 low (when available). This ensures quality stays high while
    // creating genuine variety across sessions with different seeds.
    scored.sort(function (a, b) { return b.score - a.score; });

    var highTier = seededShuffle(
      scored.filter(function (s) { return s.score >= 7; }), seed
    );
    var midTier = seededShuffle(
      scored.filter(function (s) { return s.score >= 4 && s.score < 7; }), seed + 1
    );
    var lowTier = seededShuffle(
      scored.filter(function (s) { return s.score < 4; }), seed + 2
    );

    // Interleave: 3 high, 1 mid, 1 low per batch (explore-exploit pattern)
    var shuffledOrder: typeof scored = [];
    var hi = 0, mi = 0, lo = 0;
    while (hi < highTier.length || mi < midTier.length || lo < lowTier.length) {
      // Pull up to 3 from high tier
      for (var k = 0; k < 3 && hi < highTier.length; k++) {
        shuffledOrder.push(highTier[hi++]);
      }
      // Pull 1 from mid tier
      if (mi < midTier.length) {
        shuffledOrder.push(midTier[mi++]);
      }
      // Pull 1 from low tier (discovery/surprise slot)
      if (lo < lowTier.length) {
        shuffledOrder.push(lowTier[lo++]);
      }
    }

    // Step 4: Apply category variety — no more than 2 same category in a row
    var diversified: typeof shuffledOrder = [];
    var pool = shuffledOrder.slice();
    var lastCat = '';
    var catStreak = 0;

    while (pool.length > 0) {
      var pickIdx = 0;
      if (catStreak >= 2) {
        var diffIdx = pool.findIndex(function (r) { return r.category !== lastCat; });
        if (diffIdx >= 0) pickIdx = diffIdx;
      }
      var pick = pool.splice(pickIdx, 1)[0];
      diversified.push(pick);
      if (pick.category === lastCat) {
        catStreak++;
      } else {
        catStreak = 1;
        lastCat = pick.category;
      }
    }

    var totalAvailable = diversified.length;

    // Step 5: Slice the page
    var pageIds = diversified.slice(offset, offset + limit).map(function (d) { return d.id; });

    if (pageIds.length === 0) {
      return res.status(200).json({
        items: [],
        hasMore: false,
        totalAvailable: totalAvailable,
      });
    }

    // Step 6: Fetch full data for just this page's IDs
    var { data: fullItems, error: fullError } = await supabase
      .from('phenomena')
      .select('id, name, slug, category, icon, ai_summary, ai_description, ai_quick_facts, primary_image_url, report_count, primary_regions, first_reported_date, aliases')
      .in('id', pageIds);

    if (fullError) {
      console.error('[Discover Feed] Detail query error:', fullError);
      return res.status(500).json({ error: 'Failed to fetch details' });
    }

    // Preserve the deterministic order from our shuffle
    var idOrder: Record<string, number> = {};
    pageIds.forEach(function (id, i) { idOrder[id] = i; });
    var items = (fullItems || []).sort(function (a, b) {
      return (idOrder[a.id] || 0) - (idOrder[b.id] || 0);
    });

    // Set aggressive cache headers for pagination requests
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
    console.error('[Discover Feed] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
