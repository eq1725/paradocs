'use client'

/**
 * Profile Page — Session A1: UX Consolidation
 *
 * Public researcher identity + account management.
 * Absorbs /dashboard/settings and /dashboard/subscription.
 *
 * Shows: username, rank, hypothesis count, corroboration count
 * Links to: subscription management, settings, sign out
 *
 * SWC: Uses var + function(){} for compatibility.
 */

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  User,
  Settings,
  CreditCard,
  LogOut,
  LogIn,
  Shield,
  Lightbulb,
  GitBranch,
  ChevronRight,
  Lock,
  Telescope,
  BookOpen,
  ExternalLink,
  Info,
  FileText,
} from 'lucide-react'
import { Avatar } from '@/components/AvatarSelector'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'
import NotificationToggle from '@/components/NotificationToggle'
// V9.6 T1.1 — shared secondary nav across the account surface.
import AccountNav from '@/components/account/AccountNav'
// V11.17.42 — two-axis Standing system per panel memo
// (docs/BADGE_SYSTEM_PANEL.md). Replaces the placeholder
// Observer/Investigator/Senior Researcher/Field Agent rank.
import StandingPills from '@/components/profile/StandingPills'
import LabMark from '@/components/profile/LabMark'
import type { StandingDisplay, StandingProgress } from '@/lib/standing/types'

