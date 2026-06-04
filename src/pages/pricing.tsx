'use client'

// V11.17.68 - Tier 2A
//
// /pricing — standalone marketing-style pricing page per
// PRICING_SUBSCRIPTION_PANEL.md §4 and PRO_TIER_VALIDATION_V3 §7.
//
// Voice: documentary, museum-membership. Never SaaS-pitch.
//
// Auth-state behavior:
//   - logged-out: hero CTA → /start (signup). Tier-card CTAs route to
//     /start with intent param so post-signup we know what they wanted.
//   - logged-in free: hero CTA → "Start with Basic" (Stripe checkout).
//     Tier-card CTAs route to Stripe checkout directly.
//   - logged-in paid: server-side redirect to /account/subscription
//     with ?from=pricing so that surface can banner the user.
//
// SWC compliant: var + named function exports per repo convention.

import React, { useEffect, useState } from 'react'
import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { useSubscription } from '@/lib/hooks/useSubscription'
import PricingHero from '@/components/pricing/PricingHero'
import PricingTierTable, { Cadence } from '@/components/pricing/PricingTierTable'
import PricingFAQ from '@/components/pricing/PricingFAQ'
import PricingFooter from '@/components/pricing/PricingFooter'

interface PricingPageProps {
  // Reserved for future SSR-injected props (e.g., A/B variant).
}

export default function PricingPage(_props: PricingPageProps) {
  var router = useRouter()
  var { showToast } = useToast()
  var { tierName, loading: subLoading } = useSubscription()
  var [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  // Banner if user just cancelled checkout
  var [cancelledBanner, setCancelledBanner] = useState(false)
  useEffect(function () {
    if (router.query.checkout === 'cancelled') {
      setCancelledBanner(true)
    }
  }, [router.query.checkout])

  // Defensive client-side redirect for logged-in paid users in case the
  // SSR redirect doesn't fire (e.g., direct nav after a tier flip).
  useEffect(function () {
    if (!subLoading && tierName && (tierName === 'basic' || tierName === 'pro')) {
      router.replace('/account/subscription?from=pricing')
    }
  }, [tierName, subLoading, router])

  var currentTier: 'free' | 'basic' | 'pro' | null =
    tierName === 'free' || tierName === 'basic' || tierName === 'pro'
      ? tierName
      : null

  async function handleTierSelect(
    tier: 'free' | 'basic' | 'pro',
    cadence: Cadence
  ) {
    // Free tier → push the visitor into the catalogue. Logged-out
    // funnels through /start (signup); logged-in already-Free lands on
    // their Record.
    if (tier === 'free') {
      var { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/lab')
      } else {
        router.push('/start?intent=free')
      }
      return
    }

    // Paid tiers → if logged-out, route to signup with intent so the
    // post-signup flow can resume the checkout. If logged-in, kick
    // straight to Stripe Checkout.
    var sessionResp = await supabase.auth.getSession()
    var session = sessionResp.data.session
    if (!session) {
      router.push('/start?intent=' + tier + '&cadence=' + cadence)
      return
    }

    setCheckoutLoading(tier + '_' + cadence)
    try {
      var resp = await fetch('/api/subscription/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ plan: tier, interval: cadence }),
      })
      var data = await resp.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      showToast('error', data.error || 'Could not open checkout. Please try again.')
    } catch (err) {
      console.error('[Pricing] checkout error:', err)
      showToast('error', 'Could not open checkout. Please try again.')
    }
    setCheckoutLoading(null)
  }

  // Primary hero CTA — adapts to auth state.
  var heroCta: React.ReactNode
  if (subLoading) {
    heroCta = (
      <span className="inline-flex items-center px-6 py-3 rounded-full bg-white/10 text-white text-sm font-semibold">
        Loading…
      </span>
    )
  } else if (tierName === 'free') {
    heroCta = (
      <button
        type="button"
        onClick={function () { handleTierSelect('basic', 'monthly') }}
        className="inline-flex items-center px-6 py-3 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-purple-900/30"
      >
        Start with Basic — $5.99/mo
      </button>
    )
  } else {
    // Logged-out (or unknown) — push into signup
    heroCta = (
      <Link
        href="/start"
        className="inline-flex items-center px-6 py-3 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-purple-900/30"
      >
        Get started free
      </Link>
    )
  }

  return (
    <>
      <Head>
        <title>Pricing | Paradocs</title>
        <meta
          name="description"
          content="A documentary catalogue of over 200,000 paranormal and anomalous experiences. Free to read. Free to submit. Subscriptions open the comparative depth."
        />
      </Head>

      <main className="min-h-screen bg-gray-950 text-white">
        {cancelledBanner && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 text-center text-sm text-amber-200">
            Checkout cancelled. You can pick up where you left off below — no
            charge was made.
          </div>
        )}

        <PricingHero primaryCta={heroCta} />

        <PricingTierTable
          onTierSelect={handleTierSelect}
          currentTier={currentTier}
        />

        {checkoutLoading && (
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-x-0 bottom-6 z-50 flex justify-center pointer-events-none"
          >
            <div className="px-4 py-2 bg-gray-900/90 border border-white/10 rounded-full text-sm text-gray-200 backdrop-blur">
              Opening Stripe checkout…
            </div>
          </div>
        )}

        <PricingFAQ />

        <PricingFooter />
      </main>
    </>
  )
}

// Server-side redirect for logged-in paid users — they don't need to
// see the marketing surface and we'd rather they land on their
// management page. Logged-out users and Free users render the page.
//
// We intentionally use Supabase via the SSR auth helpers if available;
// if the session can't be resolved server-side (e.g., cookie not set),
// the client-side useEffect above handles the redirect as a fallback.
export var getServerSideProps: GetServerSideProps = async function (ctx) {
  try {
    // Lazy-import the SSR auth helper so this page still ships if the
    // helper isn't present in the deployment.
    var helper: any
    try {
      helper = await import('@supabase/auth-helpers-nextjs')
    } catch (_e) {
      return { props: {} }
    }

    if (!helper || !helper.createPagesServerClient) {
      return { props: {} }
    }

    var serverClient = helper.createPagesServerClient(ctx)
    var sessionResp = await serverClient.auth.getSession()
    var user = sessionResp.data.session ? sessionResp.data.session.user : null

    if (!user) {
      return { props: {} }
    }

    // Look up the current tier from profiles → subscription_tiers
    var profileResp = await serverClient
      .from('profiles')
      .select('current_tier_id, subscription_tiers:current_tier_id(name)')
      .eq('id', user.id)
      .single()

    var tierName: string | null = null
    if (profileResp.data && (profileResp.data as any).subscription_tiers) {
      tierName = (profileResp.data as any).subscription_tiers.name || null
    }

    if (tierName === 'basic' || tierName === 'pro') {
      return {
        redirect: {
          destination: '/account/subscription?from=pricing',
          permanent: false,
        },
      }
    }

    return { props: {} }
  } catch (err) {
    // If anything fails server-side, just render the public page.
    return { props: {} }
  }
}
