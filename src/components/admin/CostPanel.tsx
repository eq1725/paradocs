// V11.17.85 - admin cost panel
//
// CostPanel — surfaces /api/admin/cost-summary at the top of /admin.
//
// Documentary register: the founder lands on /admin and sees, in the
// archival voice of the rest of the site, three numbers — today's spend,
// yesterday's spend, last-7-days spend — followed by a per-service
// breakdown and a 14-day daily-spend chart.
//
// Brand notes:
//   - Primary numbers in brand purple #9000F0 (tailwind: text-[#9000F0])
//   - Secondary text in brand gray (gray-400 / gray-500)
//   - No emoji, no gamified copy, no "milestone" energy
//   - Numbers are mono-tabular (font-mono with tabular-nums) so columns line up
//
// Auth: same pattern as the Quality Pipeline call in /admin/index.tsx —
// pull the supabase session, attach Authorization: Bearer <token>.
//
// Charting: recharts (already in package.json — same library every other
// admin chart on this page uses).
//
// Rules-of-Hooks compliance: every hook is called BEFORE any early return
// (loading / error / unauthorized branches).

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { supabase } from '@/lib/supabase'

interface Bucket {
  spend_usd: number
  calls: number
}

interface ByDay {
  day: string
  spend_usd: number
  calls: number
}

interface CostSummary {
  from: string
  to: string
  total_usd: number
  total_calls: number
  by_service: Record<string, Bucket>
  by_model: Record<string, Bucket>
  by_status: Record<string, Bucket>
  by_day: ByDay[]
}

var BRAND_PURPLE = '#9000F0'
var BRAND_PURPLE_SOFT = 'rgba(144, 0, 240, 0.15)'

