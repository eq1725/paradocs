'use client'

/**
 * PasteUrlButton — entry point for adding user-sourced evidence to the map.
 *
 * Flow: button → modal with URL input → auto-extract metadata → preview
 * with editable title/category/verdict/tags/note → save to
 * /api/constellation/artifacts → invoke onArtifactSaved so the caller can
 * refresh the constellation view.
 *
 * Designed for mobile-first: the modal uses a bottom-aligned sheet on small
 * screens (slide-up), and a centered dialog on larger screens.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Link as LinkIcon, X as XIcon, Loader2, ExternalLink, Check, AlertCircle, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'
import { CONSTELLATION_NODES, inferCategoryFromTags } from '@/lib/constellation-data'
import type { PhenomenonCategory } from '@/lib/database.types'

interface PasteUrlButtonProps {
  onArtifactSaved: () => void
}

interface ExtractedMetadata {
  url: string
  normalized_url: string
  title: string
  thumbnail_url: string | null
  description: string | null
  source_type: string
  source_platform: string
  oembed_html: string | null
  author: string | null
  published_date: string | null
  suggested_tags: string[]
  inferred_category: string | null
}

const VERDICT_OPTIONS: Array<{ value: string; label: string; icon: string; color: string }> = [
  { value: 'compelling',   label: 'Compelling',   icon: '✦', color: 'text-amber-400 border-amber-400/40 bg-amber-500/10' },
  { value: 'inconclusive', label: 'Inconclusive', icon: '◐', color: 'text-blue-400 border-blue-400/40 bg-blue-500/10' },
  { value: 'skeptical',    label: 'Skeptical',    icon: '⊘', color: 'text-gray-400 border-gray-500/40 bg-gray-500/10' },
  { value: 'needs_info',   label: 'Needs info',   icon: '?', color: 'text-purple-400 border-purple-400/40 bg-purple-500/10' },
]

export default function PasteUrlButton({ onArtifactSaved }: PasteUrlButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary-300 bg-primary-600/15 border border-primary-500/30 hover:bg-primary-600/25 hover:text-primary-200 transition-colors flex-shrink-0"
        title="Add an external link (YouTube, Reddit, Wikipedia, news article, etc.)"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Add source</span>
      </button>

      {open && (
        <PasteUrlModal
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            onArtifactSaved()
          }}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────

interface PasteUrlModalProps {
  onClose: () => void
  onSaved: () => void
}

function PasteUrlModal({ onClose, onSaved }: PasteUrlModalProps) {
  const [url, setUrl] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<ExtractedMetadata | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  /** Duplicate-detection: non-null when the pasted URL already exists in the user's library. */
  const [duplicate, setDuplicate] = useState<{ id: string; title: string } | null>(null)
  /** Claude-suggested tags+summary — surfaced as an accept/override prompt */
  const [aiSuggestion, setAiSuggestion] = useState<{ tags: string[]; summary: string | null } | null>(null)
  const [autoTagging, setAutoTagging] = useState(false)

  // Editable form fields (seeded from extract, then user can override)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>('combination')
  const [verdict, setVerdict] = useState<string>('needs_info')
  const [note, setNote] = useState('')
  const [tagsInput, setTagsInput] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus the URL input on open
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Lock body scroll when modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Debounced auto-extract when the URL looks valid
  const runExtract = useCallback(async (candidate: string) => {
    let parsed: URL
    try {
      parsed = new URL(candidate)
    } catch {
      return
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return

    setExtracting(true)
    setExtractError(null)
    setMetadata(null)
    setDuplicate(null)

    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) {
        setExtractError('Sign in expired — refresh the page and try again.')
        setExtracting(false)
        return
      }

      // Duplicate check runs in parallel with the extract. If this URL is
      // already saved, we surface that to the user before they waste time
      // filling out a second copy. The check is cheap — one hash lookup.
      const [dupRes, extractRes] = await Promise.all([
        fetch('/api/constellation/artifacts/check-dup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: candidate }),
        }).then(r => r.json()).catch(() => ({ exists: false })),
        fetch('/api/constellation/artifacts/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: candidate }),
        }),
      ])

      if (dupRes?.exists && dupRes?.artifact) {
        setDuplicate({ id: dupRes.artifact.id, title: dupRes.artifact.title })
      }

      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({ error: 'Failed to extract metadata' }))
        setExtractError(err.error || 'Failed to extract metadata')
        setExtracting(false)
        return
      }

      const data = (await extractRes.json()) as ExtractedMetadata
      setMetadata(data)
      setTitle(data.title)
      setTagsInput(data.suggested_tags.join(', '))
      // Infer category from suggested tags client-side
      const inferred = inferCategoryFromTags(data.suggested_tags)
      setCategory(inferred)

      // Kick off Claude auto-tag in the background — the user can fill out
      // the rest of the form while this runs. When it returns, the
      // suggestion surfaces below the thumbnail as a one-tap accept.
      setAutoTagging(true)
      setAiSuggestion(null)
      fetch('/api/constellation/artifacts/auto-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          source_platform: data.source_platform,
          url: candidate,
        }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (!json || !json.enriched) return
          if ((json.tags || []).length === 0 && !json.summary) return
          setAiSuggestion({ tags: json.tags || [], summary: json.summary || null })
        })
        .catch(() => {/* silent — existing keyword tags are a fine fallback */})
        .finally(() => setAutoTagging(false))
    } catch (err: any) {
      setExtractError(err?.message || 'Network error extracting metadata')
    } finally {
      setExtracting(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!url.trim()) {
      setMetadata(null)
      setExtractError(null)
      return
    }
    debounceRef.current = setTimeout(() => { runExtract(url.trim()) }, 500)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [url, runExtract])

  // ── Save handler ──
  const handleSave = useCallback(async () => {
    if (!metadata) return
    setSaving(true)
    setSaveError(null)

    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) {
        setSaveError('Sign in expired — refresh the page and try again.')
        setSaving(false)
        return
      }

      const tags = tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .map(t => t.toLowerCase())
        .slice(0, 20)

      // Ensure the category gets seeded into tags as well so the map's
      // tag-based inference still works if someone re-categorizes later.
      const finalTags = Array.from(new Set(tags))

      const res = await fetch('/api/constellation/artifacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          source_type: metadata.source_type,
          external_url: metadata.url,
          title: title.trim() || metadata.title,
          thumbnail_url: metadata.thumbnail_url,
          source_platform: metadata.source_platform,
          user_note: note.trim(),
          verdict,
          tags: finalTags,
          metadata_json: {
            inferred_category: category,
            description: metadata.description,
            author: metadata.author,
            published_date: metadata.published_date,
            oembed_html: metadata.oembed_html,
          },
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }))
        setSaveError(err.error || 'Failed to save artifact')
        setSaving(false)
        return
      }

      onSaved()
    } catch (err: any) {
      setSaveError(err?.message || 'Network error saving artifact')
      setSaving(false)
    }
  }, [metadata, title, category, verdict, note, tagsInput, onSaved])

  const categoryOptions = useMemo(() => {
    return CONSTELLATION_NODES.map(n => ({ id: n.id as PhenomenonCategory, label: n.label, icon: n.icon }))
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary-600/20">
              <LinkIcon className="w-4 h-4 text-primary-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Add a source to your map</h2>
              <p className="text-[10px] text-gray-500 hidden sm:block">
                YouTube, Reddit, Wikipedia, or any article URL
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* URL input */}
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              URL
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50 transition-colors"
              />
              {extracting && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" />
              )}
            </div>
            {extractError && (
              <p className="mt-2 text-xs text-red-400 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{extractError}</span>
              </p>
            )}
            {duplicate && (
              <div className="mt-2 flex items-start gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-300" />
                <div className="text-xs text-amber-200 flex-1 min-w-0">
                  <span>You&apos;ve already saved this URL as </span>
                  <span className="font-medium truncate">&ldquo;{duplicate.title}&rdquo;</span>
                  <span>. Saving again will create a duplicate.</span>
                </div>
              </div>
            )}
            {!extractError && !metadata && !extracting && url.length > 0 && (
              <p className="mt-2 text-[10px] text-gray-600">
                Paste any link — Paradocs will pull the title, thumbnail, and metadata.
              </p>
            )}
          </div>

          {/* Metadata preview + edit form */}
          {metadata && (
            <>
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
                {metadata.thumbnail_url && (
                  <div className="relative w-full aspect-video bg-gray-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={metadata.thumbnail_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                )}
                <div className="p-3 space-y-1">
                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                    <span className="px-1.5 py-0.5 rounded bg-gray-800 text-primary-300 font-medium">
                      {metadata.source_platform}
                    </span>
                    {metadata.author && <span className="truncate">{metadata.author}</span>}
                  </div>
                  {metadata.description && (
                    <p className="text-xs text-gray-400 line-clamp-2">{metadata.description}</p>
                  )}
                </div>
              </div>

              {/* AI-suggested tags + summary — distinct from the OG preview card
                  above. Uses Sparkles iconography + an "AI" chip + accent border
                  so users immediately recognize this is a suggestion generated
                  from reading the source, not metadata pulled from the page. */}
              {autoTagging && (
                <div className="inline-flex items-center gap-2 text-[10px] text-cyan-300/80 bg-cyan-500/5 border border-cyan-500/20 rounded-md px-2 py-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <Sparkles className="w-3 h-3" />
                  <span>Paradocs AI is reading the source...</span>
                </div>
              )}
              {aiSuggestion && (aiSuggestion.tags.length > 0 || aiSuggestion.summary) && (
                <div className="relative rounded-xl border-2 border-cyan-500/40 bg-gradient-to-br from-cyan-500/10 to-transparent p-3 space-y-2.5 shadow-[0_0_16px_rgba(34,211,238,0.08)]">
                  {/* AI chip — absolutely positioned at top-right like a
                      "AI generated" badge so it reads as meta-signal, not content */}
                  <span className="absolute -top-2 right-3 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-cyan-950 bg-cyan-300 rounded px-1.5 py-0.5">
                    <Sparkles className="w-2.5 h-2.5" />
                    AI suggestion
                  </span>
                  {aiSuggestion.summary && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300 mb-1">
                        Paradocs read it so you don&apos;t have to
                      </div>
                      <p className="text-xs text-white leading-relaxed">{aiSuggestion.summary}</p>
                    </div>
                  )}
                  {aiSuggestion.tags.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300 mb-1">
                        Suggested tags
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {aiSuggestion.tags.map(t => (
                          <span
                            key={t}
                            className="inline-flex items-center text-[10px] font-medium text-cyan-100 bg-cyan-500/20 border border-cyan-400/30 rounded px-1.5 py-0.5"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const existing = tagsInput
                          .split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
                        const merged = Array.from(new Set([...aiSuggestion.tags, ...existing])).slice(0, 20)
                        setTagsInput(merged.join(', '))
                        setCategory(inferCategoryFromTags(merged))
                        if (!note.trim() && aiSuggestion.summary) setNote(aiSuggestion.summary)
                        setAiSuggestion(null)
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-950 bg-cyan-300 hover:bg-cyan-200 transition-colors rounded px-2.5 py-1"
                    >
                      <Check className="w-3 h-3" />
                      Use AI suggestion
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiSuggestion(null)}
                      className="text-[11px] font-medium text-gray-400 hover:text-white transition-colors px-2 py-1"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Title (editable) */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50 transition-colors"
                />
              </div>

              {/* Category picker */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
                  Category <span className="text-gray-600 normal-case">— where this lands on the ring</span>
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50 transition-colors"
                >
                  {categoryOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.icon} {opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Verdict — pill picker */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
                  Your verdict
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {VERDICT_OPTIONS.map(opt => {
                    const selected = verdict === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setVerdict(opt.value)}
                        className={classNames(
                          'flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium border transition-colors',
                          selected
                            ? opt.color
                            : 'text-gray-400 border-gray-800 bg-gray-900 hover:bg-gray-850 hover:text-gray-200'
                        )}
                      >
                        <span>{opt.icon}</span>
                        <span>{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
                  Tags <span className="text-gray-600 normal-case">— comma-separated</span>
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)}
                  placeholder="ufo, triangle, arizona"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50 transition-colors"
                />
              </div>

              {/* Note */}
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
                  Your note <span className="text-gray-600 normal-case">— optional</span>
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="What makes this interesting? How does it connect to your other evidence?"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50 transition-colors resize-none"
                />
              </div>
            </>
          )}

          {/* Fair-use notice */}
          {metadata && (
            <p className="text-[10px] text-gray-600 leading-relaxed">
              Paradocs stores a link to the original source, not a copy.
              Tap the star later to open <ExternalLink className="inline w-2.5 h-2.5" /> the source on {metadata.source_platform}.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-4 py-3 flex items-center justify-end gap-2 flex-shrink-0">
          {saveError && (
            <p className="text-xs text-red-400 flex items-center gap-1 flex-1 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{saveError}</span>
            </p>
          )}
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!metadata || saving || !title.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Add to map'}
          </button>
        </div>
      </div>
    </div>
  )
}
