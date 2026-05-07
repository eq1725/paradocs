/**
 * Subscription Management Page
 *
 * Shows current subscription details and allows tier changes.
 */

import React, { useEffect, useState } from 'react'
import { useToast } from '@/components/Toast'
import { useRouter } from 'next/router'
import {
  User,
  Star,
  Zap,
  Building,
  Check,
  X,
  CreditCard,
  Calendar,
  AlertCircle,
  Loader2,
  ArrowRight
} from 'lucide-react'
// V9.6 T1.1 — /account/* uses default Layout + AccountNav, not DashboardLayout.
import Head from 'next/head'
import AccountNav from '@/components/account/AccountNav'
import { TierBadge } from '@/components/dashboard/TierBadge'
import { UsageMeter } from '@/components/dashboard/UsageMeter'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { supabase } from '@/lib/supabase'
import type { TierName } from '@/lib/subscription'

interface SubscriptionTier {
  id: string
  name: TierName
  display_name: string
  description: string
  price_monthly: number
  price_yearly: number
  features: Record<string, boolean | string>
  limits: {
    reports_per_month: number
    saved_reports_max: number
    api_calls_per_month: number
    team_members_max: number
  }
  is_active: boolean
  sort_order: number
}

const tierIcons: Record<TierName, React.ElementType> = {
  free: User,
  basic: Star,
  pro: Zap,
  enterprise: Building
}

const tierColors: Record<TierName, {
  bg: string
  border: string
  highlight: string
  button: string
}> = {
  free: {
    bg: 'bg-gray-900',
    border: 'border-gray-700',
    highlight: 'bg-gray-800',
    button: 'bg-gray-700 hover:bg-gray-600'
  },
  basic: {
    bg: 'bg-blue-950/30',
    border: 'border-blue-800/50',
    highlight: 'bg-blue-900/30',
    button: 'bg-blue-600 hover:bg-blue-500'
  },
  pro: {
    bg: 'bg-purple-950/30',
    border: 'border-purple-800/50',
    highlight: 'bg-purple-900/30',
    button: 'bg-purple-600 hover:bg-purple-500'
  },
  enterprise: {
    bg: 'bg-amber-950/30',
    border: 'border-amber-800/50',
    highlight: 'bg-amber-900/30',
    button: 'bg-amber-600 hover:bg-amber-500'
  }
}

const featureLabels: Record<string, string> = {
  my_reports: 'Submit Reports',
  saved_reports: 'Save Reports',
  ai_insights: 'AI Insights',
  data_export: 'Data Export',
  api_access: 'API Access',
  alerts: 'Alert System',
  advanced_search: 'Advanced Search',
  custom_reports: 'Custom Reports',
  team_members: 'Team Collaboration',
  priority_support: 'Priority Support',
  analytics_dashboard: 'Analytics Dashboard',
  bulk_import: 'Bulk Import'
}

function FeatureValue({ value }: { value: boolean | string }) {
  if (value === false) {
    return <X className="w-5 h-5 text-gray-600" />
  }
  if (value === true) {
    return <Check className="w-5 h-5 text-green-400" />
  }
  // String values like "view_only", "email", "full", etc.
  return (
    <span className="text-sm text-gray-300 capitalize">
      {value.replace(/_/g, ' ')}
    </span>
  )
}

function LimitValue({ value }: { value: number }) {
  if (value === -1) {
    return <span className="text-green-400">Unlimited</span>
  }
  return <span className="text-gray-300">{value.toLocaleString()}</span>
}

