/**
 * Collections Dashboard Page
 *
 * Manage research collections - create, view, and organize reports
 */

import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { useSubscription } from '@/lib/hooks/useSubscription'
import {
  Folder,
  FolderPlus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Globe,
  Lock,
  FileText,
  Calendar,
  Loader2,
  AlertCircle,
  Sparkles
} from 'lucide-react'

interface Collection {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string
  is_public: boolean
  report_count: number
  created_at: string
  updated_at: string
}

export default function CollectionsPage() {
  const router = useRouter()
  const { subscription, usage, loading: subLoading } = useSubscription()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Check if user has collections feature
  const hasCollectionsFeature = subscription?.tier?.features?.collections === true
  const collectionsLimit = subscription?.tier?.limits?.collections_max || 0
  const collectionsUsed = usage?.collections_created || 0
  const canCreateMore = collectionsLimit === -1 || collectionsUsed < collectionsLimit

  useEffect(() => {
    fetchCollections()
  }, [])

  const fetchCollections = async () => {
    try {
      const res = await fetch('/api/collections')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch collections')
      }

      setCollections(data.collections || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collections')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteCollection = async (id: string) => {
    if (!confirm('Are you sure you want to delete this collection? This cannot be undone.')) {
      return
    }

    try {
      const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' })

      if (!res.ok) {
        throw new Error('Failed to delete collection')
      }

      setCollections(collections.filter(c => c.id !== id))
    } catch (err) {
      alert('Failed to delete collection')
    }
  }

  const filteredCollections = collections.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Render upgrade prompt if user doesn't have collections feature
  if (!subLoading && !hasCollectionsFeature) {
    return (
      <DashboardLayout>
        <Head>
          <title>Collections - ParaDocs</title>
        </Head>

        <div className="max-w-2xl mx-auto text-center py-12">
          <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Folder className="w-8 h-8 text-purple-400" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-4">
            Unlock Research Collections
          </h1>

          <p className="text-gray-400 mb-8">
            Organize reports into custom collections, add personal notes, and build
            comprehensive research files. Perfect for investigating specific phenomena
            or geographic areas.
          </p>

          <div className="bg-surface-800 rounded-lg p-6 mb-8 text-left">
            <h3 className="font-semibold text-white mb-4">Collections Include:</h3>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-purple-400" />
                Create up to 10 custom collections (Pro) or unlimited (Researcher)
              </li>
              <li className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-purple-400" />
                Add personal notes and tags to each report
              </li>
              <li className="flex items-center gap-3">
                <Search className="w-5 h-5 text-purple-400" />
                Quick search across all your collections
              </li>
              <li className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-purple-400" />
                Share collections publicly or keep them private
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
        <title>Collections - ParaDocs</title>
      </Head>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">My Collections</h1>
            <p className="text-gray-400 mt-1">
              Organize reports for your research projects
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Usage indicator */}
            {collectionsLimit !== -1 && (
              <span className="text-sm text-gray-400">
                {collectionsUsed} / {collectionsLimit} collections
              </span>
            )}

            <button
              onClick={() => setShowCreateModal(true)}
              disabled={!canCreateMore}
              className="btn btn-primary flex items-center gap-2"
            >
              <FolderPlus className="w-5 h-5" />
              New Collection
            </button>
          </div>
        </div>

        {/* Search */}
        {collections.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search collections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-800 border border-surface-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}

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
        {!loading && collections.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-surface-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Folder className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No collections yet</h3>
            <p className="text-gray-400 mb-6">
              Create your first collection to start organizing reports
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <FolderPlus className="w-5 h-5" />
              Create Collection
            </button>
          </div>
        )}

        {/* Collections grid */}
        {!loading && filteredCollections.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCollections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                onEdit={() => setEditingCollection(collection)}
                onDelete={() => handleDeleteCollection(collection.id)}
              />
            ))}
          </div>
        )}

        {/* No results */}
        {!loading && collections.length > 0 && filteredCollections.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400">No collections match your search</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingCollection) && (
        <CollectionModal
          collection={editingCollection}
          onClose={() => {
            setShowCreateModal(false)
            setEditingCollection(null)
          }}
          onSave={(collection) => {
            if (editingCollection) {
              setCollections(collections.map(c =>
                c.id === collection.id ? collection : c
              ))
            } else {
              setCollections([collection, ...collections])
            }
            setShowCreateModal(false)
            setEditingCollection(null)
          }}
        />
      )}
    </DashboardLayout>
  )
}

// Collection Card Component
function CollectionCard({
  collection,
  onEdit,
  onDelete
}: {
  collection: Collection
  onEdit: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <Link
      href={`/dashboard/collections/${collection.id}`}
      className="block bg-surface-800 rounded-lg border border-surface-600 hover:border-primary-500/50 transition-colors"
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: collection.color + '20' }}
          >
            <Folder className="w-5 h-5" style={{ color: collection.color }} />
          </div>

          <div className="relative">
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="p-1 hover:bg-surface-700 rounded"
            >
              <MoreVertical className="w-5 h-5 text-gray-400" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-8 bg-surface-700 rounded-lg shadow-lg border border-surface-600 py-1 z-10">
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setShowMenu(false)
                    onEdit()
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-surface-600 flex items-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
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

        <h3 className="font-semibold text-white mb-1">{collection.name}</h3>

        {collection.description && (
          <p className="text-sm text-gray-400 line-clamp-2 mb-3">
            {collection.description}
          </p>
        )}

        <div className="flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            {collection.report_count} reports
          </div>

          <div className="flex items-center gap-1">
            {collection.is_public ? (
              <>
                <Globe className="w-4 h-4" />
                Public
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Private
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

// Collection Modal Component
function CollectionModal({
  collection,
  onClose,
  onSave
}: {
  collection: Collection | null
  onClose: () => void
  onSave: (collection: Collection) => void
}) {
  const [name, setName] = useState(collection?.name || '')
  const [description, setDescription] = useState(collection?.description || '')
  const [color, setColor] = useState(collection?.color || '#6366f1')
  const [isPublic, setIsPublic] = useState(collection?.is_public || false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const colors = [
    '#6366f1', // Indigo
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Collection name is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const url = collection
        ? `/api/collections/${collection.id}`
        : '/api/collections'

      const res = await fetch(url, {
        method: collection ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          is_public: isPublic
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save collection')
      }

      onSave(data.collection)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-xl max-w-md w-full">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-4">
            {collection ? 'Edit Collection' : 'New Collection'}
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
                placeholder="e.g., Pacific Northwest Bigfoot Research"
                className="w-full px-3 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this collection about?"
                rows={3}
                className="w-full px-3 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Color
              </label>
              <div className="flex gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-800 scale-110' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isPublic"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 rounded bg-surface-700 border-surface-600 text-primary-500 focus:ring-primary-500"
              />
              <label htmlFor="isPublic" className="text-sm text-gray-300">
                Make this collection public
              </label>
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
                {collection ? 'Save Changes' : 'Create Collection'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
