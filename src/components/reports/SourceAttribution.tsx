/**
 * SourceAttribution Component
 *
 * Footnote-style citation for mass-ingested reports.
 * Always present on index model reports. Small, unobtrusive, but legally required.
 * Links to original source with target="_blank" (Capacitor team handles native wrapper later).
 *
 * SWC compliant: var, function(){}, string concat, no template literals in JSX.
 */

import React from 'react'
import { ExternalLink } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface Props {
  label: string
  url: string
  className?: string
}

export default function SourceAttribution({ label, url, className }: Props) {
  if (!url) return null

  return (
    <div className={classNames('mt-6 pt-4 border-t border-white/10', className)}>
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        <span>Original source:</span>
        <span className="text-gray-400">{label || 'External'}</span>
        <span className="text-gray-600">{'\u2014'}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-400 hover:text-purple-300 underline inline-flex items-center gap-1 transition-colors"
        >
          View original
          <ExternalLink className="w-3 h-3" />
        </a>
      </p>
    </div>
  )
}
