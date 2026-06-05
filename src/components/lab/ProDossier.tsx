'use client'

// V11.17.71 - Pro Dossier
//
// ProDossier — the in-app viewer per PRO_TIER_VALIDATION_V3.md §3.
//
// Renders the 7-section Dossier for a single experience. Pro users see
// this in place of the LabPaywallSurface that Free/Basic users see.
//
// UX:
//   - Header strip with experience title + location + year + computed_at
//     timestamp + actions (Refresh / Export PDF / Share).
//   - 7 collapsible sections, OPEN BY DEFAULT (founder spec).
//   - Skeleton placeholders while computing.
//   - Brand-purple #9000F0 accents, Changa One section labels.
//
// Rules-of-Hooks: all hooks called unconditionally at the top of the
// component, gating happens after the hook section. Lesson from
// LabPaywallSurface bug.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  RefreshCw,
  Download,
  Share2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MapPin,
  Calendar,
  Layers,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { DossierSections, ProDossierRow } from '@/lib/lab/dossier/dossier-types'
import DossierShareModal from './DossierShareModal'

interface ProDossierProps {
  /** The user's experience this Dossier is built for. */
  experienceReportId: string
  /** Optional ownerLabel for personalized header (e.g., first name). */
  ownerLabel?: string
}

var BRAND_PURPLE = '#9000F0'

