'use client'

/**
 * VideoCapture — Phase A first-party video recorder
 *
 * Panel-feedback (May 2026). A MediaRecorder-based vertical-format
 * (9:16) video capture component with a 60-second cap, in-browser
 * preview before submit, and direct upload to /api/reports/video/upload.
 *
 * State machine:
 *   idle      → user hasn't pressed Record yet
 *   recording → recorder running; timer counts up; stop at 60s or tap
 *   review    → blob captured, preview playing; user can re-record or upload
 *   uploading → POST to /api/reports/video/upload
 *   error     → unrecoverable; user gets a retry CTA
 *
 * Limits:
 *   - 60-sec hard cap (recorder stops itself at duration_sec ≥ 60).
 *   - Defaults to 9:16 vertical (720×1280). The actual capture
 *     resolution is whatever the camera offers nearest; we don't
 *     re-encode client-side because the file is small enough
 *     (~5-10MB for 60s at moderate bitrate).
 *
 * Browser support:
 *   MediaRecorder API + getUserMedia. Works on Chrome, Firefox,
 *   Edge, and Safari ≥ 14.1. iOS Safari requires HTTPS or
 *   localhost. Capacitor's native camera plugin gets wired in
 *   the C1.3 platform-add step; this component handles web
 *   today.
 *
 * SWC: var + function() form.
 */

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Video, X, RefreshCw, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface VideoCaptureProps {
  /** Called after the upload succeeds with the new report_id. Optional —
   *  default behavior is to navigate to /submit/video-review/[id]. */
  onUploaded?: (payload: { report_id: string; video_id: string; review_url: string }) => void
  /** Optional cancel handler — when user backs out. */
  onCancel?: () => void
}

var MAX_DURATION_SEC = 60
var MAX_BYTES = 50 * 1024 * 1024

