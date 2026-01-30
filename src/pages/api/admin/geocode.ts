/**
 * API endpoint to geocode reports without coordinates
 *
 * POST /api/admin/geocode
 *
 * Query params:
 * - limit: Max reports to geocode (default 50)
 * - dry: If 'true', preview without updating
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { geocodeLocation, buildLocationQuery } from '@/lib/services/geocoding.service';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const limit = parseInt(req.query.limit as string) || 50;
  const dryRun = req.query.dry === 'true';

  try {
    const supabase = getSupabaseAdmin();

    // Fetch reports without coordinates but with location info
    const { data: reports, error: fetchError } = await supabase
      .from('reports')
      .select('id, title, city, state_province, country, location_name')
      .is('latitude', null)
      .not('location_name', 'is', null)
      .limit(limit);

    if (fetchError) {
      return res.status(500).json({ error: 'Failed to fetch reports', details: fetchError });
    }

    if (!reports || reports.length === 0) {
      return res.json({ message: 'No reports need geocoding', geocoded: 0 });
    }

    console.log(`[Geocoding] Processing ${reports.length} reports...`);

    const results: Array<{
      id: string;
      title: string;
      query: string;
      latitude?: number;
      longitude?: number;
      error?: string;
    }> = [];

    let successCount = 0;
    let failCount = 0;

    for (const report of reports) {
      const query = buildLocationQuery({
        city: report.city,
        state: report.state_province,
        country: report.country,
        location_name: report.location_name
      });

      if (!query) {
        results.push({
          id: report.id,
          title: report.title,
          query: '',
          error: 'No location info'
        });
        failCount++;
        continue;
      }

      try {
        const geocoded = await geocodeLocation(query);

        if (geocoded) {
          results.push({
            id: report.id,
            title: report.title?.substring(0, 50),
            query,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude
          });

          if (!dryRun) {
            const { error: updateError } = await supabase
              .from('reports')
              .update({
                latitude: geocoded.latitude,
                longitude: geocoded.longitude
              })
              .eq('id', report.id);

            if (updateError) {
              console.error(`[Geocoding] Update error for ${report.id}:`, updateError);
            } else {
              successCount++;
            }
          } else {
            successCount++;
          }
        } else {
          results.push({
            id: report.id,
            title: report.title?.substring(0, 50),
            query,
            error: 'No results found'
          });
          failCount++;
        }
      } catch (error) {
        results.push({
          id: report.id,
          title: report.title?.substring(0, 50),
          query,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failCount++;
      }
    }

    // Count remaining reports needing geocoding
    const { count: remaining } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .is('latitude', null)
      .not('location_name', 'is', null);

    return res.json({
      dryRun,
      processed: reports.length,
      geocoded: successCount,
      failed: failCount,
      remaining: remaining || 0,
      examples: results.slice(0, 20)
    });

  } catch (error) {
    console.error('[Geocoding] Error:', error);
    return res.status(500).json({
      error: 'Geocoding failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Extended timeout for geocoding (rate limited, can be slow)
export const config = {
  maxDuration: 300
};