function isoDay(d: Date): string {
  // Return YYYY-MM-DD in UTC — matches the toIsoDay() the endpoint emits.
  var y = d.getUTCFullYear()
  var m = String(d.getUTCMonth() + 1).padStart(2, '0')
  var day = String(d.getUTCDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function formatUsd(n: number): string {
  // Compact dollars: $1,234.56. Below $1 we show 4 decimals so cents stay legible.
  if (!isFinite(n)) return '$0.00'
  if (n === 0) return '$0.00'
  if (Math.abs(n) < 1) {
    return '$' + n.toFixed(4)
  }
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDelta(today: number, yesterday: number): { text: string; positive: boolean | null } {
  if (yesterday === 0 && today === 0) return { text: 'no spend yesterday', positive: null }
  if (yesterday === 0) return { text: 'no spend yesterday', positive: null }
  var pct = ((today - yesterday) / yesterday) * 100
  var sign = pct >= 0 ? '+' : ''
  return {
    text: sign + pct.toFixed(0) + '% vs yesterday',
    positive: pct < 0, // less spend == "positive" delta for cost-control framing
  }
}

function shortDay(iso: string): string {
  // "2026-06-04" -> "Jun 4"
  if (!iso || iso.length < 10) return iso
  var d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function CostPanel() {
  // --- HOOKS (must run unconditionally before any early return) ---
  var [data, setData] = useState<CostSummary | null>(null)
  var [loading, setLoading] = useState<boolean>(true)
  var [error, setError] = useState<string | null>(null)
  var [unauthorized, setUnauthorized] = useState<boolean>(false)
  var [refreshing, setRefreshing] = useState<boolean>(false)

  var fetchData = useCallback(async function () {
    setError(null)
    setUnauthorized(false)
    try {
      var now = new Date()
      var fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
      var from = fourteenDaysAgo.toISOString()
      var to = now.toISOString()

      var { data: { session } } = await supabase.auth.getSession()
      var headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = 'Bearer ' + session.access_token
      }

      var resp = await fetch(
        '/api/admin/cost-summary?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to),
        { headers: headers, credentials: 'include' },
      )

      if (resp.status === 401 || resp.status === 403) {
        setUnauthorized(true)
        setData(null)
        return
      }
      if (!resp.ok) {
        var detail = ''
        try {
          var body = await resp.json()
          detail = body?.error || body?.detail || ''
        } catch { /* ignore */ }
        throw new Error('Request failed (' + resp.status + ')' + (detail ? ': ' + detail : ''))
      }

      var json = (await resp.json()) as CostSummary
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    }
  }, [])

  useEffect(function () {
    var cancelled = false
    async function run() {
      setLoading(true)
      await fetchData()
      if (!cancelled) setLoading(false)
    }
    run()
    return function () { cancelled = true }
  }, [fetchData])

  var handleRefresh = useCallback(async function () {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }, [fetchData])

  // Derived view-model. Hooks must be unconditional so this runs even when data is null.
  var view = useMemo(function () {
    if (!data) {
      return {
        today: 0,
        yesterday: 0,
        last7: 0,
        delta: { text: '', positive: null as boolean | null },
        services: [] as Array<{ name: string; spend: number; calls: number; pct: number }>,
        chart: [] as Array<{ day: string; label: string; spend: number }>,
      }
    }

    var now = new Date()
    var todayKey = isoDay(now)
    var yesterdayKey = isoDay(new Date(now.getTime() - 24 * 60 * 60 * 1000))

    var todaySpend = 0
    var yesterdaySpend = 0
    var last7Spend = 0
    var sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000

    for (var i = 0; i < data.by_day.length; i++) {
      var row = data.by_day[i]
      if (row.day === todayKey) todaySpend += row.spend_usd
      if (row.day === yesterdayKey) yesterdaySpend += row.spend_usd
      var rowMs = new Date(row.day + 'T00:00:00Z').getTime()
      if (rowMs >= sevenDaysAgoMs) last7Spend += row.spend_usd
    }

    var delta = formatDelta(todaySpend, yesterdaySpend)

    // Top services across the full 14-day window.
    // Alias `data` to a non-null local so the closure passed to .map()
    // retains the narrowed type (TS loses narrowing across closure boundaries).
    var d2 = data
    var serviceKeys = Object.keys(d2.by_service)
    var services = serviceKeys.map(function (k) {
      return { name: k, spend: d2.by_service[k].spend_usd, calls: d2.by_service[k].calls }
    }).sort(function (a, b) { return b.spend - a.spend }).slice(0, 7)
    var serviceTotal = services.reduce(function (s, x) { return s + x.spend }, 0) || 1
    var servicesWithPct = services.map(function (s) {
      return { name: s.name, spend: s.spend, calls: s.calls, pct: (s.spend / serviceTotal) * 100 }
    })

    // Build a complete 14-day chart: fill missing days with $0.
    var byDayMap: Record<string, number> = {}
    for (var j = 0; j < data.by_day.length; j++) {
      byDayMap[data.by_day[j].day] = data.by_day[j].spend_usd
    }
    var chart: Array<{ day: string; label: string; spend: number }> = []
    for (var k = 13; k >= 0; k--) {
      var d = new Date(now.getTime() - k * 24 * 60 * 60 * 1000)
      var key = isoDay(d)
      chart.push({ day: key, label: shortDay(key), spend: byDayMap[key] || 0 })
    }

    return {
      today: todaySpend,
      yesterday: yesterdaySpend,
      last7: last7Spend,
      delta: delta,
      services: servicesWithPct,
      chart: chart,
    }
  }, [data])

  // --- RENDER ---

  // Loading skeleton
  if (loading) {
    return (
      <section className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50 mb-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">Spend ledger</p>
            <h2 className="text-lg font-semibold text-white mt-1">AI cost — last 14 days</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          {[1, 2, 3].map(function (i) {
            return <div key={i} className="h-28 bg-gray-700/30 rounded-lg animate-pulse" />
          })}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 h-56 bg-gray-700/30 rounded-lg animate-pulse" />
          <div className="lg:col-span-2 h-56 bg-gray-700/30 rounded-lg animate-pulse" />
        </div>
      </section>
    )
  }

  if (unauthorized) {
    return (
      <section className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50 mb-6">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 mb-2">Spend ledger</p>
        <p className="text-gray-300">You must be an admin to view the cost ledger.</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">Spend ledger</p>
            <p className="text-red-300 mt-2">Failed to load cost summary: {error}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50 mb-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">Spend ledger</p>
          <h2 className="text-lg font-semibold text-white mt-1">AI cost — last 14 days</h2>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-sm text-gray-300 hover:text-white bg-gray-700/60 hover:bg-gray-700 disabled:opacity-50 px-3 py-1.5 rounded-md transition-colors border border-gray-600/60"
          aria-label="Refresh cost summary"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Row 1 — three stat tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {/* Today */}
        <div className="bg-gray-900/40 rounded-lg p-5 border border-gray-700/40">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500">Today (UTC)</p>
          <p
            className="mt-2 font-mono tabular-nums text-3xl font-semibold"
            style={{ color: BRAND_PURPLE }}
          >
            {formatUsd(view.today)}
          </p>
          {view.delta.text && (
            <p className={
              'mt-2 text-xs font-medium ' +
              (view.delta.positive === null
                ? 'text-gray-500'
                : view.delta.positive
                  ? 'text-green-400'
                  : 'text-amber-400')
            }>
              {view.delta.text}
            </p>
          )}
        </div>

        {/* Yesterday */}
        <div className="bg-gray-900/40 rounded-lg p-5 border border-gray-700/40">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500">Yesterday</p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-semibold text-gray-100">
            {formatUsd(view.yesterday)}
          </p>
          <p className="mt-2 text-xs text-gray-500">prior UTC day</p>
        </div>

        {/* Last 7 days */}
        <div className="bg-gray-900/40 rounded-lg p-5 border border-gray-700/40">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500">Last 7 days</p>
          <p className="mt-2 font-mono tabular-nums text-3xl font-semibold text-gray-100">
            {formatUsd(view.last7)}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            {data ? (data.total_calls.toLocaleString() + ' calls over 14d') : ''}
          </p>
        </div>
      </div>

      {/* Row 2 — by-service breakdown + by-day mini-chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* By-service (~60%) */}
        <div className="lg:col-span-3 bg-gray-900/40 rounded-lg p-5 border border-gray-700/40">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-4">
            By service — 14-day window
          </p>
          {view.services.length === 0 ? (
            <p className="text-gray-500 text-sm py-6 text-center">No spend recorded in this window.</p>
          ) : (
            <div className="space-y-3">
              {view.services.map(function (s) {
                return (
                  <div key={s.name}>
                    <div className="flex items-baseline justify-between text-sm mb-1">
                      <span className="text-gray-200 truncate pr-3">{s.name}</span>
                      <span className="font-mono tabular-nums text-gray-100">
                        {formatUsd(s.spend)}
                        <span className="text-gray-500 text-xs ml-2">({s.calls.toLocaleString()} calls)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-700/60 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: Math.max(2, s.pct) + '%',
                          backgroundColor: BRAND_PURPLE,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* By-day mini chart (~40%) */}
        <div className="lg:col-span-2 bg-gray-900/40 rounded-lg p-5 border border-gray-700/40">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-4">
            Daily spend — 14 days
          </p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={view.chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="costPanelGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND_PURPLE} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={BRAND_PURPLE} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  interval={1}
                  tickLine={false}
                  axisLine={{ stroke: '#374151' }}
                />
                <YAxis
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  tickFormatter={function (v) { return '$' + Math.round(v) }}
                  width={42}
                  tickLine={false}
                  axisLine={{ stroke: '#374151' }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', fontSize: 12 }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={function (v: number) { return [formatUsd(v), 'Spend'] }}
                />
                <Area
                  type="monotone"
                  dataKey="spend"
                  stroke={BRAND_PURPLE}
                  strokeWidth={2}
                  fill="url(#costPanelGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[10px] text-gray-500 text-center">
            Series area shaded {BRAND_PURPLE_SOFT === 'rgba(144, 0, 240, 0.15)' ? 'brand purple' : ''}, day-bins UTC.
          </p>
        </div>
      </div>
    </section>
  )
}
