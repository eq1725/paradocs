// V11.17.68 - Tier 2A
//
// /account/subscription — logged-in management surface.
//
// Tier 2A rebuild per PRICING_SUBSCRIPTION_PANEL.md §4 Q3:
//   - State-aware hero ("You're on Free / Basic / Pro") with the most
//     relevant next action; same skeleton as the V9.5 P2.4 layout.
//   - Tier-feature labels rewritten in the V3 matrix vocabulary
//     (Named-match introductions, configurable temporal/geographic
//     depth, re-analysis cadence, Dossier, etc.). The old
//     my_reports/saved_reports/api_access labels are dropped.
//   - "Active benefits" checklist for paid users.
//   - Billing history (last 10 invoices) — pulls from
//     /api/subscription/billing-history.
//   - Cancel flow keeps the V9.5 P4.3 retention modal; bullets are now
//     tier-specific (Basic vs Pro) per the panel memo.
//   - "Compare plans" link points to /pricing for the public
//     comparison page; paid users no longer see the 3-card tier grid
//     by default (collapsed into a link instead).
//   - Post-checkout banner when ?checkout=success is set.
//
// SWC compliant: var + named function exports.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Check,
  X,
  CreditCard,
  AlertCircle,
  Loader2,
  ArrowRight,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import { useToast } from '@/components/Toast'
import AccountNav from '@/components/account/AccountNav'
import { TierBadge } from '@/components/dashboard/TierBadge'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { supabase } from '@/lib/supabase'
import type { TierName } from '@/lib/subscription'

interface BillingInvoice {
  id: string
  date: string
  amount: number
  currency: string
  status: string
  description: string
  receipt_url: string | null
}

// V3-matrix-aligned benefit text. Single source of truth for both the
// active-benefits checklist on the hero and the tier-specific bullets
// in the retention modal.
function getActiveBenefits(tier: TierName | null): string[] {
  // V11.19 — single membership: any paid tier ('basic' is the live slug;
  // 'pro'/'enterprise' kept for legacy subscribers) gets the full set.
  if (tier === 'pro' || tier === 'basic' || tier === 'enterprise') {
    return [
      'The Dossier — full 7-section cross-reference per experience, refreshed nightly',
      'Dossier PDF export with cover, footnotes, and citations',
      '1080×1350 image card + opt-in public Dossier URL',
      'Custom Watchlists — alerts when new Archive ingest matches your standing interests',
      'Named-match introductions, mutual opt-in + on-demand top-5 view',
      'Configurable geographic radius, county-level density, lunar and seasonal lenses, KML / JSON export',
      'Body-of-work synthesis, unlimited Hints, permissioned shareable Record links',
    ]
  }
  // Free
  return [
    'Unlimited submissions to the Archive',
    'Full catalogue, open to read',
    'Your Record at Free depth — 24h dial, decade band, 50-mile geography',
    'Anonymous aggregate matches (e.g., "8 nearby reports")',
    'One Hint per visit from the catalogue',
  ]
}

function formatMoney(amount: number, currency: string): string {
  var cur = (currency || 'usd').toUpperCase()
  var symbol = cur === 'USD' ? '$' : cur + ' '
  if (Number.isInteger(amount)) {
    return symbol + amount.toString()
  }
  return symbol + amount.toFixed(2)
}

function formatInvoiceDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch (_e) {
    return iso
  }
}

