// API endpoint to trigger media backfill
// POST /api/admin/backfill-media

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { backfillRedditMedia, backfillAiTags } from '@/lib/media';

// Simple admin auth check
function isAdmin(req: NextApiRequest): boolean {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    console.warn('[Backfill API] No ADMIN_API_KEY configured');
    return false;
  }

  return authHeader === `Bearer ${adminKey}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const {
      type = 'media',      // 'media' or 'ai-tags'
      limit = 50,
      dryRun = false,
      runAiAnalysis = true
    } = req.body;

    console.log(`[Backfill API] Starting ${type} backfill (limit: ${limit}, dryRun: ${dryRun})`);

    let result;

    if (type === 'ai-tags') {
      // Only run AI analysis on existing media
      result = await backfillAiTags({ limit, dryRun });
    } else {
      // Full media backfill
      result = await backfillRedditMedia({
        limit,
        dryRun,
        runAiAnalysis,
        batchSize: 10,
        delayMs: 2000
      });
    }

    return res.status(200).json({
      success: true,
      type,
      result
    });
  } catch (error) {
    console.error('[Backfill API] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Backfill failed'
    });
  }
}

// Config for longer timeout (backfill can take a while)
export const config = {
  maxDuration: 300, // 5 minutes
};
