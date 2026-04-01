'use client'

/**
 * Lab Page — Session A1: UX Consolidation
 *
 * Single tabbed view replacing all /dashboard/* routes.
 * 4 horizontal tabs: Saves | Cases | Map | Notes
 *
 * Absorbs:
 * - /dashboard/saved → Saves tab
 * - /dashboard/research-hub, /dashboard/reports → Cases tab
 * - /dashboard/constellation → Map tab
 * - /dashboard/journal/* → Notes tab
 * - /dashboard/insights → inline AI insight cards in Saves
 * - /dashboard/digests → notification bell
 * - /dashboard/settings → gear icon → /profile
 *
 * Works for both authenticated and unauthenticated users.
 * SWC: Uses var + function(){} for compatibility with MobileBottomTabs imports.
 */

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  Bookmark,
  FolderOpen,
  Map as MapIcon,
  BookOpen,
  Settings,
  Bell,
  PlusCircle,
  Lock,
  Sparkles,
  ChevronDown,
  Search,
  Filter,
  Plus,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Telescope,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'

// Tab definitions
var TAB_KEYS = ['saves', 'cases', 'map', 'notes'] as const
type TabKey = typeof TAB_KEYS[number]

var TAB_CONFIG = {
  saves: { label: 'Saves', icon: Bookmark },
  cases: { label: 'Cases', icon: FolderOpen },
  map: { label: 'Map', icon: MapIcon },
  notes: { label: 'Notes', icon: BookOpen },
}

export default function LabPage() {
  var router = useRouter()
  var [activeTab, setActiveTab] = useState<TabKey>('saves')
  var [isLoggedIn, setIsLoggedIn] = useState(false)
  var [userProfile, setUserProfile] = useState<any>(null)
  var [loading, setLoading] = useState(true)

  // Read tab from URL query
  useEffect(function() {
    var tabFromQuery = router.query.tab as string
    if (tabFromQuery && TAB_KEYS.includes(tabFromQuery as TabKey)) {
      setActiveTab(tabFromQuery as TabKey)
    }
  }, [router.query.tab])

  // Auth check
  useEffect(function() {
    function checkAuth() {
      supabase.auth.getSession().then(function(result) {
        var session = result.data.session
        setIsLoggedIn(!!session)
        if (session) {
          supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
            .then(function(profileResult) {
              setUserProfile(profileResult.data)
              setLoading(false)
            })
        } else {
          setLoading(false)
        }
      })
    }
    checkAuth()
    var authListener = supabase.auth.onAuthStateChange(function() {
      checkAuth()
    })
    return function() {
      authListener.data.subscription.unsubscribe()
    }
  }, [])

  // Update URL when tab changes (shallow)
  var handleTabChange = useCallback(function(tab: TabKey) {
    setActiveTab(tab)
    router.replace('/lab?tab=' + tab, undefined, { shallow: true })
  }, [router])

  return (
    <Layout>
      <Head>
        <title>Lab | Paradocs</title>
        <meta name="description" content="Your personal research lab — saves, cases, constellation map, and notes." />
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Header row: title + actions */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-600/20 rounded-lg">
              <Telescope className="w-5 h-5 sm:w-6 sm:h-6 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Lab</h1>
              <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Your personal research workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Submit Report link */}
            <Link
              href="/submit"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-primary-400 bg-primary-600/10 border border-primary-600/20 hover:bg-primary-600/20 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Submit Report</span>
            </Link>

            {/* Notification bell */}
            <button
              className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Notifications — coming soon"
            >
              <Bell className="w-5 h-5" />
              {/* Future: notification badge */}
            </button>

            {/* Settings gear → profile */}
            <Link
              href="/profile"
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-800 mb-6 overflow-x-auto scrollbar-hide">
          {TAB_KEYS.map(function(tabKey) {
            var config = TAB_CONFIG[tabKey]
            var Icon = config.icon
            var isActive = activeTab === tabKey
            return (
              <button
                key={tabKey}
                onClick={function() { handleTabChange(tabKey) }}
                className={classNames(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  isActive
                    ? 'border-primary-500 text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700'
                )}
              >
                <Icon className="w-4 h-4" />
                {config.label}
              </button>
            )
          })}
        </div>

        {/* Auth gate for unauthenticated users */}
        {!isLoggedIn && !loading ? (
          <UnauthenticatedPrompt />
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          /* Tab content */
          <div>
            {activeTab === 'saves' && <SavesTab />}
            {activeTab === 'cases' && <CasesTab />}
            {activeTab === 'map' && <MapTab />}
            {activeTab === 'notes' && <NotesTab />}
          </div>
        )}
      </div>
    </Layout>
  )
}

