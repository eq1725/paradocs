'use client'

// V11.17.72 - Custom Watchlists
//
// WatchlistEditor — modal for create / edit. Renders inputs for every
// criteria field defined in criteria-schema.ts (phen family multi-
// select, descriptors, geo + radius, year range, time-of-day, witness
// count, media required, credibility floor) plus notification
// preferences.
//
// Defaults per founder decision (PRO_TIER_VALIDATION_V3 Round 3):
//   - notify_push: TRUE
//   - notify_email_weekly: TRUE
//   - match_confidence_threshold: 0.85
//
// Rules-of-Hooks: all hooks called unconditionally at the top.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { WatchlistCriteria } from '@/lib/lab/watchlists/criteria-schema'
import { validateCriteria } from '@/lib/lab/watchlists/criteria-schema'

interface WatchlistEditorProps {
  /** When editing, the watchlist row to seed the form. Null for create. */
  initial: WatchlistRow | null
  open: boolean
  onClose: () => void
  /** Called after successful create/update. */
  onSaved: (saved: WatchlistRow) => void
  /** Called after successful delete. */
  onDeleted?: (id: string) => void
}

export interface WatchlistRow {
  id: string
  name: string
  criteria: WatchlistCriteria
  status: 'active' | 'paused' | 'archived'
  notify_push: boolean
  notify_email_weekly: boolean
  match_confidence_threshold: number
  last_evaluated_at: string | null
  created_at: string
  updated_at: string
  recent_match_count?: number
}

var PHEN_FAMILY_OPTIONS: { value: string; label: string }[] = [
  { value: 'ufos_aliens', label: 'UFO / Aliens' },
  { value: 'cryptids', label: 'Cryptids' },
  { value: 'ghosts_hauntings', label: 'Ghosts / Hauntings' },
  { value: 'psychic_phenomena', label: 'Psychic phenomena' },
  { value: 'esoteric_practices', label: 'Esoteric practices' },
  { value: 'consciousness_practices', label: 'Consciousness practices' },
  { value: 'perception_sensory', label: 'Perception / sensory' },
  { value: 'psychological_experiences', label: 'Psychological experiences' },
  { value: 'religion_mythology', label: 'Religion / mythology' },
]

var DESCRIPTOR_OPTIONS = [
  'static_electricity', 'low_hum', 'whoop_vocalization', 'shadow_figure',
  'tunnel_imagery', 'being_of_light', 'time_distortion', 'metallic_taste',
  'odor_sulphur', 'paralysis_onset', 'observed_from_above',
  'electromagnetic_disturbance', 'animal_reaction', 'three_note_pattern',
  'craft_shape_triangle', 'craft_shape_disc', 'craft_shape_orb',
  'witness_drowsy', 'witness_paired_or_more', 'apparition_residential',
  'recurring_location',
]

