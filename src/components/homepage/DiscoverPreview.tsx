'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { MapPin, Play } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

interface PreviewReport {
  id: string
  title: string
  slug: string
  summary: string | null
  category: string
  location_name: string | null
  event_date: string | null
  credibility: string | null
}

function ReportCard({ report }: { report: PreviewReport }) {
  var config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var firstLine = report.summary
    ? report.summary.split('.')[0] + '.'
    : 'An intriguing report waiting for your investigation.'

  var dateLabel = report.event_date
    ? new Date(report.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    : null

  return (
    <Link href={'/report/' + report.slug} className="block group">
      <div className={classNames(
        'p-5 rounded-xl border border-white/10 h-full',
        'bg-gradient-to-br from-white/[0.03] to-transparent',
        'hover:border-primary-500/30 hover:bg-white/[0.06] transition-all duration-200'
      )}>
        {/* Category + date row */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{config.icon}</span>
          <span className={classNames('text-xs font-medium px-2 py-0.5 rounded-full', config.bgColor, config.color)}>
            {config.label}
          </span>
          {dateLabel && (
            <span className="text-xs text-gray-600 ml-auto">{dateLabel}</span>
          )}
        </div>

        {/* Title — the hook */}
        <h3 className="text-base font-semibold text-white mb-2 line-clamp-2 group-hover:text-primary-400 transition-colors leading-snug">
          {report.title}
        </h3>

        {/* First sentence — cinematic pull */}
        <p className="text-sm text-gray-400 line-clamp-2 mb-3 leading-relaxed">
          {firstLine}
        </p>

        {/* Location */}
        {report.location_name && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <MapPin className="w-3 h-3" />
            <span>{report.location_name}</span>
          </div>
        )}
      </div>
    </Link>
  )
}

export default function DiscoverPreview() {
  var [reports, setReports] = useState<PreviewReport[]>([])
  var [loading, setLoading] = useState(true)

  useEffect(function() {
    async function fetchReports() {
      try {
        var result = await supabase
          .from('reports')
          .select('id, title, slug, summary, category, location_name, event_date, credibility')
          .eq('status', 'approved')
          .not('summary', 'is', null)
          .order('created_at', { ascending: false })
          .limit(4)

        setReports((result.data as PreviewReport[]) || [])
      } catch (e) {
        /* non-critical */
      }
      setLoading(false)
    }
    fetchReports()
  }, [])

  return (
    <section className="py-10 md:py-16 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            [0, 1, 2, 3].map(function(i) {
              return <div key={i} className="rounded-xl border border-white/10 h-44 animate-pulse bg-white/[0.02]" />
            })
          ) : reports.length > 0 ? (
            reports.map(function(report) {
              return <ReportCard key={report.id} report={report} />
            })
          ) : null}
        </div>

        {/* CTA */}
        <div className="text-center mt-8">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-500 hover:bg-primary-400 text-white font-semibold transition-colors"
          >
            <Play className="w-4 h-4 fill-white" />
            Start swiping
          </Link>
        </div>

      </div>
    </section>
  )
}
