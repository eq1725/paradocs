'use client'

/**
 * /admin/ai-audit — V10.4 Phase 1.5
 *
 * Review queue for AI-rewrite calls that failed the post-
 * generation claim-citation check. Each row shows:
 *   - source text (left)
 *   - generated output (right)
 *   - claim-check notes (what fields are unsupported)
 *   - Approve / Reject buttons
 *
 * Approve = mark as good, keep the output text shipping.
 * Reject  = mark as bad AND null the column on the owning report.
 *
 * Stats header shows pending / passed / approved / rejected /
 * bypassed counts so we can see how often the pipeline is
 * catching fabrications.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import {
  AlertTriangle, CheckCircle2, XCircle, Loader2, ExternalLink, Filter, RefreshCw,
} from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import { supabase } from '@/lib/supabase'

interface AuditRow {
  id: string
  mode: 'faithful_paraphrase' | 'editorial' | 'structural'
  prompt_version: string
  model: string
  output_field: string
  source_text: string | null
  output_text: string | null
  claim_check_passed: boolean | null
  claim_check_notes: string | null
  insufficient: boolean
  status: 'passed' | 'pending' | 'approved' | 'rejected' | 'bypassed'
  admin_review_notes: string | null
  report_id: string | null
  artifact_id: string | null
  duration_ms: number | null
  created_at: string
}

interface Stats {
  pending: number
  passed: number
  approved: number
  rejected: number
  bypassed: number
  total: number
}

export default function AiAuditAdminPage() {
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [fieldFilter, setFieldFilter] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [decisions, setDecisions] = useState<Record<string, 'approving' | 'rejecting'>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) { setError('Sign in as admin'); setLoading(false); return }
      const qs = new URLSearchParams({
        status: statusFilter,
        ...(fieldFilter ? { field: fieldFilter } : {}),
        limit: '50',
      })
      const resp = await fetch('/api/admin/ai-audit?' + qs.toString(), {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!resp.ok) {
        const b = await resp.json().catch(() => null)
        throw new Error((b && b.error) || 'HTTP ' + resp.status)
      }
      const data = await resp.json()
      setRows(data.rows || [])
      setTotal(data.total || 0)
      setStats(data.stats || null)
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, fieldFilter])

  useEffect(() => { load() }, [load])

  const decide = useCallback(async (auditId: string, decision: 'approved' | 'rejected') => {
    setDecisions(prev => ({ ...prev, [auditId]: decision === 'approved' ? 'approving' : 'rejecting' }))
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) return
      const resp = await fetch('/api/admin/ai-audit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ audit_id: auditId, decision }),
      })
      if (!resp.ok) {
        const b = await resp.json().catch(() => null)
        alert('Failed: ' + ((b && b.error) || resp.status))
        return
      }
      // Remove row from list optimistically.
      setRows(prev => prev.filter(r => r.id !== auditId))
      setTotal(prev => Math.max(0, prev - 1))
    } finally {
      setDecisions(prev => {
        const next = { ...prev }
        delete next[auditId]
        return next
      })
    }
  }, [])

  const fieldOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) set.add(r.output_field)
    return Array.from(set).sort()
  }, [rows])

  return (
    <>
      <Head>
        <title>AI Audit | Admin | Paradocs</title>
      </Head>
      <AdminLayout
        title="AI Rewrite Audit"
        subtitle="Review claim-check failures from the AI rewrite pipeline. Approve to ship, reject to null the output and force regeneration."
      >
        {/* Stats row */}
        {stats && (
          <section className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-4">
            <StatChip label="Total" value={stats.total} />
            <StatChip label="Pending" value={stats.pending} tint="amber" />
            <StatChip label="Passed" value={stats.passed} tint="emerald" />
            <StatChip label="Approved" value={stats.approved} tint="emerald" />
            <StatChip label="Rejected" value={stats.rejected} tint="red" />
            <StatChip label="Bypassed" value={stats.bypassed} tint="gray" />
          </section>
        )}

        {/* Filter row */}
        <section className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-gray-950 border border-gray-700 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="pending">Pending (failed claim-check)</option>
            <option value="passed">Passed</option>
            <option value="approved">Admin Approved</option>
            <option value="rejected">Admin Rejected</option>
            <option value="bypassed">Bypassed (editorial/structural)</option>
          </select>
          {fieldOptions.length > 0 && (
            <select
              value={fieldFilter}
              onChange={e => setFieldFilter(e.target.value)}
              className="bg-gray-950 border border-gray-700 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">All fields</option>
              {fieldOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          {/* V10.6.17 — explicit refresh. Without this you had to
              change a filter to refetch; new audit rows landing
              during an active page session weren't visible. */}
          <button
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-900 border border-gray-700 hover:bg-gray-800 disabled:opacity-40 text-xs text-gray-200 transition-colors"
            aria-label="Refresh audit rows"
            title="Refresh"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (loading ? 'animate-spin' : '')} />
            Refresh
          </button>
          <span className="text-[11px] text-gray-500 ml-auto">{total} rows</span>
        </section>

        {error && (
          <div className="mb-3 p-3 rounded-lg bg-red-950/40 border border-red-700/40 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="text-center py-16 text-gray-500 text-sm">
            No rows for this filter.
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="space-y-3">
            {rows.map(row => {
              const decision = decisions[row.id]
              return (
                <article key={row.id} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
                  <header className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wider text-gray-500">
                      <span className="font-semibold text-cyan-300">{row.output_field}</span>
                      <span>·</span>
                      <span>{row.mode}</span>
                      <span>·</span>
                      <span>{row.model}</span>
                      <span>·</span>
                      <span>v{row.prompt_version}</span>
                      <span>·</span>
                      <span>{new Date(row.created_at).toLocaleString()}</span>
                      {row.insufficient && (
                        <span className="text-amber-300 ml-1">· INSUFFICIENT</span>
                      )}
                    </div>
                    {row.report_id && (
                      <a
                        href={'/admin/reports/' + row.report_id}
                        className="text-[11px] text-purple-300 hover:text-purple-200 inline-flex items-center gap-1"
                      >
                        Report <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </header>

                  {row.claim_check_notes && (
                    <div className="mb-3 p-2 rounded-md bg-amber-950/30 border border-amber-700/40 text-[12px] text-amber-200 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <div className="whitespace-pre-wrap">{row.claim_check_notes}</div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div className="bg-gray-950/60 border border-gray-800 rounded-md p-3">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Source text</div>
                      <p className="text-[12px] text-gray-300 leading-snug whitespace-pre-wrap line-clamp-12">
                        {row.source_text || '(empty)'}
                      </p>
                    </div>
                    <div className="bg-gray-950/60 border border-gray-800 rounded-md p-3">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">AI output</div>
                      <p className="text-[12px] text-white leading-snug whitespace-pre-wrap">
                        {row.output_text || '(none)'}
                      </p>
                    </div>
                  </div>

                  {statusFilter === 'pending' && (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => decide(row.id, 'rejected')}
                        disabled={!!decision}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-red-200 bg-red-600/15 hover:bg-red-600/25 border border-red-600/40 disabled:opacity-40 transition-colors"
                      >
                        {decision === 'rejecting' ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                        Reject + null
                      </button>
                      <button
                        onClick={() => decide(row.id, 'approved')}
                        disabled={!!decision}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-emerald-200 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-600/40 disabled:opacity-40 transition-colors"
                      >
                        {decision === 'approving' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Approve + ship
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </AdminLayout>
    </>
  )
}

function StatChip(props: { label: string; value: number; tint?: 'amber' | 'emerald' | 'red' | 'gray' }) {
  const tint =
    props.tint === 'amber' ? 'text-amber-300' :
    props.tint === 'emerald' ? 'text-emerald-300' :
    props.tint === 'red' ? 'text-red-300' :
    props.tint === 'gray' ? 'text-gray-400' :
    'text-white'
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{props.label}</div>
      <div className={'mt-0.5 text-lg font-bold tabular-nums leading-none ' + tint}>{props.value}</div>
    </div>
  )
}
