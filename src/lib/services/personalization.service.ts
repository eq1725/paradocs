/**
 * Personalization Service
 *
 * Handles user location preferences and interest-based personalization
 * for AI Insights and other personalized features.
 */

import { createServerClient } from '@/lib/supabase'
import { geocodeLocation } from './geocoding.service'
import type { PhenomenonCategory } from '@/lib/database.types'

// ============================================
// TYPES
// ============================================

export interface LocationPreferences {
  location_city: string | null
  location_state: string | null
  location_country: string
  location_latitude: number | null
  location_longitude: number | null
  watch_radius_miles: number
  share_location: boolean
}

export interface InterestPreferences {
  interested_categories: PhenomenonCategory[]
}

export interface UserPersonalization extends LocationPreferences, InterestPreferences {
  personalization_updated_at: string | null
}

export interface ActivityMetrics {
  current_count: number
  previous_count: number
  percent_change: number
  trending_direction: 'increasing' | 'decreasing' | 'stable'
}

export interface PatternMatch {
  pattern_id: string
  pattern_type: string
  title: string
  summary: string | null
  report_count: number
  significance_score: number
  center_lat: number
  center_lng: number
}

// ============================================
// GET USER PERSONALIZATION
// ============================================

/**
 * Get user's personalization settings
 */
