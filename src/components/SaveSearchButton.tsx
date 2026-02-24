'use client'

import React, { useState, useEffect } from 'react'
import { Bookmark, BookmarkCheck, Bell, BellOff, X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'

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
            ? 'bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 border border-primary-500/30'
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
                    {alertsEnabled ? "We'll notify you when new matches appear." : 'You can find it in your dashboard.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                      Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., UFO sightings near Portland"
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 text-sm"
                      autoFocus
                    />
                  </div>

                  {/* Description (optional) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                      Description <span className="text-gray-500">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What are you tracking?"
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 text-sm"
                    />
                  </div>

                  {/* Active Filters Summary */}
                  <div className="px-3 py-2.5 rounded-lg bg-white/5 border border-white/5">
                    <p className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Active Filters</p>
                    <div className="flex flex-wrap gap-1.5">
                      {filters.categories?.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-300 text-xs">
                          {filters.categories.length} {filters.categories.length === 1 ? 'category' : 'categories'}
                        </span>
                      )}
                      {filters.types?.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-300 text-xs">
                          {filters.types.length} phenomena
                        </span>
                      )}
                      {(filters.location_lat || filters.center) && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs">
                          Location filter
                        </span>
                      )}
                      {(searchQuery || filters.query) && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs">
                          &ldquo;{searchQuery || filters.query}&rdquo;
                        </span>
                      )}
                      {filters.contentType && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs">
                          {filters.contentType}
                        </span>
                      )}
                      {!hasActiveFilters && (
                        <span className="text-gray-500 text-xs">No active filters</span>
                      )}
                    </div>
                  </div>

                  {/* Alert Toggle */}
                  <div className="space-y-3">
                    <button
                      onClick={() => setAlertsEnabled(!alertsEnabled)}
                      className={classNames(
                        'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all',
                        alertsEnabled
                          ? 'bg-primary-500/10 border-primary-500/30 text-primary-300'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-300'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        {alertsEnabled ? (
                          <Bell className="w-4 h-4 text-primary-400" />
                        ) : (
                          <BellOff className="w-4 h-4" />
                        )}
                        <div className="text-left">
                          <p className="text-sm font-medium">
                            {alertsEnabled ? 'Alerts Enabled' : 'Enable Alerts'}
                          </p>
                          <p className="text-xs text-gray-500">
                            Get notified when new matching reports appear
                          </p>
                        </div>
                      </div>
                      <div className={classNames(
                        'w-10 h-5 rounded-full transition-colors relative',
                        alertsEnabled ? 'bg-primary-500' : 'bg-gray-600'
                      )}>
                        <div className={classNames(
                          'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform',
                          alertsEnabled ? 'translate-x-5' : 'translate-x-0.5'
                        )} />
                      </div>
                    </button>

                    {alertsEnabled && (
                      <div className="flex gap-2 pl-2">
                        {(['daily', 'weekly'] as const).map(freq => (
                          <button
                            key={freq}
                            onClick={() => setAlertFrequency(freq)}
                            className={classNames(
                              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                              alertFrequency === freq
                                ? 'bg-primary-500/20 border-primary-500/30 text-primary-300'
                                : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-300'
                            )}
                          >
                            {freq === 'daily' ? 'Daily' : 'Weekly'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            {!saveSuccess && (
              <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!name.trim() || saving}
                  className={classNames(
                    'px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                    name.trim() && !saving
                      ? 'bg-primary-500 hover:bg-primary-400 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  )}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-4 h-4" />
                      Save Search
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Existing Saved Searches */}
            {!saveSuccess && savedSearches.length > 0 && (
              <div className="border-t border-white/10 p-4">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">
                  Your Saved Searches ({savedSearches.length})
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {savedSearches.map(search => (
                    <div
                      key={search.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-300 truncate">{search.name}</p>
                        {search.description && (
                          <p className="text-xs text-gray-500 truncate">{search.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => toggleAlerts(search)}
                          className="p-1.5 rounded hover:bg-white/10 transition-colors"
                          title={search.alerts_enabled ? 'Disable alerts' : 'Enable alerts'}
                        >
                          {search.alerts_enabled ? (
                            <Bell className="w-3.5 h-3.5 text-primary-400" />
                          ) : (
                            <BellOff className="w-3.5 h-3.5 text-gray-500" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(search.id)}
                          className="p-1.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                          title="Delete saved search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
