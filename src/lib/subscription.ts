/**
 * Subscription Management Library
 *
 * Handles subscription tiers, feature access, and usage tracking.
 */

import { createServerClient } from './supabase'

// ============================================
// TYPES
// ============================================

export type TierName = 'free' | 'basic' | 'pro' | 'enterprise'

export interface SubscriptionTier {
  id: string
  name: TierName
  display_name: string
  description: string
  price_monthly: number
  price_yearly: number
  features: TierFeatures
  limits: TierLimits
  is_active: boolean
  sort_order: number
}

export interface TierFeatures {
  my_reports: boolean
  saved_reports: boolean
  personal_analytics: 'basic' | 'full'
  ai_insights: boolean | 'view_only' | 'priority'
  alerts: boolean | 'email' | 'all'
  data_export: boolean | 'bulk'
  api_access: boolean
  custom_reports: boolean
  team_members: boolean
  priority_support: boolean | 'dedicated'
}

export interface TierLimits {
  reports_per_month: number  // -1 = unlimited
  saved_reports_max: number  // -1 = unlimited
  api_calls_per_month: number
  team_members_max: number
}

export interface UserSubscription {
  id: string
  user_id: string
  tier_id: string
  tier: SubscriptionTier
  status: 'active' | 'cancelled' | 'expired' | 'trial' | 'past_due'
  started_at: string
  expires_at: string | null
  cancelled_at: string | null
}

export interface UsageStats {
  id: string
  user_id: string
  period_start: string
  period_end: string
  reports_submitted: number
  reports_saved: number
  api_calls_made: number
  exports_made: number
  ai_insights_viewed: number
}

export interface SubscriptionWithUsage {
  subscription: UserSubscription
  usage: UsageStats
  limits: TierLimits
  canSubmitReport: boolean
  canSaveReport: boolean
  canUseApi: boolean
}

// ============================================
// FEATURE KEYS
// ============================================

export type FeatureKey =
  | 'my_reports'
  | 'saved_reports'
  | 'personal_analytics'
  | 'ai_insights'
  | 'alerts'
  | 'data_export'
  | 'api_access'
  | 'custom_reports'
  | 'team_members'
  | 'priority_support'
  | 'analytics_dashboard'
  | 'advanced_search'
  | 'bulk_import'

// ============================================
// SERVER-SIDE FUNCTIONS
// ============================================

/**
 * Get all available subscription tiers
 */
export async function getSubscriptionTiers(): Promise<SubscriptionTier[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('subscription_tiers')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Error fetching subscription tiers:', error)
    return []
  }

  return data as SubscriptionTier[]
}

/**
 * Get a specific tier by name
 */
export async function getTierByName(name: TierName): Promise<SubscriptionTier | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('subscription_tiers')
    .select('*')
    .eq('name', name)
    .single()

  if (error) {
    console.error('Error fetching tier:', error)
    return null
  }

  return data as SubscriptionTier
}

/**
 * Get user's current subscription with tier details
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('user_subscriptions')
    .select(`
      *,
      tier:subscription_tiers(*)
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    // No subscription found, get default tier
    const defaultTier = await getDefaultTier()
    if (defaultTier) {
      return {
        id: '',
        user_id: userId,
        tier_id: defaultTier.id,
        tier: defaultTier,
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: null,
        cancelled_at: null
      }
    }
    return null
  }

  return {
    ...data,
    tier: data.tier as SubscriptionTier
  } as UserSubscription
}

/**
 * Get the default (free) tier
 */
export async function getDefaultTier(): Promise<SubscriptionTier | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('subscription_tiers')
    .select('*')
    .eq('is_default', true)
    .single()

  if (error) {
    console.error('Error fetching default tier:', error)
    return null
  }

  return data as SubscriptionTier
}

/**
 * Get user's current usage stats
 */
