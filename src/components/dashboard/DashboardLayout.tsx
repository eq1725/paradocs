/**
 * DashboardLayout Component
 *
 * Wrapper layout for all dashboard pages with responsive navigation.
 * Mobile: Persistent bottom tab bar (MobileBottomTabs) + compact header (MobileHeader)
 * Desktop: Fixed sidebar (unchanged)
 *
 * Session 13 rewrite: replaced hamburger slide-from-right menu with bottom tabs.
 * Removed inline <style jsx global> — CSS now in globals.css and tailwind.config.js.
 */

import React, { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  LayoutDashboard,
  FileText,
  Bookmark,
  Sparkles,
  Stars,
  BookOpen,
  Newspaper,
  CreditCard,
  Settings,
  ChevronLeft,
  LogOut,
  Bell,
  FlaskConical
} from 'lucide-react'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { TierBadge } from './TierBadge'
import { Avatar } from '@/components/AvatarSelector'
import { supabase } from '@/lib/supabase'
import { MobileBottomTabs } from '@/components/mobile/MobileBottomTabs'
import NotificationBell from '@/components/NotificationBell'

interface DashboardLayoutProps {
  children: ReactNode
  title?: string
}

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  requiredTier?: string[]
}

interface NavGroup {
  label: string
  items: NavItem[]
}

