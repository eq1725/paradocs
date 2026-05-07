'use client'

/**
 * NotificationToggle — V9.4.8 status + control surface for Web Push.
 *
 * Two render modes:
 *   - mode="row"     — compact status row for Profile (single line,
 *                      label + status pill + chevron action).
 *   - mode="full"    — full settings card for /dashboard/settings
 *                      (title + description + toggle + helper text).
 *
 * Permission states handled:
 *   - 'unsupported'  — browser doesn't support Push API. Hide entirely.
 *   - 'default'      — never asked. Show "Enable" CTA.
 *   - 'granted'      — actively subscribed. Show "On" + Disable.
 *   - 'denied'       — permanently denied at OS level. Show
 *                      instructions to re-enable in iOS Settings.
 *
 * SWC: var, function expressions, string concat.
 */

import React, { useEffect, useState } from 'react'
import { Bell, BellOff, ChevronRight } from 'lucide-react'
import {
  isPushSupported,
  getPushPermissionState,
  requestPushSubscription,
  unsubscribeFromPush,
} from '@/lib/pushNotifications'

interface NotificationToggleProps {
  mode?: 'row' | 'full'
}

export default function NotificationToggle(props: NotificationToggleProps) {
  var mode = props.mode || 'full'

  var [supported, setSupported] = useState<boolean | null>(null)
  var [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  var [busy, setBusy] = useState(false)
  var [error, setError] = useState<string | null>(null)

  function refreshState() {
    var sup = isPushSupported()
    setSupported(sup)
    setPermission(getPushPermissionState())
  }

  useEffect(function () {
    refreshState()
  }, [])

  function handleEnable() {
    setBusy(true)
    setError(null)
    requestPushSubscription({ topics: ['daily_lead'] })
      .then(function (result) {
        if (!result.subscribed) {
          if (result.denied) {
            setError('You denied at the OS level. Re-enable in iOS Settings → Paradocs → Notifications.')
          } else if (result.unsupported) {
            setError('Push not supported in this browser.')
          } else if (result.error) {
            setError(result.error)
          }
        }
        refreshState()
      })
      .catch(function (err: any) { setError(err?.message || 'Unexpected error') })
      .finally(function () { setBusy(false) })
  }

  function handleDisable() {
    setBusy(true)
    setError(null)
    unsubscribeFromPush()
      .then(function () { refreshState() })
      .catch(function (err: any) { setError(err?.message || 'Unexpected error') })
      .finally(function () { setBusy(false) })
  }

  // Hide entirely on unsupported browsers — we'd rather not show
  // controls that can't work than show disabled buttons that confuse.
  if (supported === null) return null  // initial state — nothing yet
  if (!supported) return null

  // Derive status label + cta
  var statusLabel: string
  var statusTone: 'on' | 'off' | 'denied'
  var primaryAction: { label: string; onClick: () => void } | null = null

  if (permission === 'granted') {
    statusLabel = 'On'
    statusTone = 'on'
    primaryAction = { label: 'Disable', onClick: handleDisable }
  } else if (permission === 'denied') {
    statusLabel = 'Disabled in iOS Settings'
    statusTone = 'denied'
    primaryAction = null
  } else {
    statusLabel = 'Off'
    statusTone = 'off'
    primaryAction = { label: 'Enable', onClick: handleEnable }
  }

  if (mode === 'row') {
    // Compact Profile status row — same visual weight as the other
    // ProfileLink rows so it slots cleanly into the Quick Links list.
    var Icon = permission === 'granted' ? Bell : BellOff
    return (
      <button
        type="button"
        onClick={primaryAction ? primaryAction.onClick : undefined}
        disabled={busy || !primaryAction}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-900/60 border border-gray-800 hover:border-gray-700 transition-colors text-left disabled:cursor-default disabled:opacity-80"
      >
        <span className={
          'flex-shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-lg ' +
          (statusTone === 'on'
            ? 'bg-amber-500/15 text-amber-300'
            : statusTone === 'denied'
              ? 'bg-gray-800 text-gray-500'
              : 'bg-primary-500/15 text-primary-300')
        }>
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-sans font-medium text-white">
            Daily notifications
          </span>
          <span className="block text-[11px] text-gray-500 mt-0.5">
            {statusTone === 'on'
              ? 'On — one daily push, anchored on Today’s Lead'
              : statusTone === 'denied'
                ? statusLabel
                : 'Off — enable to get one daily anomaly delivered'}
          </span>
        </span>
        {primaryAction ? (
          <span className={
            'text-[12px] font-sans font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ' +
            (statusTone === 'on'
              ? 'bg-amber-500/15 text-amber-200 border border-amber-400/30'
              : 'bg-primary-500/15 text-primary-200 border border-primary-400/30')
          }>
            {busy ? '…' : primaryAction.label}
          </span>
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-600" />
        )}
      </button>
    )
  }

  // mode === 'full' — Settings card
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start gap-3">
        <span className={
          'flex-shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-lg ' +
          (statusTone === 'on'
            ? 'bg-amber-500/15 text-amber-300'
            : statusTone === 'denied'
              ? 'bg-gray-800 text-gray-500'
              : 'bg-primary-500/15 text-primary-300')
        }>
          {permission === 'granted' ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-display font-semibold text-white">Daily notifications</h3>
          <p className="text-[13px] text-gray-400 leading-relaxed mt-1">
            One push per day at 8 AM with the day&rsquo;s most striking case &mdash; anchored on a specific year, place, and witness account. Never spam, never shared.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <span className={
              'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-sans font-semibold uppercase tracking-wider ' +
              (statusTone === 'on'
                ? 'bg-amber-500/15 text-amber-200 border border-amber-400/30'
                : statusTone === 'denied'
                  ? 'bg-gray-800 text-gray-400 border border-gray-700'
                  : 'bg-gray-800 text-gray-400 border border-gray-700')
            }>
              {statusLabel}
            </span>
            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={busy}
                className={
                  'inline-flex items-center px-3 py-1.5 rounded-full text-[12px] font-sans font-semibold transition-colors disabled:opacity-50 ' +
                  (statusTone === 'on'
                    ? 'bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 text-gray-200'
                    : 'bg-primary-600 hover:bg-primary-500 text-white')
                }
              >
                {busy ? '…' : primaryAction.label}
              </button>
            )}
          </div>

          {permission === 'denied' && (
            <p className="text-[12px] text-amber-300 mt-3 leading-relaxed">
              You denied notifications at the iOS level. To re-enable: open <strong>iOS Settings &rarr; Notifications &rarr; Paradocs</strong>, then toggle <strong>Allow Notifications</strong>.
            </p>
          )}

          {error && (
            <p className="text-[12px] text-amber-300 mt-3 leading-relaxed">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
