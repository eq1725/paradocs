'use client'

import React, { useState, useEffect } from 'react'
import { Bookmark, BookmarkCheck, Bell, BellOff, X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classNames } from 'A/lib/utils'

interface SaveSearchButtonProps {
  /** Current filter state to save */
  filters: Record<string, any>
  /** Optional text query */
  searchQuery?: string
  /** Type of search page */
  searchType?: 'explore' | 'map' | 'fulltext'
  /** Compact mode for inline use */
  compact?: boolean
  /** Additional class names */
  className?: string
}

interface SavedSearch {
  id: string
  name: string
  description: string | null
  search_query: string | null
  filters: Record<string, any>
  alerts_enabled: boolean
  alert_frequency: string | null
  new_results_count: number
  created_at: string
  updated_at: string
}

export default function SaveSearchButton({
  filters,
  searchQuery,
  searchType = 'explore',
  compact = false,
  className
}: SaveSearchButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [loadingSaved, setLoadingSaved] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const [alertFrequency, setAlertFrequency] = useState<'daily' | 'weekly'>('daily')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    setIsAuthenticated(!!session?.user)
  }

  async function getAuthToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
  }

  async function loadSavedSearches() {
    setLoadingSaved(true)
    try {
      const token = await getAuthToken()
      if (!token) return

      const response = await fetch('/api/user/searches', {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setSavedSearches(data.searches || [])
      }
    } catch (error) {
      console.error('Failed to load saved searches:', error)
    } finally {
      setLoadingSaved(false)
    }
  }

  function handleOpen() {
    if (!isAuthenticated) {
      // Could redirect to login or show a message
      return
    }
    setIsOpen(true)
    setSaveSuccess(false)
    setName('')
    setDescription('')
    setAlertsEnabled(false)
    setAlertFrequency('daily')
    loadSavedSearches()
  }

  async function handleSave() {
    if (!name.trim()) return

    setSaving(true)
    try {
      const token = await getAuthToken()
      if (!token) return

      const response = await fetch('/api/user/searches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          search_query: searchQuery || null,
          filters: {
            ...filters,
            search_type: searchType
          },
          alerts_enabled: alertsEnabled,
          alert_frequency: alertsEnabled ? alertFrequency : null
        })
      })

      if (response.ok) {
        setSaveSuccess(true)
        loadSavedSearches()
        // Auto-close after success
        setTimeout(() => {
          setIsOpen(false)
        }, 1500)
      }
    } catch (error) {
      console.error('Failed to save search:', error)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(searchId: string) {
    try {
      const token = await getAuthToken()
      if (!token) return

      const response = await fetch(`/api/user/searches?id=${searchId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.ok) {
        setSavedSearches(prev => prev.filter(s => s.id !== searchId))
      }
    } catch (error) {
      console.error('Failed to delete saved search:', error)
    }
  }

  async function toggleAlerts(search: SavedSearch) {
    try {
      const token = await getAuthToken()
      if (!token) return

      const response = await fetch('/api/user/searches', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          id: search.id,
          alerts_enabled: !search.alerts_enabled
        })
      })

      if (response.ok) {
        setSavedSearches(prev =>
          prev.map(s => s.id === search.id ? { ...s, alerts_enabled: !s.alerts_enabled } : s)
        )
      }
    } catch (error) {
      console.error('Failed to toggle alerts:', error)
    }
  }

  // Check if current filters match any saved search
  const hasActiveFilters = Object.keys(filters).some(key => {
    const value = filters[key]
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'string') return value.trim().length > 0
    return value !== null && value !== undefined
  })

  if (!isAuthenticated) {
    return (
      <button
        onClick={() => window.location.href = '/login'}
        className={classNames(
          'flex items-center gap-2 transition-colors',
          compact
            ? 'px-3 py-1.5 text-xs rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            : 'px-4 py-2 text-sm rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10',
          className
        )}
        title="Sign in to save searches"
      >
        <Bookmark className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {!compact && <span>Save Search</span>}
      </button>
    )
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={!hasActiveFilters}
        className={classNames(
          'flex items-center gap-2 transition-all',
          compact
            ? 'px-3 py-1.5 text-xs rounded-lg'
            : 'px-4 py-2 text-sm rounded-lg',
          hasActiveFilters
            ? 'bg-primary-500.20 text-primary-300 hover:bg-primary-500/30 border border-primary-500/30'
            : 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/5',
          className
        )}
        title={hasActiveFilters ? 'Save current search filters' : 'Add filters to save a search'}
      >
        <Bookmark className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {!compact && <span>Save Search</span>}
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#12121f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Save Search</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {saveSuccess ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <BookmarkCheck className="w-12 h-12 text-green-400 mb-3" />
                  <p className="text-white font-medium">Search Saved!</p>
                  <p className="text-gray-400 text-sm mt-1">
                    {alertsEnabled ? "We'ln otify you when new matches appear." : "You can find it in your dashboard."}
                  </p>
                </div>
              ) : (
                </>
            )€Ÿ]ˆÏ‚ˆˆBŠ