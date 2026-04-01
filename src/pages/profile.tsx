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
  Award,
  ChevronRight,
  Lock,
  Telescope,
  BookOpen,
  ExternalLink,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { Avatar } from '@/components/AvatarSelector'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'

export default function ProfilePage() {
  var router = useRouter()
  var [user, setUser] = useState<any>(null)
  var [loading, setLoading] = useState(true)
  var [stats, setStats] = useState({
    saved_count: 0,
    report_count: 0,
    hypothesis_count: 0,
    corroboration_count: 0,
  })

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

        // Fetch basic stats (saved count, report count)
        fetch('/api/user/stats', {
          headers: { Authorization: 'Bearer ' + session.access_token }
        })
          .then(function(res) {
            if (res.ok) return res.json()
            return null
          })
          .then(function(data) {
            if (data) {
              setStats(function(prev) {
                return {
                  saved_count: data.saved_count || prev.saved_count,
                  report_count: data.report_count || prev.report_count,
                  hypothesis_count: data.hypothesis_count || prev.hypothesis_count,
                  corroboration_count: data.corroboration_count || prev.corroboration_count,
                }
              })
            }
          })
          .catch(function() { /* stats API may not exist yet, that's fine */ })
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
      <Layout>
        <Head>
          <title>Profile | Paradocs</title>
        </Head>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    )
  }

  if (!user) {
    return (
      <Layout>
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
      </Layout>
    )
  }

  // Determine rank based on saves (placeholder logic)
  var rank = 'Observer'
  if (stats.saved_count >= 50) rank = 'Investigator'
  if (stats.saved_count >= 100) rank = 'Senior Researcher'
  if (stats.report_count >= 10) rank = 'Field Agent'

  return (
    <Layout>
      <Head>
        <title>{user.display_name || user.username || 'Profile'} | Paradocs</title>
      </Head>

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
              </h1>
              {user.username && (
                <p className="text-sm text-gray-400">@{user.username}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-600/20 text-primary-400 text-xs font-medium">
                  <Award className="w-3 h-3" />
                  {rank}
                </span>
              </div>
              {user.bio && (
                <p className="text-sm text-gray-300 mt-3 line-clamp-3">{user.bio}</p>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-800">
            <StatBox label="Saved" value={stats.saved_count} />
            <StatBox label="Reports" value={stats.report_count} />
            <StatBox label="Hypotheses" value={stats.hypothesis_count} />
            <StatBox label="Corroborations" value={stats.corroboration_count} />
          </div>
        </div>

        {/* Quick links section */}
        <div className="space-y-2">
          <ProfileLink
            href="/dashboard/settings"
            icon={Settings}
            label="Account Settings"
            description="Profile, notifications, preferences"
          />
          <ProfileLink
            href="/dashboard/subscription"
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
    </Layout>
  )
}

function StatBox(props: { label: string; value: number }) {
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
