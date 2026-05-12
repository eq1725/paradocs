'use client'

/**
 * ReportPullQuote — V10.5
 *
 * Inline pull-quote rendered between the experience description
 * and the source block. Pulled OUT of the Paradocs Analysis
 * accordion because the panel argued (correctly) that it's the
 * most quotable content on the page and shouldn't be gated.
 *
 * Tap the quote → opens the native share sheet with the quote +
 * attribution + canonical report URL. On desktop / no-share, the
 * fallback is copy-to-clipboard.
 *
 * The quote's content is the AI-generated `pull_quote` field
 * from paradocs_assessment — claim-checked + audit-logged at
 * generation time per the V10.4 pipeline.
 */

import React, { useCallback, useState } from 'react'
import { Share2, Check } from 'lucide-react'

export interface ReportPullQuoteProps {
  /** The pull quote text. Already PII-stripped at render time by the parent. */
  quote: string
  /** Used to construct the share canonical URL. */
  reportTitle?: string | null
  className?: string
}

export default function ReportPullQuote({ quote, reportTitle, className }: ReportPullQuoteProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(async () => {
    if (typeof window === 'undefined') return
    const url = window.location.href
    const shareText = '"' + quote + '"\n\nFrom ' + (reportTitle || 'a Paradocs case')
    const sharePayload: any = { title: reportTitle || 'Paradocs', text: shareText, url }
    try {
      if ((navigator as any).share) {
        await (navigator as any).share(sharePayload)
        return
      }
    } catch {
      // User canceled or share unavailable — fall through to clipboard.
    }
    try {
      await navigator.clipboard.writeText(shareText + '\n' + url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // Last-ditch: do nothing silently.
    }
  }, [quote, reportTitle])

  if (!quote || !quote.trim()) return null

  return (
    <figure className={'relative my-6 ' + (className || '')}>
      <blockquote
        className="relative border-l-2 border-purple-500/60 pl-4 pr-12 py-2 italic text-base sm:text-lg text-gray-100 leading-relaxed bg-gradient-to-r from-purple-950/20 to-transparent rounded-r-md"
      >
        &ldquo;{quote}&rdquo;
        <button
          type="button"
          onClick={handleShare}
          className="absolute top-2 right-2 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-900/80 hover:bg-gray-800 border border-gray-700 text-gray-300 hover:text-purple-200 transition-colors"
          aria-label={copied ? 'Quote copied' : 'Share this quote'}
          title={copied ? 'Copied' : 'Share quote'}
        >
          {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Share2 className="w-4 h-4" />}
        </button>
      </blockquote>
      <figcaption className="text-[10px] uppercase tracking-wider text-gray-600 mt-1 ml-4">
        Paradocs editorial pull-quote
      </figcaption>
    </figure>
  )
}
