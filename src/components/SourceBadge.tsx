'use client'

import React from 'react'
import { ExternalLink, Database, BookOpen, MessageCircle, Ghost, Telescope } from 'lucide-react'
import { classNames } from '@/lib/utils'

// Source configuration with colors and icons
const SOURCE_CONFIG: Record<string, {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  'reddit': {
    label: 'Reddit',
    shortLabel: 'Reddit',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    icon: MessageCircle,
  },
  'bfro': {
    label: 'BFRO Database',
    shortLabel: 'BFRO',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    icon: Database,
  },
  'nuforc': {
    label: 'NUFORC',
    shortLabel: 'NUFORC',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    icon: Telescope,
  },
  'wikipedia': {
    label: 'Wikipedia',
    shortLabel: 'Wiki',
    color: 'text-gray-300',
    bgColor: 'bg-gray-500/10',
    icon: BookOpen,
  },
  'shadowlands': {
    label: 'Shadowlands',
    shortLabel: 'Shadowlands',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    icon: Ghost,
  },
  'ghostsofamerica': {
    label: 'Ghosts of America',
    shortLabel: 'GoA',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    icon: Ghost,
  },
  'user': {
    label: 'User Submitted',
    shortLabel: 'User',
    color: 'text-primary-400',
    bgColor: 'bg-primary-500/10',
    icon: MessageCircle,
  },
}

interface SourceBadgeProps {
  sourceType: string;
  sourceLabel?: string;  // Optional custom label (e.g., "r/Paranormal")
  sourceUrl?: string;    // Optional link to original source
  variant?: 'default' | 'compact' | 'minimal';
  className?: string;
}

export default function SourceBadge({
  sourceType,
  sourceLabel,
  sourceUrl,
  variant = 'default',
  className
}: SourceBadgeProps) {
  const config = SOURCE_CONFIG[sourceType] || {
    label: sourceType,
    shortLabel: sourceType,
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
    icon: Database,
  }

  const Icon = config.icon
  const displayLabel = sourceLabel || config.label
  const shortDisplayLabel = sourceLabel?.startsWith('r/') ? sourceLabel : config.shortLabel

  // Minimal variant - just text
  if (variant === 'minimal') {
    return (
      <span className={classNames('text-xs', config.color, className)}>
        {shortDisplayLabel}
      </span>
    )
  }

  // Compact variant - icon + short label
  if (variant === 'compact') {
    const content = (
      <span className={classNames(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
        config.bgColor,
        config.color,
        className
      )}>
        <Icon className="w-3 h-3" />
        {shortDisplayLabel}
      </span>
    )

    if (sourceUrl) {
      return (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:opacity-80 transition-opacity"
          title={`View original on ${displayLabel}`}
        >
          {content}
        </a>
      )
    }

    return content
  }

  // Default variant - icon + full label + optional link indicator
  const content = (
    <span className={classNames(
      'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
      config.bgColor,
      config.color,
      sourceUrl && 'hover:opacity-80 transition-opacity cursor-pointer',
      className
    )}>
      <Icon className="w-3.5 h-3.5" />
      <span>{displayLabel}</span>
      {sourceUrl && (
        <ExternalLink className="w-3 h-3 opacity-60" />
      )}
    </span>
  )

  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`View original on ${displayLabel}`}
      >
        {content}
      </a>
    )
  }

  return content
}

// Helper function to get source display info
export function getSourceDisplayInfo(sourceType: string): {
  label: string;
  shortLabel: string;
  color: string;
} {
  const config = SOURCE_CONFIG[sourceType]
  if (config) {
    return {
      label: config.label,
      shortLabel: config.shortLabel,
      color: config.color,
    }
  }
  return {
    label: sourceType,
    shortLabel: sourceType,
    color: 'text-gray-400',
  }
}
