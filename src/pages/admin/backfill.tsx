'use client'

/**
 * /admin/backfill — V10.6.2
 *
 * One-click runner for the V10.6 corpus refresh jobs:
 *   - Backfill paradocs_assessment (frames + open_questions)
 *   - Backfill answer_line
 *
 * Uses the admin's existing Supabase session token, so it works
 * with the old auth-shape on /api/admin/backfill-* (Bearer access
 * token + profiles.role = 'admin'). No env vars, no curl, no
 * waiting on a fresh deploy.
 *
 * Each click POSTs to the endpoint in 25-row chunks and streams
 * the response into the on-page log. "Run until done" loops until
 * the response reports zero generated + zero failed, capped at
 * 40 chunks (1000 rows) per session for safety.
 *
 * Auth gate: redirects to /login if not signed in; shows
 * "Admin only" if the profile role isn't admin.
 */

import React, { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Loader2, Play, FastForward, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import { supabase } from '@/lib/supabase'

interface BackfillResult {
  scanned: number
  generated: number
  skipped: number
  failed: number
  dry_run?: boolean
  processed: Array<{ id: string; slug: string; status: string; result?: string | null; error?: string }>
}

type JobKind = 'analysis' | 'answer-lines'

const JOBS: Array<{
  kind: JobKind
  label: string
  endpoint: string
  description: string
  /**
   * V10.6.4 — analysis is much heavier per row (~10–15s w/ retries +
   * claim-check). 10/chunk fits comfortably in Vercel's 5-min function
   * window. Answer-line is light (~1–2s) so 25/chunk is fine.
   */
  chunkSize: number
}> = [
  {
    kind: 'analysis',
    label: 'Paradocs Analysis (frames + open questions)',
    endpoint: '/api/admin/backfill-analysis',
    description:
      'Regenerates paradocs_assessment for INGESTED REPORTS only (reports table). ' +
      'Does NOT touch phenomena encyclopedia entries (/phenomena/<slug> pages — those use a separate pipeline). ' +
      'Renders below the fold on /report/[slug] as the lenses + open-questions analysis. ~$0.01/row.',
    chunkSize: 5,
  },
  {
    kind: 'answer-lines',
    label: 'Answer line (one-sentence faithful paraphrase)',
    endpoint: '/api/admin/backfill-answer-lines',
    description:
      'Generates the bold TL;DR sentence right under the title on /report/[slug]. ' +
      'Also used as the meta description (SEO + iMessage/Slack/Twitter share-card text) and as the OG card kicker. ' +
      'Reports only — does not touch encyclopedia entries. ~$0.002/row.',
    // V10.6.9 — Was 25, but Vercel returned an opaque 500 (function
    // crash, not graceful error) at ~36s into a 25-row chunk. Most
    // likely OOM from accumulating AI request/response/audit objects
    // in memory. Drop to 10 to match the analysis job, keep memory
    // bounded.
    chunkSize: 10,
  },
]

export default function AdminBackfillPage() {
  const router = useRouter()
  const [authState, setAuthState] = useState<'loading' | 'unauthorized' | 'not-admin' | 'admin'>('loading')
  const [busy, setBusy] = useState<JobKind | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [totals, setTotals] = useState<Record<JobKind, { scanned: number; generated: number; failed: number }>>({
    analysis: { scanned: 0, generated: 0, failed: 0 },
    'answer-lines': { scanned: 0, generated: 0, failed: 0 },
  })

  // ── Auth gate ─────────────────────────────────────────────
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

  const appendLog = useCallback((line: string) => {
    const ts = new Date().toLocaleTimeString()
    setLog(prev => [...prev, '[' + ts + '] ' + line])
  }, [])

  const runOnce = useCallback(async (job: typeof JOBS[number], opts: { dryRun?: boolean; force?: boolean }): Promise<BackfillResult | null> => {
    const sess = await supabase.auth.getSession()
    const token = sess.data.session?.access_token
    if (!token) {
      appendLog('No session — please refresh and sign in.')
      return null
    }
    const resp = await fetch(job.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ limit: job.chunkSize, dryRun: !!opts.dryRun, force: !!opts.force }),
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      appendLog('HTTP ' + resp.status + ' — ' + (text || resp.statusText))
      return null
    }
    return (await resp.json()) as BackfillResult
  }, [appendLog])

  const runChunk = useCallback(async (job: typeof JOBS[number]) => {
    if (busy) return
    setBusy(job.kind)
    appendLog('▶ ' + job.label + ' — running one chunk (limit ' + job.chunkSize + ')…')
    const result = await runOnce(job, {})
    if (result) {
      appendLog(
        '  scanned=' + result.scanned +
        '  generated=' + result.generated +
        '  skipped=' + result.skipped +
        '  failed=' + result.failed,
      )
      setTotals(t => ({
        ...t,
        [job.kind]: {
          scanned: t[job.kind].scanned + result.scanned,
          generated: t[job.kind].generated + result.generated,
          failed: t[job.kind].failed + result.failed,
        },
      }))
      // Show first 3 generated slugs as a sanity check.
      const generated = result.processed.filter(p => p.status === 'generated').slice(0, 3)
      if (generated.length > 0) {
        appendLog('  ✓ ' + generated.map(p => p.slug).join(', '))
      }
      // V10.6.6 — Surface failed rows with their slug + error so we
      // can investigate. Was opaque before; "1 failed" with no slug
      // gave you no path to diagnose.
      const failures = result.processed.filter(p => p.status === 'error' || p.status === 'no_output')
      failures.forEach(f => {
        const reason = f.error || (f.status === 'no_output' ? 'AI returned no usable output (likely INSUFFICIENT or claim-check rejection — check /admin/ai-audit)' : f.status)
        appendLog('  ✗ ' + f.slug + ' — ' + reason)
      })
    }
    setBusy(null)
  }, [busy, runOnce, appendLog])

  const runAll = useCallback(async (job: typeof JOBS[number]) => {
    if (busy) return
    setBusy(job.kind)
    appendLog('⏩ ' + job.label + ' — running until empty (max 40 chunks)…')
    for (let i = 0; i < 40; i++) {
      const result = await runOnce(job, {})
      if (!result) break
      appendLog(
        '  chunk ' + (i + 1) +
        ': scanned=' + result.scanned +
        '  generated=' + result.generated +
        '  failed=' + result.failed,
      )
      setTotals(t => ({
        ...t,
        [job.kind]: {
          scanned: t[job.kind].scanned + result.scanned,
          generated: t[job.kind].generated + result.generated,
          failed: t[job.kind].failed + result.failed,
        },
      }))
      // Terminate when there's nothing left to do.
      if (result.scanned === 0 || (result.generated === 0 && result.failed === 0)) {
        appendLog('  ✓ no more rows to process.')
        break
      }
      // Brief pause between chunks so we don't hammer the AI provider.
      await new Promise(r => setTimeout(r, 1500))
    }
    setBusy(null)
  }, [busy, runOnce, appendLog])

  // ── Render ────────────────────────────────────────────────

  if (authState === 'loading') {
    return (
      <AdminLayout title="Backfill">
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Checking admin…
        </div>
      </AdminLayout>
    )
  }
  if (authState === 'unauthorized') {
    return (
      <AdminLayout title="Backfill">
        <div className="max-w-md mx-auto py-16 text-center">
          <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-gray-200 mb-3">Sign in as an admin user to run backfills.</p>
          <button
            onClick={() => router.push('/login?redirect=/admin/backfill')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold"
          >
            Sign in
          </button>
        </div>
      </AdminLayout>
    )
  }
  if (authState === 'not-admin') {
    return (
      <AdminLayout title="Backfill">
        <div className="max-w-md mx-auto py-16 text-center">
          <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <p className="text-gray-200">Your account isn&rsquo;t an admin.</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title="Backfill">
      <Head>
        <title>Backfill | Paradocs Admin</title>
      </Head>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-white">AI Backfill</h1>
          <p className="text-sm text-gray-400 mt-1">
            Refresh existing <strong className="text-gray-200">reports</strong> (ingested + user-submitted) through the V10.6
            pipelines. <strong className="text-gray-200">Encyclopedia phenomena pages are NOT touched</strong> — those
            run through a different service. Each job is bounded; <em>Run until done</em> loops up to 40 chunks (max ~1,000 rows).
          </p>
        </header>

        <div className="space-y-4">
          {JOBS.map(job => {
            const t = totals[job.kind]
            const isBusy = busy === job.kind
            const disabled = !!busy && busy !== job.kind
            return (
              <section
                key={job.kind}
                className="rounded-xl border border-gray-800 bg-gray-900/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-white">{job.label}</h2>
                    <p className="text-xs text-gray-500 mt-1">{job.description}</p>
                    <p className="text-[11px] text-gray-600 mt-2">POST {job.endpoint}</p>
                  </div>
                  <div className="text-right text-[11px] text-gray-400 whitespace-nowrap">
                    <div>Scanned: <span className="text-gray-200 font-semibold">{t.scanned}</span></div>
                    <div>Generated: <span className="text-emerald-300 font-semibold">{t.generated}</span></div>
                    <div>Failed: <span className={t.failed > 0 ? 'text-rose-300 font-semibold' : 'text-gray-500 font-semibold'}>{t.failed}</span></div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    onClick={() => runChunk(job)}
                    disabled={isBusy || disabled}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
                  >
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Run one chunk ({job.chunkSize})
                  </button>
                  <button
                    onClick={() => runAll(job)}
                    disabled={isBusy || disabled}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40 text-gray-100 text-xs font-semibold transition-colors"
                  >
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FastForward className="w-3.5 h-3.5" />}
                    Run until done
                  </button>
                </div>
              </section>
            )
          })}
        </div>

        <section className="mt-6 rounded-xl border border-gray-800 bg-gray-950/60 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Log</h2>
          {log.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No runs yet. Pick a job above.</p>
          ) : (
            <pre className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-wrap font-mono max-h-[420px] overflow-auto">
              {log.join('\n')}
            </pre>
          )}
          {log.length > 0 && (
            <div className="mt-3 flex items-center gap-3 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Generated = AI ran + saved
              </span>
              <span className="inline-flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-amber-400" /> Failed = AI errored, row unchanged
              </span>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  )
}
