'use client'

/**
 * /admin/location-audit — V10.6.14
 *
 * Surfaces reports where the structured location columns disagree
 * with the location named in the narrative description. For each
 * mismatch the admin sees a side-by-side and can:
 *   - Accept narrative (writes narrative location to the DB)
 *   - Skip (leaves the row alone — comes back next scan)
 *   - Open report (jumps to /report/[slug] for full context)
 *
 * Paginates through the corpus via the `offset` param on the audit
 * endpoint. Each "Load more" scans the next 200 rows.
 */

import React, { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { Loader2, ShieldAlert, ExternalLink, Check, X, MapPin } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import { supabase } from '@/lib/supabase'

interface Mismatch {
  id: string
  slug: string
  title: string | null
  db_city: string | null
  db_state: string | null
  db_country: string | null
  narrative_city: string | null
  narrative_state: string | null
  narrative_country: string | null
  source_label: string | null
}

interface ScanResponse {
  scanned: number
  parsed: number
  mismatched: number
  mismatches: Mismatch[]
  next_offset: number
}

export default function LocationAuditPage() {
  const [authState, setAuthState] = useState<'loading' | 'unauthorized' | 'not-admin' | 'admin'>('loading')
  const [scanning, setScanning] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const [items, setItems] = useState<Mismatch[]>([])
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [offset, setOffset] = useState(0)
  const [totalScanned, setTotalScanned] = useState(0)
  const [totalParsed, setTotalParsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Auth gate
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sess = await supabase.auth.getSession()
      const session = sess.data.session
      if (!session) {
        if (!cancelled) setAuthState('unauthorized')
        return
      }
      const { data: profile } = await (supabase.from('profiles') as any)
        .select('role')
        .eq('id', session.user.id)
        .single()
      if (cancelled) return
      if (!profile || (profile as any).role !== 'admin') {
        setAuthState('not-admin')
      } else {
        setAuthState('admin')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const scanNext = useCallback(async () => {
    if (scanning) return
    setScanning(true)
    setError(null)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) { setError('No session'); setScanning(false); return }
      const resp = await fetch('/api/admin/audit-location-mismatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ limit: 200, offset }),
      })
      if (!resp.ok) {
        const t = await resp.text().catch(() => '')
        setError('HTTP ' + resp.status + ' — ' + t)
        setScanning(false)
        return
      }
      const data = (await resp.json()) as ScanResponse
      setItems(prev => prev.concat(data.mismatches))
      setOffset(data.next_offset)
      setTotalScanned(s => s + data.scanned)
      setTotalParsed(p => p + data.parsed)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setScanning(false)
    }
  }, [scanning, offset])

  const applyFix = useCallback(async (m: Mismatch) => {
    if (applying) return
    setApplying(m.id)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) return
      const resp = await fetch('/api/admin/fix-location-mismatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          id: m.id,
          city: m.narrative_city,
          state_province: m.narrative_state,
          country: m.narrative_country,
          // V10.6.14 — clear cached lat/lng so map re-geocodes from
          // the corrected city/state on next render.
          latitude: null,
          longitude: null,
          location_name: [m.narrative_city, m.narrative_state, m.narrative_country].filter(Boolean).join(', ') || null,
        }),
      })
      if (resp.ok) {
        setResolved(prev => new Set(prev).add(m.id))
      } else {
        const t = await resp.text().catch(() => '')
        setError('Fix failed for ' + m.slug + ': ' + t)
      }
    } finally {
      setApplying(null)
    }
  }, [applying])

  const skipRow = (id: string) => {
    setSkipped(prev => new Set(prev).add(id))
  }

  if (authState === 'loading') {
    return (
      <AdminLayout title="Location Audit">
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Checking admin…
        </div>
      </AdminLayout>
    )
  }
  if (authState === 'unauthorized' || authState === 'not-admin') {
    return (
      <AdminLayout title="Location Audit">
        <div className="max-w-md mx-auto py-16 text-center">
          <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <p className="text-gray-200">Admin only.</p>
        </div>
      </AdminLayout>
    )
  }

  const visibleItems = items.filter(m => !resolved.has(m.id) && !skipped.has(m.id))

  return (
    <AdminLayout title="Location Audit">
      <Head>
        <title>Location Audit | Paradocs Admin</title>
      </Head>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-white">Location Audit</h1>
          <p className="text-sm text-gray-400 mt-1">
            Detects reports where the structured <code className="text-gray-300">city / state_province / country</code> columns
            disagree with the location named in the narrative description. These mis-geocoded rows have been polluting
            the report page, map pin, OG card, and AI analysis. Click <em>Accept narrative</em> to write the narrative's
            location back to the DB.
          </p>
        </header>

        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 mb-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-gray-400">
              <div>Scanned: <span className="text-gray-100 font-semibold">{totalScanned}</span></div>
              <div>Parsed (OBERF/NDERF header present): <span className="text-gray-100 font-semibold">{totalParsed}</span></div>
              <div>Mismatches found: <span className="text-amber-300 font-semibold">{items.length}</span></div>
              <div>Resolved this session: <span className="text-emerald-300 font-semibold">{resolved.size}</span></div>
              <div>Skipped this session: <span className="text-gray-300 font-semibold">{skipped.size}</span></div>
            </div>
            <button
              onClick={scanNext}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {totalScanned === 0 ? 'Scan first 200 rows' : 'Scan next 200 rows'}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-xs text-rose-300">{error}</p>
          )}
        </section>

        {visibleItems.length === 0 && totalScanned > 0 && (
          <p className="text-sm text-gray-500 italic">
            No remaining mismatches in the scanned range. Scan more or come back tomorrow.
          </p>
        )}

        <ul className="space-y-3">
          {visibleItems.map(m => (
            <li key={m.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <Link href={'/report/' + m.slug} target="_blank" className="text-sm font-semibold text-white hover:text-purple-300 inline-flex items-center gap-1.5">
                    {m.title || m.slug}
                    <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                  </Link>
                  <p className="text-[11px] text-gray-500 mt-0.5">{m.source_label || 'unknown source'} · {m.slug}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                <div className="rounded-lg bg-rose-950/20 border border-rose-700/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-rose-300 mb-1.5">DB (current)</p>
                  <p className="text-gray-100">
                    {m.db_city || <span className="text-gray-500 italic">no city</span>}
                  </p>
                  <p className="text-gray-100">
                    {m.db_state || <span className="text-gray-500 italic">no state</span>}
                  </p>
                  <p className="text-gray-300">
                    {m.db_country || <span className="text-gray-500 italic">no country</span>}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-950/20 border border-emerald-700/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-emerald-300 mb-1.5">Narrative (proposed)</p>
                  <p className="text-gray-100">
                    {m.narrative_city || <span className="text-gray-500 italic">no city</span>}
                  </p>
                  <p className="text-gray-100">
                    {m.narrative_state || <span className="text-gray-500 italic">no state</span>}
                  </p>
                  <p className="text-gray-300">
                    {m.narrative_country || <span className="text-gray-500 italic">no country</span>}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => applyFix(m)}
                  disabled={applying === m.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
                >
                  {applying === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Accept narrative
                </button>
                <button
                  onClick={() => skipRow(m.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-semibold transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Skip
                </button>
                <Link
                  href={'/report/' + m.slug}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-semibold transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open report
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AdminLayout>
  )
}
