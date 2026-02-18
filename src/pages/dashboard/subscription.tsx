/**
 * Subscription Management Page
 *
 * Shows current subscription details and allows tier changes.
 */

import React, { useEffect, useState } from 'react'
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
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
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
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          alert('Please sign in to upgrade your plan.')
          setChangingTier(null)
          return
        }
        const resp = await fetch('/api/subscription/create-checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token
          },
          body: JSON.stringify({ plan: tier.name, interval: 'monthly' })
        })
        const data = await resp.json()
        if (data.url) {
          window.location.href = data.url
          return
        } else {
          alert(data.error || 'Failed to create checkout session')
        }
      } catch (err) {
        alert('Something went wrong. Please try again.')
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
      alert(result.error || 'Failed to change subscription')
    } else {
      await refresh()
    }
  }

  if (loading || subscriptionLoading) {
    return (
      <DashboardLayout title="Subscription">
        <div className="animate-pulse space-y-8">
          <div className="h-48 bg-gray-900 rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-96 bg-gray-900 rounded-xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout title="Subscription">
        <div className="p-8 text-center bg-gray-900 rounded-xl">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white font-medium mb-2">Error Loading Subscription</p>
          <p className="text-gray-400">{error}</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Subscription">
      {/* Current Plan Overview */}
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-purple-600/20 rounded-xl">
              <CreditCard className="w-8 h-8 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold text-white">
                  Current Plan
                </h2>
                {tierName && <TierBadge tier={tierName} size="md" />}
              </div>
              <p className="text-gray-400">
                {subscription?.status === 'active' ? (
                  <>
                    Your subscription is active
                    {subscription?.current_period_end && (
                      <> · Renews {new Date(subscription.current_period_end).toLocaleDateString()}</>
                    )}
                  </>
                ) : (
                  'Manage your subscription below'
                )}
              </p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex flex-wrap gap-6">
            {usage && limits && (
              <>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">
                    {usage.reports_submitted}
                    <span className="text-sm text-gray-500">
                      /{limits.reports_per_month === -1 ? '∞' : limits.reports_per_month}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">Reports this month</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">
                    {usage.reports_saved}
                    <span className="text-sm text-gray-500">
                      /{limits.saved_reports_max === -1 ? '∞' : limits.saved_reports_max}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">Saved reports</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Usage meters */}
        {usage && limits && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-800">
            <UsageMeter
              label="Reports Submitted"
              current={usage.reports_submitted}
              limit={limits.reports_per_month}
              size="sm"
            />
            <UsageMeter
              label="Saved Reports"
              current={usage.reports_saved}
              limit={limits.saved_reports_max}
              size="sm"
            />
            {limits.api_calls_per_month > 0 && (
              <UsageMeter
                label="API Calls"
                current={usage.api_calls_made}
                limit={limits.api_calls_per_month}
                size="sm"
              />
            )}
          </div>
        )}
      </div>

      {/* Plan Selection */}
      <h3 className="text-lg font-semibold text-white mb-6">Available Plans</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {tiers
          .filter(t => t.is_active)
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
      <div className="mt-12 p-6 bg-gray-900 rounded-xl border border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-4">
          Frequently Asked Questions
        </h3>
        <div className="space-y-4">
          <div>
            <h4 className="text-white font-medium mb-1">Can I upgrade or downgrade at any time?</h4>
            <p className="text-gray-400 text-sm">
              Yes! You can change your plan at any time. Upgrades take effect immediately,
              and downgrades take effect at the end of your current billing period.
            </p>
          </div>
          <div>
            <h4 className="text-white font-medium mb-1">What happens to my data if I downgrade?</h4>
            <p className="text-gray-400 text-sm">
              Your data is never deleted. However, if you exceed the limits of your new plan,
              you won't be able to create new reports or save more reports until you're within limits.
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
    </DashboardLayout>
  )
}
