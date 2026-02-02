// API endpoint to cleanup broken media from the database
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Admin API key for authentication
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

// Known broken image URL patterns
const BROKEN_URL_PATTERNS = [
  'if you are looking for an image',
  'deleted',
  'removed',
  'imgur.com/removed',
  '[deleted]',
  '[removed]',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify admin API key
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { dryRun = true, limit = 100 } = req.body;

  // Initialize Supabase admin client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Find media with broken URL patterns
    let brokenMedia: any[] = [];

    for (const pattern of BROKEN_URL_PATTERNS) {
      const { data, error } = await supabase
        .from('report_media')
        .select('id, url, report_id')
        .ilike('url', `%${pattern}%`)
        .limit(limit);

      if (!error && data) {
        brokenMedia = [...brokenMedia, ...data];
      }
    }

    // Also find duplicate URLs for the same report
    const { data: duplicates, error: dupError } = await supabase
      .rpc('find_duplicate_media');

    const result = {
      brokenMediaCount: brokenMedia.length,
      brokenMedia: brokenMedia.slice(0, 20).map(m => ({ id: m.id, url: m.url.substring(0, 80) })),
      duplicatesFound: duplicates?.length || 0,
      deleted: 0,
      dryRun
    };

    if (!dryRun && brokenMedia.length > 0) {
      // Delete broken media
      const idsToDelete = brokenMedia.map(m => m.id);

      const { error: deleteError } = await supabase
        .from('report_media')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        console.error('Error deleting broken media:', deleteError);
        return res.status(500).json({ error: 'Failed to delete broken media', details: deleteError });
      }

      result.deleted = idsToDelete.length;
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
