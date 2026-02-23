/**
 * API: GET/POST /api/reports/[slug]/phenomena
 *
 * Get or manage phenomena tags for a report
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  getReportPhenomena,
  linkReportToPhenomena,
  identifyPhenomena,
} from 'A/lib/services/phenomena.service';
import { createServerClient } from '@/lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { slug } = req.query;

  if (typeof slug !== 'string') {
    return res.status(400).json({ error: 'Invalid slug' });
  }

  // Get the report by slug
  const { data: report, error: reportError } = await createServerClient()
    .from('reports')
    .select('id, title, summary, description, category, tags')
    .eq('slug', slug)
    .eq('status', 'approved')
    .single();

  if (reportError || !report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  if (req.method === 'GET') {
    try {
      const phenomena = await getReportPhenomena(report.id);

      return res.status(200).json({
        phenomena,
        count: phenomena.length,
      });
    } catch (error) {
      console.error('[API] Get report phenomena error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  if (req.method === 'POST') {
    const { action, phenomenon_id } = req.body;

    // Auto-identify phenomena for this report
    if (action === 'auto_identify') {
      try {
        const result = await identifyPhenomena(report);

        // Link identified phenomena
        if (result.matches.length > 0) {
          await linkReportToPhenomena(report.id, result.matches, 'auto');
        }

        return res.status(200).json({
          success: true,
          matches: result.matches,
          suggested_new: result.suggested_new,
        });
      } catch (error) {
        console.error('[API] Auto-identify error:', error);
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Manually tag with a phenomenon
    if (action === 'tag' && phenomenon_id) {
      try {
        // Get user from auth header
        let userId: string | null = null;
        const authHeader = req.headers.authorization;

        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const supabaseUser = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPBASE_ANON_KEY!
          );
          const { data: { user } } = await supabaseUser.auth.getUser(token);
          userId = user?.id || null;
        }

        await linkReportToPhenomena(
          report.id,
          [{
            phenomenon_id,
            phenomenon_name: '',
            confidence: 0.9, // User-tagged = high confidence
            reasoning: 'User tagged',
          }],
          'user',
          userId || undefined
        );

        return res.status(200).json({ success: true });
      } catch (error) {
        console.error('[API] Manual tag error:', error);
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  if (req.method === 'DELETE') {
    const { phenomenon_id } = req.body;

    if (!phenomenon_id) {
      return res.status(400).json({ error: 'phenomenon_id required' });
    }

    try {
      const { error } = await createServerClient()
        .from('report_phenomena')
        .delete()
        .eq('re