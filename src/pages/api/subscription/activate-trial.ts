/**
 * API: POST /api/subscription/activate-trial
 *
 * T1.8 + E0.5 — auto-activate a 7-day Basic free trial on a user's
 * first experience submission. Called fire-and-forget from the
 * /start submit success path.
 *
 * Behavior:
 *   - Auth: Bearer JWT (user-scoped)
 *   - Idempotent: if user is already on a paid tier or already on
 *     trial, returns 200 OK with no-op flag.
 *   - On success: updates the user's existing active subscription
 *     row to tier=basic, is_trial=true, trial_started_at=NOW(),
 *     trial_ends_at=NOW()+7d. Also updates profiles.current_tier_id.
 *   - Trial behavior is governed by docs/TIER_DESIGN_V2.md:
 *     - During trial, user has full Basic-tier entitlements
 *     - At trial end (when trial_ends_at < NOW()): a separate cron
 *       (TBD, follow-up task) flips status back to 'active' with
 *       tier=free, is_trial=false. Until that cron lands, expired
 *       trials are detected on read via the trial_ends_at check.
 *
 * Returns:
 *   { ok: true, activated: true,  trial_ends_at: ISO } on activation
 *   { ok: true, activated: false, reason: 'already_paid' | 'already_on_trial' | 'no_eligible_subscription' } on no-op
 *
 * SWC: var + function() form for compat.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

var TRIAL_DAYS = 7;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var supabase = createServerClient();

    // ---- Auth ----
    var authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    var userToken = authHeader.replace('Bearer ', '');
    var userResult = await supabase.auth.getUser(userToken);
    if (!userResult.data.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    var user = userResult.data.user;

    // ---- Look up Basic tier ----
    var { data: basicTier, error: basicErr } = await (supabase
      .from('subscription_tiers') as any)
      .select('id, name, price_monthly, free_trial_days')
      .eq('name', 'basic')
      .single();
    if (basicErr || !basicTier) {
      console.error('[activate-trial] Basic tier not found:', basicErr);
      return res.status(500).json({ error: 'Trial tier unavailable' });
    }

    // ---- Look up current subscription ----
    var { data: currentSub, error: subErr } = await (supabase
      .from('user_subscriptions') as any)
      .select('id, tier_id, status, is_trial, trial_ends_at, tier:subscription_tiers(name, price_monthly)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // No subscription row exists at all — user predates the default-tier
    // trigger from 003_subscriptions.sql, OR the trigger failed silently.
    // Either way, INSERT a new trial subscription rather than no-op'ing.
    // This makes the endpoint resilient against missing-row edge cases.
    if (subErr || !currentSub) {
      var nowInsert = new Date();
      var trialEndsInsert = new Date(nowInsert.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

      var { error: insertErr } = await (supabase
        .from('user_subscriptions') as any)
        .insert({
          user_id: user.id,
          tier_id: basicTier.id,
          status: 'active',
          is_trial: true,
          trial_started_at: nowInsert.toISOString(),
          trial_ends_at: trialEndsInsert.toISOString(),
          started_at: nowInsert.toISOString(),
        });

      if (insertErr) {
        console.error('[activate-trial] insert (no prior sub) failed:', insertErr);
        return res.status(500).json({ error: 'Failed to activate trial (insert)' });
      }

      await (supabase.from('profiles') as any)
        .update({ current_tier_id: basicTier.id })
        .eq('id', user.id);

      console.log('[activate-trial] activated (via INSERT) for user', user.id, 'until', trialEndsInsert.toISOString());

      return res.status(200).json({
        ok: true,
        activated: true,
        trial_ends_at: trialEndsInsert.toISOString(),
        tier: 'basic',
        via: 'insert',
      });
    }

    // Idempotency: already on a paid tier? No-op.
    var currentTierName = (currentSub as any).tier?.name;
    var currentTierPrice = (currentSub as any).tier?.price_monthly || 0;
    if (currentTierName && currentTierName !== 'free' && currentTierPrice > 0) {
      return res.status(200).json({
        ok: true,
        activated: false,
        reason: 'already_paid',
      });
    }

    // Idempotency: already on trial? No-op.
    if (currentSub.is_trial) {
      return res.status(200).json({
        ok: true,
        activated: false,
        reason: 'already_on_trial',
        trial_ends_at: currentSub.trial_ends_at,
      });
    }

    // ---- Activate trial ----
    var now = new Date();
    var trialEnds = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    var { error: updateErr } = await (supabase
      .from('user_subscriptions') as any)
      .update({
        tier_id: basicTier.id,
        is_trial: true,
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnds.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', currentSub.id);

    if (updateErr) {
      console.error('[activate-trial] Update failed:', updateErr);
      return res.status(500).json({ error: 'Failed to activate trial' });
    }

    // Mirror current_tier_id on profiles so the rest of the app sees Basic
    await (supabase.from('profiles') as any)
      .update({ current_tier_id: basicTier.id })
      .eq('id', user.id);

    console.log('[activate-trial] activated for user', user.id, 'until', trialEnds.toISOString());

    return res.status(200).json({
      ok: true,
      activated: true,
      trial_ends_at: trialEnds.toISOString(),
      tier: 'basic',
    });
  } catch (err: any) {
    console.error('[activate-trial] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
