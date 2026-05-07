/**
 * API: POST /api/subscription/create-checkout
 *
 * Creates a Stripe Checkout session for upgrading to a paid plan.
 * Returns the checkout URL for the client to redirect to.
 *
 * Body: { plan: 'basic' | 'pro' | 'enterprise', interval: 'monthly' | 'yearly' }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

// Stripe price IDs sourced from env vars only.
//
// V9.6 — dropped the hardcoded test-mode Price ID fallbacks
// (price_1T1HGT…) that were left over from the original $9.99/$29.99
// pricing. Now that the public pricing is $5.99/$14.99 (V9.6 T1.2),
// those old test prices would charge the wrong amount if they ever
// resolved against a live Stripe key. Any unset env var falls
// through to the mock-checkout branch below, which is the safe
// behaviour while Stripe products are being reconfigured.
var STRIPE_PRICES: Record<string, string> = {
  basic_monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY || '',
  basic_yearly: process.env.STRIPE_PRICE_BASIC_YEARLY || '',
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY || '',
  enterprise_monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '',
  enterprise_yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || '',
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var supabase = createServerClient();

    // Get authenticated user from Authorization header
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
    var plan = req.body.plan || 'pro';
    var interval = req.body.interval || 'monthly';
    var priceKey = plan + '_' + interval;
    var priceId = STRIPE_PRICES[priceKey];

    if (!priceId) {
      // V9.6 — no env var configured for this plan/interval. Always
      // fall back to the mock-checkout URL regardless of whether
      // STRIPE_SECRET_KEY is set, so we never charge users at the
      // wrong (legacy) price while Stripe products are being set up.
      return res.status(200).json({
        url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com') +
          '/account/settings?checkout=mock&plan=' + plan,
        mock: true,
        reason: 'stripe_price_not_configured'
      });
    }

    // Dynamic import of Stripe to avoid issues if not installed
    var Stripe;
    try {
      Stripe = (await import('stripe')).default;
    } catch (e) {
      // Stripe not installed \u2014 return mock checkout
      return res.status(200).json({
        url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com') +
          '/account/settings?checkout=mock&plan=' + plan,
        mock: true
      });
    }

    var stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2023-10-16' as any
    });

    // Check if user already has a Stripe customer ID
    var profileResult = await (supabase
      .from('profiles') as any)
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    var customerId = profileResult.data ? profileResult.data.stripe_customer_id : null;

    // Create or retrieve Stripe customer
    if (!customerId) {
      var customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;

      // Save customer ID to profile
      await (supabase.from('profiles') as any)
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    var baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com';

    // Create checkout session
    var session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: baseUrl + '/account/settings?checkout=success&plan=' + plan,
      cancel_url: baseUrl + '/account/settings?checkout=cancelled',
      metadata: {
        supabase_user_id: user.id,
        plan: plan,
        interval: interval
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan: plan
        }
      },
      allow_promotion_codes: true
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('[CreateCheckout] Error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
