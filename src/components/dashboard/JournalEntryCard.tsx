'use client'

import React from 'react'
import Link from 'next/link'
import { LinkIcon, Lock, Globe } from 'lucide-react'
import { JournalEntry, ENTRY_TYPE_CONFIG } from '@/lib/services/journal.service'
import { classNames, formatRelativeDate } from '@/lib/utils'

interface JournalEntryCardProps {
  entry: JournalEntry
}

export default function JournalEntryCard({ entry }: JournalEntryCardProps) {
  const typeConfig = ENTRY_TYPE_CONFIG[entry.entry_type]

  // Create a plain-text excerpt from the body
  const excerpt = entry.body
    ? entry.body.slice(0, 180).replace(/[#*_`>\[\]]/g, '').trim() + (entry.body.length > 180 ? '...' : '')
    : entry.hypothesis
      ? entry.hypothesis.slice(0, 180) + (entry.hypothesis.length > 180 ? '...' : '')
      : 'No content'

  const linkedCount = entry.linked_report_ids?.length || 0
  const tagCount = entry.tags?.length || 0

  return (
    <Link
      href={`/dashboard/journal/${entry.id}`}
      className="block bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-all group"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Entry type badge */}
          <span className={classNames(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0',
            typeConfig.bgColor,
            typeConfig.color
          )}>
            <span>{typeConfig.icon}</span>
            {typeConfig.label}
          </span>

          {/* Privacy indicator */}
          {entry.is_private ? (
            <Lock className="w-3 h-3 text-gray-600 shrink-0" />
          ) : (
            <Globe className="w-3 h-3 text-gray-500 shrink-0" />
          )}
        </div>

        {/* Date */}
        <span className="text-gray-500 text-xs whitespace-nowrap shrink-0">
          {formatRelativeDate(entry.created_at)}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-white font-medium text-sm group-hover:text-primary-300 transition-colors mb-1 line-clamp-1">
        {entry.title}
      </h3>

      {/* Excerpt */}
      <p className="text-gray-400 text-sm line-clamp-2 mb-3">{excerpt}</p>

      {/* Footer metadata */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {linkedCount > 0 && (
          <span className="flex items-center gap-1">
            <LinkIcon className="w-3 h-3" />
            {linkedCount} linked {linkedCount === 1 ? 'report' : 'reports'}
          </span>
        )}
        {tagCount > 0 && (
          <div className="flex items-center gap-1 overflow-hidden">
            {entry.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 truncate max-w-[80px]"
              >
                {tag}
              </span>
            ))}
            {tagCount > 3 && (
              <span className="text-gray-600">+{tagCount - 3}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}
