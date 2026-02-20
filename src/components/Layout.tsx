'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Search, Menu, X, Home, Compass, Map, PlusCircle,
  BarChart3, User, LogOut, LogIn, Settings, LayoutDashboard, BookOpen, Sparkles
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { Avatar } from '@/components/AvatarSelector'
import NavigationHelper from '@/components/NavigationHelper'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter()
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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

  // Main navigation - optimized for serial position effect (important items first/last)
  // Home removed (logo handles it), Analytics moved to footer/dashboard
  const navigation = [
    { name: 'Discover', href: '/discover', icon: Sparkles },
    { name: 'Explore', href: '/explore', icon: Compass },
    { name: 'Map', href: '/map', icon: Map },
    { name: 'Encyclopedia', href: '/phenomena', icon: BookOpen },
    { name: 'Insights', href: '/insights', icon: Sparkles },
  ]

  return (
    <div className="min-h-screen">
      {/* Force hide desktop dropdown on mobile */}
      <MobileDropdownHide />

      {/* Starfield background */}
      <Starfield />

      {/* Header - safe-area-pt handles Dynamic Island in PWA mode */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/30 backdrop-blur-xl border-b border-white/5 safe-area-pt">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center mr-8">
              <span className="font-sans font-black text-2xl text-white tracking-tight">Paradocs<span className="text-primary-500">.</span></span>
            </Link>

            {/* Desktop Navigation - Text only, no icons for cleaner look */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => {
                const isActive = router.pathname === item.href ||
                  (item.href !== '/' && router.pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={classNames(
                      'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                      isActive
                        ? 'bg-white/15 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    )}
                  >
                    {item.name}
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
              {/* Submit button */}
              <Link
                href="/submit"
                className="hidden sm:flex btn btn-primary text-sm"
              >
                <PlusCircle className="w-4 h-4" />
                Submit Report
              </Link>

              {/* User menu */}
              {!loading && (
                user ? (
                  <>
                    {/* Mobile: Simple link to dashboard (no dropdown) */}
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
                    {/* Desktop: Hover dropdown menu - HIDDEN ON MOBILE */}
                    <div className="desktop-user-dropdown relative group hidden md:block">
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
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    Sign in
                  </Link>
                )
              )}

              {/* Mobile menu button - hidden, bottom bar handles this */}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar - Always visible on mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-xl border-t border-white/10 safe-area-pb">
        <div className="flex items-center justify-around h-16">
          <Link
            href="/discover"
            className={classNames(
              'flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors',
              router.pathname === '/discover' || router.pathname.startsWith('/discover')
                ? 'text-primary-400'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-xs mt-1">Discover</span>
          </Link>
          <Link
            href="/map"
            className={classNames(
              'flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors',
              router.pathname === '/map'
                ? 'text-primary-400'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <Map className="w-5 h-5" />
            <span className="text-xs mt-1">Map</span>
          </Link>
          <Link
            href="/submit"
            className="flex flex-col items-center justify-center flex-1 h-full py-2"
          >
            <div className="flex items-center justify-center w-12 h-12 -mt-4 rounded-full bg-primary-600 text-white shadow-lg shadow-primary-600/30">
              <PlusCircle className="w-6 h-6" />
            </div>
          </Link>
          <Link
            href="/phenomena"
            className={classNames(
              'flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors',
              router.pathname === '/phenomena' || router.pathname.startsWith('/phenomena')
                ? 'text-primary-400'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-xs mt-1">Encyclopedia</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={classNames(
              'flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors',
              mobileMenuOpen ? 'text-primary-400' : 'text-gray-400 hover:text-white'
            )}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            <span className="text-xs mt-1">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile Slide-up Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Menu Panel */}
          <div
            className="absolute bottom-16 left-0 right-0 bg-gray-900/98 backdrop-blur-xl border-t border-white/10 rounded-t-2xl max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search */}
            <div className="p-4 border-b border-white/5">
              <form onSubmit={handleSearch}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search phenomena..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm"
                  />
                </div>
              </form>
            </div>

            {/* DISCOVER Section */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Discover</p>
              <div className="space-y-1">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Home className="w-5 h-5" />
                  <span>Home</span>
                </Link>
                <Link
                  href="/insights"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Sparkles className="w-5 h-5" />
                  <span>AI Insights</span>
                </Link>
                <Link
                  href="/analytics"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <BarChart3 className="w-5 h-5" />
                  <span>Analytics</span>
                </Link>
              </div>
            </div>

            {/* Divider */}
            <div className="mx-4 border-t border-white/5" />

            {/* MY PARADOCS Section */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">My Paradocs</p>
              <div className="space-y-1">
                {user ? (
                  <>
                    {/* User profile header */}
                    <div className="flex items-center gap-3 px-3 py-3 mb-2 bg-white/5 rounded-xl">
                      <Avatar
                        avatar={user.avatar_url}
                        fallback={user.display_name || user.username}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{user.display_name || user.username}</p>
                        <p className="text-xs text-gray-400 truncate">@{user.username}</p>
                      </div>
                    </div>
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <LayoutDashboard className="w-5 h-5" />
                      <span>Dashboard</span>
                    </Link>
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <Settings className="w-5 h-5" />
                      <span>Settings</span>
                    </Link>
                    <button
                      onClick={() => {
                        handleSignOut()
                        setMobileMenuOpen(false)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      <span>Sign out</span>
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <LogIn className="w-5 h-5" />
                    <span>Sign in</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Bottom padding for safe area */}
            <div className="h-4" />
          </div>
        </div>
      )}

      {/* Navigation helper: floating back button + scroll restoration */}
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
            ÃÂ© {new Date().getFullYear()} <span className="font-sans font-black text-white tracking-tight">Paradocs<span className="text-primary-500">.</span></span> All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

// Force hide desktop dropdown on mobile - CSS override
const MobileDropdownHide = () => (
  <style jsx global>{`
    @media (max-width: 767px) {
      .desktop-user-dropdown {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    }
  `}</style>
)

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
