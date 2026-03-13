'use client'

import type { ConstellationArtifact } from '@/lib/database.types'
import { classNames, formatRelativeDate, truncate } from '@/lib/utils'
import { SOURCE_TYPE_CONFIG, VERDICT_CONFIG } from '@/lib/research-hub-helpers'
import {
  Link,
  StickyNote,
  FolderInput,
  Trash2,
  ExternalLink,
  LinkIcon,
} from 'lucide-react'
import { useState } from 'react'

interface ArtifactCardProps {
  artifact: ConstellationArtifact
  connectionCount?: number
  onSelect?: (artifact: ConstellationArtifact) => void
  onConnect?: (artifact: ConstellationArtifact) => void
  onMove?: (artifact: ConstellationArtifact) => void
  onDelete?: (id: string) => void
  isConnecting?: boolean
  isSelected?: boolean
  compact?: boolean
}

export function ArtifactCard({
  artifact,
  connectionCount = 0,
  onSelect,
  onConnect,
  onMove,
  onDelete,
  isConnecting = false,
  isSelected = false,
  compact = false,
}: ArtifactCardProps) {
  const [showActions, setShowActions] = useState(false)

  const sourceConfig = SOURCE_TYPE_CONFIG[artifact.source_type]
  const verdictConfig = VERDICT_CONFIG[artifact.verdict]

  const SourceIcon = sourceConfig?.icon ? (lucideIcons[sourceConfig.icon] || null) : null

  const handleConnectClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onConnect?.(artifact)
  }

  const handleAnnotateClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect?.(artifact)
  }

  const handleMoveClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onMove?.(artifact)
  }

  const cardClasses = classNames(
    'rounded-xl border bg-gray-900 transition-all duration-200',
    'overflow-hidden cursor-pointer group',
    isConnecting && 'ring-2 ring-offset-2 ring-offset-gray-950 ring-cyan-500 animate-pulse',
    isSelected && 'ring-2 ring-offset-2 ring-offset-gray-950 ring-blue-500 border-blue-600',
    !isConnecting && !isSelected && 'border-gray-800 hover:border-gray-700'
  )

  const backgroundColor = sourceConfig?.bgColor
    ? sourceConfig.bgColor
    : 'from-gray-800 to-gray-900'

  return (
    <div
      className={cardClasses}
      onClick={() => !isConnecting && onSelect?.(artifact)}
      onMouseEnter={() => !compact && setShowActions(true)}
      onMouseLeave={() => !compact && setShowActions(false)}
    >
      {/* Thumbnail and source badge */}
      <div
        className={classNames(
          'relative h-32 w-full overflow-hidden bg-gradient-to-br',
          backgroundColor
        )}
      >
        {artifact.thumbnail_url ? (
          <img
            src={artifact.thumbnail_url}
            alt={artifact.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-700 opacity-50">
              {sourceConfig?.label}
            </div>
          </div>
        )}

        {/* Source badge */}
        {sourceConfig && (
          <div className="absolute top-2 right-2">
            <div
              className={classNames(
                'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                'border',
                sourceConfig.bgColor,
                sourceConfig.color,
                'border-gray-700 bg-gray-800/80 backdrop-blur-sm'
              )}
            >
              {SourceIcon && <SourceIcon className="w-3 h-3" />}
              <span>{sourceConfig.label}</span>
            </div>
          </div>
        )}

        {/* Connection count badge */}
        {connectionCount > 0 && (
          <div className="absolute top-2 left-2">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-800/80 border border-gray-700 backdrop-blur-sm text-gray-300">
              <LinkIcon className="w-3 h-3" />
              <span>{connectionCount}</span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Title */}
        <h3 className="font-medium text-white line-clamp-2 text-sm">
          {truncate(artifact.title, 80)}
        </h3>

        {/* Excerpt or user note */}
        <p className="text-sm text-gray-400 line-clamp-2">
          {artifact.user_note || artifact.description || 'No description'}
        </p>

        {/* Verdict and tags */}
        <div className="flex items-start gap-2 flex-wrap pt-1">
          {verdictConfig && (
            <div className="flex items-center gap-1">
              <div
                className={classNames(
                  'w-2 h-2 rounded-full',
                  verdictConfig.dotColor
                )}
              />
              <span className="text-xs text-gray-400">
                {verdictConfig.label}
              </span>
            </div>
          )}

          {artifact.tags && artifact.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {artifact.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700"
                >
                  #{tag}
                </span>
              ))}
              {artifact.tags.length > 3 && (
                <span className="text-xs text-gray-500">
                  +{artifact.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <p className="text-xs text-gray-500 pt-1">
          {artifact.created_at
            ? 'Saved ' + formatRelativeDate(new Date(artifact.created_at))
            : 'Recently added'}
        </p>
      </div>

      {/* Action buttons */}
      <div
        className={classNames(
          'border-t border-gray-800 px-3 py-2 flex items-center gap-1',
          'bg-gray-800/30 backdrop-blur-sm',
          compact || showActions ? 'block' : 'hidden group-hover:block'
        )}
      >
        <button
          onClick={handleConnectClick}
          className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-cyan-400 transition-colors"
          title="Connect to another artifact"
          aria-label="Connect"
        >
          <Link className="w-4 h-4" />
        </button>

        <button
          onClick={handleAnnotateClick}
          className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-blue-400 transition-colors"
          title="Add annotation"
          aria-label="Annotate"
        >
          <StickyNote className="w-4 h-4" />
        </button>

        <button
          onClick={handleMoveClick}
          className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-amber-400 transition-colors"
          title="Move to case file"
          aria-label="Move"
        >
          <FolderInput className="w-4 h-4" />
        </button>

        <a
          href={artifact.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-green-400 transition-colors ml-auto"
          title="Open source"
          aria-label="Open source"
        >
          <ExternalLink className="w-4 h-4" />
        </a>

        <button
          onClick={function(e) {
            e.stopPropagation()
            if (onDelete && window.confirm('Delete this artifact? This cannot be undone.')) {
              onDelete(artifact.id)
            }
          }}
          className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"
          title="Delete"
          aria-label="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default ArtifactCard

// Icon lookup map
const lucideIcons: Record<string, React.ComponentType<{ className?: string }>> =
  {
    Youtube: require('lucide-react').Youtube,
    FileText: require('lucide-react').FileText,
    Globe: require('lucide-react').Globe,
    Book: require('lucide-react').Book,
    Database: require('lucide-react').Database,
    Code: require('lucide-react').Code,
    Users: require('lucide-react').Users,
    MessageSquare: require('lucide-react').MessageSquare,
    MessageCircle: require('lucide-react').MessageCircle,
    Image: require('lucide-react').Image,
    Music: require('lucide-react').Music,
    Video: require('lucide-react').Video,
    Newspaper: require('lucide-react').Newspaper,
    MapPin: require('lucide-react').MapPin,
    Twitter: require('lucide-react').Twitter,
    Play: require('lucide-react').Play,
    Camera: require('lucide-react').Camera,
    Headphones: require('lucide-react').Headphones,
    Link: require('lucide-react').Link,
  } as const