function TierCard({
  tier,
  isCurrentTier,
  onSelect,
  loading
}: {
  tier: SubscriptionTier
  isCurrentTier: boolean
  onSelect: (tierId: string) => void
  loading: boolean
}) {
  const Icon = tierIcons[tier.name]
  const colors = tierColors[tier.name]
  const isPopular = tier.name === 'pro'

  return (
    <div
      className={`
        relative rounded-xl border-2 p-6 transition-all
        ${isCurrentTier ? 'ring-2 ring-purple-500' : ''}
        ${colors.bg} ${colors.border}
        ${isPopular ? 'scale-105 z-10' : ''}
      `}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-purple-600 text-white text-sm font-medium rounded-full">
          Most Popular
        </div>
      )}

      {isCurrentTier && (
        <div className="absolute -top-3 right-4 px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-full">
          Current Plan
        </div>
      )}

      <div className="text-center mb-6">
        <div className={`inline-flex p-3 rounded-xl ${colors.highlight} mb-4`}>
          <Icon className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-xl font-bold text-white">{tier.display_name}</h3>
        <p className="text-gray-400 text-sm mt-1">{tier.description}</p>
      </div>

      <div className="text-center mb-6">
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-4xl font-bold text-white">
            ${tier.price_monthly}
          </span>
          <span className="text-gray-400">/month</span>
        </div>
        {tier.price_yearly > 0 && (
          <p className="text-sm text-gray-500 mt-1">
            or ${tier.price_yearly}/year (save {Math.round((1 - tier.price_yearly / (tier.price_monthly * 12)) * 100)}%)
          </p>
        )}
      </div>

      {/* Limits */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Reports/month</span>
          <LimitValue value={tier.limits.reports_per_month} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Saved reports</span>
          <LimitValue value={tier.limits.saved_reports_max} />
        </div>
        {tier.limits.api_calls_per_month > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">API calls/month</span>
            <LimitValue value={tier.limits.api_calls_per_month} />
          </div>
        )}
        {tier.limits.team_members_max > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Team members</span>
            <LimitValue value={tier.limits.team_members_max} />
          </div>
        )}
      </div>

      {/* Key Features */}
      <div className="space-y-2 mb-6 pt-4 border-t border-gray-700/50">
        {Object.entries(tier.features)
          .filter(([_, value]) => value !== false)
          .slice(0, 6)
          .map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-gray-300">{featureLabels[key] || key}</span>
              {typeof value === 'string' && value !== 'true' && (
                <span className="text-xs text-gray-500 ml-auto capitalize">
                  ({value.replace(/_/g, ' ')})
                </span>
              )}
            </div>
          ))}
      </div>

      <button
        onClick={() => onSelect(tier.id)}
        disabled={isCurrentTier || loading}
        className={`
          w-full py-3 px-4 rounded-lg font-medium text-white transition-colors
          flex items-center justify-center gap-2
          ${isCurrentTier
            ? 'bg-gray-700 cursor-not-allowed'
            : colors.button
          }
          disabled:opacity-50
        `}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isCurrentTier ? (
          'Current Plan'
        ) : tier.price_monthly === 0 ? (
          'Downgrade'
        ) : (
          <>
            Upgrade
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  )
}

