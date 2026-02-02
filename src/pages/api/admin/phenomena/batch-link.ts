/**
 * Batch Link Reports to Phenomena API
 *
 * Efficiently links existing reports to phenomena using pattern matching.
 * Uses keyword/alias matching for fast processing without AI calls.
 *
 * Run in batches to process the full 258k+ report database.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';

// Admin email check
const ADMIN_EMAIL = 'williamschaseh@gmail.com';

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

interface PhenomenonPattern {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  patterns: string[]; // Combined name + aliases as lowercase patterns
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
      batchSize = 100,
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

    // Build pattern matchers
    const phenomenaPatterns: PhenomenonPattern[] = phenomena.map(p => ({
      id: p.id,
      name: p.name,
      aliases: p.aliases || [],
      category: p.category,
      patterns: [
        p.name.toLowerCase(),
        ...(p.aliases || []).map((a: string) => a.toLowerCase())
      ].filter(Boolean)
    }));

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
        results: { processed: 0, linked: 0, matches: 0 },
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

    // Process each report
    for (const report of reports) {
      results.processed++;

      // Combine text to search
      const searchText = [
        report.title || '',
        report.summary || '',
        report.description || ''
      ].join(' ').toLowerCase();

      // Find matching phenomena
      const matches: { phenomenonId: string; phenomenonName: string; confidence: number }[] = [];

      for (const phenomenon of phenomenaPatterns) {
        // Check if any pattern matches
        for (const pattern of phenomenon.patterns) {
          // Use word boundary matching for better accuracy
          const regex = new RegExp(`\\b${escapeRegex(pattern)}\\b`, 'i');
          if (regex.test(searchText)) {
            // Calculate confidence based on where match was found
            let confidence = 0.6; // Base confidence for pattern match

            // Higher confidence if in title
            if (regex.test((report.title || '').toLowerCase())) {
              confidence = 0.85;
            }
            // Medium confidence if in summary
            else if (regex.test((report.summary || '').toLowerCase())) {
              confidence = 0.75;
            }

            // Bonus for category alignment
            if (isCategoryMatch(report.category, phenomenon.category)) {
              confidence = Math.min(confidence + 0.1, 0.95);
            }

            matches.push({
              phenomenonId: phenomenon.id,
              phenomenonName: phenomenon.name,
              confidence,
            });
            break; // Only count each phenomenon once per report
          }
        }
      }

      results.matches += matches.length;

      // Link report to phenomena
      for (const match of matches) {
        const linkKey = `${report.id}:${match.phenomenonId}`;
        if (existingLinkSet.has(linkKey)) {
          results.skipped++;
          continue;
        }

        if (!dryRun) {
          const { error: linkError } = await supabase
            .from('report_phenomena')
            .insert({
              report_id: report.id,
              phenomenon_id: match.phenomenonId,
              confidence: match.confidence,
              tagged_by: 'auto',
            });

          if (linkError) {
            console.error(`[BatchLink] Error linking report ${report.id}:`, linkError);
            continue;
          }
        }

        results.linked++;
        results.newLinks.push({
          reportId: report.id,
          reportTitle: report.title,
          phenomenonName: match.phenomenonName,
          confidence: match.confidence,
        });

        // Add to set to avoid duplicates within this batch
        existingLinkSet.add(linkKey);
      }
    }

    const nextOffset = reports.length === batchSize ? offset + batchSize : null;

    console.log(`[BatchLink] Batch complete: ${results.processed} processed, ${results.linked} linked, ${results.matches} matches`);

    return res.status(200).json({
      success: true,
      dryRun,
      results: {
        processed: results.processed,
        linked: results.linked,
        matches: results.matches,
        skipped: results.skipped,
        sampleLinks: results.newLinks.slice(0, 10), // Show first 10 as samples
      },
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
 * Check if report category aligns with phenomenon category
 */
function isCategoryMatch(reportCategory: string, phenomenonCategory: string): boolean {
  const mapping: Record<string, string[]> = {
    'cryptids': ['cryptid', 'creature', 'monster'],
    'ufos_aliens': ['ufo', 'uap', 'alien', 'extraterrestrial'],
    'ghosts_hauntings': ['ghost', 'haunting', 'spirit', 'paranormal'],
    'psychic_phenomena': ['psychic', 'esp', 'telepathy', 'paranormal'],
    'psychological_experiences': ['unexplained', 'strange', 'mysterious'],
  };

  const phenomenonKeys = mapping[phenomenonCategory] || [];
  const reportCategoryLower = (reportCategory || '').toLowerCase();

  return phenomenonKeys.some(key => reportCategoryLower.includes(key)) ||
         reportCategoryLower.includes(phenomenonCategory);
}

// Increase timeout for batch processing
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: false,
  },
  maxDuration: 60, // 60 second timeout for Pro plan
};
