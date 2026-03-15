'use client'

/**
 * MobileHeader — consistent mobile top bar.
 *
 * Patterns:
 * - Default: centered title
 * - Detail pages: back arrow (left), title (center), actions (right)
 * - Search: full-width search bar
 *
 * Handles safe-area-inset-top for notch/Dynamic Island.
 * Hidden on desktop (md:hidden).
 */

import { classNames } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/router'
import { useCallback } from 'react'

interface MobileHeaderProps {
  /** Page title displayed in the header */
  title?: string
  /** Show back button on the left */
  showBack?: boolean
  /** Custom back handler (defaults to router.back) */
  onBack?: () => void
  /** Right-side action slot */
  actions?: React.ReactNode
  /** Left-side slot (overrides back button if provided) */
  leftSlot?: React.ReactNode
  /** Whether the header has a bottom border */
  bordered?: boolean
  /** Additional class names */
  className?: string
}

export function MobileHeader({
  title,
  showBack,
  onBack,
  actions,
  leftSlot,
  bordered,
  className,
}: MobileHeaderProps) {
  var router = useRouter()
  var hasBorder = bordered !== false

  var handleBack = useCallback(function() {
    if (onBack) {
      onBack()
    } else {
      router.back()
    }
  }, [onBack, router])

  return (
    <header
      className={classNames(
        'md:hidden fixed left-0 right-0 z-30',
        'bg-gray-900/95 backdrop-blur-lg',
        hasBorder ? 'border-b border-gray-800' : '',
        'dashboard-mobile-header-positioned',
        className || ''
      )}
    >
      <div className="flex items-center justify-between h-14 px-4">
        {/* Left slot */}
        <div className="flex items-center gap-2 min-w-[44px]">
          {leftSlot ? (
            leftSlot
          ) : showBack ? (
            <button
              onClick={handleBack}
              className="p-2.5 -ml-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : null}
        </div>

        {/* Center title */}
        {title && (
          <h1 className="text-base font-semibold text-white truncate flex-1 text-center px-2">
            {title}
          </h1>
        )}

        {/* Right actions */}
        <div className="flex items-center gap-1 min-w-[44px] justify-end">
          {actions}
        </div>
      </div>
    </header>
  )
}

export default MobileHeader
