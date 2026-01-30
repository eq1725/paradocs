/**
 * API endpoint to clean up garbage Wikipedia entries
 *
 * POST /api/admin/cleanup-garbage
 *
 * Only runs in development mode or with admin auth
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

// Patterns that indicate garbage data
const garbageTitlePatterns = [
  /^\.mw/i,           // MediaWiki CSS classes
  /^@media/i,         // CSS media queries
  /^\{/,              // JSON/CSS blocks
  /^html\./i,         // CSS selectors
  /^\.skin/i,         // Wikipedia skin CSS
  /^#/,               // CSS ID selectors
  /^function\s/i,     // JavaScript
  /^var\s/i,          // JavaScript
  /^const\s/i,        // JavaScript
  /^\s*\d+\s*$/,      // Just numbers
  /^parser$/i,        // Parser artifacts
  /^theme$/i,         // Theme artifacts
  /^\^/,              // Citation markers
  /^\[/,              // Reference brackets
];

const skipTitlePatterns = [
  /^see also/i,
  /^references$/i,
  /^external links/i,
  /^notes$/i,
  /^bibliography/i,
  /^further reading/i,
  /^main article/i,
  /^citation needed/i,
];

function isGarbageReport(title: string | null, summary: string | null): boolean {
  if (!title || title.length < 5) return true;
  if (!summary || summary.length < 20) return true;

  for (const pattern of garbageTitlePatterns) {
    if (pattern.test(title.trim())) return true;
  }

  for (const pattern of skipTitlePatterns) {
    if (pattern.test(title.trim())) return true;
  }

  const alphanumeric = title.replace(/[^a-zA-Z0-9]/g, '').length;
  if (alphanumeric / title.length < 0.5) return true;

  if (/[{}<>]/.test(title)) return true;

  return false;
}

function getGarbageReason(title: string | null, summary: string | null): string {
  if (!title || title.length < 5) return 'title too short';
  if (!summary || summary.length < 20) return 'summary too short';

  if (/^\.mw/i.test(title)) return 'CSS class (.mw)';
  if (/^@media/i.test(title)) return 'CSS media query';
  if (/^\^/.test(title)) return 'citation marker';
  if (/^\[/.test(title)) return 'reference bracket';
  if (/^\{/.test(title)) return 'code/JSON block';
  if (/^html\./i.test(title)) return 'CSS selector';
  if (/^#/.test(title)) return 'CSS ID selector';

  const alphanumeric = title.replace(/[^a-zA-Z0-9]/g, '').length;
  if (alphanumeric / title.length < 0.5) return 'low alphanumeric ratio';

  if (/[{}<>]/.test(title)) return 'contains code characters';

  return 'failed validation';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for dry run mode
  const dryRun = req.query.dry === 'true';

  try {
    const supabase = createServerClient();

    // Fetch all Wikipedia entries
    const { data: reports, error: fetchError } = await supabase
      .from('reports')
      .select('id, title, summary')
      .eq('source_type', 'wikipedia');

    if (fetchError) {
      return res.status(500).json({ error: 'Failed to fetch reports', details: fetchError });
    }

    if (!reports || reports.length === 0) {
      return res.json({ message: 'No Wikipedia reports found', deleted: 0 });
    }

    // Find garbage entries
    const garbageIds: string[] = [];
    const garbageExamples: Array<{ title: string; reason: string }> = [];

    for (const report of reports) {
      if (isGarbageReport(report.title, report.summary)) {
        garbageIds.push(report.id);
        if (garbageExamples.length < 20) {
          garbageExamples.push({
            title: (report.title || '').substring(0, 60),
            reason: getGarbageReason(report.title, report.summary)
          });
        }
      }
    }

    // If dry run, just return what would be deleted
    if (dryRun) {
      return res.json({
        dryRun: true,
        totalWikipedia: reports.length,
        wouldDelete: garbageIds.length,
        examples: garbageExamples
      });
    }

    if (garbageIds.length === 0) {
      return res.json({
        message: 'No garbage entries found',
        totalWikipedia: reports.length,
        deleted: 0
      });
    }

    // Delete in batches
    const batchSize = 50;
    let deleted = 0;
    const errors: string[] = [];

    for (let i = 0; i < garbageIds.length; i += batchSize) {
      const batch = garbageIds.slice(i, i + batchSize);

      const { error: deleteError } = await supabase
        .from('reports')
        .delete()
        .in('id', batch);

      if (deleteError) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${deleteError.message}`);
      } else {
        deleted += batch.length;
      }
    }

    // Get remaining count
    const { count } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('source_type', 'wikipedia');

    return res.json({
      message: 'Cleanup complete',
      totalWikipedia: reports.length,
      deleted,
      remaining: count,
      examples: garbageExamples,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
