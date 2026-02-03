'use client'

import React, { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, X, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'

interface Phenomenon {
  id: string
  name: string
  slug: string
  icon: string
  category: string
  report_count: number
}

interface PhenomenaFilterProps {
  selectedSlug: string
  onChange: (slug: string) => void
}

export default function PhenomenaFilter({
  selectedSlug,
  onChange,
}: PhenomenaFilterProps) {
  const [phenomena, setPhenomena] = useState<Phenomenon[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadPhenomena()
  }, [])

  async function loadPhenomena() {
    try {
      const { data, error } = await supabase
        .from('phenomena')
        .select('id, name, slug, icon, category, report_count')
        .eq('status', 'active')
        .order('report_count', { ascending: false })
        .limit(100)

      if (error) throw error
      setPhenomena(data || [])
    } catch (error) {
      console.error('Error loading phenomena:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectedPhenomenon = phenomena.find(p => p.slug === selectedSlug)

  const filteredPhenomena = phenomena.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="relative">
      <label className="block text-sm text-gray-400 mb-2">
        <BookOpen className="w-4 h-4 inline mr-1" />
        Encyclopedia Phenomenon
      </label>

      {/* Selected value / trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={classNames(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors',
          selectedSlug
            ? 'bg-purple-900/30 border-purple-700 text-white'
            : 'bg-white/5 border-white/10 text-gray-300 hover:border-white/20'
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedPhenomenon ? (
            <>
              <span>{selectedPhenomenon.icon || '📚'}</span>
              <span>{selectedPhenomenon.name}</span>
            </>
          ) : (
            <span className="text-gray-500">All phenomena</span>
          )}
        </span>
        <ChevronDown className={classNames(
          'w-4 h-4 flex-shrink-0 transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>

      {/* Clear button */}
      {selectedSlug && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onChange('')
            setIsOpen(false)
          }}
          className="absolute right-10 top-[38px] p-1 text-gray-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-80 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search phenomena..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                autoFocus
              />
            </div>
          </div>

          {/* Options */}
          <div className="overflow-y-auto max-h-60">
            {loading ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : filteredPhenomena.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No phenomena found</div>
            ) : (
              <>
                {/* "All" option */}
                <button
                  onClick={() => {
                    onChange('')
                    setIsOpen(false)
                    setSearchQuery('')
                  }}
                  className={classNames(
                    'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800 transition-colors',
                    !selectedSlug && 'bg-purple-900/30'
                  )}
                >
                  <span className="text-gray-400">All phenomena</span>
                </button>

                {/* Phenomenon options */}
                {filteredPhenomena.map(phenomenon => (
                  <button
                    key={phenomenon.id}
                    onClick={() => {
                      onChange(phenomenon.slug)
                      setIsOpen(false)
                      setSearchQuery('')
                    }}
                    className={classNames(
                      'w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-800 transition-colors',
                      selectedSlug === phenomenon.slug && 'bg-purple-900/30'
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span>{phenomenon.icon || '📚'}</span>
                      <span className="text-white">{phenomenon.name}</span>
                    </span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {phenomenon.report_count} reports
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setIsOpen(false)
            setSearchQuery('')
          }}
        />
      )}
    </div>
  )
}