export function WatchlistEditor(props: WatchlistEditorProps) {
  // Form state — all hooks first.
  var [name, setName] = useState('')
  var [criteria, setCriteria] = useState<WatchlistCriteria>({})
  var [notifyPush, setNotifyPush] = useState(true)
  var [notifyEmail, setNotifyEmail] = useState(true)
  var [threshold, setThreshold] = useState(0.85)
  var [submitting, setSubmitting] = useState(false)
  var [deleting, setDeleting] = useState(false)
  var [errors, setErrors] = useState<string[]>([])

  useEffect(function () {
    if (props.open) {
      if (props.initial) {
        setName(props.initial.name)
        setCriteria(props.initial.criteria || {})
        setNotifyPush(props.initial.notify_push)
        setNotifyEmail(props.initial.notify_email_weekly)
        setThreshold(props.initial.match_confidence_threshold)
      } else {
        setName('')
        setCriteria({})
        setNotifyPush(true)
        setNotifyEmail(true)
        setThreshold(0.85)
      }
      setErrors([])
    }
  }, [props.open, props.initial])

  var togglePhenFamily = useCallback(function (value: string) {
    setCriteria(function (prev) {
      var list = prev.phen_family || []
      var next = list.indexOf(value as any) >= 0
        ? list.filter(function (v) { return v !== value })
        : list.concat([value as any])
      return Object.assign({}, prev, { phen_family: next.length > 0 ? next : undefined })
    })
  }, [])

  var toggleDescriptor = useCallback(function (kind: 'any' | 'all', value: string) {
    setCriteria(function (prev) {
      var field = kind === 'any' ? 'descriptors_any' : 'descriptors_all'
      var list = ((prev as any)[field] || []) as string[]
      var next = list.indexOf(value) >= 0
        ? list.filter(function (v) { return v !== value })
        : list.concat([value])
      var patch: any = {}
      patch[field] = next.length > 0 ? next : undefined
      return Object.assign({}, prev, patch)
    })
  }, [])

  var saveHandler = useCallback(async function () {
    if (submitting) return
    setErrors([])
    var trimmedName = name.trim()
    if (!trimmedName) {
      setErrors(['name is required'])
      return
    }
    var v = validateCriteria(criteria)
    if (!v.ok) {
      setErrors(v.errors)
      return
    }
    setSubmitting(true)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) { setErrors(['not authenticated']); setSubmitting(false); return }
      var url = props.initial
        ? '/api/lab/watchlists/' + props.initial.id
        : '/api/lab/watchlists'
      var method = props.initial ? 'PUT' : 'POST'
      var resp = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          name: trimmedName,
          criteria: criteria,
          notify_push: notifyPush,
          notify_email_weekly: notifyEmail,
          match_confidence_threshold: threshold,
        }),
      })
      var json = await resp.json()
      if (!resp.ok || !json.ok) {
        setErrors([json.error || 'save failed'].concat(json.detail || []))
        setSubmitting(false)
        return
      }
      props.onSaved(json.watchlist as WatchlistRow)
      setSubmitting(false)
    } catch (e: any) {
      setErrors([String(e && e.message || e)])
      setSubmitting(false)
    }
  }, [name, criteria, notifyPush, notifyEmail, threshold, submitting, props])

  var deleteHandler = useCallback(async function () {
    if (!props.initial || deleting) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this watchlist? Matches are removed too.')) return
    setDeleting(true)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) { setDeleting(false); return }
      var resp = await fetch('/api/lab/watchlists/' + props.initial.id, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token },
      })
      if (resp.ok) {
        if (props.onDeleted) props.onDeleted(props.initial.id)
      }
    } catch (_e) { /* ignore */ }
    setDeleting(false)
  }, [deleting, props])

  if (!props.open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full sm:max-w-2xl bg-gray-950 border border-purple-500/20 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-sm sm:text-base font-semibold text-white">
            {props.initial ? 'Edit watchlist' : 'Create watchlist'}
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={function (e) { setName(e.target.value) }}
              placeholder="e.g., Triangle UFOs near Saratoga"
              maxLength={200}
              className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
            />
          </div>

          {/* Phen family */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Phenomenon family</label>
            <div className="flex flex-wrap gap-2">
              {PHEN_FAMILY_OPTIONS.map(function (opt) {
                var on = (criteria.phen_family || []).indexOf(opt.value as any) >= 0
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={function () { togglePhenFamily(opt.value) }}
                    className={
                      'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                      (on
                        ? 'bg-purple-600/30 border-purple-400/50 text-purple-100'
                        : 'bg-gray-900 border-white/10 text-gray-300 hover:bg-gray-800')
                    }
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Subfamily */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Subfamily (free text)</label>
            <input
              type="text"
              value={criteria.subfamily || ''}
              onChange={function (e) {
                var v = e.target.value
                setCriteria(function (prev) { return Object.assign({}, prev, { subfamily: v || undefined }) })
              }}
              placeholder="e.g., triangle_class, bigfoot_class"
              className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
            />
          </div>

          {/* Descriptors */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Descriptors — any of</label>
            <div className="flex flex-wrap gap-1.5">
              {DESCRIPTOR_OPTIONS.map(function (d) {
                var on = (criteria.descriptors_any || []).indexOf(d as any) >= 0
                return (
                  <button
                    key={'any-' + d}
                    type="button"
                    onClick={function () { toggleDescriptor('any', d) }}
                    className={
                      'px-2 py-1 rounded-md text-[11px] border transition-colors ' +
                      (on
                        ? 'bg-purple-600/30 border-purple-400/50 text-purple-100'
                        : 'bg-gray-900 border-white/10 text-gray-400 hover:bg-gray-800')
                    }
                  >
                    {d.replace(/_/g, ' ')}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Descriptors — all of</label>
            <div className="flex flex-wrap gap-1.5">
              {DESCRIPTOR_OPTIONS.map(function (d) {
                var on = (criteria.descriptors_all || []).indexOf(d as any) >= 0
                return (
                  <button
                    key={'all-' + d}
                    type="button"
                    onClick={function () { toggleDescriptor('all', d) }}
                    className={
                      'px-2 py-1 rounded-md text-[11px] border transition-colors ' +
                      (on
                        ? 'bg-purple-600/30 border-purple-400/50 text-purple-100'
                        : 'bg-gray-900 border-white/10 text-gray-400 hover:bg-gray-800')
                    }
                  >
                    {d.replace(/_/g, ' ')}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Geo */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Geographic radius (optional)</label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                step="0.0001"
                value={criteria.geo?.lat ?? ''}
                onChange={function (e) {
                  var n = parseFloat(e.target.value)
                  setCriteria(function (prev) {
                    var geo = Object.assign({}, prev.geo || { lat: 0, lng: 0, radius_miles: 100 })
                    geo.lat = isNaN(n) ? 0 : n
                    return Object.assign({}, prev, { geo: e.target.value === '' && !prev.geo ? undefined : geo })
                  })
                }}
                placeholder="Latitude"
                className="px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              />
              <input
                type="number"
                step="0.0001"
                value={criteria.geo?.lng ?? ''}
                onChange={function (e) {
                  var n = parseFloat(e.target.value)
                  setCriteria(function (prev) {
                    var geo = Object.assign({}, prev.geo || { lat: 0, lng: 0, radius_miles: 100 })
                    geo.lng = isNaN(n) ? 0 : n
                    return Object.assign({}, prev, { geo: e.target.value === '' && !prev.geo ? undefined : geo })
                  })
                }}
                placeholder="Longitude"
                className="px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              />
              <input
                type="number"
                value={criteria.geo?.radius_miles ?? ''}
                onChange={function (e) {
                  var n = parseFloat(e.target.value)
                  setCriteria(function (prev) {
                    var geo = Object.assign({}, prev.geo || { lat: 0, lng: 0, radius_miles: 100 })
                    geo.radius_miles = isNaN(n) ? 0 : n
                    return Object.assign({}, prev, { geo: e.target.value === '' && !prev.geo ? undefined : geo })
                  })
                }}
                placeholder="Radius (mi)"
                className="px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              />
            </div>
          </div>

          {/* state_or_country */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">State or country (alt to geo)</label>
            <input
              type="text"
              value={criteria.state_or_country || ''}
              onChange={function (e) {
                var v = e.target.value
                setCriteria(function (prev) { return Object.assign({}, prev, { state_or_country: v || undefined }) })
              }}
              placeholder="e.g., US-TX, CA, UK"
              className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
            />
          </div>

          {/* Year range */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Event year range</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={criteria.event_year_from ?? ''}
                onChange={function (e) {
                  var n = parseInt(e.target.value, 10)
                  setCriteria(function (prev) { return Object.assign({}, prev, { event_year_from: isNaN(n) ? undefined : n }) })
                }}
                placeholder="From (e.g., 1990)"
                className="px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              />
              <input
                type="number"
                value={criteria.event_year_to ?? ''}
                onChange={function (e) {
                  var n = parseInt(e.target.value, 10)
                  setCriteria(function (prev) { return Object.assign({}, prev, { event_year_to: isNaN(n) ? undefined : n }) })
                }}
                placeholder="To (e.g., 2026)"
                className="px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              />
            </div>
          </div>

          {/* Time of day */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Time of day (hours, 0-23)</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                max={23}
                value={criteria.time_of_day_window?.start_hour ?? ''}
                onChange={function (e) {
                  var n = parseInt(e.target.value, 10)
                  setCriteria(function (prev) {
                    var w = Object.assign({}, prev.time_of_day_window || { start_hour: 0, end_hour: 4 })
                    w.start_hour = isNaN(n) ? 0 : n
                    return Object.assign({}, prev, { time_of_day_window: e.target.value === '' && !prev.time_of_day_window ? undefined : w })
                  })
                }}
                placeholder="Start hour"
                className="px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              />
              <input
                type="number"
                min={0}
                max={23}
                value={criteria.time_of_day_window?.end_hour ?? ''}
                onChange={function (e) {
                  var n = parseInt(e.target.value, 10)
                  setCriteria(function (prev) {
                    var w = Object.assign({}, prev.time_of_day_window || { start_hour: 0, end_hour: 4 })
                    w.end_hour = isNaN(n) ? 0 : n
                    return Object.assign({}, prev, { time_of_day_window: e.target.value === '' && !prev.time_of_day_window ? undefined : w })
                  })
                }}
                placeholder="End hour"
                className="px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              />
            </div>
          </div>

          {/* Witness count */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Min witnesses</label>
              <input
                type="number"
                min={1}
                value={criteria.witness_count_min ?? ''}
                onChange={function (e) {
                  var n = parseInt(e.target.value, 10)
                  setCriteria(function (prev) { return Object.assign({}, prev, { witness_count_min: isNaN(n) ? undefined : n }) })
                }}
                placeholder="e.g., 2"
                className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Min credibility</label>
              <select
                value={criteria.min_credibility || ''}
                onChange={function (e) {
                  var v = e.target.value
                  setCriteria(function (prev) {
                    return Object.assign({}, prev, { min_credibility: v === '' ? undefined : (v as any) })
                  })
                }}
                className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/40"
              >
                <option value="">— any —</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
          </div>

          {/* Has photo/video */}
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={!!criteria.has_photo_video}
              onChange={function (e) {
                var v = e.target.checked
                setCriteria(function (prev) { return Object.assign({}, prev, { has_photo_video: v ? true : undefined }) })
              }}
              className="rounded border-white/20 bg-gray-900"
            />
            Require photo or video
          </label>

          {/* Notifications */}
          <div className="border-t border-white/10 pt-5 space-y-3">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">Notifications</p>
            <label className="flex items-center justify-between text-sm text-gray-200">
              <span>Push notifications</span>
              <input
                type="checkbox"
                checked={notifyPush}
                onChange={function (e) { setNotifyPush(e.target.checked) }}
                className="rounded border-white/20 bg-gray-900"
              />
            </label>
            <label className="flex items-center justify-between text-sm text-gray-200">
              <span>Weekly email digest</span>
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={function (e) { setNotifyEmail(e.target.checked) }}
                className="rounded border-white/20 bg-gray-900"
              />
            </label>
            <div>
              <label className="flex items-center justify-between text-sm text-gray-200 mb-2">
                <span>Confidence threshold</span>
                <span className="text-purple-300 tabular-nums">{Math.round(threshold * 100)}%</span>
              </label>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.05}
                value={threshold}
                onChange={function (e) { setThreshold(parseFloat(e.target.value)) }}
                className="w-full"
              />
              <p className="mt-1 text-[11px] text-gray-500">Lower threshold = more matches, more false positives. Default 0.85.</p>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200">
              {errors.map(function (e, i) { return <div key={i}>{e}</div> })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/5">
          {props.initial ? (
            <button
              type="button"
              onClick={deleteHandler}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 text-xs text-red-300 hover:text-red-200 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          ) : <span />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={props.onClose}
              className="px-4 py-2 rounded-full text-xs text-gray-300 hover:text-white hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveHandler}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white"
            >
              <Save className="w-3.5 h-3.5" />
              {submitting ? 'Saving…' : (props.initial ? 'Save changes' : 'Create watchlist')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WatchlistEditor
