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
  Check
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase'

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
          bio: profile.bio,
          location: profile.location,
          website: profile.website,
          notification_settings: notifications,
          updated_at: new Date().toISOString()
        })

      if (error) throw error

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving profile:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
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
