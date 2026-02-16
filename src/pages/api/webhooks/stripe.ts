/**
 * API: POST /api/webhooks/stripe
 *
 * Handles Stripe webhook events for subscription management.
 * Events: checkout.session.completed, customer.subscription.updated,
 *         customer.subscription.deleted, invoice.payment_failed
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

export var config = {
  api: { bodyParser: false }
};

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise(function(resolve, reject) {
    var chunks: Buffer[] = [];
    req.on('data', function(chunk: Buffer) { chunks.push(chunk); });
    req.on('end', function() { resolve(Buffer.concat(chunks)); });
    req.on('error', function(err: Error) { reject(err); });
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var rawBody = await getRawBody(req);
  var sig = req.headers['stripe-signature'];
  var webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.log('[StripeWebhook] No webhook secret configured');
    return res.status(200).json({ received: true, mock: true });
  }

  var Stripe;
  try {
    Stripe = (await import('stripe')).default;
  } catch (e) {
    return res.status(200).json({ received: true, mock: true });
  }

  var stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16' as any
  });

  var event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
  } catch (err) {
    console.error('[StripeWebhook] Signature verification failed:', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  var supabase = createServerClient();

  try {
    if (event.type === 'checkout.session.completed') {
      var session = event.data.object as any;
      var userId = session.metadata ? session.metadata.supabase_user_id : null;
      var plan = session.metadata ? session.metadata.plan : 'pro';

      if (userId && session.subscription) {
        // Get the tier ID for this plan
        var tierResult = await (supabase
          .from('subscription_tiers') as any)
          .select('id')
          .eq('name', plan)
          .single();

        if (tierResult.data) {
          // Cancel any existing active subscription
          await (supabase.from('user_subscriptions') as any)
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('status', 'active');

          // Create new subscription record
          await (supabase.from('user_subscriptions') as any)
            .insert({
              user_id: userId,
              tier_id: tierResult.data.id,
              status: 'active',
              payment_provider: 'stripe',
              payment_subscription_id: session.subscription,
              payment_customer_id: session.customer,
              started_at: new Date().toISOString()
            });

          // Update profile tier
          await (supabase.from('profiles') as any)
            .update({
              current_tier_id: tierResult.data.id,
              stripe_customer_id: session.customer
            })
            .eq('id', userId);
        }

        console.log('[StripeWebhook] Subscription activated for user ' + userId + ' plan=' + plan);
      }
    } else if (event.type === 'customer.subscription.updated') {
      var subscription = event.data.object as any;
      var subUserId = subscription.metadata ? subscription.metadata.supabase_user_id : null;

      if (subUserId) {
        var status = subscription.status;
        var mappedStatus = status === 'active' ? 'active'
          : status === 'past_due' ? 'past_due'
          : status === 'canceled' ? 'cancelled'
          : status === 'trialing' ? 'trial'
          : 'expired';

        await (supabase.from('user_subscriptions') as any)
          .update({ status: mappedStatus })
          .eq('payment_subscription_id', subscription.id);

        console.log('[StripeWebhook] Subscription updated: ' + subscription.id + ' status=' + mappedStatus);
      }
    } else if (event.type === 'customer.subscription.deleted') {
      var deletedSub = event.data.object as any;
      var delUserId = deletedSub.metadata ? deletedSub.metadata.supabase_user_id : null;

      await (supabase.from('user_subscriptions') as any)
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
        .eq('payment_subscription_id', deletedSub.id);

      // Revert user to free tier
      if (delUserId) {
        var freeTier = await (supabase
          .from('subscription_tiers') as any)
          .select('id')
          .eq('name', 'free')
          .single();

        if (freeTier.data) {
          await (supabase.from('profiles') as any)
            .update({ current_tier_id: freeTier.data.id })
            .eq('id', delUserId);
        }
      }

      console.log('[StripeWebhook] Subscription cancelled: ' + deletedSub.id);
    } else if (event.type === 'invoice.payment_failed') {
      var invoice = event.data.object as any;
      var failedSubId = invoice.subscription;

      if (failedSubId) {
        await (supabase.from('user_subscriptions') as any)
          .update({ status: 'past_due' })
          .eq('payment_subscription_id', failedSubId);

        console.log('[StripeWebhook] Payment failed for subscription: ' + failedSubId);
      }
    }
  } catch (err) {
    console.error('[StripeWebhook] Error processing event ' + event.type + ':', err);
  }

  return res.status(200).json({ received: true });
}
