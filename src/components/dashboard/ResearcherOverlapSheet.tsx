'use client'

/**
 * ResearcherOverlapSheet — V10.3 (QA #6c)
 *
 * Bottom-sheet modal opened by tapping the "Researcher Overlap"
 * tile in the Research Pulse box. Surfaces other researchers
 * whose save library meaningfully overlaps with the current
 * user's, ranked by IDF-weighted score.
 *
 * Design notes (per V10.3 panel):
 *   - Tier badge per researcher (Strong vs Notable) gives users
 *     intuition for "this match is special" vs "interesting alignment".
 *   - Shared-saves preview (up to 3) is the proof — "we both saved
 *     THIS exact rare thing" is the magic moment.
 *   - Mediated reach-out via the existing connection_request flow,
 *     reusing the same moderation + 30-day cooldown safety nets
 *     People Like You already battle-tested.
 *
 * Privacy:
 *   - Empty state guides users to enable Researcher Overlap visibility
 *     if they've turned it off (mutual-courtesy gate).
 */

import React, { useEffect, useState } from 'react'
import {
  X, Users, Sparkles, Send, Loader2, ChevronRight,
  ExternalLink, Heart, MapPin,
} from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface OverlapMatch {
  userId: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  score: number
  tier: 'strong' | 'notable'
  externalCount: number
  internalCount: number
  sharedItems: Array<{
    kind: 'report' | 'phenomenon' | 'external_url_hash'
    id: string
    title?: string
    slug?: string
    url?: string | null
    thumbnailUrl?: string | null
    weight: number
  }>
}

interface ResearcherOverlapSheetProps {
  open: boolean
  onClose: () => void
}

