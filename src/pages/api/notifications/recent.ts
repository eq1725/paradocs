/**
 * API: GET /api/notifications/recent
 *
 * T1.9 — returns the most recent notifications for the authenticated
 * user. Drives the NotificationsBell dropdown. MVP: returns at most
 * 10, no pagination, no unread state.
 *
 * Auth: Bearer JWT (user-scoped).
 *
 * Response:
 *   { ok: true, notifications: [
 *     { id, type, title, body, link_url, created_at }, ...
 *   ] }
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

var MAX_NOTIFICATIONS = 10;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var supabase = createServerClient();

    var authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    var token = authHeader.replace('Bearer ', '');
    var userResult = await supabase.auth.getUser(token);
    if (!userResult.data.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    var userId = userResult.data.user.id;

    var { data, error } = await (supabase
      .from('user_notifications') as any)
      .select('id, type, title, body, link_url, created_at, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_NOTIFICATIONS);

    if (error) {
      console.error('[notifications/recent] query error:', error);
      return res.status(500).json({ error: 'Failed to load notifications' });
    }

    // Cache lightly to keep the bell dropdown snappy without staleness.
    res.setHeader('Cache-Control', 'private, max-age=30, must-revalidate');
    return res.status(200).json({ ok: true, notifications: data || [] });
  } catch (err: any) {
    console.error('[notifications/recent] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
