'use client'

/**
 * YourSignalForPhenomenon — V10 Phase 4.D
 *
 * When a signed-in user with one or more reports tagged to this
 * phenomenon visits the phenomenon detail page, render a small
 * personalized callout that:
 *   - Acknowledges the user's prior submission(s) for this entity
 *   - Surfaces deep-links to their matched reports
 *   - Points back to Your Signal for richer pattern analysis
 *
 * Silent (renders nothing) for: anonymous users, signed-in users
 * with no matched reports, and any API errors. Never gets in the
 * way of the encyclopedia content.
 *
 * SWC compat: var + function() form.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Activity, ChevronRight } from 'lucide-react'

interface Props {
  slug: string
}

interface MatchedReport {
  id: string
  slug: string
  title: string
  created_at: string
}

export default function YourSignalForPhenomenon(props: Props) {
  var [matched, setMatched] = useState(false)
  var [count, setCount] = useState(0)
  var [reports, setReports] = useState<MatchedReport[]>([])

  useEffect(function () {
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session) return
      fetch('/api/phenomena/' + props.slug + '/your-signal', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
        .then(function (r) { return r.ok ? r.json() : null })
        .then(function (data) {
          if (data && data.matched) {
            setMatched(true)
            setCount(data.count || 0)
            setReports(data.reports || [])
          }
        })
        .catch(function () { /* silent */ })
    })
  }, [props.slug])

  if (!matched || count === 0) return null

  return (
    <div className="bg-gradient-to-r from-purple-950/40 to-purple-900/20 border border-purple-700/40 rounded-2xl p-4 sm:p-5 mb-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
          <Activity className="w-4 h-4 text-purple-200" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-300 mb-1">
            Your Signal
          </p>
          <p className="text-sm sm:text-base text-white leading-snug">
            {count === 1 ? (
              <>You&rsquo;ve shared <span className="font-semibold text-purple-200">1 report</span> connected to this phenomenon.</>
            ) : (
              <>You&rsquo;ve shared <span className="font-semibold text-purple-200">{count} reports</span> connected to this phenomenon.</>
            )}
          </p>
          {reports.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {reports.slice(0, 3).map(function (r) {
                return (
                  <li key={r.id}>
                    <Link
                      href={'/report/' + r.slug}
                      className="text-xs sm:text-sm text-purple-200 hover:text-white inline-flex items-center gap-1 transition-colors"
                    >
                      <ChevronRight className="w-3 h-3" />
                      <span className="truncate">{r.title}</span>
                    </Link>
                  </li>
                )
              })}
              {reports.length > 3 && (
                <li className="text-[11px] text-purple-300/70 pl-4">
                  +{reports.length - 3} more
                </li>
              )}
            </ul>
          )}
          <Link
            href="/lab?tab=signal"
            className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-white mt-3 transition-colors"
          >
            See pattern analysis in Your Signal
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  )
}
