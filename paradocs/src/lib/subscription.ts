/**
 * Subscription Management Library
 *
 * Handles subscription tiers, feature access, and usage tracking.
 *
 * Tier Structure:
 * - Free (Explorer): Basic browsing, 25 saved reports, 5 AI queries/month
 * - Pro (Investigator): Collections, saved searches, analytics, 50 AI queries/month
 * - Researcher: Unlimited everything, API access, collaboration, 500 AI queries/month
 */

import { createServerClient } from './supabase'

// ============================================
// TYPES
// ============================================

export type TierName = 'free' | 'pro' | 'researcher'

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
  is_default?: boolean
  sort_order: number
}

export interface TierFeatures {
  // Core features
  browse_reports: boolean
  submit_reports: boolean

  // Saved reports & collections
  saved_reports: boolean
  collections: boolean
  collection_notes: boolean
  collection_tags: boolean

  // Search & alerts
  basic_search: boolean
  advanced_filters: boolean
  saved_searches: boolean
  email_alerts: boolean

  // Analytics & visualization
  public_heatmap: boolean
  interactive_analytics: boolean
  custom_visualizations: boolean
  pattern_recognition: boolean
  report_comparison: boolean

  // AI features
  ai_insights: boolean
  ai_similar_reports: boolean
  ai_natural_language_search: boolean

  // Export & API
  export_csv: boolean
  export_pdf: boolean
  bulk_export: boolean
  api_access: boolean

  // Collaboration
  share_collections: boolean
  collaborate: boolean

  // Support
  priority_support: boolean
}

export interface TierLimits {
  saved_reports_max: number          // -1 = unlimited
  collections_max: number            // -1 = unlimited
  saved_searches_max: number         // -1 = unlimited
  ai_queries_per_month: number       // -1 = unlimited
  api_calls_per_month: number        // -1 = unlimited
  exports_per_month: number          // -1 = unlimited
  collaborators_per_collection: number // -1 = unlimited
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
  reports_saved: number
  collections_created: number
  saved_searches_created: number
  ai_queries_made: number
  api_calls_made: number
  exports_made: number
}

export interface SubscriptionWithUsage {
  subscription: UserSubscription
  usage: UsageStats
  limits: TierLimits
  canSaveReport: boolean
  canCreateCollection: boolean
  canCreateSavedSearch: boolean
  canUseAI: boolean
  canUseApi: boolean
  canExport: boolean
}

// ============================================
// DEFAULT TIER DEFINITIONS
// ============================================

export const DEFAULT_TIERS: Record<TierName, Omit<SubscriptionTier, 'id'>> = {
  free: {
    name: 'free',
    display_name: 'Explorer',
    description: 'Perfect for casual browsing and discovery',
    price_monthly: 0,
    price_yearly: 0,
    is_active: true,
    is_default: true,
    sort_order: 0,
    features: {
      browse_reports: true,
      submit_reports: true,
      saved_reports: true,
      collections: false,
      collection_notes: false,
      collection_tags: false,
      basic_search: true,
      advanced_filters: false,
      saved_searches: false,
      email_alerts: false,
      public_heatmap: true,
      interactive_analytics: false,
      custom_visualizations: false,
      pattern_recognition: false,
      report_comparison: false,
      ai_insights: true,
      ai_similar_reports: false,
      ai_natural_language_search: false,
      export_csv: false,
      export_pdf: false,
      bulk_export: false,
      api_access: false,
      share_collections: false,
      collaborate: false,
      priority_support: false
    },
    limits: {
      saved_reports_max: 25,
      collections_max: 0,
      saved_searches_max: 0,
      ai_queries_per_month: 5,
      api_calls_per_month: 0,
      exports_per_month: 0,
      collaborators_per_collection: 0
    }
  },
  pro: {
    name: 'pro',
    display_name: 'Investigator',
    description: 'For serious researchers who need powerful tools',
    price_monthly: 9,
    price_yearly: 90,
    is_active: true,
    sort_order: 1,
    features: {
      browse_reports: true,
      submit_reports: true,
      saved_reports: true,
      collections: true,
      collection_notes: true,
      collection_tags: true,
      basic_search: true,
      advanced_filters: true,
      saved_searches: true,
      email_alerts: true,
      public_heatmap: true,
      interactive_analytics: true,
      custom_visualizations: false,
      pattern_recognition: false,
      report_comparison: false,
      ai_insights: true,
      ai_similar_reports: true,
      ai_natural_language_search: false,
      export_csv: true,
      export_pdf: true,
      bulk_export: false,
      api_access: false,
      share_collections: false,
      collaborate: false,
      priority_support: false
    },
    limits: {
      saved_reports_max: -1,
      collections_max: 10,
      saved_searches_max: 5,
      ai_queries_per_month: 50,
      api_calls_per_month: 0,
      exports_per_month: 50,
      collaborators_per_collection: 0
    }
  },
  researcher: {
    name: 'researcher',
    display_name: 'Researcher',
    description: 'Full access for academic and professional research',
    price_monthly: 19,
    price_yearly: 190,
    is_active: true,
    sort_order: 2,
    features: {
      browse_reports: true,
      submit_reports: true,
      saved_reports: true,
      collections: true,
      collection_notes: true,
      collection_tags: true,
      basic_search: true,
      advanced_filters: true,
      saved_searches: true,
      email_alerts: true,
      public_heatmap: true,
      interactive_analytics: true,
      custom_visualizations: true,
      pattern_recognition: true,
      report_comparison: true,
      ai_insights: true,
      ai_similar_reports: true,
      ai_natural_language_search: true,
      export_csv: true,
      export_pdf: true,
      bulk_export: true,
      api_access: true,
      share_collections: true,
      collaborate: true,
      priority_support: true
    },
    limits: {
      saved_reports_max: -1,
      collections_max: -1,
      saved_searches_max: -1,
      ai_queries_per_month: 500,
      api_calls_per_month: 10000,
      exports_per_month: -1,
      collaborators_per_collection: 10
    }
  }
}

