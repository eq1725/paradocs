import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var authHeader = req.headers.authorization;
  if (!authHeader || authHeader.indexOf('Bearer ') !== 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var token = authHeader.substring(7);
  var anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  var userResp = await anonClient.auth.getUser(token);
  if (userResp.error || !userResp.data.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  var userEmail = userResp.data.user.email || '';
  var adminEmails = ['williamschaseh@gmail.com'];
  if (adminEmails.indexOf(userEmail) === -1) {
    return res.status(403).json({ error: 'Not an admin' });
  }

  var serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  var body = req.body;
  var id = body.id;
  if (!id) {
    return res.status(400).json({ error: 'id required' });
  }

  delete body.id;

  var result = await serviceClient
    .from('phenomena')
    .update(body)
    .eq('id', id)
    .select('id, name, slug')
    .single();

  if (result.error) {
    return res.status(500).json({ error: result.error.message });
  }

  return res.status(200).json({ success: true, updated: result.data });
}
