'use client'

/**
 * Layout Component — public page wrapper (Explore, Map, Report, Encyclopedia, Insights, etc.)
 *
 * Session 13 Nav Unification: Mobile bottom nav replaced with shared MobileBottomTabs.
 * The old inline 5-tab nav (Explore/Map/Discover FAB/Encyclopedia/More) and slide-up
 * menu panel have been removed. MobileBottomTabs now provides consistent navigation
 * across ALL pages (public + dashboard).
 *
 * Desktop header nav is unchanged.
 *
 * V11.17.68 Tier 2A — Added Upgrade pill in the header for free-tier
 * users. Hidden for paid (Basic / Pro). Also suppressed on /pricing
 * and /account/subscription themselves to avoid navigation loops. Per
 * PRICING_SUBSCRIPTION_PANEL.md §6 the global header is the only
 * "you could upgrade" chrome we want bleeding into catalogue browsing;
 * everything else lives in-context on the gated affordance.
 */

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Search, Home, Compass, Map,
  BookOpen, Sparkles, Flame,
  User, LogOut, LogIn, Settings, LayoutDashboard
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { Avatar } from '@/components/AvatarSelector'
import NavigationHelper from '@/components/NavigationHelper'
import { MobileBottomTabs } from '@/components/mobile/MobileBottomTabs'
import NotificationsBell from '@/components/NotificationsBell'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter()
  const [user, setUser] = useState<Profile | null>(null)
  const [tierName, setTierName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    checkUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkUser()
    })
    // V9.7.1 — listen for the 'profile-updated' event that
    // /account/settings dispatches after a save. Without this, the
    // top-nav avatar showed the pre-save value until next page load.
    const handleProfileUpdated = () => { checkUser() }
    window.addEventListener('profile-updated', handleProfileUpdated)
    return () => {
      subscription.unsubscribe()
      window.removeEventListener('profile-updated', handleProfileUpdated)
    }
  }, [])

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        setUser(data)

        // V11.17.68 Tier 2A — resolve tier name for the Upgrade pill.
        // Done in a separate query so a join failure can't blank the
        // user object. Best-effort; failures default to null (treated
        // as "free" by the pill suppression logic).
        try {
          const profileWithTier: any = data
          if (profileWithTier && profileWithTier.current_tier_id) {
            const { data: tierData } = await (supabase
              .from('subscription_tiers') as any)
              .select('name')
              .eq('id', profileWithTier.current_tier_id)
              .single()
            if (tierData && tierData.name) {
              setTierName(tierData.name as string)
            } else {
              setTierName('free')
            }
          } else {
            setTierName('free')
          }
        } catch (_tierErr) {
          setTierName(null)
        }
      } else {
        setUser(null)
        setTierName(null)
      }
    } catch (error) {
      console.error('Error checking user:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push('/explore?mode=search&q=' + encodeURIComponent(searchQuery))
    }
  }

  // Main navigation — unified labels across all nav surfaces
  // (May 2026 panel-review rename: "Reports" → "Today")
  // V11.17.67 Tier 1 rename: "Lab" → "My Record" per LAB_PANEL_REVIEW_V3.
  // URL stays /lab (indexed, in PostHog); only the chrome label flips.
  const navigation = [
    { name: 'Today', href: '/discover', icon: Flame },
    { name: 'Phenomena', href: '/explore', icon: Compass },
    { name: 'My Record', href: '/lab', icon: Sparkles },
  ]

  return (
    <div className="min-h-screen">
      {/* Starfield background */}
      <Starfield />

      {/* Header - safe-area-pt handles Dynamic Island in PWA mode */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/30 backdrop-blur-xl border-b border-white/5 safe-area-pt">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center mr-8">
              <span className="font-brand text-xl sm:text-2xl text-white tracking-tight whitespace-nowrap">Paradocs<span style={{color:'#9000F0'}}>.</span></span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => {
                const isActive = router.pathname === item.href ||
                  (item.href !== '/' && router.pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={classNames(
                      'relative px-4 py-2 rounded-lg text-sm font-medium transition-all',
                      isActive
                        ? 'text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    )}
                  >
                    {item.name}
                    {isActive && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary-500 rounded-full" />
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* Search Bar — invisible on /explore search mode (keeps layout space, prevents shift) */}
            <form onSubmit={handleSearch} className={'flex-1 max-w-md mx-8 hidden md:block' + (router.pathname === '/explore' && router.query.mode === 'search' ? ' invisible' : '')}>
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-primary-400 transition-colors" />
                <input
                  type="text"
                  placeholder="Search reports, phenomena..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm focus:outline-none focus:border-primary-500 focus:bg-white/[0.08] transition-colors"
                />
              </div>
            </form>

            {/* Mobile search icon — persistent, always visible on mobile */}
            <Link
              href="/explore?mode=search"
              className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors ml-auto"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </Link>

            {/* Right section */}
            <div className="flex items-center gap-3">
              {/* V11.17.68 Tier 2A — Upgrade pill for free users only.
                  Hidden for paid users (Basic / Pro) and suppressed on
                  /pricing + /account/subscription themselves to avoid
                  navigation loops. Documentary register, brand-purple
                  text on transparent background — quiet, not aggressive. */}
              {!loading && user && (tierName === 'free' || tierName === null) &&
                router.pathname !== '/pricing' &&
                router.pathname !== '/account/subscription' && (
                <Link
                  href="/pricing"
                  className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium text-purple-300 hover:text-white hover:bg-purple-500/10 border border-purple-500/30 hover:border-purple-400/60 transition-colors"
                >
                  Upgrade
                </Link>
              )}

              {/* T1.9 — Notifications bell. Authenticated only; renders
                  the user_notifications dropdown. Placed before avatar
                  so it's consistently to the left of the user menu on
                  every layout breakpoint. */}
              {!loading && user && <NotificationsBell />}

              {/* User menu */}
              {!loading && (
                user ? (
                  <>
                    {/* Mobile: Simple link to profile */}
                    <Link
                      href="/profile"
                      className="md:hidden flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <Avatar
                        avatar={user.avatar_url}
                        fallback={user.display_name || user.username}
                        size="md"
                      />
                    </Link>
                    {/* Desktop: Hover dropdown menu */}
                    <div className="relative group hidden md:block">
                      <button className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 transition-colors">
                        <Avatar
                          avatar={user.avatar_url}
                          fallback={user.display_name || user.username}
                          size="md"
                        />
                      </button>
                      <div className="absolute right-0 top-full mt-2 w-48 py-2 bg-gray-900/95 backdrop-blur border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                        <div className="px-4 py-2 border-b border-white/10">
                          <p className="font-medium text-white">{user.display_name || user.username}</p>
                          <p className="text-xs text-gray-400">@{user.username}</p>
                        </div>
                        <Link href="/lab" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10">
                          <LayoutDashboard className="w-4 h-4" />
                          My Record
                        </Link>
                        <Link href="/profile" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10">
                          <User className="w-4 h-4" />
                          Profile
                        </Link>
                        <Link href="/profile" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10">
                          <Settings className="w-4 h-4" />
                          Settings
                        </Link>
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link
                      href="/login"
                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-300 hover:text-white"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      Sign in
                    </Link>
                    {/* Panel-feedback (May 2026): top-nav Sign up CTA
                        beside Sign in. Visible across all browse
                        surfaces so users can convert whenever they're
                        ready, not just from the homepage. */}
                    <Link
                      href="/start"
                      className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 transition-colors"
                    >
                      Sign up
                    </Link>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Unified Mobile Bottom Navigation — same component used by DashboardLayout */}
      <MobileBottomTabs />

      {/* Scroll position restoration for list-detail-list navigation */}
      <NavigationHelper />

      {/* Main content - accounts for header + safe area (Dynamic Island) + bottom nav.
          V11.17.41 — switched from Tailwind pb-20 (flat 80px) to the
          existing .mobile-content-pb utility which does
          calc(64px + env(safe-area-inset-bottom) + 0.5rem). The flat
          80px wasn't enough for iPhones with a home indicator —
          nav height (56px) + safe area (~34px) = ~90px — so feed
          cards visibly scrolled under the bottom tab bar. The
          utility resets to padding-bottom:1.5rem at md+ via its own
          @media block, so the md:pb-0 suffix isn't needed anymore.
          /discover still handles its own bottom padding via
          .mobile-content-pb on the inner pane (suppressed here to
          avoid doubling). */}
      <main className={'main-content-pt min-h-screen ' + (router.pathname === '/discover' ? 'pb-0' : 'mobile-content-pb')}>
        {children}
      </main>

      {/* V9.11.5 #26 — footer hidden on /start (the onboarding funnel
          is goal-focused; footer chrome distracts and dilutes the
          single primary CTA). Still visible on every other page md+.
          V10.9.C — also hidden on /explore?mode=map because that view
          is a fullscreen map and the footer competing for scroll is
          a UX trap (users scroll trying to dismiss the map and end up
          stuck at the bottom). */}
      {/* Footer — hidden on mobile (bottom tab nav replaces it); visible md+ */}
      <footer className={classNames(
        'hidden md:block border-t border-white/5 bg-black/30 backdrop-blur',
        router.pathname === '/start' && 'md:!hidden',
        (router.pathname === '/explore' && router.query.mode === 'map') && 'md:!hidden',
        router.pathname === '/map' && 'md:!hidden',
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="inline-block mb-4">
                <span className="font-brand text-2xl text-white tracking-tight">Paradocs<span style={{color:'#9000F0'}}>.</span></span>
              </Link>
              <p className="text-sm text-gray-500">
                The world's largest database of paranormal phenomena. Where mysteries meet discovery.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-white mb-4">Phenomena</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/explore?category=ufo_uap" className="hover:text-white">UFO Sightings</Link></li>
                <li><Link href="/explore?category=cryptid" className="hover:text-white">Cryptids</Link></li>
                <li><Link href="/explore?category=ghost_haunting" className="hover:text-white">Ghosts</Link></li>
                <li><Link href="/map" className="hover:text-white">Map</Link></li>
                <li><Link href="/explore?mode=search" className="hover:text-white">Search</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-4">Community</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/start" className="hover:text-white">Submit Report</Link></li>
                <li><Link href="/discover" className="hover:text-white">Today</Link></li>
                <li><Link href="/lab" className="hover:text-white">My Record</Link></li>
                <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
                <li><Link href="/about" className="hover:text-white">About</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/privacy" className="hover:text-white">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-white/5 text-center text-sm text-gray-500">
            <p>{'\u00A9'} {new Date().getFullYear()} <span className="font-brand text-white tracking-tight">Paradocs<span style={{color:'#9000F0'}}>.</span></span> All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

// Starfield component
function Starfield() {
  const [stars, setStars] = useState<Array<{ id: number; left: string; top: string; duration: string }>>([])

  useEffect(() => {
    const newStars = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      duration: `${2 + Math.random() * 4}s`,
    }))
    setStars(newStars)
  }, [])

  return (
    <div className="starfield">
      {stars.map((star) => (
        <div
          key={star.id}
          className="star"
          style={{
            left: star.left,
            top: star.top,
            '--duration': star.duration,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
