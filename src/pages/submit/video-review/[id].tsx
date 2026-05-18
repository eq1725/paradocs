'use client'

/**
 * /submit/video-review/[id] — Review & publish a video submission
 *
 * Panel-feedback (May 2026), video pipeline Phase A + B.
 *
 * Flow:
 *   1. Load /api/reports/video/[id] — get the signed playback URL
 *      and the latest status. If status='transcribing' (Phase B),
 *      poll every 4 seconds until it flips to 'ready_for_review'.
 *   2. Show the video player + form. Phase B prefills the form
 *      from extracted_meta (Haiku suggestions). User must
 *      explicitly confirm location + date — we never auto-publish
 *      those because Whisper can hallucinate place names.
 *   3. On Publish: POST /api/reports/video/[id]/publish. Server
 *      runs moderation, flips status, returns the result.
 *
 * SWC: var + function() form.
 */

import React, { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2, MapPin, Calendar, Globe } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface VideoData {
  id: string
  status: string
  mime_type: string
  duration_sec: number | null
  transcript: string | null
  transcript_segments: any[] | null
  transcript_lang: string | null
  extracted_meta: {
    proposed_title?: string
    proposed_description?: string
    location_hints?: string[]
    date_hints?: string[]
    category_hints?: string[]
  } | null
  playback_url: string
}

interface ReportData {
  id: string
  title: string | null
  description: string | null
  category: string | null
  visibility: string | null
  location_precision: string | null
  latitude: number | null
  longitude: number | null
  city: string | null
  state_province: string | null
  country: string | null
  event_date: string | null
  event_date_raw: string | null
  event_date_precision: string | null
}

interface FormState {
  title: string
  description: string
  category: string
  city: string
  state_province: string
  country: string
  latitude: string
  longitude: string
  event_date: string
  event_date_precision: 'exact' | 'month' | 'year' | 'decade'
  visibility: 'public' | 'radar_only' | 'private'
  share_anonymously: boolean
}

var POLL_INTERVAL_MS = 4000