export async function getUserPersonalization(userId: string): Promise<UserPersonalization | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      location_city,
      location_state,
      location_country,
      location_latitude,
      location_longitude,
      watch_radius_miles,
      share_location,
      interested_categories,
      personalization_updated_at
    `)
    .eq('id', userId)
    .single()

  if (error) {
    console.error('[Personalization] Error fetching user preferences:', error)
    return null
  }

  return {
    location_city: data.location_city,
    location_state: data.location_state,
    location_country: data.location_country || 'United States',
    location_latitude: data.location_latitude,
    location_longitude: data.location_longitude,
    watch_radius_miles: data.watch_radius_miles || 50,
    share_location: data.share_location || false,
    interested_categories: data.interested_categories || [],
    personalization_updated_at: data.personalization_updated_at
  }
}

// ============================================
// UPDATE USER PERSONALIZATION
// ============================================

/**
 * Update user's location preferences
 */
export async function updateLocationPreferences(
  userId: string,
  preferences: Partial<LocationPreferences>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient()

  // If city/state provided but no coordinates, try to geocode
  if (preferences.location_city && preferences.location_state &&
      !preferences.location_latitude && !preferences.location_longitude) {
    const locationQuery = `${preferences.location_city}, ${preferences.location_state}, ${preferences.location_country || 'United States'}`
    const geocoded = await geocodeLocation(locationQuery)

    if (geocoded) {
      preferences.location_latitude = geocoded.latitude
      preferences.location_longitude = geocoded.longitude
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      location_city: preferences.location_city,
      location_state: preferences.location_state,
      location_country: preferences.location_country || 'United States',
      location_latitude: preferences.location_latitude,
      location_longitude: preferences.location_longitude,
      watch_radius_miles: preferences.watch_radius_miles,
      share_location: preferences.share_location
    })
    .eq('id', userId)

  if (error) {
    console.error('[Personalization] Error updating location:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Update user's interest preferences
 */
export async function updateInterestPreferences(
  userId: string,
  preferences: InterestPreferences
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient()

  const { error } = await supabase
    .from('profiles')
    .update({
      interested_categories: preferences.interested_categories
    })
    .eq('id', userId)

  if (error) {
    console.error('[Personalization] Error updating interests:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Update all personalization settings at once
 */
export async function updatePersonalization(
  userId: string,
  data: Partial<UserPersonalization>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient()

  // If city/state provided but no coordinates, try to geocode
  if (data.location_city && data.location_state &&
      !data.location_latitude && !data.location_longitude) {
    const locationQuery = `${data.location_city}, ${data.location_state}, ${data.location_country || 'United States'}`
    const geocoded = await geocodeLocation(locationQuery)

    if (geocoded) {
      data.location_latitude = geocoded.latitude
      data.location_longitude = geocoded.longitude
    }
  }

  const updateData: Record<string, unknown> = {}

  if (data.location_city !== undefined) updateData.location_city = data.location_city
  if (data.location_state !== undefined) updateData.location_state = data.location_state
  if (data.location_country !== undefined) updateData.location_country = data.location_country
  if (data.location_latitude !== undefined) updateData.location_latitude = data.location_latitude
  if (data.location_longitude !== undefined) updateData.location_longitude = data.location_longitude
  if (data.watch_radius_miles !== undefined) updateData.watch_radius_miles = data.watch_radius_miles
  if (data.share_location !== undefined) updateData.share_location = data.share_location
  if (data.interested_categories !== undefined) updateData.interested_categories = data.interested_categories

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', userId)

  if (error) {
    console.error('[Personalization] Error updating personalization:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Clear user's location data (for privacy)
 */
export async function clearLocationData(userId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient()

  const { error } = await supabase
    .from('profiles')
    .update({
      location_city: null,
      location_state: null,
      location_latitude: null,
      location_longitude: null,
      share_location: false
    })
    .eq('id', userId)

  if (error) {
    console.error('[Personalization] Error clearing location:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ============================================
// ACTIVITY METRICS
// ============================================

/**
 * Get activity metrics for a user's location
 * Uses the RPC function from the migration
 */
export async function getActivityInRadius(
  latitude: number,
  longitude: number,
  radiusMiles: number = 50,
  currentDays: number = 30,
  previousDays: number = 30
): Promise<ActivityMetrics | null> {
  const supabase = createServerClient()

  // Convert miles to km for the RPC function
  const radiusKm = Math.round(radiusMiles * 1.60934)

  const { data, error } = await supabase
    .rpc('get_activity_in_radius', {
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_km: radiusKm,
      p_current_days: currentDays,
      p_previous_days: previousDays
    })

  if (error) {
    console.error('[Personalization] Error getting activity metrics:', error)
    return null
  }

  if (!data || data.length === 0) {
    return {
      current_count: 0,
      previous_count: 0,
      percent_change: 0,
      trending_direction: 'stable'
    }
  }

  const result = data[0]
  return {
    current_count: result.current_count || 0,
    previous_count: result.previous_count || 0,
    percent_change: result.percent_change || 0,
    trending_direction: result.trending_direction as 'increasing' | 'decreasing' | 'stable'
  }
}

/**
 * Get activity metrics for a user (convenience wrapper)
 */
export async function getUserActivityMetrics(userId: string): Promise<ActivityMetrics | null> {
  const personalization = await getUserPersonalization(userId)

  if (!personalization?.share_location ||
      !personalization?.location_latitude ||
      !personalization?.location_longitude) {
    return null
  }

  return getActivityInRadius(
    personalization.location_latitude,
    personalization.location_longitude,
    personalization.watch_radius_miles
  )
}

// ============================================
// INTEREST-BASED PATTERNS
// ============================================

/**
 * Get patterns matching user's interests
 */
export async function getPatternsByInterests(
  userId: string,
  limit: number = 10
): Promise<PatternMatch[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .rpc('get_patterns_by_interests', {
      p_user_id: userId,
      p_limit: limit
    })

  if (error) {
    console.error('[Personalization] Error getting patterns by interests:', error)
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    pattern_id: row.pattern_id as string,
    pattern_type: row.pattern_type as string,
    title: row.title as string,
    summary: row.summary as string | null,
    report_count: row.report_count as number,
    significance_score: row.significance_score as number,
    center_lat: row.center_lat as number,
    center_lng: row.center_lng as number
  }))
}

// ============================================
// PERSONALIZED INSIGHTS BUNDLE
// ============================================

export interface CategoryTrend {
  category: string
  current_count: number
  previous_count: number
  percent_change: number
  trending_direction: 'increasing' | 'decreasing' | 'stable'
}

export interface SimilarExperiencers {
  total_similar_users: number
  users_in_state: number
  shared_interests: string[]
}

export interface PersonalizedInsights {
  hasLocation: boolean
  hasInterests: boolean
  location?: {
    city: string
    state: string
    radius: number
  }
  activityMetrics?: ActivityMetrics
  interestedCategories: PhenomenonCategory[]
  matchingPatterns: PatternMatch[]
  categoryTrends?: CategoryTrend[]
  similarExperiencers?: SimilarExperiencers
}

/**
 * Get trending stats for specific categories
 */
export async function getCategoryTrends(
  categories: string[],
  days: number = 7
): Promise<CategoryTrend[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .rpc('get_category_trends', {
      p_categories: categories,
      p_days: days
    })

  if (error) {
    console.error('[Personalization] Error getting category trends:', error)
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    category: row.category as string,
    current_count: Number(row.current_count) || 0,
    previous_count: Number(row.previous_count) || 0,
    percent_change: Number(row.percent_change) || 0,
    trending_direction: row.trending_direction as 'increasing' | 'decreasing' | 'stable'
  }))
}

/**
 * Get count of users with similar interests
 */
export async function getSimilarExperiencers(
  userId: string,
  state?: string
): Promise<SimilarExperiencers | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .rpc('get_similar_experiencers', {
      p_user_id: userId,
      p_state: state || null
    })

  if (error) {
    console.error('[Personalization] Error getting similar experiencers:', error)
    return null
  }

  if (!data || data.length === 0) {
    return {
      total_similar_users: 0,
      users_in_state: 0,
      shared_interests: []
    }
  }

  const result = data[0]
  return {
    total_similar_users: Number(result.total_similar_users) || 0,
    users_in_state: Number(result.users_in_state) || 0,
    shared_interests: result.shared_interests || []
  }
}

/**
 * Get all personalized insights data for a user
 * This is the main function used by the AI Insights page
 */
export async function getPersonalizedInsights(userId: string): Promise<PersonalizedInsights> {
  const [personalization, patterns] = await Promise.all([
    getUserPersonalization(userId),
    getPatternsByInterests(userId, 5)
  ])

  const hasLocation = !!(
    personalization?.share_location &&
    personalization?.location_latitude &&
    personalization?.location_longitude &&
    personalization?.location_city
  )

  const hasInterests = !!(
    personalization?.interested_categories &&
    personalization.interested_categories.length > 0
  )

  let activityMetrics: ActivityMetrics | undefined
  let categoryTrends: CategoryTrend[] | undefined
  let similarExperiencers: SimilarExperiencers | undefined

  // Fetch location-based metrics
  if (hasLocation && personalization) {
    const metrics = await getActivityInRadius(
      personalization.location_latitude!,
      personalization.location_longitude!,
      personalization.watch_radius_miles
    )
    if (metrics) {
      activityMetrics = metrics
    }
  }

  // Fetch interest-based metrics
  if (hasInterests && personalization) {
    const [trends, similar] = await Promise.all([
      getCategoryTrends(personalization.interested_categories, 7),
      getSimilarExperiencers(userId, personalization.location_state || undefined)
    ])
    categoryTrends = trends
    similarExperiencers = similar || undefined
  }

  return {
    hasLocation,
    hasInterests,
    location: hasLocation && personalization ? {
      city: personalization.location_city!,
      state: personalization.location_state!,
      radius: personalization.watch_radius_miles
    } : undefined,
    activityMetrics,
    interestedCategories: personalization?.interested_categories || [],
    matchingPatterns: patterns,
    categoryTrends,
    similarExperiencers
  }
}
