/**
 * Batch Process API - Generate AI content + Link reports
 *
 * Comprehensive endpoint to:
 * 1. Generate AI content for phenomena without it
 * 2. Link all reports to phenomena
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { generatePhenomenonContent } from '@/lib/services/phenomena.service';

const ADMIN_EMAIL = 'williamschaseh@gmail.com';

// Supabase admin client
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Helper to get user from cookies/headers
async function getAuthenticatedUser(req: NextApiRequest): Promise<{ id: string; email: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { id: user.id, email: user.email || '' };
    }
  }

  const cookies = req.headers.cookie || '';
  const accessTokenMatch = cookies.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (accessTokenMatch) {
    try {
      const tokenData = JSON.parse(decodeURIComponent(accessTokenMatch[1]));
      if (tokenData?.access_token) {
        const supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
        });
        const { data: { user } } = await supabaseWithToken.auth.getUser();
        if (user) {
          return { id: user.id, email: user.email || '' };
        }
      }
    } catch (e) { /* ignore */ }
  }

  return null;
}

// Escape regex special characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  const { action, batchSize = 100, offset = 0 } = req.body;

  try {
    if (action === 'generate_content') {
      // Get phenomena without AI content
      const { data: phenomena } = await supabase
        .from('phenomena')
        .select('id, name')
        .eq('status', 'active')
        .is('ai_description', null)
        .order('report_count', { ascending: false })
        .range(offset, offset + batchSize - 1);

      if (!phenomena || phenomena.length === 0) {
        return res.status(200).json({
          success: true,
          done: true,
          message: 'All phenomena have content',
          results: { processed: 0, success: 0, failed: 0 }
        });
      }

      let success = 0;
      let failed = 0;
      const details: { name: string; status: string }[] = [];

      for (const p of phenomena) {
        try {
          const result = await generatePhenomenonContent(p.id);
          if (result) {
            success++;
            details.push({ name: p.name, status: 'success' });
          } else {
            failed++;
            details.push({ name: p.name, status: 'failed' });
          }
          // Rate limit
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          failed++;
          details.push({ name: p.name, status: 'error' });
        }
      }

      // Check if more to process
      const { count } = await supabase
        .from('phenomena')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .is('ai_description', null);

      return res.status(200).json({
        success: true,
        done: (count || 0) === 0,
        nextOffset: offset + batchSize,
        remaining: count || 0,
        results: { processed: phenomena.length, success, failed, details }
      });
    }

    if (action === 'link_reports') {
      // Get phenomena patterns
      const { data: phenomena } = await supabase
        .from('phenomena')
        .select('id, name, aliases, category')
        .eq('status', 'active');

      const phenomenaPatterns = (phenomena || []).map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        patterns: [p.name.toLowerCase(), ...(p.aliases || []).map((a: string) => a.toLowerCase())]
      }));

      // Get reports batch
      const { data: reports } = await supabase
        .from('reports')
        .select('id, title, summary, description, category')
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
        .range(offset, offset + batchSize - 1);

      if (!reports || reports.length === 0) {
        return res.status(200).json({
          success: true,
          done: true,
          message: 'All reports processed',
          results: { processed: 0, linked: 0, matches: 0 }
        });
      }

      let totalMatches = 0;
      let totalLinked = 0;

      for (const report of reports) {
        const searchText = [report.title || '', report.summary || '', report.description || ''].join(' ').toLowerCase();

        for (const phenomenon of phenomenaPatterns) {
          for (const pattern of phenomenon.patterns) {
            const regex = new RegExp(`\\b${escapeRegex(pattern)}\\b`, 'i');
            if (regex.test(searchText)) {
              let confidence = 0.6;
              if (regex.test((report.title || '').toLowerCase())) {
                confidence = 0.85;
              } else if (regex.test((report.summary || '').toLowerCase())) {
                confidence = 0.75;
              }

              totalMatches++;
              const { error } = await supabase
                .from('report_phenomena')
                .upsert({
                  report_id: report.id,
                  phenomenon_id: phenomenon.id,
                  confidence,
                  tagged_by: 'auto',
                }, { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true });

              if (!error) totalLinked++;
              break;
            }
          }
        }
      }

      // Check total approved reports
      const { count: totalReports } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved');

      const done = offset + batchSize >= (totalReports || 0);

      return res.status(200).json({
        success: true,
        done,
        nextOffset: offset + batchSize,
        totalReports,
        results: { processed: reports.length, matches: totalMatches, linked: totalLinked }
      });
    }

    if (action === 'status') {
      // Get current status
      const { count: totalPhenomena } = await supabase
        .from('phenomena')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      const { count: phenomenaWithContent } = await supabase
        .from('phenomena')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .not('ai_description', 'is', null);

      const { count: totalReports } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved');

      const { count: linkedReports } = await supabase
        .from('report_phenomena')
        .select('report_id', { count: 'exact', head: true });

      return res.status(200).json({
        success: true,
        status: {
          phenomena: {
            total: totalPhenomena || 0,
            withContent: phenomenaWithContent || 0,
            needsContent: (totalPhenomena || 0) - (phenomenaWithContent || 0)
          },
          reports: {
            total: totalReports || 0,
            linked: linkedReports || 0
          }
        }
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use: generate_content, link_reports, or status' });

  } catch (error) {
    console.error('[BatchProcess] Error:', error);
    return res.status(500).json({
      error: 'Processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
    responseLimit: false,
  },
  maxDuration: 300, // 5 minute timeout
};
