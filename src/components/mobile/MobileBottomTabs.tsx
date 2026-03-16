'use client'

/**
 * MobileBottomTabs — unified bottom tab bar for ALL mobile pages.
 *
 * Used by both Layout.tsx (public pages) and DashboardLayout.tsx (dashboard pages).
 * Same 5 tabs everywhere for seamless navigation:
 *
 * 1. Explore — discovery feed, the Netflix-scroll experience
 * 2. Map — interactive sighting map, high-value visual feature
 * 3. Discover (FAB) — TikTok-like immersive feed, the casual user hook
 * 4. Library/Encyclopedia — auth-aware: Encyclopedia for guests, Library for logged-in
 * 5. More — bottom sheet with everything else (auth-gated items)
 *
 * Session 13 Nav Unification: replaces both the old Layout.tsx inline nav
 * and the original dashboard-only MobileBottomTabs with one consistent bar.
 */

import { classNames } from '@/lib/utils'
import { useRouter } from 'next/router'
import Link from 'next/link'
import {
  Compass,
  Map as MapIcon,
  Flame,
  BookOpen,
  LayoutDashboard,
  Menu,
  FlaskConical,
  Stars,
  Bookmark,
  FileText,
  Newspaper,
  Sparkles,
  CreditCard,
  Settings,
  LogOut,
  LogIn,
  Home,
  PlusCircle,
} from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { MobileBottomSheet } from './MobileBottomSheet'
import { supabase } from '@/lib/supabase'

