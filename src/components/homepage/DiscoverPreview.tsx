'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Flame, AlertCircle, Play } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonCategory } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames, truncate } from '@/lib/utils'

interface DiscoverReport extends Report {
  phenomenon_type?: { name: string } | null
}

interface DiscoverCardProps {
  report: DiscoverReport
}

function DiscoverCard({ report }: DiscoverCardProps) {
  var categoryConfig = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination

  return (
    <Link href={'/report/' + report.slug} className="block group h-full">
      <div className={classNames(
        'glass-card rounded-lg overflow-hidden h-full flex flex-col',
        'border border-white/10 hover:border-primary-500/50 transition-all',
        'hover:shadow-lg hover:shadow-primary-500/20 cursor-pointer'
      )}>
        {/* Thumbnail area with icon */}
        <div className="aspect-square bg-gradient-to-br from-primary-900/50 to-purple-900/50 relative flex items-center justify-center overflow-hidden">
          <div className={classNames(
            'absolute inset-0 flex items-center justify-center text-5xl',
            'group-hover:scale-110 transition-transform duration-300'
          )}>
            {categoryConfig.icon}
          </div>

          {/* Category badge */}
          <div className={classNames(
            'absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs font-medium',
            'border border-current/30',
            categoryConfig.bgColor,
            categoryConfig.color
          )}>
            {categoryConfig.label}
          </div>

          {/* Play indicator on hover */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
            <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity fill-white" />
          </div>
        </div>

        {/* Content area */}
        <div className="p-4 flex flex-col flex-grow">
          <h3 className="text-sm font-semibold text-white mb-2 line-clamp-2 group-hover:text-primary-400 transition-colors">
            {report.title}
          </h3>

          <p className="text-xs text-gray-400 flex-grow mb-3 line-clamp-2">
            {report.summary || 'An intriguing report waiting for your investigation.'}
          </p>

          <div className="flex items-center justify-between">
            {report.location_name && (
              <span className="text-xs text-gray-500 inline-block bg-white/5 px-2 py-1 rounded">
                {truncate(report.location_name, 15)}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {report.view_count} views
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function DiscoverPreview() {
  var [reports, setReports] = useState<DiscoverReport[]>([])
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)

  useEffect(function() {
    var fetchReports = async function() {
      setLoading(true)
      setError(null)
      try {
        var result = await supabase
          .from('reports')
          .select('*, phenomenon_type:phenomenon_types(name)')
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(4)

        if (result.error) {
          throw new Error(result.error.message)
        }

        var data = (result.data as DiscoverReport[]) || []
        setReports(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reports')
        setReports([])
      } finally {
        setLoading(false)
      }
    }

    fetchReports()
  }, [])

  var placeholders = [
    {
      title: 'Bigfoot Sighting in the Pacific Northwest',
      category: 'cryptid',
      summary: 'Mysterious footprints discovered near a remote forest area.',
      icon: '\ud83d\udc2f'
    },
    {
      title: 'Black Triangle UFO Encounter',
      category: 'ufo',
      summary: 'Multiple witnesses report seeing a massive triangular craft.',
      icon: '🛸'
    },
    {
      title: 'Unexplained Electromagnetic Phenomena',
      category: 'ufo',
      summary: 'Strange signals detected by amateur radio operators.',
      icon: '⚡'
    },
    {
      title: 'Haunted Mansion Investigation',
      category: 'paranormal',
      summary: 'Paranormal activity documented by researchers.',
      icon: '👻'
    }
  ]

  return (
    <section className="py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="flex items-center justify-center gap-3 text-3xl md:text-4xl font-display font-bold text-white mb-4">
            <Flame className="w-8 h-8 text-amber-500" />
            Discover the Unknown
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Swipe through fascinating cases from around the world. Bigfoot to black triangles, ghost encounters to government files. Your paranormal TikTok awaits.
          </p>
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(function(i) {
              return (
                <div key={i} className="glass-card rounded-lg aspect-square border border-white/10 animate-pulse"></div>
              )
            })}
          </div>
        )}

        {error && !loading && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-6 flex items-start gap-4 mb-8">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-amber-400 font-medium mb-1">Loading Recent Reports</h3>
              <p className="text-sm text-amber-400/80">
                Showing curated examples while we fetch the latest discoveries.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {!loading && reports.length > 0 ? (
            reports.map(function(report) {
              return (
                <DiscoverCard key={report.id} report={report} />
              )
            })
          ) : !loading && error ? (
            placeholders.map(function(placeholder, index) {
              return (
                <div key={index} className="glass-card rounded-lg overflow-hidden border border-white/10 opacity-60 cursor-default h-full flex flex-col">
                  <div className="aspect-square bg-gradient-to-br from-primary-900/50 to-purple-900/50 relative flex items-center justify-center">
                    <span className="text-5xl">{placeholder.icon}</span>
                  </div>
                  <div className="p-4 flex flex-col flex-grow">
                    <h3 className="text-sm font-semibold text-white mb-2 line-clamp-2">
                      {placeholder.title}
                    </h3>
                    <p className="text-xs text-gray-400 flex-grow mb-3 line-clamp-2">
                      {placeholder.summary}
                    </p>
                  </div>
                </div>
              )
            })
          ) : (
            placeholders.map(function(placeholder, index) {
              return (
                <div key={index} className="glass-card rounded-lg overflow-hidden border border-white/10 h-full flex flex-col">
                  <div className="aspect-square bg-gradient-to-br from-primary-900/50 to-purple-900/50 relative flex items-center justify-center">
                    <span className="text-5xl">{placeholder.icon}</span>
                  </div>
                  <div className="p-4 flex flex-col flex-grow">
                    <h3 className="text-sm font-semibold text-white mb-2 line-clamp-2">
                      {placeholder.title}
                    </h3>
                    <p className="text-xs text-gray-400 flex-grow mb-3 line-clamp-2">
                      {placeholder.summary}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="text-center">
          <Link
            href="/discover"
            className={classNames(
              'inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg',
              'bg-primary-500 hover:bg-primary-600 text-white font-semibold transition-colors',
              'text-lg'
            )}
          >
            <Play className="w-5 h-5 fill-white" />
            Start Swiping
          </Link>
          <p className="text-gray-400 text-sm mt-4">
            Endless paranormal discoveries await.
          </p>
        </div>
      </div>
    </section>
  )
}
