'use client'

/**
 * /admin/researcher-overlap — V10.3 (QA #6d)
 *
 * Real-time monitoring + threshold tuning for the Researcher
 * Overlap scoring engine. Lets Chase verify the IDF-weighted
 * scoring is producing meaningful matches at production scale,
 * and A/B-test alternate threshold values WITHOUT a redeploy.
 *
 * Layout (top → bottom):
 *   1. Threshold sliders + recompute button (current values live
 *      on the URL so configs are shareable).
 *   2. Summary stat cards (seeded users, total passed, strong,
 *      notable, avg duration).
 *   3. Score-distribution histogram (passed vs rejected per
 *      bucket). The shape of this is the main "is the floor
 *      tuned right?" diagnostic.
 *   4. Rejection breakdown — which gate is filtering out each
 *      rejected pair (score / items / diversity / visibility).
 *   5. Top pairs table — the actual matches the system would
 *      surface today, with scores and counts.
 *   6. Per-seed-user diagnostic table — overlap counts per
 *      seeded user, so we can spot users with huge libraries
 *      pulling in too many candidates.
 *
 * SWC compat: this page uses var + function() to match the
 * rest of /admin/*.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import {
  Loader2, RefreshCw, Save as SaveIcon, AlertCircle, Users, Sparkles,
} from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import { supabase } from '@/lib/supabase'

interface Histogram {
  lo: number
  hi: number
  label: string
  passed: number
  rejected: number
}

interface TopPair {
  a: string
  b: string
  score: number
}

interface SeedResult {
  seed_user_id: string
  candidates: number
  passed: number
  strong: number
  notable: number
  rejected_score: number
  rejected_items: number
  rejected_diversity: number
  rejected_visibility: number
  duration_ms: number
}

interface StatsPayload {
  mode: string
  thresholds: {
    scoreFloor: number
    minItems: number
    minExternal: number
    minInternal: number
    strongTier: number
    perItemFanoutCap: number
  }
  seeded_users: number
  results: SeedResult[]
  histogram: Histogram[]
  tier_counts: { strong: number; notable: number }
  pair_stats: {
    total_passed: number
    total_rejected: number
    total_rejected_by: { score: number; items: number; diversity: number; visibility: number }
    avg_passed_per_seed: number
  }
  top_pairs: TopPair[]
  computed_at: string
}

// Thresholds we expose to the tuning UI.
interface UiThresholds {
  scoreFloor: number
  minItems: number
  minExternal: number
  minInternal: number
  strongTier: number
  perItemFanoutCap: number
  sampleSize: number
}

var DEFAULTS: UiThresholds = {
  scoreFloor: 1.5,
  minItems: 2,
  minExternal: 1,
  minInternal: 3,
  strongTier: 3.0,
  perItemFanoutCap: 50,
  sampleSize: 25,
}

export default function ResearcherOverlapAdminPage() {
  var [thresholds, setThresholds] = useState<UiThresholds>(DEFAULTS)
  var [loading, setLoading] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [data, setData] = useState<StatsPayload | null>(null)

  var run = useCallback(async function (overrides?: Partial<UiThresholds>) {
    setLoading(true)
    setError(null)
    try {
      var t = { ...thresholds, ...overrides }
      var session = await supabase.auth.getSession()
      var token = session.data.session?.access_token
      if (!token) { setError('Sign in as admin to run.'); setLoading(false); return }
      var params = new URLSearchParams({
        score_floor: String(t.scoreFloor),
        min_items: String(t.minItems),
        min_external: String(t.minExternal),
        min_internal: String(t.minInternal),
        strong_tier: String(t.strongTier),
        fanout_cap: String(t.perItemFanoutCap),
        sample_size: String(t.sampleSize),
      })
      var resp = await fetch('/api/admin/researcher-overlap-stats?' + params.toString(), {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!resp.ok) {
        var body = await resp.json().catch(function () { return null })
        throw new Error((body && body.error) || 'HTTP ' + resp.status)
      }
      var payload = await resp.json()
      setData(payload)
    } catch (e: any) {
      setError(e.message || 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [thresholds])

  // Auto-run once on mount.
  useEffect(function () { run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function updateThreshold<K extends keyof UiThresholds>(key: K, value: UiThresholds[K]) {
    setThresholds(function (prev) { return { ...prev, [key]: value } })
  }
  function resetDefaults() {
    setThresholds(DEFAULTS)
    run(DEFAULTS)
  }

  var dirty = useMemo(function () {
    if (!data) return false
    var t = data.thresholds
    return (
      t.scoreFloor !== thresholds.scoreFloor ||
      t.minItems !== thresholds.minItems ||
      t.minExternal !== thresholds.minExternal ||
      t.minInternal !== thresholds.minInternal ||
      t.strongTier !== thresholds.strongTier ||
      t.perItemFanoutCap !== thresholds.perItemFanoutCap
    )
  }, [data, thresholds])

  return (
    <>
      <Head>
        <title>Researcher Overlap | Admin | Paradocs</title>
      </Head>
      <AdminLayout
        title="Researcher Overlap"
        subtitle="Real-time monitoring + threshold tuning for the IDF-weighted overlap scoring (QA #6d)"
      >
        {/* ── Threshold tuning panel ── */}
        <section className="mb-6 bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <SaveIcon className="w-4 h-4 text-cyan-400" />
            Thresholds
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NumberInput
              label="Score floor"
              hint="≥ this score"
              value={thresholds.scoreFloor}
              step={0.1}
              onChange={v => updateThreshold('scoreFloor', v)}
            />
            <NumberInput
              label="Min items"
              hint="distinct shared"
              value={thresholds.minItems}
              step={1}
              onChange={v => updateThreshold('minItems', v)}
            />
            <NumberInput
              label="Min external"
              hint="external URLs"
              value={thresholds.minExternal}
              step={1}
              onChange={v => updateThreshold('minExternal', v)}
            />
            <NumberInput
              label="Min internal"
              hint="Paradocs items"
              value={thresholds.minInternal}
              step={1}
              onChange={v => updateThreshold('minInternal', v)}
            />
            <NumberInput
              label="Strong tier"
              hint="≥ this = strong"
              value={thresholds.strongTier}
              step={0.1}
              onChange={v => updateThreshold('strongTier', v)}
            />
            <NumberInput
              label="Per-item fanout cap"
              hint="max co-savers per item"
              value={thresholds.perItemFanoutCap}
              step={5}
              onChange={v => updateThreshold('perItemFanoutCap', v)}
            />
            <NumberInput
              label="Sample size"
              hint="seed users"
              value={thresholds.sampleSize}
              step={5}
              onChange={v => updateThreshold('sampleSize', v)}
            />
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">&nbsp;</span>
              <div className="flex gap-1 mt-auto">
                <button
                  type="button"
                  onClick={() => run()}
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white transition-colors"
                >
                  {loading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                  Run
                </button>
                <button
                  type="button"
                  onClick={resetDefaults}
                  className="px-2 py-1.5 rounded-md text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                  title="Reset to V10.3 defaults"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
          {dirty && (
            <p className="text-[11px] text-amber-300 mt-3 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Unsaved threshold changes — click Run to recompute.
            </p>
          )}
        </section>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-700/40 text-sm text-red-300">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* ── Summary stats ── */}
            <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              <StatCard label="Seeded users" value={data.seeded_users} />
              <StatCard
                label="Pairs surfaced"
                value={data.pair_stats.total_passed}
                hint={'avg ' + data.pair_stats.avg_passed_per_seed + '/seed'}
                accent="cyan"
              />
              <StatCard label="Strong matches" value={data.tier_counts.strong} accent="purple" />
              <StatCard label="Notable matches" value={data.tier_counts.notable} accent="emerald" />
              <StatCard
                label="Avg duration"
                value={
                  data.results.length === 0 ? '—' :
                  Math.round(data.results.reduce((s, r) => s + r.duration_ms, 0) / data.results.length) + 'ms'
                }
              />
            </section>

            {/* ── Histogram ── */}
            <section className="mb-6 bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-white mb-3">Score distribution</h2>
              <Histogram histogram={data.histogram} scoreFloor={data.thresholds.scoreFloor} strongTier={data.thresholds.strongTier} />
              <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
                Green bars are pairs that passed all gates and surfaced to users. Red bars are pairs the
                thresholds filtered out. Look for a clear gap between the rejected bulk and the surfaced
                tail — if the gap is fuzzy, the floor is mis-tuned.
              </p>
            </section>

            {/* ── Rejection breakdown ── */}
            <section className="mb-6 bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-white mb-3">Rejection breakdown</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <RejectStat label="Below score floor" count={data.pair_stats.total_rejected_by.score} total={data.pair_stats.total_rejected} />
                <RejectStat label="Too few items" count={data.pair_stats.total_rejected_by.items} total={data.pair_stats.total_rejected} />
                <RejectStat label="Diversity gate" count={data.pair_stats.total_rejected_by.diversity} total={data.pair_stats.total_rejected} />
                <RejectStat label="Visibility opt-out" count={data.pair_stats.total_rejected_by.visibility} total={data.pair_stats.total_rejected} />
              </div>
            </section>

            {/* ── Top pairs ── */}
            <section className="mb-6 bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
              <h2 className="text-sm font-semibold text-white p-4 pb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                Top overlapping pairs ({data.top_pairs.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-gray-500 bg-gray-950/40">
                    <tr>
                      <th className="text-left p-2 font-medium">User A</th>
                      <th className="text-left p-2 font-medium">User B</th>
                      <th className="text-right p-2 font-medium">Score</th>
                      <th className="text-right p-2 font-medium">Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_pairs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-gray-500">
                          No pairs passed the current thresholds.
                        </td>
                      </tr>
                    ) : data.top_pairs.map((p, i) => (
                      <tr key={i} className="border-t border-gray-900 hover:bg-gray-900/30">
                        <td className="p-2 text-gray-300 font-mono">{p.a.slice(0, 8)}…</td>
                        <td className="p-2 text-gray-300 font-mono">{p.b.slice(0, 8)}…</td>
                        <td className="p-2 text-right tabular-nums text-white font-semibold">{p.score.toFixed(2)}</td>
                        <td className="p-2 text-right">
                          <span className={
                            p.score >= data!.thresholds.strongTier
                              ? 'inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-200'
                              : 'inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-800/60 border border-gray-700 text-gray-300'
                          }>
                            {p.score >= data!.thresholds.strongTier ? 'Strong' : 'Notable'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Per-seed table ── */}
            <section className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
              <h2 className="text-sm font-semibold text-white p-4 pb-2 flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                Per-seed diagnostics
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-gray-500 bg-gray-950/40">
                    <tr>
                      <th className="text-left p-2 font-medium">Seed</th>
                      <th className="text-right p-2 font-medium">Candidates</th>
                      <th className="text-right p-2 font-medium">Passed</th>
                      <th className="text-right p-2 font-medium">Strong</th>
                      <th className="text-right p-2 font-medium">Notable</th>
                      <th className="text-right p-2 font-medium">Rej-score</th>
                      <th className="text-right p-2 font-medium">Rej-items</th>
                      <th className="text-right p-2 font-medium">Rej-div</th>
                      <th className="text-right p-2 font-medium">Rej-vis</th>
                      <th className="text-right p-2 font-medium">ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((r, i) => (
                      <tr key={i} className="border-t border-gray-900 hover:bg-gray-900/30">
                        <td className="p-2 text-gray-300 font-mono">{r.seed_user_id.slice(0, 8)}…</td>
                        <td className="p-2 text-right tabular-nums text-gray-300">{r.candidates}</td>
                        <td className="p-2 text-right tabular-nums text-white font-semibold">{r.passed}</td>
                        <td className="p-2 text-right tabular-nums text-cyan-300">{r.strong}</td>
                        <td className="p-2 text-right tabular-nums text-gray-300">{r.notable}</td>
                        <td className="p-2 text-right tabular-nums text-gray-500">{r.rejected_score}</td>
                        <td className="p-2 text-right tabular-nums text-gray-500">{r.rejected_items}</td>
                        <td className="p-2 text-right tabular-nums text-gray-500">{r.rejected_diversity}</td>
                        <td className="p-2 text-right tabular-nums text-gray-500">{r.rejected_visibility}</td>
                        <td className="p-2 text-right tabular-nums text-gray-500">{r.duration_ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="text-[10px] text-gray-600 mt-4 text-center">
              Computed at {new Date(data.computed_at).toLocaleString()}
            </p>
          </>
        )}
      </AdminLayout>
    </>
  )
}

// ── Subcomponents ─────────────────────────────────────────────

function NumberInput(props: {
  label: string
  hint: string
  value: number
  step: number
  onChange: (n: number) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-gray-500">{props.label}</span>
      <input
        type="number"
        value={props.value}
        step={props.step}
        onChange={e => props.onChange(parseFloat(e.target.value) || 0)}
        className="bg-gray-950 border border-gray-700 rounded-md px-2 py-1 text-sm text-white tabular-nums focus:outline-none focus:border-cyan-500"
      />
      <span className="text-[9px] text-gray-600">{props.hint}</span>
    </label>
  )
}

function StatCard(props: {
  label: string
  value: number | string
  hint?: string
  accent?: 'cyan' | 'purple' | 'emerald'
}) {
  const accentClass =
    props.accent === 'cyan' ? 'text-cyan-300' :
    props.accent === 'purple' ? 'text-purple-300' :
    props.accent === 'emerald' ? 'text-emerald-300' : 'text-white'
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{props.label}</div>
      <div className={'mt-1 text-2xl font-bold tabular-nums leading-none ' + accentClass}>{props.value}</div>
      {props.hint && <div className="text-[10px] text-gray-600 mt-1">{props.hint}</div>}
    </div>
  )
}

