/**
 * FlagReportButton — "Report this content" affordance + optional
 * contributor block, on every report page.
 *
 * V11.41 — UGC trust floor (APP_EXPERIENCE_PANEL_REVIEW.md P0-2,
 * Apple Guideline 1.2). Documentary register: quiet text affordance,
 * composed confirmation, never a modal takeover.
 *
 * - Flag: any report, signed-in users (anon users are prompted to
 *   sign in). POSTs /api/reports/[slug]/flag.
 * - Block contributor: only for user-submitted reports with an
 *   author other than the viewer. POSTs /api/user/blocks.
 *
 * SWC compat: var + function() form.
 */

import React, { useState } from 'react'
import { Flag, ShieldOff, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

var REASONS: { key: string; label: string }[] = [
  { key: 'inaccurate', label: 'Inaccurate or misleading' },
  { key: 'offensive', label: 'Offensive or abusive' },
  { key: 'personal_info', label: 'Names or personal information' },
  { key: 'spam', label: 'Spam or advertising' },
  { key: 'harmful', label: 'Harmful or dangerous' },
  { key: 'other', label: 'Something else' },
]

interface FlagReportButtonProps {
  slug: string
  submittedBy?: string | null
  sourceType?: string | null
  className?: string
}

export default function FlagReportButton(props: FlagReportButtonProps) {
  var [open, setOpen] = useState(false)
  var [reason, setReason] = useState<string>('')
  var [details, setDetails] = useState('')
  var [busy, setBusy] = useState(false)
  var [done, setDone] = useState(false)
  var [blocked, setBlocked] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [viewerId, setViewerId] = useState<string | null>(null)

  React.useEffect(function () {
    supabase.auth.getSession().then(function (s) {
      setViewerId(s.data.session ? s.data.session.user.id : null)
    })
  }, [])

  var canBlock =
    props.sourceType === 'user_submission' &&
    !!props.submittedBy &&
    !!viewerId &&
    props.submittedBy !== viewerId

  async function withToken(): Promise<string | null> {
    var s = await supabase.auth.getSession()
    return s.data.session ? s.data.session.access_token : null
  }

  async function submitFlag() {
    if (!reason || busy) return
    setBusy(true)
    setError(null)
    try {
      var token = await withToken()
      if (!token) {
        setError('Sign in to report content.')
        setBusy(false)
        return
      }
      var res = await fetch('/api/reports/' + encodeURIComponent(props.slug) + '/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ reason: reason, details: details }),
      })
      if (res.ok) {
        setDone(true)
      } else {
        var body = await res.json().catch(function () { return null })
        setError((body && body.error) || 'Could not send the report. Try again.')
      }
    } catch (_e) {
      setError('Could not send the report. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function blockContributor() {
    if (busy || !props.submittedBy) return
    setBusy(true)
    setError(null)
    try {
      var token = await withToken()
      if (!token) {
        setError('Sign in to block contributors.')
        setBusy(false)
        return
      }
      var res = await fetch('/api/user/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ blocked_user_id: props.submittedBy }),
      })
      if (res.ok) setBlocked(true)
      else setError('Could not block. Try again.')
    } catch (_e) {
      setError('Could not block. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className={'text-xs text-gray-400 leading-relaxed ' + (props.className || '')}>
        <p className="inline-flex items-center gap-1.5 text-gray-300">
          <Check className="w-3.5 h-3.5 text-green-400" /> Thank you — our team will review this.
        </p>
        {canBlock && !blocked && (
          <button
            type="button"
            onClick={function () { blockContributor() }}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ShieldOff className="w-3.5 h-3.5" /> Also block this contributor
          </button>
        )}
        {blocked && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-gray-400">
            <Check className="w-3.5 h-3.5 text-green-400" /> Contributor blocked. You won&rsquo;t see their submissions.
          </p>
        )}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={function () { setOpen(true) }}
        className={'inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors ' + (props.className || '')}
      >
        <Flag className="w-3 h-3" /> Report this content
      </button>
    )
  }

  return (
    <div className={'rounded-xl border border-gray-800 bg-gray-900/40 p-4 ' + (props.className || '')}>
      <p className="text-xs font-medium text-gray-300 mb-2.5">What&rsquo;s wrong with this report?</p>
      <div className="space-y-1.5 mb-3">
        {REASONS.map(function (r) {
          return (
            <label key={r.key} className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer hover:text-gray-200">
              <input
                type="radio"
                name="flag-reason"
                checked={reason === r.key}
                onChange={function () { setReason(r.key) }}
                className="accent-purple-500"
              />
              {r.label}
            </label>
          )
        })}
      </div>
      <textarea
        value={details}
        onChange={function (e) { setDetails(e.target.value) }}
        placeholder="Anything that helps us review (optional)"
        rows={2}
        className="w-full text-xs bg-gray-950/60 border border-gray-800 rounded-lg px-2.5 py-2 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-700 mb-2.5"
      />
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={function () { submitFlag() }}
          disabled={!reason || busy}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium text-white bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? 'Sending…' : 'Send report'}
        </button>
        <button
          type="button"
          onClick={function () { setOpen(false); setError(null) }}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
