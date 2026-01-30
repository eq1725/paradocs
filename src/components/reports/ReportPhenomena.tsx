'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, X, Sparkles, ChevronRight, Check } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

interface Phenomenon {
  id: string
  name: string
  slug: string
  category: string
  icon: string
  ai_summary: string | null
  report_count: number
}

interface ReportPhenomenaProps {
  reportSlug: string
  isAuthenticated?: boolean
}

export default function ReportPhenomena({ reportSlug, isAuthenticated = false }: ReportPhenomenaProps) {
  const [phenomena, setPhenomena] = useState<{ phenomenon: Phenomenon; confidence: number }[]>([])
  const [allPhenomena, setAllPhenomena] = useState<Phenomenon[]>([])
  const [loading, setLoading] = useState(true)
  const [identifying, setIdentifying] = useState(false)
  const [showTagModal, setShowTagModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadPhenomena()
  }, [reportSlug])

  async function loadPhenomena() {
    try {
      const res = await fetch(`/api/reports/${reportSlug}/phenomena`)
      const data = await res.json()
      setPhenomena(data.phenomena || [])
    } catch (error) {
      console.error('Error loading phenomena:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadAllPhenomena() {
    try {
      const res = await fetch('/api/phenomena')
      const data = await res.json()
      setAllPhenomena(data.phenomena || [])
    } catch (error) {
      console.error('Error loading all phenomena:', error)
    }
  }

  async function autoIdentify() {
    setIdentifying(true)
    try {
      const res = await fetch(`/api/reports/${reportSlug}/phenomena`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_identify' }),
      })
      const data = await res.json()
      if (data.success) {
        await loadPhenomena()
      }
    } catch (error) {
      console.error('Error auto-identifying:', error)
    } finally {
      setIdentifying(false)
    }
  }

  async function tagPhenomenon(phenomenonId: string) {
    try {
      await fetch(`/api/reports/${reportSlug}/phenomena`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tag', phenomenon_id: phenomenonId }),
      })
      await loadPhenomena()
      setShowTagModal(false)
    } catch (error) {
      console.error('Error tagging:', error)
    }
  }

  async function removePhenomenon(phenomenonId: string) {
    try {
      await fetch(`/api/reports/${reportSlug}/phenomena`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phenomenon_id: phenomenonId }),
      })
      await loadPhenomena()
    } catch (error) {
      console.error('Error removing:', error)
    }
  }

  function openTagModal() {
    setShowTagModal(true)
    if (allPhenomena.length === 0) {
      loadAllPhenomena()
    }
  }

  // Filter phenomena for tag modal
  const filteredPhenomena = allPhenomena.filter(p => {
    const alreadyTagged = phenomena.some(rp => rp.phenomenon.id === p.id)
    const matchesSearch = searchQuery === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    return !alreadyTagged && matchesSearch
  })

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="animate-pulse">
          <div className="h-5 bg-gray-800 rounded w-1/3 mb-4"></div>
          <div className="h-16 bg-gray-800 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          Related Phenomena
        </h3>

        {isAuthenticated && (
          <div className="flex gap-2">
            <button
              onClick={autoIdentify}
              disabled={identifying}
              className="text-xs px-3 py-1.5 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 rounded-lg transition-colors disabled:opacity-50"
            >
              {identifying ? 'Identifying...' : 'Auto-identify'}
            </button>
            <button
              onClick={openTagModal}
              className="text-xs px-3 py-1.5 bg-gray-800 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Tag
            </button>
          </div>
        )}
      </div>

      {phenomena.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-gray-400 text-sm mb-3">No phenomena linked to this report yet.</p>
          {isAuthenticated && (
            <button
              onClick={autoIdentify}
              disabled={identifying}
              className="text-sm text-purple-400 hover:text-purple-300"
            >
              {identifying ? 'Analyzing report...' : 'Click to auto-identify phenomena'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {phenomena.map(({ phenomenon, confidence }) => {
            const config = CATEGORY_CONFIG[phenomenon.category as keyof typeof CATEGORY_CONFIG]
            return (
              <div
                key={phenomenon.id}
                className="group flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <span className="text-2xl">{phenomenon.icon || config?.icon}</span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/phenomena/${phenomenon.slug}`}
                    className="text-white font-medium hover:text-purple-400 transition-colors"
                  >
                    {phenomenon.name}
                  </Link>
                  <p className="text-xs text-gray-400 truncate">{phenomenon.ai_summary}</p>
                </div>
                <div className="flex items-center gap-2">
                  {confidence >= 0.8 && (
                    <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-400 rounded">
                      {Math.round(confidence * 100)}%
                    </span>
                  )}
                  <Link
                    href={`/phenomena/${phenomenon.slug}`}
                    className="text-gray-500 hover:text-purple-400 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                  {isAuthenticated && (
                    <button
                      onClick={() => removePhenomenon(phenomenon.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h4 className="text-lg font-semibold text-white">Tag Phenomenon</h4>
              <button
                onClick={() => setShowTagModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-gray-800">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search phenomena..."
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="overflow-y-auto max-h-96">
              {filteredPhenomena.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  {allPhenomena.length === 0 ? 'Loading...' : 'No matching phenomena found'}
                </div>
              ) : (
                <div className="p-2">
                  {filteredPhenomena.map(p => {
                    const config = CATEGORY_CONFIG[p.category as keyof typeof CATEGORY_CONFIG]
                    return (
                      <button
                        key={p.id}
                        onClick={() => tagPhenomenon(p.id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-gray-800 rounded-lg transition-colors text-left"
                      >
                        <span className="text-2xl">{p.icon || config?.icon}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-white font-medium block">{p.name}</span>
                          <span className="text-xs text-gray-400">{config?.label}</span>
                        </div>
                        <Check className="w-4 h-4 text-gray-600" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
