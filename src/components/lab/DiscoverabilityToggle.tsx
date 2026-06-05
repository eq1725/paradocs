'use client'

// V11.17.73 — Named-Match + DM
//
// DiscoverabilityToggle — per-experience opt-in toggle for the named-
// match matcher. Per LAB_PANEL_REVIEW_V3 §6 the default is OFF; the
// user must explicitly opt in for any experience to be eligible.
//
// Mounted as a slot inside the DossierHeader experience switcher area
// — we DO NOT modify DossierHeader directly (Tier 3E owns that
// refactor). Instead lab.tsx renders this component inline next to
// the experience picker.
//
// Behavior:
//   - Defensive read of reports.discoverable; loads on mount per reportId.
//   - Toggle flips state via /api/lab/reports/[id]/toggle-discoverable.
//   - Documentary copy explains what discoverable means; an info icon
//     reveals the full opt-in language inline.

import React, { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props {
  reportId: string
  /** Optional initial value if the parent already has it cached. */
  initialDiscoverable?: boolean
}

export function DiscoverabilityToggle(props: Props) {
  // Hooks first.
  var [value, setValue] = useState<boolean | null>(
    typeof props.initialDiscoverable === 'boolean' ? props.initialDiscoverable : null,
  )
  var [loading, setLoading] = useState(typeof props.initialDiscoverable !== 'boolean')
  var [pending, setPending] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [helpOpen, setHelpOpen] = useState(false)

  // Load current value on mount (when parent didn't cache it).
  useEffect(function () {
    if (typeof props.initialDiscoverable === 'boolean') return
    var cancelled = false
    setLoading(true)
    supabase
      .from('reports')
      .select('discoverable')
      .eq('id', props.reportId)
      .maybeSingle()
      .then(function (r: any) {
        if (cancelled) return
        if (r.error) { setError('fetch_failed'); setLoading(false); return }
        setValue(!!(r.data && r.data.discoverable))
        setLoading(false)
      })
    return function () { cancelled = true }
  }, [props.reportId, props.initialDiscoverable])

  var toggle = useCallback(async function () {
    if (pending || value === null) return
    var next = !value
    setPending(true)
    setError(null)
    // Optimistic.
    setValue(next)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) { setValue(!next); setError('not_authenticated'); setPending(false); return }
      var resp = await fetch('/api/lab/reports/' + props.reportId + '/toggle-discoverable', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ discoverable: next }),
      })
      if (!resp.ok) {
        setValue(!next)
        var msg = 'request_failed'
        try { var b = await resp.json(); msg = b.error || msg } catch (_e) {}
        setError(msg)
      }
      setPending(false)
    } catch (e: any) {
      setValue(!next)
      setError(String(e && e.message || e))
      setPending(false)
    }
  }, [value, pending, props.reportId])

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900/40 border border-white/5 text-xs text-gray-500">
        <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
        Loading…
      </div>
    )
  }

  var label = value
    ? 'Discoverable: on'
    : 'Discoverable: off'

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={!!value}
          className={
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ' +
            (value
              ? 'bg-purple-600/20 border border-purple-500/30 text-purple-200 hover:bg-purple-600/30'
              : 'bg-gray-900/40 border border-white/10 text-gray-400 hover:bg-gray-900/60')
          }
        >
          {value ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {label}
        </button>
        <button
          type="button"
          onClick={function () { setHelpOpen(!helpOpen) }}
          aria-label="What does discoverable mean?"
          className="p-1 rounded-full text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>

      {helpOpen && (
        <div className="mt-1 p-3 rounded-lg bg-gray-900/60 border border-white/5 max-w-xs">
          <p className="text-xs text-gray-300 leading-relaxed">
            When on, this experience can be considered by the named-match matcher.
            Strong matches trigger an anonymous offer to another contributor.
            Names and exact locations stay private until both sides accept. Default is off.
          </p>
        </div>
      )}

      {error && (
        <p className="text-[10px] text-red-400">Could not update: {error}</p>
      )}
    </div>
  )
}

export default DiscoverabilityToggle
