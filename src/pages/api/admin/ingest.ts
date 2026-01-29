// API Route: /api/admin/ingest
// Allows admin users to trigger data ingestion manually

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { runScheduledIngestion, runIngestion } from '@/lib/ingestion/engine';

// Create admin client
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Create user client from request
function getSupabaseUser(req: NextApiRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: req.headers.authorization || '',
      },
    },
  });

  return supabase;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user from session
    const supabaseUser = getSupabaseUser(req);

    // Try to get user from cookie/session
    const authHeader = req.headers.authorization;
    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user }, error } = await supabaseUser.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
      }
    }

    // Also try cookie-based auth
    if (!userId) {
      const cookies = req.headers.cookie || '';
      const accessTokenMatch = cookies.match(/sb-[^-]+-auth-token=([^;]+)/);
      if (accessTokenMatch) {
        try {
          const tokenData = JSON.parse(decodeURIComponent(accessTokenMatch[1]));
          if (tokenData?.access_token) {
            const supabaseWithToken = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              {
                global: {
                  headers: {
                    Authorization: `Bearer ${tokenData.access_token}`,
                  },
                },
              }
            );
            const { data: { user } } = await supabaseWithToken.auth.getUser();
            if (user) {
              userId = user.id;
            }
          }
        } catch (e) {
          // Cookie parse error, continue
        }
      }
    }

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check if user is admin
    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('[Admin] Starting manual ingestion...');
    const startTime = Date.now();

    // Check if a specific source is requested
    const sourceId = req.query.source as string;
    // Allow configurable limit (default 500 for large data pulls)
    const limit = parseInt(req.query.limit as string) || 500;

    let results;
    if (sourceId) {
      // Run for specific source
      const result = await runIngestion(sourceId, limit);
      results = [result];
    } else {
      // Run for all active sources with configured limit
      results = await runScheduledIngestion(limit);
    }

    const totalDuration = Date.now() - startTime;

    // Summarize results
    const summary = {
      success: results.every(r => r.success),
      sourcesProcessed: results.length,
      totalRecordsFound: results.reduce((sum, r) => sum + r.recordsFound, 0),
      totalRecordsInserted: results.reduce((sum, r) => sum + r.recordsInserted, 0),
      totalRecordsUpdated: results.reduce((sum, r) => sum + r.recordsUpdated, 0),
      totalRecordsSkipped: results.reduce((sum, r) => sum + r.recordsSkipped, 0),
      duration: totalDuration,
      jobs: results.map(r => ({
        jobId: r.jobId,
        success: r.success,
        recordsFound: r.recordsFound,
        recordsInserted: r.recordsInserted,
        error: r.error
      }))
    };

    console.log('[Admin] Ingestion complete:', summary);

    return res.status(200).json(summary);

  } catch (error) {
    console.error('[Admin] Ingestion error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

// Extended timeout for ingestion (Vercel Pro allows up to 300s)
export const config = {
  maxDuration: 300
};
