'use client'

/**
 * AccountNav — V9.6 secondary nav for the account surface.
 *
 * Sits below the global Layout header and shows three primary
 * destinations (Profile · Settings · Subscription) with an active
 * underline matching the current route. Wraps in a max-w-3xl
 * container so it lines up with the page content below.
 *
 * Replaces the legacy DashboardLayout sidebar on /account/*. The
 * sidebar listed eight items (Overview, Research Hub, My Constellation,
 * Journal, Saved Reports, My Reports, Weekly Digests, AI Insights) all
 * of which 301 to /lab now per next.config.js — so users were clicking
 * dead links and ending up at the same page repeatedly.
 *
 * SWC: var, function expressions, string concat.
 */

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { User, Settings, CreditCard } from 'lucide-react'

interface AccountNavProps {
  /**
   * Optional: render compact (icon-only) on narrow screens so we don't
   * fight the global header for horizontal space. Defaults to true.
   */
  compactOnMobile?: boolean
  /**
   * V9.6.2 — optional secondary row stacked directly under the
   * tab strip and inside the same sticky container. Used by the
   * Settings page for the in-page anchor pills (Profile /
   * Notifications / Privacy / etc.). Stacking them inside the
   * same sticky element eliminates the visual gap that appeared
   * when AccountNav and the pills were separate sticky elements.
   */
  children?: React.ReactNode
}

var ITEMS = [
  { href: '/profile', label: 'Profile', icon: User, match: function (p: string) { return p === '/profile' } },
  { href: '/account/settings', label: 'Settings', icon: Settings, match: function (p: string) { return p.indexOf('/account/settings') === 0 || p === '/dashboard/settings' } },
  { href: '/account/subscription', label: 'Subscription', icon: CreditCard, match: function (p: string) { return p.indexOf('/account/subscription') === 0 || p === '/dashboard/subscription' } },
]

export default function AccountNav(props: AccountNavProps) {
  var router = useRouter()
  var compact = props.compactOnMobile !== false

  return (
    // V9.6.2 — sticky container holds BOTH the tab strip and any
    // optional `children` (e.g. the in-page anchor pills on /account/
    // settings) so they scroll as one unit. Eliminates the visual
    // gap that appeared when AccountNav and the pills were separate
    // sticky elements at fragile pixel offsets. One opaque background
    // + one bottom border, no in-between transparency for content to
    // peek through.
    <div
      className="sticky top-14 md:top-16 z-20 bg-gray-950/95 backdrop-blur-md border-b border-gray-800/70"
    >
      <nav aria-label="Account sections">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-1 sm:gap-2 -mb-px overflow-x-auto scrollbar-none">
            {ITEMS.map(function (item) {
              var active = item.match(router.pathname)
              var Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'relative inline-flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ' +
                    (active
                      ? 'text-white'
                      : 'text-gray-400 hover:text-gray-200')
                  }
                >
                  <Icon className={'w-4 h-4 ' + (compact ? '' : 'sm:hidden')} aria-hidden="true" />
                  <span className={compact ? 'hidden sm:inline' : ''}>{item.label}</span>
                  {active && (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-purple-500 rounded-full"
                      aria-hidden="true"
                    />
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>
      {props.children && (
        <div className="border-t border-gray-800/40">
          {props.children}
        </div>
      )}
    </div>
  )
}
