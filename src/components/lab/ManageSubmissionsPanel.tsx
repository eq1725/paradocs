'use client'

// V11.17.75 - Tier 3E cleanup
//
// ManageSubmissionsPanel — extracted from the legacy MyRecordTab as
// part of the Tier 3E split. Self-contained: owns the trigger pill,
// the slide-up modal (mobile) / centered dialog (desktop), the row-
// level Edit/Delete affordances, and the data fetch that backs the
// list of submissions.
//
// In Tier 2B, DossierHeader took over the multi-submission switcher
// (the focus-flipping chips). What remains here is the "manage your
// submitted reports" surface — the canonical place to rename, edit
// or remove a submission. We surface it as a small "Manage" pill so
// it stays discoverable without re-creating the submission-switcher
// duplication that prompted this cleanup.
//
// Data path: same Supabase query MyRecordTab used (reports table,
// submitted_by = user, source_type = user_submission, status != deleted,
// limit 50). Lives inside the component so the panel works whether
// or not the parent (lab.tsx) has loaded reports separately.
//
// Delete: posts to /api/reports/[slug]/delete (same endpoint the
// Cases tab uses). On success calls onDeleted(id) so any parent
// observer can react (refetch / clear focus / etc.).
//
// Edit: opens the existing EditReportModal in place; on save calls
// onEdited() so the parent can refetch its own view of the reports.
//
// SWC: var + function() form. Default + named exports.

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  X as XIcon,
  Trash2,
  Loader2,
  Pencil,
  Plus,
  ChevronRight,
  Settings as SettingsIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import CategoryIcon from '@/components/ui/CategoryIcon'
import EditReportModal from '@/components/dashboard/EditReportModal'

// ─── Types ───────────────────────────────────────────────────────────

interface SubmissionRow {
  id: string
  title?: string | null
  slug?: string | null
  category?: string | null
  description?: string | null
  summary?: string | null
  status?: string | null
  event_date?: string | null
  event_date_raw?: string | null
  event_date_precision?: string | null
  city?: string | null
  state_province?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null
  location_description?: string | null
  visibility?: string | null
  anonymous_submission?: boolean | null
  created_at?: string | null
  phenomenon_type?: { name?: string } | null
}

export interface ManageSubmissionsPanelProps {
  /**
   * Optional callback fired after a row is deleted. The parent
   * (lab.tsx) uses this to drop the row from its local reports
   * state and re-focus.
   */
  onDeleted?: (deletedId: string) => void
  /**
   * Optional callback fired after a row is saved through the edit
   * modal. The parent uses this to refetch reports so any focused
   * dossier reflects the new fields.
   */
  onEdited?: () => void
}

// ─── Main component (trigger + panel) ────────────────────────────────

/**
 * Self-contained panel: renders the small trigger pill inline, and
 * (when opened) the modal listing all of the user's submissions with
 * Edit and two-step Delete affordances.
 */