export function MobileBottomTabs() {
  var router = useRouter()
  var [isMoreOpen, setIsMoreOpen] = useState(false)
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

  var handleSignOut = useCallback(async function() {
    await supabase.auth.signOut()
    router.push('/')
  }, [router])

  // Route matching for tab active states
  var isRouteActive = function(path: string) {
    if (path === '/explore') {
      return router.pathname === '/explore' || router.pathname.startsWith('/explore/')
    }
    if (path === '/map') {
      return router.pathname === '/map'
    }
    if (path === '/discover') {
      return router.pathname === '/discover'
    }
    if (path === '/phenomena') {
      return router.pathname === '/phenomena' || router.pathname.startsWith('/phenomena/')
    }
    // For More sheet items, match specific dashboard sub-routes
    return router.pathname === path || router.pathname.startsWith(path + '/')
  }

  // 4th tab: "Library" (dashboard) for logged-in, "Encyclopedia" for guests
  var isDashboardRoute = router.pathname.startsWith('/dashboard')
  var isPhenomenaRoute = router.pathname === '/phenomena' || router.pathname.startsWith('/phenomena/')

  var FourthIcon = isLoggedIn ? LayoutDashboard : BookOpen
  var fourthLabel = isLoggedIn ? 'Library' : 'Encyclopedia'
  var fourthHref = isLoggedIn ? '/dashboard' : '/phenomena'
  var fourthActive = isLoggedIn ? isDashboardRoute : isPhenomenaRoute

  return (
    <>
      {/* Tab bar \u2014 md:hidden ensures desktop nav is untouched */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-gray-900/95 backdrop-blur-lg border-t border-gray-800">
        <div
          className="flex items-stretch justify-around"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* Explore */}
          <Link
            href="/explore"
            className={classNames(
              'flex flex-col items-center justify-center flex-1 py-2 min-h-[56px] transition-colors relative',
              isRouteActive('/explore') ? 'text-primary-400' : 'text-gray-500'
            )}
          >
            <Compass className="w-6 h-6" />
            <span className={classNames(
              'text-[10px] mt-1 font-medium',
              isRouteActive('/explore') ? 'text-primary-400' : 'text-gray-500'
            )}>Explore</span>
            {isRouteActive('/explore') && (
              <div className="absolute top-1.5 w-1 h-1 rounded-full bg-primary-400" />
            )}
          </Link>

          {/* Map */}
          <Link
            href="/map"
            className={classNames(
              'flex flex-col items-center justify-center flex-1 py-2 min-h-[56px] transition-colors relative',
              isRouteActive('/map') ? 'text-primary-400' : 'text-gray-500'
            )}
          >
            <MapIcon className="w-6 h-6" />
            <span className={classNames(
              'text-[10px] mt-1 font-medium',
              isRouteActive('/map') ? 'text-primary-400' : 'text-gray-500'
            )}>Map</span>
            {isRouteActive('/map') && (
              <div className="absolute top-1.5 w-1 h-1 rounded-full bg-primary-400" />
            )}
          </Link>

          {/* Discover FAB — elevated center button, the hook for casual users
              64px (w-16 h-16) is upper bound for nav-embedded FAB,
              -mt-6 lifts it well above the nav plane */}
          <Link
            href="/discover"
            className="flex flex-col items-center justify-center flex-1 py-2 min-h-[56px]"
          >
            <div className={classNames(
              'flex items-center justify-center w-16 h-16 -mt-6 rounded-full shadow-xl transition-all',
              isRouteActive('/discover')
                ? 'bg-primary-500 text-white shadow-primary-500/50 scale-110'
                : 'bg-gradient-to-br from-primary-500 to-purple-600 text-white shadow-primary-500/40 shadow-purple-500/20'
            )}>
              <Flame className="w-8 h-8" />
            </div>
          </Link>

          {/* Auth-aware 4th tab */}
          <Link
            href={fourthHref}
            className={classNames(
              'flex flex-col items-center justify-center flex-1 py-2 min-h-[56px] transition-colors relative',
              fourthActive ? 'text-primary-400' : 'text-gray-500'
            )}
          >
            <FourthIcon className="w-6 h-6" />
            <span className={classNames(
              'text-[10px] mt-1 font-medium',
              fourthActive ? 'text-primary-400' : 'text-gray-500'
            )}>
              {fourthLabel}
            </span>
            {fourthActive && (
              <div className="absolute top-1.5 w-1 h-1 rounded-full bg-primary-400" />
            )}
          </Link>

          {/* More \u2014 opens bottom sheet */}
          <button
            onClick={function() { setIsMoreOpen(true) }}
            className={classNames(
              'flex flex-col items-center justify-center flex-1 py-2 min-h-[56px] transition-colors',
              isMoreOpen ? 'text-primary-400' : 'text-gray-500'
            )}
          >
            <Menu className="w-6 h-6" />
            <span className={classNames(
              'text-[10px] mt-1 font-medium',
              isMoreOpen ? 'text-primary-400' : 'text-gray-500'
            )}>More</span>
          </button>
        </div>
      </nav>

      {/* More sheet \u2014 unified menu for all contexts */}
      <MobileBottomSheet
        isOpen={isMoreOpen}
        onClose={function() { setIsMoreOpen(false) }}
        title="More"
        snapPoint="half"
      >
        <div className="px-4 py-3">
          {/* Browse section */}
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider px-3 mb-2">Browse</p>
          <div className="space-y-0.5">
            <MoreLink href="/" label="Home" icon={Home} active={router.pathname === '/'} onClose={function() { setIsMoreOpen(false) }} />

            {/* Show Encyclopedia here for logged-in users (their 4th tab is Library/Dashboard) */}
            {isLoggedIn && (
              <MoreLink href="/phenomena" label="Encyclopedia" icon={BookOpen} active={isPhenomenaRoute} onClose={function() { setIsMoreOpen(false) }} />
            )}

            <MoreLink href="/insights" label="AI Insights" icon={Sparkles} active={isRouteActive('/insights')} onClose={function() { setIsMoreOpen(false) }} />
            <MoreLink href="/submit" label="Submit Report" icon={PlusCircle} active={false} onClose={function() { setIsMoreOpen(false) }} iconClassName="text-primary-400" />
          </div>

          {/* My Paradocs \u2014 only for logged-in users */}
          {isLoggedIn && (
            <>
              <div className="my-3 border-t border-gray-800" />
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider px-3 mb-2">My Paradocs</p>
              <div className="space-y-0.5">
                <MoreLink href="/dashboard/research-hub" label="Research Hub" icon={FlaskConical} active={isRouteActive('/dashboard/research-hub')} onClose={function() { setIsMoreOpen(false) }} />
                <MoreLink href="/dashboard/constellation" label="Constellation" icon={Stars} active={isRouteActive('/dashboard/constellation')} onClose={function() { setIsMoreOpen(false) }} />
                <MoreLink href="/dashboard/saved" label="Saved Reports" icon={Bookmark} active={isRouteActive('/dashboard/saved')} onClose={function() { setIsMoreOpen(false) }} />
                <MoreLink href="/dashboard/reports" label="My Reports" icon={FileText} active={isRouteActive('/dashboard/reports')} onClose={function() { setIsMoreOpen(false) }} />
                <MoreLink href="/dashboard/journal" label="Journal" icon={BookOpen} active={isRouteActive('/dashboard/journal')} onClose={function() { setIsMoreOpen(false) }} />
                <MoreLink href="/dashboard/digests" label="Weekly Digests" icon={Newspaper} active={isRouteActive('/dashboard/digests')} onClose={function() { setIsMoreOpen(false) }} />
              </div>
            </>
          )}

          {/* Account section */}
          <div className="my-3 border-t border-gray-800" />
          <div className="space-y-0.5">
            {isLoggedIn ? (
              <>
                <MoreLink href="/dashboard/subscription" label="Subscription" icon={CreditCard} active={isRouteActive('/dashboard/subscription')} onClose={function() { setIsMoreOpen(false) }} />
                <MoreLink href="/dashboard/settings" label="Settings" icon={Settings} active={isRouteActive('/dashboard/settings')} onClose={function() { setIsMoreOpen(false) }} />
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
              </>
            ) : (
              <MoreLink href="/login" label="Sign In" icon={LogIn} active={false} onClose={function() { setIsMoreOpen(false) }} />
            )}
          </div>
        </div>
      </MobileBottomSheet>
    </>
  )
}

/** Reusable link row for the More sheet */
function MoreLink(props: {
  href: string
  label: string
  icon: React.ElementType
  active: boolean
  onClose: () => void
  iconClassName?: string
}) {
  var Icon = props.icon
  return (
    <Link
      href={props.href}
      onClick={props.onClose}
      className={classNames(
        'flex items-center gap-3 px-3 py-3 rounded-lg transition-colors',
        props.active
          ? 'bg-primary-600/20 text-primary-400'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      )}
    >
      <Icon className={classNames('w-5 h-5 flex-shrink-0', props.iconClassName || '')} />
      <span className="text-sm font-medium">{props.label}</span>
    </Link>
  )
}

export default MobileBottomTabs
