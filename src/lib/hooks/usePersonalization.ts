/**
 * usePersonalization Hook
 *
 * Client-side hook for managing user personalization settings.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
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
}

interface PersonalizationState {
  data: UserPersonalization | null
  insights: PersonalizedInsights | null
  loading: boolean
  saving: boolean
  error: string | null
}

interface UsePersonalizationReturn extends PersonalizationState {
  // Location
  hasLocation: boolean
  locationDisplay: string | null
  // Interests
  hasInterests: boolean
  // Actions
  updateLocation: (location: Partial<LocationPreferences>) => Promise<{ success: boolean; error?: string }>
  updateInterests: (categories: PhenomenonCategory[]) => Promise<{ success: boolean; error?: string }>
  updateAll: (data: Partial<UserPersonalization>) => Promise<{ success: boolean; error?: string }>
  clearLocation: () => Promise<{ success: boolean; error?: string }>
  useCurrentLocation: () => Promise<{ success: boolean; error?: string }>
  refresh: () => Promise<void>
  refreshInsights: () => Promise<void>
}

// ============================================
// HOOK
// ============================================

export function usePersonalization(): UsePersonalizationReturn {
  const [state, setState] = useState<PersonalizationState>({
    data: null,
    insights: null,
    loading: true,
    saving: false,
    error: null
  })

  // Fetch personalization settings
  const fetchPersonalization = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setState({
          data: null,
          insights: null,
          loading: false,
          saving: false,
          error: null
        })
        return
      }

      const response = await fetch('/api/user/personalization', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch personalization settings')
      }

      const data = await response.json()

      setState(prev => ({
        ...prev,
        data,
        loading: false,
        error: null
      }))
    } catch (error) {
      console.error('Error fetching personalization:', error)
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }))
    }
  }, [])

  // Fetch personalized insights
  const fetchInsights = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) return

      const response = await fetch('/api/user/personalization?insights=true', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) return

      const insights = await response.json()

      setState(prev => ({
        ...prev,
        insights
      }))
    } catch (error) {
      console.error('Error fetching insights:', error)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchPersonalization()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchPersonalization()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchPersonalization])

  // Update location preferences
  const updateLocation = useCallback(async (
    location: Partial<LocationPreferences>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setState(prev => ({ ...prev, saving: true }))

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        return { success: false, error: 'Not authenticated' }
      }

      const response = await fetch('/api/user/personalization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(location)
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error }
      }

      // Refresh data
      await fetchPersonalization()

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      setState(prev => ({ ...prev, saving: false }))
    }
  }, [fetchPersonalization])

  // Update interest preferences
  const updateInterests = useCallback(async (
    categories: PhenomenonCategory[]
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setState(prev => ({ ...prev, saving: true }))

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        return { success: false, error: 'Not authenticated' }
      }

      const response = await fetch('/api/user/personalization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ interested_categories: categories })
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error }
      }

      await fetchPersonalization()

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      setState(prev => ({ ...prev, saving: false }))
    }
  }, [fetchPersonalization])

  // Update all settings
  const updateAll = useCallback(async (
    updates: Partial<UserPersonalization>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setState(prev => ({ ...prev, saving: true }))

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        return { success: false, error: 'Not authenticated' }
      }

      const response = await fetch('/api/user/personalization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(updates)
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error }
      }

      await fetchPersonalization()

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      setState(prev => ({ ...prev, saving: false }))
    }
  }, [fetchPersonalization])

  // Clear location data
  const clearLocation = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      setState(prev => ({ ...prev, saving: true }))

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        return { success: false, error: 'Not authenticated' }
      }

      const response = await fetch('/api/user/personalization', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        return { success: false, error: data.error }
      }

      await fetchPersonalization()

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      setState(prev => ({ ...prev, saving: false }))
    }
  }, [fetchPersonalization])

  // Use browser geolocation
  const useCurrentLocation = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ success: false, error: 'Geolocation is not supported by your browser' })
        return
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords

          // Reverse geocode to get city/state
          try {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&types=place,region`
            )
            const data = await response.json()

            let city = ''
            let state = ''

            if (data.features && data.features.length > 0) {
              for (const feature of data.features) {
                if (feature.place_type.includes('place')) {
                  city = feature.text
                }
                if (feature.place_type.includes('region')) {
                  state = feature.text
                }
              }
            }

            const result = await updateLocation({
              location_latitude: latitude,
              location_longitude: longitude,
              location_city: city || null,
              location_state: state || null,
              share_location: true
            })

            resolve(result)
          } catch (error) {
            // Still save coordinates even if reverse geocoding fails
            const result = await updateLocation({
              location_latitude: latitude,
              location_longitude: longitude,
              share_location: true
            })
            resolve(result)
          }
        },
        (error) => {
          let errorMessage = 'Failed to get location'
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission denied'
              break
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information unavailable'
              break
            case error.TIMEOUT:
              errorMessage = 'Location request timed out'
              break
          }
          resolve({ success: false, error: errorMessage })
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000 // Cache for 5 minutes
        }
      )
    })
  }, [updateLocation])

  // Computed values
  const hasLocation = !!(
    state.data?.share_location &&
    state.data?.location_latitude &&
    state.data?.location_longitude
  )

  const hasInterests = !!(
    state.data?.interested_categories &&
    state.data.interested_categories.length > 0
  )

  const locationDisplay = state.data?.location_city && state.data?.location_state
    ? `${state.data.location_city}, ${state.data.location_state}`
    : null

  return {
    ...state,
    hasLocation,
    locationDisplay,
    hasInterests,
    updateLocation,
    updateInterests,
    updateAll,
    clearLocation,
    useCurrentLocation,
    refresh: fetchPersonalization,
    refreshInsights: fetchInsights
  }
}

export default usePersonalization
