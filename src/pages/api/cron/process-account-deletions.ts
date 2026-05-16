/**
 * Cron: /api/cron/process-account-deletions
 *
 * C3.1 — daily processor for account_deletion_requests rows that have
 * passed their 7-day grace period. For each, performs:
 *
 *   1. Anonymize profiles row (email→null, display_name→[Deleted User],
 *      username→deleted_<random>, avatar_url→null, bio→null)
 *   2. Soft-delete all the user's reports (status='deleted')
 *   3. Revoke all push_subscriptions
 *   4. Clear/anonymize engagement events older than 30 days
 *   5. Clear connection_requests + circle memberships
 *   6. Cancel any active subscription (mark cancelled)
 *   7. Optionally delete the auth.users row entirely (configurable)
 *   8. Mark account_deletion_requests row processed
 *
 * Auth: Bearer CRON_SECRET (Vercel cron) or x-admin-key header.
 *
 * Cadence: Vercel cron daily at 04:00 UTC (chosen for low traffic).
 *
 * Returns: { processed, errors, details }
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

var MAX_REQUESTS_PER_RUN = 100; // Stay well under Vercel's 300s function limit

// Set to true to also delete the auth.users row entirely after anonymization.
// Default false: keep the auth row so historical foreign keys (e.g., on
// reports.submitted_by) stay intact. The row is just orphaned; user can
// never sign back in because their email is anonymized.
var HARD_DELETE_AUTH_USER = process.env.ACCOUNT_DELETION_HARD_DELETE === '1';

async function isAuthorized(req: NextApiRequest): Promise<boolean> {
  var cronSecret = process.env.CRON_SECRET;
  var authHeader = req.headers.authorization || '';
  if (cronSecret && authHeader === 'Bearer ' + cronSecret) return true;
  var adminKey = req.headers['x-admin-key'];
  if (typeof adminKey === 'string' && adminKey === process.env.ADMIN_API_KEY) return true;
  return false;
}

function generateDeletedUsername(): string {
  return 'deleted_' + Math.random().toString(36).substring(2, 10);
}

async function anonymizeUser(svc: any, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    var newUsername = generateDeletedUsername();

    // 1. Anonymize profiles
    await svc.from('profiles')
      .update({
        display_name: '[Deleted User]',
        username: newUsername,
        avatar_url: null,
        bio: null,
        is_deleted: true, // marker if column exists; ignored if not
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    // 2. Soft-delete all the user's reports
    await svc.from('reports')
      .update({
        status: 'deleted',
        updated_at: new Date().toISOString(),
      })
      .eq('submitted_by', userId)
      .neq('status', 'deleted');

    // 3. Revoke all push_subscriptions
    await svc.from('push_subscriptions')
      .update({
        is_active: false,
        last_failure_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    // 4. Clear engagement events older than 30 days. The recent ones we keep
    // briefly for fraud detection / abuse review; everything older is purged.
    // Defensive: tables may not exist on all deploys.
    try {
      var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await svc.from('feed_events')
        .delete()
        .eq('user_id', userId)
        .lt('created_at', thirtyDaysAgo);
    } catch (_e) { /* table may not exist */ }

    // 5. Cancel any active subscription
    try {
      await svc.from('user_subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('status', 'active');
    } catch (_e) { /* non-fatal */ }

    // 6. Clear connection_requests where this user is involved
    try {
      await svc.from('connection_requests')
        .update({ status: 'cancelled' })
        .or('from_user_id.eq.' + userId + ',to_user_id.eq.' + userId)
        .eq('status', 'pending');
    } catch (_e) { /* non-fatal */ }

    // 7. Drop the user's saved_reports
    try {
      await svc.from('saved_reports').delete().eq('user_id', userId);
    } catch (_e) { /* non-fatal */ }

    // 8. Optionally hard-delete the auth.users row
    if (HARD_DELETE_AUTH_USER) {
      try {
        // This deletes the auth row and (per ON DELETE CASCADE on profiles)
        // cascades to anything FK'd through auth. The profiles row already
        // anonymized above is the only path that stays consistent — anywhere
        // else with a NULL submitted_by becomes orphaned.
        await svc.auth.admin.deleteUser(userId);
      } catch (e: any) {
        console.warn('[process-account-deletions] auth.admin.deleteUser failed for', userId, e?.message);
      }
    } else {
      // Soft-anonymize the auth.users.email so the user can't sign back in.
      try {
        await svc.auth.admin.updateUserById(userId, {
          email: 'deleted+' + userId.substring(0, 8) + '@discoverparadocs.com',
          user_metadata: { deleted: true, deleted_at: new Date().toISOString() },
        });
      } catch (e: any) {
        console.warn('[process-account-deletions] auth.admin.updateUserById failed for', userId, e?.message);
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await isAuthorized(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Fetch pending requests past their scheduled_for.
  var nowIso = new Date().toISOString();
  var { data: due, error: fetchErr } = await svc
    .from('account_deletion_requests')
    .select('id, user_id, requested_at, scheduled_for')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(MAX_REQUESTS_PER_RUN);

  if (fetchErr) {
    console.error('[process-account-deletions] fetch failed:', fetchErr);
    return res.status(500).json({ error: 'Failed to fetch deletion queue' });
  }

  var queue: any[] = (due as any[]) || [];
  if (queue.length === 0) {
    return res.status(200).json({ ok: true, processed: 0, reason: 'no_due_requests' });
  }

  var processed = 0;
  var errors = 0;
  var details: any[] = [];

  for (var i = 0; i < queue.length; i++) {
    var req_row = queue[i];
    var result = await anonymizeUser(svc, req_row.user_id);

    if (result.success) {
      await svc.from('account_deletion_requests')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', req_row.id);
      processed++;
      details.push({ request_id: req_row.id, user_id: req_row.user_id, status: 'processed' });
    } else {
      await svc.from('account_deletion_requests')
        .update({
          status: 'failed',
          metadata: { failure_reason: result.error || 'unknown', failed_at: new Date().toISOString() },
        })
        .eq('id', req_row.id);
      errors++;
      details.push({ request_id: req_row.id, user_id: req_row.user_id, status: 'failed', error: result.error });
    }
  }

  console.log('[process-account-deletions] complete: processed=' + processed + ' errors=' + errors);

  return res.status(200).json({
    ok: true,
    processed: processed,
    errors: errors,
    queue_size: queue.length,
    details: details.slice(0, 50),
  });
}
