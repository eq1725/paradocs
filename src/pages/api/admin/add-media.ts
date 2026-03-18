import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
var ADMIN_EMAIL = 'williamschaseh@gmail.com';

async function getAuthenticatedUser(req: NextApiRequest) {
  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.replace('Bearer ', '');
  var userClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: 'Bearer ' + token } }
  });
  var result = await userClient.auth.getUser();
  if (result.error || !result.data.user) return null;
  return result.data.user;
}

/**
 * POST /api/admin/add-media
 * Body: { slug: "report-slug", media_type: "video", url: "...", caption: "...", is_primary: false }
 *
 * General-purpose admin endpoint for adding media to any report.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(401).json({ error: 'Unauthorized' });

  var { slug, media_type, url, caption, is_primary } = req.body;
  if (!slug || !url) return res.status(400).json({ error: 'slug and url required' });

  var supabase = createClient(supabaseUrl, supabaseServiceKey);

  var { data: report } = await supabase.from('reports').select('id').eq('slug', slug).single();
  if (!report) return res.status(404).json({ error: 'Report not found: ' + slug });

  // Check for duplicate URL
  var { data: existing } = await supabase.from('report_media').select('id').eq('report_id', report.id).eq('url', url).single();
  if (existing) return res.status(200).json({ success: true, message: 'Media already exists', id: existing.id });

  var { data: inserted, error } = await supabase.from('report_media').insert({
    report_id: report.id,
    media_type: media_type || 'video',
    url: url,
    caption: caption || '',
    is_primary: is_primary || false,
  }).select('id').single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, id: inserted?.id });
}
