/**
 * API: GET /api/discover/feed
 * Returns a shuffled, weighted feed of phenomena for the TikTok-style discovery experience.
 * No auth required — this is the top-of-funnel hook.
 *
 * Query params:
 *   - cursor: comma-separated list of already-seen phenomenon IDs (for infinite scroll)
 *   - limit: number of items to return (default 10, max 20)
 *   - category: optional category filter
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);
    const excludeIds = (req.query.cursor as string)?.split(',').filter(Boolean) || [];
    const category = req.query.category as string | undefined;

    // We fetch more than needed to allow weighted selection
    const fetchLimit = Math.min(limit * 4, 80);

    let query = supabase
      .from('phenomena')
      .select('id, name, slug, category, icon, ai_summary, ai_description, ai_quick_facts, primary_image_url, report_count, primary_regions, first_reported_date, aliases')
      .eq('status', 'active')
      .not('ai_summary', 'is', null);

    if (category) {
      query = query.eq('category', category);
    }

    // Exclude already-seen entries
    if (excludeIds.length > 0) {
      query = query.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    // Fetch candidates ordered by report_count (we'll shuffle with weights)
    const { data: candidates, error } = await query
      .order('report_count', { ascending: false })
      .limit(fetchLimit);

    if (error) {
      console.error('[Discover Feed] Query error:', error);
      return res.status(500).json({ error: 'Failed to fetch feed' });
    }

    if (!candidates || candidates.length === 0) {
      return res.status(200).json({
        items: [],
        hasMore: false,
        totalAvailable: 0,
      });
    }

    // Default placeholder URL for comparison
    const placeholderUrl = 'https://bhkbctdmwnowfmqpksed.supabase.co/storage/v1/object/public/phenomena-images/default-cryptid.jpg';

    // Weighted shuffle: prioritize entries with real images and complete content
    const weighted = candidates.map(item => {
      let weight = 1;

      // Boost entries with real images (not placeholder)
      if (item.primary_image_url && item.primary_image_url !== placeholderUrl) {
        weight += 3;
      }

      // Boost entries with complete AI content
      if (item.ai_description) weight += 1;
      if (item.ai_quick_facts) weight += 1;

      // Boost entries with higher report counts
      if (item.report_count > 0) weight += 2;
      if (item.report_count >= 5) weight += 1;

      // Add randomness
      weight *= (0.5 + Math.random());

      return { ...item, _weight: weight };
    });

    // Sort by weight descending, then pick top `limit`
    weighted.sort((a, b) => b._weight - a._weight);

    // Ensure category variety: don't show more than 3 of same category in a row
    const selected: typeof weighted = [];
    const remaining = [...weighted];
    let lastCategory = '';
    let sameCatStreak = 0;

    while (selected.length < limit && remaining.length > 0) {
      let pickIdx = 0;

      // If we've had 2 of the same category, try to find a different one
      if (sameCatStreak >= 2) {
        const diffIdx = remaining.findIndex(r => r.category !== lastCategory);
        if (diffIdx >= 0) pickIdx = diffIdx;
      }

      const pick = remaining.splice(pickIdx, 1)[0];
      selected.push(pick);

      if (pick.category === lastCategory) {
        sameCatStreak++;
      } else {
        sameCatStreak = 1;
        lastCategory = pick.category;
      }
    }

    // Clean up internal weight field
    const items = selected.map(({ _weight, ...item }) => item);

    // Check if there are more items available
    const totalSeen = excludeIds.length + items.length;
    let totalAvailable = candidates.length;
    if (candidates.length === fetchLimit) {
      // There might be more — do a quick count
      const { count } = await supabase
        .from('phenomena')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .not('ai_summary', 'is', null);
      totalAvailable = (count || 0) - excludeIds.length;
    }

    return res.status(200).json({
      items,
      hasMore: totalAvailable > items.length,
      totalAvailable,
      cursor: [...excludeIds, ...items.map(i => i.id)].join(','),
    });
  } catch (error) {
    console.error('[Discover Feed] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