export function ManageSubmissionsPanel(props: ManageSubmissionsPanelProps) {
  var [open, setOpen] = useState(false)
  var [reports, setReports] = useState<SubmissionRow[]>([])
  var [loading, setLoading] = useState(false)
  var [loadError, setLoadError] = useState<string | null>(null)

  // Lazy-load reports only when the panel is opened — avoids an
  // extra Supabase round-trip on every page render.
  var loadReports = useCallback(function () {
    setLoading(true)
    setLoadError(null)
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session) {
        setLoadError('Sign in to manage your submissions.')
        setLoading(false)
        return
      }
      supabase
        .from('reports')
        .select(`
          id, title, slug, category, description, summary, status,
          location_description, city, state_province, country,
          latitude, longitude, event_date, event_date_raw, event_date_precision,
          visibility, anonymous_submission, created_at,
          phenomenon_type:phenomenon_types(name)
        `)
        .eq('submitted_by', session.user.id)
        .eq('source_type', 'user_submission')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false })
        .limit(50)
        .then(function (r: any) {
          if (r.error) {
            setLoadError(r.error.message || 'Could not load your submissions.')
          } else if (r.data) {
            setReports(r.data as SubmissionRow[])
          }
          setLoading(false)
        })
    })
  }, [])

  useEffect(function () {
    if (open) loadReports()
  }, [open, loadReports])

  // Close on Escape; lock body scroll while open.
  useEffect(function () {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return function () {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  function handleDeleted(deletedId: string) {
    setReports(function (prev) { return prev.filter(function (r) { return r.id !== deletedId }) })
    if (props.onDeleted) props.onDeleted(deletedId)
  }

  function handleEdited() {
    // Refetch our own list so the row reflects the new fields.
    loadReports()
    if (props.onEdited) props.onEdited()
  }

  return (
    <>
      {/* Inline trigger pill — small, archival, never demanding. */}
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-2">
        <button
          type="button"
          onClick={function () { setOpen(true) }}
          aria-label="Manage your submissions"
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase text-gray-400 hover:text-purple-300 transition-colors"
        >
          <SettingsIcon className="w-3 h-3" />
          Manage your submissions
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={function () { setOpen(false) }}
        >
          <div
            className="w-full sm:max-w-lg bg-gray-950 border border-gray-800 sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[88dvh] flex flex-col"
            onClick={function (e) { e.stopPropagation() }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div>
                <h2 className="text-base font-semibold text-white">Manage your submissions</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {loading
                    ? 'Loading…'
                    : reports.length + ' ' + (reports.length === 1 ? 'experience' : 'experiences') + ' shared'}
                </p>
              </div>
              <button
                type="button"
                onClick={function () { setOpen(false) }}
                aria-label="Close manage submissions"
                className="w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {loading && (
                <div className="flex items-center justify-center py-10 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}
              {!loading && loadError && (
                <p className="text-sm text-red-300 text-center py-6">{loadError}</p>
              )}
              {!loading && !loadError && reports.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  You haven&rsquo;t shared an experience yet.
                </p>
              )}
              {!loading && !loadError && reports.map(function (r) {
                return (
                  <ManageSubmissionRow
                    key={r.id}
                    report={r}
                    onDeleted={handleDeleted}
                    onEdited={handleEdited}
                  />
                )
              })}
            </div>
            <div className="border-t border-gray-800 px-4 py-3">
              <Link
                href="/start"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-300 hover:text-purple-200"
              >
                <Plus className="w-4 h-4" />
                Share another experience
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Per-row component ───────────────────────────────────────────────

/**
 * V10.16 Phase E.1 — ManageSubmissionRow.
 *
 * Single row in the panel. Two-step inline delete (matches the iOS
 * Mail / Notes confirm pattern). Status pill on the right. Tapping
 * the title navigates to /report/[slug] for approved submissions;
 * pending submissions stay non-navigating (status pill communicates
 * why). Edit affordance opens EditReportModal.
 *
 * V11.17.75 — copied verbatim from MyRecordTab (Tier 3E extraction);
 * behavior preserved.
 */
function ManageSubmissionRow(props: { report: SubmissionRow; onDeleted: (id: string) => void; onEdited?: () => void }) {
  var r = props.report
  var [confirming, setConfirming] = useState(false)
  var [busy, setBusy] = useState(false)
  var [errMsg, setErrMsg] = useState<string | null>(null)
  var [editOpen, setEditOpen] = useState(false)

  useEffect(function () {
    if (!confirming) return
    var t = setTimeout(function () { setConfirming(false) }, 4000)
    return function () { clearTimeout(t) }
  }, [confirming])

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    if (!confirming) { setConfirming(true); return }
    setBusy(true)
    setErrMsg(null)
    supabase.auth.getSession().then(function (s) {
      var token = s.data.session ? s.data.session.access_token : null
      if (!token) { setErrMsg('Sign in again to delete.'); setBusy(false); return }
      fetch('/api/reports/' + encodeURIComponent(r.slug || '') + '/delete', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then(function (j) { throw new Error(j.error || 'Delete failed') })
          props.onDeleted(r.id)
        })
        .catch(function (e: any) {
          setErrMsg(e.message || 'Delete failed')
          setBusy(false)
          setConfirming(false)
        })
    })
  }

  var status = (r.status || 'pending') as string
  var statusLabel = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
  var clickable = status === 'approved' || status === 'published'
  var typeLabel = (r.phenomenon_type && r.phenomenon_type.name) || r.category || 'Experience'
  var date = r.event_date
    ? new Date(r.event_date).getFullYear()
    : (r.created_at ? new Date(r.created_at).toLocaleDateString() : '')

  return (
    <div className="rounded-lg bg-gray-900/60 border border-gray-800/60 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
          <CategoryIcon category={(r.category || '') as any} size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {clickable ? (
              <Link href={'/report/' + r.slug} className="text-sm font-medium text-white truncate hover:text-purple-300">
                {r.title || 'Untitled Report'}
              </Link>
            ) : (
              <span className="text-sm font-medium text-white truncate">{r.title || 'Untitled Report'}</span>
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {typeLabel}{date ? ' · ' + date : ''}
          </div>
          {errMsg && <p className="text-[10px] text-red-300 mt-1">{errMsg}</p>}
        </div>
        <span className={'flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ' +
          (status === 'approved' || status === 'published'
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
            : status === 'rejected'
              ? 'bg-red-500/10 border-red-500/40 text-red-300'
              : 'bg-amber-500/10 border-amber-500/40 text-amber-300')}>
          {statusLabel}
        </span>
        <button
          type="button"
          onClick={function (e) { e.preventDefault(); e.stopPropagation(); setEditOpen(true) }}
          aria-label="Edit this submission"
          className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:text-purple-300 hover:bg-purple-500/10"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          aria-label={confirming ? 'Tap again to confirm delete' : 'Delete this submission'}
          className={
            'flex-shrink-0 inline-flex items-center justify-center transition-all ' +
            (confirming
              ? 'gap-1 px-2 py-1 rounded-md bg-red-500/15 border border-red-500/40 text-red-300 text-[10px] font-semibold'
              : 'w-7 h-7 rounded-md text-gray-500 hover:text-red-300 hover:bg-red-500/10')
          }
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : confirming ? (<><Trash2 className="w-3 h-3" /> Confirm</>) : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
      <EditReportModal
        open={editOpen}
        onClose={function () { setEditOpen(false) }}
        onSaved={function () { setEditOpen(false); if (props.onEdited) props.onEdited() }}
        report={r as any}
      />
    </div>
  )
}

export default ManageSubmissionsPanel
