'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Bookmark, Plus, FolderOpen, X, ChevronDown, MoreVertical, FolderPlus, Trash2 } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import ReportCard from '@/components/ReportCard'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'

export default function SavedReportsPage() {
  const router = useRouter()
  const [savedReports, setSavedReports] = useState<any[]>([])
  const [collections, setCollections] = useState<string[]>([])
  const [activeCollection, setActiveCollection] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [showNewCollection, setShowNewCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [moveMenuOpen, setMoveMenuOpen] = useState<string | null>(null)
  const limit = 12

  const getAuthToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
  }, [])

  const fetchCollections = useCallback(async () => {
    const token = await getAuthToken()
    if (!token) return
    try {
      const res = await fetch('/api/user/saved?collections_only=true', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setCollections(data.collections || [])
      }
    } catch (err) {
      console.error('Error fetching collections:', err)
    }
  }, [getAuthToken])

  const fetchSaved = useCallback(async () => {
    setLoading(true)
    const token = await getAuthToken()
    if (!token) {
      setLoading(false)
      return
    }
    try {
      let url = `/api/user/saved?page=${page}&limit=${limit}`
      if (activeCollection === '__uncategorized__') {
        url += '&collection=__uncategorized__'
      } else if (activeCollection) {
        url += `&collection=${encodeURIComponent(activeCollection)}`
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setSavedReports(data.saved || [])
        setTotal(data.total || 0)
      }
    } catch (err) {
      console.error('Error fetching saved:', err)
    } finally {
      setLoading(false)
    }
  }, [getAuthToken, page, activeCollection, limit])

  useEffect(() => {
    fetchCollections()
  }, [fetchCollections])

  useEffect(() => {
    fetchSaved()
  }, [fetchSaved])

  const handleRemove = async (reportId: string) => {
    const token = await getAuthToken()
    if (!token) return
    try {
      await fetch('/api/user/saved', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ report_id: reportId })
      })
      setSavedReports(prev => prev.filter(s => s.report_id !== reportId))
      setTotal(prev => prev - 1)
    } catch (err) {
      console.error('Error removing:', err)
    }
  }

  const handleMoveToCollection = async (reportId: string, collectionName: string | null) => {
    const token = await getAuthToken()
    if (!token) return
    try {
      await fetch('/api/user/saved', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ report_id: reportId, collection_name: collectionName })
      })
      setMoveMenuOpen(null)
      fetchSaved()
      fetchCollections()
    } catch (err) {
      console.error('Error moving:', err)
    }
  }

  const handleCreateCollection = () => {
    const name = newCollectionName.trim()
    if (!name) return
    if (!collections.includes(name)) {
      setCollections(prev => [...prev, name])
    }
    setActiveCollection(name)
    setNewCollectionName('')
    setShowNewCollection(false)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">
              <Bookmark className="w-6 h-6 text-primary-400" />
              Saved Reports
            </h1>
            <p className="text-sm text-gray-400 mt-1">{total} saved report{total !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowNewCollection(true)}
            className="btn btn-secondary flex items-center gap-2 text-sm"
          >
            <FolderPlus className="w-4 h-4" />
            New Collection
          </button>
        </div>

        {/* New Collection Input */}
        {showNewCollection && (
          <div className="glass-card p-4 mb-4 flex items-center gap-3 animate-fade-in">
            <FolderOpen className="w-5 h-5 text-primary-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="Collection name (e.g., Bigfoot Sightings)"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
              className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500"
              autoFocus
            />
            <button onClick={handleCreateCollection} className="btn btn-primary text-sm px-3 py-1">
              Create
            </button>
            <button onClick={() => { setShowNewCollection(false); setNewCollectionName('') }} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Collection Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => { setActiveCollection(null); setPage(1) }}
            className={classNames(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              activeCollection === null
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
            )}
          >
            All Saves
          </button>
          <button
            onClick={() => { setActiveCollection('__uncategorized__'); setPage(1) }}
            className={classNames(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              activeCollection === '__uncategorized__'
                ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
            )}
          >
            Uncategorized
          </button>
          {collections.map(col => (
            <button
              key={col}
              onClick={() => { setActiveCollection(col); setPage(1) }}
              className={classNames(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
                activeCollection === col
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
              )}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {col}
            </button>
          ))}
        </div>

        {/* Reports Grid */}
        {loading ? (
          <div className="grid md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="glass-card p-5 h-32 skeleton" />)}
          </div>
        ) : savedReports.length === 0 ? (
          <div className="text-center py-16 glass-card">
            <Bookmark className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 mb-2">
              {activeCollection ? `No reports in "${activeCollection === '__uncategorized__' ? 'Uncategorized' : activeCollection}"` : 'No saved reports yet'}
            </p>
            <Link href="/explore" className="text-primary-400 hover:text-primary-300 text-sm">
              Explore reports to save
            </Link>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              {savedReports.map((saved) => (
                <div key={saved.id} className="relative group">
                  {saved.report && <ReportCard report={saved.report} />}
                  {/* Collection badge + actions overlay */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {saved.collection_name && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400 backdrop-blur-sm">
                        {saved.collection_name}
                      </span>
                    )}
                    <div className="relative">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMoveMenuOpen(moveMenuOpen === saved.report_id ? null : saved.report_id) }}
                        className="p-1.5 rounded-lg bg-gray-900/80 backdrop-blur-sm text-gray-400 hover:text-white"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {moveMenuOpen === saved.report_id && (
                        <div className="absolute right-0 top-8 z-50 w-48 glass-card p-1 shadow-xl animate-fade-in">
                          <button
                            onClick={(e) => { e.preventDefault(); handleMoveToCollection(saved.report_id, null) }}
                            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/10 rounded flex items-center gap-2"
                          >
                            <X className="w-3.5 h-3.5" /> Remove from collection
                          </button>
                          {collections.filter(c => c !== saved.collection_name).map(col => (
                            <button
                              key={col}
                              onClick={(e) => { e.preventDefault(); handleMoveToCollection(saved.report_id, col) }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/10 rounded flex items-center gap-2"
                            >
                              <FolderOpen className="w-3.5 h-3.5" /> {col}
                            </button>
                          ))}
                          <div className="border-t border-white/10 mt-1 pt-1">
                            <button
                              onClick={(e) => { e.preventDefault(); handleRemove(saved.report_id) }}
                              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Unsave
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-secondary disabled:opacity-50">
                  Previous
                </button>
                <span className="flex items-center px-4 text-gray-400">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-secondary disabled:opacity-50">
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
