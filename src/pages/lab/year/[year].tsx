'use client'

/**
 * /lab/year/[year] — V10 Phase 4.C
 *
 * Your Signal Year in Review. Strava-style annual recap with
 * deterministic stat tiles + a Sonnet-written narrative intro
 * and closing. Shareable later via @vercel/og (V2).
 */

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { Activity, ArrowLeft, Loader2, Sparkles, FileText, Users, Heart, MessageCircle, Calendar, Telescope } from 'lucide-react'

interface Stats {
  year: number
  reports_shared: number
  cluster_size_total: number
  insights_surfaced: number
  resonances_received: number
  resonances_given: number
  connections_made: number
  comments_made: number
  ask_questions: number
  top_phenomenon_type: string | null
  top_month_label: string | null
  oldest_match_year: number | null
}

interface Narrative {
  intro: string | null
  closing: string | null
}

export default function YearInReviewPage() {
  var router = useRouter()
  var yearParam = parseInt(String(router.query.year || ''), 10) || new Date().getUTCFullYear()
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [signedIn, setSignedIn] = useState(false)
  var [stats, setStats] = useState<Stats | null>(null)
  var [narrative, setNarrative] = useState<Narrative | null>(null)

  useEffect(function () {
    if (!router.query.year) return
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session) { setSignedIn(false); setLoading(false); return }
      setSignedIn(true)
      fetch('/api/lab/year-in-review/' + yearParam, {
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Failed to load')) })
        .then(function (data) {
          var p = data && data.payload
          if (!p) throw new Error('Empty payload')
          setStats(p.stats)
          setNarrative(p.narrative || null)
        })
        .catch(function (e) { setError(e.message || 'Failed to load') })
        .finally(function () { setLoading(false) })
    })
  }, [router.query.year, yearParam])

  return (
    <>
      <Head><title>Your Signal {yearParam} · Paradocs</title></Head>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 text-white">
        <Link href="/lab?tab=signal" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Your Signal
        </Link>

        {!signedIn && !loading ? (
          <div className="p-6 bg-gray-900/50 border border-gray-800/60 rounded-xl text-center">
            <p className="text-sm text-gray-300 mb-3">Sign in to see your Year in Review.</p>
            <Link href={'/login?redirect=' + encodeURIComponent('/lab/year/' + yearParam)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold">Sign in</Link>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : stats ? (
          <>
            {/* Title block */}
            <div className="mb-8">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-400 mb-2">Your Signal</p>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight">{yearParam}</h1>
            </div>

            {/* Sonnet intro */}
            {narrative && narrative.intro && (
              <div className="bg-gradient-to-br from-purple-900/30 to-purple-950/40 border border-purple-700/40 rounded-2xl p-5 sm:p-6 mb-8 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-purple-300 flex-shrink-0 mt-1" />
                <p className="text-base sm:text-lg text-gray-100 leading-relaxed">{narrative.intro}</p>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
              <StatTile icon={FileText} label="Reports shared" value={stats.reports_shared} highlight />
              <StatTile icon={Telescope} label="AI insights surfaced" value={stats.insights_surfaced} />
              <StatTile icon={Users} label="Cluster reach" value={stats.cluster_size_total} hint="reports near yours" />
              <StatTile icon={Heart} label="Resonances received" value={stats.resonances_received} />
              <StatTile icon={Heart} label="Resonances you gave" value={stats.resonances_given} />
              <StatTile icon={Users} label="Connections made" value={stats.connections_made} />
              <StatTile icon={MessageCircle} label="Comments written" value={stats.comments_made} />
              <StatTile icon={Sparkles} label="Questions asked" value={stats.ask_questions} hint="Ask the Unknown" />
              {stats.top_phenomenon_type && (
                <StatTileText icon={Activity} label="Most-shared phenomenon" value={stats.top_phenomenon_type} />
              )}
              {stats.top_month_label && (
                <StatTileText icon={Calendar} label="Most-active month" value={stats.top_month_label} />
              )}
              {stats.oldest_match_year && (
                <StatTileText icon={Calendar} label="Earliest matched year" value={String(stats.oldest_match_year)} />
              )}
            </div>

            {/* Sonnet closing */}
            {narrative && narrative.closing && (
              <div className="border-t border-white/10 pt-6 mb-8">
                <p className="text-base text-gray-200 leading-relaxed italic">{narrative.closing}</p>
              </div>
            )}

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/start"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold"
              >
                Share another experience
              </Link>
              <Link
                href="/lab?tab=signal"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm"
              >
                Open Your Signal
              </Link>
            </div>

            <p className="text-[10px] text-gray-600 mt-8">
              Year in Review is automatically generated from your activity. Closed-year recaps are permanent;
              in-progress year updates daily.
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}

function StatTile(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  hint?: string
  highlight?: boolean
}) {
  var Icon = props.icon
  return (
    <div className={
      'rounded-xl border p-4 ' +
      (props.highlight
        ? 'bg-purple-950/15 border-purple-800/40'
        : 'bg-gray-900/40 border-gray-800/60')
    }>
      <Icon className={'w-3.5 h-3.5 mb-2 ' + (props.highlight ? 'text-purple-300' : 'text-gray-400')} />
      <p className={'text-2xl font-bold leading-none mb-1 ' + (props.highlight ? 'text-purple-200' : 'text-white')}>
        {props.value.toLocaleString()}
      </p>
      <p className="text-[11px] text-gray-400 leading-tight">{props.label}</p>
      {props.hint && <p className="text-[10px] text-gray-600 mt-0.5">{props.hint}</p>}
    </div>
  )
}

function StatTileText(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  var Icon = props.icon
  return (
    <div className="rounded-xl border bg-gray-900/40 border-gray-800/60 p-4">
      <Icon className="w-3.5 h-3.5 mb-2 text-gray-400" />
      <p className="text-base font-semibold text-white leading-snug mb-1 truncate">{props.value}</p>
      <p className="text-[11px] text-gray-400 leading-tight">{props.label}</p>
    </div>
  )
}
