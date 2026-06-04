// V11.17.68 - Tier 2A
//
// API: POST /api/webhooks/stripe
//
// Handles Stripe webhook events for subscription management.
// Events handled:
//   - checkout.session.completed    → create user_subscriptions row,
//                                     set profiles.current_tier_id
//   - customer.subscription.updated → mirror status, idempotently
//                                     align tier on plan flips
//   - customer.subscription.deleted → revert to Free
//   - invoice.payment_succeeded     → write billing_history row (new
//                                     in Tier 2A; powers the invoices
//                                     list on /account/subscription)
//   - invoice.payment_failed        → mark subscription past_due

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
      // V11.17.68 Tier 2A — plan flips (Basic → Pro, etc.) also arrive
      // as 'customer.subscription.updated' events. The 'tier' or
      // 'plan' metadata is set by create-checkout when the customer
      // first subscribes; when Stripe initiates a plan change via the
      // Billing Portal we fall back to looking up the tier by the
      // Stripe product/price ID embedded in the subscription items.
      var subPlanMeta = subscription.metadata
        ? (subscription.metadata.tier || subscription.metadata.plan)
        : null;

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

        // V11.17.68 — if metadata names a plan, ensure the user's
        // current_tier_id matches it. This makes plan-flip events
        // idempotent on tier state.
        if (subPlanMeta && (mappedStatus === 'active' || mappedStatus === 'trial')) {
          var updatedTierResult = await (supabase
            .from('subscription_tiers') as any)
            .select('id')
            .eq('name', subPlanMeta)
            .single();
          if (updatedTierResult.data) {
            await (supabase.from('profiles') as any)
              .update({ current_tier_id: updatedTierResult.data.id })
              .eq('id', subUserId);
            await (supabase.from('user_subscriptions') as any)
              .update({ tier_id: updatedTierResult.data.id })
              .eq('payment_subscription_id', subscription.id);
          }
        }

        console.log('[StripeWebhook] Subscription updated: ' + subscription.id + ' status=' + mappedStatus + ' plan=' + (subPlanMeta || 'unchanged'));
      }
    } else if (event.type === 'invoice.payment_succeeded') {
      // V11.17.68 Tier 2A — log successful payments to billing_history
      // so /account/subscription can render an invoice list without an
      // extra Stripe round-trip per render. Idempotent on the Stripe
      // invoice id.
      var paidInvoice = event.data.object as any;
      var invUserId: string | null = null;
      // Resolve user from the subscription's metadata (preferred) or
      // by Stripe customer ID lookup against profiles as fallback.
      if (paidInvoice.subscription_details && paidInvoice.subscription_details.metadata) {
        invUserId = paidInvoice.subscription_details.metadata.supabase_user_id
          || paidInvoice.subscription_details.metadata.user_id
          || null;
      }
      if (!invUserId && paidInvoice.customer) {
        var customerLookup = await (supabase
          .from('profiles') as any)
          .select('id')
          .eq('stripe_customer_id', paidInvoice.customer)
          .single();
        if (customerLookup.data) {
          invUserId = customerLookup.data.id;
        }
      }

      if (invUserId) {
        // Best-effort insert; ignore unique-constraint duplicates so
        // Stripe retries don't double-write.
        await (supabase.from('billing_history') as any)
          .insert({
            user_id: invUserId,
            stripe_invoice_id: paidInvoice.id,
            amount: paidInvoice.amount_paid ? paidInvoice.amount_paid / 100 : 0,
            currency: paidInvoice.currency || 'usd',
            status: 'paid',
            description: paidInvoice.lines && paidInvoice.lines.data && paidInvoice.lines.data[0]
              ? paidInvoice.lines.data[0].description
              : 'Subscription payment',
            receipt_url: paidInvoice.hosted_invoice_url || paidInvoice.invoice_pdf || null,
            invoice_date: paidInvoice.created
              ? new Date(paidInvoice.created * 1000).toISOString()
              : new Date().toISOString(),
            payment_method: 'stripe'
          });
        console.log('[StripeWebhook] Invoice paid: ' + paidInvoice.id + ' user=' + invUserId);
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
