/**
 * API: /api/account/delete
 *
 * C3.1 — user-initiated account deletion. Required by Apple Guideline
 * 5.1.1(v) and Google Play Data Safety. Three methods on this endpoint:
 *
 *   POST   — Request deletion. Body: { confirmation: 'DELETE MY ACCOUNT' }
 *            Creates a pending request with 7-day grace period.
 *            Returns: { scheduled_for, request_id }
 *
 *   DELETE — Cancel a pending deletion during grace period.
 *            No body. Returns: { cancelled: true }
 *
 *   GET    — Check current deletion status for the user.
 *            Returns: { has_pending_request, scheduled_for?, request_id? }
 *
 * Auth: Bearer JWT (user-scoped).
 *
 * The actual anonymization runs in a separate daily cron
 * (/api/cron/process-account-deletions) after the grace period
 * expires. This endpoint just manages the request lifecycle.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

var GRACE_PERIOD_DAYS = 7;
var CONFIRMATION_REQUIRED = 'DELETE MY ACCOUNT';

function getClientIP(req: NextApiRequest): string | null {
  var forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0];
  var realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : null;
}

async function authedUser(req: NextApiRequest) {
  var supabase = createServerClient();
  var authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return { user: null, supabase: supabase };
  var token = authHeader.replace('Bearer ', '');
  var { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { user: null, supabase: supabase };
  return { user: data.user, supabase: supabase };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  var ctx = await authedUser(req);
  if (!ctx.user) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') return handleGet(req, res, ctx.supabase, ctx.user);
  if (req.method === 'POST') return handlePost(req, res, ctx.supabase, ctx.user);
  if (req.method === 'DELETE') return handleDelete(req, res, ctx.supabase, ctx.user);

  return res.status(405).json({ error: 'Method not allowed' });
}

/** GET — return current deletion request status (if any). */
async function handleGet(_req: NextApiRequest, res: NextApiResponse, supabase: any, user: any) {
  var { data, error } = await supabase
    .from('account_deletion_requests')
    .select('id, status, requested_at, scheduled_for, cancelled_at, processed_at')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[account/delete GET] query failed:', error);
    return res.status(500).json({ error: 'Failed to read deletion status' });
  }

  if (!data) {
    return res.status(200).json({ has_pending_request: false });
  }

  return res.status(200).json({
    has_pending_request: true,
    request_id: data.id,
    requested_at: data.requested_at,
    scheduled_for: data.scheduled_for,
  });
}

/**
 * POST — initiate deletion. Requires typed confirmation. Creates a
 * pending row with 7-day grace period. Idempotent: if a pending row
 * already exists for this user, returns the existing one.
 */
async function handlePost(req: NextApiRequest, res: NextApiResponse, supabase: any, user: any) {
  var body = req.body || {};
  var confirmation = String(body.confirmation || '').trim();

  if (confirmation !== CONFIRMATION_REQUIRED) {
    return res.status(400).json({
      error: 'Confirmation text required',
      details: 'Type "' + CONFIRMATION_REQUIRED + '" exactly to confirm account deletion.',
    });
  }

  // Idempotency — return existing pending request if one exists.
  var existing = await supabase
    .from('account_deletion_requests')
    .select('id, requested_at, scheduled_for')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing && existing.data) {
    return res.status(200).json({
      ok: true,
      already_pending: true,
      request_id: existing.data.id,
      requested_at: existing.data.requested_at,
      scheduled_for: existing.data.scheduled_for,
    });
  }

  var now = new Date();
  var scheduledFor = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  var { data, error } = await supabase
    .from('account_deletion_requests')
    .insert({
      user_id: user.id,
      requested_at: now.toISOString(),
      scheduled_for: scheduledFor.toISOString(),
      status: 'pending',
      confirmation_text: confirmation,
      ip_address: getClientIP(req),
      user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    })
    .select('id, requested_at, scheduled_for')
    .single();

  if (error || !data) {
    console.error('[account/delete POST] insert failed:', error);
    return res.status(500).json({ error: 'Failed to create deletion request' });
  }

  console.log('[account/delete POST] created request', data.id, 'for user', user.id, 'scheduled', data.scheduled_for);

  // Notify user via in-app notification (T1.9 user_notifications)
  try {
    await supabase.from('user_notifications').insert({
      user_id: user.id,
      type: 'account_deletion_scheduled',
      title: 'Account deletion scheduled',
      body: 'Your account will be deleted on ' + new Date(data.scheduled_for).toLocaleDateString() +
            '. You can cancel any time before then from your account settings.',
      link_url: '/account/delete',
      metadata: { request_id: data.id, scheduled_for: data.scheduled_for },
    });
  } catch (_e) { /* notifications table may not exist; non-fatal */ }

  return res.status(200).json({
    ok: true,
    request_id: data.id,
    requested_at: data.requested_at,
    scheduled_for: data.scheduled_for,
  });
}

/**
 * DELETE — cancel a pending deletion during grace period.
 */
async function handleDelete(_req: NextApiRequest, res: NextApiResponse, supabase: any, user: any) {
  var { data, error } = await supabase
    .from('account_deletion_requests')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[account/delete DELETE] update failed:', error);
    return res.status(500).json({ error: 'Failed to cancel deletion request' });
  }

  if (!data) {
    return res.status(404).json({ error: 'No pending deletion request found' });
  }

  console.log('[account/delete DELETE] cancelled request', data.id, 'for user', user.id);

  // Notify user
  try {
    await supabase.from('user_notifications').insert({
      user_id: user.id,
      type: 'account_deletion_cancelled',
      title: 'Account deletion cancelled',
      body: 'Your scheduled account deletion has been cancelled. Your account remains active.',
      link_url: '/account/settings',
      metadata: { request_id: data.id },
    });
  } catch (_e) { /* non-fatal */ }

  return res.status(200).json({ ok: true, cancelled: true, request_id: data.id });
}
