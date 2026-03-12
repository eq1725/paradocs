'use client'

import { useState, useMemo } from 'react'
import type {
  ConstellationArtifact,
  CaseFile,
  AiInsight,
} from '@/lib/database.types'
import {
  SOURCE_TYPE_CONFIG,
  VERDICT_CONFIG,
} from '@/lib/research-hub-helpers'
import { classNames, formatDate, truncate } from '@/lib/utils'
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Sparkles,
  Calendar,
} from 'lucide-react'
import { parseISO, getYear, getMonth, getWeek } from 'date-fns'

interface TimelineViewProps {
  artifacts: ConstellationArtifact[]
  caseFiles: CaseFile[]
  caseFileArtifactMap: Record<string, string[]>
  insights: AiInsight[]
  activeCaseFileId: string | null
  onSelectArtifact: (artifact: ConstellationArtifact) => void
  onAddArtifact: () => void
}

type ZoomLevel = 'decade' | 'year' | 'month' | 'week'

interface GroupedItem {
  type: 'artifact' | 'insight'
  data: ConstellationArtifact | AiInsight
  caseFileId?: string
}

interface TimelineSection {
  year?: number
  month?: number
  week?: number
  decade?: string
  items: GroupedItem[]
}

const ZOOM_OPTIONS: ZoomLevel[] = ['decade', 'year', 'month', 'week']

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const VERDICT_CLASS_MAP: Record<
  string,
  { dot: string; text: string }
> = {
  compelling: {
    dot: 'bg-amber-400',
    text: 'text-amber-400',
  },
  inconclusive: {
    dot: 'bg-blue-400',
    text: 'text-blue-400',
  },
  skeptical: {
    dot: 'bg-gray-400',
    text: 'text-gray-400',
  },
  needs_info: {
    dot: 'bg-purple-400',
    text: 'text-purple-400',
  },
}

const CASE_FILE_COLOR_MAP: Record<string, string> = {
  'bg-red-500': 'border-l-red-500',
  'bg-blue-500': 'border-l-blue-500',
  'bg-green-500': 'border-l-green-500',
  'bg-purple-500': 'border-l-purple-500',
  'bg-pink-500': 'border-l-pink-500',
  'bg-yellow-500': 'border-l-yellow-500',
  'bg-indigo-500': 'border-l-indigo-500',
  'bg-cyan-500': 'border-l-cyan-500',
  'bg-orange-500': 'border-l-orange-500',
  'bg-teal-500': 'border-l-teal-500',
}

function getDecade(year: number): string {
  const startYear = Math.floor(year / 10) * 10
  return startYear + 's'
}

function sortArtifactsByDate(
  artifacts: ConstellationArtifact[]
): ConstellationArtifact[] {
  return [...artifacts].sort((a, b) => {
    if (!a.extracted_date && !b.extracted_date) return 0
    if (!a.extracted_date) return 1
    if (!b.extracted_date) return -1
    return (
      new Date(a.extracted_date).getTime() -
      new Date(b.extracted_date).getTime()
    )
  })
}

function getFilteredArtifacts(
  artifacts: ConstellationArtifact[],
  activeCaseFileId: string | null,
  caseFileArtifactMap: Record<string, string[]>
): ConstellationArtifact[] {
  if (!activeCaseFileId) {
    return sortArtifactsByDate(artifacts)
  }

  const caseFileArtifactIds = caseFileArtifactMap[activeCaseFileId] || []
  const filtered = artifacts.filter((a) =>
    caseFileArtifactIds.includes(a.id)
  )
  return sortArtifactsByDate(filtered)
}

function getArtifactCaseFileId(
  artifactId: string,
  caseFileArtifactMap: Record<string, string[]>
): string | undefined {
  for (const [caseFileId, artifactIds] of Object.entries(
    caseFileArtifactMap
  )) {
    if (artifactIds.includes(artifactId)) {
      return caseFileId
    }
  }
  return undefined
}

function getCaseFileBorderColor(
  coverColor: string
): string {
  const borderMap: Record<string, string> = {
    'bg-red-500': 'border-l-red-500',
    'bg-blue-500': 'border-l-blue-500',
    'bg-green-500': 'border-l-green-500',
    'bg-purple-500': 'border-l-purple-500',
    'bg-pink-500': 'border-l-pink-500',
    'bg-yellow-500': 'border-l-yellow-500',
    'bg-indigo-500': 'border-l-indigo-500',
    'bg-cyan-500': 'border-l-cyan-500',
    'bg-orange-500': 'border-l-orange-500',
    'bg-teal-500': 'border-l-teal-500',
  }
  return borderMap[coverColor] || 'border-l-gray-700'
}

