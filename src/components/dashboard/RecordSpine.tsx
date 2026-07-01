'use client'

// V11.38 — Phase 1 of MY_RECORD_UX_PANEL_REVIEW: the vertical Record spine.
//
// Flag-gated (?spine=1). One top-to-bottom narrative about you in the archive,
// emotion-first:
//   ① Opening — your experience, held (no chart first) + multi-experience switch
//   ② Kindred — you're not alone (closest accounts + "why you match")
//   ③ Dossier — the depth, made legible: ALL seven cross-references named so the
//      user knows the full depth exists; the first is open (the taste), the rest
//      are membership-ghosted with a one-line description of what each reveals.
//
// Locked principles: n=1 / low-kindred is the DEFAULT (rarity = distinction);
// free is GENEROUS, membership is MORE (driven by match.locked); no gamification;
// documentary restraint; mobile-first single column.

import React, { useEffect } from 'react'
import Link from 'next/link'
import { MapPin, Calendar, ChevronRight, Lock, Plus } from 'lucide-react'
import { capture } from '@/lib/posthog'
import type { MatchedReport, UserExperience } from '@/components/constellation/ConstellationReveal'

// Single configurable surface title so a future go-to-market naming swap is a
// one-line change, not a refactor.
export const RECORD_SPINE_TITLE = 'My Record'

// The seven Dossier cross-references — comprehensive + good titles, so the user
// always sees the full depth that exists (even when locked). The first is the
// free taste; the rest are membership-ghosted with a one-line "what it opens".
const DOSSIER_SECTIONS: Array<{ key: string; name: string; blurb: string; free?: boolean }> = [
  { key: 'kindred', name: 'Closest accounts', blurb: 'the experiences most like yours, ranked', free: true },
  { key: 'geographic', name: 'Geographic neighbors', blurb: 'who else reported near where you were', free: true },
  { key: 'temporal', name: 'Temporal neighbors', blurb: 'where your night sits across the decades', free: true },
  { key: 'lineage', name: 'Phenomenology lineage', blurb: 'how your experience type traces through history' },
  { key: 'rarity', name: 'Descriptor rarity', blurb: 'which details of yours are common, which are rare' },
  { key: 'patterns', name: 'Pattern connections', blurb: 'recurring motifs your account shares' },
  { key: 'sources', name: 'Source cross-reference', blurb: 'where similar accounts were documented' },
]

// Render the LIVE summary for an open Dossier section from the SIGNAL payload.
// Returns null when there's no data yet (still loading) or the surface was
// skipped (sparse area / no location) — the section then shows just its blurb.
function liveDossier(key: string, sd: any): React.ReactNode {
  if (!sd) return null
  if (key === 'geographic') {
    const cl = sd.cluster
    if (!cl || cl.skipped || !cl.nearby_count) return null
    const yr = (cl.year_min && cl.year_max && cl.year_min !== cl.year_max)
      ? cl.year_min + '–' + cl.year_max
      : (cl.year_min ? String(cl.year_min) : '')
    const c = cl.contribution
    return (
      <>
        <span className="font-semibold text-purple-300">{Number(cl.nearby_count).toLocaleString()}</span>{' '}
        report{cl.nearby_count === 1 ? '' : 's'} within ~{cl.radius_mi} miles{yr ? <> — spanning <span className="font-semibold text-purple-300">{yr}</span></> : ''}.
        {c && (c.is_foundational || c.is_early) && (
          <span className="block mt-1 text-xs text-gray-400">
            {c.is_foundational ? 'Your story is one of the foundational cases here' : 'Your story arrived early in this cluster'}
            {typeof c.newer_arrivals_count === 'number' ? ' — ' + c.newer_arrivals_count + (c.newer_arrivals_count === 1 ? ' report has' : ' reports have') + ' joined since.' : '.'}
          </span>
        )}
      </>
    )
  }
  if (key === 'temporal') {
    const cx = sd.context
    if (!cx || cx.skipped || !cx.peak_month_name) return null
    return (
      <>
        Reports like yours peak in <span className="font-semibold text-purple-300">{cx.peak_month_name}</span>{' '}
        <span className="text-gray-400">({cx.peak_share_pct}% of dated reports)</span>.
        {cx.user_month_name && (
          <span className="block mt-1 text-xs text-gray-400">
            {cx.user_matches_peak
              ? 'Yours was logged in ' + cx.user_month_name + ' — right inside that peak.'
              : 'Yours was logged in ' + cx.user_month_name + '.'}
          </span>
        )}
      </>
    )
  }
  return null
}

interface RecordSpineProps {
  userExperience: UserExperience
  matches: MatchedReport[]
  totalExperiences: number
  userEmail: string
  router: any
  reportRaw?: any
  onReportEdited?: () => void
  // Multi-experience switching (founder direction #3 — first-class, native).
  allReports?: any[]
  focusedIdx?: number
  onFocus?: (idx: number) => void
  // SIGNAL payload (geographic cluster + temporal context) for the open
  // Dossier sections. Null while loading → sections show just their blurb.
  signalData?: any
}

