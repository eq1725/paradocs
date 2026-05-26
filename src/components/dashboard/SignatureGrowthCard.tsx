'use client'

/**
 * SignatureGrowthCard — Spotify-Wrapped-style monthly delta on Story tab.
 *
 * V11.17.38 PR-7 item 2 — the expert panel's framing was:
 *   "Activate the embedding investment. Show the user that the
 *    constellation is GROWING around their experience. Reinforce
 *    'you're not alone' with a number that wasn't there last month."
 *
 * Renders only when the API returns growth signal — otherwise hides.
 * Pulls from /api/lab/signature-growth which works for both
 * authenticated (personalized) and anonymous (corpus-only) users.
 *
 * Composition:
 *   - Headline: "Your signature is growing"
 *   - Hero metric: N new corroborating reports
 *   - Sub-line: "Paradocs added X reports this {month}"
 *   - Top aligned category badge (when user-personalized)
 *   - Inline CTA: "See what changed →" → scrolls to LabConstellationTab
 *
 * Defensive: silently hides on fetch error or empty payload.
 */

import React, { useEffect, useState } from 'react'
import { Sparkles, TrendingUp, Telescope, ArrowDownRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface GrowthPayload {
  period_days: number
  corpus_added: number
  user_submissions: number
  user_match_growth: number
  top_aligned_category: string | null
  has_growth: boolean
  month_label: string
}

function formatNumber(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US')
  return String(n)
}

function categoryLabel(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function SignatureGrowthCard() {
  const [data, setData] = useState<GrowthPayload | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Honor a session-level dismiss so the card doesn't whiplash
    // back after the user collapses it.
    try {
      const flag = sessionStorage.getItem('paradocs_signature_growth_dismissed')
      if (flag === '1') {
        setDismissed(true)
        setLoaded(true)
        return
      }
    } catch (_e) { /* sessionStorage unavailable, ignore */ }

    let cancelled = false

    async function load() {
      try {
        const sessionResult = await supabase.auth.getSession()
        const token = sessionResult.data.session?.access_token
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = 'Bearer ' + token

        const resp = await fetch('/api/lab/signature-growth', { headers })
        if (!resp.ok) {
          if (!cancelled) setLoaded(true)
          return
        }
        const json = await resp.json() as GrowthPayload
        if (cancelled) return
        setData(json)
        setLoaded(true)
      } catch (_e) {
        if (!cancelled) setLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  function scrollToConstellation() {
    try {
      const el = document.querySelector('[data-section="lab-constellation"]') as HTMLElement | null
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (_e) {}
  }

  function dismiss() {
    setDismissed(true)
    try { sessionStorage.setItem('paradocs_signature_growth_dismissed', '1') } catch (_e) {}
  }

  if (!loaded || dismissed) return null
  if (!data || !data.has_growth) return null

  const personal = data.user_submissions > 0 && data.user_match_growth > 0
  const heroN = personal ? data.user_match_growth : data.corpus_added
  // V11.17.38 — noun aligned with "archive" framing on the card header.
  // Was "new reports" which implied organic submissions; "cases" matches
  // the Today's Lead "9,444 cases archived" framing the user already
  // sees, and is honest about ingested archival material.
  const heroLabel = personal
    ? (heroN === 1 ? 'aligned case' : 'aligned cases')
    : (heroN === 1 ? 'new case' : 'new cases')

  return (
    <div className="relative rounded-2xl overflow-hidden border border-purple-500/30 bg-gradient-to-br from-purple-900/40 via-fuchsia-900/30 to-cyan-900/30">
      {/* Subtle starfield backdrop using radial gradients */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage: 'radial-gradient(1px 1px at 12% 30%, rgba(255,255,255,0.6) 0%, transparent 60%), radial-gradient(1px 1px at 78% 60%, rgba(255,255,255,0.5) 0%, transparent 60%), radial-gradient(1.5px 1.5px at 42% 80%, rgba(168,85,247,0.7) 0%, transparent 70%), radial-gradient(1px 1px at 90% 20%, rgba(56,189,248,0.6) 0%, transparent 60%)',
        }}
      />
      <div className="relative p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-white/10">
              <Sparkles className="w-3.5 h-3.5 text-purple-200" aria-hidden="true" />
            </div>
            <h3 className="text-xs uppercase tracking-wider text-purple-200 font-semibold">
              {/* V11.17.38 — product noun corrected ("constellation" → "archive").
                  Constellation lives only in legacy route slugs + internal
                  component names; user-facing surfaces use the documentary
                  "archive" framing established by the Today's Lead cards. */}
              {personal ? 'Your signature is growing' : 'The archive is growing'}
            </h3>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Dismiss this card"
          >
            Hide
          </button>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl sm:text-4xl font-bold text-white tabular-nums">
            +{formatNumber(heroN)}
          </span>
          <span className="text-sm text-purple-100">{heroLabel}</span>
          {/* V11.17.38 — period framing fixed. Was "in {month}" which
              both implied a calendar-month delta AND misrepresented
              the 30-day rolling-window data. Now reads "last 30 days"
              everywhere for honesty. */}
          <span className="text-[10px] text-purple-300/70 ml-auto">last 30 days</span>
        </div>

        {personal ? (
          <p className="mt-2 text-xs text-purple-100/80 leading-relaxed">
            {heroN === 1
              ? 'A new case aligned with yours in the last 30 days.'
              : heroN + ' new cases aligned with yours in the last 30 days.'}{' '}
            {data.top_aligned_category && (
              <>
                Most fall under{' '}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] bg-white/10 text-white font-medium">
                  {categoryLabel(data.top_aligned_category)}
                </span>.
              </>
            )}{' '}
            None of them know you exist.
          </p>
        ) : (
          <p className="mt-2 text-xs text-purple-100/80 leading-relaxed">
            Paradocs archived{' '}
            <span className="text-white font-semibold">{formatNumber(data.corpus_added)}</span>{' '}
            cases in the last 30 days. Log an experience to see what aligns with yours.
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] text-purple-300/70">
            <TrendingUp className="w-3 h-3" aria-hidden="true" />
            <span>{data.period_days}-day rolling window</span>
          </div>
          <button
            type="button"
            onClick={scrollToConstellation}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-purple-100 bg-white/10 hover:bg-white/15 border border-white/10 transition-colors"
          >
            {personal ? (
              <>
                <Telescope className="w-3 h-3" aria-hidden="true" /> See what changed
              </>
            ) : (
              <>
                <ArrowDownRight className="w-3 h-3" aria-hidden="true" /> Open the archive
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