// Preferred mime types in priority order — the recorder picks the
// first one the browser supports.
var MIME_CANDIDATES = [
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

function pickSupportedMime(): string {
  for (var i = 0; i < MIME_CANDIDATES.length; i++) {
    var m = MIME_CANDIDATES[i]
    if (typeof MediaRecorder !== 'undefined' && (MediaRecorder as any).isTypeSupported && (MediaRecorder as any).isTypeSupported(m)) {
      return m
    }
  }
  return 'video/webm'
}

type Phase = 'idle' | 'recording' | 'review' | 'uploading' | 'error'

export default function VideoCapture(props: VideoCaptureProps) {
  var router = useRouter()
  var liveVideoRef = useRef<HTMLVideoElement | null>(null)
  var previewVideoRef = useRef<HTMLVideoElement | null>(null)
  var recorderRef = useRef<MediaRecorder | null>(null)
  var streamRef = useRef<MediaStream | null>(null)
  var chunksRef = useRef<Blob[]>([])
  var timerRef = useRef<number | null>(null)

  var [phase, setPhase] = useState<Phase>('idle')
  var [error, setError] = useState<string | null>(null)
  var [recordedSec, setRecordedSec] = useState(0)
  var [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  var [recordedMime, setRecordedMime] = useState<string>('video/webm')
  var [previewUrl, setPreviewUrl] = useState<string>('')

  // Cleanup on unmount: stop tracks, release blob URLs.
  useEffect(function () {
    return function () {
      stopCamera()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(function (t) { t.stop() })
      streamRef.current = null
    }
  }

  async function startCamera(): Promise<MediaStream | null> {
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        // Prefer vertical 9:16 at 720x1280; browsers will pick the
        // closest match the camera supports.
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 1280 },
          aspectRatio: 9 / 16,
        },
        audio: true,
      })
      streamRef.current = stream
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream
        liveVideoRef.current.play().catch(function () {})
      }
      return stream
    } catch (err: any) {
      console.error('[VideoCapture] getUserMedia failed:', err?.message)
      setError(err?.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow camera access in your browser, then try again.'
        : 'Couldn\'t access your camera. Make sure no other app is using it and try again.')
      setPhase('error')
      return null
    }
  }

  async function handleStart() {
    setError(null)
    setRecordedSec(0)
    setRecordedBlob(null)
    chunksRef.current = []

    var stream = streamRef.current || await startCamera()
    if (!stream) return

    var mime = pickSupportedMime()
    setRecordedMime(mime)

    try {
      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_800_000 })
      recorderRef.current = rec
      rec.ondataavailable = function (e: BlobEvent) {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = function () {
        var blob = new Blob(chunksRef.current, { type: mime })
        setRecordedBlob(blob)
        var url = URL.createObjectURL(blob)
        setPreviewUrl(url)
        setPhase('review')
        // Pause the live feed; we'll show the playback preview instead.
        if (liveVideoRef.current) liveVideoRef.current.pause()
      }
      rec.start(1000) // emit chunks every second
      setPhase('recording')

      // Timer
      var startedAt = Date.now()
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
      timerRef.current = window.setInterval(function () {
        var sec = Math.floor((Date.now() - startedAt) / 1000)
        setRecordedSec(sec)
        if (sec >= MAX_DURATION_SEC) {
          handleStop()
        }
      }, 250)
    } catch (err: any) {
      console.error('[VideoCapture] recorder failed:', err?.message)
      setError('Your browser couldn\'t start recording. Try a different browser (Chrome, Edge, or Safari ≥ 14.1).')
      setPhase('error')
    }
  }

  function handleStop() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  function handleRetake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    setRecordedBlob(null)
    setRecordedSec(0)
    setPhase('idle')
    chunksRef.current = []
    // Restart live preview.
    if (liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current
      liveVideoRef.current.play().catch(function () {})
    }
  }

  async function handleUpload() {
    if (!recordedBlob) return
    if (recordedBlob.size > MAX_BYTES) {
      setError('That video is over the 50 MB cap. Try recording a shorter clip.')
      return
    }
    setPhase('uploading')
    setError(null)

    var sessionResult = await supabase.auth.getSession()
    var session = sessionResult.data.session
    if (!session) {
      setError('You\'ll need to sign in before you can submit a video. We\'ll save your clip and return you here.')
      setPhase('error')
      return
    }

    try {
      var resp = await fetch('/api/reports/video/upload', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + session.access_token,
          'Content-Type': recordedMime,
          'x-mime': recordedMime,
          'x-duration-sec': String(recordedSec),
        },
        body: recordedBlob,
      })
      var data = await resp.json()
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Upload failed')
      }
      if (props.onUploaded) {
        props.onUploaded({
          report_id: data.report_id,
          video_id: data.video_id,
          review_url: data.review_url,
        })
      } else {
        router.push(data.review_url)
      }
    } catch (err: any) {
      console.error('[VideoCapture] upload failed:', err?.message)
      setError(err?.message || 'Upload failed. Try again or switch to a text report.')
      setPhase('review')
    }
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative aspect-[9/16] w-full bg-black rounded-2xl overflow-hidden border border-gray-800/80">
        {/* Live preview (idle + recording) */}
        {(phase === 'idle' || phase === 'recording') && (
          <video
            ref={liveVideoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
        )}
        {/* Playback preview (after stop) */}
        {phase === 'review' && previewUrl && (
          <video
            ref={previewVideoRef}
            className="w-full h-full object-cover"
            src={previewUrl}
            controls
            playsInline
          />
        )}
        {/* Recording timer + indicator overlay */}
        {phase === 'recording' && (
          <div className="absolute top-3 left-3 flex items-center gap-2 px-2 py-1 rounded-full bg-red-600/90 text-white text-xs font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
            REC {recordedSec}s / {MAX_DURATION_SEC}s
          </div>
        )}
        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 pointer-events-none">
            <p className="text-white/80 text-sm font-medium">Tell us about your experience</p>
            <p className="text-white/50 text-xs mt-1">Up to {MAX_DURATION_SEC} seconds · vertical</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 space-y-3">
        {phase === 'idle' && (
          <>
            <button
              type="button"
              onClick={handleStart}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors"
            >
              <Video className="w-4 h-4" />
              Start recording
            </button>
            {props.onCancel && (
              <button
                type="button"
                onClick={props.onCancel}
                className="block mx-auto text-sm text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
            )}
          </>
        )}

        {phase === 'recording' && (
          <button
            type="button"
            onClick={handleStop}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-full transition-colors"
          >
            <span className="inline-block w-3 h-3 bg-white rounded-sm" />
            Stop ({recordedSec}s)
          </button>
        )}

        {phase === 'review' && (
          <>
            <button
              type="button"
              onClick={handleUpload}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors"
            >
              Upload and continue
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRetake}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-sm text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500 rounded-full transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Record again
            </button>
          </>
        )}

        {phase === 'uploading' && (
          <div className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm text-gray-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading your video…
          </div>
        )}

        {phase === 'error' && error && (
          <div className="rounded-lg border border-red-900/40 bg-red-950/30 p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-red-200">{error}</p>
              <button
                type="button"
                onClick={handleRetake}
                className="mt-2 text-xs text-red-100 underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
