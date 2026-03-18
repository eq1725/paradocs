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
 * POST /api/admin/fix-brazel-media
 *
 * Removes the two duplicate Roswell Daily Record images from Mac Brazel's report,
 * keeping only the primary .webp version. Updates the misleadingly-named
 * "Roswell_Crash_1947.jpg" (which is actually another newspaper image) caption
 * or removes it entirely.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(401).json({ error: 'Unauthorized' });

  var supabase = createClient(supabaseUrl, supabaseServiceKey);

  // IDs of the duplicate newspaper images to remove
  // 3fd5781e = RoswellDailyRecordJuly8,1947.jpg (duplicate of the .webp primary)
  // c92e9d4c = Roswell_Crash_1947.jpg (misleadingly named — actually another newspaper image)
  var duplicateIds = [
    '3fd5781e-16cf-4c54-a2ba-af1ce45b5fbe',
    'c92e9d4c-5ad7-416e-804d-7da40876430f',
    '83d2aa08-9240-4736-b293-ba28a4322361',
  ];

  var results = { deleted: 0, errors: [] as string[] };

  for (var i = 0; i < duplicateIds.length; i++) {
    var { error } = await supabase
      .from('report_media')
      .delete()
      .eq('id', duplicateIds[i]);

    if (error) {
      results.errors.push('Failed to delete ' + duplicateIds[i] + ': ' + error.message);
    } else {
      results.deleted++;
    }
  }

  // Add a proper New Mexico landscape image via Wikimedia Commons
  // Torrance County is adjacent to Lincoln County where the Foster Ranch is located
  var reportId = '805c046d-a424-49fb-8279-82981fef6b7c';
  var landscapeUrl = 'https://upload.wikimedia.org/wikipedia/commons/5/56/Torrance_County_New_Mexico_Landscape.JPG';

  // Check if already exists
  var { data: existing } = await supabase
    .from('report_media')
    .select('id')
    .eq('report_id', reportId)
    .eq('url', landscapeUrl)
    .single();

  if (!existing) {
    var { error: insertErr } = await supabase.from('report_media').insert({
      report_id: reportId,
      media_type: 'image',
      url: landscapeUrl,
      caption: 'The remote high desert landscape of central New Mexico — terrain representative of the area surrounding the J.B. Foster Ranch where Mac Brazel discovered the debris field in July 1947.',
      is_primary: false,
    });
    if (insertErr) {
      results.errors.push('Failed to add landscape: ' + insertErr.message);
    }
  }

  return res.status(200).json({ success: true, results: results });
}
