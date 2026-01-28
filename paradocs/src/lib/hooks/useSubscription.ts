/**
 * useSubscription Hook
 *
 * Client-side hook for accessing subscription data and feature gating.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  SubscriptionTier,
  UserSubscription,
  UsageStats,
  TierLimits,
  FeatureKey,
  TierName
} from '@/lib/subscription'

interface SubscriptionState {
  subscription: UserSubscription | null
  usage: UsageStats | null
  limits: TierLimits | null
  loading: boolean
  error: string | null
}

interface UseSubscriptionReturn extends SubscriptionState {
  // Feature checks
  canAccess: (feature: FeatureKey) => boolean
  getFeatureLevel: (feature: FeatureKey) => string | boolean
  // Limit checks
  canSubmitReport: boolean
  canSaveReport: boolean
  canUseApi: boolean
  isWithinLimit: (limitKey: keyof TierLimits) => boolean
  getUsagePercentage: (limitKey: keyof TierLimits) => number
  // Tier info
  tierName: TierName | null
  tierDisplayName: string | null
  isPaidTier: boolean
  // Actions
  refresh: () => Promise<void>
  changeTier: (tierId: string) => Promise<{ success: boolean; error?: string }>
}

export function useSubscription(): UseSubscriptionReturn {
  const [state, setState] = useState<SubscriptionState>({
    subscription: null,
    usage: null,
    limits: null,
    loading: true,
    error: null
  })

  const fetchSubscription = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setState({
          subscription: null,
          usage: null,
          limits: null,
          loading: false,
          error: null
        })
        return
      }

      const response = await fetch('/api/user/subscription', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch subscription')
      }

      const data = await response.json()

      setState({
        subscription: data.subscription,
        usage: data.usage,
        limits: data.limits,
        loading: false,
        error: null
      })
    } catch (error) {
      console.error('Error fetching subscription:', error)
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }))
    }
  }, [])

  useEffect(() => {
    fetchSubscription()

    // Listen for auth changes
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(() => {
      fetchSubscription()
    })

    return () => {
      authSub.unsubscribe()
    }
  }, [fetchSubscription])

  // Feature access check
  const canAccess = useCallback((feature: FeatureKey): boolean => {
    if (!state.subscription?.tier) return false
    const value = state.subscription.tier.features[feature]
    return value === true ||
      value === 'full' ||
      value === 'priority' ||
      value === 'all' ||
      value === 'bulk' ||
      value === 'dedicated' ||
      value === 'email'
  }, [state.subscription])

  // Get feature level
  const getFeatureLevel = useCallback((feature: FeatureKey): string | boolean => {
    if (!state.subscription?.tier) return false
    return state.subscription.tier.features[feature]
  }, [state.subscription])

  // Limit checks
  const isWithinLimit = useCallback((limitKey: keyof TierLimits): boolean => {
    if (!state.limits || !state.usage) return false
    const limit = state.limits[limitKey]
    if (limit === -1) return true // Unlimited

    const usageMap: Record<keyof TierLimits, keyof UsageStats> = {
      reports_per_month: 'reports_submitted',
      saved_reports_max: 'reports_saved',
      api_calls_per_month: 'api_calls_made',
      team_members_max: 'reports_submitted'
    }

    const usageKey = usageMap[limitKey]
    return (state.usage[usageKey] as number) < limit
  }, [state.limits, state.usage])

  // Usage percentage
  const getUsagePercentage = useCallback((limitKey: keyof TierLimits): number => {
    if (!state.limits || !state.usage) return 0
    const limit = state.limits[limitKey]
    if (limit === -1) return 0 // Unlimited shows 0%

    const usageMap: Record<keyof TierLimits, keyof UsageStats> = {
      reports_per_month: 'reports_submitted',
      saved_reports_max: 'reports_saved',
      api_calls_per_month: 'api_calls_made',
      team_members_max: 'reports_submitted'
    }

    const usageKey = usageMap[limitKey]
    return Math.min(100, Math.round(((state.usage[usageKey] as number) / limit) * 100))
  }, [state.limits, state.usage])

  // Change tier
  const changeTier = useCallback(async (tierId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        return { success: false, error: 'Not authenticated' }
      }

      const response = await fetch('/api/user/subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ tier_id: tierId })
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error }
      }

      // Refresh subscription data
      await fetchSubscription()

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, [fetchSubscription])

  // Computed values
  const tierName = state.subscription?.tier?.name as TierName | null
  const tierDisplayName = state.subscription?.tier?.display_name || null
  const isPaidTier = tierName ? ['basic', 'pro', 'enterprise'].includes(tierName) : false

  return {
    ...state,
    canAccess,
    getFeatureLevel,
    canSubmitReport: isWithinLimit('reports_per_month'),
    canSaveReport: isWithinLimit('saved_reports_max'),
    canUseApi: isWithinLimit('api_calls_per_month'),
    isWithinLimit,
    getUsagePercentage,
    tierName,
    tierDisplayName,
    isPaidTier,
    refresh: fetchSubscription,
    changeTier
  }
}

export default useSubscription
