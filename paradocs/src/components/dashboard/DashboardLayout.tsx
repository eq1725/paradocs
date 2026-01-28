/**
 * DashboardLayout Component
 *
 * Wrapper layout for all dashboard pages with sidebar navigation.
 */

import React, { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  LayoutDashboard,
  FileText,
  Bookmark,
  Sparkles,
  CreditCard,
  Settings,
  ChevronLeft,
  LogOut,
  Bell
} from 'lucide-react'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { TierBadge } from './TierBadge'
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

  return (
    <>
      <Head>
        <title>{title} | ParaDocs</title>
      </Head>

      <div className="min-h-screen bg-gray-950 flex">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
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
              <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
                {subscription?.tier?.display_name?.[0] || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {loading ? 'Loading...' : 'My Account'}
                </p>
                {tierName && (
                  <TierBadge tier={tierName} size="sm" />
                )}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4">
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
                        className={`
                          flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
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
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 cursor-not-allowed"
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
        <main className="flex-1 flex flex-col">
          {/* Top Bar */}
          <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
            <h1 className="text-xl font-semibold text-white">{title}</h1>
            <div className="flex items-center gap-4">
              <button className="p-2 text-gray-400 hover:text-white transition-colors relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-purple-500 rounded-full"></span>
              </button>
            </div>
          </header>

          {/* Page Content */}
          <div className="flex-1 p-6 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </>
  )
}

export default DashboardLayout
