/**
 * Saved Searches Dashboard Page
 *
 * Manage saved searches and alerts
 */

import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { useSubscription } from '@/lib/hooks/useSubscription'
import {
  Search,
  Bell,
  BellOff,
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  Play,
  Filter,
  Calendar,
  MapPin,
  Loader2,
  AlertCircle,
  Sparkles,
  Clock,
  CheckCircle
} from 'lucide-react'

interface SavedSearch {
  id: string
  name: string
  description: string | null
  search_query: string | null
  filters: {
    category?: string
    country?: string
    credibility?: string
    has_photo_video?: boolean
    date_from?: string
    date_to?: string
  }
  alerts_enabled: boolean
  alert_frequency: 'immediate' | 'daily' | 'weekly'
  last_alert_sent_at: string | null
  last_checked_at: string | null
  new_results_count: number
  created_at: string
  updated_at: string
}

export default function SavedSearchesPage() {
  const router = useRouter()
  const { subscription, usage, loading: subLoading } = useSubscription()
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null)
  const [runningSearch, setRunningSearch] = useState<string | null>(null)

  // Check if user has saved searches feature
  const hasSavedSearchesFeature = subscription?.tier?.features?.saved_searches === true
  const searchesLimit = subscription?.tier?.limits?.saved_searches_max || 0
  const searchesUsed = usage?.saved_searches_created || 0
  const canCreateMore = searchesLimit === -1 || searchesUsed < searchesLimit

  useEffect(() => {
    fetchSavedSearches()
  }, [])

  const fetchSavedSearches = async () => {
    try {
      const res = await fetch('/api/saved-searches')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch saved searches')
      }

      setSavedSearches(data.savedSearches || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saved searches')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSearch = async (id: string) => {
    if (!confirm('Are you sure you want to delete this saved search?')) {
      return
    }

    try {
      const res = await fetch(`/api/saved-searches/${id}`, { method: 'DELETE' })

      if (!res.ok) {
        throw new Error('Failed to delete saved search')
      }

      setSavedSearches(savedSearches.filter(s => s.id !== id))
    } catch (err) {
      alert('Failed to delete saved search')
    }
  }

  const handleRunSearch = async (search: SavedSearch) => {
    setRunningSearch(search.id)

    // Build URL params from filters
    const params = new URLSearchParams()

    if (search.search_query) {
      params.set('q', search.search_query)
    }

    if (search.filters.category) {
      params.set('category', search.filters.category)
    }

    if (search.filters.country) {
      params.set('country', search.filters.country)
    }

    if (search.filters.credibility) {
      params.set('credibility', search.filters.credibility)
    }

    router.push(`/search?${params.toString()}`)
  }

  const handleToggleAlerts = async (search: SavedSearch) => {
    try {
      const res = await fetch(`/api/saved-searches/${search.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alerts_enabled: !search.alerts_enabled
        })
      })

      if (!res.ok) {
        throw new Error('Failed to update alerts')
      }

      setSavedSearches(savedSearches.map(s =>
        s.id === search.id
          ? { ...s, alerts_enabled: !s.alerts_enabled }
          : s
      ))
    } catch (err) {
      alert('Failed to update alerts')
    }
  }

  const formatCategory = (category: string) => {
    return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  // Render upgrade prompt if user doesn't have saved searches feature
  if (!subLoading && !hasSavedSearchesFeature) {
    return (
      <DashboardLayout>
        <Head>
          <title>Saved Searches - ParaDocs</title>
        </Head>

        <div className="max-w-2xl mx-auto text-center py-12">
          <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Search className="w-8 h-8 text-purple-400" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-4">
            Unlock Saved Searches
          </h1>

          <p className="text-gray-400 mb-8">
            Save your search queries and get notified when new reports match your criteria.
            Perfect for monitoring specific phenomena or geographic areas.
          </p>

          <div className="bg-surface-800 rounded-lg p-6 mb-8 text-left">
            <h3 className="font-semibold text-white mb-4">Saved Searches Include:</h3>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-center gap-3">
                <Search className="w-5 h-5 text-purple-400" />
                Save up to 5 searches (Pro) or unlimited (Researcher)
              </li>
              <li className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-purple-400" />
                Email alerts when new matching reports are added
              </li>
              <li className="flex items-center gap-3">
                <Filter className="w-5 h-5 text-purple-400" />
                Save complex filter combinations
              </li>
              <li className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-purple-400" />
                Choose alert frequency: immediate, daily, or weekly
              </li>
            </ul>
          </div>

          <Link
            href="/dashboard/subscription"
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Upgrade to Pro
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <Head>
        <title>Saved Searches - ParaDocs</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Saved Searches</h1>
            <p className="text-gray-400 mt-1">
              Save search queries and get alerts for new matches
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Usage indicator */}
            {searchesLimit !== -1 && (
              <span className="text-sm text-gray-400">
                {searchesUsed} / {searchesLimit} saved
              </span>
            )}

            <button
              onClick={() => setShowCreateModal(true)}
              disabled={!canCreateMore}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              New Saved Search
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && savedSearches.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-surface-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No saved searches yet</h3>
            <p className="text-gray-400 mb-6">
              Create a saved search to monitor for new reports
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Saved Search
            </button>
          </div>
        )}

        {/* Saved searches list */}
        {!loading && savedSearches.length > 0 && (
          <div className="space-y-4">
            {savedSearches.map((search) => (
              <SavedSearchCard
                key={search.id}
                search={search}
                isRunning={runningSearch === search.id}
                onRun={() => handleRunSearch(search)}
                onToggleAlerts={() => handleToggleAlerts(search)}
                onEdit={() => setEditingSearch(search)}
                onDelete={() => handleDeleteSearch(search.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingSearch) && (
        <SavedSearchModal
          search={editingSearch}
          onClose={() => {
            setShowCreateModal(false)
            setEditingSearch(null)
          }}
          onSave={(search) => {
            if (editingSearch) {
              setSavedSearches(savedSearches.map(s =>
                s.id === search.id ? search : s
              ))
            } else {
              setSavedSearches([search, ...savedSearches])
            }
            setShowCreateModal(false)
            setEditingSearch(null)
          }}
        />
      )}
    </DashboardLayout>
  )
}

// Saved Search Card Component
function SavedSearchCard({
  search,
  isRunning,
  onRun,
  onToggleAlerts,
  onEdit,
  onDelete
}: {
  search: SavedSearch
  isRunning: boolean
  onRun: () => void
  onToggleAlerts: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)

  const formatCategory = (category: string) => {
    return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const hasFilters = search.search_query ||
    search.filters.category ||
    search.filters.country ||
    search.filters.credibility

  return (
    <div className="bg-surface-800 rounded-lg border border-surface-600 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="font-semibold text-white">{search.name}</h3>

            {search.alerts_enabled && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                <Bell className="w-3 h-3" />
                {search.alert_frequency} alerts
              </span>
            )}

            {search.new_results_count > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-500/20 text-primary-400 text-xs rounded-full">
                {search.new_results_count} new
              </span>
            )}
          </div>

          {search.description && (
            <p className="text-sm text-gray-400 mb-3">{search.description}</p>
          )}

          {/* Search criteria */}
          <div className="flex flex-wrap gap-2">
            {search.search_query && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-700 text-gray-300 text-sm rounded">
                <Search className="w-3 h-3" />
                "{search.search_query}"
              </span>
            )}

            {search.filters.category && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-700 text-gray-300 text-sm rounded">
                <Filter className="w-3 h-3" />
                {formatCategory(search.filters.category)}
              </span>
            )}

            {search.filters.country && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-700 text-gray-300 text-sm rounded">
                <MapPin className="w-3 h-3" />
                {search.filters.country}
              </span>
            )}

            {(search.filters.date_from || search.filters.date_to) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-700 text-gray-300 text-sm rounded">
                <Calendar className="w-3 h-3" />
                {search.filters.date_from || 'Any'} - {search.filters.date_to || 'Now'}
              </span>
            )}
          </div>

          {search.last_checked_at && (
            <p className="text-xs text-gray-500 mt-3">
              Last run: {new Date(search.last_checked_at).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={isRunning}
            className="p-2 hover:bg-surface-700 rounded-lg text-primary-400 hover:text-primary-300"
            title="Run search"
          >
            {isRunning ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </button>

          <button
            onClick={onToggleAlerts}
            className={`p-2 hover:bg-surface-700 rounded-lg ${
              search.alerts_enabled ? 'text-green-400' : 'text-gray-400'
            }`}
            title={search.alerts_enabled ? 'Disable alerts' : 'Enable alerts'}
          >
            {search.alerts_enabled ? (
              <Bell className="w-5 h-5" />
            ) : (
              <BellOff className="w-5 h-5" />
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-surface-700 rounded-lg text-gray-400"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-10 bg-surface-700 rounded-lg shadow-lg border border-surface-600 py-1 z-10">
                <button
                  onClick={() => {
                    setShowMenu(false)
                    onEdit()
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-surface-600 flex items-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false)
                    onDelete()
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-surface-600 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Saved Search Modal Component
function SavedSearchModal({
  search,
  onClose,
  onSave
}: {
  search: SavedSearch | null
  onClose: () => void
  onSave: (search: SavedSearch) => void
}) {
  const [name, setName] = useState(search?.name || '')
  const [description, setDescription] = useState(search?.description || '')
  const [searchQuery, setSearchQuery] = useState(search?.search_query || '')
  const [category, setCategory] = useState(search?.filters?.category || '')
  const [country, setCountry] = useState(search?.filters?.country || '')
  const [alertsEnabled, setAlertsEnabled] = useState(search?.alerts_enabled || false)
  const [alertFrequency, setAlertFrequency] = useState(search?.alert_frequency || 'daily')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categories = [
    { value: '', label: 'All Categories' },
    { value: 'ufos_aliens', label: 'UFOs & Aliens/NHIs' },
    { value: 'cryptids', label: 'Cryptids' },
    { value: 'ghosts_hauntings', label: 'Ghosts & Hauntings' },
    { value: 'psychic_phenomena', label: 'Psychic Phenomena (ESP)' },
    { value: 'consciousness_practices', label: 'Consciousness Practices' },
    { value: 'psychological_experiences', label: 'Psychological Experiences' },
    { value: 'biological_factors', label: 'Biological Factors' },
    { value: 'perception_sensory', label: 'Perception & Sensory' },
    { value: 'religion_mythology', label: 'Religion & Mythology' },
    { value: 'esoteric_practices', label: 'Esoteric Practices' },
    { value: 'combination', label: 'Combination' }
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Search name is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const url = search
        ? `/api/saved-searches/${search.id}`
        : '/api/saved-searches'

      const res = await fetch(url, {
        method: search ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          search_query: searchQuery.trim() || null,
          filters: {
            ...(category && { category }),
            ...(country && { country })
          },
          alerts_enabled: alertsEnabled,
          alert_frequency: alertFrequency
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save search')
      }

      onSave(data.savedSearch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-4">
            {search ? 'Edit Saved Search' : 'New Saved Search'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Triangle UFOs in Arizona"
                className="w-full px-3 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-3 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="border-t border-surface-600 pt-4">
              <h3 className="text-sm font-medium text-white mb-3">Search Criteria</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Keywords
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search terms..."
                    className="w-full px-3 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {categories.map(cat => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g., United States"
                    className="w-full px-3 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-surface-600 pt-4">
              <h3 className="text-sm font-medium text-white mb-3">Alert Settings</h3>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="alertsEnabled"
                    checked={alertsEnabled}
                    onChange={(e) => setAlertsEnabled(e.target.checked)}
                    className="w-4 h-4 rounded bg-surface-700 border-surface-600 text-primary-500 focus:ring-primary-500"
                  />
                  <label htmlFor="alertsEnabled" className="text-sm text-gray-300">
                    Send me email alerts for new matches
                  </label>
                </div>

                {alertsEnabled && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Alert Frequency
                    </label>
                    <select
                      value={alertFrequency}
                      onChange={(e) => setAlertFrequency(e.target.value as typeof alertFrequency)}
                      className="w-full px-3 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="immediate">Immediate</option>
                      <option value="daily">Daily digest</option>
                      <option value="weekly">Weekly digest</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 btn btn-primary flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {search ? 'Save Changes' : 'Create Search'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
