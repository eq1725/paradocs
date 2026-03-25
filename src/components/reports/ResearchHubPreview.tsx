/**
 * ResearchHubPreview Component
 *
 * Blurred preview of the Research Hub with subscription CTA for free/unauthenticated users.
 * Subscribed users see a link to add the report to their hub.
 * Dynamic CTA text references the specific report's connections.
 *
 * SWC compliant: var, function(){}, string concat, no template literals in JSX.
 */

import React from 'react'
import Link from 'next/link'
import { BookOpen, Lock } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface Props {
  reportId: string
  reportTitle: string
  reportCategory: string
  isSubscribed: boolean
  isAuthenticated: boolean
  className?: string
}

export default function ResearchHubPreview({
  reportId,
  reportTitle,
  reportCategory,
  isSubscribed,
  isAuthenticated,
  className
}: Props) {
  // Subscribed users see a link to add report to their Research Hub
  if (isSubscribed) {
    return (
      <div className={classNames('mt-8 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 sm:p-5', className)}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Research Hub</p>
            <p className="text-xs text-gray-400">Save this case to your research collection for deeper analysis</p>
          </div>
          <Link
            href={'/dashboard/hub?add=' + reportId}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-full text-xs font-medium transition-colors flex-shrink-0"
          >
            Add to Hub
          </Link>
        </div>
      </div>
    )
  }

  // Free/unauthenticated users see blurred preview with CTA
  return (
    <div className={classNames('relative mt-8 rounded-xl overflow-hidden', className)}>
      {/* Blurred content preview */}
      <div className="filter blur-sm pointer-events-none p-5 sm:p-6 bg-white/5 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">Research Hub</h3>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          Deep analysis, case file connections, related artifacts, and cross-referencing tools...
        </p>
        {/* Fake content blocks to suggest depth */}
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 bg-white/10 rounded-lg" />
          <div className="h-20 bg-white/10 rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="h-12 bg-white/10 rounded-lg" />
          <div className="h-12 bg-white/10 rounded-lg" />
          <div className="h-12 bg-white/10 rounded-lg" />
        </div>
      </div>

      {/* Overlay CTA */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-xl">
        <div className="text-center px-6">
          <Lock className="w-6 h-6 text-purple-400 mx-auto mb-3" />
          <p className="text-white font-medium mb-2">Unlock the full research toolkit</p>
          <p className="text-gray-300 text-sm mb-4 max-w-xs mx-auto">
            Save cases, cross-reference patterns, and access deep analysis tools.
          </p>
          {isAuthenticated ? (
            <Link
              href="/pricing"
              className="inline-block bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors"
            >
              {'Start with Core \u2014 $5.99/mo'}
            </Link>
          ) : (
            <Link
              href="/auth/login"
              className="inline-block bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors"
            >
              Sign up to unlock
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
