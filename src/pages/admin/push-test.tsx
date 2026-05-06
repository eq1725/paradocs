'use client'

/**
 * /admin/push-test — V9.4 push notification test harness.
 *
 * Three buttons:
 *   1. Subscribe this device — opt-in flow
 *   2. Send Today's Lead — fires /api/push/send-daily-lead
 *   3. Pick today's lead now — fires /api/admin/leads/select-today
 *
 * Plus a status panel showing current subscription + permission state.
 *
 * Auth: same gate as /admin (email + role=admin).
 */

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import {
  isPushSupported,
  getPushPermissionState,
  requestPushSubscription,
  unsubscribeFromPush,
} from '@/lib/pushNotifications'

export default function PushTestPage() {
  var router = useRouter()

  var [isAdmin, setIsAdmin] = useState(false)
  var [authChecked, setAuthChecked] = useState(false)

  var [supported, setSupported] = useState(false)
  var [permission, setPermission] = useState<string>('unsupported')
  var [busy, setBusy] = useState(false)
  var [log, setLog] = useState<string[]>([])

  function appendLog(line: string) {
    var ts = new Date().toLocaleTimeString()
    setLog(function (prev) { return prev.concat(['[' + ts + '] ' + line]) })
  }

  // Auth check — same pattern as /admin/index.tsx (raw supabase
  // session, not the useUser() hook which requires a provider that
  // isn't site-wide).
  useEffect(function () {
    var run = async function () {
      var { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.push('/login?redirect=/admin/push-test')
        return
      }
      if (session.user.email !== 'williamschaseh@gmail.com') {
        router.push('/')
        return
      }
      var { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
      if ((profile as any)?.role !== 'admin') {
        router.push('/')
        return
      }
      setIsAdmin(true)
    }
    run().finally(function () { setAuthChecked(true) })
  }, [router])

  // Initial state
  useEffect(function () {
    if (!isAdmin) return
    setSupported(isPushSupported())
    setPermission(getPushPermissionState())
  }, [isAdmin])

  async function handleSubscribe() {
    setBusy(true)
    appendLog('Requesting permission and subscribing…')
    try {
      var result = await requestPushSubscription({ topics: ['daily_lead'] })
      if (result.subscribed) {
        appendLog('✓ Subscribed successfully')
        setPermission(getPushPermissionState())
      } else if (result.denied) {
        appendLog('✗ Permission denied. Re-enable in browser settings.')
      } else if (result.unsupported) {
        appendLog('✗ Push not supported in this browser.')
      } else {
        appendLog('✗ ' + (result.error || 'Unknown error'))
      }
    } catch (err: any) {
      appendLog('✗ Exception: ' + err.message)
    }
    setBusy(false)
  }

  async function handleUnsubscribe() {
    setBusy(true)
    appendLog('Unsubscribing locally…')
    var ok = await unsubscribeFromPush()
    appendLog(ok ? '✓ Unsubscribed locally' : '✗ Unsubscribe failed')
    setPermission(getPushPermissionState())
    setBusy(false)
  }

  async function handlePickLead() {
    setBusy(true)
    appendLog('Picking today’s lead via auto-heuristic…')
    try {
      var resp = await fetch('/api/admin/leads/select-today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      var data = await resp.json()
      if (data.selected) {
        appendLog('✓ Selected: ' + data.name + ' (score ' + data.score + ')')
        appendLog('   reasons: ' + (data.reasons || []).join(' '))
      } else if (data.skipped) {
        appendLog('Skipped (' + data.reason + ')')
      } else {
        appendLog('✗ ' + (data.error || JSON.stringify(data)))
      }
    } catch (err: any) {
      appendLog('✗ ' + err.message)
    }
    setBusy(false)
  }

  async function handleSendTest() {
    setBusy(true)
    appendLog('Sending Today’s Lead push to all subscribers…')
    try {
      var resp = await fetch('/api/push/send-daily-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      var data = await resp.json()
      if (data.skipped) {
        appendLog('Skipped: ' + data.reason)
      } else {
        appendLog('✓ Sent ' + (data.sent || 0) + '/' + (data.total || 0) +
          ' (failed: ' + (data.failed || 0) + ', disabled: ' + (data.disabled || 0) + ')')
        if (data.push_copy) appendLog('   copy: "' + data.push_copy + '"')
      }
    } catch (err: any) {
      appendLog('✗ ' + err.message)
    }
    setBusy(false)
  }

  if (!authChecked) return <div className="min-h-screen bg-gray-950 text-gray-400 p-8">Checking auth…</div>
  if (!isAdmin) return <div className="min-h-screen bg-gray-950 text-gray-400 p-8">Not authorized.</div>

  return (
    <>
      <Head><title>Push Test · Paradocs Admin</title></Head>
      <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <header className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold font-display">Push Notification Test</h1>
              <p className="text-sm text-gray-400 mt-1">End-to-end V9.4 delivery harness.</p>
            </div>
            <a href="/admin" className="text-sm text-primary-400 hover:text-primary-300">← Back to Admin</a>
          </header>

          <section className="bg-gray-900/50 border border-white/10 rounded-xl p-4 mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3">Status</h2>
            <ul className="text-sm space-y-1 font-mono">
              <li>Push support: <span className={supported ? 'text-emerald-400' : 'text-red-400'}>{supported ? 'yes' : 'no'}</span></li>
              <li>Permission state: <span className="text-amber-300">{permission}</span></li>
              <li>VAPID public key: <span className={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? 'text-emerald-400' : 'text-red-400'}>{process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? 'set' : 'MISSING — check Vercel env vars'}</span></li>
            </ul>
          </section>

          <section className="bg-gray-900/50 border border-white/10 rounded-xl p-4 mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3">Actions</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={busy || !supported}
                className="px-4 py-2 rounded bg-primary-600 hover:bg-primary-500 text-sm font-semibold disabled:opacity-50"
              >
                Subscribe this device
              </button>
              <button
                type="button"
                onClick={handleUnsubscribe}
                disabled={busy || !supported}
                className="px-3 py-2 rounded border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-sm disabled:opacity-50"
              >
                Unsubscribe (local)
              </button>
              <button
                type="button"
                onClick={handlePickLead}
                disabled={busy}
                className="px-3 py-2 rounded border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-sm disabled:opacity-50"
              >
                Pick Today's Lead now
              </button>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={busy}
                className="px-3 py-2 rounded border border-amber-400/30 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-sm disabled:opacity-50"
              >
                Send Today's Lead push
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Subscribe first, then Send. The notification banner should appear within seconds.
              On iOS, the PWA must be installed to home screen for push to work.
            </p>
          </section>

          <section className="bg-gray-900/50 border border-white/10 rounded-xl p-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3">Log</h2>
            <div className="font-mono text-xs text-gray-300 space-y-1 max-h-[40vh] overflow-y-auto">
              {log.length === 0 ? (
                <div className="text-gray-600 italic">No actions yet.</div>
              ) : (
                log.map(function (line, i) {
                  return <div key={'log-' + i}>{line}</div>
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
