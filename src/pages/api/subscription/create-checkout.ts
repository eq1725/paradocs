// V11.17.68 - Tier 2A
//
// API: POST /api/subscription/create-checkout
//
// Creates a Stripe Checkout session for upgrading to a paid plan.
// Returns the checkout URL for the client to redirect to.
//
// Body: { plan: 'basic' | 'pro', interval: 'monthly' | 'annual' | 'yearly' }
//
// Tier 2A changes (V11.17.68):
//   - Added STRIPE_PRICE_BASIC_ANNUAL / STRIPE_PRICE_PRO_ANNUAL env
//     vars for the new annual cadence (founder confirmed annual ships
//     at launch; $59/yr Basic, $149/yr Pro, ~17% off monthly).
//   - 'annual' and 'yearly' are accepted as synonyms in the request
//     body; the legacy '_yearly' env var name is kept as a fallback so
//     existing infra still resolves while new keys roll out.
//   - success_url → /account/subscription?checkout=success&plan=…
//     (was /account/settings — wrong page; the subscription page is
//     where the user's new tier state is visible).
//   - cancel_url → /pricing?checkout=cancelled (was /account/settings;
//     panel memo §3.6 puts the user back where they decided).
//   - subscription_data.metadata carries supabase_user_id + plan +
//     cadence so the webhook can resolve the right tier without
//     re-querying Stripe.
//
// V9.6 — dropped the hardcoded test-mode Price ID fallbacks
// (price_1T1HGT…) that were left over from the original $9.99/$29.99
// pricing. Any unset env var falls through to the mock-checkout
// branch below, which is the safe behaviour while Stripe products are
// being reconfigured.

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

// Resolve a price ID from env. Annual prices accept both the new
// ANNUAL key and the legacy YEARLY key to ease the migration.
function resolvePriceId(plan: string, interval: string): string {
  var p = plan.toLowerCase();
  var i = interval.toLowerCase();
  // Normalize 'yearly' (legacy) → 'annual' (new naming the founder
  // sent in the brief) so callers can pass either.
  if (i === 'yearly') i = 'annual';
  if (i !== 'monthly' && i !== 'annual') return '';

  if (p === 'basic' && i === 'monthly') {
    return process.env.STRIPE_PRICE_BASIC_MONTHLY || '';
  }
  if (p === 'basic' && i === 'annual') {
    return (
      process.env.STRIPE_PRICE_BASIC_ANNUAL ||
      process.env.STRIPE_PRICE_BASIC_YEARLY ||
      ''
    );
  }
  if (p === 'pro' && i === 'monthly') {
    return process.env.STRIPE_PRICE_PRO_MONTHLY || '';
  }
  if (p === 'pro' && i === 'annual') {
    return (
      process.env.STRIPE_PRICE_PRO_ANNUAL ||
      process.env.STRIPE_PRICE_PRO_YEARLY ||
      ''
    );
  }
  // Legacy enterprise tier — admin-only, never surfaced publicly but
  // kept resolvable in case an admin tool needs it.
  if (p === 'enterprise' && i === 'monthly') {
    return process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '';
  }
  if (p === 'enterprise' && i === 'annual') {
    return (
      process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL ||
      process.env.STRIPE_PRICE_ENTERPRISE_YEARLY ||
      ''
    );
  }
  return '';
}

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
    var plan = (req.body.plan || 'pro') as string;
    var interval = (req.body.interval || 'monthly') as string;
    // V11.27 — derive the return URL from NEXT_PUBLIC_SITE_URL if set, else
    // from the ACTUAL request host. The old fallback was a hardcoded dead
    // beta domain (no DNS), so post-checkout Stripe redirected paying users
    // to an unreachable page. Using req host means the success/cancel URLs
    // always match the domain the user is actually on.
    var siteBase = process.env.NEXT_PUBLIC_SITE_URL || ('https://' + (req.headers.host || 'www.discoverparadocs.com'));
    // Normalize cadence to the new 'annual' naming used in metadata
    // + URLs even when the caller still sends 'yearly'.
    var cadence = interval.toLowerCase() === 'yearly' ? 'annual' : interval.toLowerCase();
    var priceId = resolvePriceId(plan, cadence);

    if (!priceId) {
      // V9.6 — no env var configured for this plan/interval. Always
      // fall back to the mock-checkout URL regardless of whether
      // STRIPE_SECRET_KEY is set, so we never charge users at the
      // wrong (legacy) price while Stripe products are being set up.
      return res.status(200).json({
        url: siteBase +
          '/account/subscription?checkout=mock&plan=' + plan + '&cadence=' + cadence,
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
        url: siteBase +
          '/account/subscription?checkout=mock&plan=' + plan + '&cadence=' + cadence,
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

    var baseUrl = siteBase;

    // Create checkout session
    var session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // V11.17.68 — success lands on /account/subscription (the page
      // that actually shows the user their new tier state); cancel
      // returns to /pricing so the user is back where they decided.
      success_url: baseUrl + '/account/subscription?checkout=success&plan=' + plan + '&cadence=' + cadence,
      cancel_url: baseUrl + '/pricing?checkout=cancelled',
      metadata: {
        supabase_user_id: user.id,
        plan: plan,
        interval: interval,
        cadence: cadence
      },
      subscription_data: {
        // V11.17.68 — webhook reads cadence from sub metadata so it
        // can set the right tier on the user record without a Stripe
        // round-trip. user_id duplicated here so the subscription
        // event handlers (which only see the subscription object) can
        // resolve the user too.
        metadata: {
          supabase_user_id: user.id,
          user_id: user.id,
          plan: plan,
          tier: plan,
          cadence: cadence
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
