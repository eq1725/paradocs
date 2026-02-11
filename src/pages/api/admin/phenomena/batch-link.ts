/**
 * Batch Link Reports to Phenomena API (v2 - Optimized)
 *
 * Efficiently links existing reports to phenomena using pattern matching.
 * Uses keyword/alias matching for fast processing without AI calls.
 *
 * Optimizations over v1:
 * - Bulk upsert instead of individual inserts (massive DB round-trip reduction)
 * - Pre-compiled regex patterns (avoid re-creating per report)
 * - Complete category mapping for all 11 categories
 * - Min pattern length guard to prevent false positives
 * - 300s timeout to process larger batches per call
 *
 * Run in batches to process the full 1.9M+ report database.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';

// Admin email check
const ADMIN_EMAIL = 'williamschaseh@gmail.com';

// Minimum pattern length to avoid false positives (e.g. "MIB" is 3, which is fine)
const MIN_PATTERN_LENGTH = 3;

// Max links to upsert in a single DB call
const UPSERT_CHUNK_SIZE = 500;

// Helper to get user from cookies/headers
async function getAuthenticatedUser(req: NextApiRequest): Promise<{ id: string; email: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Try Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { id: user.id, email: user.email || '' };
    }
  }

  // Try cookie-based auth
  const cookies = req.headers.cookie || '';
  const accessTokenMatch = cookies.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (accessTokenMatch) {
    try {
      const tokenData = JSON.parse(decodeURIComponent(accessTokenMatch[1]));
      if (tokenData?.access_token) {
        const supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
            },
          },
        });
        const { data: { user } } = await supabaseWithToken.auth.getUser();
        if (user) {
          return { id: user.id, email: user.email || '' };
        }
      }
    } catch (e) {
      // Cookie parse error, continue
    }
  }

  return null;
}

interface PhenomenonMatcher {
  id: string;
  name: string;
  category: string;
  // Pre-compiled regex for each pattern, grouped by field priority
  compiledPatterns: { regex: RegExp; raw: string }[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createServerClient();

  try {
    const {
      batchSize = 1000,
      offset = 0,
      dryRun = false,
      category = null // Optional: filter by report category
    } = req.body;

    console.log(`[BatchLink] Starting batch link: offset=${offset}, batchSize=${batchSize}, dryRun=${dryRun}`);

    // Get all phenomena with their patterns
    const { data: phenomena } = await supabase
      .from('phenomena')
      .select('id, name, aliases, category')
      .eq('status', 'active');

    if (!phenomena || phenomena.length === 0) {
      return res.status(400).json({ error: 'No phenomena found' });
    }

    // Pre-compile regex patterns once (not per report)
    const phenomenaMatchers: PhenomenonMatcher[] = phenomena.map(p => {
      const rawPatterns = [
        p.name.toLowerCase(),
        ...(p.aliases || []).map((a: string) => a.toLowerCase())
      ].filter(Boolean).filter((pat: string) => pat.length >= MIN_PATTERN_LENGTH);

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        compiledPatterns: rawPatterns.map((pat: string) => ({
          regex: new RegExp(`\\b${escapeRegex(pat)}\\b`, 'i'),
          raw: pat,
        })),
      };
    });

    console.log(`[BatchLink] ${phenomenaMatchers.length} phenomena with ${phenomenaMatchers.reduce((sum, p) => sum + p.compiledPatterns.length, 0)} total patterns`);

    // Get reports batch
    let query = supabase
      .from('reports')
      .select('id, title, summary, description, category')
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (category) {
      query = query.eq('category', category);
    }

    const { data: reports, error: reportsError } = await query;

    if (reportsError) {
      console.error('[BatchLink] Error fetching reports:', reportsError);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }

    if (!reports || reports.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No more reports to process',
        results: { processed: 0, linked: 0, matches: 0, skipped: 0 },
        nextOffset: null,
        done: true,
      });
    }

    // Get existing links to avoid duplicates
    const reportIds = reports.map(r => r.id);
    const { data: existingLinks } = await supabase
      .from('report_phenomena')
      .select('report_id, phenomenon_id')
      .in('report_id', reportIds);

    const existingLinkSet = new Set(
      (existingLinks || []).map(l => `${l.report_id}:${l.phenomenon_id}`)
    );

    const results = {
      processed: 0,
      linked: 0,
      matches: 0,
      skipped: 0,
      newLinks: [] as { reportId: string; reportTitle: string; phenomenonName: string; confidence: number }[],
    };

    // Collect all new links for bulk upsert
    const pendingInserts: { report_id: string; phenomenon_id: string; confidence: number; tagged_by: string }[] = [];

    // Process each report
    for (const report of reports) {
      results.processed++;

      const titleLower = (report.title || '').toLowerCase();
      const summaryLower = (report.summary || '').toLowerCase();
      const searchText = [titleLower, summaryLower, (report.description || '').toLowerCase()].join(' ');

      // Find matching phenomena
      for (const phenomenon of phenomenaMatchers) {
        for (const { regex } of phenomenon.compiledPatterns) {
          if (regex.test(searchText)) {
            // Calculate confidence based on where match was found
            let confidence = 0.6; // Base: found in description

            if (regex.test(titleLower)) {
              confidence = 0.85;
            } else if (regex.test(summaryLower)) {
              confidence = 0.75;
            }

            // Bonus for category alignment
            if (isCategoryMatch(report.category, phenomenon.category)) {
              confidence = Math.min(confidence + 0.1, 0.95);
            }

            results.matches++;

            const linkKey = `${report.id}:${phenomenon.id}`;
            if (existingLinkSet.has(linkKey)) {
              results.skipped++;
            } else {
              pendingInserts.push({
                report_id: report.id,
                phenomenon_id: phenomenon.id,
                confidence,
                tagged_by: 'auto',
              });

              // Track for response
              if (results.newLinks.length < 10) {
                results.newLinks.push({
                  reportId: report.id,
                  reportTitle: report.title,
                  phenomenonName: phenomenon.name,
                  confidence,
                });
              }

              // Prevent duplicates within this batch
              existingLinkSet.add(linkKey);
            }

            break; // Only count each phenomenon once per report
          }
        }
      }
    }

    // Bulk upsert all new links in chunks
    if (!dryRun && pendingInserts.length > 0) {
      for (let i = 0; i < pendingInserts.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = pendingInserts.slice(i, i + UPSERT_CHUNK_SIZE);
        const { error: upsertError } = await supabase
          .from('report_phenomena')
          .upsert(chunk, { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true });

        if (upsertError) {
          console.error(`[BatchLink] Bulk upsert error (chunk ${i / UPSERT_CHUNK_SIZE + 1}):`, upsertError);
        } else {
          results.linked += chunk.length;
        }
      }
    } else {
      results.linked = pendingInserts.length; // For dry run, count what would be linked
    }

    const nextOffset = reports.length === batchSize ? offset + batchSize : null;

    console.log(`[BatchLink] Batch complete: ${results.processed} processed, ${results.linked} linked, ${results.matches} matches, ${results.skipped} skipped`);

    return res.status(200).json({
      success: true,
      dryRun,
      results: {
        processed: results.processed,
        linked: results.linked,
        matches: results.matches,
        skipped: results.skipped,
        sampleLinks: results.newLinks.slice(0, 10),
      },
      totalPhenomena: phenomenaMatchers.length,
      nextOffset,
      done: nextOffset === null,
    });
  } catch (error) {
    console.error('[BatchLink] Error:', error);
    return res.status(500).json({
      error: 'Batch linking failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if report category aligns with phenomenon category.
 * Covers all 11 phenomenon categories for confidence bonus.
 */
