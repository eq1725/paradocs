'use client'

/**
 * ReaderView — Pocket-style clean reading pane for saved article URLs.
 *
 * Fetches /api/constellation/artifacts/reader which runs a Readability-ish
 * heuristic on the source HTML and returns a block tree (headings,
 * paragraphs, quotes, lists, images). This component renders those blocks
 * in a reading-optimized layout with good typography + a link back to the
 * source.
 *
 * Lazy-loaded on demand — only fires the extraction when the user toggles
 * the reader tab, not on every NodeDetailPanel open.
 */

import React, { useEffect, useState } from 'react'
import {
  Loader2, ExternalLink, AlertTriangle, BookOpen, Clock, User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface ReaderViewProps {
  url: string
  /** Platform name for the "Open on X" fallback link */
  sourcePlatform?: string | null
}

type ReaderBlock =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'image'; src: string; alt: string | null }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }

interface ReaderResult {
  url: string
  title: string | null
  byline: string | null
  publishedDate: string | null
  content: ReaderBlock[]
  excerpt: string | null
  extracted: boolean
  wordCount: number
}

const AVG_WORDS_PER_MIN = 238

export default function ReaderView({ url, sourcePlatform }: ReaderViewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReaderResult | null>(null)

  useEffect(() => {
    let cancelled = false
    async function go() {
      setLoading(true); setError(null); setResult(null)
      try {
        const sess = await supabase.auth.getSession()
        const token = sess.data.session?.access_token
        if (!token) {
          if (!cancelled) { setError('Sign in expired'); setLoading(false) }
          return
        }
        const res = await fetch('/api/constellation/artifacts/reader', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Extraction failed' }))
          if (!cancelled) { setError(err.error || 'Extraction failed'); setLoading(false) }
          return
        }
        const data = (await res.json()) as ReaderResult
        if (!cancelled) { setResult(data); setLoading(false) }
      } catch (err: any) {
        if (!cancelled) { setError(err?.message || 'Network error'); setLoading(false) }
      }
    }
    go()
    return () => { cancelled = true }
  }, [url])

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 flex flex-col items-center justify-center gap-2 text-center">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
        <p className="text-xs text-gray-500">Fetching and cleaning the article...</p>
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-200">Reader view unavailable</p>
            <p className="text-[10px] text-amber-300/70 mt-0.5 leading-snug">
              {error || 'Could not extract a clean article view from this source. Some sites (paywalls, JS-only renders) block automated reading.'}
            </p>
          </div>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-200 hover:text-white transition-colors"
        >
          Open on {sourcePlatform || 'the source'} <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    )
  }

  if (!result.extracted || result.content.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 text-center">
        <BookOpen className="w-5 h-5 text-gray-600 mx-auto mb-2" />
        <p className="text-xs text-gray-400">
          We couldn&apos;t extract a clean reading view from this page.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium text-primary-300 hover:text-primary-200 transition-colors"
        >
          Open on {sourcePlatform || 'the source'} <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    )
  }

  const minutes = Math.max(1, Math.round(result.wordCount / AVG_WORDS_PER_MIN))

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      {/* Reader header */}
      <div className="px-4 py-3 border-b border-gray-800 space-y-1">
        {result.title && (
          <h2 className="text-sm font-semibold text-white leading-snug">{result.title}</h2>
        )}
        <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
          {result.byline && (
            <span className="flex items-center gap-1">
              <User className="w-2.5 h-2.5" />
              {result.byline}
            </span>
          )}
          {result.publishedDate && (
            <span>
              {(() => {
                const d = new Date(result.publishedDate)
                return isNaN(d.getTime()) ? result.publishedDate
                  : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              })()}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {minutes} min read
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-primary-300 hover:text-primary-200 transition-colors"
          >
            Open original <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      {/* Body blocks */}
      <article className="px-4 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
        {result.content.map((block, i) => {
          if (block.kind === 'heading') {
            const Tag = block.level === 2 ? 'h3' : 'h4'
            return React.createElement(
              Tag,
              {
                key: i,
                className: block.level === 2
                  ? 'text-sm font-semibold text-white mt-3'
                  : 'text-xs font-semibold text-gray-200 uppercase tracking-wider mt-2',
              },
              block.text
            )
          }
          if (block.kind === 'paragraph') {
            return <p key={i} className="text-sm text-gray-300 leading-relaxed">{block.text}</p>
          }
          if (block.kind === 'quote') {
            return (
              <blockquote
                key={i}
                className="border-l-2 border-primary-500/40 pl-3 text-gray-400 italic text-sm leading-relaxed"
              >
                {block.text}
              </blockquote>
            )
          }
          if (block.kind === 'list') {
            const ListTag = block.ordered ? 'ol' : 'ul'
            return React.createElement(
              ListTag,
              {
                key: i,
                className: (block.ordered ? 'list-decimal' : 'list-disc') + ' list-inside text-sm text-gray-300 space-y-1',
              },
              ...block.items.map((item, j) => <li key={j}>{item}</li>)
            )
          }
          if (block.kind === 'image') {
            return (
              <figure key={i} className="rounded-md overflow-hidden bg-gray-900">
                <img
                  src={block.src}
                  alt={block.alt || ''}
                  className="w-full h-auto"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                {block.alt && (
                  <figcaption className="px-3 py-1.5 text-[10px] text-gray-500 italic">{block.alt}</figcaption>
                )}
              </figure>
            )
          }
          return null
        })}
      </article>
    </div>
  )
}
