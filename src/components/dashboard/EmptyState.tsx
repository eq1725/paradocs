/**
 * EmptyState — Reusable empty state component with icon + CTA.
 *
 * Used across all dashboard sections when the user hasn't yet
 * populated that area. Each section provides its own messaging
 * and call-to-action.
 */

import React from 'react'
import Link from 'next/link'
import { classNames } from '@/lib/utils'

interface EmptyStateProps {
  /** Lucide icon component */
  icon: React.ElementType
  /** Icon color class (e.g. 'text-indigo-400') */
  iconColor?: string
  /** Icon background class (e.g. 'bg-indigo-500/10') */
  iconBg?: string
  /** Main headline */
  title: string
  /** Supporting description */
  description: string
  /** Primary CTA */
  ctaLabel?: string
  ctaHref?: string
  /** Secondary CTA */
  secondaryLabel?: string
  secondaryHref?: string
  /** Compact variant (less padding, smaller icon) */
  compact?: boolean
}

export default function EmptyState(props: EmptyStateProps) {
  var Icon = props.icon
  var iconColor = props.iconColor || 'text-indigo-400'
  var iconBg = props.iconBg || 'bg-indigo-500/10'
  var isCompact = props.compact || false

  return (
    <div className={classNames(
      'bg-gray-900 border border-gray-800 rounded-xl text-center',
      isCompact ? 'p-4 sm:p-5' : 'p-6 sm:p-8'
    )}>
      <div className={classNames(
        'mx-auto mb-3 rounded-full flex items-center justify-center',
        iconBg,
        isCompact ? 'w-10 h-10' : 'w-14 h-14 sm:w-16 sm:h-16'
      )}>
        <Icon className={classNames(
          iconColor,
          isCompact ? 'w-5 h-5' : 'w-7 h-7 sm:w-8 sm:h-8'
        )} />
      </div>
      <h3 className={classNames(
        'font-semibold text-white mb-1.5',
        isCompact ? 'text-sm' : 'text-base sm:text-lg'
      )}>
        {props.title}
      </h3>
      <p className={classNames(
        'text-gray-400 max-w-md mx-auto',
        isCompact ? 'text-xs mb-3' : 'text-sm mb-5'
      )}>
        {props.description}
      </p>
      {(props.ctaLabel && props.ctaHref) && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          <Link
            href={props.ctaHref}
            className={classNames(
              'inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors w-full sm:w-auto justify-center',
              isCompact ? 'px-4 py-2 text-xs' : 'px-5 py-2.5 text-sm'
            )}
          >
            {props.ctaLabel}
          </Link>
          {props.secondaryLabel && props.secondaryHref && (
            <Link
              href={props.secondaryHref}
              className={classNames(
                'inline-flex items-center gap-2 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors w-full sm:w-auto justify-center',
                isCompact ? 'px-4 py-2 text-xs' : 'px-5 py-2.5 text-sm'
              )}
            >
              {props.secondaryLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
