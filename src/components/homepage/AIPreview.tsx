'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, AlertCircle, TrendingUp } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface Pattern {
  id: string
  pattern_type: 'geographic_cluster' | 'temporal_spike' | 'phenomena_similarity'
  title: string
  narrative: string
  report_count: number
  category: string
  metadata?: Record<string, unknown>
}

interface APIResponse {
  patterns: Pattern[]
}

function PatternTypeIcon({ type }: { type: string }) {
  var iconMap = {
    geographic_cluster: '\ud83d\udcc4',
    temporal_spike: '\u26a1',
    phenomena_similarity: '\u2728'
  }
  return <span className="text-lg">{iconMap[type as keyof typeof iconMap] || '✨'}</span>
}

function PatternBadge({ type }: { type: string }) {
  var badgeMap = {
    geographic_cluster: { label: 'Geographic Cluster', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    temporal_spike: { label: 'Temporal Spike', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    phenomena_similarity: { label: 'Phenomena Match', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' }
  }
  var badge = badgeMap[type as keyof typeof badgeMap] || { label: 'Pattern', color: 'bg-gray-500/10 text-gray-400 border-gray-500/20' }
  return (
    <span className={classNames('text-xs font-medium px-2 py-1 rounded-full border', badge.color)}>
      {badge.label}
    </span>
  )
}

function PatternCard({ pattern }: { pattern: Pattern }) {
  return (
    <div className="glass-card p-5 rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/[0.08] transition-all group">
      <div className="flex items-start gap-3 mb-3">
        <PatternTypeIcon type={pattern.pattern_type} />
        <PatternBadge type={pattern.pattern_type} />
      </div>

      <h4 className="text-base font-semibold text-white mb-2 group-hover:text-primary-400 transition-colors">
        {pattern.title}
      </h4>

      <p className="text-sm text-gray-400 mb-3 line-clamp-2">
        {pattern.narrative}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          {pattern.report_count} reports
        </span>
        {pattern.category && (
          <span className="text-xs bg-white/5 text-gray-300 px-2 py-1 rounded">
            {pattern.category}
          </span>
        )}
      </div>
    </div>
  )
}

export default function AIPreview() {
  var [patterns, setPatterns] = useState<Pattern[]>([])
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)

  useEffect(function() {
    var fetchPatterns = async function() {
      setLoading(true)
      setError(null)
      try {
        var response = await fetch('/api/ai/featured-patterns')
        if (!response.ok) {
          throw new Error('Failed to fetch patterns')
        }
        var data = (await response.json()) as APIResponse
        setPatterns(data.patterns && data.patterns.length > 0 ? data.patterns.slice(0, 3) : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
        setPatterns([])
      } finally {
        setLoading(false)
      }
    }

    fetchPatterns()
  }, [])

  return (
    <section className="py-16 md:py-24 bg-gradient-to-b from-transparent via-primary-500/5 to-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="flex items-center gap-3 text-3xl md:text-4xl font-display font-bold text-white mb-2">
              <Sparkles className="w-8 h-8 text-primary-400" />
              AI\u2013Discovered Patterns
            </h2>
            <p className="text-gray-400 text-sm">
              Connections only artificial intelligence can find across millions of reports.
            </p>
          </div>
          <Link
            href="/insights"
            className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-colors text-sm font-medium"
          >
            See All
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {[1, 2, 3].map(function(i) {
              return (
                <div key={i} className="glass-card p-5 rounded-lg border border-white/10 animate-pulse">
                  <div className="h-6 bg-white/5 rounded mb-3 w-3/4"></div>
                  <div className="h-4 bg-white/5 rounded mb-2"></div>
                  <div className="h-4 bg-white/5 rounded w-5/6"></div>
                </div>
              )
            })}
          </div>
        )}

        {error && !loading && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-6 flex items-start gap-4">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-amber-400 font-medium mb-1">AI Analysis In Progress</h3>
              <p className="text-sm text-amber-400/80">
                Our AI is analyzing thousands of reports to surface patterns. Check back soon for breakthrough discoveries.
              </p>
            </div>
          </div>
        )}

        {!loading && !error && patterns.length === 0 && (
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-8 text-center">
            <Sparkles className="w-12 h-12 mx-auto mb-3 text-blue-400" />
            <h3 className="text-white font-medium mb-2">Patterns Being Discovered</h3>
            <p className="text-gray-400 mb-4 max-w-xl mx-auto">
              Our AI is analyzing thousands of reports to surface patterns. Check back soon.
            </p>
            <Link
              href="/insights"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm font-medium"
            >
              View Insights
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}

        {!loading && patterns.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {patterns.map(function(pattern) {
              return (
                <PatternCard key={pattern.id} pattern={pattern} />
              )
            })}
          </div>
        )}

        <div className="mt-8 md:hidden">
          <Link
            href="/insights"
            className="block w-full text-center px-4 py-3 rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-colors font-medium"
          >
            See All Patterns
          </Link>
        </div>
      </div>
    </section>
  )
}
