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
 */

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Search, Home, Compass, Map, PlusCircle,
  BookOpen, Sparkles, Flame,
  User, LogOut, LogIn, Settings, LayoutDashboard
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { Avatar } from '@/components/AvatarSelector'
import NavigationHelper from '@/components/NavigationHelper'
import { MobileBottomTabs } from '@/components/mobile/MobileBottomTabs'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter()
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    checkUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkUser()
    })
    return () => subscription.unsubscribe()
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
      } else {
        setUser(null)
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
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`)
    }
  }

  // Main navigation - core browse experience first, discovery/insights as bookends
  const navigation = [
    { name: 'Explore', href: '/explore', icon: Compass },
    { name: 'Map', href: '/map', icon: Map },
    { name: 'Encyclopedia', href: '/phenomena', icon: BookOpen },
    { name: 'Insights', href: '/insights', icon: Sparkles },
    { name: 'Discover', href: '/discover', icon: Flame },
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
              <span className="font-sans font-black text-xl sm:text-2xl text-white tracking-tight whitespace-nowrap">Paradocs<span className="text-primary-500">.</span></span>
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

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="hidden md:block flex-1 max-w-md mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search phenomena..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
            </form>

            {/* Right section */}
            <div className="flex items-center gap-3">
              {/* Submit button — desktop only, secondary styling (not a core CTA) */}
              <Link
                href="/submit"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                Submit
              </Link>

              {/* User menu */}
              {!loading && (
                user ? (
                  <>
                    {/* Mobile: Simple link to dashboard */}
                    <Link
                      href="/dashboard"
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
                        <Link href="/dashboard" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10">
                          <LayoutDashboard className="w-4 h-4" />
                          Dashboard
                        </Link>
                        <Link href="/dashboard/settings" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10">
                          <User className="w-4 h-4" />
                          Profile
                        </Link>
                        <Link href="/dashboard/settings" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10">
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
                  <Link
                    href="/login"
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white bg-white/10 border border-white/15 hover:bg-primary-600 hover:border-primary-500 transition-all"
                  >
                    <LogIn className="w-4 h-4" />
                    Sign in
                  </Link>
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

      {/* Main content - accounts for header + safe area (Dynamic Island) + bottom nav */}
      <main className="main-content-pt pb-20 md:pb-0 min-h-screen">
        {children}
      </main>

      {/* Footer - extra bottom padding on mobile for bottom nav */}
      <footer className="border-t border-white/5 bg-black/30 backdrop-blur pb-20 md:pb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="inline-block mb-4">
                <span className="font-sans font-black text-2xl text-white tracking-tight">Paradocs<span className="text-primary-500">.</span></span>
              </Link>
              <p className="text-sm text-gray-500">
                The world's largest database of paranormal phenomena. Where mysteries meet discovery.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-white mb-4">Explore</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/explore?category=ufo_uap" className="hover:text-white">UFO Sightings</Link></li>
                <li><Link href="/explore?category=cryptid" className="hover:text-white">Cryptids</Link></li>
                <li><Link href="/explore?category=ghost_haunting" className="hover:text-white">Ghosts</Link></li>
                <li><Link href="/map" className="hover:text-white">Interactive Map</Link></li>
                <li><Link href="/insights" className="hover:text-white">Pattern Insights</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-4">Community</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/submit" className="hover:text-white">Submit Report</Link></li>
                <li><Link href="/analytics" className="hover:text-white">Analytics</Link></li>
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
            <p>{'\u00A9'} {new Date().getFullYear()} <span className="font-sans font-black text-white tracking-tight">Paradocs<span className="text-primary-500">.</span></span> All rights reserved.</p>
            <p className="mt-2 text-xs text-gray-600">As an Amazon Associate, Paradocs earns from qualifying purchases.</p>
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