/** Unauthenticated state — sign-in prompt */
function UnauthenticatedPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
      <div className="p-4 bg-primary-600/20 rounded-full mb-6">
        <Lock className="w-10 h-10 text-primary-400" />
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-3">
        Sign in to access your Lab
      </h2>
      <p className="text-gray-400 max-w-md mb-8 text-sm sm:text-base">
        Your Lab is your personal research workspace. Save reports, build case files,
        explore your constellation map, and keep investigation notes — all in one place.
      </p>
      <Link
        href="/login"
        className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-colors"
      >
        <LogIn className="w-4 h-4" />
        Sign in to get started
      </Link>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// SAVES TAB — grid of saved reports with filter by category
// Placeholder for inline AI insight cards
// ─────────────────────────────────────────────────────────────────

function SavesTab() {
  var [savedReports, setSavedReports] = useState<any[]>([])
  var [loading, setLoading] = useState(true)
  var [filterCategory, setFilterCategory] = useState<string>('All')
  var [total, setTotal] = useState(0)
  var [page, setPage] = useState(1)
  var limit = 12

  var categories = ['All', 'UFO/UAP', 'Cryptid', 'Ghost', 'NDE', 'Psychic', 'Unexplained']

  var fetchSaved = useCallback(async function() {
    setLoading(true)
    var sessionResult = await supabase.auth.getSession()
    var token = sessionResult.data.session?.access_token
    if (!token) { setLoading(false); return }

    try {
      var url = '/api/user/saved?page=' + page + '&limit=' + limit
      if (filterCategory && filterCategory !== 'All') {
        url += '&category=' + encodeURIComponent(filterCategory)
      }
      var res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + token }
      })
      if (res.ok) {
        var data = await res.json()
        setSavedReports(data.saved || [])
        setTotal(data.total || 0)
      }
    } catch (err) {
      console.error('Error fetching saved:', err)
    } finally {
      setLoading(false)
    }
  }, [page, filterCategory])

  useEffect(function() {
    fetchSaved()
  }, [fetchSaved])

  var totalPages = Math.ceil(total / limit)

  return (
    <div>
      {/* AI Insight card placeholder */}
      <div className="mb-6 p-4 bg-gradient-to-r from-primary-900/30 to-purple-900/20 border border-primary-700/30 rounded-xl">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-primary-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">AI Insights</p>
            <p className="text-xs text-gray-400 mt-1">
              Save 10+ reports and our AI will start detecting patterns in your collection.
              Hypothesis suggestions will appear here.
            </p>
          </div>
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map(function(cat) {
          return (
            <button
              key={cat}
              onClick={function() { setFilterCategory(cat); setPage(1) }}
              className={classNames(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                filterCategory === cat
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
              )}
            >
              {cat}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : savedReports.length === 0 ? (
        <div className="text-center py-16">
          <Bookmark className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No saved reports yet</h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">
            Browse the Feed and save reports that interest you. Your collection will grow here.
          </p>
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-primary-400 bg-primary-600/10 border border-primary-600/20 hover:bg-primary-600/20 transition-colors"
          >
            Browse the Feed
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedReports.map(function(item: any) {
              var report = item.report || item
              return (
                <Link
                  key={report.id || item.id}
                  href={'/report/' + (report.slug || report.id)}
                  className="group block p-4 bg-gray-900/80 border border-gray-800 rounded-xl hover:border-primary-600/40 hover:bg-gray-900 transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary-600/20 text-primary-400">
                      {report.category || 'Unknown'}
                    </span>
                    <Bookmark className="w-4 h-4 text-primary-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white group-hover:text-primary-300 transition-colors line-clamp-2 mb-1">
                    {report.title || 'Untitled Report'}
                  </h3>
                  {report.location && (
                    <p className="text-xs text-gray-500">{report.location}</p>
                  )}
                  {report.feed_hook && (
                    <p className="text-xs text-gray-400 mt-2 line-clamp-2">{report.feed_hook}</p>
                  )}
                </Link>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={function() { setPage(Math.max(1, page - 1)) }}
                disabled={page <= 1}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={function() { setPage(Math.min(totalPages, page + 1)) }}
                disabled={page >= totalPages}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// CASES TAB — Case files + submitted reports (Coming soon for Core+)
// ─────────────────────────────────────────────────────────────────

function CasesTab() {
  return (
    <div className="text-center py-16 sm:py-24">
      <div className="p-4 bg-blue-600/10 rounded-full mx-auto w-fit mb-6">
        <FolderOpen className="w-10 h-10 text-blue-400" />
      </div>
      <h3 className="text-lg sm:text-xl font-bold text-white mb-3">
        Case Files & Research Hub
      </h3>
      <p className="text-sm text-gray-400 max-w-md mx-auto mb-4">
        Build detailed case files, organize artifacts, and manage your submitted reports.
        Cross-reference evidence across multiple sightings.
      </p>
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/10 border border-blue-600/20 text-blue-400 text-sm font-medium">
        <Lock className="w-4 h-4" />
        Coming soon for Core+ subscribers
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// MAP TAB — Constellation mind-map (Coming soon for Pro)
// ─────────────────────────────────────────────────────────────────

function MapTab() {
  return (
    <div className="text-center py-16 sm:py-24">
      <div className="p-4 bg-purple-600/10 rounded-full mx-auto w-fit mb-6">
        <MapIcon className="w-10 h-10 text-purple-400" />
      </div>
      <h3 className="text-lg sm:text-xl font-bold text-white mb-3">
        Constellation Map
      </h3>
      <p className="text-sm text-gray-400 max-w-md mx-auto mb-4">
        Visualize your research as an interactive star map. Each saved report becomes a star,
        connected by shared tags, themes, and AI-detected patterns.
      </p>
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600/10 border border-purple-600/20 text-purple-400 text-sm font-medium">
        <Lock className="w-4 h-4" />
        Coming soon for Pro subscribers
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// NOTES TAB — Journal entries with inline create/edit
// ─────────────────────────────────────────────────────────────────

function NotesTab() {
  var [entries, setEntries] = useState<any[]>([])
  var [loading, setLoading] = useState(true)
  var [total, setTotal] = useState(0)
  var [page, setPage] = useState(1)
  var [search, setSearch] = useState('')
  var [searchInput, setSearchInput] = useState('')
  var limit = 10

  var fetchEntries = useCallback(async function() {
    setLoading(true)
    try {
      // Use the journal service API
      var sessionResult = await supabase.auth.getSession()
      var token = sessionResult.data.session?.access_token
      if (!token) { setLoading(false); return }

      var url = '/api/user/journal?page=' + page + '&limit=' + limit
      if (search) {
        url += '&search=' + encodeURIComponent(search)
      }

      var res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + token }
      })
      if (res.ok) {
        var data = await res.json()
        setEntries(data.entries || [])
        setTotal(data.total || 0)
      }
    } catch (err) {
      console.error('Error fetching journal entries:', err)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(function() {
    fetchEntries()
  }, [fetchEntries])

  var totalPages = Math.ceil(total / limit)

  var handleSearch = function(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  return (
    <div>
      {/* Search + New Entry row */}
      <div className="flex items-center gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchInput}
              onChange={function(e) { setSearchInput(e.target.value) }}
              className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-600 transition-colors"
            />
          </div>
        </form>
        <Link
          href="/dashboard/journal/new"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Note</span>
        </Link>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No notes yet</h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">
            Keep an investigation journal. Record observations, link reports, and track your research.
          </p>
          <Link
            href="/dashboard/journal/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create your first note
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {entries.map(function(entry: any) {
              return (
                <Link
                  key={entry.id}
                  href={'/dashboard/journal/' + entry.id}
                  className="block p-4 bg-gray-900/80 border border-gray-800 rounded-xl hover:border-primary-600/40 hover:bg-gray-900 transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-white line-clamp-1">
                      {entry.title || 'Untitled Note'}
                    </h3>
                    <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                      {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                  {entry.content && (
                    <p className="text-xs text-gray-400 line-clamp-2">{entry.content}</p>
                  )}
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {entry.tags.slice(0, 3).map(function(tag: string) {
                        return (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                            {tag}
                          </span>
                        )
                      })}
                      {entry.tags.length > 3 && (
                        <span className="text-[10px] text-gray-500">+{entry.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={function() { setPage(Math.max(1, page - 1)) }}
                disabled={page <= 1}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={function() { setPage(Math.min(totalPages, page + 1)) }}
                disabled={page >= totalPages}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
