// V11.17.68 - Tier 2A
//
// API: GET /api/subscription/billing-history
//
// Returns the last 10 invoices for the authenticated user, suitable
// for /account/subscription's billing history section. Primary source
// is the local `billing_history` table (populated by the
// invoice.payment_succeeded webhook); if the table is empty or
// errors, the endpoint falls back to listing invoices directly from
// Stripe for resilience.
//
// Response shape: { invoices: [{ id, date, amount, currency, status,
//   description, receipt_url }] }
//
// SWC compliant: var + function expressions + string concat.

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

interface InvoiceLine {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  receipt_url: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var supabase = createServerClient();

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

    // First try local billing_history (populated by the
    // invoice.payment_succeeded webhook).
    var localResult = await (supabase
      .from('billing_history') as any)
      .select('*')
      .eq('user_id', user.id)
      .order('invoice_date', { ascending: false })
      .limit(10);

    var invoices: InvoiceLine[] = [];
    if (localResult && localResult.data && localResult.data.length > 0) {
      invoices = (localResult.data as any[]).map(function (row: any): InvoiceLine {
        return {
          id: row.stripe_invoice_id || row.id,
          date: row.invoice_date || row.created_at || new Date().toISOString(),
          amount: typeof row.amount === 'number' ? row.amount : 0,
          currency: row.currency || 'usd',
          status: row.status || 'paid',
          description: row.description || 'Subscription payment',
          receipt_url: row.receipt_url || null
        };
      });
      return res.status(200).json({ invoices: invoices, source: 'local' });
    }

    // Fallback: query Stripe directly. Useful when the local table
    // is freshly migrated and the webhook hasn't backfilled yet.
    var profileResp = await (supabase
      .from('profiles') as any)
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();
    var customerId = profileResp.data ? profileResp.data.stripe_customer_id : null;
    if (!customerId) {
      return res.status(200).json({ invoices: [], source: 'empty' });
    }

    var Stripe;
    try {
      Stripe = (await import('stripe')).default;
    } catch (_e) {
      return res.status(200).json({ invoices: [], source: 'stripe_unavailable' });
    }
    var stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2023-10-16' as any
    });

    var stripeInvoices = await stripe.invoices.list({
      customer: customerId,
      limit: 10
    });

    invoices = stripeInvoices.data.map(function (inv: any): InvoiceLine {
      return {
        id: inv.id,
        date: new Date(inv.created * 1000).toISOString(),
        amount: inv.amount_paid ? inv.amount_paid / 100 : 0,
        currency: inv.currency || 'usd',
        status: inv.status || 'paid',
        description: inv.lines && inv.lines.data && inv.lines.data[0]
          ? inv.lines.data[0].description
          : 'Subscription payment',
        receipt_url: inv.hosted_invoice_url || inv.invoice_pdf || null
      };
    });
    return res.status(200).json({ invoices: invoices, source: 'stripe' });
  } catch (err) {
    console.error('[BillingHistory] Error:', err);
    return res.status(500).json({ error: 'Failed to load billing history' });
  }
}
