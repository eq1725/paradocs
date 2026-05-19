'use client'

/**
 * EditReportModal — in-place report editor
 *
 * Panel-feedback (May 2026 — 5th round). Lets users edit their own
 * reports without leaving the Lab. Posts to /api/reports/[id]/edit
 * which re-runs moderation on any description change but defaults
 * to auto-approve so ~95% of edits stay live without admin
 * intervention.
 *
 * SWC: var + function() form.
 */

import React, { useState } from 'react'
import { X, Loader2, AlertCircle, CheckCircle2, MapPin, Calendar, Globe, Tag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_CONFIG } from '@/lib/constants'

interface ReportInitial {
  id: string
  title?: string | null
  description?: string | null
  category?: string | null
  city?: string | null
  state_province?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null
  event_date?: string | null
  event_date_raw?: string | null
  event_date_precision?: string | null
  visibility?: string | null
  anonymous_submission?: boolean | null
}

interface EditReportModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  report: ReportInitial
}

type Precision = 'exact' | 'month' | 'year' | 'decade'

function todayIso(): string {
  var d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function currentYear(): number {
  return new Date().getFullYear()
}

export default function EditReportModal(props: EditReportModalProps) {
  var r = props.report
  var [title, setTitle] = useState(r.title || '')
  var [description, setDescription] = useState(r.description || '')
  var [category, setCategory] = useState(r.category || '')
  var [city, setCity] = useState(r.city || '')
  var [stateProvince, setStateProvince] = useState(r.state_province || '')
  var [country, setCountry] = useState(r.country || '')
  var [eventDate, setEventDate] = useState(r.event_date || r.event_date_raw || '')
  var [eventDatePrecision, setEventDatePrecision] = useState<Precision>((r.event_date_precision as Precision) || 'exact')
  var [visibility, setVisibility] = useState<'public' | 'radar_only' | 'private'>((r.visibility as any) || 'public')
  var [shareAnonymously, setShareAnonymously] = useState(!!r.anonymous_submission)
  var [saving, setSaving] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [success, setSuccess] = useState<{ flagged: boolean } | null>(null)

  if (!props.open) return null

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (description.trim().length < 30) {
      setError('Description must be at least 30 characters.')
      return
    }
    if (!category) {
      setError('Please pick a category.')
      return
    }
    var hasLocation = !!(city || stateProvince || country)
    if (!hasLocation) {
      setError('Please add where this happened — even just a country helps.')
      return
    }
    if (!eventDate) {
      setError('Please pick at least a year for when this happened.')
      return
    }

    setSaving(true)
    var s = await supabase.auth.getSession()
    var token = s.data.session?.access_token
    if (!token) {
      setError('Your session expired. Please sign in and try again.')
      setSaving(false)
      return
    }

    try {
      var resp = await fetch('/api/reports/' + encodeURIComponent(r.id) + '/edit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          title: title || null,
          description: description,
          category: category,
          event_date: eventDate,
          event_date_precision: eventDatePrecision,
          city: city || null,
          state_province: stateProvince || null,
          country: country || null,
          visibility: visibility,
          share_anonymously: shareAnonymously,
        }),
      })
      var data = await resp.json()
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Could not save edits')
      }
      setSuccess({ flagged: !!data.moderation_flagged })
      // Close + refresh after a beat so the user sees the success state.
      window.setTimeout(function () {
        props.onSaved()
        props.onClose()
      }, 1200)
    } catch (err: any) {
      setError(err?.message || 'Could not save edits')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-2 sm:px-4 py-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-lg my-4 rounded-2xl border border-purple-700/40 bg-gray-950 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
          <h2 className="text-base font-semibold text-white">Edit your report</h2>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-300 mb-3" />
            <p className="text-base font-semibold text-white">
              {success.flagged ? 'Submitted for review' : 'Saved'}
            </p>
            <p className="text-xs text-gray-400 mt-1.5 max-w-xs mx-auto leading-relaxed">
              {success.flagged
                ? 'Your changes will go live after a quick admin check. The previous version stays visible in the meantime.'
                : 'Your edits are live.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-4 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Title <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={function (e) { setTitle(e.target.value) }}
                maxLength={140}
                className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">What happened?</label>
              <textarea
                value={description}
                onChange={function (e) { setDescription(e.target.value) }}
                rows={6}
                maxLength={4000}
                className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none focus:border-purple-500 resize-none"
              />
              <p className="text-[11px] text-gray-500 mt-1">{description.length} / 4000</p>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-gray-400" />
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>).map(function (key) {
                  var conf = (CATEGORY_CONFIG as any)[key]
                  var active = category === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={function () { setCategory(key) }}
                      className={
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ' +
                        (active
                          ? 'bg-purple-600/30 text-purple-100 border-purple-500/40'
                          : 'bg-gray-900/60 text-gray-400 border-gray-800 hover:text-gray-200')
                      }
                    >
                      <span>{conf.icon}</span>
                      <span>{conf.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                Where did this happen?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={city}
                  onChange={function (e) { setCity(e.target.value) }}
                  placeholder="City"
                  className="bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                />
                <input
                  type="text"
                  value={stateProvince}
                  onChange={function (e) { setStateProvince(e.target.value) }}
                  placeholder="State / Province"
                  className="bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <input
                type="text"
                value={country}
                onChange={function (e) { setCountry(e.target.value) }}
                placeholder="Country"
                className="mt-2 w-full bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                When did this happen?
              </label>
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {[
                  { v: 'exact' as const, l: 'Exact' },
                  { v: 'year' as const, l: 'Year only' },
                  { v: 'decade' as const, l: 'Decade' },
                ].map(function (o) {
                  var active = eventDatePrecision === o.v
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={function () { setEventDatePrecision(o.v); setEventDate('') }}
                      className={
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors ' +
                        (active
                          ? 'bg-purple-600/30 text-purple-100 border border-purple-500/40'
                          : 'bg-gray-900/60 text-gray-400 border border-gray-800 hover:text-gray-200')
                      }
                    >
                      {o.l}
                    </button>
                  )
                })}
              </div>
              {eventDatePrecision === 'exact' && (
                <input
                  type="date"
                  value={eventDate}
                  max={todayIso()}
                  onChange={function (e) { setEventDate(e.target.value) }}
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              )}
              {eventDatePrecision === 'year' && (() => {
                var thisYear = currentYear()
                var years: number[] = []
                for (var y = thisYear; y >= 1900; y--) years.push(y)
                return (
                  <select
                    value={eventDate}
                    onChange={function (e) { setEventDate(e.target.value) }}
                    className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">Select a year</option>
                    {years.map(function (y) { return <option key={y} value={String(y)}>{y}</option> })}
                  </select>
                )
              })()}
              {eventDatePrecision === 'decade' && (() => {
                var thisDecade = Math.floor(currentYear() / 10) * 10
                var decades: string[] = []
                for (var d = thisDecade; d >= 1900; d -= 10) decades.push(d + 's')
                return (
                  <select
                    value={eventDate}
                    onChange={function (e) { setEventDate(e.target.value) }}
                    className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">Select a decade</option>
                    {decades.map(function (dec) { return <option key={dec} value={dec}>{dec}</option> })}
                  </select>
                )
              })()}
            </div>

            {/* Visibility */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-gray-400" />
                Who can see this?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 'public' as const, l: 'Public' },
                  { v: 'radar_only' as const, l: 'Match only' },
                  { v: 'private' as const, l: 'Just me' },
                ].map(function (o) {
                  var active = visibility === o.v
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={function () { setVisibility(o.v) }}
                      className={
                        'px-3 py-2 rounded-lg text-xs font-medium transition-colors ' +
                        (active
                          ? 'bg-purple-600/30 text-purple-100 border border-purple-500/40'
                          : 'bg-gray-900/60 text-gray-400 border border-gray-800 hover:text-gray-200')
                      }
                    >
                      {o.l}
                    </button>
                  )
                })}
              </div>
              <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareAnonymously}
                  onChange={function (e) { setShareAnonymously(e.target.checked) }}
                  className="w-4 h-4 accent-purple-500"
                />
                <span className="text-gray-300">Share anonymously</span>
              </label>
            </div>

            {error && (
              <div className="rounded-lg border border-red-900/40 bg-red-950/30 p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-300 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-200">{error}</p>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={props.onClose}
                className="w-full px-6 py-2 text-sm text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
