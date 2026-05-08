/**
 * Settings Dashboard Page
 *
 * User account settings and preferences.
 */

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import {
  User,
  Mail,
  Bell,
  Shield,
  Palette,
  Save,
  Loader2,
  AlertCircle,
  Check,
  MapPin,
  Sparkles,
  Navigation,
  X,
  Info,
  CreditCard,
  ArrowRight
} from 'lucide-react'
// V9.6 T1.1 — /account/* now uses the default global Layout
// (provided by _app.tsx) instead of DashboardLayout. AccountNav is
// the secondary nav strip that replaces the legacy sidebar.
import Head from 'next/head'
import AccountNav from '@/components/account/AccountNav'
import AvatarSelector, { Avatar } from '@/components/AvatarSelector'
import { supabase } from '@/lib/supabase'
import { usePersonalization } from '@/lib/hooks/usePersonalization'
import { CATEGORY_CONFIG, COUNTRIES, getRegionsForCountry } from '@/lib/constants'
import CategoryIcon from '@/components/ui/CategoryIcon'
import NotificationToggle from '@/components/NotificationToggle'
import type { PhenomenonCategory } from '@/lib/database.types'

interface UserProfile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  // V9.9 P1 — website kept in interface as deprecated field. Form
  // input + save payload no longer touch it. Existing values stay
  // in the DB but are no longer surfaced to the user.
  website?: string | null
  // V9.5 P1.3 — controls visibility of /researcher/[username]
  // public profile and Constellation map. NULL == FALSE in DB.
  constellation_public?: boolean | null
}

interface NotificationSettings {
  email_new_comments: boolean
  email_report_updates: boolean
  email_weekly_digest: boolean
  email_marketing: boolean
  smart_alerts: boolean
}

/**
 * V9.6 Tier 2 — relative-time pill for the 'Saved Xm ago' indicator.
 * Re-renders every 30 seconds so the label stays accurate without
 * being chatty. Intl.RelativeTimeFormat is widely supported and gives
 * us localised output for free.
 */
