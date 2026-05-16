'use client'

/**
 * /account/delete — C3.1 account-deletion UI.
 *
 * Required for Apple Guideline 5.1.1(v). The user-facing surface for
 * initiating account deletion + cancelling during grace period.
 *
 * Three states this page handles:
 *   1. No pending request → show the warning + typed-confirmation form
 *   2. Pending request → show "deletion scheduled for [date]" + cancel button
 *   3. Loading → spinner while fetching status
 *
 * Cascading effects communicated to the user before they confirm:
 *   - All submitted reports become deleted
 *   - Profile is anonymized
 *   - All push subscriptions are revoked
 *   - Saved reports + collections are cleared
 *   - Active subscription is cancelled (Stripe portal access expires)
 *   - Email becomes unusable for future signup
 *
 * SWC: var + function() form.
 */

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { AlertTriangle, ArrowLeft, Loader2, ShieldAlert, X, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'
import AccountNav from '@/components/account/AccountNav'

interface PendingRequest {
  request_id: string
  requested_at: string
  scheduled_for: string
}

var CONFIRMATION_REQUIRED = 'DELETE MY ACCOUNT'

export default function AccountDeletePage() {
  var router = useRouter()
  var [authChecked, setAuthChecked] = useState(false)
  var [signedIn, setSignedIn] = useState(false)
  var [loading, setLoading] = useState(true)
  var [pending, setPending] = useState<PendingRequest | null>(null)
  var [confirmation, setConfirmation] = useState('')
  var [submitting, setSubmitting] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(function () {
    supabase.auth.getSession().then(function (r) {
      var session = r.data.session
      setSignedIn(!!session)
      setAuthChecked(true)
      if (session) {
        fetchStatus()
      } else {
        setLoading(false)
      }
    })
  }, [])

  function fetchStatus() {
    setLoading(true)
    supabase.auth.getSession().then(function (r) {
      var token = r.data.session?.access_token
      if (!token) {
        setLoading(false)
        return
      }
      fetch('/api/account/delete', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token },
      })
        .then(function (resp) { return resp.ok ? resp.json() : Promise.reject(new Error('Failed to fetch')) })
        .then(function (data) {
          if (data.has_pending_request) {
            setPending({
              request_id: data.request_id,
              requested_at: data.requested_at,
              scheduled_for: data.scheduled_for,
            })
          } else {
            setPending(null)
          }
        })
        .catch(function () { /* ignore */ })
        .finally(function () { setLoading(false) })
    })
  }

  async function requestDeletion() {
    setError(null)
    setSuccessMessage(null)
    if (confirmation !== CONFIRMATION_REQUIRED) {
      setError('Type "' + CONFIRMATION_REQUIRED + '" exactly to confirm.')
      return
    }
    setSubmitting(true)
    try {
      var session = (await supabase.auth.getSession()).data.session
      if (!session) throw new Error('Not signed in')
      var resp = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ confirmation: confirmation }),
      })
      var data = await resp.json()
      if (!resp.ok) {
        setError(data.error || data.details || 'Failed to schedule deletion')
      } else {
        setPending({
          request_id: data.request_id,
          requested_at: data.requested_at,
          scheduled_for: data.scheduled_for,
        })
        setConfirmation('')
        setSuccessMessage('Your account is scheduled for deletion on ' + new Date(data.scheduled_for).toLocaleDateString() + '. You can cancel any time before then.')
      }
    } catch (e: any) {
      setError(e?.message || 'Unexpected error')
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelDeletion() {
    setError(null)
    setSuccessMessage(null)
    setSubmitting(true)
    try {
      var session = (await supabase.auth.getSession()).data.session
      if (!session) throw new Error('Not signed in')
      var resp = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
      var data = await resp.json()
      if (!resp.ok) {
        setError(data.error || 'Failed to cancel deletion')
      } else {
        setPending(null)
        setSuccessMessage('Your scheduled deletion has been cancelled. Your account remains active.')
      }
    } catch (e: any) {
      setError(e?.message || 'Unexpected error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    )
  }

  if (!signedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-white mb-2">Sign in required</h1>
          <p className="text-sm text-gray-400 mb-5">You need to be signed in to manage account deletion.</p>
          <Link href="/login" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 transition-colors">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Delete Account · Paradocs</title>
        <meta name="robots" content="noindex" />
      </Head>
      <AccountNav />
      <div className="min-h-screen bg-gray-950">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <Link
            href="/account/settings"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Account Settings
          </Link>

          <div className="mb-8">
            <p className="text-[11px] font-semibold tracking-widest uppercase text-red-400 mb-1">Destructive · Irreversible after grace period</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Delete your account</h1>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
              Deletes your Paradocs account, anonymizes your profile, and removes your submitted reports.
              A 7-day grace period applies — you can cancel any time before the scheduled date.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            </div>
          ) : pending ? (
            <PendingPanel
              pending={pending}
              onCancel={cancelDeletion}
              submitting={submitting}
              error={error}
              successMessage={successMessage}
            />
          ) : (
            <RequestPanel
              confirmation={confirmation}
              setConfirmation={setConfirmation}
              onSubmit={requestDeletion}
              submitting={submitting}
              error={error}
              successMessage={successMessage}
            />
          )}
        </div>
      </div>
    </>
  )
}