// ============================================
// FEATURE KEYS
// ============================================

export type FeatureKey = keyof TierFeatures

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
    // Return default tiers as fallback
    return Object.values(DEFAULT_TIERS).map((tier, index) => ({
      ...tier,
      id: tier.name
    })) as SubscriptionTier[]
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
    // Return default tier as fallback
    const defaultTier = DEFAULT_TIERS[name]
    if (defaultTier) {
      return { ...defaultTier, id: name } as SubscriptionTier
    }
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
    // Return hardcoded default
    return { ...DEFAULT_TIERS.free, id: 'free' } as SubscriptionTier
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
        period_end: periodEnd.toISOString().split('T')[0],
        reports_saved: 0,
        collections_created: 0,
        saved_searches_created: 0,
        ai_queries_made: 0,
        api_calls_made: 0,
        exports_made: 0
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating usage record:', insertError)
      // Return empty usage as fallback
      return {
        id: '',
        user_id: userId,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
        reports_saved: 0,
        collections_created: 0,
        saved_searches_created: 0,
        ai_queries_made: 0,
        api_calls_made: 0,
        exports_made: 0
      }
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
    reports_saved: 0,
    collections_created: 0,
    saved_searches_created: 0,
    ai_queries_made: 0,
    api_calls_made: 0,
    exports_made: 0
  }

  return {
    subscription,
    usage: usage!,
    limits,
    canSaveReport: limits.saved_reports_max === -1 || currentUsage.reports_saved < limits.saved_reports_max,
    canCreateCollection: limits.collections_max === -1 || currentUsage.collections_created < limits.collections_max,
    canCreateSavedSearch: limits.saved_searches_max === -1 || currentUsage.saved_searches_created < limits.saved_searches_max,
    canUseAI: limits.ai_queries_per_month === -1 || currentUsage.ai_queries_made < limits.ai_queries_per_month,
    canUseApi: limits.api_calls_per_month === -1 || currentUsage.api_calls_made < limits.api_calls_per_month,
    canExport: limits.exports_per_month === -1 || currentUsage.exports_made < limits.exports_per_month
  }
}

/**
 * Increment usage counter
 */
