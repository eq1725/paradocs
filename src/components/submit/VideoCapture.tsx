'use client'

/**
 * VideoCapture — Phase A first-party video recorder
 *
 * Panel-feedback (May 2026). MediaRecorder-based vertical (9:16)
 * video capture with a 5-minute cap, in-browser preview before
 * submit, and direct-to-Storage upload via a signed URL issued by
 * /api/reports/video/upload-url.
 *
 * Why direct-to-Storage:
 *   The original endpoint pushed bytes through a Vercel serverless
 *   function (~50 MB request body limit on Pro). iPhone HEVC 1080p
 *   recordings can be 250–300 MB for a 5-minute clip — well over
 *   that ceiling. Direct uploads to Supabase Storage bypass the
 *   function entirely.
 *
 * Upload flow:
 *   1. Record locally → Blob.
 *   2. POST /api/reports/video/upload-url to get a signed PUT URL
 *      + new draft report_id + video_id.
 *   3. PUT the blob directly to that signed URL.
 *   4. POST /api/reports/video/[report_id]/finalize to flip status
 *      out of 'uploading'.
 *   5. Navigate to /submit/video-review/[report_id].
 *
 * State machine:
 *   idle      → user hasn't pressed Record yet
 *   recording → recorder running; timer counts up; stop at 300s or tap
 *   review    → blob captured, preview playing; user can re-record or upload
 *   uploading → /upload-url → PUT → /finalize
 *   error     → unrecoverable; user gets a retry CTA
 *
 * Limits:
 *   - 5-minute (300s) hard cap.
 *   - Defaults to 9:16 vertical (720×1280).
 *   - 500 MB client-side size guard matches the Storage bucket cap.
 *
 * Browser support:
 *   MediaRecorder API + getUserMedia. Works on Chrome, Firefox,
 *   Edge, and Safari ≥ 14.1. iOS Safari requires HTTPS or
 *   localhost. Capacitor's native camera plugin gets wired in
 *   the C1.3 platform-add step.
 *
 * SWC: var + function() form.
 */

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Video, RefreshCw, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface VideoCaptureProps {
  /** Called after the upload succeeds with the new report_id. Optional —
   *  default behavior is to navigate to /submit/video-review/[id]. */
  onUploaded?: (payload: { report_id: string; video_id: string; review_url: string }) => void
  /** Optional cancel handler — when user backs out. */
  onCancel?: () => void
}

var MAX_DURATION_SEC = 300            // 5 minutes
var MAX_BYTES = 500 * 1024 * 1024     // 500 MB matches the bucket cap

// Preferred mime types in priority order. The recorder picks the
// first one the browser supports. iPhone Safari supports mp4 from
// iOS 14.5+; Android Chrome emits webm.
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

/** Strip the codecs= suffix so server-side validation only sees the
 *  base MIME ("video/webm;codecs=vp9" → "video/webm"). */
function baseMime(full: string): string {
  return (full || '').split(';')[0].trim().toLowerCase()
}

