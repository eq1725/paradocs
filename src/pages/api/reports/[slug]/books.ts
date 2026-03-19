import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * GET /api/reports/[slug]/books
 * Returns book recommendations for a report.
 * Accepts either a slug or UUID as the [slug] parameter.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var slugOrId = req.query.slug as string;
  if (!slugOrId) {
    return res.status(400).json({ error: 'slug required' });
  }

  var supabase = createClient(supabaseUrl, supabaseKey);

  // Resolve report ID from slug
  var reportId = slugOrId;
  var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

  if (!isUuid) {
    var { data: report } = await supabase
      .from('reports')
      .select('id')
      .eq('slug', slugOrId)
      .single();

    if (!report) {
      return res.status(200).json({ books: [] });
    }
    reportId = report.id;
  }

  // Fetch books ordered by display_order
  var { data: books, error } = await supabase
    .from('report_books')
    .select('id, title, author, amazon_asin, cover_image_url, editorial_note, display_order')
    .eq('report_id', reportId)
    .order('display_order', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Cache for 1 hour (books rarely change)
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json({ books: books || [] });
}
