/**
 * Cron API: GET/POST /api/cron/auto-image-search
 *
 * T1.6.x — drains the lazy-image queue that T1.6 populated. When a
 * report gets tagged to a phenomenon that has no primary_image_url,
 * ingestion-engine.ts flips phenomena.profile_review_status to
 * 'pending_search'. This cron walks those rows and runs the
 * Wikimedia Commons search via the existing admin endpoint, then
 * surfaces the candidate image to the admin media-review queue
 * with status='unreviewed'.
 *
 * Auth: same pattern as analyze-patterns-v2 —
 *   - X-Cron-Secret header OR
 *   - Authorization: Bearer ${CRON_SECRET} OR
 *   - localhost (dev convenience)
 *
 * Gating: INGESTION_ENABLED env var must equal 'true' (matches
 * analyze-patterns-v2's kill switch). Default disabled during the
 * B1.5 QA/QC phase so an accidentally-scheduled cron doesn't burn
 * Wikimedia API budget before launch.
 *
 * Query params (optional):
 *   batch_size — default 10 per run, max 50 (cron is meant to drip,
 *                not flood)
 *   category   — restrict to one phenomenon category
 *
 * The cron is intentionally light. The heavy lifting (Wikimedia
 * search, AI confidence scoring, DB writes) lives in the existing
 * admin endpoint /api/admin/phenomena/auto-search-profile-images.
 * This cron just fires it on a schedule with a small batch size.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export var config = {
  maxDuration: 120,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth — accept either Vercel cron Authorization header, an
  // external cron service X-Cron-Secret header, or localhost.
  var authHeader = req.headers.authorization || req.headers['x-cron-secret'] || '';
  var cronSecret = process.env.CRON_SECRET;
  var isLocalhost = (req.headers.host || '').indexOf('localhost') !== -1;
  var isValidAuth = !cronSecret
    || authHeader === 'Bearer ' + cronSecret
    || authHeader === cronSecret;

  if (!isLocalhost && !isValidAuth) {
    console.log('[Auto-Image-Search Cron] Unauthorized');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Kill switch — auto image search disabled during the B1.5 QA/QC
  // phase. Set INGESTION_ENABLED=true in env to enable, same as the
  // pattern-analysis cron.
  if (process.env.INGESTION_ENABLED !== 'true') {
    console.log('[Auto-Image-Search Cron] Disabled (INGESTION_ENABLED != true). Skipping.');
    return res.status(200).json({
      skipped: true,
      reason: 'Auto image search disabled during B1.5 QA/QC phase. Set INGESTION_ENABLED=true to enable.',
    });
  }

  // Tunables. batch_size kept small so each invocation finishes well
  // inside the 120s maxDuration and respects Wikimedia's 250ms rate
  // limit (a batch of 10 phenomena with ~3 search terms each + image
  // info lookups = ~30 HTTP requests ~ 8s, well within budget).
  var rawBatch = parseInt(String(req.query.batch_size || req.body?.batch_size || '10'), 10);
  if (isNaN(rawBatch) || rawBatch <= 0) rawBatch = 10;
  if (rawBatch > 50) rawBatch = 50;
  var category = (req.query.category || req.body?.category || '').toString() || null;

  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceKey) {
    console.error('[Auto-Image-Search Cron] Missing SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Service role key not configured' });
  }

  // Resolve the absolute URL for the admin endpoint. NEXT_PUBLIC_SITE_URL
  // is the prod canonical; VERCEL_URL is the per-deploy URL; localhost
  // is the dev fallback.
  var siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : null)
    || 'http://localhost:3000';

  var startedAt = Date.now();
  try {
    console.log('[Auto-Image-Search Cron] Starting batch_size=' + rawBatch + ' category=' + (category || '<all>'));

    var body: Record<string, any> = {
      batch_size: rawBatch,
      confidence_threshold: 0.65,
      include_denied: false, // cron sticks to fresh queue; admin UI handles retries
    };
    if (category) body.category = category;

    var adminResp = await fetch(siteUrl + '/api/admin/phenomena/auto-search-profile-images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + serviceKey,
      },
      body: JSON.stringify(body),
    });

    var adminText = await adminResp.text();
    var adminJson: any = null;
    try { adminJson = JSON.parse(adminText); } catch (_) { /* leave as text */ }

    if (!adminResp.ok) {
      console.warn('[Auto-Image-Search Cron] Admin endpoint non-OK:', adminResp.status, adminText.substring(0, 200));
      return res.status(502).json({
        ok: false,
        upstream_status: adminResp.status,
        upstream_body: adminText.substring(0, 500),
      });
    }

    var durationMs = Date.now() - startedAt;
    console.log(
      '[Auto-Image-Search Cron] Complete in ' + durationMs + 'ms — ' +
      'found=' + (adminJson?.summary?.images_found ?? 0) + ' ' +
      'no_match=' + (adminJson?.summary?.no_match ?? 0) + ' ' +
      'errors=' + (adminJson?.summary?.errors ?? 0) + ' ' +
      'remaining=' + ((adminJson?.summary?.total_needing_images ?? 0) - rawBatch)
    );

    return res.status(200).json({
      ok: true,
      duration_ms: durationMs,
      summary: adminJson?.summary || null,
      results_count: Array.isArray(adminJson?.results) ? adminJson.results.length : 0,
    });
  } catch (e: any) {
    console.error('[Auto-Image-Search Cron] Fatal:', e?.message || e);
    return res.status(500).json({
      ok: false,
      error: e?.message || 'Unknown error',
    });
  }
}
