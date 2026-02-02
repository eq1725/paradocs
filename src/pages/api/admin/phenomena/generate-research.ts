/**
 * Generate Research-Tier Content API
 *
 * Generates deeper academic content for phenomena (Pro/Enterprise tier).
 * Can process single phenomena or batches.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import { generateResearchTierContent } from '@/lib/services/phenomena.service';

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
      phenomenonId,      // Single phenomenon ID
      phenomenonIds,     // Array of phenomenon IDs
      topN = 0,          // Process top N phenomena by report_count
      category = null,   // Filter by category when using topN
      dryRun = false,
    } = req.body;

    let idsToProcess: string[] = [];

    // Determine which phenomena to process
    if (phenomenonId) {
      idsToProcess = [phenomenonId];
    } else if (phenomenonIds && Array.isArray(phenomenonIds)) {
      idsToProcess = phenomenonIds;
    } else if (topN > 0) {
      // Get top N phenomena by report count
      let query = supabase
        .from('phenomena')
        .select('id, name')
        .eq('status', 'active')
        .is('ai_cultural_origins', null) // Only those without research content
        .order('report_count', { ascending: false })
        .limit(topN);

      if (category) {
        query = query.eq('category', category);
      }

      const { data: topPhenomena } = await query;
      idsToProcess = (topPhenomena || []).map(p => p.id);
    }

    if (idsToProcess.length === 0) {
      return res.status(400).json({ error: 'No phenomena specified or found' });
    }

    console.log(`[ResearchGen] Processing ${idsToProcess.length} phenomena (dryRun: ${dryRun})`);

    const results = {
      total: idsToProcess.length,
      success: 0,
      failed: 0,
      details: [] as { id: string; name: string; status: string }[],
    };

    // Get phenomenon names for logging
    const { data: phenomenaInfo } = await supabase
      .from('phenomena')
      .select('id, name')
      .in('id', idsToProcess);

    const nameMap = new Map((phenomenaInfo || []).map(p => [p.id, p.name]));

    for (const id of idsToProcess) {
      const name = nameMap.get(id) || 'Unknown';

      if (dryRun) {
        results.success++;
        results.details.push({ id, name, status: 'would_generate' });
        continue;
      }

      try {
        const success = await generateResearchTierContent(id);
        if (success) {
          results.success++;
          results.details.push({ id, name, status: 'success' });
        } else {
          results.failed++;
          results.details.push({ id, name, status: 'failed' });
        }

        // Rate limit between AI calls
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        results.failed++;
        results.details.push({
          id,
          name,
          status: `error: ${error instanceof Error ? error.message : 'Unknown'}`,
        });
      }
    }

    console.log(`[ResearchGen] Complete: ${results.success} success, ${results.failed} failed`);

    return res.status(200).json({
      success: true,
      dryRun,
      results,
    });
  } catch (error) {
    console.error('[ResearchGen] Error:', error);
    return res.status(500).json({
      error: 'Research content generation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Increase timeout for batch processing
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: false,
  },
  maxDuration: 120, // 2 minute timeout for Pro plan
};