export default function ProfilePage() {
  var router = useRouter()
  var [user, setUser] = useState<any>(null)
  var [loading, setLoading] = useState(true)
  /**
   * V9.5 P1.4 — replaced hypothesis/corroboration counts (which we
   * never tracked) with Saved / Reports / Streak / Joined. Streak
   * comes from /api/user/stats.streak.current; Joined is the year of
   * the profile's created_at.
   */
  var [stats, setStats] = useState({
    saved_count: 0,
    report_count: 0,
    streak_days: 0,
    joined_year: '' as string | number,
  })
  // V11.17.42 — Standing (two-axis pills + prose progression line).
  // Loaded from /api/standing/me; null while fetching, defaults to
  // tier 1 / 1 once loaded if the user has no row yet.
  var [standingDisplay, setStandingDisplay] = useState<StandingDisplay | null>(null)
  var [standingProgress, setStandingProgress] = useState<{
    catalogue: StandingProgress
    contribution: StandingProgress
  } | null>(null)

  useEffect(function() {
    function loadProfile() {
      supabase.auth.getSession().then(function(result) {
        var session = result.data.session
        if (!session) {
          setLoading(false)
          return
        }

        // Fetch profile
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
          .then(function(profileResult) {
            setUser(profileResult.data)
            setLoading(false)
          })

        // V9.5 P1.4 — read the actual nested shape returned by
        // /api/user/stats. The old code was reading top-level
        // {saved_count, report_count, hypothesis_count} fields that
        // don't exist on the response, so the box always showed zeros.
        fetch('/api/user/stats', {
          headers: { Authorization: 'Bearer ' + session.access_token }
        })
          .then(function(res) {
            if (res.ok) return res.json()
            return null
          })
          .then(function(data) {
            if (data) {
              var memberSince = data.profile && data.profile.member_since
              var joinedYear: string | number = ''
              if (memberSince) {
                var d = new Date(memberSince)
                if (!isNaN(d.getTime())) joinedYear = d.getUTCFullYear()
              }
              setStats(function(prev) {
                return {
                  saved_count: (data.saved && data.saved.total) || prev.saved_count,
                  report_count: (data.reports && data.reports.total) || prev.report_count,
                  streak_days: (data.streak && data.streak.current) || prev.streak_days,
                  joined_year: joinedYear || prev.joined_year,
                }
              })
            }
          })
          .catch(function() { /* stats API may not exist yet, that's fine */ })

        // V11.17.42 — load Standing in parallel with stats.
        fetch('/api/standing/me', {
          headers: { Authorization: 'Bearer ' + session.access_token }
        })
          .then(function(res) { return res.ok ? res.json() : null })
          .then(function(data) {
            if (data && data.display) {
              setStandingDisplay(data.display)
              if (data.progress) setStandingProgress(data.progress)
            }
          })
          .catch(function() { /* standing API may not exist yet — fall back to silent */ })
      })
    }
    loadProfile()

    var authListener = supabase.auth.onAuthStateChange(function() {
      loadProfile()
    })
    return function() {
      authListener.data.subscription.unsubscribe()
    }
  }, [])

  var handleSignOut = useCallback(async function() {
    await supabase.auth.signOut()
    router.push('/')
  }, [router])

  if (loading) {
    return (
      <>
        <Head>
          <title>Profile | Paradocs</title>
        </Head>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    )
  }

  if (!user) {
    return (
      <>
        <Head>
          <title>Profile | Paradocs</title>
        </Head>
        <div className="max-w-lg mx-auto px-4 py-16 sm:py-24 text-center">
          <div className="p-4 bg-primary-600/20 rounded-full mx-auto w-fit mb-6">
            <Lock className="w-10 h-10 text-primary-400" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-3">Sign in to view your profile</h1>
          <p className="text-sm text-gray-400 mb-8">
            Your profile shows your research identity, stats, and account settings.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign in
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>{user.display_name || user.username || 'Profile'} | Paradocs</title>
      </Head>

      <AccountNav />

      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        {/* Profile card */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 sm:p-8 mb-6">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="flex-shrink-0">
              <Avatar
                avatar={user.avatar_url}
                fallback={user.display_name || user.username}
                size="xl"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">
                {user.display_name || user.username || 'Researcher'}
                {/* V11.17.42 — Lab subscriber diamond glyph next to
                    the name (separate lane from Standing pills). */}
                <LabMark show={!!(standingDisplay && standingDisplay.is_lab)} className="-ml-0.5" />
              </h1>
              {user.username && (
                <p className="text-sm text-gray-400">@{user.username}</p>
              )}
              {/* V11.17.42 — two-axis Standing pills + prose progression.
                  Replaces the prior single-rank Award pill. Renders
                  the floor (Reader / Witness) immediately on load and
                  hydrates with real values when /api/standing/me
                  responds. */}
              <StandingPills
                display={standingDisplay || { catalogue_tier: 1, contribution_tier: 1, inline_label: null, is_lab: false }}
                progress={standingProgress}
              />
              {user.bio && (
                <p className="text-sm text-gray-300 mt-3 line-clamp-3">{user.bio}</p>
              )}
            </div>
          </div>

          {/* V9.5 P1.4 — Stats row. Dropped Hypotheses + Corroborations
              (never tracked in our model) for Streak + Joined, which
              actually reflect researcher activity + tenure. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-800">
            <StatBox label="Saved" value={stats.saved_count} />
            <StatBox label="Reports" value={stats.report_count} />
            <StatBox
              label={stats.streak_days === 1 ? 'Day streak' : 'Day streak'}
              value={stats.streak_days}
            />
            <StatBox
              label="Joined"
              value={stats.joined_year || '—'}
            />
          </div>
        </div>

        {/* Quick links section */}
        <div className="space-y-2">
          {/* V9.4.2 — Admin shortcut. Only renders for admin users so
              regular accounts don't see it. Reaches /admin where the
              full admin nav (Anchor Cases, Push Test, etc.) lives. */}
          {user.role === 'admin' && (
            <ProfileLink
              href="/admin"
              icon={Shield}
              label="Admin Dashboard"
              description="Catalog, ingestion, anchor cases, push tests"
            />
          )}
          {/* V9.4.8 — Push notification status row. Hides itself on
              browsers without push support. */}
          <NotificationToggle mode="row" />
          {/* V9.5 P3.1 — /account/* is canonical. /dashboard/* still
              works via 302 redirect in next.config.js. */}
          <ProfileLink
            href="/account/settings"
            icon={Settings}
            label="Account Settings"
            description="Profile, notifications, privacy"
          />
          <ProfileLink
            href="/account/subscription"
            icon={CreditCard}
            label="Subscription"
            description="Manage your plan and billing"
          />
          <ProfileLink
            href={'/researcher/' + (user.username || user.id)}
            icon={ExternalLink}
            label="Public Profile"
            description="View how others see your profile"
          />
          <ProfileLink
            href="/lab"
            icon={Telescope}
            label="My Lab"
            description="Research workspace, saves, and notes"
          />

          {/* About & Legal — accessible on mobile since footer is hidden */}
          <div className="pt-4 mt-4 border-t border-gray-800 md:hidden">
            <div className="flex items-center gap-4 px-1 mb-3">
              <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-600">About & Legal</span>
            </div>
            <div className="space-y-2">
              <ProfileLink
                href="/about"
                icon={Info}
                label="About Paradocs"
                description="Our mission and team"
              />
              <ProfileLink
                href="/privacy"
                icon={Shield}
                label="Privacy Policy"
                description="How we handle your data"
              />
              <ProfileLink
                href="/terms"
                icon={FileText}
                label="Terms of Service"
                description="Usage terms and conditions"
              />
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-4 w-full p-4 bg-gray-900/80 border border-gray-800 rounded-xl hover:bg-red-950/20 hover:border-red-800/30 transition-all group"
          >
            <div className="p-2 bg-gray-800 rounded-lg group-hover:bg-red-900/30 transition-colors">
              <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-400 transition-colors" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-gray-300 group-hover:text-red-300 transition-colors">Sign Out</p>
            </div>
          </button>
        </div>
      </div>
    </>
  )
}

function StatBox(props: { label: string; value: number | string }) {
  return (
    <div className="text-center">
      <p className="text-lg sm:text-xl font-bold text-white">{props.value}</p>
      <p className="text-xs text-gray-500">{props.label}</p>
    </div>
  )
}

function ProfileLink(props: {
  href: string
  icon: React.ElementType
  label: string
  description: string
}) {
  var Icon = props.icon
  return (
    <Link
      href={props.href}
      className="flex items-center gap-4 p-4 bg-gray-900/80 border border-gray-800 rounded-xl hover:border-primary-600/30 hover:bg-gray-900 transition-all group"
    >
      <div className="p-2 bg-gray-800 rounded-lg group-hover:bg-primary-600/20 transition-colors">
        <Icon className="w-5 h-5 text-gray-400 group-hover:text-primary-400 transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{props.label}</p>
        <p className="text-xs text-gray-500">{props.description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
    </Link>
  )
}
