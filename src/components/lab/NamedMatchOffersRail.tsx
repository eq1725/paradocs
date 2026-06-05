'use client'

// V11.17.73 — Named-Match + DM
//
// NamedMatchOffersRail — the in-app rail of pending named-match offers
// for Basic+ users. Mounted in src/pages/lab.tsx; Free users see
// LabPaywallSurface in this slot.
//
// Layout:
//   - Header: title + count
//   - List of NamedMatchOfferCard, sorted "awaiting you" first
//   - Empty state: a short documentary line explaining when offers appear

import React, { useCallback, useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import NamedMatchOfferCard, { type NamedMatchOfferCardData } from './NamedMatchOfferCard'

export function NamedMatchOffersRail() {
  // All hooks first (Rules of Hooks).
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [offers, setOffers] = useState<NamedMatchOfferCardData[]>([])

  var reload = useCallback(async function () {
    setLoading(true)
    setError(null)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) { setError('not_authenticated'); setLoading(false); return }
      var resp = await fetch('/api/lab/named-match/offers', {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (resp.status === 403) { setError('basic_tier_required'); setLoading(false); return }
      if (!resp.ok) { setError('fetch_failed'); setLoading(false); return }
      var json = await resp.json()
      // Sort: awaiting you first, then highest confidence, then most recent.
      var rows = ((json.offers || []) as NamedMatchOfferCardData[]).slice()
      rows.sort(function (a, b) {
        if (a.awaiting_you && !b.awaiting_you) return -1
        if (!a.awaiting_you && b.awaiting_you) return 1
        if (a.match_confidence !== b.match_confidence) return b.match_confidence - a.match_confidence
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      setOffers(rows)
      setLoading(false)
    } catch (e: any) {
      setError(String(e && e.message || e))
      setLoading(false)
    }
  }, [])

  useEffect(function () { reload() }, [reload])

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/5 bg-gray-950/40 p-5 sm:p-6">
        <div className="h-4 w-1/3 bg-white/5 rounded animate-pulse" />
      </div>
    )
  }

  if (error === 'basic_tier_required' || error === 'not_authenticated') {
    // Parent gate should prevent these — render nothing as a safety net.
    return null
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-white/5 bg-gray-950/40 p-5 sm:p-6">
        <p className="text-sm text-gray-400">Could not load named-match offers.</p>
      </div>
    )
  }

  return (
    <div
      id="offers"
      role="region"
      aria-label="Named-match offers"
      className="rounded-2xl border border-white/5 bg-gray-950/40 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-500/15 rounded-lg">
            <Users className="w-4 h-4 text-purple-300" />
          </div>
          <h3 className="text-base font-semibold text-white">Named-match offers</h3>
        </div>
        {offers.length > 0 && (
          <span className="text-xs text-gray-500">{offers.length} active</span>
        )}
      </div>

      {offers.length === 0 ? (
        <div className="text-sm text-gray-400 leading-relaxed">
          No offers right now. When the matcher finds another contributor whose account
          shares strong signal with one of yours, an anonymous offer appears here.
          You decide whether to share your account; the other contributor decides whether
          to share theirs back.
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map(function (o) {
            return <NamedMatchOfferCard key={o.id} offer={o} onChanged={reload} />
          })}
        </div>
      )}
    </div>
  )
}

export default NamedMatchOffersRail
