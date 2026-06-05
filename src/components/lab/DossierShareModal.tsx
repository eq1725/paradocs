'use client'

// V11.17.71 - Pro Dossier
//
// DossierShareModal — the "share this Dossier" modal per
// PRO_TIER_VALIDATION_V3.md §3.4.
//
// Surfaces:
//   - The 1080×1350 share-card image preview.
//   - A toggle for "Public URL" (flips is_public_shareable). On flip
//     ON, the server mints a share_token and returns the public URL.
//   - Copy-link button.
//   - X (Twitter) and direct-image-download helpers.
//
// Privacy default: anonymized. Sharing requires explicit opt-in;
// the verbatim account text is NOT included in the share card or
// the public URL view by default.

import React, { useCallback, useEffect, useState } from 'react'
import { X, Copy, Check, Twitter, Download, Lock, Globe } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { ProDossierRow } from '@/lib/lab/dossier/dossier-types'

interface DossierShareModalProps {
  row: ProDossierRow
  onClose: () => void
  onUpdated: (updated: ProDossierRow) => void
}

export function DossierShareModal(props: DossierShareModalProps) {
  var [isPublic, setIsPublic] = useState(!!props.row.is_public_shareable)
  var [shareToken, setShareToken] = useState<string | null>(props.row.share_token)
  var [busy, setBusy] = useState(false)
  var [copied, setCopied] = useState(false)
  var [origin, setOrigin] = useState('')

  // Compute share-card URL with owner-authenticated header. For the
  // PNG preview in the modal we use the no-token path (owner-authed
  // via cookie/session won't apply because the route checks the
  // Authorization bearer — we hit the route as an authed image and
  // accept the auth-required-failure fallback to SVG).
  var shareCardImgUrl = '/api/lab/dossier/' + props.row.id + '/share-card.png' +
    (shareToken && isPublic ? '?token=' + encodeURIComponent(shareToken) : '')

  var publicUrl = isPublic && shareToken
    ? (origin || '') + '/dossier/share/' + shareToken
    : ''

  useEffect(function () {
    if (typeof window !== 'undefined') setOrigin(window.location.origin)
  }, [])

  var togglePublic = useCallback(async function () {
    if (busy) return
    setBusy(true)
    try {
      var sessionResp = await supabase.auth.getSession()
      var session = sessionResp.data.session
      if (!session) return
      var resp = await fetch('/api/lab/dossier/' + props.row.id + '/toggle-public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ public: !isPublic }),
      })
      if (resp.ok) {
        var json = await resp.json()
        setIsPublic(!!json.is_public_shareable)
        setShareToken(json.share_token || null)
        // Propagate to parent so the Dossier viewer carries the new state.
        var updated = Object.assign({}, props.row, {
          is_public_shareable: !!json.is_public_shareable,
          share_token: json.share_token || null,
        }) as ProDossierRow
        props.onUpdated(updated)
      }
    } finally {
      setBusy(false)
    }
  }, [busy, isPublic, props])

  var copyLink = useCallback(function () {
    if (!publicUrl) return
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(function () { setCopied(false) }, 2000)
    }
  }, [publicUrl])

  var openTwitter = useCallback(function () {
    if (!publicUrl) return
    var meta = props.row.sections_json.meta
    var text = encodeURIComponent(
      'My dossier from The Paradocs Archive — ' + (meta.experience_year || '') + ' ' + meta.sub_pattern_tag + '.',
    )
    var u = 'https://twitter.com/intent/tweet?text=' + text + '&url=' + encodeURIComponent(publicUrl)
    window.open(u, '_blank', 'noopener,noreferrer')
  }, [publicUrl, props.row])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-purple-700/40 bg-gradient-to-br from-purple-950/60 via-gray-950/80 to-gray-950 p-5 sm:p-6"
        onClick={function (e) { e.stopPropagation() }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p
              className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-1"
              style={{ color: '#9000F0', fontFamily: "'Changa One', system-ui, sans-serif" }}
            >
              Share Dossier
            </p>
            <h3 className="text-lg font-semibold text-white">Share this Dossier</h3>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={props.onClose}
            className="p-1.5 rounded-full text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ─── Share-card preview ─── */}
        <div className="aspect-[4/5] w-full max-w-[240px] mx-auto mb-4 rounded-lg overflow-hidden border border-gray-800/60 bg-black">
          <img
            src={shareCardImgUrl}
            alt="Dossier share card preview"
            className="w-full h-full object-cover"
          />
        </div>

        {/* ─── Public URL toggle ─── */}
        <div className="rounded-lg border border-gray-800/60 bg-gray-900/40 p-4 mb-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="text-sm font-medium text-white flex items-center gap-2">
                {isPublic ? <Globe className="w-4 h-4 text-purple-300" /> : <Lock className="w-4 h-4 text-gray-500" />}
                Public link
              </p>
              <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                Anonymized — shows phen-family, year, region, and the rarity stat. Your verbatim account is never shared.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={togglePublic}
              disabled={busy}
              className={
                'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ' +
                (isPublic ? 'bg-purple-600' : 'bg-gray-700')
              }
            >
              <span
                className={
                  'inline-block h-5 w-5 transform rounded-full bg-white transition-transform ' +
                  (isPublic ? 'translate-x-5' : 'translate-x-0.5')
                }
              />
            </button>
          </div>
          {isPublic && publicUrl && (
            <div className="flex items-center gap-2 mt-3">
              <input
                readOnly
                value={publicUrl}
                onClick={function (e) { (e.currentTarget as HTMLInputElement).select() }}
                className="flex-1 min-w-0 px-2 py-1.5 rounded bg-gray-800/60 text-xs text-gray-200 font-mono border border-gray-700/60 focus:border-purple-500/60 outline-none"
              />
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white bg-purple-600 hover:bg-purple-500 transition-colors flex-shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        {/* ─── Additional share actions ─── */}
        <div className="flex flex-wrap gap-2">
          {isPublic && (
            <button
              type="button"
              onClick={openTwitter}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-white bg-gray-800/60 hover:bg-gray-700/60 transition-colors"
            >
              <Twitter className="w-3.5 h-3.5" />
              Share on X
            </button>
          )}
          <a
            href={shareCardImgUrl}
            download={'paradocs-dossier-' + props.row.id.substring(0, 8) + '.png'}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-purple-200 bg-purple-600/15 border border-purple-500/40 hover:bg-purple-600/25 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download image
          </a>
        </div>

        <p className="text-[10px] text-gray-500 mt-4 leading-relaxed">
          The share card and public URL never include your verbatim account, your username, or your precise address. You can turn the public link off at any time.
        </p>
      </div>
    </div>
  )
}

export default DossierShareModal
