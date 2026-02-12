/**
 * Batch Title Backfill API
 *
 * POST /api/admin/backfill-titles
 *
 * Modes:
 *   "restore"  - Revert titles that were overwritten by pattern pass back to original_title
 *   "clean"    - Clean up Reddit titles (fix caps, remove meta, trim) while keeping them unique
 *   "pattern"  - Full pattern-based replacement (use sparingly — creates duplicates)
 *   "ai"       - AI-based extraction for generic titles (costs money)
 *
 * Body params:
 *   batchSize: number (default varies by mode)
 *   offset: number (default: 0)
 *   mode: "restore" | "clean" | "pattern" | "ai" (default: "clean")
 *   dryRun: boolean (default: false)
 *
 * Uses Supabase Bearer token auth.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { improveTitle, analyzeTitleQuality } from '@/lib/ingestion/filters/title-improver';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = 'williamschaseh@gmail.com';

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

/**
 * Clean a Reddit title without replacing it entirely.
 * Preserves the unique content but fixes formatting issues.
 */
function cleanRedditTitle(title: string): { cleaned: string; wasChanged: boolean } {
  let cleaned = title;

  // Remove Reddit meta brackets: [Serious], [Update], [OC], etc.
  cleaned = cleaned.replace(/\[(?:Serious|Update|OC|Original|Repost|Long|Short|True|Meta|Debunked)\]\s*/gi, '');
  // Remove trailing brackets too
  cleaned = cleaned.replace(/\s*\[(?:Serious|Update|OC|Original|Repost|Long|Short|True|Meta|Debunked)\]$/gi, '');

  // Fix ALL CAPS (but not short acronyms like "UFO" or "CIA")
  if (cleaned.length > 15 && cleaned === cleaned.toUpperCase()) {
    cleaned = cleaned.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    // Restore common paranormal acronyms
    cleaned = cleaned.replace(/\bUfo\b/g, 'UFO');
    cleaned = cleaned.replace(/\bUap\b/g, 'UAP');
    cleaned = cleaned.replace(/\bEvp\b/g, 'EVP');
    cleaned = cleaned.replace(/\bEmf\b/g, 'EMF');
    cleaned = cleaned.replace(/\bNde\b/g, 'NDE');
    cleaned = cleaned.replace(/\bObe\b/g, 'OBE');
    cleaned = cleaned.replace(/\bMib\b/g, 'MIB');
  }

  // Fix all lowercase (but preserve short titles that might be stylistic)
  if (cleaned.length > 15 && cleaned === cleaned.toLowerCase()) {
    // Capitalize first letter of each sentence
    cleaned = cleaned.replace(/(^|[.!?]\s+)([a-z])/g, (_, pre, letter) => pre + letter.toUpperCase());
    // Ensure first char is capitalized
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Trim excessive length but keep the content meaningful
  // For very long titles (>120 chars), truncate at a natural break point
  if (cleaned.length > 120) {
    // Try to cut at sentence boundary
    const sentenceEnd = cleaned.substring(0, 120).lastIndexOf('. ');
    const commaBreak = cleaned.substring(0, 120).lastIndexOf(', ');
    const dashBreak = cleaned.substring(0, 120).lastIndexOf(' - ');

    if (sentenceEnd > 60) {
      cleaned = cleaned.substring(0, sentenceEnd + 1);
    } else if (dashBreak > 60) {
      cleaned = cleaned.substring(0, dashBreak);
    } else if (commaBreak > 60) {
      cleaned = cleaned.substring(0, commaBreak);
    } else {
      // Fall back to word boundary
      const spaceBreak = cleaned.substring(0, 117).lastIndexOf(' ');
      cleaned = cleaned.substring(0, spaceBreak > 60 ? spaceBreak : 117) + '...';
    }
  }

  // Remove leading/trailing whitespace and fix double spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Remove trailing punctuation that looks weird for a title (multiple periods, etc.)
  cleaned = cleaned.replace(/\.{2,}$/, '...');
  cleaned = cleaned.replace(/[,;:]$/, '');

  return {
    cleaned,
    wasChanged: cleaned !== title
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    batchSize: requestedBatchSize,
    offset = 0,
    mode = 'clean',
    dryRun = false
  } = req.body;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    if (mode === 'restore') {
      return await handleRestoreMode(supabase, requestedBatchSize || 500, offset, dryRun, res);
    } else if (mode === 'clean') {
      return await handleCleanMode(supabase, requestedBatchSize || 500, offset, dryRun, res);
    } else if (mode === 'pattern') {
      return await handlePatternMode(supabase, requestedBatchSize || 500, offset, dryRun, res);
    } else if (mode === 'ai') {
      return await handleAiMode(supabase, requestedBatchSize || 20, offset, dryRun, res);
    } else {
      return res.status(400).json({ error: `Invalid mode: ${mode}` });
    }
  } catch (error) {
    console.error('[Backfill Titles] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * RESTORE MODE: Revert pattern-replaced titles back to original_title
 * For reports where original_title differs from title (meaning we replaced it)
 */
async function handleRestoreMode(
  supabase: any,
  batchSize: number,
  offset: number,
  dryRun: boolean,
  res: NextApiResponse
) {
  // Find reports where title != original_title (meaning pattern pass changed them)
  const { data: reports, error, count } = await supabase
    .from('reports')
    .select('id, title, original_title', { count: 'exact' })
    .in('source_type', ['reddit', 'reddit-comments'])
    .not('original_title', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) throw new Error(`Database query error: ${error.message}`);

  if (!reports || reports.length === 0) {
    return res.status(200).json({
      success: true, done: true, mode: 'restore',
      results: { processed: 0, restored: 0, alreadySame: 0 },
      nextOffset: offset
    });
  }

  let restored = 0;
  let alreadySame = 0;
  const samples: Array<{ current: string; restoredTo: string }> = [];

  for (const report of reports) {
    if (report.title === report.original_title) {
      alreadySame++;
      continue;
    }

    restored++;
    if (samples.length < 5) {
      samples.push({
        current: report.title.substring(0, 80),
        restoredTo: report.original_title.substring(0, 80)
      });
    }

    if (!dryRun) {
      await supabase
        .from('reports')
        .update({ title: report.original_title, original_title: null })
        .eq('id', report.id);
    }
  }

  return res.status(200).json({
    success: true,
    done: reports.length < batchSize,
    mode: 'restore',
    dryRun,
    results: {
      processed: reports.length,
      restored,
      alreadySame,
      samples
    },
    nextOffset: offset + reports.length,
    totalRemaining: count ? count - reports.length : undefined
  });
}

/**
 * CLEAN MODE: Fix formatting on Reddit titles without replacing content
 * Keeps the unique original content but fixes caps, removes meta, trims length
 */
async function handleCleanMode(
  supabase: any,
  batchSize: number,
  offset: number,
  dryRun: boolean,
  res: NextApiResponse
) {
  // Fetch Reddit reports that haven't been cleaned yet (original_title is null)
  const { data: reports, error, count } = await supabase
    .from('reports')
    .select('id, title, description, category, location_name, event_date, source_type', { count: 'exact' })
    .in('source_type', ['reddit', 'reddit-comments'])
    .is('original_title', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) throw new Error(`Database query error: ${error.message}`);

  if (!reports || reports.length === 0) {
    return res.status(200).json({
      success: true, done: true, mode: 'clean',
      results: { processed: 0, cleaned: 0, alreadyGood: 0 },
      nextOffset: offset
    });
  }

  let cleaned = 0;
  let alreadyGood = 0;
  const samples: Array<{ old: string; new: string }> = [];
  const updates: Array<{ id: string; title: string; original_title: string }> = [];

  for (const report of reports) {
    const result = cleanRedditTitle(report.title);

    if (result.wasChanged) {
      cleaned++;
      updates.push({
        id: report.id,
        title: result.cleaned,
        original_title: report.title
      });
      if (samples.length < 5) {
        samples.push({
          old: report.title.substring(0, 80),
          new: result.cleaned.substring(0, 80)
        });
      }
    } else {
      alreadyGood++;
      // Mark as processed
      updates.push({
        id: report.id,
        title: report.title,
        original_title: report.title
      });
    }
  }

  // Bulk update
  if (!dryRun && updates.length > 0) {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      const promises = chunk.map(u =>
        supabase
          .from('reports')
          .update({ title: u.title, original_title: u.original_title })
          .eq('id', u.id)
      );
      await Promise.all(promises);
    }
  }

  return res.status(200).json({
    success: true,
    done: reports.length < batchSize,
    mode: 'clean',
    dryRun,
    results: {
      processed: reports.length,
      cleaned,
      alreadyGood,
      samples
    },
    nextOffset: offset + reports.length,
    totalRemaining: count ? count - reports.length : undefined
  });
}

/**
 * PATTERN MODE: Full pattern-based replacement (creates duplicates — use sparingly)
 */
async function handlePatternMode(
  supabase: any,
  batchSize: number,
  offset: number,
  dryRun: boolean,
  res: NextApiResponse
) {
  const { data: reports, error, count } = await supabase
    .from('reports')
    .select('id, title, description, category, location_name, event_date, source_type, tags', { count: 'exact' })
    .in('source_type', ['reddit', 'reddit-comments'])
    .is('original_title', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) throw new Error(`Database query error: ${error.message}`);

  if (!reports || reports.length === 0) {
    return res.status(200).json({
      success: true, done: true, mode: 'pattern',
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
    const issues = analyzeTitleQuality(report.title);
    if (issues.length === 0) {
      alreadyGood++;
      updates.push({ id: report.id, title: report.title, original_title: report.title });
      continue;
    }

    const result = improveTitle(
      report.title,
      report.description || '',
      report.category || 'other',
      report.location_name,
      report.event_date
    );

    if (result.wasImproved) {
      improved++;
      updates.push({ id: report.id, title: result.title, original_title: report.title });
      if (sampleImprovements.length < 5) {
        sampleImprovements.push({ old: report.title.substring(0, 80), new: result.title.substring(0, 80) });
      }
    } else {
      skipped++;
      updates.push({ id: report.id, title: report.title, original_title: report.title });
    }
  }

  if (!dryRun && updates.length > 0) {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(u =>
        supabase.from('reports').update({ title: u.title, original_title: u.original_title }).eq('id', u.id)
      ));
    }
  }

  return res.status(200).json({
    success: true,
    done: reports.length < batchSize,
    mode: 'pattern',
    dryRun,
    results: { processed: reports.length, improved, skipped, alreadyGood, sampleImprovements },
    nextOffset: offset + reports.length,
    totalRemaining: count ? count - reports.length : undefined
  });
}

/**
 * AI MODE: Placeholder for AI-based improvement
 */
async function handleAiMode(
  supabase: any,
  batchSize: number,
  offset: number,
  dryRun: boolean,
  res: NextApiResponse
) {
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, title, description, category, location_name, original_title')
    .in('source_type', ['reddit', 'reddit-comments'])
    .not('original_title', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) throw new Error(`Database query error: ${error.message}`);

  return res.status(200).json({
    success: true,
    done: !reports || reports.length < batchSize,
    mode: 'ai',
    results: {
      processed: reports?.length || 0,
      message: 'AI mode queries identified. Use /api/admin/fix-titles for AI processing.'
    },
    nextOffset: offset + (reports?.length || 0)
  });
}

export const config = {
  maxDuration: 300,
};