export default function RecordSpine(props: RecordSpineProps) {
  const exp = props.userExperience
  const matches = props.matches || []
  const unlocked = matches.filter((m) => !m.locked)
  const lockedCount = matches.length - unlocked.length
  const kindredCount = matches.length
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
  const multi = Array.isArray(props.allReports) && props.allReports.length > 1

  // Instrumentation — activation event when the spine renders (re-fires on
  // experience switch). Feeds the A/B: activation now, free→member via the
  // upgrade-click events below (with WHERE in the spine it fired).
  useEffect(() => {
    try {
      capture('record_spine_view', {
        kindred_count: kindredCount,
        locked_count: lockedCount,
        multi_experience: multi,
        category: exp.category || null,
        has_living_edge: !!(props.signalData && props.signalData.since_last_visit && !props.signalData.since_last_visit.is_first_visit),
      })
    } catch (_) { /* analytics is best-effort */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exp.id, kindredCount])

  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto space-y-10">

      {/* ① THE OPENING — your experience, held. Emotion first, no chart. */}
      <section>
        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-purple-400/80 mb-3">
          {RECORD_SPINE_TITLE}
        </p>
        {multi && (
          <div className="flex flex-wrap gap-2 mb-4">
            {props.allReports!.map((r: any, i: number) => {
              const label = [r.city, r.state_province].filter(Boolean).join(', ') || r.title || ('Experience ' + (i + 1))
              const active = i === (props.focusedIdx || 0)
              return (
                <button
                  key={r.id || i}
                  type="button"
                  onClick={() => { if (props.onFocus) props.onFocus(i) }}
                  className={
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ' +
                    (active
                      ? 'bg-purple-600/25 border-purple-500/60 text-white'
                      : 'border-gray-700/60 text-gray-400 hover:text-gray-200 hover:border-gray-600')
                  }
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
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
        {props.reportRaw && props.reportRaw.slug && (
          <Link
            href={'/report/' + props.reportRaw.slug}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-purple-300 hover:text-purple-200"
          >
            View your full report <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </section>

      {/* ④ THE LIVING EDGE — "since you last visited" (the return hook).
          Elevated near the top for returning users — the red team's #1 churn
          fix (the silent return). Shown only when there's a real delta. */}
      <LivingEdge signalData={props.signalData} />

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
            onClick={() => { try { capture('record_spine_upgrade_click', { where: 'kindred', locked_count: lockedCount }) } catch (_) {} }}
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

      {/* ③ THE DOSSIER — the depth, made legible. All seven named so the full
          depth is visible; first open, the rest membership-ghosted. */}
      <section>
        <SectionHeading n="03" title="Dossier" sub="Seven cross-references on your experience" />
        <div className="space-y-2">
          {DOSSIER_SECTIONS.map((s) => {
            const live = s.free ? liveDossier(s.key, props.signalData) : null
            return (
              <div
                key={s.key}
                className={'rounded-lg border p-3 ' + (s.free ? 'border-purple-700/50 bg-purple-950/20' : 'border-gray-800/60 bg-gray-900/20')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={'text-sm font-medium ' + (s.free ? 'text-white' : 'text-gray-300')}>{s.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.blurb}</p>
                  </div>
                  {s.free ? (
                    <span className="text-[10px] uppercase tracking-wider text-purple-300 font-semibold flex-shrink-0">Open</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex-shrink-0">
                      <Lock className="w-3 h-3" />Membership
                    </span>
                  )}
                </div>
                {live && (
                  <div className="mt-2.5 pt-2.5 border-t border-white/5 text-sm text-gray-200 leading-relaxed">
                    {live}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <Link
          href="/account/subscription"
          onClick={() => { try { capture('record_spine_upgrade_click', { where: 'dossier' }) } catch (_) {} }}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-purple-300 hover:text-purple-200"
        >
          Open all seven with membership <ChevronRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Secondary access — one tap, not a tab. */}
      <section className="pt-2 border-t border-gray-800/60 flex flex-wrap gap-3">
        <Link
          href="/start"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600/15 border border-purple-500/40 text-sm text-purple-200 hover:bg-purple-600/25 hover:text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> Share another experience
        </Link>
        <Link
          href="/discover"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-700/60 text-sm text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
        >
          Explore the archive
        </Link>
      </section>
    </div>
  )
}

// The Living Edge — "since you last visited." Documentary, never gamified.
// Renders only when there's a real delta for a returning user; otherwise the
// spine stays quiet (the never-empty fallback ladder is a later enhancement).
function LivingEdge(props: { signalData: any }) {
  const slv = props.signalData && props.signalData.since_last_visit
  if (!slv || slv.is_first_visit) return null
  const peers = slv.new_peers_opted_in || 0
  const cluster = slv.new_in_cluster || 0
  const archive = slv.new_in_archive || 0
  const items: string[] = []
  if (peers > 0) items.push(peers + (peers === 1 ? ' account is' : ' accounts are') + ' open to comparing notes')
  if (cluster > 0) items.push(cluster + ' new ' + (cluster === 1 ? 'report' : 'reports') + ' near where you were')
  if (items.length === 0 && archive > 0) items.push(Number(archive).toLocaleString() + ' new ' + (archive === 1 ? 'report' : 'reports') + ' joined the archive')
  if (items.length === 0) return null
  return (
    <section className="rounded-xl border border-purple-600/40 bg-gradient-to-br from-purple-600/12 via-purple-600/5 to-transparent p-4">
      <p className="text-[10px] font-semibold tracking-wider uppercase text-purple-300/90 mb-1">Since you last visited</p>
      <p className="text-sm text-purple-100 leading-relaxed">{items.join(' · ')}.</p>
    </section>
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
