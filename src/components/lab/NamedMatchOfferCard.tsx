'use client'

// V11.17.73 — Named-Match + DM
//
// NamedMatchOfferCard — a single anonymous offer card in the pending
// offers rail. Renders the offer with ONLY the anonymous payload
// (phen_family, decade, signal_overlap_count, distance_bucket). No
// counterparty name, no exact location, no photo, no verbatim text.
//
// Visual: a quiet, documentary card with two CTAs (accept / decline).
// The card adapts copy to the user's role:
//   - initiator + state='pending': "Share your account with them?"
//   - recipient + state='initiator_accepted': "They've shared their
//     account with you. Want to share yours back?"
//
// Acts via fetch to /api/lab/named-match/offers/[id]/{accept,decline};
// notifies parent via onChanged after a successful mutation.

import React, { useCallback, useState } from 'react'
import { Eye, X, Check, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export interface NamedMatchOfferCardData {
  id: string
  your_role: 'initiator' | 'recipient'
  state: 'pending' | 'initiator_accepted' | 'accepted'
  signal_overlap_count: number
  match_confidence: number
  anonymous_payload: {
    phen_family: string | null
    decade: number | null
    signal_overlap_count: number
    distance_bucket: 'within_25mi' | '25_100mi' | '100_500mi' | 'over_500mi' | 'unknown'
  }
  your_report_id: string
  created_at: string
  expires_at: string
  awaiting_you: boolean
}

interface Props {
  offer: NamedMatchOfferCardData
  onChanged?: () => void
}

function familyLabel(slug: string | null): string {
  if (!slug) return 'experience'
  if (slug === 'ufos_aliens') return 'UFO-shape'
  if (slug === 'ghosts_hauntings') return 'apparition'
  if (slug === 'cryptids') return 'cryptid'
  if (slug === 'psychic_phenomena') return 'psychic'
  if (slug === 'consciousness_practices') return 'consciousness'
  if (slug === 'perception_sensory') return 'perception'
  return slug.replace(/_/g, ' ')
}

function distanceLabel(b: NamedMatchOfferCardData['anonymous_payload']['distance_bucket']): string {
  switch (b) {
    case 'within_25mi': return 'within 25 miles of your account'
    case '25_100mi': return 'between 25 and 100 miles away'
    case '100_500mi': return 'between 100 and 500 miles away'
    case 'over_500mi': return 'more than 500 miles away'
    case 'unknown': return 'in an unrecorded location'
  }
}

export function NamedMatchOfferCard(props: Props) {
  var [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  var [error, setError] = useState<string | null>(null)

  var act = useCallback(async function (action: 'accept' | 'decline') {
    setBusy(action)
    setError(null)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) { setError('not_authenticated'); setBusy(null); return }
      var resp = await fetch('/api/lab/named-match/offers/' + props.offer.id + '/' + action, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      })
      if (!resp.ok) {
        var msg = 'request_failed'
        try { var body = await resp.json(); msg = body.error || msg } catch (_e) {}
        setError(msg)
        setBusy(null)
        return
      }
      setBusy(null)
      if (props.onChanged) props.onChanged()
    } catch (e: any) {
      setError(String(e && e.message || e))
      setBusy(null)
    }
  }, [props])

  var fam = familyLabel(props.offer.anonymous_payload.phen_family)
  var decade = props.offer.anonymous_payload.decade
  var decadeStr = decade ? (decade + 's') : 'undated'
  var dist = distanceLabel(props.offer.anonymous_payload.distance_bucket)
  var overlap = props.offer.signal_overlap_count

  var headline: string
  var subline: string
  if (props.offer.your_role === 'initiator' && props.offer.state === 'pending') {
    headline = 'Another account shares ' + overlap + ' of 8 signals'
    subline = 'A ' + decadeStr + ' ' + fam + ' account ' + dist + '. Share your account with them?'
  } else if (props.offer.your_role === 'recipient' && props.offer.state === 'initiator_accepted') {
    headline = 'Another contributor wants to compare notes'
    subline = 'Their ' + decadeStr + ' ' + fam + ' account ' + dist + ' shares ' + overlap + ' of 8 signals with yours. Share yours back?'
  } else if (props.offer.state === 'accepted') {
    headline = 'Match accepted — thread open'
    subline = 'Open the DM thread in My Record to compare notes.'
  } else {
    headline = 'Awaiting the other contributor'
    subline = 'They have not responded yet. The offer expires in 14 days.'
  }

  var canAct = (props.offer.your_role === 'initiator' && props.offer.state === 'pending')
            || (props.offer.your_role === 'recipient' && props.offer.state === 'initiator_accepted')

  return (
    <div
      role="region"
      aria-label="Named-match offer card"
      className="relative rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/30 to-gray-950/40 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="p-2 bg-purple-500/15 rounded-lg flex-shrink-0">
          <Eye className="w-5 h-5 text-purple-300" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-300/90 mb-1.5">
            Named-Match Offer
          </p>
          <p className="text-base text-gray-100 font-semibold leading-tight mb-1">
            {headline}
          </p>
          <p className="text-sm text-gray-300 leading-relaxed mb-3">
            {subline}
          </p>

          <p className="text-[11px] text-gray-500 mb-4">
            Pre-acceptance only the phen family, decade, overlap count, and distance bucket are visible. Names and exact locations stay private until both sides accept.
          </p>

          {error && (
            <p className="text-xs text-red-400 mb-3">Could not complete: {error}</p>
          )}

          {canAct ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={function () { act('accept') }}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-semibold rounded-full transition-colors"
              >
                {busy === 'accept' ? 'Sharing…' : 'Yes, share'}
                {busy !== 'accept' && <ArrowRight className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={function () { act('decline') }}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/10 hover:bg-white/5 disabled:opacity-60 text-gray-300 text-sm font-medium rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
                {busy === 'decline' ? 'Declining…' : 'Not now'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-purple-300/80">
              <Check className="w-3.5 h-3.5" />
              {props.offer.state === 'accepted' ? 'Thread open below' : 'Awaiting the other contributor'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default NamedMatchOfferCard
