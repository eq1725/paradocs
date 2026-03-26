// API Route: /api/admin/reingest
// Deletes all reports for a given source, then re-runs ingestion.
// Used when media policy or quality filter changes require a fresh ingest.
//
// POST /api/admin/reingest
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//   Body: { source_type: string, source_id?: string, limit?: number }

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { runIngestion } from '@/lib/ingestion/engine';

function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(supabaseUrl, supabaseServiceKey);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: service role key only
  var authHeader = req.headers.authorization;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || authHeader !== 'Bearer ' + serviceKey) {
    return res.status(401).json({ error: 'Unauthorized — requires service role key' });
  }

  var { source_type, source_id, limit } = req.body || {};

  if (!source_type) {
    return res.status(400).json({ error: 'source_type is required' });
  }

  var supabase = getSupabaseAdmin();
  var results = {
    deleted: { reports: 0, media: 0, embeddings: 0 },
    ingested: null as any,
  };

  try {
    // Step 1: Find all report IDs for this source type
    console.log('[Re-ingest] Finding reports for source_type: ' + source_type);
    var { data: reports, error: findError } = await supabase
      .from('reports')
      .select('id, title, slug')
      .eq('source_type', source_type);

    if (findError) {
      return res.status(500).json({ error: 'Failed to find reports: ' + findError.message });
    }

    if (reports && reports.length > 0) {
      var reportIds = reports.map(function(r) { return r.id; });
      console.log('[Re-ingest] Found ' + reportIds.length + ' reports to delete');

      // Step 2: Delete related records (cascade doesn't cover all tables)
      // Delete media
      var { count: mediaCount } = await supabase
        .from('report_media')
        .delete({ count: 'exact' })
        .in('report_id', reportIds);
      results.deleted.media = mediaCount || 0;

      // Delete embeddings
      var { count: embeddingCount } = await supabase
        .from('report_embeddings')
        .delete({ count: 'exact' })
        .in('report_id', reportIds);
      results.deleted.embeddings = embeddingCount || 0;

      // Delete votes
      await supabase.from('votes').delete().in('report_id', reportIds);

      // Delete comments
      await supabase.from('comments').delete().in('report_id', reportIds);

      // Delete report-phenomena links
      await supabase.from('report_phenomena').delete().in('report_id', reportIds);

      // Step 3: Delete the reports themselves
      var { count: reportCount, error: deleteError } = await supabase
        .from('reports')
        .delete({ count: 'exact' })
        .eq('source_type', source_type);

      if (deleteError) {
        return res.status(500).json({ error: 'Failed to delete reports: ' + deleteError.message, partial: results });
      }
      results.deleted.reports = reportCount || 0;

      console.log('[Re-ingest] Deleted: ' + results.deleted.reports + ' reports, ' + results.deleted.media + ' media, ' + results.deleted.embeddings + ' embeddings');
    } else {
      console.log('[Re-ingest] No existing reports found for source_type: ' + source_type);
    }

    // Step 4: Re-run ingestion
    if (source_id) {
      console.log('[Re-ingest] Running ingestion for source: ' + source_id + ', limit: ' + (limit || 20));
      var ingestionResult = await runIngestion(source_id, { limit: limit || 20 });
      results.ingested = ingestionResult;
    } else {
      console.log('[Re-ingest] No source_id provided, skipping re-ingestion');
    }

    return res.status(200).json({
      success: true,
      results: results,
      message: 'Deleted ' + results.deleted.reports + ' reports. ' +
        (results.ingested ? 'Re-ingested with new pipeline.' : 'No re-ingestion (no source_id provided).')
    });
  } catch (err: any) {
    console.error('[Re-ingest] Error:', err);
    return res.status(500).json({ error: err.message, partial: results });
  }
}

export var config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
  maxDuration: 300, // 5 minutes for large re-ingests
};