function getCaseFileColorDot(coverColor: string): string {
  const colorMap: Record<string, string> = {
    'bg-red-500': 'bg-red-500',
    'bg-blue-500': 'bg-blue-500',
    'bg-green-500': 'bg-green-500',
    'bg-purple-500': 'bg-purple-500',
    'bg-pink-500': 'bg-pink-500',
    'bg-yellow-500': 'bg-yellow-500',
    'bg-indigo-500': 'bg-indigo-500',
    'bg-cyan-500': 'bg-cyan-500',
    'bg-orange-500': 'bg-orange-500',
    'bg-teal-500': 'bg-teal-500',
  }
  return colorMap[coverColor] || 'bg-gray-700'
}

function groupItems(
  artifacts: ConstellationArtifact[],
  insights: AiInsight[],
  zoomLevel: ZoomLevel,
  caseFileArtifactMap: Record<string, string[]>
): TimelineSection[] {
  const sections = new Map<string, TimelineSection>()

  artifacts.forEach((artifact) => {
    if (!artifact.extracted_date) {
      return
    }

    try {
      const date = parseISO(artifact.extracted_date)
      const year = getYear(date)
      const month = getMonth(date)
      const week = getWeek(date)

      let key: string
      let section: TimelineSection

      switch (zoomLevel) {
        case 'decade': {
          const decade = getDecade(year)
          key = decade
          if (!sections.has(key)) {
            sections.set(key, { decade, items: [] })
          }
          section = sections.get(key)!
          break
        }
        case 'year': {
          key = year.toString()
          if (!sections.has(key)) {
            sections.set(key, { year, items: [] })
          }
          section = sections.get(key)!
          break
        }
        case 'month': {
          key = year + '-' + month
          if (!sections.has(key)) {
            sections.set(key, { year, month, items: [] })
          }
          section = sections.get(key)!
          break
        }
        case 'week': {
          key = year + '-w' + week
          if (!sections.has(key)) {
            sections.set(key, { year, month, week, items: [] })
          }
          section = sections.get(key)!
          break
        }
      }

      const caseFileId = getArtifactCaseFileId(
        artifact.id,
        caseFileArtifactMap
      )
      section.items.push({
        type: 'artifact',
        data: artifact,
        caseFileId,
      })
    } catch {
      // Skip invalid dates
    }
  })

  insights.forEach((insight) => {
    if (
      insight.primary_view === 'timeline' &&
      insight.artifact_ids &&
      insight.artifact_ids.length > 0
    ) {
      const firstArtifactId = insight.artifact_ids[0]
      const firstArtifact = artifacts.find((a) => a.id === firstArtifactId)

      if (firstArtifact && firstArtifact.extracted_date) {
        try {
          const date = parseISO(firstArtifact.extracted_date)
          const year = getYear(date)
          const month = getMonth(date)
          const week = getWeek(date)

          let key: string

          switch (zoomLevel) {
            case 'decade':
              key = getDecade(year)
              break
            case 'year':
              key = year.toString()
              break
            case 'month':
              key = year + '-' + month
              break
            case 'week':
              key = year + '-w' + week
              break
          }

          if (sections.has(key)) {
            sections.get(key)!.items.push({
              type: 'insight',
              data: insight,
            })
          }
        } catch {
          // Skip invalid dates
        }
      }
    }
  })

  const sortedSections = Array.from(sections.values()).sort((a, b) => {
    const aKey = a.year ?? parseInt(a.decade?.match(/\d+/)?.[0] || '0')
    const bKey = b.year ?? parseInt(b.decade?.match(/\d+/)?.[0] || '0')
    if (aKey !== bKey) return aKey - bKey

    if (a.month !== undefined && b.month !== undefined) {
      if (a.month !== b.month) return a.month - b.month

      if (a.week !== undefined && b.week !== undefined) {
        return a.week - b.week
      }
    }

    return 0
  })

  return sortedSections
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  const sourceConfig = SOURCE_TYPE_CONFIG[sourceType as keyof typeof SOURCE_TYPE_CONFIG]

  if (!sourceConfig) return null

  const IconComponent = getIconComponent(sourceConfig.icon)

  return (
    <div
      className={classNames(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        'bg-gray-800 border border-gray-700',
        sourceConfig.color
      )}
    >
      {IconComponent && (
        <IconComponent className="w-3 h-3" />
      )}
      <span>{sourceConfig.label}</span>
    </div>
  )
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return null

  const verdictConfig = VERDICT_CONFIG[verdict as keyof typeof VERDICT_CONFIG]
  if (!verdictConfig) return null

  return (
    <div
      className={classNames(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        verdictConfig.bgColor,
        verdictConfig.color
      )}
    >
      <div
        className={classNames(
          'w-1.5 h-1.5 rounded-full',
          VERDICT_CLASS_MAP[verdict]?.dot || 'bg-gray-400'
        )}
      />
      <span>{verdictConfig.label}</span>
    </div>
  )
}

