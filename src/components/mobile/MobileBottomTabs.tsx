'use client'

/**
 * MobileBottomTabs — persistent bottom tab bar for mobile navigation.
 *
 * Tab order is intentional: prioritizes content browsing (the $5.99 user flow)
 * before research tools (the $14.99 power user flow).
 *
 * 1. Home — personalized landing, trending, recent saves
 * 2. Explore — discovery feed, the Netflix-scroll experience
 * 3. Research — Research Hub (Board/Timeline/Map/Constellation)
 * 4. Constellation — pro-gated star map (upgrade prompt for free tier)
 * 5. More — bottom sheet with Library, Settings, Sign Out, etc.
 */

import { classNames } from '@/lib/utils'
import { useRouter } from 'next/router'
import Link from 'next/link'
import {
  LayoutDashboard,
  Compass,
  FlaskConical,
  Stars,
  Menu,
  Bookmark,
  FileText,
  Newspaper,
  BookOpen,
  CreditCard,
  Settings,
  LogOut,
  Lock,
  Sparkles,
} from 'lucide-react'
import { useState, useCallback } from 'react'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { MobileBottomSheet } from './MobileBottomSheet'
import { supabase } from '@/lib/supabase'

interface MoreSheetItem {
  href: string
  label: string
  icon: React.ElementType
}

var MORE_ITEMS: MoreSheetItem[] = [
  { href: '/dashboard/saved', label: 'Saved Reports', icon: Bookmark },
  { href: '/dashboard/reports', label: 'My Reports', icon: FileText },
  { href: '/dashboard/journal', label: 'Journal', icon: BookOpen },
  { href: '/dashboard/digests', label: 'Weekly Digests', icon: Newspaper },
  { href: '/dashboard/insights', label: 'AI Insights', icon: Sparkles },
  { href: '/dashboard/subscription', label: 'Subscription', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function MobileBottomTabs() {
  var router = useRouter()
  var { tierName } = useSubscription()
  var [isMoreOpen, setIsMoreOpen] = useState(false)

  var isProUser = tierName === 'pro' || tierName === 'enterprise' || tierName === 'basic'

  var handleSignOut = useCallback(async function() {
    await supabase.auth.signOut()
    router.push('/')
  }, [router])

  var isActive = function(path: string) {
    if (path === '/dashboard') {
      return router.pathname === '/dashboard'
    }
    return router.pathname.startsWith(path)
  }

  var tabs = [
    {
      href: '/dashboard',
      label: 'Home',
      icon: LayoutDashboard,
      active: isActive('/dashboard') && !isActive('/dashboard/research-hub') && !isActive('/dashboard/constellation'),
    },
    {
      href: '/explore',
      label: 'Explore',
      icon: Compass,
      active: isActive('/explore'),
    },
    {
      href: '/dashboard/research-hub',
      label: 'Research',
      icon: FlaskConical,
      active: isActive('/dashboard/research-hub'),
    },
    {
      href: '/dashboard/constellation',
      label: 'Stars',
      icon: Stars,
      active: isActive('/dashboard/constellation'),
      locked: !isProUser,
    },
  ]

  return (
    <>
      {/* Tab bar — md:hidden ensures desktop sidebar is untouched */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-gray-900/95 backdrop-blur-lg border-t border-gray-800">
        <div
          className="flex items-stretch justify-around"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {tabs.map(function(tab) {
            var Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.locked ? '/dashboard/subscription' : tab.href}
                className={classNames(
                  'flex flex-col items-center justify-center flex-1 py-2 min-h-[56px] transition-colors relative',
                  tab.active
                    ? 'text-primary-400'
                    : tab.locked
                      ? 'text-gray-600'
                      : 'text-gray-500'
                )}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {tab.locked && (
                    <Lock className="w-2.5 h-2.5 absolute -top-1 -right-1.5 text-gray-500" />
                  )}
                </div>
                <span className={classNames(
                  'text-[10px] mt-1 font-medium',
                  tab.active ? 'text-primary-400' : tab.locked ? 'text-gray-600' : 'text-gray-500'
                )}>
                  {tab.label}
                </span>
                {/* Active indicator dot */}
                {tab.active && (
                  <div className="absolute top-1.5 w-1 h-1 rounded-full bg-primary-400" />
                )}
              </Link>
            )
          })}

          {/* More tab — opens bottom sheet instead of navigating */}
          <button
            onClick={function() { setIsMoreOpen(true) }}
            className={classNames(
              'flex flex-col items-center justify-center flex-1 py-2 min-h-[56px] transition-colors',
              isMoreOpen ? 'text-primary-400' : 'text-gray-500'
            )}
          >
            <Menu className="w-5 h-5" />
            <span className={classNames(
              'text-[10px] mt-1 font-medium',
              isMoreOpen ? 'text-primary-400' : 'text-gray-500'
            )}>
              More
            </span>
          </button>
        </div>
      </nav>

      {/* More sheet */}
      <MobileBottomSheet
        isOpen={isMoreOpen}
        onClose={function() { setIsMoreOpen(false) }}
        title="More"
        snapPoint="half"
      >
        <div className="px-4 py-3 space-y-1">
          {MORE_ITEMS.map(function(item) {
            var Icon = item.icon
            var active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={function() { setIsMoreOpen(false) }}
                className={classNames(
                  'flex items-center gap-3 px-3 py-3 rounded-lg transition-colors',
                  active
                    ? 'bg-primary-600/20 text-primary-400'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            )
          })}

          {/* Divider */}
          <div className="my-2 border-t border-gray-800" />

          {/* Sign out */}
          <button
            onClick={function() {
              setIsMoreOpen(false)
              handleSignOut()
            }}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors w-full"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </MobileBottomSheet>
    </>
  )
}

export default MobileBottomTabs
