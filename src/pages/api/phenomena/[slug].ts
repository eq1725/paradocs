/**
 * API: GET /api/phenomena/[slug]
 * Get a single phenomenon with its related reports
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getPhenomenonBySlug,
  getPhenomenonReports,
  generatePhenomenonContent,
} from '@/lib/services/phenomena.service';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  var slug = req.query.slug;

  if (typeof slug !== 'string') {
    return res.status(400).json({ error: 'Invalid slug' });
  }

  if (req.method === 'GET') {
    try {
      // Prevent stale cache on client-side navigation
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      var phenomenon = await getPhenomenonBySlug(slug);

      if (!phenomenon) {
        return res.status(404).json({ error: 'Phenomenon not found' });
      }

      // Get related reports
      var reports = await getPhenomenonReports(phenomenon.id, 20);

      // Check if AI content needs to be generated
      var needsContent = !phenomenon.ai_description || !phenomenon.ai_history;

      return res.status(200).json({
        phenomenon: phenomenon,
        reports: reports,
        needsContent: needsContent,
      });
    } catch (error) {
      console.error('[API] Phenomenon detail error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  if (req.method === 'POST') {
    // Generate/regenerate AI content
    var action = req.body.action;

    if (action === 'generate_content') {
      try {
        var phenomenon = await getPhenomenonBySlug(slug);
        if (!phenomenon) {
          return res.status(404).json({ error: 'Phenomenon not found' });
        }

        var success = await generatePhenomenonContent(phenomenon.id);

        if (success) {
          var updated = await getPhenomenonBySlug(slug);
          return res.status(200).json({
            success: true,
            phenomenon: updated,
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'Failed to generate content',
          });
        }
      } catch (error) {
        console.error('[API] Generate content error:', error);
        return res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