var navGroups: NavGroup[] = [
  {
    label: 'Research',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/dashboard/research-hub', label: 'Research Hub', icon: FlaskConical },
      { href: '/dashboard/constellation', label: 'My Constellation', icon: Stars },
      { href: '/dashboard/journal', label: 'Journal', icon: BookOpen },
    ]
  },
  {
    label: 'Library',
    items: [
      { href: '/dashboard/saved', label: 'Saved Reports', icon: Bookmark },
      { href: '/dashboard/reports', label: 'My Reports', icon: FileText },
      { href: '/dashboard/digests', label: 'Weekly Digests', icon: Newspaper },
    ]
  },
  {
    label: 'Tools',
    items: [
      { href: '/dashboard/insights', label: 'AI Insights', icon: Sparkles, requiredTier: ['basic', 'pro', 'enterprise'] },
      { href: '/dashboard/subscription', label: 'Subscription', icon: CreditCard },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ]
  }
]

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
  var pageTitle = title || 'Dashboard'
  var router = useRouter()
  var { subscription, tierName, tierDisplayName, loading } = useSubscription()
  var [userProfile, setUserProfile] = useState<{ avatar_url?: string | null; display_name?: string | null } | null>(null)

  // Fetch user profile for avatar
  useEffect(function() {
    async function fetchProfile() {
      var sessionResult = await supabase.auth.getSession()
      var session = sessionResult.data.session
      if (session && session.user) {
        var { data } = await supabase
          .from('profiles')
          .select('avatar_url, display_name')
          .eq('id', session.user.id)
          .single()
        if (data) setUserProfile(data)
      }
    }
    fetchProfile()

    // Listen for profile updates from settings page
    var handleProfileUpdate = function() {
      fetchProfile()
    }
    window.addEventListener('profile-updated', handleProfileUpdate)
    return function() {
      window.removeEventListener('profile-updated', handleProfileUpdate)
    }
  }, [])

  var handleSignOut = async function() {
    await supabase.auth.signOut()
    router.push('/')
  }

  var isActiveRoute = function(href: string) {
    if (href === '/dashboard') {
      return router.pathname === '/dashboard'
    }
    return router.pathname.startsWith(href)
  }

  var canAccessNavItem = function(item: NavItem) {
    if (!item.requiredTier) return true
    if (!tierName) return false
    return item.requiredTier.includes(tierName)
  }

  // Shared navigation content (desktop sidebar only — mobile uses MobileBottomTabs)
  var NavContent = function({ onItemClick }: { onItemClick?: () => void }) {
    return (
      <div className="space-y-4">
        {navGroups.map(function(group, gi) {
          return (
            <div key={group.label}>
              {gi > 0 && <div className="border-t border-gray-800/50 mb-3" />}
              <p className="text-[10px] text-gray-600 uppercase tracking-wider font-medium px-3 mb-1.5">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map(function(item) {
                  var Icon = item.icon
                  var isActive = isActiveRoute(item.href)
                  var hasAccess = canAccessNavItem(item)

                  return (
                    <li key={item.href}>
                      {hasAccess ? (
                        <Link
                          href={item.href}
                          onClick={onItemClick}
                          className={
                            'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ' +
                            (isActive
                              ? 'bg-purple-600 text-white'
                              : 'text-gray-400 hover:text-white hover:bg-gray-800')
                          }
                        >
                          <Icon className="w-5 h-5" />
                          <span>{item.label}</span>
                        </Link>
                      ) : (
                        <div
                          className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 cursor-not-allowed"
                          title={'Upgrade to ' + (item.requiredTier ? item.requiredTier[0] : '') + ' to access'}
                        >
                          <Icon className="w-5 h-5" />
                          <span>{item.label}</span>
                          <span className="ml-auto text-xs bg-gray-800 px-2 py-0.5 rounded">
                            Pro
                          </span>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>{pageTitle + ' | Paradocs'}</title>
      </Head>

      <div className="min-h-screen bg-gray-950">
        {/* Safe area background - fills the notch/Dynamic Island area */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-gray-900 safe-area-background" />

        {/* Mobile Header — compact, no hamburger */}
        <header className="md:hidden fixed left-0 right-0 z-40 bg-gray-900/95 backdrop-blur-lg border-b border-gray-800 dashboard-mobile-header-positioned">
          <div className="flex items-center justify-between h-14 px-4">
            <Link href="/" className="flex items-center gap-2 text-white">
              <ChevronLeft className="w-4 h-4" />
              <span className="font-sans font-black text-xl tracking-tight">Paradocs<span className="text-primary-500">.</span></span>
            </Link>
            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </div>
        </header>

        {/* Desktop Layout */}
        <div className="flex">
          {/* Desktop Sidebar - Hidden on mobile */}
          <aside className="hidden md:flex w-64 bg-gray-900 border-r border-gray-800 flex-col fixed inset-y-0 left-0">
            {/* Logo */}
            <div className="p-4 border-b border-gray-800">
              <Link href="/" className="flex items-center gap-2 text-white hover:text-purple-400 transition-colors">
                <ChevronLeft className="w-4 h-4" />
                <span className="font-sans font-black text-xl tracking-tight">Paradocs<span className="text-primary-500">.</span></span>
              </Link>
            </div>

            {/* User Info */}
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <Avatar
                  avatar={userProfile?.avatar_url}
                  fallback={userProfile?.display_name || 'U'}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {loading ? 'Loading...' : (userProfile?.display_name || 'My Account')}
                  </p>
                  {tierName && (
                    <TierBadge tier={tierName} size="sm" />
                  )}
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 overflow-y-auto">
              <NavContent />
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 md:ml-64 flex flex-col min-h-screen">
            {/* Desktop Top Bar - Hidden on mobile */}
            <header className="hidden md:flex h-16 bg-gray-900 border-b border-gray-800 items-center justify-between px-6">
              <h1 className="text-xl font-semibold text-white">{pageTitle}</h1>
              <div className="flex items-center gap-4">
                <button className="p-2 text-gray-400 hover:text-white transition-colors relative">
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-purple-500 rounded-full"></span>
                </button>
              </div>
            </header>

            {/* Mobile Title Bar - offset for header + safe area */}
            <div className="md:hidden px-4 pb-3 bg-gray-950 mobile-title-offset">
              <h1 className="text-lg font-semibold text-white">{pageTitle}</h1>
            </div>

            {/* Page Content — mobile-content-pb adds bottom padding for tab bar */}
            <div className="flex-1 p-4 md:p-6 overflow-x-hidden overflow-y-auto mobile-content-pb">
              {children}
            </div>
          </main>
        </div>

        {/* Mobile Bottom Tabs — persistent navigation bar */}
        <MobileBottomTabs />
      </div>
    </>
  )
}

export default DashboardLayout
