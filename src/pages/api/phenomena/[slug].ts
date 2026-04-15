/**
 * API: GET /api/phenomena/[slug]
 * Get a single phenomenon with its related reports
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
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

      // Admin client (re-used by both the encyclopedia-entry and the
      // tag-fallback branch).
      var supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Tag-fallback branch.
      // If no encyclopedia entry exists for this slug, we still want the
      // "Related Phenomena" links from Paradocs Analysis to land somewhere
      // useful. We return a lightweight "tag view" — any reports whose
      // tags array contains the slug, plus a synthesized phenomenon stub
      // the page can use to render a title. See /pages/phenomena/[slug].tsx
      // for the fallback render branch.
      if (!phenomenon) {
        // Try tag match + a secondary free-text title match so we still
        // surface something even if nothing is explicitly tagged.
        var humanized = slug.replace(/-/g, ' ').replace(/\b\w/g, function (c: string) {
          return c.toUpperCase();
        });
        var { data: taggedReports } = await supabaseAdmin
          .from('reports')
          .select('id, title, slug, summary, category, location_name, country, event_date, credibility, view_count, status, tags')
          .eq('status', 'approved')
          .contains('tags', [slug])
          .order('view_count', { ascending: false, nullsFirst: false })
          .limit(25);

        var tagMatches = taggedReports || [];
        if (tagMatches.length === 0) {
          return res.status(404).json({ error: 'Phenomenon not found' });
        }

        return res.status(200).json({
          phenomenon: {
            id: null,
            slug: slug,
            name: humanized,
            category: null,
            is_tag_fallback: true,
          },
          reports: tagMatches,
          media: [],
          needsContent: false,
          is_tag_fallback: true,
        });
      }

      // Get related reports
      var reports = await getPhenomenonReports(phenomenon.id, 20);

      // Get approved media from phenomena_media table
      var { data: mediaItems } = await supabaseAdmin
        .from('phenomena_media')
        .select('id, media_type, original_url, stored_url, thumbnail_url, caption, source, source_url, license, is_profile, tags, sort_order')
        .eq('phenomenon_id', phenomenon.id)
        .eq('status', 'approved')
        .order('is_profile', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      // Check if AI content needs to be generated
      var needsContent = !phenomenon.ai_description || !phenomenon.ai_history;

      return res.status(200).json({
        phenomenon: phenomenon,
        reports: reports,
        media: mediaItems || [],
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