export default function ResearcherOverlapSheet({ open, onClose }: ResearcherOverlapSheetProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<OverlapMatch[]>([])
  const [composerFor, setComposerFor] = useState<string | null>(null)
  const [intro, setIntro] = useState('')
  const [sending, setSending] = useState(false)
  const [sentStatus, setSentStatus] = useState<Record<string, 'pending' | 'rejected'>>({})
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token
      if (!token) { setError('Sign in to see your overlaps.'); setLoading(false); return }
      fetch('/api/user/researcher-overlap', { headers: { Authorization: 'Bearer ' + token } })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load overlap')))
        .then(payload => { setMatches(payload.matches || []) })
        .catch(err => { setError(err.message || 'Failed to load') })
        .finally(() => { setLoading(false) })
    })
  }, [open])

  // Body-scroll lock while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  function openComposer(userId: string) {
    setComposerFor(userId)
    setIntro('')
    setSendError(null)
  }
  function closeComposer() {
    setComposerFor(null)
    setIntro('')
    setSendError(null)
  }

  async function sendIntro(peerUserId: string) {
    if (intro.trim().length < 10) { setSendError('Add a few more words so they know why you’re reaching out.'); return }
    setSending(true)
    setSendError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) { setSendError('Sign in to reach out.'); setSending(false); return }
      const resp = await fetch('/api/connections/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ to_user_id: peerUserId, intro_message: intro.trim() }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setSendError(body.error || 'Failed to send request.')
      } else if (body.status === 'rejected_moderation') {
        setSentStatus(prev => ({ ...prev, [peerUserId]: 'rejected' }))
      } else {
        setSentStatus(prev => ({ ...prev, [peerUserId]: 'pending' }))
        closeComposer()
      }
    } catch (e: any) {
      setSendError(e.message || 'Network error')
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Researcher Overlap"
    >
      <div
        className="relative w-full sm:max-w-2xl max-h-[88dvh] bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 flex-shrink-0">
              <Users className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">Researcher Overlap</h2>
              <p className="text-[10px] text-gray-500 leading-tight truncate">
                Researchers whose libraries align with yours
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-12">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {!loading && !error && matches.length === 0 && <EmptyState />}

          {!loading && !error && matches.length > 0 && (
            <>
              <p className="text-[11px] text-gray-500 leading-relaxed mb-4">
                We score overlap by RARITY — saving a viral case counts for little, saving an obscure
                report counts for a lot. Matches below a quality floor never appear here.
              </p>
              <ul className="space-y-3">
                {matches.map(m => {
                  const name = m.displayName || m.username || 'A fellow researcher'
                  const status = sentStatus[m.userId]
                  const isComposing = composerFor === m.userId
                  return (
                    <li key={m.userId} className="bg-gray-900/40 border border-gray-800 rounded-xl p-3">
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center text-sm text-gray-400 border border-gray-700">
                          {m.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (name[0] || '?').toUpperCase()
                          )}
                        </div>
                        {/* Body */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-white truncate">
                              {m.username
                                ? <Link href={'/researcher/' + m.username} className="hover:text-purple-300 transition-colors">{name}</Link>
                                : name}
                            </p>
                            <TierBadge tier={m.tier} />
                          </div>
                          <p className="text-[11px] text-gray-500 leading-tight mb-2">
                            <span className="tabular-nums text-gray-400">{m.score.toFixed(2)}</span> overlap score · {m.internalCount + m.externalCount} shared{' '}
                            <span className="text-gray-600">
                              ({m.internalCount} Paradocs, {m.externalCount} external)
                            </span>
                          </p>

                          {/* Shared items preview */}
                          {m.sharedItems.length > 0 && (
                            <ul className="space-y-1 mb-2">
                              {m.sharedItems.slice(0, 3).map((it, i) => (
                                <li key={i} className="flex items-center gap-2 text-[11px] text-gray-300 min-w-0">
                                  <span className="w-1 h-1 rounded-full bg-gray-600 flex-shrink-0" aria-hidden />
                                  {it.kind === 'report' && it.slug ? (
                                    <Link
                                      href={'/report/' + it.slug}
                                      className="truncate text-gray-300 hover:text-purple-300 transition-colors"
                                    >
                                      {it.title || 'Paradocs report'}
                                    </Link>
                                  ) : it.kind === 'phenomenon' && it.slug ? (
                                    <Link
                                      href={'/phenomena/' + it.slug}
                                      className="truncate text-gray-300 hover:text-purple-300 transition-colors"
                                    >
                                      {it.title || 'Phenomenon'}
                                    </Link>
                                  ) : it.kind === 'external_url_hash' && it.url ? (
                                    <a
                                      href={it.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="truncate text-gray-300 hover:text-purple-300 transition-colors inline-flex items-center gap-1"
                                    >
                                      <span className="truncate">{it.title || it.url}</span>
                                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                    </a>
                                  ) : (
                                    <span className="truncate text-gray-400">{it.title || 'Shared save'}</span>
                                  )}
                                </li>
                              ))}
                              {m.sharedItems.length > 3 && (
                                <li className="text-[10px] text-gray-600 pl-3">
                                  +{m.sharedItems.length - 3} more shared
                                </li>
                              )}
                            </ul>
                          )}

                          {/* CTA */}
                          {status === 'pending' ? (
                            <p className="text-[11px] text-emerald-400 inline-flex items-center gap-1 mt-1">
                              <Heart className="w-3 h-3" /> Reach-out sent. They can accept or decline.
                            </p>
                          ) : status === 'rejected' ? (
                            <button
                              onClick={() => openComposer(m.userId)}
                              className="text-[11px] text-amber-300 hover:text-amber-200 underline mt-1"
                            >
                              Didn’t pass review — edit and resend
                            </button>
                          ) : isComposing ? (
                            <div className="mt-2 space-y-2">
                              <textarea
                                value={intro}
                                onChange={e => setIntro(e.target.value)}
                                placeholder="A short note about why you're reaching out…"
                                rows={3}
                                maxLength={1000}
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs placeholder-gray-500 focus:outline-none focus:border-cyan-500 leading-relaxed"
                              />
                              <p className="text-[10px] text-gray-500">
                                Paradocs delivers your note privately; your contact info is never shared.
                              </p>
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={closeComposer} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1">Cancel</button>
                                <button
                                  onClick={() => sendIntro(m.userId)}
                                  disabled={sending || intro.trim().length < 10}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
                                >
                                  {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                  {sending ? 'Sending…' : 'Send'}
                                </button>
                              </div>
                              {sendError && <p className="text-[11px] text-red-300">{sendError}</p>}
                            </div>
                          ) : (
                            <button
                              onClick={() => openComposer(m.userId)}
                              className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 transition-colors"
                            >
                              <Send className="w-3 h-3" /> Reach out privately
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-gray-800 flex-shrink-0">
          <p className="text-[10px] text-gray-500 leading-relaxed">
            Manage incoming reach-outs at{' '}
            <Link href="/connections" className="text-cyan-300 hover:text-cyan-200 underline">Connections</Link>.
            To hide yourself from other researchers’ overlap lists, go to{' '}
            <Link href="/account/settings" className="text-cyan-300 hover:text-cyan-200 underline">Settings → Privacy</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────

function TierBadge({ tier }: { tier: 'strong' | 'notable' }) {
  if (tier === 'strong') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/40 text-cyan-200">
        <Sparkles className="w-2.5 h-2.5" />
        Strong
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-800/60 border border-gray-700 text-gray-300">
      Notable
    </span>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-10">
      <div className="inline-flex p-3 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-3">
        <Users className="w-6 h-6 text-cyan-300" />
      </div>
      <h3 className="text-base font-semibold text-white mb-2">
        No overlapping researchers yet
      </h3>
      <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
        We surface researchers only when the overlap is genuinely meaningful — at least one external
        URL save in common, or three+ Paradocs reports both of you have flagged. Keep saving the
        cases that matter to you and the matches will sharpen.
      </p>
      <p className="text-[10px] text-gray-600 mt-3">
        Have at least one external save (paste a URL into Saves) to qualify for the first overlap tier.
      </p>
    </div>
  )
}
