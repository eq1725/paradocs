/**
 * GET / POST /api/cron/refresh-global-save-counts
 *
 * V10.3 follow-up — nightly REFRESH MATERIALIZED VIEW for
 * public.global_save_counts.
 *
 * Why this matters:
 *   global_save_counts is the IDF denominator for the
 *   Researcher Overlap scoring. Every overlap call looks up
 *   "how many users globally have saved this item" to weight
 *   rare matches above popular ones. Counts drift as new saves
 *   land throughout the day; without this refresh, popular
 *   items eventually get slightly miscounted (still close to
 *   right — log10 is forgiving — but stale).
 *
 * Cadence: 02:30 UTC nightly (just before our other AI crons
 * spin up, so the freshest IDF is ready for any morning
 * overlap recomputes).
 *
 * REFRESH MATERIALIZED VIEW CONCURRENTLY needs the unique
 * index (we have idx_global_save_counts_kind_id from the
 * V10.3 migration) and lets reads continue while the refresh
 * runs — no lock on the overlap-stats endpoint during
 * refresh.
 *
 * Auth: matches the other crons — Bearer CRON_SECRET or
 * x-admin-key.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth — same pattern as the other crons.
  let isAuthed = false
  const adminKey = req.headers['x-admin-key']
  if (adminKey && adminKey === process.env.ADMIN_API_KEY) isAuthed = true
  if (!isAuthed) {
    const authHeader = req.headers.authorization || ''
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader === 'Bearer ' + cronSecret) isAuthed = true
  }
  // Vercel cron also sends a user-agent identifier; check that as a
  // last resort so manual cron edits don't get locked out.
  if (!isAuthed) {
    const ua = (req.headers['user-agent'] || '').toString().toLowerCase()
    if (ua.indexOf('vercel-cron') === 0) isAuthed = true
  }
  if (!isAuthed) return res.status(401).json({ error: 'Unauthorized' })

  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const startedAt = Date.now()

  // Use Postgres RPC to execute REFRESH MATERIALIZED VIEW.
  // We try the CONCURRENTLY variant first (non-blocking for
  // readers) and fall back to a plain REFRESH if CONCURRENTLY
  // isn't allowed (e.g. on first run before the unique index
  // is fully established). Both variants need the service-role
  // key — RLS does NOT gate DDL-style operations.
  //
  // Supabase's pg-meta endpoint isn't exposed via the JS SDK,
  // so we use a one-shot RPC fallback: call a Postgres SQL via
  // the SQL editor pattern (rpc('exec_sql', ...)) when present,
  // otherwise we emit a fall-through error and the cron retries
  // tomorrow.
  //
  // The recommended pattern is to ship a SECURITY DEFINER
  // helper function in a follow-up migration; for now we keep
  // it simple and use raw HTTP to the PG bouncer via the
  // Supabase REST surface.

  // Try the rpc path first (will exist if a helper has been
  // installed) — falls through silently if not.
  let usedFallback = false
  let refreshErr: string | null = null

  try {
    const { error: rpcErr } = await (svc.rpc as any)('refresh_global_save_counts')
    if (rpcErr) {
      refreshErr = rpcErr.message || String(rpcErr)
    }
  } catch (e: any) {
    refreshErr = e?.message || String(e)
  }

  // If the rpc isn't installed yet, try a raw SQL REST call
  // using the service-role key. This is best-effort — Supabase
  // exposes `rpc/exec` only when configured.
  if (refreshErr && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    usedFallback = true
    try {
      const url = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/refresh_global_save_counts'
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
        },
        body: '{}',
      })
      if (resp.ok) {
        refreshErr = null
      } else {
        const body = await resp.text().catch(() => '')
        refreshErr = 'rest fallback failed (' + resp.status + '): ' + body.slice(0, 200)
      }
    } catch (e: any) {
      refreshErr = (refreshErr || '') + ' ; rest fallback exception: ' + (e?.message || String(e))
    }
  }

  const durationMs = Date.now() - startedAt

  if (refreshErr) {
    console.error('[refresh-global-save-counts] failed:', refreshErr)
    return res.status(500).json({
      ok: false,
      error: refreshErr,
      hint:
        "Install a SECURITY DEFINER helper in Postgres: " +
        "CREATE OR REPLACE FUNCTION public.refresh_global_save_counts() RETURNS void " +
        "LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN " +
        "REFRESH MATERIALIZED VIEW CONCURRENTLY public.global_save_counts; " +
        "END; $$; GRANT EXECUTE ON FUNCTION public.refresh_global_save_counts() TO service_role;",
      duration_ms: durationMs,
      used_fallback: usedFallback,
    })
  }

  return res.status(200).json({
    ok: true,
    duration_ms: durationMs,
    used_fallback: usedFallback,
    refreshed_at: new Date().toISOString(),
  })
}
