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

  var { data: report } = await supabase.from('reports').select('id').eq('slug', 'barney-barnett-roswell-san-agustin-1947').single();
  if (!report) return res.status(404).json({ error: 'Report not found' });

  // Check if video already exists
  var { data: existing } = await supabase.from('report_media').select('id').eq('report_id', report.id).eq('url', 'https://www.youtube.com/watch?v=s3KdRG8lBzE').single();
  if (existing) return res.status(200).json({ success: true, message: 'Video already exists' });

  var { error } = await supabase.from('report_media').insert({
    report_id: report.id,
    media_type: 'video',
    url: 'https://www.youtube.com/watch?v=s3KdRG8lBzE',
    caption: 'Video covering Barney Barnett\'s account of encountering crash debris and non-human bodies on the Plains of San Agustin, New Mexico in July 1947.',
    is_primary: false,
  });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, message: 'YouTube video added to Barnett report' });
}
