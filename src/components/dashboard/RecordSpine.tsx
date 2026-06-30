'use client'

// V11.38 — Phase 1 of MY_RECORD_UX_PANEL_REVIEW: the vertical Record spine.
//
// Flag-gated (?spine=1). Renders the emotion-first lead of the spine:
//   ① Opening — your experience, held (no chart first)
//   ② Kindred — you're not alone (closest accounts + "why you match")
//
// Chapter ③ (the Dossier / "How yours connects" depth) is composed AFTER this
// in lab.tsx by reusing the live YourSignalTab surfaces (real geographic /
// temporal / signature data + membership gating) — so the spine is
// Opening + Kindred (here) + the real Dossier (there).
//
// Locked principles: n=1 / low-kindred is the DEFAULT (rarity = distinction,
// never absence); free is GENEROUS, membership is MORE (driven by match.locked);
// no gamification; documentary restraint; mobile-first single column.

import React from 'react'
import Link from 'next/link'
import { MapPin, Calendar, ChevronRight, Lock } from 'lucide-react'
import type { MatchedReport, UserExperience } from '@/components/constellation/ConstellationReveal'

// Single configurable surface title so a future go-to-market naming swap is a
// one-line change, not a refactor.
export const RECORD_SPINE_TITLE = 'My Record'

interface RecordSpineProps {
  userExperience: UserExperience
  matches: MatchedReport[]
  totalExperiences: number
  userEmail: string
  router: any
  reportRaw?: any
  onReportEdited?: () => void
}

export default function RecordSpine(props: RecordSpineProps) {
  const exp = props.userExperience
  const matches = props.matches || []
  const unlocked = matches.filter((m) => !m.locked)
  const lockedCount = matches.length - unlocked.length
  const kindredCount = matches.length

  // Free is generous: the three closest kindred, with reasons. Membership opens
  // the full set (the `locked` matches the matcher already withheld).
  const freeKindred = unlocked.slice(0, 3)

  // The living-context line — composed for the n=1 / low-kindred DEFAULT,
  // distinction-framed so rarity reads as the point, never as emptiness.
  const livingLine = (() => {
    const total = props.totalExperiences || 0
    if (kindredCount === 0) {
      return total
        ? `Yours stands alone so far — nothing in ${total.toLocaleString()} accounts echoes it yet. That's what makes it worth recording.`
        : `Yours is the first of its kind recorded here. That's what makes it worth recording.`
    }
    if (kindredCount <= 3) {
      return `Yours is rare — only ${kindredCount} ${kindredCount === 1 ? 'account' : 'accounts'} in ${total.toLocaleString()} echo it. That rarity is the point.`
    }
    return `You're 1 of ${(kindredCount + 1).toLocaleString()} who recorded something like this${total ? `, held among ${total.toLocaleString()} accounts` : ''}.`
  })()

  const showYear = exp.year && !(exp as any).year_unknown

  return (
    <div className="px-4 sm:px-6 pt-6 pb-2 max-w-2xl mx-auto space-y-10">

      {/* ① THE OPENING — your experience, held. Emotion first, no chart. */}
      <section>
        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-purple-400/80 mb-3">
          {RECORD_SPINE_TITLE}
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-white leading-snug">
          {exp.type_name || 'Your experience'}
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
          {exp.location && exp.location !== 'Unknown' && (
            <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{exp.location}</span>
          )}
          {showYear && (
            <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{exp.year}</span>
          )}
        </div>
        {exp.description && (
          <blockquote className="mt-4 text-[15px] leading-relaxed text-gray-200 whitespace-pre-line border-l-2 border-purple-700/50 pl-4">
            {exp.description}
          </blockquote>
        )}
        <p className="mt-4 text-sm text-purple-200/90 leading-relaxed">{livingLine}</p>
      </section>

      {/* ② THE KINDRED — you're not alone (the recurring wow). */}
      <section>
        <SectionHeading
          n="02"
          title="Kindred"
          sub={kindredCount > 0 ? 'The accounts closest to yours' : 'No close echoes yet — your night stands alone'}
        />
        {freeKindred.length === 0 ? (
          <div className="rounded-xl border border-purple-800/40 bg-purple-950/15 p-4 text-sm text-gray-400 leading-relaxed">
            Nothing closely echoes yours yet. As the archive grows, new accounts are matched against your
            Record — the first kin will surface right here.
          </div>
        ) : (
          <div className="space-y-3">
            {freeKindred.map((m) => <KindredCard key={m.id} match={m} />)}
          </div>
        )}
        {lockedCount > 0 && (
          <Link
            href="/account/subscription"
            className="mt-3 flex items-center justify-between rounded-xl border border-purple-600/40 bg-gradient-to-br from-purple-600/15 to-transparent p-4 hover:border-purple-500/60 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Lock className="w-4 h-4 text-purple-300 flex-shrink-0" />
              <p className="text-sm text-purple-100">
                <span className="font-semibold">{lockedCount} more {lockedCount === 1 ? 'account' : 'accounts'}</span>{' '}
                match yours. Membership opens the full set.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-purple-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </Link>
        )}
      </section>

      {/* ③ Dossier follows — the live "How yours connects" depth, composed in
          lab.tsx by reusing YourSignalTab. */}
    </div>
  )
}

function SectionHeading(props: { n: string; title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-mono text-purple-500/70">{props.n}</span>
        <h2 className="text-base font-semibold text-white tracking-wide">{props.title}</h2>
      </div>
      {props.sub && <p className="text-xs text-gray-500 mt-1">{props.sub}</p>}
    </div>
  )
}

function KindredCard(props: { match: MatchedReport }) {
  const m = props.match
  // "Why you match" — the matcher's per-dimension reasons, strongest first.
  const reasons = (m.match_dimensions || [])
    .filter((d) => d && d.label && d.score >= 0.5)
    .slice(0, 4)
  const pct = Math.round((m.match_score || 0) * 100)
  const place = [m.city, m.state_province].filter(Boolean).join(', ') || m.country || m.location_description || ''
  return (
    <Link
      href={'/report/' + m.slug}
      className="block rounded-xl border border-purple-800/40 bg-purple-950/15 p-4 hover:border-purple-600/60 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white leading-snug">{m.title}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-gray-400">
            {place && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{place}</span>}
            {m.event_date && <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{String(m.event_date).slice(0, 4)}</span>}
          </div>
        </div>
        {pct > 0 && <span className="text-[11px] font-semibold text-purple-300 flex-shrink-0">{pct}% match</span>}
      </div>
      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {reasons.map((d, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-900/30 border border-purple-700/40 text-[10px] text-purple-200"
            >
              <span className="text-purple-400" aria-hidden="true">✦</span>{d.label}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}
