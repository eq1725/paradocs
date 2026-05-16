/**
 * API: /api/admin/source-takedown
 *
 * B0.5 — admin-only mass-archive tool. Pulls all ingested reports
 * from a given source_type in one operation. Used when a source's
 * ToS changes (Reddit, YouTube), a rights-holder issues a sweeping
 * takedown, or we discover quality issues with a source's adapter
 * output and need to roll back its contribution to the corpus.
 *
 * Routes:
 *   GET  → returns per-source counts of ingested reports (for the
 *          preview UI's dropdown + impact preview)
 *   POST { source_type, reason }
 *        → archives all reports where source_type=X AND
 *          report_type='ingested'. Returns the affected count.
 *          Logged to source_takedown_log for audit.
 *
 * Auth: admin email (williamschaseh@gmail.com) only.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var ADMIN_EMAIL = 'williamschaseh@gmail.com';

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  );
}

async function getAdminUser(req: NextApiRequest): Promise<{ id: string; email: string } | null> {
  var authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.replace('Bearer ', '');
  var svc = svcClient();
  var { data, error } = await svc.auth.getUser(token);
  if (error || !data.user || data.user.email !== ADMIN_EMAIL) return null;
  return { id: data.user.id, email: data.user.email };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  var user = await getAdminUser(req);
  if (!user) return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res, user);
  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * GET — per-source counts of ingested reports. Powers the preview
 * dropdown in the UI: admin picks a source_type, sees how many
 * reports would be affected before confirming the takedown.
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  var svc = svcClient();

  // Pull all distinct source_type values + counts in one query. For
  // a few hundred source_types this is fine; if we ever have
  // thousands, switch to a materialized view.
  var { data, error } = await svc
    .from('reports')
    .select('source_type, status')
    .eq('report_type', 'ingested');

  if (error) {
    console.error('[source-takedown] count query failed:', error);
    return res.status(500).json({ error: 'Failed to compute counts' });
  }

  // Aggregate in code: per source_type, total + per-status breakdown.
  var counts: Record<string, { total: number; by_status: Record<string, number> }> = {};
  ((data as any) || []).forEach(function (r: any) {
    var st = r.source_type || '(none)';
    if (!counts[st]) counts[st] = { total: 0, by_status: {} };
    counts[st].total++;
    var status = r.status || 'unknown';
    counts[st].by_status[status] = (counts[st].by_status[status] || 0) + 1;
  });

  // Sort source_types by count desc for the dropdown.
  var sources = Object.keys(counts)
    .map(function (st) { return { source_type: st, total: counts[st].total, by_status: counts[st].by_status }; })
    .sort(function (a, b) { return b.total - a.total; });

  return res.status(200).json({ ok: true, sources: sources });
}

/**
 * POST — execute the takedown. Archives all ingested reports for the
 * given source_type and writes an audit row.
 */
async function handlePost(req: NextApiRequest, res: NextApiResponse, user: { id: string; email: string }) {
  var body = req.body || {};
  var sourceType = String(body.source_type || '').trim();
  var reason = String(body.reason || '').trim().slice(0, 1000);

  if (!sourceType) {
    return res.status(400).json({ error: 'source_type is required' });
  }

  var svc = svcClient();

  // Recount affected rows just before mutating — keeps the audit log
  // accurate even if the dataset changed between preview and confirm.
  var { count: precount, error: precountErr } = await (svc
    .from('reports') as any)
    .select('id', { count: 'exact', head: true })
    .eq('report_type', 'ingested')
    .eq('source_type', sourceType)
    .neq('status', 'archived'); // skip already-archived (idempotent)

  if (precountErr) {
    console.error('[source-takedown] precount failed:', precountErr);
    return res.status(500).json({ error: 'Failed to enumerate affected reports' });
  }

  var affected = precount || 0;
  if (affected === 0) {
    // Still log the no-op so the audit trail captures every admin action.
    await svc.from('source_takedown_log').insert({
      performed_by: user.id,
      performed_by_email: user.email,
      source_type: sourceType,
      reports_affected: 0,
      reason: reason || null,
      metadata: { result: 'noop_no_active_reports' },
    });
    return res.status(200).json({ ok: true, affected: 0, note: 'No active ingested reports for that source.' });
  }

  // Execute the archival.
  var { error: updateErr } = await svc
    .from('reports')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('report_type', 'ingested')
    .eq('source_type', sourceType)
    .neq('status', 'archived');

  if (updateErr) {
    console.error('[source-takedown] update failed:', updateErr);
    return res.status(500).json({ error: 'Archive operation failed', details: updateErr.message });
  }

  // Audit log — happens after the mutation succeeds so we don't log
  // failed attempts as successful takedowns.
  await svc.from('source_takedown_log').insert({
    performed_by: user.id,
    performed_by_email: user.email,
    source_type: sourceType,
    reports_affected: affected,
    reason: reason || null,
    metadata: { result: 'archived' },
  });

  console.log(
    '[source-takedown] ' + user.email + ' archived ' + affected +
    ' reports from source_type=' + sourceType + ' reason=' + (reason || '(none)'),
  );

  return res.status(200).json({ ok: true, affected: affected, source_type: sourceType });
}
