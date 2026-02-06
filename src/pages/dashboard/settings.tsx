/**
 * Settings Dashboard Page
 *
 * User account settings and preferences.
 */

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import {
  User,
  Mail,
  Bell,
  Shield,
  Palette,
  Globe,
  Save,
  Loader2,
  AlertCircle,
  Check,
  MapPin,
  Sparkles,
  Navigation,
  X,
  Info
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import AvatarSelector, { Avatar } from '@/components/AvatarSelector'
import { supabase } from '@/lib/supabase'
import { usePersonalization } from '@/lib/hooks/usePersonalization'
import { CATEGORY_CONFIG, US_STATES } from '@/lib/constants'
import type { PhenomenonCategory } from '@/lib/database.types'

interface UserProfile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  location: string | null
  website: string | null
}

interface NotificationSettings {
  email_new_comments: boolean
  email_report_updates: boolean
  email_weekly_digest: boolean
  email_marketing: boolean
}

function SettingsSection({
  title,
  description,
  icon: Icon,
  children
}: {
  title: string
  description: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 bg-gray-800 rounded-lg">
          <Icon className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-4 cursor-pointer">
      <div className="relative mt-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-10 h-6 rounded-full transition-colors ${
            checked ? 'bg-purple-600' : 'bg-gray-700'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </div>
      </div>
      <div>
        <span className="text-white font-medium">{label}</span>
        {description && (
          <p className="text-sm text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
    </label>
  )
}

// Radius options in miles
const RADIUS_OPTIONS = [
  { value: 25, label: '25 miles' },
  { value: 50, label: '50 miles' },
  { value: 100, label: '100 miles' },
  { value: 200, label: '200 miles' }
]

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [notifications, setNotifications] = useState<NotificationSettings>({
    email_new_comments: true,
    email_report_updates: true,
    email_weekly_digest: false,
    email_marketing: false
  })

  // Personalization state
  const {
    data: personalization,
    loading: personalizationLoading,
    saving: personalizationSaving,
    updateAll: updatePersonalization,
    useCurrentLocation,
    clearLocation
  } = usePersonalization()

  const [localCity, setLocalCity] = useState('')
  const [localState, setLocalState] = useState('')
  const [localRadius, setLocalRadius] = useState(50)
  const [localShareLocation, setLocalShareLocation] = useState(false)
  const [localInterests, setLocalInterests] = useState<PhenomenonCategory[]>([])
  const [gettingLocation, setGettingLocation] = useState(false)
  const [showAvatarSelector, setShowAvatarSelector] = useState(false)

  // Sync personalization data to local state when loaded
  useEffect(() => {
    if (personalization) {
      setLocalCity(personalization.location_city || '')
      setLocalState(personalization.location_state || '')
      setLocalRadius(personalization.watch_radius_miles || 50)
      setLocalShareLocation(personalization.share_location || false)
      setLocalInterests(personalization.interested_categories || [])
    }
  }, [personalization])

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          router.push('/login')
          return
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          throw error
        }

        if (data) {
          setProfile(data)
          // Load notification settings if stored in profile
          if (data.notification_settings) {
            setNotifications(data.notification_settings)
          }
        } else {
          // Create default profile
          setProfile({
            id: session.user.id,
            username: null,
            display_name: null,
            avatar_url: null,
            bio: null,
            location: null,
            website: null
          })
        }
      } catch (err) {
        console.error('Error fetching profile:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [router])

  const handleSaveProfile = async () => {
    if (!profile) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: session.user.id,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          location: profile.location,
          website: profile.website,
          notification_settings: notifications,
          updated_at: new Date().toISOString()
        })

      if (error) throw error

      // Dispatch event to notify other components (like DashboardLayout sidebar) to refresh
      window.dispatchEvent(new CustomEvent('profile-updated'))

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving profile:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleSavePersonalization = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await updatePersonalization({
        location_city: localCity || null,
        location_state: localState || null,
        watch_radius_miles: localRadius,
        share_location: localShareLocation,
        interested_categories: localInterests
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to save personalization')
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving personalization:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleUseCurrentLocation = async () => {
    setGettingLocation(true)
    setError(null)

    try {
      const result = await useCurrentLocation()
      if (!result.success) {
        throw new Error(result.error || 'Failed to get location')
      }
      setLocalShareLocation(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get location')
    } finally {
      setGettingLocation(false)
    }
  }

  const handleClearLocation = async () => {
    await clearLocation()
    setLocalCity('')
    setLocalState('')
    setLocalShareLocation(false)
  }

  const toggleInterest = (category: PhenomenonCategory) => {
    setLocalInterests(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category)
      } else {
        return [...prev, category]
      }
    })
  }

  if (loading) {
    return (
      <DashboardLayout title="Settings">
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 bg-gray-900 rounded-xl animate-pulse" />
          ))}
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Settings">
      <div className="max-w-3xl space-y-6">
        {/* Profile Settings */}
        <SettingsSection
          title="Profile"
          description="Manage your public profile information"
          icon={User}
        >
          <div className="space-y-4">
            {/* Avatar Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Avatar
              </label>
              {showAvatarSelector ? (
                <AvatarSelector
                  currentAvatar={profile?.avatar_url}
                  onSelect={async (avatar) => {
                    // Update local state
                    setProfile(p => p ? { ...p, avatar_url: avatar } : null)
                    setShowAvatarSelector(false)

                    // Auto-save avatar to database
                    try {
                      const { data: { session } } = await supabase.auth.getSession()
                      if (session) {
                        await supabase
                          .from('profiles')
                          .upsert({
                            id: session.user.id,
                            avatar_url: avatar,
                            updated_at: new Date().toISOString()
                          })
                        // Notify sidebar to refresh
                        window.dispatchEvent(new CustomEvent('profile-updated'))
                      }
                    } catch (err) {
                      console.error('Error saving avatar:', err)
                    }
                  }}
                  onClose={() => setShowAvatarSelector(false)}
                />
              ) : (
                <div className="flex items-center gap-4">
                  <Avatar
                    avatar={profile?.avatar_url}
                    fallback={profile?.display_name || profile?.username || 'U'}
                    size="xl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAvatarSelector(true)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-white transition-colors"
                  >
                    Change Avatar
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={profile?.display_name || ''}
                onChange={(e) => setProfile(p => p ? { ...p, display_name: e.target.value } : null)}
                placeholder="Your display name"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                <input
                  type="text"
                  value={profile?.username || ''}
                  onChange={(e) => setProfile(p => p ? { ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') } : null)}
                  placeholder="username"
                  className="w-full pl-8 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Bio
              </label>
              <textarea
                value={profile?.bio || ''}
                onChange={(e) => setProfile(p => p ? { ...p, bio: e.target.value } : null)}
                placeholder="Tell us about yourself..."
                rows={3}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Location
                </label>
                <input
                  type="text"
                  value={profile?.location || ''}
                  onChange={(e) => setProfile(p => p ? { ...p, location: e.target.value } : null)}
                  placeholder="City, Country"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Website
                </label>
                <input
                  type="url"
                  value={profile?.website || ''}
                  onChange={(e) => setProfile(p => p ? { ...p, website: e.target.value } : null)}
                  placeholder="https://yoursite.com"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Notification Settings */}
        <SettingsSection
          title="Notifications"
          description="Choose what you want to be notified about"
          icon={Bell}
        >
          <div className="space-y-6">
            <Toggle
              label="New comments on my reports"
              description="Get notified when someone comments on your reports"
              checked={notifications.email_new_comments}
              onChange={(checked) => setNotifications(n => ({ ...n, email_new_comments: checked }))}
            />
            <Toggle
              label="Report status updates"
              description="Get notified when your reports are approved or rejected"
              checked={notifications.email_report_updates}
              onChange={(checked) => setNotifications(n => ({ ...n, email_report_updates: checked }))}
            />
            <Toggle
              label="Weekly digest"
              description="Receive a weekly summary of paranormal activity in your area"
              checked={notifications.email_weekly_digest}
              onChange={(checked) => setNotifications(n => ({ ...n, email_weekly_digest: checked }))}
            />
            <Toggle
              label="Marketing emails"
              description="Receive updates about new features and promotions"
              checked={notifications.email_marketing}
              onChange={(checked) => setNotifications(n => ({ ...n, email_marketing: checked }))}
            />
          </div>
        </SettingsSection>

        {/* Privacy Settings */}
        <SettingsSection
          title="Privacy"
          description="Control your privacy settings"
          icon={Shield}
        >
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">
              Your email address is never shared publicly. Only your display name and
              username are visible to other users.
            </p>
            <div className="p-4 bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-300">
                <strong>Data Export:</strong> You can request a copy of all your data
                at any time. Contact support@paradocs.com to request an export.
              </p>
            </div>
            <div className="p-4 bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-300">
                <strong>Account Deletion:</strong> If you wish to delete your account
                and all associated data, please contact support@paradocs.com.
              </p>
            </div>
          </div>
        </SettingsSection>

        {/* Location Preferences */}
        <SettingsSection
          title="Location Preferences"
          description="Share your location for personalized insights"
          icon={MapPin}
        >
          <div className="space-y-6">
            {/* Share location toggle */}
            <Toggle
              label="Share my location for personalized insights"
              description="Enable to see activity and patterns near you"
              checked={localShareLocation}
              onChange={setLocalShareLocation}
            />

            {/* Location input */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400">Set location:</span>
                <button
                  onClick={handleUseCurrentLocation}
                  disabled={gettingLocation}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
                >
                  {gettingLocation ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Navigation className="w-4 h-4" />
                  )}
                  Use current location
                </button>
                {(localCity || localState) && (
                  <button
                    onClick={handleClearLocation}
                    className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={localCity}
                    onChange={(e) => setLocalCity(e.target.value)}
                    placeholder="Enter city"
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    State
                  </label>
                  <select
                    value={localState}
                    onChange={(e) => setLocalState(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">Select state</option>
                    {US_STATES.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Watch radius */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Watch radius
              </label>
              <div className="flex gap-2">
                {RADIUS_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => setLocalRadius(option.value)}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      localRadius === option.value
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Privacy note */}
            <div className="flex items-start gap-3 p-4 bg-gray-800/50 rounded-lg">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-400">
                Your location is only used to show relevant activity in AI Insights.
                It is never shared publicly or with other users.
              </p>
            </div>

            {/* Save personalization button */}
            <button
              onClick={handleSavePersonalization}
              disabled={saving || personalizationSaving}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {(saving || personalizationSaving) ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Location Settings
                </>
              )}
            </button>
          </div>
        </SettingsSection>

        {/* Phenomenon Interests */}
        <SettingsSection
          title="Phenomenon Interests"
          description="Select categories you're interested in for personalized recommendations"
          icon={Sparkles}
        >
          <div className="space-y-6">
            {/* Category grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.entries(CATEGORY_CONFIG) as [PhenomenonCategory, typeof CATEGORY_CONFIG[PhenomenonCategory]][])
                .filter(([key]) => key !== 'combination')
                .map(([key, config]) => {
                  const isSelected = localInterests.includes(key)
                  return (
                    <button
                      key={key}
                      onClick={() => toggleInterest(key)}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                        isSelected
                          ? 'bg-purple-600/20 border-purple-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      <span className="text-xl">{config.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium block">{config.label}</span>
                        <span className="text-xs text-gray-500 truncate block">
                          {config.description.split(',')[0]}
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="w-5 h-5 text-purple-400 flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
            </div>

            {/* Selection summary */}
            <div className="text-sm text-gray-400">
              {localInterests.length === 0 ? (
                'No categories selected. Select your interests to see personalized patterns.'
              ) : (
                `${localInterests.length} ${localInterests.length === 1 ? 'category' : 'categories'} selected`
              )}
            </div>

            {/* Save interests button */}
            <button
              onClick={handleSavePersonalization}
              disabled={saving || personalizationSaving}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {(saving || personalizationSaving) ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Interest Preferences
                </>
              )}
            </button>
          </div>
        </SettingsSection>

        {/* Error/Success Messages */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-4 bg-green-900/30 border border-green-700 rounded-lg text-green-300">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span>Settings saved successfully!</span>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
