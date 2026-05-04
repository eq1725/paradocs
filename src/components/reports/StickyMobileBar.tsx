/**
 * StickyMobileBar Component
 *
 * A sticky bottom bar visible only on mobile (hidden on lg: and up) that
 * provides Save, Share, and "Next Report" actions accessible while scrolling.
 * Appears after the user scrolls 200px down the page.
 *
 * SWC compliant: var, function(){}, string concat, no template literals in JSX.
 */

import React, { useState, useEffect } from 'react'
import { Bookmark, Share2, ChevronRight, Check, ChevronUp } from 'lucide-react'
import { classNames } from '@/lib/utils'
import Link from 'next/link'

interface Props {
  isSaved: boolean
  onSave: () => void
  onShare: () => void
  nextReport: { slug: string; title: string } | null
  copiedShare: boolean
}

function truncateTitle(title: string, max: number): string {
  if (title.length <= max) return title
  return title.slice(0, max) + '…'
}

export default function StickyMobileBar({
  isSaved,
  onSave,
  onShare,
  nextReport,
  copiedShare
}: Props) {
  var _state = useState(false)
  var visible = _state[0]
  var setVisible = _state[1]

  useEffect(function () {
    function handleScroll() {
      setVisible(window.scrollY > 200)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    // Check initial position
    handleScroll()

    return function () {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  function handleBackToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!visible) return null

  return (
    <div
      className={classNames(
        'fixed bottom-0 left-0 right-0 z-40 lg:hidden',
        'h-12 flex items-center justify-between px-3',
        'bg-gray-900/90 backdrop-blur-md border-t border-white/10',
        'transition-transform duration-300'
      )}
    >
      {/* Save button */}
      <button
        type="button"
        onClick={function () { onSave() }}
        className={classNames(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
          isSaved
            ? 'text-amber-400 bg-amber-400/10'
            : 'text-gray-300 hover:text-white hover:bg-white/10'
        )}
      >
        <Bookmark className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
        <span>{isSaved ? 'Saved' : 'Save'}</span>
      </button>

      {/* Share button */}
      <button
        type="button"
        onClick={function () { onShare() }}
        className={classNames(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
          copiedShare
            ? 'text-green-400 bg-green-400/10'
            : 'text-gray-300 hover:text-white hover:bg-white/10'
        )}
      >
        {copiedShare
          ? <Check className="w-4 h-4" />
          : <Share2 className="w-4 h-4" />
        }
        <span>{copiedShare ? 'Copied!' : 'Share'}</span>
      </button>

      {/* Next Report or Back to Top */}
      {nextReport ? (
        <Link
          href={'/report/' + nextReport.slug}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors max-w-[140px]"
        >
          <span className="truncate">{truncateTitle(nextReport.title, 15)}</span>
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={function () { handleBackToTop() }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <span>Back to top</span>
          <ChevronUp className="w-4 h-4 flex-shrink-0" />
        </button>
      )}
    </div>
  )
}