export function ProDossier(props: ProDossierProps) {
  var [row, setRow] = useState<ProDossierRow | null>(null)
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [refreshing, setRefreshing] = useState(false)
  var [shareOpen, setShareOpen] = useState(false)
  var [openSections, setOpenSections] = useState<Record<string, boolean>>({
    closest_reports: true,
    phen_lineage: true,
    geographic_neighbors: true,
    temporal_neighbors: true,
    descriptor_matches: true,
    rarity_percentile: true,
    time_machine: true,
  })

  // V11.17.71 — Rules of Hooks compliance: all hooks first; bailouts
  // and conditional rendering come AFTER the hook block.

  var fetchDossier = useCallback(async function () {
    setError(null)
    try {
      var sessionResp = await supabase.auth.getSession()
      var session = sessionResp.data.session
      if (!session) { setLoading(false); setError('not_authenticated'); return }
      var resp = await fetch(
        '/api/lab/dossier?experienceReportId=' + encodeURIComponent(props.experienceReportId),
        { headers: { Authorization: 'Bearer ' + session.access_token } },
      )
      if (resp.status === 403) { setLoading(false); setError('pro_tier_required'); return }
      if (!resp.ok) { setLoading(false); setError('fetch_failed'); return }
      var json = await resp.json()
      setRow(json.dossier as ProDossierRow)
      setLoading(false)
    } catch (_e) {
      setLoading(false)
      setError('fetch_failed')
    }
  }, [props.experienceReportId])

  var recompute = useCallback(async function () {
    setRefreshing(true)
    try {
      var sessionResp = await supabase.auth.getSession()
      var session = sessionResp.data.session
      if (!session) return
      var resp = await fetch(
        '/api/lab/dossier/recompute?experienceReportId=' + encodeURIComponent(props.experienceReportId),
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + session.access_token },
        },
      )
      if (resp.ok) {
        var json = await resp.json()
        setRow(json.dossier as ProDossierRow)
      }
    } finally {
      setRefreshing(false)
    }
  }, [props.experienceReportId])

  var openExportPdf = useCallback(async function () {
    if (!row) return
    var sessionResp = await supabase.auth.getSession()
    var session = sessionResp.data.session
    if (!session) return
    // Open in new tab; the response is HTML the browser can print/save as PDF.
    var url = '/api/lab/dossier/' + row.id + '/export-pdf'
    var resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + session.access_token },
    })
    if (!resp.ok) return
    var html = await resp.text()
    var blob = new Blob([html], { type: 'text/html' })
    var blobUrl = URL.createObjectURL(blob)
    window.open(blobUrl, '_blank', 'noopener,noreferrer')
  }, [row])

  var toggleSection = useCallback(function (k: string) {
    setOpenSections(function (prev) {
      var next = Object.assign({}, prev)
      next[k] = !next[k]
      return next
    })
  }, [])

  useEffect(function () {
    setLoading(true)
    setRow(null)
    fetchDossier()
  }, [fetchDossier])

  // ── Gate checks AFTER all hooks ───────────────────────────────────
  if (loading) {
    return <DossierSkeleton />
  }
  if (error === 'pro_tier_required') {
    return null // Parent renders LabPaywallSurface in this case.
  }
  if (error || !row) {
    return (
      <div className="rounded-2xl border border-red-700/40 bg-red-950/20 p-5 text-sm text-red-200">
        Dossier unavailable. {error === 'fetch_failed' ? 'Please try again.' : ''}
      </div>
    )
  }

  var sections = row.sections_json
  var meta = sections.meta

  return (
    <section
      aria-label="Pro Dossier"
      className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4"
    >
      {/* ─── Header strip ─── */}
      <div
        className="rounded-2xl border border-purple-700/40 bg-gradient-to-br from-purple-950/40 via-gray-950/40 to-gray-950/60 p-5 sm:p-6 mb-4"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p
              className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-1"
              style={{ color: BRAND_PURPLE, fontFamily: "'Changa One', system-ui, sans-serif" }}
            >
              The Dossier
            </p>
            <h2
              className="text-lg sm:text-xl font-semibold text-white"
              style={{ fontFamily: "'Changa One', system-ui, sans-serif" }}
            >
              {meta.experience_title}
            </h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-[11px] text-gray-400">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {meta.experience_location_label}
              </span>
              {meta.experience_year !== null && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {meta.experience_year}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Layers className="w-3 h-3" /> {meta.sub_pattern_tag}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={recompute}
              disabled={refreshing}
              title="Recompute now"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-purple-200 bg-purple-600/15 border border-purple-500/40 hover:bg-purple-600/25 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={'w-3.5 h-3.5 ' + (refreshing ? 'animate-spin' : '')} />
              Refresh
            </button>
            <button
              type="button"
              onClick={openExportPdf}
              title="Export as PDF"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-purple-200 bg-purple-600/15 border border-purple-500/40 hover:bg-purple-600/25 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              PDF
            </button>
            <button
              type="button"
              onClick={function () { setShareOpen(true) }}
              title="Share this Dossier"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white bg-purple-600 hover:bg-purple-500 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </div>
        </div>
        <div className="text-[10px] text-gray-500 font-mono">
          Computed {meta.computed_at_iso.slice(0, 10)} · Archive {meta.archive_size_at_compute.toLocaleString()} reports · checksum {meta.checksum.substring(0, 8)}
        </div>
      </div>

      {/* ─── The seven sections ─── */}
      <DossierSectionCard
        title="Closest reports"
        sectionKey="closest_reports"
        isOpen={openSections.closest_reports}
        onToggle={toggleSection}
        caption={sections.closest_reports.caption}
        sparse={sections.closest_reports.data_sparse}
      >
        {sections.closest_reports.reports.length === 0 ? null : (
          <ol className="space-y-3">
            {sections.closest_reports.reports.map(function (r, i) {
              return (
                <li key={r.id} className="rounded-lg border border-gray-800/60 bg-gray-900/30 p-3">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <Link
                      href={'/report/' + (r.slug || r.id)}
                      className="text-sm font-semibold text-white hover:text-purple-200 transition-colors"
                    >
                      {i + 1}. {r.title}
                    </Link>
                    <span className="text-[10px] text-purple-300 font-mono flex-shrink-0">
                      {r.composite_score}/100
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-1.5">
                    {r.year !== null ? r.year + ' · ' : ''}
                    {r.location_label} · <span className="font-mono">{r.sub_pattern_tag}</span>
                  </p>
                  {r.snippet && (
                    <p className="text-xs text-gray-300 leading-relaxed">
                      &ldquo;{r.snippet}&rdquo;
                    </p>
                  )}
                  <p className="text-[10px] text-gray-500 font-mono mt-1.5">
                    descriptor {r.signals.descriptor_overlap} · geo {r.signals.geo_proximity} · temporal {r.signals.temporal_proximity}
                    {r.distance_mi !== null ? ' · ' + r.distance_mi + ' mi' : ''}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </DossierSectionCard>

      <DossierSectionCard
        title="Phenomenology lineage"
        sectionKey="phen_lineage"
        isOpen={openSections.phen_lineage}
        onToggle={toggleSection}
        caption={sections.phen_lineage.caption}
        sparse={sections.phen_lineage.data_sparse}
      >
        {sections.phen_lineage.inheritances.length === 0 ? null : (
          <ul className="space-y-3">
            {sections.phen_lineage.inheritances.map(function (l) {
              return (
                <li key={l.sub_pattern_id} className="rounded-lg border border-gray-800/60 bg-gray-900/30 p-3">
                  <p className="text-sm text-white">
                    Your account fits the <span className="text-purple-300 font-semibold">{l.label}</span>{' '}
                    sub-pattern ({l.matched_signals} of {l.total_signals} signals match).
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Signal cites: {l.signal_cites.join(' · ')}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </DossierSectionCard>

      <DossierSectionCard
        title="Geographic neighbors"
        sectionKey="geographic_neighbors"
        isOpen={openSections.geographic_neighbors}
        onToggle={toggleSection}
        caption={sections.geographic_neighbors.caption}
        sparse={sections.geographic_neighbors.data_sparse}
      >
        {sections.geographic_neighbors.total_count === 0 ? null : (
          <>
            <p className="text-sm text-gray-200 mb-3">
              <span className="text-2xl font-bold text-white">{sections.geographic_neighbors.total_count}</span>
              {' '}reports within {sections.geographic_neighbors.radius_mi} miles.
            </p>
            <ul className="space-y-1.5 text-xs text-gray-300">
              {sections.geographic_neighbors.buckets.map(function (b) {
                return (
                  <li key={b.sub_pattern_tag} className="flex justify-between font-mono">
                    <span>{b.sub_pattern_tag}</span>
                    <span className="text-purple-300">{b.count}</span>
                  </li>
                )
              })}
            </ul>
            {sections.geographic_neighbors.center_lat !== null &&
             sections.geographic_neighbors.center_lng !== null && (
              <p className="text-[10px] text-gray-500 font-mono mt-3">
                Centered at {sections.geographic_neighbors.center_lat.toFixed(3)},{' '}
                {sections.geographic_neighbors.center_lng.toFixed(3)}.
              </p>
            )}
          </>
        )}
      </DossierSectionCard>

      <DossierSectionCard
        title="Temporal neighbors"
        sectionKey="temporal_neighbors"
        isOpen={openSections.temporal_neighbors}
        onToggle={toggleSection}
        caption={sections.temporal_neighbors.caption}
        sparse={sections.temporal_neighbors.data_sparse}
      >
        <div className="grid grid-cols-3 gap-3 text-center">
          <TemporalStat label={sections.temporal_neighbors.decade_label || '—'} count={sections.temporal_neighbors.decade_count} sublabel="in decade" />
          <TemporalStat label={sections.temporal_neighbors.month_label || '—'} count={sections.temporal_neighbors.month_count} sublabel="in month" />
          <TemporalStat label={sections.temporal_neighbors.hour_window_label || '—'} count={sections.temporal_neighbors.hour_window_count} sublabel="in hour window" />
        </div>
      </DossierSectionCard>

      <DossierSectionCard
        title="Descriptor matches"
        sectionKey="descriptor_matches"
        isOpen={openSections.descriptor_matches}
        onToggle={toggleSection}
        caption={sections.descriptor_matches.caption}
        sparse={sections.descriptor_matches.data_sparse}
      >
        {sections.descriptor_matches.matches.length === 0 ? null : (
          <ul className="space-y-3">
            {sections.descriptor_matches.matches.map(function (d) {
              return (
                <li key={d.family}>
                  <div className="flex items-baseline justify-between text-sm mb-1">
                    <span className="text-white">{d.label}</span>
                    <span className="text-purple-300 font-mono">{d.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-800/60 overflow-hidden">
                    <div
                      style={{ width: d.pct + '%', backgroundColor: BRAND_PURPLE }}
                      className="h-full"
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                    {d.numerator} of {d.denominator} reports
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </DossierSectionCard>

      <DossierSectionCard
        title="Rarity percentile"
        sectionKey="rarity_percentile"
        isOpen={openSections.rarity_percentile}
        onToggle={toggleSection}
        caption={sections.rarity_percentile.caption}
        sparse={sections.rarity_percentile.data_sparse}
      >
        {!sections.rarity_percentile.data_sparse && (
          <>
            <div className="flex items-baseline justify-center gap-2 mb-3">
              <span
                className="text-5xl font-bold"
                style={{ color: BRAND_PURPLE, fontFamily: "'Changa One', system-ui, sans-serif" }}
              >
                {sections.rarity_percentile.percentile}
              </span>
              <span className="text-lg text-gray-400">th percentile</span>
            </div>
            <p className="text-[11px] text-gray-500 font-mono text-center">
              {sections.rarity_percentile.method}
              <br />
              Corpus size {sections.rarity_percentile.corpus_size.toLocaleString()} · {sections.rarity_percentile.descriptor_count} user descriptors
            </p>
          </>
        )}
      </DossierSectionCard>

      <DossierSectionCard
        title="Time-machine context"
        sectionKey="time_machine"
        isOpen={openSections.time_machine}
        onToggle={toggleSection}
        caption={sections.time_machine.caption}
        sparse={sections.time_machine.data_sparse}
      >
        <ul className="space-y-2 text-sm text-gray-200">
          {sections.time_machine.moon_phase && (
            <li>
              Moon phase: <span className="text-white font-medium">{sections.time_machine.moon_phase.phase}</span>{' '}
              ({sections.time_machine.moon_phase.illumination_pct}% illumination).
            </li>
          )}
          {sections.time_machine.meteor_shower && (
            <li>
              Active meteor shower:{' '}
              <span className="text-white font-medium">{sections.time_machine.meteor_shower.name}</span>{' '}
              (~{sections.time_machine.meteor_shower.rate_per_hour} per hour).
            </li>
          )}
          {sections.time_machine.contemporaneous_reports.length > 0 && (
            <li>
              <span className="text-gray-300">Other Archive reports within 7 days + 100 mi:</span>
              <ul className="mt-2 space-y-1 ml-3">
                {sections.time_machine.contemporaneous_reports.map(function (r) {
                  return (
                    <li key={r.id} className="text-xs">
                      <Link
                        href={'/report/' + (r.slug || r.id)}
                        className="text-purple-300 hover:text-white transition-colors inline-flex items-center gap-1"
                      >
                        {r.title}
                        <ExternalLink className="w-3 h-3" />
                      </Link>{' '}
                      <span className="text-gray-500">— {r.event_date || 'undated'} · {r.distance_mi || '?'} mi · {r.location_label}</span>
                    </li>
                  )
                })}
              </ul>
            </li>
          )}
          {sections.time_machine.notes.length > 0 && (
            <li>
              <details>
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                  Data gap notes
                </summary>
                <ul className="mt-2 ml-3 space-y-1 text-xs text-gray-500">
                  {sections.time_machine.notes.map(function (n, i) {
                    return <li key={i} className="font-mono">{n}</li>
                  })}
                </ul>
              </details>
            </li>
          )}
        </ul>
      </DossierSectionCard>

      {shareOpen && row && (
        <DossierShareModal
          row={row}
          onClose={function () { setShareOpen(false) }}
          onUpdated={function (r) { setRow(r) }}
        />
      )}
    </section>
  )
}

/* ─── Sub-components ───────────────────────────────────────────────── */

interface DossierSectionCardProps {
  title: string
  sectionKey: string
  isOpen: boolean
  onToggle: (k: string) => void
  caption: string
  sparse: boolean
  children: React.ReactNode
}

function DossierSectionCard(props: DossierSectionCardProps) {
  return (
    <article className="rounded-2xl border border-gray-800/60 bg-gray-950/40 mb-3 overflow-hidden">
      <button
        type="button"
        onClick={function () { props.onToggle(props.sectionKey) }}
        aria-expanded={props.isOpen}
        className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 hover:bg-purple-950/20 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <h3
            className="text-sm font-semibold mb-1"
            style={{ color: BRAND_PURPLE, fontFamily: "'Changa One', system-ui, sans-serif", letterSpacing: '0.5px' }}
          >
            {props.title}
          </h3>
          <p className="text-xs text-gray-400 italic leading-relaxed">{props.caption}</p>
        </div>
        {props.isOpen
          ? <ChevronUp className="w-5 h-5 text-gray-500 flex-shrink-0" />
          : <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
        }
      </button>
      {props.isOpen && (
        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-gray-800/40">
          {props.sparse ? (
            <p className="text-xs text-gray-500 italic flex items-center gap-2 pt-3">
              <AlertCircle className="w-3.5 h-3.5" />
              Data sparse — rendered without a numeric claim per Dossier integrity rules.
            </p>
          ) : (
            <div className="pt-3">{props.children}</div>
          )}
        </div>
      )}
    </article>
  )
}

function TemporalStat(props: { label: string; count: number; sublabel: string }) {
  return (
    <div className="rounded-lg border border-gray-800/60 bg-gray-900/30 p-3">
      <p className="text-2xl font-bold text-white" style={{ fontFamily: "'Changa One', system-ui, sans-serif" }}>
        {props.count}
      </p>
      <p className="text-[10px] text-gray-400 mt-0.5">{props.sublabel}</p>
      <p className="text-[11px] text-purple-300 font-mono mt-1">{props.label}</p>
    </div>
  )
}

function DossierSkeleton() {
  return (
    <section className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <div className="rounded-2xl border border-purple-700/40 bg-gradient-to-br from-purple-950/40 to-gray-950/60 p-5 mb-4">
        <div className="h-3 w-24 rounded bg-purple-800/40 mb-2" />
        <div className="h-5 w-2/3 rounded bg-gray-700/40 mb-2" />
        <div className="h-3 w-1/2 rounded bg-gray-800/40" />
      </div>
      {[0, 1, 2, 3, 4, 5, 6].map(function (i) {
        return (
          <div key={i} className="rounded-2xl border border-gray-800/60 bg-gray-950/40 p-5 mb-3">
            <div className="h-4 w-1/3 rounded bg-purple-900/30 mb-2" />
            <div className="h-3 w-2/3 rounded bg-gray-800/40 mb-3" />
            <div className="space-y-2">
              <div className="h-2 w-full rounded bg-gray-800/30" />
              <div className="h-2 w-5/6 rounded bg-gray-800/30" />
              <div className="h-2 w-4/6 rounded bg-gray-800/30" />
            </div>
          </div>
        )
      })}
    </section>
  )
}

export default ProDossier