function ArtifactCard({
  artifact,
  caseFile,
  onSelect,
}: {
  artifact: ConstellationArtifact
  caseFile?: CaseFile
  onSelect: (artifact: ConstellationArtifact) => void
}) {
  const borderClass = caseFile
    ? getCaseFileBorderColor(caseFile.cover_color)
    : 'border-l-gray-700'

  return (
    <button
      onClick={() => onSelect(artifact)}
      className={classNames(
        'w-full text-left rounded-lg p-3 transition-all duration-200',
        'bg-gray-800/50 border border-gray-700 hover:border-gray-600',
        'border-l-2',
        borderClass,
        'hover:bg-gray-800'
      )}
    >
      <div className="space-y-2">
        <h4 className="font-medium text-sm text-white line-clamp-1">
          {truncate(artifact.title, 80)}
        </h4>

        <div className="flex items-center gap-2 flex-wrap">
          <SourceBadge sourceType={artifact.source_type} />
          <VerdictBadge verdict={artifact.verdict} />
        </div>

        {artifact.user_note && (
          <p className="text-xs text-gray-400 line-clamp-1">
            {truncate(artifact.user_note, 60)}
          </p>
        )}

        {artifact.tags && artifact.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {artifact.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300"
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
    </button>
  )
}

function TimelineNode({
  verdict,
}: {
  verdict: string | null
}) {
  const verdictConfig = VERDICT_CONFIG[verdict as keyof typeof VERDICT_CONFIG]
  const dotColor = VERDICT_CLASS_MAP[verdict || 'inconclusive']?.dot || 'bg-gray-400'

  return (
    <div
      className={classNames(
        'absolute left-0 top-0 transform -translate-x-1.5 translate-y-1.5',
        'w-3 h-3 rounded-full border-2 border-gray-950',
        dotColor
      )}
    />
  )
}

function InsightInline({ insight }: { insight: AiInsight }) {
  return (
    <div
      className={classNames(
        'rounded-lg border overflow-hidden',
        'bg-gray-800/30 border-cyan-800/50',
        'p-3 space-y-2'
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h5 className="font-medium text-xs text-cyan-300">
            AI INSIGHT
          </h5>
          <p className="text-xs text-gray-300 line-clamp-2 mt-1">
            {truncate(insight.body, 100)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 rounded-full"
            style={{
              width: Math.round((insight.confidence || 0) * 100) + '%',
            }}
          />
        </div>
        <span className="text-gray-500">
          {Math.round((insight.confidence || 0) * 100)}%
        </span>
      </div>
    </div>
  )
}

function FormatDateHeader(date: Date, format: string): string {
  if (format === 'month') {
    return MONTH_NAMES[getMonth(date)]
  }
  return date.getFullYear().toString()
}

export function TimelineView({
  artifacts,
  caseFiles,
  caseFileArtifactMap,
  insights,
  activeCaseFileId,
  onSelectArtifact,
  onAddArtifact,
}: TimelineViewProps) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('year')
  const [visibleCaseFiles, setVisibleCaseFiles] = useState<Set<string>>(
    new Set(caseFiles.map((cf) => cf.id))
  )
  const [showUnsorted, setShowUnsorted] = useState(true)

  const filteredArtifacts = useMemo(
    () => getFilteredArtifacts(artifacts, activeCaseFileId, caseFileArtifactMap),
    [artifacts, activeCaseFileId, caseFileArtifactMap]
  )

  const timelineItems = useMemo(() => {
    let itemsToGroup = filteredArtifacts

    if (!showUnsorted && !activeCaseFileId) {
      itemsToGroup = filteredArtifacts.filter(
        (a) =>
          caseFileArtifactMap &&
          Object.values(caseFileArtifactMap).some((ids) =>
            ids.includes(a.id)
          )
      )
    }

    if (visibleCaseFiles.size < caseFiles.length && !activeCaseFileId) {
      itemsToGroup = itemsToGroup.filter((a) => {
        const caseFileId = getArtifactCaseFileId(
          a.id,
          caseFileArtifactMap
        )
        return !caseFileId || visibleCaseFiles.has(caseFileId)
      })
    }

    return groupItems(
      itemsToGroup,
      insights,
      zoomLevel,
      caseFileArtifactMap
    )
  }, [
    filteredArtifacts,
    zoomLevel,
    visibleCaseFiles,
    showUnsorted,
    caseFiles,
    insights,
    activeCaseFileId,
    caseFileArtifactMap,
  ])

  const datedArtifacts = filteredArtifacts.filter((a) => a.extracted_date)
  const unDatedArtifacts = filteredArtifacts.filter((a) => !a.extracted_date)

  const hasContent = datedArtifacts.length > 0

  const toggleCaseFile = (id: string) => {
    const newSet = new Set(visibleCaseFiles)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setVisibleCaseFiles(newSet)
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100">
      {/* Controls Bar */}
      <div className="border-b border-gray-800 bg-gray-950/50 backdrop-blur-sm sticky top-0 z-10 space-y-3 p-4">
        {/* Zoom Level Selector */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <span className="text-xs font-medium text-gray-400 whitespace-nowrap">
            Zoom:
          </span>
          {ZOOM_OPTIONS.map((level) => (
            <button
              key={level}
              onClick={() => setZoomLevel(level)}
              className={classNames(
                'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                zoomLevel === level
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              )}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>

        {/* Case File Filters */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">
              Filter:
            </span>
            <button
              onClick={() => {
                setVisibleCaseFiles(new Set(caseFiles.map((cf) => cf.id)))
              }}
              className={classNames(
                'px-3 py-1 rounded-full text-xs font-medium transition-all',
                visibleCaseFiles.size === caseFiles.length
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              )}
            >
              All
            </button>
            <button
              onClick={() => setShowUnsorted(!showUnsorted)}
              className={classNames(
                'px-3 py-1 rounded-full text-xs font-medium transition-all',
                showUnsorted
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              )}
            >
              Unsorted
            </button>
          </div>

          {/* Case File Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {caseFiles.map((caseFile) => {
              const isVisible = visibleCaseFiles.has(caseFile.id)
              const dotColor = getCaseFileColorDot(caseFile.cover_color)

              return (
                <button
                  key={caseFile.id}
                  onClick={() => toggleCaseFile(caseFile.id)}
                  className={classNames(
                    'flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium',
                    'whitespace-nowrap transition-all',
                    isVisible
                      ? 'bg-gray-800 text-white border border-gray-700'
                      : 'bg-gray-900 text-gray-500 border border-gray-800 opacity-50'
                  )}
                >
                  <div className={classNames('w-2 h-2 rounded-full', dotColor)} />
                  <span>{caseFile.title}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Timeline Body */}
      <div className="flex-1 overflow-y-auto">
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
            <Calendar className="w-12 h-12 text-gray-700" />
            <div>
              <p className="text-gray-400 text-sm mb-3">
                No dated artifacts yet. Add dates to your artifacts to see them on the timeline.
              </p>
              <button
                onClick={onAddArtifact}
                className={classNames(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
                  'bg-blue-600 text-white hover:bg-blue-700 transition-colors',
                  'text-sm font-medium'
                )}
              >
                <Plus className="w-4 h-4" />
                Add Artifact
              </button>
            </div>
          </div>
        ) : (
          <div className="relative p-4 space-y-8">
            {/* Timeline Axis */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-700" />

            {/* Timeline Sections */}
            {timelineItems.map((section, sectionIdx) => {
              const sectionLabel =
                section.decade ||
                (section.month !== undefined
                  ? MONTH_NAMES[section.month]
                  : null) ||
                (section.week !== undefined
                  ? 'Week ' + section.week
                  : null) ||
                section.year

              return (
                <div key={sectionIdx}>
                  {/* Year Header */}
                  {section.year !== undefined && zoomLevel === 'year' && (
                    <h2 className="text-2xl font-bold text-gray-500 mb-6 sticky top-16 bg-gray-950 py-2">
                      {section.year}
                    </h2>
                  )}

                  {/* Decade Header */}
                  {section.decade && zoomLevel === 'decade' && (
                    <h2 className="text-2xl font-bold text-gray-500 mb-6 sticky top-16 bg-gray-950 py-2">
                      {section.decade}
                    </h2>
                  )}

                  {/* Month Header (for month/week zoom) */}
                  {section.month !== undefined &&
                    (zoomLevel === 'month' || zoomLevel === 'week') && (
                      <div className="mb-4">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-400">
                            {section.year}
                          </h3>
                          <h3 className="text-sm font-semibold text-gray-400">
                            {MONTH_NAMES[section.month]}
                          </h3>
                          {section.week !== undefined && zoomLevel === 'week' && (
                            <span className="text-xs text-gray-500">
                              Week {section.week}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                  {/* Items */}
                  <div className="pl-10 space-y-3">
                    {section.items.map((item, itemIdx) => {
                      if (item.type === 'artifact') {
                        const artifact = item.data as ConstellationArtifact
                        const caseFile = item.caseFileId
                          ? caseFiles.find((cf) => cf.id === item.caseFileId)
                          : undefined

                        return (
                          <div
                            key={artifact.id + '-' + itemIdx}
                            className="relative"
                          >
                            <TimelineNode verdict={artifact.verdict} />
                            <div className="pl-2">
                              {artifact.extracted_date && (
                                <p className="text-xs text-gray-500 mb-1">
                                  {formatDate(artifact.extracted_date, 'MMM d')}
                                </p>
                              )}
                              <ArtifactCard
                                artifact={artifact}
                                caseFile={caseFile}
                                onSelect={onSelectArtifact}
                              />
                            </div>
                          </div>
                        )
                      } else {
                        const insight = item.data as AiInsight

                        return (
                          <div
                            key={insight.id + '-insight-' + itemIdx}
                            className="relative pl-2"
                          >
                            <InsightInline insight={insight} />
                          </div>
                        )
                      }
                    })}
                  </div>
                </div>
              )
            })}

            {/* Undated Artifacts Section */}
            {unDatedArtifacts.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-4 sticky top-16 bg-gray-950 py-2">
                  No Date
                </h3>
                <div className="pl-10 space-y-3">
                  {unDatedArtifacts.map((artifact) => {
                    const caseFileId = getArtifactCaseFileId(
                      artifact.id,
                      caseFileArtifactMap
                    )
                    const caseFile = caseFileId
                      ? caseFiles.find((cf) => cf.id === caseFileId)
                      : undefined

                    return (
                      <div
                        key={artifact.id + '-nodate'}
                        className="relative"
                      >
                        <TimelineNode verdict={artifact.verdict} />
                        <div className="pl-2">
                          <ArtifactCard
                            artifact={artifact}
                            caseFile={caseFile}
                            onSelect={onSelectArtifact}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default TimelineView

// Icon lookup helper
function getIconComponent(
  iconName: string
): React.ComponentType<{ className?: string }> | null {
  const iconMap: Record<
    string,
    React.ComponentType<{ className?: string }>
  > = {
    FileText: require('lucide-react').FileText,
    Play: require('lucide-react').Play,
    MessageCircle: require('lucide-react').MessageCircle,
    Music: require('lucide-react').Music,
    Camera: require('lucide-react').Camera,
    Headphones: require('lucide-react').Headphones,
    Newspaper: require('lucide-react').Newspaper,
    Globe: require('lucide-react').Globe,
    Link: require('lucide-react').Link,
    Youtube: require('lucide-react').Youtube,
    User: require('lucide-react').User,
    MapPin: require('lucide-react').MapPin,
    Clock: require('lucide-react').Clock,
    X: require('lucide-react').X,
    Check: require('lucide-react').Check,
    Edit3: require('lucide-react').Edit3,
  }

  return iconMap[iconName] || null
}
