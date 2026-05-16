'use client'

/**
 * /admin/ingest-audit — V10.8.D
 *
 * Dashboard for the ingestion_audit table populated by
 * validateReportBeforeInsert. Each row is one flag — warning or
 * error — emitted at insert time against a specific report and
 * adapter.
 *
 * Designed to surface regressed regexes / broken adapters via a
 * sudden spike in code frequency. The top-5 codes tile is the
 * canonical "is mass ingest healthy?" glance.
 */

import React, { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import {
  AlertTriangle,
  ShieldAlert,
  Filter,
  RefreshCw,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import { supabase } from '@/lib/supabase'

interface AuditRow {
  id: string
  report_id: string | null
  adapter: string
  severity: 'warning' | 'error'
  code: string
  message: string
  field: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

interface Stats {
  window_days: number
  total_last_7d: number
  warnings_last_7d: number
  errors_last_7d: number
  top_codes: Array<{ code: string; count: number }>
  top_adapters: Array<{ adapter: string; count: number }>
  quarantine_rows: number
}

interface FilterOptions {
  codes: string[]
  adapters: string[]
}

export default function IngestAuditAdminPage() {
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [codeFilter, setCodeFilter] = useState<string>('')
  const [adapterFilter, setAdapterFilter] = useState<string>('')
  const [sinceDays, setSinceDays] = useState<number>(7)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ codes: [], adapters: [] })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) { setError('Sign in as admin'); setLoading(false); return }
      const qs = new URLSearchParams({
        since_days: String(sinceDays),
        limit: '100',
      })
      if (severityFilter) qs.set('severity', severityFilter)
      if (codeFilter) qs.set('code', codeFilter)
      if (adapterFilter) qs.set('adapter', adapterFilter)

      const resp = await fetch('/api/admin/ingest-audit?' + qs.toString(), {
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
      setFilterOptions(data.filter_options || { codes: [], adapters: [] })
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [severityFilter, codeFilter, adapterFilter, sinceDays])

  useEffect(() => { load() }, [load])

  return (
    <>
      <Head>
        <title>Ingestion Audit | Admin | Paradocs</title>
      </Head>
      <AdminLayout
        title="Ingestion Audit"
        subtitle="Validation flags emitted by validateReportBeforeInsert at ingest. Errors quarantine the row; warnings let it through with a paper trail."
      >
        {/* Top stats tile — designed to be the at-a-glance "is mass
            ingest healthy?" answer for the last 7 days. */}
        {stats && (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <StatTile label="Total (7d)" value={stats.total_last_7d} />
            <StatTile label="Warnings" value={stats.warnings_last_7d} tint="amber" />
            <StatTile label="Errors" value={stats.errors_last_7d} tint="red" />
            <StatTile label="Quarantine queue" value={stats.quarantine_rows} tint="red" />
          </section>
        )}

        {/* Top codes / adapters strip */}
        {stats && (stats.top_codes.length > 0 || stats.top_adapters.length > 0) && (
          <section className="grid md:grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Top codes (last 7d)</h3>
              {stats.top_codes.length === 0 ? (
                <div className="text-xs text-gray-500">No flags in window</div>
              ) : (
                <ul className="space-y-1.5">
                  {stats.top_codes.map(c => (
                    <li key={c.code} className="flex items-center justify-between gap-2 text-sm">
                      <button
                        onClick={() => setCodeFilter(c.code)}
                        className="font-mono text-xs text-cyan-300 hover:text-cyan-200 truncate text-left"
                      >
                        {c.code}
                      </button>
                      <span className="text-gray-400 tabular-nums">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Top adapters (last 7d)</h3>
              {stats.top_adapters.length === 0 ? (
                <div className="text-xs text-gray-500">No flags in window</div>
              ) : (
                <ul className="space-y-1.5">
                  {stats.top_adapters.map(a => (
                    <li key={a.adapter} className="flex items-center justify-between gap-2 text-sm">
                      <button
                        onClick={() => setAdapterFilter(a.adapter)}
                        className="font-mono text-xs text-cyan-300 hover:text-cyan-200 truncate text-left"
                      >
                        {a.adapter}
                      </button>
                      <span className="text-gray-400 tabular-nums">{a.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Filter row */}
        <section className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="bg-gray-950 border border-gray-700 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">All severities</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
          </select>
          <select
            value={codeFilter}
            onChange={e => setCodeFilter(e.target.value)}
            className="bg-gray-950 border border-gray-700 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">All codes</option>
            {filterOptions.codes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={adapterFilter}
            onChange={e => setAdapterFilter(e.target.value)}
            className="bg-gray-950 border border-gray-700 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">All adapters</option>
            {filterOptions.adapters.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            value={String(sinceDays)}
            onChange={e => setSinceDays(parseInt(e.target.value, 10))}
            className="bg-gray-950 border border-gray-700 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="1">Last 24h</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          {(severityFilter || codeFilter || adapterFilter) && (
            <button
              onClick={() => { setSeverityFilter(''); setCodeFilter(''); setAdapterFilter('') }}
              className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
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
            No audit rows for this filter window.
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map(row => (
              <article
                key={row.id}
                className={
                  'bg-gray-900/60 border rounded-xl p-3 ' +
                  (row.severity === 'error' ? 'border-red-700/40' : 'border-amber-700/30')
                }
              >
                <header className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {row.severity === 'error' ? (
                      <ShieldAlert className="w-4 h-4 text-red-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="font-mono text-xs text-cyan-300">{row.code}</span>
                    <span className="text-[10px] uppercase tracking-wider text-gray-500">
                      {row.adapter}
                    </span>
                    {row.field && (
                      <span className="text-[10px] uppercase tracking-wider text-gray-500">
                        field: {row.field}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <time className="text-[10px] text-gray-500 tabular-nums">
                      {new Date(row.created_at).toLocaleString()}
                    </time>
                    {row.report_id && (
                      <Link
                        href={'/admin/reports/' + row.report_id}
                        className="text-[10px] text-cyan-400 hover:text-cyan-200 inline-flex items-center gap-1"
                      >
                        report <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </header>
                <p className="text-sm text-gray-200">{row.message}</p>
                {row.payload && Object.keys(row.payload).length > 0 && (
                  <pre className="mt-2 text-[11px] font-mono text-gray-400 bg-black/30 rounded p-2 overflow-x-auto">
                    {JSON.stringify(row.payload, null, 2)}
                  </pre>
                )}
              </article>
            ))}
          </div>
        )}
      </AdminLayout>
    </>
  )
}

function StatTile({ label, value, tint }: { label: string; value: number; tint?: 'amber' | 'red' | 'emerald' }) {
  var tintClass = 'border-gray-800 text-gray-200'
  if (tint === 'amber') tintClass = 'border-amber-700/40 text-amber-200'
  if (tint === 'red') tintClass = 'border-red-700/40 text-red-200'
  if (tint === 'emerald') tintClass = 'border-emerald-700/40 text-emerald-200'

  return (
    <div className={'bg-gray-900/60 border rounded-xl p-3 ' + tintClass}>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}
