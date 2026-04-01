'use client'

/**
 * MobileBottomTabs — Session A1: UX Consolidation
 *
 * New 4-tab structure (NO FAB, NO More sheet):
 * 1. Feed (flame) — /discover
 * 2. Explore (compass) — /explore
 * 3. Lab (telescope) — /lab
 * 4. Profile (avatar) — /profile
 *
 * The [+] FAB and "More" bottom sheet are completely removed.
 * Active tab indicator uses the existing brand primary color.
 *
 * SWC: Uses var + function(){} for compatibility with existing imports.
 */

import { classNames } from '@/lib/utils'
import { useRouter } from 'next/router'
import Link from 'next/link'
import {
  Flame,
  Compass,
  Telescope,
  User,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

var TABS = [
  { key: 'feed', label: 'Feed', icon: Flame, href: '/discover' },
  { key: 'explore', label: 'Explore', icon: Compass, href: '/explore' },
  { key: 'lab', label: 'Lab', icon: Telescope, href: '/lab' },
  { key: 'profile', label: 'Profile', icon: User, href: '/profile' },
]

export function MobileBottomTabs() {
  var router = useRouter()
  var [isLoggedIn, setIsLoggedIn] = useState(false)

  // Lightweight auth check — session existence only, no API call
  useEffect(function() {
    function checkAuth() {
      supabase.auth.getSession().then(function(result) {
        setIsLoggedIn(!!result.data.session)
      })
    }
    checkAuth()
    var authListener = supabase.auth.onAuthStateChange(function() {
      checkAuth()
    })
    return function() {
      authListener.data.subscription.unsubscribe()
    }
  }, [])

  // Route matching for tab active states
  var getActiveTab = function() {
    var path = router.pathname

    // Feed: /discover, /feed, homepage for logged-in users
    if (path === '/discover' || path === '/feed') return 'feed'

    // Explore: /explore (all modes), plus old routes that redirect
    if (path === '/explore' || path.startsWith('/explore/') ||
        path === '/map' || path === '/search' ||
        path === '/phenomena') return 'explore'

    // Lab: /lab, /dashboard/*
    if (path === '/lab' || path.startsWith('/lab/') ||
        path.startsWith('/dashboard')) return 'lab'

    // Profile: /profile, /researcher/*
    if (path === '/profile' || path.startsWith('/profile/') ||
        path.startsWith('/researcher/')) return 'profile'

    return null
  }

  var activeTab = getActiveTab()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-gray-900/95 backdrop-blur-lg border-t border-gray-800">
      <div
        className="flex items-stretch justify-around"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {TABS.map(function(tab) {
          var Icon = tab.icon
          var isActive = activeTab === tab.key
          // If not logged in and clicking profile, go to login instead
          var href = tab.key === 'profile' && !isLoggedIn ? '/login' : tab.href

          return (
            <Link
              key={tab.key}
              href={href}
              className={classNames(
                'flex flex-col items-center justify-center flex-1 py-2 min-h-[56px] transition-colors relative',
                isActive ? 'text-primary-400' : 'text-gray-500'
              )}
            >
              <Icon className="w-6 h-6" />
              <span className={classNames(
                'text-[10px] mt-1 font-medium',
                isActive ? 'text-primary-400' : 'text-gray-500'
              )}>
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute top-1.5 w-1 h-1 rounded-full bg-primary-400" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default MobileBottomTabs
