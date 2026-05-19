'use client'

/**
 * VideoCapture — Phase A first-party video recorder
 *
 * Panel-feedback (May 2026 — 2nd revision):
 *
 * The original MediaRecorder-only implementation produced landscape,
 * over-zoomed recordings on iPhone because:
 *   1. iPhone front-camera sensors are physically landscape and the
 *      web MediaRecorder API doesn't honor device orientation.
 *   2. CSS object-cover cropped the wider sensor frame to "look"
 *      vertical, producing the zoomed-face artifact.
 *   3. iOS Safari requires user-gesture activation before
 *      getUserMedia returns a stream, so the in-page live preview
 *      was empty on first mount.
 *
 * Fix: on iOS, prefer the native camera via
 *      <input type="file" accept="video/*" capture="user">.
 * The system camera app launches, the user records with proper
 * rotation + stabilization + zoom controls, the resulting file
 * comes back with correct EXIF orientation. Same upload + review
 * pipeline downstream.
 *
 * Non-iOS browsers (desktop Chrome/Firefox/Edge, Android Chrome) keep
 * the existing MediaRecorder path because their MediaRecorder
 * implementations are well-behaved.
 *
 * State machine (MediaRecorder path):
 *   idle → recording → review → uploading → (next page)
 *                          ↘   → error
 *
 * State machine (native iOS path):
 *   idle → (system camera takes over) → review → uploading → (next page)
 *                                                  ↘   → error
 *
 * SWC: var + function() form.
 */

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Video, RefreshCw, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface VideoCaptureProps {
  onUploaded?: (payload: { report_id: string; video_id: string; review_url: string }) => void
  onCancel?: () => void
}

var MAX_DURATION_SEC = 300
var MAX_BYTES = 500 * 1024 * 1024

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

function baseMime(full: string): string {
  return (full || '').split(';')[0].trim().toLowerCase()
}

function formatDuration(sec: number): string {
  var m = Math.floor(sec / 60)
  var s = sec % 60
  return m + ':' + (s < 10 ? '0' : '') + s
}

/** UA-detect iOS. Treat anything with iPhone/iPad/iPod or the modern
 *  Safari-on-iPadOS pattern (Mac + touch) as iOS. */