export async function getUserUsage(userId: string): Promise<UsageStats | null> {
  const supabase = createServerClient()

  const periodStart = new Date()
  periodStart.setDate(1)
  periodStart.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('usage_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('period_start', periodStart.toISOString().split('T')[0])
    .single()

  if (error) {
    // Create new usage record
    const periodEnd = new Date(periodStart)
    periodEnd.setMonth(periodEnd.getMonth() + 1)
    periodEnd.setDate(0)

    const { data: newUsage, error: insertError } = await supabase
      .from('usage_tracking')
      .insert({
        user_id: userId,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0]
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating usage record:', insertError)
      return null
    }

    return newUsage as UsageStats
  }

  return data as UsageStats
}

/**
 * Get subscription with usage and computed limits
 */
export async function getSubscriptionWithUsage(userId: string): Promise<SubscriptionWithUsage | null> {
  const [subscription, usage] = await Promise.all([
    getUserSubscription(userId),
    getUserUsage(userId)
  ])

  if (!subscription) return null

  const limits = subscription.tier.limits
  const currentUsage = usage || {
    reports_submitted: 0,
    reports_saved: 0,
    api_calls_made: 0
  }

  return {
    subscription,
    usage: usage!,
    limits,
    canSubmitReport: limits.reports_per_month === -1 || currentUsage.reports_submitted < limits.reports_per_month,
    canSaveReport: limits.saved_reports_max === -1 || currentUsage.reports_saved < limits.saved_reports_max,
    canUseApi: limits.api_calls_per_month === -1 || currentUsage.api_calls_made < limits.api_calls_per_month
  }
}

/**
 * Increment usage counter
 */
export async function incrementUsage(
  userId: string,
  field: 'reports_submitted' | 'reports_saved' | 'api_calls_made' | 'exports_made' | 'ai_insights_viewed',
  amount: number = 1
): Promise<boolean> {
  const supabase = createServerClient()

  // First ensure usage record exists
  const usage = await getUserUsage(userId)
  if (!usage) return false

  const { error } = await supabase
    .from('usage_tracking')
    .update({
      [field]: usage[field] + amount,
      updated_at: new Date().toISOString()
    })
    .eq('id', usage.id)

  if (error) {
    console.error('Error incrementing usage:', error)
    return false
  }

  return true
}

/**
 * Change user's subscription tier (mock implementation)
 */
export async function changeSubscription(
  userId: string,
  newTierId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient()

  try {
    // Get the new tier details
    const { data: newTier, error: tierError } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('id', newTierId)
      .single()

    if (tierError || !newTier) {
      return { success: false, error: 'Invalid tier' }
    }

    // Cancel existing subscription
    await supabase
      .from('user_subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('status', 'active')

    // Create new subscription
    const { error: subError } = await supabase
      .from('user_subscriptions')
      .insert({
        user_id: userId,
        tier_id: newTierId,
        status: 'active',
        started_at: new Date().toISOString()
      })

    if (subError) {
      return { success: false, error: 'Failed to create subscription' }
    }

    // Update profile
    await supabase
      .from('profiles')
      .update({ current_tier_id: newTierId })
      .eq('id', userId)

    // Create mock billing record (only for paid tiers)
    if (newTier.price_monthly > 0) {
      await supabase
        .from('billing_history')
        .insert({
          user_id: userId,
          amount: newTier.price_monthly,
          description: `Subscription to ${newTier.display_name} plan`,
          status: 'completed',
          payment_method: 'mock'
        })
    }

    return { success: true }
  } catch (error) {
    console.error('Error changing subscription:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

// ============================================
// FEATURE ACCESS HELPERS
// ============================================

/**
 * Check if a tier has access to a feature
 */
export function hasFeature(tier: SubscriptionTier, feature: FeatureKey): boolean {
  const value = tier.features[feature]
  return value === true || value === 'full' || value === 'priority' || value === 'all' || value === 'bulk' || value === 'dedicated'
}

/**
 * Get feature access level
 */
export function getFeatureLevel(tier: SubscriptionTier, feature: FeatureKey): string | boolean {
  return tier.features[feature]
}

/**
 * Check if user is within limit
 */
export function isWithinLimit(
  limits: TierLimits,
  usage: UsageStats,
  limitKey: keyof TierLimits
): boolean {
  const limit = limits[limitKey]
  if (limit === -1) return true // Unlimited

  const usageMap: Record<keyof TierLimits, keyof UsageStats> = {
    reports_per_month: 'reports_submitted',
    saved_reports_max: 'reports_saved',
    api_calls_per_month: 'api_calls_made',
    team_members_max: 'reports_submitted' // Not directly tracked
  }

  const usageKey = usageMap[limitKey]
  return usage[usageKey] < limit
}

/**
 * Get usage percentage for a limit
 */
export function getUsagePercentage(
  limits: TierLimits,
  usage: UsageStats,
  limitKey: keyof TierLimits
): number {
  const limit = limits[limitKey]
  if (limit === -1) return 0 // Unlimited shows 0%

  const usageMap: Record<keyof TierLimits, keyof UsageStats> = {
    reports_per_month: 'reports_submitted',
    saved_reports_max: 'reports_saved',
    api_calls_per_month: 'api_calls_made',
    team_members_max: 'reports_submitted'
  }

  const usageKey = usageMap[limitKey]
  return Math.min(100, Math.round((usage[usageKey] / limit) * 100))
}

// ============================================
// TIER COMPARISON HELPERS
// ============================================

/**
 * Get tier badge color
 */
export function getTierColor(tierName: TierName): string {
  const colors: Record<TierName, string> = {
    free: 'gray',
    basic: 'blue',
    pro: 'purple',
    enterprise: 'gold'
  }
  return colors[tierName] || 'gray'
}

/**
 * Get tier icon
 */
export function getTierIcon(tierName: TierName): string {
  const icons: Record<TierName, string> = {
    free: 'User',
    basic: 'Star',
    pro: 'Zap',
    enterprise: 'Building'
  }
  return icons[tierName] || 'User'
}

/**
 * Compare two tiers (returns positive if tier1 > tier2)
 */
export function compareTiers(tier1: TierName, tier2: TierName): number {
  const order: Record<TierName, number> = {
    free: 0,
    basic: 1,
    pro: 2,
    enterprise: 3
  }
  return order[tier1] - order[tier2]
}
