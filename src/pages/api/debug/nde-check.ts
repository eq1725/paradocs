/**
 * Debug endpoint to check NDE phenomenon linkage
 * GET /api/debug/nde-check
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createServerClient();

  try {
    // 1. Check phenomena table for NDE entries
    const { data: phenomena, error: phenError } = await supabase
      .from('phenomena')
      .select('id, name, slug, category, report_count')
      .ilike('name', '%near-death%');

    // 2. Check phenomenon_types table for NDE entries (legacy)
    const { data: phenomenonTypes, error: ptError } = await supabase
      .from('phenomenon_types')
      .select('id, name, slug, category')
      .ilike('name', '%near-death%');

    // 3. Check report_phenomena for the known NDE ID
    const knownNdeId = 'ed6ef301-77eb-43ce-aef3-43d9cc2cfa70';
    const { count: linkedCount, error: linkError } = await supabase
      .from('report_phenomena')
      .select('*', { count: 'exact', head: true })
      .eq('phenomenon_id', knownNdeId);

    // 4. Check if there are ANY entries in report_phenomena
    const { count: totalLinks, error: totalError } = await supabase
      .from('report_phenomena')
      .select('*', { count: 'exact', head: true });

    // 5. Get sample of phenomenon IDs used in report_phenomena
    const { data: sampleLinks, error: sampleError } = await supabase
      .from('report_phenomena')
      .select('phenomenon_id')
      .limit(10);

    const uniquePhenomenonIds = [...new Set(sampleLinks?.map(l => l.phenomenon_id) || [])];

    return res.status(200).json({
      phenomenaTable: {
        ndeEntries: phenomena || [],
        error: phenError?.message,
      },
      phenomenonTypesTable: {
        ndeEntries: phenomenonTypes || [],
        error: ptError?.message,
      },
      reportPhenomena: {
        knownNdeId,
        linkedToKnownId: linkedCount || 0,
        totalLinksInTable: totalLinks || 0,
        samplePhenomenonIds: uniquePhenomenonIds,
        error: linkError?.message || totalError?.message || sampleError?.message,
      },
      diagnosis: {
        hasNdeInPhenomena: (phenomena?.length || 0) > 0,
        hasNdeInPhenomenonTypes: (phenomenonTypes?.length || 0) > 0,
        hasLinkedReports: (linkedCount || 0) > 0,
        phenomenaIdMatchesLinked: phenomena?.some(p => p.id === knownNdeId) || false,
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
