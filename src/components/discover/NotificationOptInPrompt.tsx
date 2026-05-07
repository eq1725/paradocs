'use client'

/**
 * NotificationOptInPrompt — V9.4.8 contextual pre-prompt.
 *
 * Per panel review, fires once after a user's first save event.
 * Pre-prompts the user with a Paradocs-styled bottom sheet that shows
 * what the daily push will actually look like, then either calls
 * requestPushSubscription (which triggers the iOS OS-level prompt) or
 * dismisses gracefully.
 *
 * "Pre-prompt before OS prompt" is required so we don't burn the
 * one-shot iOS permission. Conversion rate of pre-prompted opt-in is
 * 65-75% vs 35-45% for cold OS prompts (NYT / Pinterest data via
 * panel).
 *
 * SWC: var, function expressions, string concat.
 */

import React, { useEffect, useState } from 'react'
import { X, Bell } from 'lucide-react'
import { isPushSupported, getPushPermissionState, requestPushSubscription } from '@/lib/pushNotifications'

var STORAGE_KEY = 'paradocs_push_prompted'

/** Was the user already shown the pre-prompt at least once? */
export function wasPrePromptShown(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch (e) {
    return false
  }
}

/** Mark pre-prompt as shown so it never auto-fires again. */
export function markPrePromptShown(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch (e) {}
}

/**
 * Returns true if we should auto-show the pre-prompt right now —
 * push is supported on this browser AND user has not been prompted
 * yet AND the OS-level permission is still 'default' (not yet asked).
 */
export function shouldAutoShowPrePrompt(): boolean {
  if (!isPushSupported()) return false
  if (wasPrePromptShown()) return false
  var permission = getPushPermissionState()
  return permission === 'default'
}

interface NotificationOptInPromptProps {
  isOpen: boolean
  onClose: () => void
  /** Sample push copy to render in the preview card. Pull from
   *  Today's Lead phenomenon's push_copy when available. */
  samplePushCopy?: string | null
  /** Sample title to show above the body in the preview. Defaults
   *  to a generic phenomenon name. */
  sampleTitle?: string | null
  /** Called after the user successfully opts in. */
  onSubscribed?: () => void
}

export function NotificationOptInPrompt(props: NotificationOptInPromptProps) {
  var [busy, setBusy] = useState(false)
  var [error, setError] = useState<string | null>(null)

  // Mark as shown the moment the prompt becomes visible — even if the
  // user dismisses without opting in, we never want to auto-show
  // again (panel: "one contextual ask, ever").
  useEffect(function () {
    if (props.isOpen) markPrePromptShown()
  }, [props.isOpen])

  if (!props.isOpen) return null

  function handleEnable() {
    setBusy(true)
    setError(null)
    requestPushSubscription({ topics: ['daily_lead'] })
      .then(function (result) {
        if (result.subscribed) {
          if (props.onSubscribed) props.onSubscribed()
          props.onClose()
        } else if (result.denied) {
          setError('You denied the system permission. To enable later, go to Settings → Paradocs → Notifications.')
        } else if (result.unsupported) {
          setError('Push notifications aren’t supported in this browser.')
        } else {
          setError(result.error || 'Could not subscribe — try again later.')
        }
      })
      .catch(function (err: any) {
        setError(err?.message || 'Unexpected error')
      })
      .finally(function () { setBusy(false) })
  }

  function handleNotNow() {
    props.onClose()
  }

  var previewTitle = props.sampleTitle || 'Shadow Person'
  var previewBody = props.samplePushCopy
    || 'Since 1950s: 9,675 witnesses across continents report identical dark humanoid figures.'

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={function (e) { if (e.target === e.currentTarget) handleNotNow() }}
      role="dialog"
      aria-modal="true"
      aria-label="Enable daily notifications"
    >
      <div
        className="w-full md:max-w-md bg-gray-950 border-t md:border md:rounded-2xl border-white/10 shadow-2xl overflow-hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 1rem, 1.5rem)' }}
      >
        {/* Sheet header — tight, with a single close affordance */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex w-9 h-9 items-center justify-center rounded-full bg-primary-500/15 border border-primary-400/30">
              <Bell className="w-4 h-4 text-primary-300" />
            </span>
            <div>
              <h2 className="text-[15px] font-display font-semibold text-white leading-tight">
                Want today’s most striking case
              </h2>
              <p className="text-[15px] font-display font-semibold text-white leading-tight">
                delivered each morning?
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleNotNow}
            aria-label="Close"
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/5 transition-colors -mt-1 -mr-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[13px] text-gray-400 font-sans leading-relaxed px-5 pb-3">
          One daily push, anchored on something specific — like:
        </p>

        {/* Preview card — mimics an iOS push banner */}
        <div className="mx-5 mb-4 rounded-xl bg-gray-900 border border-white/10 px-3.5 py-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <span className="flex-shrink-0 w-8 h-8 rounded-md bg-gradient-to-br from-primary-500 to-purple-700 inline-flex items-center justify-center">
              <span className="text-[11px] font-display font-bold text-white">P</span>
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[11px] font-sans font-semibold text-gray-300">Paradocs</span>
                <span className="text-[10px] text-gray-500">8:00 AM</span>
              </div>
              <p className="text-[13px] font-sans font-semibold text-white leading-snug">
                {previewTitle}
              </p>
              <p className="text-[12px] font-sans text-gray-300 leading-snug mt-0.5 line-clamp-3">
                {previewBody}
              </p>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-gray-500 font-sans leading-relaxed px-5 pb-4">
          One push per day. Never spam, never shared. Disable any time from your Profile.
        </p>

        {error && (
          <p className="text-[12px] text-amber-300 font-sans leading-relaxed px-5 pb-3 border-l-2 border-amber-500/40 ml-3 bg-amber-500/[0.04] py-2 mr-5 rounded-r">
            {error}
          </p>
        )}

        {/* Action buttons */}
        <div className="px-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="w-full py-3 rounded-full bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {busy ? 'Enabling…' : 'Enable daily notifications'}
          </button>
          <button
            type="button"
            onClick={handleNotNow}
            disabled={busy}
            className="w-full py-2.5 rounded-full bg-transparent text-gray-400 hover:text-white text-[13px] font-sans transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

export default NotificationOptInPrompt