function RejectStat(props: { label: string; count: number; total: number }) {
  const pct = props.total === 0 ? 0 : Math.round((props.count / props.total) * 100)
  return (
    <div className="bg-gray-950/40 border border-gray-800 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{props.label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-white">{props.count}</div>
      <div className="text-[10px] text-gray-600">{pct}% of rejections</div>
    </div>
  )
}

function Histogram(props: { histogram: Histogram[]; scoreFloor: number; strongTier: number }) {
  const max = Math.max(1, ...props.histogram.map(b => b.passed + b.rejected))
  return (
    <div className="flex items-end gap-2 h-40">
      {props.histogram.map((b, i) => {
        const passedPct = (b.passed / max) * 100
        const rejectedPct = (b.rejected / max) * 100
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col-reverse justify-start gap-0.5" style={{ height: '120px' }}>
              <div
                title={b.rejected + ' rejected'}
                className="w-full bg-red-500/40 border-t border-red-500/60 rounded-b-sm"
                style={{ height: rejectedPct + '%' }}
              />
              <div
                title={b.passed + ' passed'}
                className="w-full bg-emerald-500/50 border-t border-emerald-500/70 rounded-t-sm"
                style={{ height: passedPct + '%' }}
              />
            </div>
            <span className="text-[9px] text-gray-500 tabular-nums">{b.label}</span>
            <span className="text-[9px] text-gray-400 tabular-nums">{b.passed + b.rejected}</span>
          </div>
        )
      })}
    </div>
  )
}