export default function SubscriptionPage() {
  var router = useRouter()
  var { showToast } = useToast()
  var {
    subscription,
    tierName,
    loading: subscriptionLoading,
  } = useSubscription()

  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [openingPortal, setOpeningPortal] = useState(false)
  var [showCancelModal, setShowCancelModal] = useState(false)
  var [invoices, setInvoices] = useState<BillingInvoice[]>([])
  var [invoicesLoading, setInvoicesLoading] = useState(false)
  var [showCompare, setShowCompare] = useState(false)

  // Post-checkout state surface from ?checkout=success
  var checkoutSuccess = router.query.checkout === 'success'
  var fromPricing = router.query.from === 'pricing'

  useEffect(function () {
    // Page-level loading mirrors the subscription hook. The hook is
    // load-bearing for hero state and tier resolution.
    setLoading(subscriptionLoading)
  }, [subscriptionLoading])

  // Fetch billing history (paid users only)
  var fetchInvoices = useCallback(async function () {
    if (!tierName || tierName === 'free') return
    setInvoicesLoading(true)
    try {
      var sessionResp = await supabase.auth.getSession()
      var session = sessionResp.data.session
      if (!session) {
        setInvoicesLoading(false)
        return
      }
      var resp = await fetch('/api/subscription/billing-history', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
      if (!resp.ok) {
        throw new Error('Failed to load billing history')
      }
      var data = await resp.json()
      setInvoices(Array.isArray(data.invoices) ? data.invoices : [])
    } catch (err) {
      console.error('[Subscription] billing history error:', err)
    } finally {
      setInvoicesLoading(false)
    }
  }, [tierName])

  useEffect(function () { fetchInvoices() }, [fetchInvoices])

  async function openBillingPortal() {
    setOpeningPortal(true)
    try {
      var sessionResp = await supabase.auth.getSession()
      var session = sessionResp.data.session
      if (!session) {
        showToast('error', 'You need to be signed in to manage billing.')
        setOpeningPortal(false)
        return
      }
      var resp = await fetch('/api/subscription/billing-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
      })
      var data = await resp.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      showToast('error', data.error || 'Could not open billing portal.')
    } catch (err) {
      console.error('[Subscription] portal error:', err)
      showToast('error', 'Something went wrong opening the billing portal.')
    } finally {
      setOpeningPortal(false)
    }
  }

  // Upgrade CTA — for Free + Basic users. Sends straight to Stripe
  // checkout for the next tier up; doesn't loop through /pricing.
  async function startCheckout(plan: 'basic' | 'pro', cadence: 'monthly' | 'annual') {
    try {
      var sessionResp = await supabase.auth.getSession()
      var session = sessionResp.data.session
      if (!session) {
        router.push('/pricing')
        return
      }
      var resp = await fetch('/api/subscription/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ plan: plan, interval: cadence }),
      })
      var data = await resp.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      showToast('error', data.error || 'Could not open checkout.')
    } catch (err) {
      console.error('[Subscription] checkout error:', err)
      showToast('error', 'Something went wrong opening checkout.')
    }
  }

  var isFreeTier = !tierName || tierName === 'free'
  var isPaidActive = subscription?.status === 'active' && !isFreeTier
  var renewDate = subscription?.expires_at
    ? new Date(subscription.expires_at).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  var activeBenefits = useMemo(function () {
    return getActiveBenefits(tierName)
  }, [tierName])

  if (loading) {
    return (
      <>
        <Head><title>Subscription | Paradocs</title></Head>
        <AccountNav />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 animate-pulse space-y-8">
          <div className="h-48 bg-gray-900 rounded-xl" />
          <div className="h-32 bg-gray-900 rounded-xl" />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <Head><title>Subscription | Paradocs</title></Head>
        <AccountNav />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <div className="p-8 text-center bg-gray-900 rounded-xl">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-white font-medium mb-2">Could not load subscription</p>
            <p className="text-gray-400">{error}</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head><title>Subscription | Paradocs</title></Head>
      <AccountNav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Banners */}
        {checkoutSuccess && (
          <div className="mb-6 p-4 bg-purple-950/40 border border-purple-500/30 rounded-xl">
            <p className="text-sm text-purple-100 leading-relaxed">
              <span className="font-semibold">Welcome to Membership.</span>{' '}
              Your Record is now connected to the wider Archive.{' '}
              <Link href="/lab" className="underline hover:text-white">Go to your Record →</Link>
            </p>
          </div>
        )}
        {fromPricing && !checkoutSuccess && isPaidActive && (
          <div className="mb-6 p-4 bg-gray-900 border border-gray-800 rounded-xl">
            <p className="text-sm text-gray-300">
              You're already on {subscription?.tier?.display_name || tierName}. Manage your subscription below.
            </p>
          </div>
        )}

        {/* Kicker + page heading */}
        <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 mb-1">
          Account · Billing
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Subscription</h1>
        <p className="text-sm text-gray-400 mt-1 mb-8">
          Where you are in the Archive, and what Membership opens.
        </p>

        {/* Current Plan hero */}
        <div className="p-6 sm:p-7 bg-gradient-to-br from-purple-950/40 to-gray-900 rounded-2xl border border-purple-800/30 mb-8">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-600/20 rounded-xl flex-shrink-0">
              <CreditCard className="w-7 h-7 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-semibold text-white">
                  {isFreeTier
                    ? "You're on Free"
                    : "You're on " + (subscription?.tier?.display_name || tierName)}
                </h2>
                {tierName && <TierBadge tier={tierName} size="md" />}
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                {isPaidActive && renewDate ? (
                  <>Renews on <span className="text-white font-medium">{renewDate}</span>.</>
                ) : isFreeTier ? (
                  <>The catalogue is open. Membership opens the comparative depth, the named-match layer, and the working tools — the Dossier, exports, and Watchlists.</>
                ) : (
                  <>Manage your subscription below.</>
                )}
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                {isFreeTier ? (
                  <>
                    <button
                      type="button"
                      onClick={function () { startCheckout('basic', 'annual') }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors"
                    >
                      Become a Member — from $5/mo
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <Link
                      href="/pricing"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white text-sm font-semibold rounded-full transition-colors"
                    >
                      See what's included
                    </Link>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={openBillingPortal}
                      disabled={openingPortal}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-60"
                    >
                      {openingPortal ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Opening…
                        </>
                      ) : (
                        <>Manage billing</>
                      )}
                    </button>
                    {/* V11.19 — no Basic→Pro upsell: one membership = full access. */}
                    <button
                      type="button"
                      onClick={function () { setShowCancelModal(true) }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-gray-400 hover:text-gray-200 text-sm font-medium rounded-full transition-colors"
                    >
                      Cancel subscription
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Active benefits checklist */}
        <section className="mb-10">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3">
            Active
          </p>
          <ul className="space-y-2.5">
            {activeBenefits.map(function (b, i) {
              return (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-200">
                  <Check className="w-4 h-4 text-purple-300 mt-0.5 flex-shrink-0" />
                  <span>{b}</span>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Billing history — paid users only */}
        {!isFreeTier && (
          <section className="mb-10">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3">
              Billing history
            </p>
            {invoicesLoading ? (
              <div className="text-sm text-gray-500 italic">Loading invoices…</div>
            ) : invoices.length === 0 ? (
              <div className="text-sm text-gray-500 italic">
                No invoices yet. Your first invoice will appear here after your first charge.
              </div>
            ) : (
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.03] border-b border-white/10">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-400 text-xs uppercase tracking-wider">Date</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-400 text-xs uppercase tracking-wider">Amount</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-400 text-xs uppercase tracking-wider">Status</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400 text-xs uppercase tracking-wider">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(function (inv) {
                      return (
                        <tr key={inv.id} className="border-b border-white/5 last:border-0">
                          <td className="px-4 py-2.5 text-gray-200">{formatInvoiceDate(inv.date)}</td>
                          <td className="px-4 py-2.5 text-gray-200">{formatMoney(inv.amount, inv.currency)}</td>
                          <td className="px-4 py-2.5 text-gray-400 capitalize">{inv.status}</td>
                          <td className="px-4 py-2.5 text-right">
                            {inv.receipt_url ? (
                              <a
                                href={inv.receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-purple-300 hover:text-purple-200 text-xs"
                              >
                                View <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-gray-600 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Compare plans — collapsed for paid users, expanded for free */}
        <section className="mb-10">
          {isFreeTier ? (
            <Link
              href="/pricing"
              className="flex items-center justify-between p-5 bg-white/[0.03] border border-white/10 rounded-xl hover:bg-white/[0.06] hover:border-white/20 transition-colors group"
            >
              <div>
                <p className="text-sm font-semibold text-white">See what's included →</p>
                <p className="text-xs text-gray-400 mt-1">
                  Free vs Membership — what each opens, side by side.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={function () { setShowCompare(!showCompare) }}
              className="flex items-center justify-between w-full p-4 bg-white/[0.02] border border-white/10 rounded-xl hover:bg-white/[0.04] transition-colors"
            >
              <span className="text-sm text-gray-300">
                Considering a change?{' '}
                <span className="text-gray-500">See the public comparison.</span>
              </span>
              <Link
                href="/pricing"
                className="text-xs text-purple-300 hover:text-purple-200 inline-flex items-center gap-1"
                onClick={function (e) { e.stopPropagation() }}
              >
                Open /pricing <ExternalLink className="w-3 h-3" />
              </Link>
            </button>
          )}
        </section>

        {/* FAQ — short version on this page; the longer FAQ lives on /pricing */}
        <div className="mt-10 sm:mt-12 p-6 bg-gray-900 rounded-2xl border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">
            Common questions
          </h3>
          <div className="space-y-4">
            <div>
              <h4 className="text-white font-medium mb-1">Can I upgrade or downgrade at any time?</h4>
              <p className="text-gray-400 text-sm">
                Yes. Upgrades take effect immediately; downgrades take effect at
                the end of your current billing period. Your submitted experiences
                stay in the Archive regardless of tier.
              </p>
            </div>
            <div>
              <h4 className="text-white font-medium mb-1">What happens to my data on the Free tier?</h4>
              <p className="text-gray-400 text-sm">
                Nothing is removed. The catalogue stays readable, your Record stays
                rendered at Free depth, and any named-match channels you've already
                opened remain accessible.
              </p>
            </div>
            <div>
              <h4 className="text-white font-medium mb-1">Do you offer refunds?</h4>
              <p className="text-gray-400 text-sm">
                Contact us within 14 days of your first charge and we'll handle it.
                Subsequent renewals can be cancelled to stop future billing; we
                don't pro-rate mid-cycle refunds.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cancellation retention modal — tier-specific bullets */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={function () { setShowCancelModal(false) }}
        >
          <div
            className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-7"
            onClick={function (e) { e.stopPropagation() }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-modal-title"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-amber-600/15 rounded-lg flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 id="cancel-modal-title" className="text-lg font-semibold text-white">
                  Before you cancel
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  You currently have access to:
                </p>
              </div>
            </div>

            <ul className="space-y-2.5 mb-5 ml-1">
              {activeBenefits.slice(0, 5).map(function (b, i) {
                return (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <X className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                )
              })}
            </ul>

            <p className="text-xs text-gray-500 mb-5 leading-relaxed">
              Your subscription stays active through the end of the current
              billing period
              {renewDate ? <> (until <strong className="text-gray-400">{renewDate}</strong>)</> : null}.
              Your submitted experiences stay in the Archive. You can
              resubscribe at any time.
            </p>

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
              <button
                type="button"
                onClick={function () { setShowCancelModal(false) }}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors"
              >
                Keep my plan
              </button>
              <button
                type="button"
                onClick={function () {
                  setShowCancelModal(false)
                  openBillingPortal()
                }}
                disabled={openingPortal}
                className="px-5 py-2.5 bg-transparent border border-gray-700 hover:border-red-500/50 text-gray-300 hover:text-red-300 text-sm font-medium rounded-full transition-colors disabled:opacity-60"
              >
                {openingPortal ? 'Opening…' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
