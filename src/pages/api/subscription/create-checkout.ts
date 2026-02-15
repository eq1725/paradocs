/**
 * API: POST /api/subscription/create-checkout
 *
 * Creates a Stripe Checkout session for upgrading to a paid plan.
 * Returns the checkout URL for the client to redirect to.
 *
 * Body: { plan: 'basic' | 'pro' }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

var STRIPE_PRICES: Record<string, string> = {
  basic_monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY || '',
  basic_yearly: process.env.STRIPE_PRICE_BASIC_YEARLY || '',
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY || '',
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

    // Get authenticated user from session cookie
    var userResult = await supabase.auth.getUser(
      req.cookies['sb-bhkbctdmwnowfmqpksed-auth-token'] ||
      (req.headers.authorization || '').replace('Bearer ', '')
    );

    if (!userResult.data.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    var user = userResult.data.user;
    var plan = req.body.plan || 'pro';
    var interval = req.body.interval || 'monthly';
    var priceKey = plan + '_' + interval;
    var priceId = STRIPE_PRICES[priceKey];

    if (!priceId) {
      // If no Stripe prices configured, return mock checkout for development
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(200).json({
          url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com') +
            '/dashboard/settings?checkout=mock&plan=' + plan,
          mock: true
        });
      }
      return res.status(400).json({ error: 'Invalid plan or interval' });
    }

    // Dynamic import of Stripe to avoid issues if not installed
    var Stripe;
    try {
      Stripe = (await import('stripe')).default;
    } catch (e) {
      // Stripe not installed — return mock checkout
      return res.status(200).json({
        url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com') +
          '/dashboard/settings?checkout=mock&plan=' + plan,
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
      success_url: baseUrl + '/dashboard/settings?checkout=success&plan=' + plan,
      cancel_url: baseUrl + '/dashboard/settings?checkout=cancelled',
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
