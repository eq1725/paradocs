'use client'

/**
 * CustomAvatarUpload — V9.7 Phase 2.
 *
 * Modal flow:
 *   1. Hidden file input fires from the +Custom tile click in
 *      AvatarSelector. We accept image/* and HEIC.
 *   2. On file pick, render a square-crop UI via react-easy-crop.
 *   3. On confirm, generate a square cropped Blob, POST it to
 *      /api/user/avatar/upload as raw bytes (X-Mime: image/jpeg).
 *   4. Show one of three result states:
 *        - approved:  parent's onUploaded(url) fires + close
 *        - pending:   informative toast: "Visible after review"
 *        - rejected:  error message stays on the modal
 *
 * The crop is enforced client-side to a 1:1 aspect ratio so the
 * server can skip aspect-ratio handling. We always resize to 256x256
 * server-side (sharp) regardless of how big the cropped Blob is.
 *
 * SWC-friendly (var, function expressions). react-easy-crop is the
 * only client-side dep added in V9.7 Phase 2.
 */

import React, { useState, useCallback } from 'react'
import { X, Upload, Loader2, AlertCircle, Check } from 'lucide-react'
import Cropper from 'react-easy-crop'
import { supabase } from '@/lib/supabase'

interface CustomAvatarUploadProps {
  open: boolean
  onClose: () => void
  /** Called on approved upload with the new avatar URL. */
  onApproved: (avatarUrl: string) => void
  /** Called on pending upload (queued for review). */
  onPending?: () => void
}

interface Area {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Crop the source image to the selected square area, returning a JPEG
 * Blob. Uses canvas + drawImage; runs entirely in the browser.
 */
async function getCroppedBlob(imageSrc: string, crop: Area): Promise<Blob> {
  return new Promise(function (resolve, reject) {
    var img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = function () {
      var canvas = document.createElement('canvas')
      // Output at 512px on the long side — server will resize to 256
      // anyway, but giving sharp a clean source improves quality.
      var size = 512
      canvas.width = size
      canvas.height = size
      var ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas context unavailable'))
      ctx.drawImage(
        img,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, size, size
      )
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob)
        else reject(new Error('Canvas to blob failed'))
      }, 'image/jpeg', 0.92)
    }
    img.onerror = function () { reject(new Error('Image load failed')) }
    img.src = imageSrc
  })
}

export default function CustomAvatarUpload(props: CustomAvatarUploadProps) {
  var [imageSrc, setImageSrc] = useState<string | null>(null)
  var [crop, setCrop] = useState({ x: 0, y: 0 })
  var [zoom, setZoom] = useState(1)
  var [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  var [busy, setBusy] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [pendingMessage, setPendingMessage] = useState<string | null>(null)

  var onCropComplete = useCallback(function (_area: Area, areaPixels: Area) {
    setCroppedAreaPixels(areaPixels)
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    var file = e.target.files && e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('That image is over 10MB — please pick a smaller one.')
      return
    }
    // HEIC support: browsers can't render HEIC in <img>. Reject early.
    if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic')) {
      setError('HEIC photos aren’t supported yet. Try saving as JPEG first or pick a different image.')
      return
    }
    var reader = new FileReader()
    reader.onload = function () { setImageSrc(reader.result as string) }
    reader.readAsDataURL(file)
  }

  async function handleUpload() {
    if (!imageSrc || !croppedAreaPixels) return
    setBusy(true)
    setError(null)
    try {
      var blob = await getCroppedBlob(imageSrc, croppedAreaPixels)
      // V9.7 P2 — fetch the access token directly so we can pass it
      // as a Bearer header. Cookie-based auth wasn't reliable for
      // octet-stream POSTs in the deployed environment; explicit
      // Bearer mirrors what /api/admin/avatar-decision does.
      var sessionResp = await supabase.auth.getSession()
      var token = sessionResp.data.session?.access_token
      if (!token) {
        setError('You need to be signed in to upload an avatar.')
        setBusy(false)
        return
      }
      var resp = await fetch('/api/user/avatar/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Mime': 'image/jpeg',
          Authorization: 'Bearer ' + token,
        },
        body: blob,
      })
      var data = await resp.json()
      if (!resp.ok) {
        // Friendly fallback if server didn't include a message.
        setError(data.error || 'Upload failed. Try again.')
        setBusy(false)
        return
      }
      if (data.decision === 'approved' && data.avatar_url) {
        props.onApproved(data.avatar_url)
        handleReset()
        props.onClose()
      } else if (data.decision === 'pending') {
        setPendingMessage('Your avatar is queued for review and will be visible to others shortly. Until then, your previous avatar stays in place.')
        if (props.onPending) props.onPending()
      } else {
        setError(data.error || 'Couldn’t use that image — please try another.')
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected error during upload.')
    } finally {
      setBusy(false)
    }
  }

  function handleReset() {
    setImageSrc(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setError(null)
    setPendingMessage(null)
  }

  function handleClose() {
    handleReset()
    props.onClose()
  }

  if (!props.open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-6"
        onClick={function (e) { e.stopPropagation() }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Upload custom avatar</h3>
            <p className="text-xs text-gray-500 mt-0.5">JPEG, PNG, or WebP — up to 2 MB.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 hover:bg-white/10 rounded-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {pendingMessage ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/15 flex items-center justify-center mb-3">
              <Check className="w-6 h-6 text-amber-300" />
            </div>
            <p className="text-sm text-gray-200 leading-relaxed mb-4">{pendingMessage}</p>
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full"
            >
              OK
            </button>
          </div>
        ) : !imageSrc ? (
          <label className="block">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFile}
              className="sr-only"
            />
            <div className="border-2 border-dashed border-gray-700 hover:border-purple-500/50 rounded-xl py-10 px-6 text-center cursor-pointer transition-colors">
              <Upload className="w-8 h-8 mx-auto text-gray-500 mb-3" />
              <p className="text-sm text-gray-300">Click to choose an image</p>
              <p className="text-xs text-gray-500 mt-1">We&apos;ll crop it square and resize automatically.</p>
            </div>
          </label>
        ) : (
          <>
            <div className="relative w-full aspect-square bg-black rounded-xl overflow-hidden mb-3">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs text-gray-500">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={function (e) { setZoom(Number(e.target.value)) }}
                className="flex-1 accent-purple-500"
              />
            </div>
          </>
        )}

        {error && !pendingMessage && (
          <div className="flex items-start gap-2 mb-3 p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-200">{error}</p>
          </div>
        )}

        {imageSrc && !pendingMessage && (
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              className="px-4 py-2 text-sm text-gray-300 hover:text-white"
            >
              Choose another
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={busy || !croppedAreaPixels}
              className="inline-flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>Use this image</>
              )}
            </button>
          </div>
        )}

        <p className="text-[10px] text-gray-500 text-center mt-4 leading-relaxed">
          Custom avatars are auto-scanned for safety. Anything explicit, hateful, or otherwise off-policy will be rejected.
        </p>
      </div>
    </div>
  )
}