function isCategoryMatch(reportCategory: string, phenomenonCategory: string): boolean {
  const mapping: Record<string, string[]> = {
    'cryptids': ['cryptid', 'creature', 'monster', 'cryptids'],
    'ufos_aliens': ['ufo', 'uap', 'alien', 'extraterrestrial', 'ufos_aliens', 'ufos', 'aliens', 'nhi'],
    'ghosts_hauntings': ['ghost', 'haunting', 'spirit', 'apparition', 'ghosts_hauntings', 'ghosts', 'hauntings'],
    'psychic_phenomena': ['psychic', 'esp', 'telepathy', 'precognition', 'psychic_phenomena', 'psychic_paranormal'],
    'psychological_experiences': ['psychological', 'nde', 'sleep_paralysis', 'psychological_experiences', 'unexplained', 'strange'],
    'consciousness_practices': ['consciousness', 'meditation', 'astral', 'lucid_dream', 'consciousness_practices', 'nde_consciousness'],
    'biological_factors': ['biological', 'physiological', 'biological_factors', 'biology'],
    'perception_sensory': ['perception', 'sensory', 'visual', 'auditory', 'perception_sensory'],
    'religion_mythology': ['religion', 'mythology', 'spiritual', 'divine', 'angel', 'demon', 'religion_mythology'],
    'esoteric_practices': ['esoteric', 'occult', 'ritual', 'magic', 'esoteric_practices', 'mystery_location'],
    'combination': ['combination', 'multi', 'other', 'high_strangeness'],
  };

  const phenomenonKeys = mapping[phenomenonCategory] || [];
  const reportCategoryLower = (reportCategory || '').toLowerCase();

  return phenomenonKeys.some(key => reportCategoryLower.includes(key)) ||
         reportCategoryLower.includes(phenomenonCategory);
}

// 300s timeout for Pro plan - needed for large batch processing
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: false,
  },
  maxDuration: 300,
};