function PendingPanel(props: {
  pending: PendingRequest
  onCancel: () => void
  submitting: boolean
  error: string | null
  successMessage: string | null
}) {
  var scheduledDate = new Date(props.pending.scheduled_for)
  var daysRemaining = Math.ceil((scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-5 sm:p-6 mb-5">
      <div className="flex items-start gap-4">
        <div className="p-2 bg-amber-600/20 rounded-lg flex-shrink-0">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-white mb-2">
            Deletion scheduled for {scheduledDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed mb-4">
            {daysRemaining <= 0
              ? 'Your account is being processed for deletion. Cancellation may no longer be possible.'
              : daysRemaining === 1
                ? 'Your account will be deleted in less than 1 day.'
                : 'Your account will be deleted in ' + daysRemaining + ' days. Cancel any time before then to keep your account active.'}
          </p>

          {props.error && (
            <div className="mb-3 p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
              <p className="text-xs text-red-200">{props.error}</p>
            </div>
          )}
          {props.successMessage && (
            <div className="mb-3 p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-lg flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-300 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-200">{props.successMessage}</p>
            </div>
          )}

          {daysRemaining > 0 && (
            <button
              type="button"
              onClick={props.onCancel}
              disabled={props.submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 transition-colors"
            >
              {props.submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              {props.submitting ? 'Cancelling…' : 'Cancel deletion'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function RequestPanel(props: {
  confirmation: string
  setConfirmation: (v: string) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
  successMessage: string | null
}) {
  var canSubmit = props.confirmation === CONFIRMATION_REQUIRED && !props.submitting

  return (
    <div className="space-y-5">
      <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-5 sm:p-6">
        <h2 className="text-base font-semibold text-white mb-3">What deletion includes</h2>
        <ul className="space-y-2 text-sm text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">•</span>
            <span>Your submitted reports become inaccessible and marked deleted</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">•</span>
            <span>Your profile is anonymized (display name, username, avatar, bio cleared)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">•</span>
            <span>All push notification subscriptions revoked</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">•</span>
            <span>Saved reports and any collections cleared</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">•</span>
            <span>Active paid subscription cancelled (no refund for current billing period)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">•</span>
            <span>Your email becomes unusable for future signup on Paradocs</span>
          </li>
        </ul>
        <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
          Aggregated and anonymized statistics derived from your historical contributions may
          persist for research and platform integrity purposes. No data that identifies you
          will remain after the 7-day grace period.
        </p>
      </div>

      <div className="bg-white/[0.02] border border-white/10 rounded-xl p-5 sm:p-6">
        <h2 className="text-base font-semibold text-white mb-2">Confirm deletion</h2>
        <p className="text-sm text-gray-400 mb-4">
          To confirm you understand and want to proceed, type the phrase exactly as shown.
        </p>

        <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2" htmlFor="confirmation-input">
          Type <code className="text-red-300 normal-case tracking-normal">{CONFIRMATION_REQUIRED}</code>
        </label>
        <input
          id="confirmation-input"
          type="text"
          value={props.confirmation}
          onChange={function (e) { props.setConfirmation(e.target.value) }}
          placeholder={CONFIRMATION_REQUIRED}
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500 font-mono"
        />

        {props.error && (
          <div className="mt-3 p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
            <p className="text-xs text-red-200">{props.error}</p>
          </div>
        )}
        {props.successMessage && (
          <div className="mt-3 p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-lg flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-300 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-200">{props.successMessage}</p>
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <Link
            href="/account/settings"
            className="px-5 py-2.5 text-sm text-gray-300 hover:text-white text-center transition-colors"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={props.onSubmit}
            disabled={!canSubmit}
            className={classNames(
              'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-colors',
              canSubmit
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-red-900/50 cursor-not-allowed opacity-60'
            )}
          >
            {props.submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {props.submitting ? 'Scheduling…' : 'Schedule account deletion'}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-500 text-center leading-relaxed">
        Required by Apple App Store Guideline 5.1.1(v) and Google Play Data Safety.
        Deletion is processed within 7 days; you can cancel any time before then.
      </p>
    </div>
  )
}