export default function SubscriptionPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const {
    subscription,
    usage,
    limits,
    tierName,
    loading: subscriptionLoading,
    refresh,
    changeTier
  } = useSubscription()

  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [loading, setLoading] = useState(true)
  const [changingTier, setChangingTier] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // V9.5 P4.2 + P4.3 — manage billing portal redirect + retention modal
  const [openingPortal, setOpeningPortal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)

  useEffect(() => {
    const fetchTiers = async () => {
      try {
        const response = await fetch('/api/subscription/tiers')
        if (!response.ok) throw new Error('Failed to fetch tiers')
        const data = await response.json()
        setTiers(data.tiers)
      } catch (err) {
        console.error('Error fetching tiers:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchTiers()
  }, [])

  const handleTierChange = async (tierId: string) => {
    const tier = tiers.find(t => t.id === tierId)
    if (!tier) return

    // For paid tiers, redirect to Stripe checkout
    if (tier.price_monthly > 0) {
      setChangingTier(tierId)
      try {
        const resp = await fetch('/api/subscription/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: tier.name, interval: 'monthly' })
        })
        const data = await resp.json()
        if (data.url) {
          window.location.href = data.url
          return
        } else {
          showToast('error', data.error || 'Failed to create checkout session')
        }
      } catch (err) {
        showToast('error', 'Something went wrong. Please try again.')
      }
      setChangingTier(null)
      return
    }

    // For free tier (downgrade), use direct tier change
    const confirmMessage = `Are you sure you want to downgrade to ${tier.display_name}? Some features may be lost.`
    if (!confirm(confirmMessage)) return

    setChangingTier(tierId)
    const result = await changeTier(tierId)
    setChangingTier(null)

    if (!result.success) {
      showToast('error', result.error || 'Failed to change subscription')
    } else {
      await refresh()
    }
  }

  // V9.5 P4.2 — open the Stripe Billing Portal. Server (api/subscription/
  // billing-portal) creates a session and returns a URL we redirect to.
  // Used for managing payment methods, viewing invoices, and (when paid
  // through the cancellation flow) cancelling.
  const openBillingPortal = async () => {
    setOpeningPortal(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        showToast('error', 'You need to be signed in to manage billing.')
        setOpeningPortal(false)
        return
      }
      const resp = await fetch('/api/subscription/billing-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
      })
      const data = await resp.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      showToast('error', data.error || 'Failed to open billing portal.')
    } catch (err) {
      console.error('[Subscription] portal error:', err)
      showToast('error', 'Something went wrong opening the billing portal.')
    } finally {
      setOpeningPortal(false)
    }
  }

  if (loading || subscriptionLoading) {
    return (
      <>
        <Head><title>Subscription | Paradocs</title></Head>
        <AccountNav />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 animate-pulse space-y-8">
          <div className="h-48 bg-gray-900 rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-80 bg-gray-900 rounded-xl" />
            ))}
          </div>
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
            <p className="text-white font-medium mb-2">Error Loading Subscription</p>
            <p className="text-gray-400">{error}</p>
          </div>
        </div>
      </>
    )
  }

  // V9.5 P2.4 — derive a single primary CTA + tagline based on the
  // user's current subscription state. Replaces the old 4-tier grid as
  // the visual anchor of this page; tier comparison is moved below.
  var isFreeTier = !tierName || tierName === 'free'
  var isPaidActive = subscription?.status === 'active' && !isFreeTier
  var renewDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <>
      <Head><title>Subscription | Paradocs</title></Head>
      <AccountNav />
      {/* V9.5 P2.2 — kicker header. Mirrors the masthead pattern used
          on Profile so the account surface feels unified. */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* V9.6 Tier 3 — eyebrow contrast bumped from gray-500 → gray-400 for AA */}
        <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 mb-1">Account · Billing</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Subscription</h1>
        <p className="text-sm text-gray-400 mt-1 mb-8">
          Manage your plan, usage, and billing.
        </p>

        {/* V9.5 P2.4 — Current Plan hero. Single source of truth for
            "what state am I in" + a single primary CTA. The 4-tier grid
            below stays as the comparison reference. */}
        <div className="p-6 sm:p-7 bg-gradient-to-br from-purple-950/40 to-gray-900 rounded-2xl border border-purple-800/30 mb-8">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-600/20 rounded-xl flex-shrink-0">
              <CreditCard className="w-7 h-7 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-semibold text-white">
                  {isFreeTier ? 'You’re on Free' : 'You’re on ' + (subscription?.tier?.display_name || tierName)}
                </h2>
                {tierName && <TierBadge tier={tierName} size="md" />}
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                {isPaidActive && renewDate ? (
                  <>Your subscription renews on <span className="text-white font-medium">{renewDate}</span>.</>
                ) : isFreeTier ? (
                  <>Upgrade for more saves, AI insights, and priority support.</>
                ) : (
                  <>Manage your subscription below.</>
                )}
              </p>

              {/* V9.6 Tier 3 — Free hero benefit chips. Three icon-led
                  chips above the See plans CTA convert better than a
                  single sentence per the panel reference data. */}
              {isFreeTier && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg">
                    <Star className="w-4 h-4 text-amber-300 flex-shrink-0" />
                    <span className="text-xs text-gray-200">Unlimited saves</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg">
                    <Zap className="w-4 h-4 text-purple-300 flex-shrink-0" />
                    <span className="text-xs text-gray-200">AI insights</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg">
                    <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                    <span className="text-xs text-gray-200">Priority support</span>
                  </div>
                </div>
              )}

              {/* Primary CTA based on state */}
              <div className="mt-4 flex flex-wrap gap-3">
                {isFreeTier ? (
                  <a
                    href="#available-plans"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors"
                  >
                    See plans
                    <ArrowRight className="w-4 h-4" />
                  </a>
                ) : (
                  <>
                    {/* V9.5 P4.2 — primary 'Manage billing' opens the
                        Stripe customer portal where users can update
                        payment methods, view invoices, and cancel. */}
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
                    <a
                      href="#available-plans"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white text-sm font-semibold rounded-full transition-colors"
                    >
                      Change plan
                    </a>
                    {/* V9.5 P4.3 — cancellation enters retention modal,
                        not a direct portal redirect. After confirming,
                        the modal opens the same Stripe portal where
                        Stripe handles the actual cancel action. */}
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-gray-400 hover:text-gray-200 text-sm font-medium rounded-full transition-colors"
                    >
                      Cancel subscription
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Usage meters — tightened from 3-column to a single readable row */}
          {usage && limits && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 pt-6 border-t border-purple-800/30">
              <UsageMeter
                label="Reports submitted"
                current={usage.reports_submitted}
                limit={limits.reports_per_month}
                size="sm"
              />
              <UsageMeter
                label="Saved reports"
                current={usage.reports_saved}
                limit={limits.saved_reports_max}
                size="sm"
              />
              {limits.api_calls_per_month > 0 && (
                <UsageMeter
                  label="API calls"
                  current={usage.api_calls_made}
                  limit={limits.api_calls_per_month}
                  size="sm"
                />
              )}
            </div>
          )}
        </div>

        {/* Plan Selection — V9.5 P2.4 made responsive max 2-col so cards
            stop squeezing on tablets. Anchor for in-page CTA jumps. */}
        <h3 id="available-plans" className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3">Compare plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {tiers
            // V9.6 T1.2 — Enterprise is admin-only; never show to users.
            .filter(t => t.is_active && t.name !== 'enterprise')
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(tier => (
              <TierCard
                key={tier.id}
                tier={tier}
                isCurrentTier={tier.name === tierName}
                onSelect={handleTierChange}
                loading={changingTier === tier.id}
              />
            ))}
        </div>

        {/* FAQ / Info */}
        <div className="mt-10 sm:mt-12 p-6 bg-gray-900 rounded-2xl border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">
            Frequently Asked Questions
          </h3>
          <div className="space-y-4">
            <div>
              <h4 className="text-white font-medium mb-1">Can I upgrade or downgrade at any time?</h4>
              <p className="text-gray-400 text-sm">
                Yes. You can change your plan at any time. Upgrades take effect immediately,
                and downgrades take effect at the end of your current billing period.
              </p>
            </div>
            <div>
              <h4 className="text-white font-medium mb-1">What happens to my data if I downgrade?</h4>
              <p className="text-gray-400 text-sm">
                Your data is never deleted. However, if you exceed the limits of your new plan,
                you won&apos;t be able to create new reports or save more reports until you&apos;re within limits.
              </p>
            </div>
            <div>
              <h4 className="text-white font-medium mb-1">Do you offer refunds?</h4>
              <p className="text-gray-400 text-sm">
                We offer a 14-day money-back guarantee on all paid plans. Contact support for assistance.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* V9.5 P4.3 — cancellation retention modal. Shows the user
          what they'll lose, then offers a single 'Continue to cancel'
          path that opens the Stripe billing portal where Stripe
          handles the actual cancel. The retention copy is generic
          rather than tier-specific so we don't have to reason about
          which features apply to which tier — we just hit the headline
          benefits everyone gets on a paid plan. */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowCancelModal(false)}
        >
          <div
            className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-7"
            onClick={(e) => e.stopPropagation()}
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
                  Here&apos;s what you&apos;ll lose access to:
                </p>
              </div>
            </div>

            <ul className="space-y-2.5 mb-6 ml-1">
              <li className="flex items-start gap-2 text-sm text-gray-300">
                <X className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                <span>Unlimited saves and Constellation entries</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-300">
                <X className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                <span>AI insights and pattern detection on your saves</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-300">
                <X className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                <span>Priority support and bulk import tools</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-300">
                <X className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                <span>Your existing data stays — limits just kick in again</span>
              </li>
            </ul>

            <p className="text-xs text-gray-500 mb-5 leading-relaxed">
              Your subscription stays active through the end of the current billing period
              {renewDate ? <> (until <strong className="text-gray-400">{renewDate}</strong>)</> : null}.
              You can resubscribe at any time.
            </p>

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors"
              >
                Keep my plan
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false)
                  openBillingPortal()
                }}
                disabled={openingPortal}
                className="px-5 py-2.5 bg-transparent border border-gray-700 hover:border-red-500/50 text-gray-300 hover:text-red-300 text-sm font-medium rounded-full transition-colors disabled:opacity-60"
              >
                {openingPortal ? 'Opening…' : 'Continue to cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
