'use client'

// V11.17.68 - Tier 2A
//
// LabPaywallSurface — the load-bearing inline named-match paywall per
// PRICING_SUBSCRIPTION_PANEL.md §3.6 / V3 §3.7.
//
// When a Free user encounters a Basic-gated affordance (the canonical
// case: the named-match teaser on the n=1 dossier), this component
// renders inline as a soft upgrade prompt — NOT a hard wall, NOT a
// modal, NOT a popup. Documentary voice.
//
// Behavior:
//   - Logged-out: CTA routes to /pricing?ref=<surface>.
//   - Logged-in Free: CTA routes to /api/subscription/create-checkout
//     for Basic monthly (skips /pricing — the user is already committed
//     to the affordance).
//   - Dismiss is optional via `onDismiss` — when present the X renders;
//     the parent decides where to persist the dismissal (cooldown logic
//     lives in lab_promo_impressions per the V3 cadence rules).
//
// The component does not render anything for paid users — the parent
// should gate its rendering on tier; we double-check defensively here
// and bail to null.

import React, { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ArrowRight, Lock, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSubscription } from '@/lib/hooks/useSubscription'

interface LabPaywallSurfaceProps {
  /**
   * Short kicker line — e.g., "Named-match introductions" or
   * "Configurable temporal lenses". Documentary register, lowercase
   * in body per the brand voice rules.
   */
  kicker: string
  /**
   * One-sentence framing of what the user sees here at Basic depth.
   * Concrete, never marketing-y. Example: "3 of these accounts came
   * from contributors who have opted in to be discovered. Basic offers
   * an introduction when signals align."
   */
  body: string
  /**
   * Surface identifier for analytics + the /pricing referrer query
   * param. Use the panel-blessed slugs:
   *   'named_match' (the canonical one), 'temporal_lenses',
   *   'geographic_radius', 'sentiment_breakdown', 'dossier_preview'.
   */
  surface: string
  /**
   * Optional dismiss handler. When present, an X button renders in the
   * corner. The parent owns persistence of the dismissal (typically
   * via the lab_promo_impressions table with a 7-day cooldown).
   */
  onDismiss?: () => void
  /**
   * Target tier the CTA upgrades to. Defaults to 'basic' — the named-
   * match teaser canonical case. Use 'pro' when the gated affordance
   * is Pro-only (Dossier export, on-demand top-5, etc.).
   */
  upgradeTo?: 'basic' | 'pro'
}

export function LabPaywallSurface(props: LabPaywallSurfaceProps) {
  var router = useRouter()
  var { tierName, loading } = useSubscription()
  var [checkoutPending, setCheckoutPending] = useState(false)
  var upgradeTo = props.upgradeTo || 'basic'

  // V11.17.70 — Rules-of-Hooks compliance.
  // All hooks (including useCallback below) must be called unconditionally
  // on every render. Early returns are deferred to AFTER the hook section
  // so the same hook list runs every time React reconciles this component.
  var currentTier = (tierName as string | null) || ''

  var ctaLabel =
    upgradeTo === 'pro'
      ? 'Upgrade to Pro — $14.99/mo'
      : 'Upgrade to Basic — $5.99/mo'

  var ctaHandler = useCallback(async function () {
    // Logged-out: route to /pricing for the broader comparison.
    var sessionResp = await supabase.auth.getSession()
    var session = sessionResp.data.session
    if (!session) {
      router.push('/pricing?ref=' + encodeURIComponent(props.surface))
      return
    }

    // Logged-in Free: skip /pricing and head straight to Stripe.
    setCheckoutPending(true)
    try {
      var resp = await fetch('/api/subscription/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ plan: upgradeTo, interval: 'monthly' }),
      })
      var data = await resp.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      // Fallback to /pricing on error so the user still gets somewhere
      // legible.
      router.push('/pricing?ref=' + encodeURIComponent(props.surface))
    } catch (_err) {
      router.push('/pricing?ref=' + encodeURIComponent(props.surface))
    }
    setCheckoutPending(false)
  }, [router, props.surface, upgradeTo])

  // V11.17.70 — gate checks live HERE, AFTER all hook calls (Rules of Hooks).
  // Defensive: paid users at or above the gated tier should never see
  // this surface; the parent should already gate, but we double-check.
  if (loading) return null
  if (currentTier === 'pro') return null
  if (upgradeTo === 'basic' && (currentTier === 'basic' || currentTier === 'pro')) return null

  return (
    <div
      role="region"
      aria-label={props.kicker + ' — subscription affordance'}
      className="relative rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/40 to-gray-950/40 p-5 sm:p-6"
    >
      {props.onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={props.onDismiss}
          className="absolute top-3 right-3 p-1.5 rounded-full text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex items-start gap-3 sm:gap-4">
        <div className="p-2 bg-purple-500/15 rounded-lg flex-shrink-0">
          <Lock className="w-5 h-5 text-purple-300" />
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-300/90 mb-1.5">
            {props.kicker}
          </p>
          <p className="text-sm text-gray-200 leading-relaxed mb-4">
            {props.body}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={ctaHandler}
              disabled={checkoutPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-semibold rounded-full transition-colors"
            >
              {checkoutPending ? 'Opening…' : ctaLabel}
              {!checkoutPending && <ArrowRight className="w-4 h-4" />}
            </button>
            <Link
              href={'/pricing?ref=' + encodeURIComponent(props.surface)}
              className="text-xs text-purple-200 hover:text-white transition-colors"
            >
              See all tiers
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LabPaywallSurface
