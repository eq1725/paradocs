import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * GET /api/public/featured-investigations
 * Returns active, curated featured investigations for the homepage.
 * Respects display_order and optional date scheduling (starts_at/ends_at).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var supabase = createClient(supabaseUrl, supabaseKey);
  var now = new Date().toISOString();

  // Fetch active featured investigations, filtered by schedule if set
  var { data: featured, error } = await supabase
    .from('featured_investigations')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Filter by schedule window (if starts_at/ends_at are set)
  var active = (featured || []).filter(function(f: any) {
    if (f.starts_at && new Date(f.starts_at) > new Date(now)) return false;
    if (f.ends_at && new Date(f.ends_at) < new Date(now)) return false;
    return true;
  });

  // For each featured investigation, fetch sub-stories from the case group
  var enriched = [];
  for (var i = 0; i < active.length; i++) {
    var inv = active[i];

    // Get related reports (non-showcase) for the secondary cards
    var { data: relatedReports } = await supabase
      .from('reports')
      .select('id, title, slug, summary, location_name, event_date, witness_count, has_physical_evidence, has_photo_video, category, report_media(url, caption, media_type, is_primary)')
      .eq('case_group', inv.case_group)
      .eq('status', 'approved')
      .neq('slug', inv.showcase_slug || '')
      .order('created_at', { ascending: true })
      .limit(6);

    // Transform related reports to story format
    var stories = (relatedReports || []).map(function(r: any) {
      var images = (r.report_media || []).filter(function(m: any) {
        return m.media_type === 'image' || (m.url && m.url.match(/\.(jpg|jpeg|png|webp|gif)/i));
      });
      var primaryImage = images.find(function(m: any) { return m.is_primary; }) || images[0];
      return {
        id: r.id,
        title: r.title,
        slug: r.slug,
        teaser: (r.summary || '').substring(0, 200),
        imageUrl: primaryImage ? primaryImage.url : null,
      };
    });

    enriched.push({
      id: inv.id,
      case_group: inv.case_group,
      title: inv.title,
      subtitle: inv.subtitle,
      editorial_blurb: inv.editorial_blurb,
      hero_image_url: inv.hero_image_url,
      hero_image_caption: inv.hero_image_caption,
      showcase_slug: inv.showcase_slug,
      report_count: inv.report_count,
      category: inv.category,
      location_label: inv.location_label,
      date_label: inv.date_label,
      stories: stories,
    });
  }

  // Cache for 60 seconds, serve stale for 5 minutes while revalidating
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({ investigations: enriched });
}