function RelativeTime({ date }: { date: Date }) {
  // V9.6 Tier 2 — destructured-ignore on the value half: we only
  // need the setter to bump state every 30s so React re-renders and
  // recomputes diff against Date.now(). The actual elapsed time
  // comes from `date`, not the tick value, so we never read it.
  var [, setTick] = useState(0)
  useEffect(() => {
    var t = setInterval(() => setTick((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])
  var diffMs = Date.now() - date.getTime()
  var diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return <>just now</>
  var diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return <>{diffMin}m ago</>
  var diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return <>{diffHr}h ago</>
  return <>{date.toLocaleDateString()}</>
}

/**
 * V9.6 Tier 2 — small contextual chip for the researcher status strip.
 * Renders 'value · label' on a muted ground. Designed to read as page
 * context, not as a primary stat block (Profile owns that).
 */
function StatusChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-900/60 border border-gray-800">
      <span className="text-xs font-semibold text-white">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
    </div>
  )
}

function SettingsSection({
  id,
  title,
  description,
  icon: Icon,
  children
}: {
  id?: string
  title: string
  description: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div
      id={id}
      // V9.6.3 — scroll-margin-top sized for the full sticky chrome
      // stack: global Layout header (h-14 mobile / h-16 desktop) +
      // AccountNav container (~80-90px after V9.6.2 stacked the
      // anchor pills under the tab strip). Total ~9rem mobile, 10rem
      // desktop. The +0.5rem of breathing room on each side is so
      // the section heading sits below the sticky bar instead of
      // flush against it. Without this, clicking an anchor pill (e.g.
      // 'Privacy') scrolled the section title under the sticky bar
      // and left it cut off.
      className="p-4 sm:p-6 bg-gray-900 rounded-xl border border-gray-800 scroll-mt-[9.5rem] md:scroll-mt-[10.5rem]"
    >
      <div className="flex items-start gap-3 sm:gap-4 mb-5 sm:mb-6">
        <div className="p-2.5 sm:p-3 bg-gray-800 rounded-lg">
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
        </div>
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-white">{title}</h3>
          <p className="text-xs sm:text-sm text-gray-400">{description}</p>
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
    <label className="flex items-start gap-3 sm:gap-4 cursor-pointer py-1">
      <div className="relative mt-0.5 sm:mt-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-11 h-7 sm:w-10 sm:h-6 rounded-full transition-colors ${
            checked ? 'bg-purple-600' : 'bg-gray-700'
          }`}
        >
          <div
            className={`w-5 h-5 sm:w-4 sm:h-4 rounded-full bg-white absolute top-1 transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </div>
      </div>
      <div>
        <span className="text-white text-sm sm:text-base font-medium">{label}</span>
        {description && (
          <p className="text-xs sm:text-sm text-gray-400 mt-0.5">{description}</p>
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
    email_marketing: false,
    smart_alerts: true
  })

  // V9.5 P2.3 — track an as-saved snapshot so the sticky bottom bar
  // can show 'Unsaved changes' state. We compare via JSON.stringify on
  // each render — cheap given the small object shape and avoids
  // hand-wiring per-field dirty flags.
  const [savedSnapshot, setSavedSnapshot] = useState<string>('')

  // V9.6 Tier 2 — active anchor section for the sticky in-page nav.
  // Updated by IntersectionObserver below so screen readers and the
  // visible pill state both know which section is in view.
  const [activeAnchor, setActiveAnchor] = useState<string>('profile')

  // V9.6 Tier 2 — track when the profile last saved so the sticky bar
  // can show 'Saved Xm ago' instead of being silent in the idle state.
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // V9.6 Tier 2 — researcher status strip data. Pulled from
  // /api/user/stats (same endpoint Profile uses). Lazy-loaded.
  const [statusStrip, setStatusStrip] = useState<{
    saved: number; reports: number; streak: number; joinedYear: string | number;
  }>({ saved: 0, reports: 0, streak: 0, joinedYear: '' })

  // V9.9 P2 — username availability state. Debounced check on input
  // change. 'idle' until first user input; 'checking' during fetch;
  // resolves to one of available/taken/invalid/self.
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'self'
  >('idle')
  const [usernameReason, setUsernameReason] = useState<string>('')

  // Personalization state
  const {
    data: personalization,
    loading: personalizationLoading,
    saving: personalizationSaving,
    updateAll: updatePersonalization,
    getCurrentLocation,
    clearLocation
  } = usePersonalization()

  const [localCity, setLocalCity] = useState('')
  const [localState, setLocalState] = useState('')
  const [localCountry, setLocalCountry] = useState('United States')
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
      setLocalCountry(personalization.location_country || 'United States')
      setLocalRadius(personalization.watch_radius_miles || 50)
      setLocalShareLocation(personalization.share_location || false)
      setLocalInterests(personalization.interested_categories || [])
    }
  }, [personalization])

  const regionInfo = getRegionsForCountry(localCountry)

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
          // V9.5 P2.3 — capture the as-saved snapshot for the sticky
          // bottom save bar's dirty-state detection.
          setSavedSnapshot(JSON.stringify({
            profile: data,
            notifications: data.notification_settings ?? {
              email_new_comments: true,
              email_report_updates: true,
              email_weekly_digest: false,
              email_marketing: false,
              smart_alerts: true,
            },
          }))
        } else {
          // Create default profile
          const defaultProfile = {
            id: session.user.id,
            username: null,
            display_name: null,
            avatar_url: null,
            bio: null,
            website: null,
            // V9.5 P1.3 — new users default to public so they're
            // discoverable in the researcher graph. They can flip
            // it off in Privacy below at any time.
            constellation_public: true,
          }
          setProfile(defaultProfile)
          setSavedSnapshot(JSON.stringify({
            profile: defaultProfile,
            notifications: {
              email_new_comments: true,
              email_report_updates: true,
              email_weekly_digest: false,
              email_marketing: false,
              smart_alerts: true,
            },
          }))
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

  // V9.9 P2 — debounced username availability check. Fires 500ms
  // after the input settles. Skips empty / unchanged values to
  // avoid noisy network calls.
  useEffect(() => {
    var u = (profile?.username || '').trim()
    if (!u) { setUsernameStatus('idle'); setUsernameReason(''); return }
    setUsernameStatus('checking')
    var t = setTimeout(async () => {
      try {
        var { data: { session } } = await supabase.auth.getSession()
        var headers: any = {}
        if (session) headers.Authorization = 'Bearer ' + session.access_token
        var resp = await fetch('/api/user/username-check?u=' + encodeURIComponent(u), { headers })
        var data = await resp.json()
        if (!data?.ok) { setUsernameStatus('idle'); setUsernameReason(''); return }
        setUsernameStatus(data.status)
        setUsernameReason(data.reason || '')
      } catch {
        setUsernameStatus('idle')
      }
    }, 500)
    return () => clearTimeout(t)
  }, [profile?.username])

  // V9.6 Tier 2 — load researcher status data for the strip below the
  // kicker. Uses /api/user/stats (same endpoint Profile uses). Failure
  // is silent — strip just shows zeros, which is correct for new
  // accounts.
  useEffect(() => {
    var cancelled = false
    async function load() {
      try {
        var { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        var resp = await fetch('/api/user/stats', {
          headers: { Authorization: 'Bearer ' + session.access_token },
        })
        if (!resp.ok) return
        var data = await resp.json()
        if (cancelled) return
        var memberSince = data.profile && data.profile.member_since
        var joinedYear: string | number = ''
        if (memberSince) {
          var d = new Date(memberSince)
          if (!isNaN(d.getTime())) joinedYear = d.getUTCFullYear()
        }
        setStatusStrip({
          saved: (data.saved && data.saved.total) || 0,
          reports: (data.reports && data.reports.total) || 0,
          streak: (data.streak && data.streak.current) || 0,
          joinedYear: joinedYear,
        })
      } catch { /* silent */ }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleSaveProfile = async () => {
    if (!profile) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // V9.9 P3 — route through /api/user/profile-update so the bio
      // gets moderated server-side via Claude Haiku. Endpoint also
      // surfaces clean errors for username collisions (409) and bio
      // rejections (422 with friendly message).
      const resp = await fetch('/api/user/profile-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          notification_settings: notifications,
          constellation_public: profile.constellation_public ?? false,
        }),
      })
      const result = await resp.json()
      if (!resp.ok || !result.ok) {
        throw new Error(result.error || 'Failed to save')
      }
      // V9.9 P3 — surface the queue notice when the bio went to
      // pending review. The save still succeeded, but the user
      // should know an admin will look at it.
      if (result.decision === 'pending') {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 5000)
      }

      // Dispatch event to notify other components (like DashboardLayout sidebar) to refresh
      window.dispatchEvent(new CustomEvent('profile-updated'))

      // V9.5 P2.3 — refresh the saved snapshot so the sticky bar
      // returns to the 'all saved' state after a successful save.
      setSavedSnapshot(JSON.stringify({ profile, notifications }))
      // V9.6 Tier 2 — record the save timestamp for the 'Saved Xm ago'
      // indicator on the sticky bar idle state.
      setSavedAt(new Date())

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving profile:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // V9.5 P2.3 — derive dirty state from the snapshot. Recomputed on
  // every render via JSON.stringify of the small object shape.
  const isDirty = savedSnapshot !== '' && savedSnapshot !== JSON.stringify({ profile, notifications })

  // V9.6 Tier 2 — IntersectionObserver tracks which section is in view
  // and sets activeAnchor + aria-current='location' on the matching
  // anchor pill. Threshold of 0.4 means a section "becomes active"
  // when 40% of it is visible — picks up faster than 0.5 but doesn't
  // flicker between adjacent short sections.
  useEffect(() => {
    if (loading) return
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return
    var SECTION_IDS = ['profile', 'notifications', 'privacy', 'data', 'location', 'interests']
    var observer = new IntersectionObserver(
      (entries) => {
        // Pick the most-visible section among those currently intersecting.
        var visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible.length > 0 && visible[0].target instanceof HTMLElement) {
          var id = (visible[0].target as HTMLElement).id
          if (id) setActiveAnchor(id)
        }
      },
      {
        // ~25% top margin so the activation point is roughly the upper
        // third of the viewport (matches where the eye lands after a
        // pill click + scroll-mt-20 offset).
        rootMargin: '-25% 0px -55% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    )
    SECTION_IDS.forEach((id) => {
      var el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => { observer.disconnect() }
  }, [loading])

  const handleSavePersonalization = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await updatePersonalization({
        location_city: localCity || null,
        location_state: localState || null,
        location_country: localCountry,
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
      const result = await getCurrentLocation()
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
    setLocalCountry('United States')
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
      <>
        <Head><title>Settings | Paradocs</title></Head>
        <AccountNav />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 bg-gray-900 rounded-xl animate-pulse" />
          ))}
        </div>
      </>
    )
  }

  // V9.6.2 — anchor pills live inside the AccountNav sticky container
  // as children, so the two nav rows stack with no gap. Defining the
  // markup as a variable keeps the render tree readable below.
  var anchorPillsRow = (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {[
          { id: 'profile', label: 'Profile' },
          { id: 'notifications', label: 'Notifications' },
          { id: 'privacy', label: 'Privacy' },
          { id: 'data', label: 'Your Data' },
          { id: 'location', label: 'Location' },
          { id: 'interests', label: 'Interests' },
        ].map((item) => {
          // V9.6 Tier 2 — active state is driven by the
          // IntersectionObserver above; aria-current='location' is
          // for screen readers; the visual chip styling is for sighted
          // users.
          var active = activeAnchor === item.id
          return (
            <a
              key={item.id}
              href={'#' + item.id}
              aria-current={active ? 'location' : undefined}
              className={
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ' +
                (active
                  ? 'text-white bg-purple-600/25 border border-purple-500/60'
                  : 'text-gray-300 bg-gray-900/80 border border-gray-800 hover:border-purple-500/40 hover:text-white')
              }
            >
              {item.label}
            </a>
          )
        })}
      </div>
    </div>
  )

  return (
    <>
      <Head><title>Settings | Paradocs</title></Head>
      <AccountNav>{anchorPillsRow}</AccountNav>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 space-y-6 pb-24 md:pb-28">
        {/* V9.5 P2.2 — kicker masthead. Mirrors the Profile/Subscription
            pattern so the account surface feels unified. */}
        <div>
          {/* V9.6 Tier 3 — bumped eyebrow contrast from text-gray-500
              to text-gray-400 to clear AA at small sizes. */}
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 mb-1">Account · Settings</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
          <p className="text-sm text-gray-400 mt-1">
            Profile, notifications, privacy, and personalization.
          </p>
        </div>

        {/* V9.6 Tier 2 — researcher status strip. Reframes the page as
            'this is YOUR account' rather than 'this is system config.'
            Same data shape as the Profile stats box; presented as a
            chip row here for context, not as the page's primary content. */}
        <div className="flex flex-wrap items-center gap-2 -mt-3">
          <StatusChip label="Saved" value={statusStrip.saved} />
          <StatusChip label="Reports" value={statusStrip.reports} />
          <StatusChip label="Streak" value={statusStrip.streak === 0 ? '—' : statusStrip.streak + 'd'} />
          <StatusChip label="Joined" value={statusStrip.joinedYear || '—'} />
        </div>

        {/* Profile Settings */}
        <SettingsSection
          id="profile"
          title="Profile"
          description="Manage your public profile information"
          icon={User}
        >
          <div className="space-y-4">
            {/* Avatar Selection — V9.6 Tier 2: removed redundant <label>
                since the new layout puts the 'Avatar' label inline with
                the tap-target. */}
            <div>
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
                /* V9.6 Tier 2 — avatar IS the affordance now. Tap-on-
                    avatar with a camera icon overlay on hover/focus.
                    Replaces the separate 'Change Avatar' text button.
                    Keeps a small "Change" link below for keyboard / a11y
                    discoverability. */
                <div className="flex items-center gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => setShowAvatarSelector(true)}
                    aria-label="Change avatar"
                    // V9.7 P1 — button takes its size from the Avatar
                    // inside (size='xl' = w-16 h-16 mobile / w-20 h-20
                    // desktop). Hover overlay + mobile edit dot
                    // position relative to the button.
                    className="group relative inline-flex rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                  >
                    <Avatar
                      avatar={profile?.avatar_url}
                      fallback={profile?.display_name || profile?.username || 'U'}
                      size="xl"
                    />
                    {/* Hover/focus overlay — semi-transparent dark with
                        a centered camera glyph. Always visible on mobile
                        (touch can't hover) via the responsive class. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 group-focus:opacity-100 sm:opacity-0 transition-opacity flex items-center justify-center"
                    >
                      <Palette className="w-6 h-6 text-white" />
                    </span>
                    {/* Mobile-only persistent edit dot in lower-right */}
                    <span
                      aria-hidden="true"
                      className="sm:hidden absolute bottom-0 right-0 w-7 h-7 rounded-full bg-purple-600 border-2 border-gray-900 flex items-center justify-center"
                    >
                      <Palette className="w-3.5 h-3.5 text-white" />
                    </span>
                  </button>
                  <div className="flex flex-col items-start">
                    <p className="text-sm font-medium text-white">Avatar</p>
                    <button
                      type="button"
                      onClick={() => setShowAvatarSelector(true)}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      Change avatar
                    </button>
                  </div>
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
                  className={
                    'w-full pl-8 pr-10 py-2 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none transition-colors ' +
                    (usernameStatus === 'taken' || usernameStatus === 'invalid'
                      ? 'border-red-500/60 focus:border-red-500'
                      : usernameStatus === 'available'
                        ? 'border-emerald-500/60 focus:border-emerald-500'
                        : 'border-gray-700 focus:border-purple-500')
                  }
                />
                {/* V9.9 P2 — inline availability indicator. */}
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                  {usernameStatus === 'checking' && (
                    <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                  )}
                  {usernameStatus === 'available' && (
                    <span className="text-emerald-400" aria-label="Username available">✓</span>
                  )}
                  {usernameStatus === 'self' && (
                    <span className="text-gray-500 text-[10px]" aria-label="Your current username">current</span>
                  )}
                  {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                    <span className="text-red-400" aria-label="Username unavailable">✗</span>
                  )}
                </span>
              </div>
              {(usernameStatus === 'taken' || usernameStatus === 'invalid') && usernameReason && (
                <p className="text-xs text-red-300 mt-1.5">{usernameReason}</p>
              )}
              {usernameStatus === 'available' && (
                <p className="text-xs text-emerald-300 mt-1.5">Available — yours to claim.</p>
              )}
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

            {/* V9.9 P1 — Website field removed per panel review.
                Was being collected but never displayed publicly
                anywhere (broken contract with users + moderation
                liability we weren't enforcing). DB column kept
                intact for safety; will re-add when we have an
                established researcher base + budget to moderate
                URLs properly (link-shortener + domain blocklist
                + nofollow). */}
          </div>
        </SettingsSection>

        {/* Notification Settings */}
        <SettingsSection
          id="notifications"
          title="Notifications"
          description="Choose what you want to be notified about"
          icon={Bell}
        >
          {/* V9.4.8 — Web Push (Today's Lead) toggle. Sits at the top
              of the notifications section since it's the most-engaging
              notification we offer. Self-hides on browsers without
              push support. */}
          <div className="mb-6">
            <NotificationToggle mode="full" />
          </div>
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
              label="Smart match alerts"
              description="Get notified when new reports match your interests and location (max 3/week)"
              checked={notifications.smart_alerts}
              onChange={(checked) => setNotifications(n => ({ ...n, smart_alerts: checked }))}
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
          id="privacy"
          title="Privacy"
          description="Control your privacy settings"
          icon={Shield}
        >
          <div className="space-y-5">
            {/* V9.5 P1.3 — Public profile visibility toggle. Backed by
                profiles.constellation_public. New users default to TRUE
                so they're discoverable; existing users may have FALSE
                from the legacy default. */}
            <Toggle
              label="Public researcher profile"
              description="Allow others to view your saves, theories, and RADAR view at /researcher/your-username. Email is never shared either way."
              checked={profile?.constellation_public ?? false}
              onChange={(checked) => setProfile((p) => p ? { ...p, constellation_public: checked } : p)}
            />
            <div className="pl-12 sm:pl-14 -mt-2 flex flex-wrap items-center gap-2">
              <p className="text-xs text-gray-500">
                {profile?.constellation_public
                  ? 'Currently public — anyone with your @username can view your profile.'
                  : 'Currently private — your researcher profile shows a "private" notice to visitors.'}
              </p>
              {/* V9.6 Tier 4 — View-as-public link. Opens /researcher/
                  [username] in a new tab so users can preview what
                  others see. Hidden when the profile is private and
                  username isn't set yet. */}
              {profile?.username && (
                <a
                  href={'/researcher/' + profile.username}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-400 hover:text-purple-300 underline"
                >
                  View as public ↗
                </a>
              )}
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Privacy Settings
                </>
              )}
            </button>

            {/* V9.6 Tier 2 — Privacy 'nutrition label'. Replaces the
                prose blurb with a structured 3-row grid so the legibility
                of what's public vs what's never shared scans in seconds.
                Inspired by Apple's privacy nutrition labels in the App
                Store. */}
            <div className="pt-4 border-t border-gray-800">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-3">What others see</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg">
                  <p className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider mb-2">Always public</p>
                  <ul className="space-y-1 text-xs text-gray-300">
                    <li>Display name</li>
                    <li>@username</li>
                    <li>Avatar</li>
                    <li>Profile bio</li>
                  </ul>
                </div>
                <div className="p-3 bg-amber-950/15 border border-amber-900/40 rounded-lg">
                  <p className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider mb-2">Conditional</p>
                  <ul className="space-y-1 text-xs text-gray-300">
                    <li>Saves</li>
                    <li>Theories</li>
                    <li>RADAR view</li>
                  </ul>
                  <p className="text-[10px] text-gray-500 mt-2">Gated by the toggle above.</p>
                </div>
                <div className="p-3 bg-gray-900/60 border border-gray-800 rounded-lg">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Never shared</p>
                  <ul className="space-y-1 text-xs text-gray-300">
                    <li>Email address</li>
                    <li>Exact location</li>
                    <li>Payment info</li>
                    <li>IP address</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* V9.5 P3.3 — Your Data section. Hosts download + deletion
            entry points in their own SettingsSection so users find
            them by skim instead of buried at the bottom of Privacy. */}
        <SettingsSection
          id="data"
          title="Your Data"
          description="Export, manage, and remove your data"
          icon={Info}
        >
          <div className="space-y-4">
            <div className="p-4 bg-gray-800/60 rounded-lg flex items-start gap-3">
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white">Download your data</h4>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                  Get a JSON export of your profile, saves, reports, and RADAR data.
                  Email&apos;d to your account address within 24 hours.
                </p>
              </div>
              <a
                href="mailto:support@paradocs.com?subject=Data%20export%20request"
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Request export
              </a>
            </div>
            <div className="p-4 bg-gray-800/60 rounded-lg flex items-start gap-3">
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white">Delete your account</h4>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                  Permanently delete your profile, saves, and RADAR data. This cannot be undone.
                </p>
              </div>
              <a
                href="mailto:support@paradocs.com?subject=Account%20deletion%20request"
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 border border-red-700/40 text-red-200 text-xs font-medium rounded-lg transition-colors"
              >
                Request deletion
              </a>
            </div>
          </div>
        </SettingsSection>

        {/* Subscription */}
        <SettingsSection
          title="Subscription"
          description="Manage your plan, usage, and billing"
          icon={CreditCard}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-400">
              View and manage your subscription plan, check usage limits, and update billing details.
            </p>
            <Link
              href="/account/subscription"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              View Subscription
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </SettingsSection>

        {/* Location Preferences */}
        <SettingsSection
          id="location"
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
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
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

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Country
                  </label>
                  <select
                    value={localCountry}
                    onChange={(e) => { setLocalCountry(e.target.value); setLocalState('') }}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    {COUNTRIES.map(country => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
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
                      {regionInfo.label}
                    </label>
                    {regionInfo.list.length > 0 ? (
                      <select
                        value={localState}
                        onChange={(e) => setLocalState(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                      >
                        <option value="">Select {regionInfo.label.toLowerCase()}</option>
                        {regionInfo.list.map(region => (
                          <option key={region} value={region}>{region}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={localState}
                        onChange={(e) => setLocalState(e.target.value)}
                        placeholder={`Enter ${regionInfo.label.toLowerCase()}`}
                        className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Watch radius */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Watch radius
              </label>
              <div className="flex flex-wrap gap-2">
                {RADIUS_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => setLocalRadius(option.value)}
                    className={`px-3.5 sm:px-4 py-2.5 sm:py-2 text-sm rounded-lg transition-colors ${
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
          id="interests"
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
                      <span className="text-xl"><CategoryIcon category={key as PhenomenonCategory} size={20} /></span>
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

        {/* About — V9.6.4: dropped 'Beta' label and rewrote tagline
            with brand voice. Section description now hints at what's
            actually here (mission + terms + credits) instead of the
            generic 'App information and legal'. */}
        <SettingsSection
          title="About"
          description="Mission, terms, and credits"
          icon={Info}
        >
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-base font-semibold text-white">Paradocs</p>
              <p className="text-sm text-gray-300 leading-relaxed">
                An open index of the world&apos;s unexplained phenomena. UFO encounters, cryptid sightings, near-death experiences, hauntings, and the rest of the strange — drawn from primary sources, organized by pattern, and built so you can read, save, and connect across decades of evidence.
              </p>
              <p className="text-xs text-gray-500 italic">
                Built for researchers, skeptics, and the genuinely curious.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/terms"
                className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                Terms of Service
              </Link>
              <span className="text-gray-600" aria-hidden="true">•</span>
              <Link
                href="/privacy"
                className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                Privacy Policy
              </Link>
              <span className="text-gray-600" aria-hidden="true">•</span>
              <Link
                href="/about"
                className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                About Paradocs
              </Link>
            </div>
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

      </div>

      {/* V9.5 P2.3 — sticky bottom save bar. Activates when there are
          unsaved changes (profile or notifications). Sits above the
          mobile bottom-tab bar; on desktop it spans the full viewport
          since /account/* no longer uses DashboardLayout's sidebar
          (V9.6 T1.1). The full-section save buttons inside each
          SettingsSection still work for granular saves; this bar is
          the always-on safety net. */}
      {/* V9.6 Tier 2 — sticky bar now has two states: dirty (orange dot +
          Save changes button) and idle-with-recent-save ('Saved Xm
          ago', no CTA). Cross-fades between states (Tier 4). */}
      <div
        className={[
          'fixed left-0 right-0 z-40 transition-all duration-300 ease-out',
          // sit above the mobile bottom tab bar (h-16 + safe-area)
          'bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-0',
          (isDirty || savedAt)
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-full opacity-0 pointer-events-none',
        ].join(' ')}
      >
        <div className="bg-gray-900/95 backdrop-blur border-t border-gray-800 px-4 sm:px-6 py-3 sm:py-3.5">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={
                  'w-2 h-2 rounded-full flex-shrink-0 transition-colors ' +
                  (isDirty ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400')
                }
              />
              <span className="text-sm text-gray-300 truncate">
                {isDirty
                  ? 'Unsaved changes'
                  : savedAt
                    ? <>Saved <RelativeTime date={savedAt} /></>
                    : 'All changes saved'}
              </span>
            </div>
            {isDirty && (
              <button
                onClick={handleSaveProfile}
                // V9.9 P2 — block save when username is taken/invalid.
                // Postgres would reject the upsert with a unique-
                // violation anyway; this gives clearer UX upstream.
                disabled={saving || usernameStatus === 'taken' || usernameStatus === 'invalid'}
                className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50 flex-shrink-0"
                title={usernameStatus === 'taken' ? 'Username is taken' : usernameStatus === 'invalid' ? 'Username is invalid' : undefined}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save changes
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
