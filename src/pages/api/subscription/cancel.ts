/**
 * API: POST /api/subscription/cancel
 *
 * Cancels the user's current Stripe subscription.
 * Sets it to cancel at the end of the current billing period.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var supabase = createServerClient();

    var userResult = await supabase.auth.getUser(
      req.cookies['sb-bhkbctdmwnowfmqpksed-auth-token'] ||
      (req.headers.authorization || '').replace('Bearer ', '')
    );

    if (!userResult.data.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    var user = userResult.data.user;

    // Get the active subscription
    var subResult = await (supabase
      .from('user_subscriptions') as any)
      .select('payment_subscription_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!subResult.data || !subResult.data.payment_subscription_id) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    var Stripe;
    try {
      Stripe = (await import('stripe')).default;
    } catch (e) {
      return res.status(500).json({ error: 'Stripe not available' });
    }

    var stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2023-10-16' as any
    });

    // Cancel at period end (not immediately)
    await stripe.subscriptions.update(subResult.data.payment_subscription_id, {
      cancel_at_period_end: true
    });

    // Update local record
    await (supabase.from('user_subscriptions') as any)
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: req.body.reason || null
      })
      .eq('user_id', user.id)
      .eq('status', 'active');

    console.log('[CancelSubscription] Cancelled for user ' + user.id);

    return res.status(200).json({ success: true, message: 'Subscription will cancel at end of billing period' });
  } catch (error) {
    console.error('[CancelSubscription] Error:', error);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}