function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  var ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS 13+ reports as Mac with maxTouchPoints > 1.
  if (/Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1) return true
  return false
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
  var nativeInputRef = useRef<HTMLInputElement | null>(null)

  var [useNative, setUseNative] = useState<boolean>(false)
  var [phase, setPhase] = useState<Phase>('idle')
  var [error, setError] = useState<string | null>(null)
  var [recordedSec, setRecordedSec] = useState(0)
  var [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  var [recordedMime, setRecordedMime] = useState<string>('video/webm')
  var [previewUrl, setPreviewUrl] = useState<string>('')
  var [uploadProgress, setUploadProgress] = useState<number>(0)

  useEffect(function () {
    setUseNative(isIosDevice())
  }, [])

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

  // ── Native iOS path ────────────────────────────────────────
  function handleNativeOpen() {
    setError(null)
    if (nativeInputRef.current) {
      nativeInputRef.current.value = ''
      nativeInputRef.current.click()
    }
  }

  function handleNativeFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    var file = e.target.files && e.target.files[0]
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError('That video is over the ' + Math.floor(MAX_BYTES / (1024 * 1024)) + ' MB cap. Try a shorter recording.')
      setPhase('error')
      return
    }
    setRecordedBlob(file)
    setRecordedMime(file.type || 'video/mp4')
    var url = URL.createObjectURL(file)
    setPreviewUrl(url)
    // Try to read duration via a hidden <video> probe.
    try {
      var probe = document.createElement('video')
      probe.preload = 'metadata'
      probe.src = url
      probe.onloadedmetadata = function () {
        if (probe.duration && isFinite(probe.duration)) {
          setRecordedSec(Math.round(probe.duration))
        }
      }
    } catch {}
    setPhase('review')
  }

  // ── MediaRecorder path (desktop / Android) ─────────────────
  async function startCameraMR(): Promise<MediaStream | null> {
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 }, aspectRatio: 9 / 16 },
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

  async function handleStartMR() {
    setError(null)
    setRecordedSec(0)
    setRecordedBlob(null)
    setUploadProgress(0)
    chunksRef.current = []

    var stream = streamRef.current || await startCameraMR()
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
        if (sec >= MAX_DURATION_SEC) handleStopMR()
      }, 250)
    } catch (err: any) {
      console.error('[VideoCapture] recorder failed:', err?.message)
      setError('Your browser couldn\'t start recording. Try a different browser (Chrome, Edge, or Safari ≥ 14.1).')
      setPhase('error')
    }
  }

  function handleStopMR() {
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
    if (!useNative && liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current
      liveVideoRef.current.play().catch(function () {})
    }
  }

  // ── Upload (shared by both paths) ──────────────────────────
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
      setError('That video is over the ' + Math.floor(MAX_BYTES / (1024 * 1024)) + ' MB cap. Try a shorter clip.')
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
      var urlResp = await fetch('/api/reports/video/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ mime_type: mimeBase, size_bytes: recordedBlob.size, duration_sec: recordedSec }),
      })
      var urlData = await urlResp.json()
      if (!urlResp.ok || !urlData.ok) throw new Error(urlData.error || 'Could not start upload')

      await putBlobWithProgress(urlData.signed_url, recordedBlob, mimeBase)

      var finalizeResp = await fetch('/api/reports/video/' + encodeURIComponent(urlData.report_id) + '/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ duration_sec: recordedSec, size_bytes: recordedBlob.size }),
      })
      var finalizeData = await finalizeResp.json()
      if (!finalizeResp.ok || !finalizeData.ok) throw new Error(finalizeData.error || 'Could not finalize upload')

      if (props.onUploaded) {
        props.onUploaded({ report_id: urlData.report_id, video_id: urlData.video_id, review_url: urlData.review_url })
      } else {
        router.push(urlData.review_url)
      }
    } catch (err: any) {
      console.error('[VideoCapture] upload failed:', err?.message)
      setError(err?.message || 'Upload failed. Try again or switch to a text report.')
      setPhase('review')
    }
  }

  // ── Render ──────────────────────────────────────────────────
  // Native iOS path: a giant "Tap to open camera" hero + a hidden file input.
  if (useNative && phase !== 'review' && phase !== 'uploading') {
    return (
      <div className="w-full max-w-md mx-auto">
        <button
          type="button"
          onClick={handleNativeOpen}
          className="w-full aspect-[9/16] max-h-[60vh] rounded-2xl border border-purple-700/50 bg-gradient-to-br from-purple-950/60 to-gray-950/60 flex flex-col items-center justify-center gap-4 text-white hover:from-purple-900/60 hover:to-gray-900/60 transition-colors"
        >
          <div className="w-16 h-16 rounded-full bg-purple-600/30 border border-purple-500/30 flex items-center justify-center">
            <Video className="w-8 h-8 text-purple-200" />
          </div>
          <div className="text-center px-6">
            <p className="text-base font-semibold">Tap to open camera</p>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              Up to 5 minutes · Your iPhone&rsquo;s camera handles the recording — vertical, properly oriented.
            </p>
          </div>
        </button>
        <input
          ref={nativeInputRef}
          type="file"
          accept="video/*"
          capture="user"
          onChange={handleNativeFileChange}
          className="hidden"
        />
        {props.onCancel && (
          <button
            type="button"
            onClick={props.onCancel}
            className="block mx-auto mt-4 text-sm text-gray-400 hover:text-gray-200"
          >
            Cancel
          </button>
        )}
        {phase === 'error' && error && (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/30 p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-red-200">{error}</p>
              <button
                type="button"
                onClick={function () { setPhase('idle'); setError(null) }}
                className="mt-2 text-xs text-red-100 underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // MediaRecorder path (desktop / Android) + review state for both paths.
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative aspect-[9/16] w-full bg-black rounded-2xl overflow-hidden border border-gray-800/80">
        {(phase === 'idle' || phase === 'recording') && !useNative && (
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
            className="w-full h-full object-contain"
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
        {phase === 'idle' && !useNative && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 pointer-events-none">
            <p className="text-white/80 text-sm font-medium">Tell us about your experience</p>
            <p className="text-white/50 text-xs mt-1">Up to {Math.floor(MAX_DURATION_SEC / 60)} minutes · vertical</p>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {phase === 'idle' && !useNative && (
          <>
            <button
              type="button"
              onClick={handleStartMR}
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
            onClick={handleStopMR}
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
              onClick={useNative ? handleNativeOpen : handleRetake}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-sm text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500 rounded-full transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {useNative ? 'Record again' : 'Record again'}
            </button>
            {recordedBlob && (
              <p className="text-[11px] text-gray-500 text-center">
                {recordedSec > 0 ? formatDuration(recordedSec) + ' · ' : ''}{(recordedBlob.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            )}
            {/* Hidden input stays in DOM so the "Record again" button can re-trigger native capture on iOS. */}
            {useNative && (
              <input
                ref={nativeInputRef}
                type="file"
                accept="video/*"
                capture="user"
                onChange={handleNativeFileChange}
                className="hidden"
              />
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