function formatDuration(sec: number): string {
  var m = Math.floor(sec / 60)
  var s = sec % 60
  return m + ':' + (s < 10 ? '0' : '') + s
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
  var [uploadProgress, setUploadProgress] = useState<number>(0)

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
    setUploadProgress(0)
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
        if (liveVideoRef.current) liveVideoRef.current.pause()
      }
      rec.start(1000)
      setPhase('recording')

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
    setUploadProgress(0)
    setPhase('idle')
    chunksRef.current = []
    if (liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current
      liveVideoRef.current.play().catch(function () {})
    }
  }

  // Step 1: ask the server for a signed upload URL + draft rows.
  // Step 2: PUT the blob directly to that URL with progress tracking.
  // Step 3: POST /finalize to flip status.
  async function putBlobWithProgress(url: string, blob: Blob, mime: string): Promise<void> {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest()
      xhr.open('PUT', url, true)
      xhr.setRequestHeader('Content-Type', mime)
      xhr.upload.onprogress = function (e: ProgressEvent) {
        if (e.lengthComputable && e.total > 0) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else reject(new Error('Storage PUT failed: ' + xhr.status + ' ' + xhr.responseText.slice(0, 200)))
      }
      xhr.onerror = function () { reject(new Error('Network error during upload')) }
      xhr.send(blob)
    })
  }

  async function handleUpload() {
    if (!recordedBlob) return
    if (recordedBlob.size > MAX_BYTES) {
      setError('That video is over the ' + Math.floor(MAX_BYTES / (1024 * 1024)) + ' MB cap. Try recording a shorter clip.')
      return
    }
    setPhase('uploading')
    setUploadProgress(0)
    setError(null)

    var sessionResult = await supabase.auth.getSession()
    var session = sessionResult.data.session
    if (!session) {
      setError('You\'ll need to sign in before you can submit a video.')
      setPhase('error')
      return
    }

    try {
      var mimeBase = baseMime(recordedMime)

      // Step 1: get the signed upload URL + draft rows.
      var urlResp = await fetch('/api/reports/video/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          mime_type: mimeBase,
          size_bytes: recordedBlob.size,
          duration_sec: recordedSec,
        }),
      })
      var urlData = await urlResp.json()
      if (!urlResp.ok || !urlData.ok) {
        throw new Error(urlData.error || 'Could not start upload')
      }

      // Step 2: PUT the blob to Supabase Storage directly.
      await putBlobWithProgress(urlData.signed_url, recordedBlob, mimeBase)

      // Step 3: finalize — verifies the upload landed and flips status.
      var finalizeResp = await fetch('/api/reports/video/' + encodeURIComponent(urlData.report_id) + '/finalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          duration_sec: recordedSec,
          size_bytes: recordedBlob.size,
        }),
      })
      var finalizeData = await finalizeResp.json()
      if (!finalizeResp.ok || !finalizeData.ok) {
        throw new Error(finalizeData.error || 'Could not finalize upload')
      }

      if (props.onUploaded) {
        props.onUploaded({
          report_id: urlData.report_id,
          video_id: urlData.video_id,
          review_url: urlData.review_url,
        })
      } else {
        router.push(urlData.review_url)
      }
    } catch (err: any) {
      console.error('[VideoCapture] upload failed:', err?.message)
      setError(err?.message || 'Upload failed. Try again or switch to a text report.')
      setPhase('review')
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative aspect-[9/16] w-full bg-black rounded-2xl overflow-hidden border border-gray-800/80">
        {(phase === 'idle' || phase === 'recording') && (
          <video
            ref={liveVideoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
        )}
        {phase === 'review' && previewUrl && (
          <video
            ref={previewVideoRef}
            className="w-full h-full object-cover"
            src={previewUrl}
            controls
            playsInline
          />
        )}
        {phase === 'recording' && (
          <div className="absolute top-3 left-3 flex items-center gap-2 px-2 py-1 rounded-full bg-red-600/90 text-white text-xs font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
            REC {formatDuration(recordedSec)} / {formatDuration(MAX_DURATION_SEC)}
          </div>
        )}
        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 pointer-events-none">
            <p className="text-white/80 text-sm font-medium">Tell us about your experience</p>
            <p className="text-white/50 text-xs mt-1">Up to {Math.floor(MAX_DURATION_SEC / 60)} minutes · vertical</p>
          </div>
        )}
      </div>

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
            Stop ({formatDuration(recordedSec)})
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
            {recordedBlob && (
              <p className="text-[11px] text-gray-500 text-center">
                {formatDuration(recordedSec)} · {(recordedBlob.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            )}
          </>
        )}

        {phase === 'uploading' && (
          <div className="space-y-2">
            <div className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm text-gray-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading your video… {uploadProgress > 0 ? uploadProgress + '%' : ''}
            </div>
            {uploadProgress > 0 && (
              <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-200"
                  style={{ width: uploadProgress + '%' }}
                />
              </div>
            )}
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
