'use client'

import type {
  ConstellationArtifact,
  ConstellationConnection,
  ArtifactVerdict,
} from '@/lib/database.types'
import { classNames, formatRelativeDate, formatDate, truncate } from '@/lib/utils'
import { SOURCE_TYPE_CONFIG, VERDICT_CONFIG, RELATIONSHIP_CONFIG } from '@/lib/research-hub-helpers'
import {
  ArrowLeft,
  Trash2,
  Share2,
  X,
  ExternalLink,
  Plus,
  Sparkles,
  MapPin,
  Calendar,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface ArtifactDetailDrawerProps {
  artifact: ConstellationArtifact | null
  connections: ConstellationConnection[]
  onClose: () => void
  onUpdate: (
    id: string,
    data: Partial<{ user_note: string; verdict: ArtifactVerdict; tags: string[] }>
  ) => void
  onDelete: (id: string) => void
  onConnect: (artifact: ConstellationArtifact) => void
}

const VERDICT_OPTIONS: ArtifactVerdict[] = ['compelling', 'inconclusive', 'skeptical', 'needs_info']

export function ArtifactDetailDrawer({
  artifact,
  connections,
  onClose,
  onUpdate,
  onDelete,
  onConnect,
}: ArtifactDetailDrawerProps) {
  const [note, setNote] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [verdict, setVerdict] = useState<ArtifactVerdict | null>(null)
  const noteTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Sync state with artifact prop
  useEffect(() => {
    if (artifact) {
      setNote(artifact.user_note || '')
      setVerdict(artifact.verdict)
      setTags(artifact.tags || [])
    }
  }, [artifact])

  if (!artifact) return null

  const sourceConfig = SOURCE_TYPE_CONFIG[artifact.source_type]
  const verdictConfig = verdict ? VERDICT_CONFIG[verdict] : null

  const handleNoteChange = (value: string) => {
    setNote(value)

    // Debounced save
    if (noteTimeoutRef.current) {
      clearTimeout(noteTimeoutRef.current)
    }
    noteTimeoutRef.current = setTimeout(() => {
      onUpdate(artifact.id, { user_note: value })
    }, 1000)
  }

  const handleVerdictChange = (newVerdict: ArtifactVerdict) => {
    setVerdict(newVerdict)
    onUpdate(artifact.id, { verdict: newVerdict })
  }

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      const updated = [...tags, newTag.trim()]
      setTags(updated)
      onUpdate(artifact.id, { tags: updated })
      setNewTag('')
      setShowAddTag(false)
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = tags.filter((t) => t !== tagToRemove)
    setTags(updated)
    onUpdate(artifact.id, { tags: updated })
  }

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this artifact?')) {
      onDelete(artifact.id)
      onClose()
    }
  }

  const handleConnect = () => {
    onConnect(artifact)
  }

  // Extract connected artifact IDs
  const connectedArtifactIds = new Set<string>()
  connections.forEach((conn) => {
    if (conn.artifact_a_id === artifact.id) {
      connectedArtifactIds.add(conn.artifact_b_id)
    } else if (conn.artifact_b_id === artifact.id) {
      connectedArtifactIds.add(conn.artifact_a_id)
    }
  })

  return (
    <>
      {/* Backdrop */}
      <div
        className={classNames(
          'fixed inset-0 transition-opacity duration-300 z-40',
          artifact ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        style={{ backgroundColor: 'rgba(0, 0, 0, ' + (artifact ? 0.5 : 0) + ')' }}
      />

      {/* Drawer — bottom sheet on mobile, right panel on desktop */}
      <div
        className={classNames(
          /* Mobile: bottom sheet */
          'fixed bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl',
          /* Desktop: right-sliding panel */
          'sm:top-0 sm:left-auto sm:max-h-none sm:rounded-none sm:w-96',
          'bg-gray-900 border-t sm:border-t-0 sm:border-l border-gray-800',
          'transition-transform duration-300 z-50',
          'flex flex-col',
          /* Mobile: slide up/down. Desktop: slide left/right */
          artifact ? 'translate-y-0 sm:translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-y-0 sm:translate-x-full'
        )}
      >
        {/* Drag handle — mobile only */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>

        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-3 sm:px-6 py-2 sm:py-4 flex items-center justify-between gap-3 z-10">
          <button
            onClick={onClose}
            className="p-2.5 sm:p-1.5 -ml-1 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
              title="Delete artifact"
              aria-label="Delete"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                // TODO: Implement share functionality
              }}
              className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition-colors"
              title="Share"
              aria-label="Share"
            >
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Thumbnail/Gradient */}
          <div
            className={classNames(
              'relative h-48 w-full bg-gradient-to-br overflow-hidden',
              sourceConfig?.bgColor || 'from-gray-800 to-gray-900'
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
                <Sparkles className="w-12 h-12 text-gray-700 opacity-30" />
              </div>
            )}
          </div>

          <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
            {/* Source and Metadata */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                {sourceConfig && (
                  <span className={classNames(
                    'inline-flex items-center gap-1 px-3 py-1',
                    'rounded-full text-xs font-medium',
                    'bg-gray-800 border border-gray-700',
                    sourceConfig.color
                  )}>
                    {sourceConfig.label}
                    {artifact.source_platform && artifact.source_platform !== sourceConfig.label && (
                      <>
                        <span className="text-gray-600">{'\u00B7'}</span>
                        <span>{artifact.source_platform}</span>
                      </>
                    )}
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-2 break-words">
                {artifact.title}
              </h1>

              <p className="text-sm text-gray-400">
                Saved {formatRelativeDate(new Date(artifact.created_at))}
              </p>
            </div>

            {/* Verdict Selector */}
            <div>
              <h2 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-3">
                Verdict
              </h2>
              <div className="flex flex-wrap gap-2">
                {VERDICT_OPTIONS.map((v) => {
                  const config = VERDICT_CONFIG[v]
                  const isSelected = verdict === v
                  return (
                    <button
                      key={v}
                      onClick={() => handleVerdictChange(v)}
                      className={classNames(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                        'border',
                        isSelected
                          ? classNames('border-transparent', config.bgColor, config.color, 'ring-2 ring-offset-2 ring-offset-gray-900', config.color.replace('text-', 'ring-'))
                          : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                      )}
                    >
                      {config.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* User Notes */}
            <div>
              <h2 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-3">
                Your Notes
              </h2>
              <textarea
                value={note}
                onChange={(e) => handleNoteChange(e.target.value)}
                placeholder="Add private notes about this artifact..."
                className={classNames(
                  'w-full px-4 py-3 rounded-lg',
                  'bg-gray-800 border border-gray-700',
                  'text-white placeholder-gray-500',
                  'focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600',
                  'transition-colors duration-200',
                  'resize-none min-h-24'
                )}
              />
            </div>

            {/* Tags */}
            <div>
              <h2 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-3">
                Tags
              </h2>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <div
                    key={tag}
                    className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800 border border-gray-700"
                  >
                    <span className="text-sm text-gray-300">#{tag}</span>
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="text-gray-500 hover:text-gray-400 transition-colors"
                      aria-label="Remove tag"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {showAddTag ? (
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onBlur={() => {
                      if (newTag.trim()) {
                        handleAddTag()
                      } else {
                        setShowAddTag(false)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddTag()
                      } else if (e.key === 'Escape') {
                        setShowAddTag(false)
                        setNewTag('')
                      }
                    }}
                    autoFocus
                    placeholder="Add tag..."
                    className={classNames(
                      'px-3 py-1 rounded-full text-sm',
                      'bg-gray-800 border border-gray-700',
                      'text-white placeholder-gray-500',
                      'focus:outline-none focus:border-gray-600',
                      'w-32'
                    )}
                  />
                ) : (
                  <button
                    onClick={() => setShowAddTag(true)}
                    className={classNames(
                      'px-3 py-1 rounded-full text-sm',
                      'text-gray-400 hover:text-gray-300',
                      'hover:bg-gray-800 transition-colors'
                    )}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Connections */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase text-gray-400 tracking-wider">
                  Connections ({connectedArtifactIds.size})
                </h2>
                <button
                  onClick={handleConnect}
                  className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Draw
                </button>
              </div>

              {connectedArtifactIds.size === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No connections yet
                </p>
              ) : (
                <div className="space-y-2">
                  {connections
                    .filter(
                      (conn) =>
                        conn.artifact_a_id === artifact.id || conn.artifact_b_id === artifact.id
                    )
                    .map((conn) => {
                      const relConfig = RELATIONSHIP_CONFIG[conn.relationship_type]
                      return (
                        <div
                          key={conn.id}
                          className="px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-sm"
                        >
                          <div className={classNames('font-medium', relConfig.color)}>
                            {relConfig.label}
                          </div>
                          {conn.annotation && (
                            <p className="text-xs text-gray-400 mt-1">{conn.annotation}</p>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>

            {/* Details */}
            <div>
              <h2 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-3">
                Details
              </h2>
              <div className="space-y-3 text-sm">
                {artifact.extracted_date && (
                  <div className="flex items-start gap-3">
                    <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-gray-400">Date</p>
                      <p className="text-white">
                        {formatDate(artifact.extracted_date)}
                      </p>
                    </div>
                  </div>
                )}

                {artifact.extracted_location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-gray-400">Location</p>
                      <p className="text-white">{artifact.extracted_location}</p>
                    </div>
                  </div>
                )}

                {artifact.source_platform && (
                  <div className="flex items-start gap-3">
                    <ExternalLink className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-gray-400">Source</p>
                      <a
                        href={artifact.external_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 transition-colors break-all"
                      >
                        {artifact.source_platform}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default ArtifactDetailDrawer
