/**
 * Batch Title Backfill API
 *
 * POST /api/admin/backfill-titles
 *
 * Two-pass title improvement for ~1.5M Reddit reports:
 *   Pass 1 (mode: "pattern") - Free pattern-based improvement using title-improver.ts
 *   Pass 2 (mode: "ai") - AI-based extraction for remaining generic titles
 *
 * Body params:
 *   batchSize: number (default: 500 for pattern, 20 for AI)
 *   offset: number (default: 0)
 *   mode: "pattern" | "ai" (default: "pattern")
 *   dryRun: boolean (default: false)
 *
 * Uses Supabase Bearer token auth (same as batch-link).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { improveTitle, analyzeTitleQuality } from '@/lib/ingestion/filters/title-improver';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = 'williamschaseh@gmail.com';

// Get user from Bearer token
async function getAuthenticatedUser(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

// Title quality heuristics - detect titles that need improvement
function needsImprovement(title: string): boolean {
  // All lowercase
  if (title === title.toLowerCase() && title.length > 10) return true;
  // Very long (raw Reddit titles tend to be full sentences)
  if (title.length > 100) return true;
  // Starts with "I " or "My " or "So " (personal narrative, not a good title)
  if (/^(I |My |So |We |Just |Does |Has |What |Why |How |Anyone |Is |Was |Do |Did |Can |Could |Should |Would |Have |Had |This |That |There |When |Where |If |Any |Am |Are |Been )/i.test(title)) return true;
  // Question format
  if (title.endsWith('?')) return true;
  // Contains "[" brackets (Reddit meta like [Serious], [Update])
  if (title.includes('[')) return true;
  // Very short and generic
  if (title.length < 15) return true;
  // Contains "video" or "photo" references that aren't descriptive
  if (/^(check|look|watch|see|here)/i.test(title)) return true;
  // Run the full quality analysis
  const issues = analyzeTitleQuality(title);
  return issues.length > 0;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  const user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    batchSize: requestedBatchSize,
    offset = 0,
    mode = 'pattern',
    dryRun = false
  } = req.body;

  // Default batch sizes differ by mode
  const batchSize = requestedBatchSize || (mode === 'pattern' ? 500 : 20);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    if (mode === 'pattern') {
      return await handlePatternMode(supabase, batchSize, offset, dryRun, res);
    } else if (mode === 'ai') {
      return await handleAiMode(supabase, batchSize, offset, dryRun, res);
    } else {
      return res.status(400).json({ error: `Invalid mode: ${mode}. Use "pattern" or "ai".` });
    }
  } catch (error) {
    console.error('[Backfill Titles] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Pass 1: Pattern-based title improvement (free, fast)
 *
 * Fetches Reddit reports in batches, runs title-improver.ts patterns,
 * and bulk updates improved titles. Preserves original in original_title.
 */
async function handlePatternMode(
  supabase: any,
  batchSize: number,
  offset: number,
  dryRun: boolean,
  res: NextApiResponse
) {
  // Fetch a batch of Reddit reports that don't have original_title set yet
  // (original_title being null means they haven't been processed by title improvement)
  const { data: reports, error, count } = await supabase
    .from('reports')
    .select('id, title, description, category, location_name, event_date, source_type, tags', { count: 'exact' })
    .in('source_type', ['reddit', 'reddit-comments'])
    .is('original_title', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) {
    throw new Error(`Database query error: ${error.message}`);
  }

  if (!reports || reports.length === 0) {
    return res.status(200).json({
      success: true,
      done: true,
      results: { processed: 0, improved: 0, skipped: 0, alreadyGood: 0 },
      nextOffset: offset
    });
  }

  let improved = 0;
  let skipped = 0;
  let alreadyGood = 0;
  const sampleImprovements: Array<{ old: string; new: string }> = [];
  const updates: Array<{ id: string; title: string; original_title: string }> = [];

  for (const report of reports) {
    // Check if title needs improvement
    if (!needsImprovement(report.title)) {
      alreadyGood++;
      // Still mark it as processed by setting original_title = title
      updates.push({
        id: report.id,
        title: report.title,
        original_title: report.title
      });
      continue;
    }

    // Run pattern-based title improvement
    const result = improveTitle(
      report.title,
      report.description || '',
      report.category || 'other',
      report.location_name,
      report.event_date
    );

    if (result.wasImproved) {
      improved++;
      updates.push({
        id: report.id,
        title: result.title,
        original_title: report.title
      });

      if (sampleImprovements.length < 5) {
        sampleImprovements.push({
          old: report.title.substring(0, 80),
          new: result.title.substring(0, 80)
        });
      }
    } else {
      skipped++;
      // Mark as processed even if not improved
      updates.push({
        id: report.id,
        title: report.title,
        original_title: report.title
      });
    }
  }

  // Bulk update in chunks
  if (!dryRun && updates.length > 0) {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      // Update each report (Supabase doesn't support bulk update with different values per row)
      const promises = chunk.map(u =>
        supabase
          .from('reports')
          .update({ title: u.title, original_title: u.original_title })
          .eq('id', u.id)
      );
      await Promise.all(promises);
    }
  }

  const nextOffset = offset + reports.length;
  const done = reports.length < batchSize;

  return res.status(200).json({
    success: true,
    done,
    mode: 'pattern',
    dryRun,
    results: {
      processed: reports.length,
      improved,
      skipped,
      alreadyGood,
      sampleImprovements
    },
    nextOffset,
    totalRemaining: count ? count - reports.length : undefined
  });
}

/**
 * Pass 2: AI-based title improvement (costs money)
 *
 * For reports that still have generic/poor titles after pattern pass.
 * Uses the same approach as fix-titles.ts but in batch mode.
 */
async function handleAiMode(
  supabase: any,
  batchSize: number,
  offset: number,
  dryRun: boolean,
  res: NextApiResponse
) {
  // For AI mode, find reports that have original_title set (already processed by pattern pass)
  // but still have generic/poor titles
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, title, description, category, location_name, event_date, source_type, original_title')
    .in('source_type', ['reddit', 'reddit-comments'])
    .not('original_title', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) {
    throw new Error(`Database query error: ${error.message}`);
  }

  if (!reports || reports.length === 0) {
    return res.status(200).json({
      success: true,
      done: true,
      mode: 'ai',
      results: { processed: 0, improved: 0, skipped: 0, needsAi: 0 }
    });
  }

  // Filter to only reports that still need improvement
  const needsWork = reports.filter((r: any) => needsImprovement(r.title));

  return res.status(200).json({
    success: true,
    done: reports.length < batchSize,
    mode: 'ai',
    dryRun,
    results: {
      processed: reports.length,
      needsAi: needsWork.length,
      message: 'AI mode queries identified. Use /api/admin/fix-titles for AI processing (costs ~$0.002/report).'
    },
    nextOffset: offset + reports.length
  });
}

export const config = {
  maxDuration: 300, // 5 minutes
};
