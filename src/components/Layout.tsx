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

  const navigation = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Explore', href: '/explore', icon: Compass },
    { name: 'Encyclopedia', href: '/phenomena', icon: BookOpen },
    { name: 'Map', href: '/map', icon: Map },
    { name: 'Insights', href: '/insights', icon: Sparkles },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  ]

  return (
    <div className="min-h-screen">
      {/* Starfield background */}
      <Starfield />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/30 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center mr-8">
              <span className="font-sans font-black text-2xl text-white tracking-tight">Paradocs</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => {
                const isActive = router.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={classNames(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    )}
                  >
                    <item.icon className="w-4 h-4" />
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
                  <div className="relative group">
                    <button className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 transition-colors">
                      <Avatar
                        avatar={user.avatar_url}
                        fallback={user.display_name || user.username}
                        size="md"
                      />
                    </button>
                    <div className="absolute right-0 top-full mt-2 w-48 py-2 bg-gray-900/95 backdrop-blur border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
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

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-white/10"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/5 bg-black/50 backdrop-blur-xl">
            <div className="px-4 py-4 space-y-2">
              <form onSubmit={handleSearch} className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search phenomena..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm"
                  />
                </div>
              </form>
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/10"
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              ))}
              {user && (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/10"
                >
                  <LayoutDashboard className="w-5 h-5" />
                  Dashboard
                </Link>
              )}
              <Link
                href="/submit"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary-600 text-white"
              >
                <PlusCircle className="w-5 h-5" />
                Submit Report
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="pt-16 min-h-screen">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-black/30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="inline-block mb-4">
                <span className="font-display font-bold text-xl text-white tracking-tight">Paradocs</span>
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
            © {new Date().getFullYear()} Paradocs. All rights reserved.
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
