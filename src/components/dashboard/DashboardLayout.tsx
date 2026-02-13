/**
 * DashboardLayout Component
 *
 * Wrapper layout for all dashboard pages with responsive sidebar navigation.
 * Mobile: Bottom sheet navigation triggered by menu button
 * Desktop: Fixed sidebar
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
  Menu,
  X
} from 'lucide-react'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { TierBadge } from './TierBadge'
import { Avatar } from '@/components/AvatarSelector'
import { supabase } from '@/lib/supabase'

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

const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Overview',
    icon: LayoutDashboard
  },
  {
    href: '/dashboard/reports',
    label: 'My Reports',
    icon: FileText
  },
  {
    href: '/dashboard/saved',
    label: 'Saved Reports',
    icon: Bookmark
  },
  {
    href: '/dashboard/constellation',
    label: 'My Constellation',
    icon: Stars
  },
  {
    href: '/dashboard/journal',
    label: 'Journal',
    icon: BookOpen
  },
  {
    href: '/dashboard/digests',
    label: 'Weekly Reports',
    icon: Newspaper
  },
  {
    href: '/dashboard/insights',
    label: 'AI Insights',
    icon: Sparkles,
    requiredTier: ['basic', 'pro', 'enterprise']
  },
  {
    href: '/dashboard/subscription',
    label: 'Subscription',
    icon: CreditCard
  },
  {
    href: '/dashboard/settings',
    label: 'Settings',
    icon: Settings
  }
]

export function DashboardLayout({ children, title = 'Dashboard' }: DashboardLayoutProps) {
  const router = useRouter()
  const { subscription, tierName, tierDisplayName, loading } = useSubscription()
  const [userProfile, setUserProfile] = useState<{ avatar_url?: string | null; display_name?: string | null } | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Fetch user profile for avatar
  useEffect(() => {
    async function fetchProfile() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('avatar_url, display_name')
          .eq('id', session.user.id)
          .single()
        if (data) setUserProfile(data)
      }
    }
    fetchProfile()

    // Listen for profile updates from settings page
    const handleProfileUpdate = () => {
      fetchProfile()
    }
    window.addEventListener('profile-updated', handleProfileUpdate)
    return () => {
      window.removeEventListener('profile-updated', handleProfileUpdate)
    }
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [router.pathname])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActiveRoute = (href: string) => {
    if (href === '/dashboard') {
      return router.pathname === '/dashboard'
    }
    return router.pathname.startsWith(href)
  }

  const canAccessNavItem = (item: NavItem) => {
    if (!item.requiredTier) return true
    if (!tierName) return false
    return item.requiredTier.includes(tierName)
  }

  // Shared navigation content
  const NavContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <ul className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = isActiveRoute(item.href)
        const hasAccess = canAccessNavItem(item)

        return (
          <li key={item.href}>
            {hasAccess ? (
              <Link
                href={item.href}
                onClick={onItemClick}
                className={`
                  flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg transition-colors
                  ${isActive
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            ) : (
              <div
                className="flex items-center gap-3 px-3 py-3 md:py-2 rounded-lg text-gray-600 cursor-not-allowed"
                title={`Upgrade to ${item.requiredTier?.[0]} to access`}
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
  )

  return (
    <>
      <Head>
        <title>{title} | ParaDocs</title>
      </Head>

      <div className="min-h-screen bg-gray-950">
        {/* Safe area background - fills the notch/Dynamic Island area */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-gray-900 safe-area-background" />

        {/* Mobile Header - sits below safe area */}
        <header className="md:hidden fixed left-0 right-0 z-40 bg-gray-900 border-b border-gray-800 dashboard-mobile-header-positioned">
          <div className="flex items-center justify-between h-14 px-4">
            <Link href="/" className="flex items-center gap-2 text-white">
              <ChevronLeft className="w-4 h-4" />
              <span className="font-semibold">ParaDocs</span>
            </Link>
            <div className="flex items-center gap-2">
              <button className="p-2 text-gray-400 hover:text-white transition-colors relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-purple-500 rounded-full"></span>
              </button>
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Menu Overlay - higher z-index than header */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-[60]">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Slide-in Menu */}
            <div className="absolute top-0 right-0 bottom-0 w-72 bg-gray-900 border-l border-gray-800 flex flex-col animate-slide-in-right">
              {/* Menu Header */}
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <span className="font-semibold text-white">Menu</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
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
                <NavContent onItemClick={() => setMobileMenuOpen(false)} />
              </nav>

              {/* Footer */}
              <div className="p-4 border-t border-gray-800">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 px-3 py-3 w-full rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Desktop Layout */}
        <div className="flex">
          {/* Desktop Sidebar - Hidden on mobile */}
          <aside className="hidden md:flex w-64 bg-gray-900 border-r border-gray-800 flex-col fixed inset-y-0 left-0">
            {/* Logo */}
            <div className="p-4 border-b border-gray-800">
              <Link href="/" className="flex items-center gap-2 text-white hover:text-purple-400 transition-colors">
                <ChevronLeft className="w-4 h-4" />
                <span className="font-semibold">ParaDocs</span>
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
              <h1 className="text-xl font-semibold text-white">{title}</h1>
              <div className="flex items-center gap-4">
                <button className="p-2 text-gray-400 hover:text-white transition-colors relative">
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-purple-500 rounded-full"></span>
                </button>
              </div>
            </header>

            {/* Mobile Title Bar - pt-14 for header + safe-area-pt for notch */}
            <div className="md:hidden px-4 py-4 bg-gray-950 mobile-title-offset">
              <h1 className="text-xl font-semibold text-white">{title}</h1>
            </div>

            {/* Page Content */}
            <div className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Animation styles and safe area handling */}
      <style jsx global>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.2s ease-out;
        }
        /* Safe area background - fills Dynamic Island / notch area */
        .safe-area-background {
          height: env(safe-area-inset-top, 0px);
        }
        /* Dashboard mobile header: positioned below safe area */
        .dashboard-mobile-header-positioned {
          top: env(safe-area-inset-top, 0px);
        }
        /* Mobile title offset: header height (56px) + safe area for notch */
        .mobile-title-offset {
          padding-top: calc(3.5rem + env(safe-area-inset-top, 0px));
        }
      `}</style>
    </>
  )
}

export default DashboardLayout