export async function incrementUsage(
  userId: string,
  field: keyof Omit<UsageStats, 'id' | 'user_id' | 'period_start' | 'period_end'>,
  amount: number = 1
): Promise<boolean> {
  const supabase = createServerClient()

  // First ensure usage record exists
  const usage = await getUserUsage(userId)
  if (!usage) return false

  const currentValue = usage[field] as number

  const { error } = await supabase
    .from('usage_tracking')
    .update({
      [field]: currentValue + amount,
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
 * Check if user can perform action based on limits
 */
export async function canPerformAction(
  userId: string,
  action: 'save_report' | 'create_collection' | 'create_saved_search' | 'use_ai' | 'use_api' | 'export'
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const subWithUsage = await getSubscriptionWithUsage(userId)

  if (!subWithUsage) {
    return { allowed: false, remaining: 0, limit: 0 }
  }

  const { limits, usage } = subWithUsage

  const actionMap: Record<string, { limitKey: keyof TierLimits; usageKey: keyof UsageStats }> = {
    save_report: { limitKey: 'saved_reports_max', usageKey: 'reports_saved' },
    create_collection: { limitKey: 'collections_max', usageKey: 'collections_created' },
    create_saved_search: { limitKey: 'saved_searches_max', usageKey: 'saved_searches_created' },
    use_ai: { limitKey: 'ai_queries_per_month', usageKey: 'ai_queries_made' },
    use_api: { limitKey: 'api_calls_per_month', usageKey: 'api_calls_made' },
    export: { limitKey: 'exports_per_month', usageKey: 'exports_made' }
  }

  const { limitKey, usageKey } = actionMap[action]
  const limit = limits[limitKey]
  const used = usage[usageKey] as number

  if (limit === -1) {
    return { allowed: true, remaining: -1, limit: -1 }
  }

  const remaining = Math.max(0, limit - used)
  return { allowed: remaining > 0, remaining, limit }
}

/**
 * Change user's subscription tier
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
  return tier.features[feature] === true
}

/**
 * Get all features for a tier
 */
export function getTierFeatures(tier: SubscriptionTier): FeatureKey[] {
  return (Object.keys(tier.features) as FeatureKey[]).filter(key => tier.features[key])
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
    saved_reports_max: 'reports_saved',
    collections_max: 'collections_created',
    saved_searches_max: 'saved_searches_created',
    ai_queries_per_month: 'ai_queries_made',
    api_calls_per_month: 'api_calls_made',
    exports_per_month: 'exports_made',
    collaborators_per_collection: 'collections_created' // Not directly tracked
  }

  const usageKey = usageMap[limitKey]
  return (usage[usageKey] as number) < limit
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
    saved_reports_max: 'reports_saved',
    collections_max: 'collections_created',
    saved_searches_max: 'saved_searches_created',
    ai_queries_per_month: 'ai_queries_made',
    api_calls_per_month: 'api_calls_made',
    exports_per_month: 'exports_made',
    collaborators_per_collection: 'collections_created'
  }

  const usageKey = usageMap[limitKey]
  return Math.min(100, Math.round(((usage[usageKey] as number) / limit) * 100))
}

/**
 * Get remaining usage for a limit
 */
export function getRemainingUsage(
  limits: TierLimits,
  usage: UsageStats,
  limitKey: keyof TierLimits
): number | 'unlimited' {
  const limit = limits[limitKey]
  if (limit === -1) return 'unlimited'

  const usageMap: Record<keyof TierLimits, keyof UsageStats> = {
    saved_reports_max: 'reports_saved',
    collections_max: 'collections_created',
    saved_searches_max: 'saved_searches_created',
    ai_queries_per_month: 'ai_queries_made',
    api_calls_per_month: 'api_calls_made',
    exports_per_month: 'exports_made',
    collaborators_per_collection: 'collections_created'
  }

  const usageKey = usageMap[limitKey]
  return Math.max(0, limit - (usage[usageKey] as number))
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
    pro: 'purple',
    researcher: 'gold'
  }
  return colors[tierName] || 'gray'
}

/**
 * Get tier icon name
 */
export function getTierIcon(tierName: TierName): string {
  const icons: Record<TierName, string> = {
    free: 'Compass',
    pro: 'Search',
    researcher: 'Microscope'
  }
  return icons[tierName] || 'User'
}

/**
 * Compare two tiers (returns positive if tier1 > tier2)
 */
export function compareTiers(tier1: TierName, tier2: TierName): number {
  const order: Record<TierName, number> = {
    free: 0,
    pro: 1,
    researcher: 2
  }
  return order[tier1] - order[tier2]
}

/**
 * Get upgrade path for a tier
 */
export function getUpgradePath(currentTier: TierName): TierName | null {
  const upgrades: Record<TierName, TierName | null> = {
    free: 'pro',
    pro: 'researcher',
    researcher: null
  }
  return upgrades[currentTier]
}

/**
 * Format limit for display
 */
export function formatLimit(value: number): string {
  if (value === -1) return 'Unlimited'
  if (value === 0) return 'Not available'
  return value.toLocaleString()
}
