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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(401).json({ error: 'Unauthorized' });

  var supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Delete the broken barnett-portrait.jpg from report_media
  var { error: deleteErr } = await supabase
    .from('report_media')
    .delete()
    .eq('id', 'b98a96a4-b833-4601-a13d-58b65128bbe7');

  // 2. Delete the broken file from Supabase Storage
  await supabase.storage.from('report-media')
    .remove(['roswell/barney-barnett-roswell-san-agustin-1947/barnett-portrait.jpg']);

  // 3. Make the landscape image (0.jpg) primary again
  var { error: updateErr } = await supabase
    .from('report_media')
    .update({ is_primary: true })
    .eq('id', '76909158-8e58-4b58-aff6-34c1cbc35312');

  // 4. Fix the landscape caption (remove any false claims)
  await supabase.from('report_media')
    .update({ caption: 'The Plains of San Agustin, New Mexico \u2014 the remote landscape where Barnett reportedly encountered crash debris and non-human bodies while conducting field work for the U.S. Soil Conservation Service in early July 1947.' })
    .eq('id', '76909158-8e58-4b58-aff6-34c1cbc35312');

  return res.status(200).json({
    success: true,
    deleteError: deleteErr?.message || null,
    updateError: updateErr?.message || null,
  });
}
