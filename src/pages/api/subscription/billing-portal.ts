/**
 * API: POST /api/subscription/billing-portal
 *
 * Creates a Stripe Billing Portal session so users can manage
 * their subscription, update payment methods, and view invoices.
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

    // Get stripe customer ID from profile
    var profileResult = await (supabase
      .from('profiles') as any)
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    var customerId = profileResult.data ? profileResult.data.stripe_customer_id : null;

    if (!customerId) {
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

    var baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://beta.discoverparadocs.com';

    var session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: baseUrl + '/dashboard/subscription'
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('[BillingPortal] Error:', error);
    return res.status(500).json({ error: 'Failed to create billing portal session' });
  }
}
