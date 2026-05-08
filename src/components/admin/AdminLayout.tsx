'use client'

/**
 * AdminLayout — V9.8 unified shell for /admin/*.
 *
 * Replaces the per-page mastheads + back-links that had drifted across
 * 7 admin pages (different max-w-*, mix of <a>/<Link>, inconsistent
 * 'Back to Admin' copy). Provides:
 *
 *   - Persistent admin sub-nav with 7 pills:
 *       Overview · Reports · Media · Avatars · Anchors · A/B · Push
 *   - Active-pill state via aria-current="page"
 *   - Pending-count badges (e.g. "Avatars 3") fetched from
 *     /api/admin/queue-counts. Polls every 60s.
 *   - Sticky just below the global Layout header (h-14/h-16)
 *   - Mobile: horizontal-scroll pills, no left sidebar
 *   - Page kicker (title + subtitle) above content
 *   - max-w-7xl content area for dashboard-style pages,
 *     max-w-6xl when `narrow` prop is set (tool pages)
 *
 * Auth gate: client-side admin check via session.
 *
 * SWC-friendly: var, function expressions, string concat.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  LayoutDashboard, FileText, Image as ImageIcon, UserCircle, Anchor, FlaskConical, Bell, Loader2, Shield,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface AdminLayoutProps {
  /** Page title — rendered as the kicker H1. */
  title: string
  /** Optional kicker subtitle (1-line, gray-400). */
  subtitle?: string
  /** Use max-w-6xl instead of the dashboard-default max-w-7xl. */
  narrow?: boolean
  children: React.ReactNode
}

interface NavPill {
  href: string
  label: string
  icon: React.ElementType
  badgeKey?: 'reports' | 'media' | 'avatars' | 'anchors'
  match: (path: string) => boolean
}

var NAV_ITEMS: NavPill[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, match: (p) => p === '/admin' },
  { href: '/admin/report-review', label: 'Reports', icon: FileText, badgeKey: 'reports', match: (p) => p.indexOf('/admin/report-review') === 0 },
  { href: '/admin/media-review', label: 'Media', icon: ImageIcon, badgeKey: 'media', match: (p) => p.indexOf('/admin/media-review') === 0 },
  { href: '/admin/avatar-review', label: 'Avatars', icon: UserCircle, badgeKey: 'avatars', match: (p) => p.indexOf('/admin/avatar-review') === 0 },
  { href: '/admin/anchor-cases', label: 'Anchors', icon: Anchor, match: (p) => p.indexOf('/admin/anchor-cases') === 0 },
  { href: '/admin/ab-testing', label: 'A/B', icon: FlaskConical, match: (p) => p.indexOf('/admin/ab-testing') === 0 },
  { href: '/admin/push-test', label: 'Push', icon: Bell, match: (p) => p.indexOf('/admin/push-test') === 0 },
]

interface QueueCounts {
  reports: number
  media: number
  avatars: number
  anchors: number
}

export default function AdminLayout(props: AdminLayoutProps) {
  var router = useRouter()
  var [counts, setCounts] = useState<QueueCounts>({ reports: 0, media: 0, avatars: 0, anchors: 0 })
  var [authLoading, setAuthLoading] = useState(true)
  var [authorized, setAuthorized] = useState(false)

  // Admin auth check.
  useEffect(function () {
    var cancelled = false
    async function check() {
      try {
        var { data: { session } } = await supabase.auth.getSession()
        if (!session) { if (!cancelled) { setAuthorized(false); setAuthLoading(false) }; return }
        var { data: profile } = await (supabase
          .from('profiles') as any)
          .select('role')
          .eq('id', session.user.id)
          .single()
        if (cancelled) return
        var isAdmin = !!profile && (profile as any).role === 'admin'
        setAuthorized(isAdmin)
      } catch {
        if (!cancelled) setAuthorized(false)
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }
    check()
    return function () { cancelled = true }
  }, [])

  // Fetch + poll queue counts.
  useEffect(function () {
    if (!authorized) return
    var cancelled = false
    var timer: any
    async function fetchCounts() {
      try {
        var { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        var resp = await fetch('/api/admin/queue-counts', {
          headers: { Authorization: 'Bearer ' + session.access_token },
        })
        if (!resp.ok) return
        var data = await resp.json()
        if (!cancelled) setCounts(data)
      } catch { /* silent */ }
    }
    fetchCounts()
    timer = setInterval(fetchCounts, 60000) // poll every 60s
    return function () { cancelled = true; clearInterval(timer) }
  }, [authorized])

  // Loading state — render nothing dramatic, just a spinner.
  if (authLoading) {
    return (
      <>
        <Head><title>{props.title} · Admin · Paradocs</title></Head>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      </>
    )
  }

  if (!authorized) {
    return (
      <>
        <Head><title>Admin · Paradocs</title></Head>
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <div className="inline-flex w-12 h-12 rounded-full bg-red-950/30 border border-red-900/50 items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-red-300" />
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">Admin access required</h1>
            <p className="text-sm text-gray-400 mb-6">
              Sign in with an admin account to access this page.
            </p>
            <Link href="/login" className="text-sm text-purple-400 hover:text-purple-300 underline">
              Sign in
            </Link>
          </div>
        </div>
      </>
    )
  }

  function badgeFor(item: NavPill): number {
    if (!item.badgeKey) return 0
    return counts[item.badgeKey] || 0
  }

  return (
    <>
      <Head><title>{props.title} · Admin · Paradocs</title></Head>

      {/* Sub-nav — sticky just below the global Layout header (h-14
          mobile / h-16 desktop). Same pattern as AccountNav on
          /account/*. */}
      <nav
        aria-label="Admin sections"
        className="sticky top-14 md:top-16 z-20 bg-gray-950/95 backdrop-blur-md border-b border-gray-800/70"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-1 sm:gap-1.5 -mb-px overflow-x-auto scrollbar-none">
            {NAV_ITEMS.map(function (item) {
              var active = item.match(router.pathname)
              var Icon = item.icon
              var badge = badgeFor(item)
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
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span>{item.label}</span>
                  {badge > 0 && (
                    <span
                      className={
                        'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-semibold ' +
                        (active
                          ? 'bg-purple-500/30 text-purple-100'
                          : 'bg-amber-500/20 text-amber-200')
                      }
                      aria-label={badge + ' pending'}
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
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

      {/* Page content */}
      <div className={(props.narrow ? 'max-w-6xl' : 'max-w-7xl') + ' mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24'}>
        {/* Kicker masthead */}
        <div className="mb-6">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 mb-1">Admin · Command Center</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{props.title}</h1>
          {props.subtitle && (
            <p className="text-sm text-gray-400 mt-1">{props.subtitle}</p>
          )}
        </div>

        {props.children}
      </div>
    </>
  )
}
