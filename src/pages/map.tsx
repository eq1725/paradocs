'use client'

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { X, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonCategory } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import MapView from '@/components/MapView'
import CategoryFilter from '@/components/CategoryFilter'
import { formatDate, classNames } from '@/lib/utils'

export default function MapPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [category, setCategory] = useState<PhenomenonCategory | 'all'>('all')

  useEffect(() => {
    loadReports()
  }, [category])

  async function loadReports() {
    try {
      // Select only fields needed for map display - avoid full row scan
      let query = supabase
        .from('reports')
        .select('id,title,slug,summary,category,latitude,longitude,location_name,event_date,witness_count,credibility')
        .eq('status', 'approved')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      if (category !== 'all') {
        query = query.eq('category', category)
      }

      // Order by created_at desc to get most recent geocoded reports
      // This helps the query use an index instead of full table scan
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) throw error
      setReports(data || [])
    } catch (error) {
      console.error('Error loading reports:', error)
    } finally {
      setLoading(false)
    }
  }

  const categoryConfig = selectedReport ? (CATEGORY_CONFIG[selectedReport.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination) : null

  return (
    <>
      <Head>
        <title>Interactive Map - Paradocs</title>
      </Head>

      <div className="h-[calc(100vh-4rem)] flex flex-col">
        {/* Top bar with filters */}
        <div className="p-4 border-b border-white/5 bg-black/30 backdrop-blur">
          <div className="max-w-7xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-display font-bold text-white">
                  Global Sightings Map
                </h1>
                <p className="text-sm text-gray-400">
                  {reports.length.toLocaleString()} locations mapped
                </p>
              </div>
            </div>
            {/* Full width filter row for proper scrolling */}
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
              <CategoryFilter
                selected={category}
                onChange={setCategory}
              />
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50">
              <div className="text-gray-400">Loading map data...</div>
            </div>
          ) : (
            <MapView
              reports={reports}
              height="100%"
              onMarkerClick={setSelectedReport}
            />
          )}

          {/* Selected report panel */}
          {selectedReport && categoryConfig && (
            <div className="absolute top-4 right-4 w-80 glass-card p-5 animate-slide-in">
              <div className="flex items-start justify-between gap-2">
                <div className={classNames(
                  'w-10 h-10 rounded-lg flex items-center justify-center text-xl',
                  categoryConfig.bgColor
                )}>
                  {categoryConfig.icon}
                </div>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="p-1 hover:bg-white/10 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <h3 className="mt-3 font-medium text-white">
                {selectedReport.title}
              </h3>
              <p className="mt-2 text-sm text-gray-400 line-clamp-3">
                {selectedReport.summary}
              </p>
              <div className="mt-3 space-y-1 text-xs text-gray-500">
                {selectedReport.location_name && (
                  <p>📍 {selectedReport.location_name}</p>
                )}
                {selectedReport.event_date && (
                  <p>📅 {formatDate(selectedReport.event_date)}</p>
                )}
                {selectedReport.witness_count > 1 && (
                  <p>👥 {selectedReport.witness_count} witnesses</p>
                )}
              </div>
              <Link
                href={`/report/${selectedReport.slug}`}
                className="mt-4 btn btn-primary w-full text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                View Full Report
              </Link>
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 left-4 glass-card p-4">
            <h4 className="text-xs font-medium text-gray-400 mb-2">Legend</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {Object.entries(CATEGORY_CONFIG).slice(0, 6).map(([key, config]) => (
                <div key={key} className="flex items-center gap-2">
                  <span>{config.icon}</span>
                  <span className={config.color}>{config.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