export default function VideoReviewPage() {
  var router = useRouter()
  var reportId = (router.query.id as string) || ''

  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [video, setVideo] = useState<VideoData | null>(null)
  var [report, setReport] = useState<ReportData | null>(null)
  var [publishing, setPublishing] = useState(false)
  var [published, setPublished] = useState<{ needs_admin_review: boolean; report_id: string } | null>(null)

  var [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    category: 'combination',
    city: '',
    state_province: '',
    country: '',
    latitude: '',
    longitude: '',
    event_date: '',
    event_date_precision: 'exact',
    visibility: 'public',
    share_anonymously: false,
  })

  var fetchData = useCallback(async function () {
    var sessionResult = await supabase.auth.getSession()
    var session = sessionResult.data.session
    if (!session) {
      setError('You need to be signed in to review this video.')
      setLoading(false)
      return
    }
    try {
      var resp = await fetch('/api/reports/video/' + encodeURIComponent(reportId), {
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
      var data = await resp.json()
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Could not load video')
      }
      setVideo(data.video)
      setReport(data.report)
      // Prefill form on first load only — once the user has started
      // editing, we don't want a re-poll to wipe their progress.
      setForm(function (current) {
        if (current.description) return current // already touched
        var em = data.video?.extracted_meta || {}
        return {
          title: data.report?.title || em.proposed_title || '',
          description: data.report?.description || em.proposed_description || data.video?.transcript || '',
          category: data.report?.category || (em.category_hints && em.category_hints[0]) || 'combination',
          city: data.report?.city || '',
          state_province: data.report?.state_province || '',
          country: data.report?.country || '',
          latitude: data.report?.latitude != null ? String(data.report.latitude) : '',
          longitude: data.report?.longitude != null ? String(data.report.longitude) : '',
          event_date: data.report?.event_date || data.report?.event_date_raw || '',
          event_date_precision: (data.report?.event_date_precision as any) || 'exact',
          visibility: (data.report?.visibility as any) || 'public',
          share_anonymously: false,
        }
      })
    } catch (e: any) {
      setError(e?.message || 'Could not load video')
    } finally {
      setLoading(false)
    }
  }, [reportId])

  useEffect(function () {
    if (!reportId) return
    fetchData()
  }, [reportId, fetchData])

  // Poll while transcribing.
  useEffect(function () {
    if (!video) return
    if (video.status !== 'transcribing') return
    var t = window.setInterval(function () { fetchData() }, POLL_INTERVAL_MS)
    return function () { window.clearInterval(t) }
  }, [video, fetchData])

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Client-side validation matches the server-side checks.
    if (form.description.trim().length < 30) {
      setError('Description must be at least 30 characters.')
      return
    }
    var hasLocation = !!(form.latitude && form.longitude) || !!form.city || !!form.state_province || !!form.country
    if (!hasLocation) {
      setError('Please add where this happened — even just a country helps.')
      return
    }
    if (!form.event_date) {
      setError('Please pick at least a year for when this happened.')
      return
    }

    setPublishing(true)
    var sessionResult = await supabase.auth.getSession()
    var session = sessionResult.data.session
    if (!session) {
      setError('Your session expired. Please sign in and try again.')
      setPublishing(false)
      return
    }

    try {
      var resp = await fetch('/api/reports/video/' + encodeURIComponent(reportId) + '/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          title: form.title || null,
          description: form.description,
          category: form.category || 'combination',
          event_date: form.event_date,
          event_date_precision: form.event_date_precision,
          city: form.city || null,
          state_province: form.state_province || null,
          country: form.country || null,
          latitude: form.latitude || null,
          longitude: form.longitude || null,
          visibility: form.visibility,
          share_anonymously: form.share_anonymously,
        }),
      })
      var data = await resp.json()
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Publish failed')
      }
      setPublished({ needs_admin_review: !!data.needs_admin_review, report_id: data.report_id })
    } catch (e: any) {
      setError(e?.message || 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading your video…
      </div>
    )
  }

  if (error && !video) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-12">
        <div className="max-w-md mx-auto text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-red-300 mb-3" />
          <p className="text-sm text-gray-300">{error}</p>
          <Link href="/submit/video" className="block mt-6 text-sm text-purple-300 hover:text-purple-200 underline">
            Record a new video
          </Link>
        </div>
      </div>
    )
  }

  if (published) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-12">
        <div className="max-w-md mx-auto text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-300 mb-4" />
          <h1 className="text-lg font-semibold text-white mb-2">
            {published.needs_admin_review ? 'Submitted for review' : 'Your video is live'}
          </h1>
          <p className="text-sm text-gray-400 leading-relaxed mb-6">
            {published.needs_admin_review
              ? 'Our team will take a quick look before it goes on the public feed. We\'ll notify you when it\'s approved.'
              : 'Thanks for sharing. Your video is now on the Today feed and your report page is live.'}
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/lab?tab=story"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full"
            >
              View your Story
            </Link>
            <Link
              href="/today"
              className="text-sm text-gray-400 hover:text-gray-200 mt-1"
            >
              Browse the Today feed →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  var transcribing = video && video.status === 'transcribing'

  return (
    <>
      <Head>
        <title>Review your video · Paradocs</title>
      </Head>
      <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={function () { router.back() }}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <h1 className="text-xl font-bold text-white mb-1">Review your video</h1>
          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            Add a few details so others can find and connect with your experience.
          </p>

          {transcribing && (
            <div className="rounded-lg border border-purple-900/40 bg-purple-950/30 p-3 mb-6 flex items-start gap-2">
              <Loader2 className="w-4 h-4 text-purple-300 mt-0.5 animate-spin flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-purple-200">Transcribing your video…</p>
                <p className="text-xs text-purple-200/80 mt-0.5">
                  We&rsquo;ll auto-suggest a title and description once it&rsquo;s ready. You can keep filling in the form below in the meantime.
                </p>
              </div>
            </div>
          )}

          {video && (
            <div className="rounded-2xl overflow-hidden bg-black border border-gray-800 mb-6 aspect-[9/16] max-h-[60vh] w-full mx-auto" style={{ maxWidth: '380px' }}>
              <video
                src={video.playback_url}
                controls
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            </div>
          )}

          <form onSubmit={handlePublish} className="space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5" htmlFor="vr-title">
                Title <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="vr-title"
                type="text"
                value={form.title}
                onChange={function (e) { setForm(function (f) { return { ...f, title: e.target.value } }) }}
                placeholder="A short headline for your experience"
                maxLength={140}
                className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5" htmlFor="vr-desc">
                What happened?
              </label>
              <textarea
                id="vr-desc"
                value={form.description}
                onChange={function (e) { setForm(function (f) { return { ...f, description: e.target.value } }) }}
                rows={6}
                maxLength={4000}
                placeholder={video && video.transcript ? video.transcript : 'Tell us about what happened. We\'ll use this as the report body.'}
                className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none focus:border-purple-500 resize-none"
              />
              {video && video.transcript && (
                <p className="text-[11px] text-gray-500 mt-1.5">
                  We auto-transcribed your video — feel free to keep it as-is or refine it.
                </p>
              )}
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                Where did this happen?
              </label>
              <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                Even just a country is fine — but the more precise, the better the map and matches.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={form.city}
                  onChange={function (e) { setForm(function (f) { return { ...f, city: e.target.value } }) }}
                  placeholder="City"
                  className="bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                />
                <input
                  type="text"
                  value={form.state_province}
                  onChange={function (e) { setForm(function (f) { return { ...f, state_province: e.target.value } }) }}
                  placeholder="State / Province"
                  className="bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <input
                type="text"
                value={form.country}
                onChange={function (e) { setForm(function (f) { return { ...f, country: e.target.value } }) }}
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
              <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                Pick a level of precision — exact date if you remember, otherwise just the year.
              </p>
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {[
                  { v: 'exact' as const, l: 'Exact date' },
                  { v: 'month' as const, l: 'Month + year' },
                  { v: 'year' as const, l: 'Year only' },
                  { v: 'decade' as const, l: 'Decade' },
                ].map(function (o) {
                  var active = form.event_date_precision === o.v
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={function () { setForm(function (f) { return { ...f, event_date_precision: o.v, event_date: '' } }) }}
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
              {form.event_date_precision === 'exact' && (
                <input
                  type="date"
                  value={form.event_date}
                  onChange={function (e) { setForm(function (f) { return { ...f, event_date: e.target.value } }) }}
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                />
              )}
              {form.event_date_precision === 'month' && (
                <input
                  type="month"
                  value={form.event_date}
                  onChange={function (e) { setForm(function (f) { return { ...f, event_date: e.target.value } }) }}
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                />
              )}
              {(form.event_date_precision === 'year' || form.event_date_precision === 'decade') && (
                <input
                  type="text"
                  value={form.event_date}
                  onChange={function (e) { setForm(function (f) { return { ...f, event_date: e.target.value } }) }}
                  placeholder={form.event_date_precision === 'year' ? 'e.g. 2018' : 'e.g. 1990s'}
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
                />
              )}
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
                  var active = form.visibility === o.v
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={function () { setForm(function (f) { return { ...f, visibility: o.v } }) }}
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
                  checked={form.share_anonymously}
                  onChange={function (e) { setForm(function (f) { return { ...f, share_anonymously: e.target.checked } }) }}
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

            <button
              type="submit"
              disabled={publishing}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50"
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {publishing ? 'Publishing…' : 'Publish video'}
            </button>
            <p className="text-[11px] text-gray-500 text-center px-4 leading-relaxed">
              By publishing, you confirm this is your video and you have rights to anyone shown in it.
              You can take it down at any time.
            </p>
          </form>
        </div>
      </div>
    </>
  )
}
