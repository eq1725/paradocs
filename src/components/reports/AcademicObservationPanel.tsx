/**
 * AcademicObservationPanel Component
 *
 * Displays structured observation data for researchers.
 * Quick stats visible to all tiers. Expanded details + export gated to Pro+.
 * NLP-extracted data flagged with confidence indicators.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen, Download, Copy, Check, ChevronDown, ChevronUp,
  Clock, MapPin, Eye, Sparkles, FileText, AlertTriangle, Lock, Cpu
} from 'lucide-react'
import { classNames } from '@/lib/utils'
import { useSubscription } from '@/lib/hooks/useSubscription'

interface AcademicData {
  caseId: string
  caseSlug: string
  title: string
  temporal: {
    eventDate: string | null
    eventTime: string | null
    timeApproximate: boolean
    durationSeconds: number | null
    durationText: string | null
    timeCertainty: string
    reportedAt: string
  }
  location: {
    name: string | null
    stateProvince: string | null
    country: string | null
    coordinates: { latitude: number; longitude: number; precision: string } | null
    locationType: string | null
  }
  observer: {
    witnessCount: number
    experienceLevel: string | null
    visualAids: string[] | null
    physicalState: string | null
    emotionalState: string | null
  }
  phenomenon: {
    objectCount: number
    shape: string | null
    colors: string[] | null
    brightness: string | null
    sound: string | null
    sizeApparent: string | null
    sizeEstimated: string | null
  }
  motion: {
    type: string | null
    speedApparent: string | null
    direction: string | null
    altitudeApparent: string | null
    maneuvers: string[] | null
  }
  environment: {
    weather: any
    ambientLighting: string | null
    lightPollution: string | null
    terrain: string | null
  }
  documentation: {
    hasPhotoVideo: boolean
    hasPhysicalEvidence: boolean
    hasOfficialReport: boolean
    evidenceSummary: string | null
    methods: string[] | null
    timing: string | null
  }
  effects: {
    onObserver: string[] | null
    onEnvironment: string[] | null
    physicalEvidenceCollected: boolean
    evidenceDescription: string | null
  }
  quality: {
    dataQualityScore: number | null
    completenessScore: number | null
    credibilityScore: number | null
    sourceType: string
    sourceUrl: string | null
    collectionMethod: string
  }
  classification: {
    category: string
    tags: string[]
  }
  rawDescription: string
  rawSummary: string
  metadata: {
    hasStructuredData: boolean
    lastUpdated: string
    dataCollector: string | null
  }
}

interface Props {
  reportSlug: string
  className?: string
  /** Controlled expand state — when provided, component uses this instead of internal state */
  isExpanded?: boolean
  /** Callback when user toggles expand — required when isExpanded is provided */
  onToggleExpand?: () => void
}

export default function AcademicObservationPanel({ reportSlug, className, isExpanded, onToggleExpand }: Props) {
  const [data, setData] = useState<AcademicData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [internalExpanded, setInternalExpanded] = useState(false)

  // Support both controlled and uncontrolled modes
  const expanded = isExpanded !== undefined ? isExpanded : internalExpanded
  const [copied, setCopied] = useState(false)
  const { canAccess, tierName } = useSubscription()

  const canExport = canAccess('data_export')

  useEffect(() => {
    fetchAcademicData()
  }, [reportSlug])

  async function fetchAcademicData() {
    try {
      const res = await fetch(`/api/reports/${reportSlug}/academicData`)
      if (!res.ok) throw new Error('Failed to fetch')
      const result = await res.json()
      setData(result)
    } catch (err) {
      setError('Unable to load academic data')
    } finally {
      setLoading(false)
    }
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return 'Not recorded'
    if (seconds < 60) return `${seconds} seconds`
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`
    return `${(seconds / 3600).toFixed(1)} hours`
  }

  function formatWitnessCount(count: number): string {
    if (count >= 10) return `~${count} (est.)`
    return String(count)
  }

  function generateCitation(): string {
    if (!data) return ''
    const date = data.temporal.eventDate ? new Date(data.temporal.eventDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    }) : 'Date unknown'

    return `Paradocs Case #${data.caseSlug}. "${data.title}." ${data.location.name || 'Location unspecified'}, ${date}. Paradocs Database. Accessed ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}. https://beta.discoverparadocs.com/report/${data.caseSlug}`
  }

  function generateStructuredExport(): string {
    if (!data) return ''
    return JSON.stringify(data, null, 2)
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  function downloadJSON() {
    if (!data) return
    const blob = new Blob([generateStructuredExport()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `paradocs-observation-${data.caseSlug}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className={classNames('glass-card p-4', className)}>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-primary-400" />
          <h4 className="text-sm font-medium text-white">Research Data</h4>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-white/10 rounded w-3/4" />
          <div className="h-4 bg-white/10 rounded w-1/2" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return null
  }

  // Determine if phenomenon data was NLP-extracted vs structured
  const isExtracted = !data.metadata.hasStructuredData

  const DataRow = ({ label, value, icon, extracted }: { label: string; value: React.ReactNode; icon?: React.ReactNode; extracted?: boolean }) => (
    <div className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
      {icon && <span className="text-gray-500 mt-0.5 flex-shrink-0">{icon}</span>}
      <span className="text-xs text-gray-500 w-28 flex-shrink-0">{label}</span>
      <span className="text-xs text-gray-300 flex-1 min-w-0">
        {value || <span className="text-gray-600">—</span>}
        {extracted && value && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-amber-500/70" title="Auto-extracted from report text — may not be precise">
            <Cpu className="w-2.5 h-2.5" />
            extracted
          </span>
        )}
      </span>
    </div>
  )

  // Quick stat display values
  const durationDisplay = formatDuration(data.temporal.durationSeconds)
  const durationNumber = durationDisplay.split(' ')[0]
  const durationUnit = durationDisplay.split(' ').slice(1).join(' ') || ''

  return (
    <div className={classNames('glass-card overflow-hidden', className)}>
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary-400" />
            <h4 className="text-sm font-medium text-white">Research Data Panel</h4>
            {data.metadata.hasStructuredData ? (
              <span className="px-1.5 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded">
                Verified
              </span>
            ) : (
              <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/15 text-amber-500/70 rounded flex items-center gap-0.5">
                <Cpu className="w-2.5 h-2.5" />
                Auto-extracted
              </span>
            )}
          </div>
          <button
            onClick={() => { if (onToggleExpand) { onToggleExpand() } else { setInternalExpanded(prev => !prev) } }}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Structured observation data for academic research
        </p>
      </div>

      {/* Quick Stats — always 2 cols for stable layout */}
      <div className="grid grid-cols-2 gap-px bg-white/5">
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-lg font-medium text-white">
            {formatWitnessCount(data.observer.witnessCount)}
          </div>
          <div className="text-[10px] text-gray-500">Witnesses</div>
        </div>
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-lg font-medium text-white truncate">
            {durationNumber}
          </div>
          <div className="text-[10px] text-gray-500 truncate">
            {durationUnit || 'Duration'}
          </div>
        </div>
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-lg font-medium text-white">{data.phenomenon.objectCount}</div>
          <div className="text-[10px] text-gray-500">Object(s)</div>
        </div>
        <div className="bg-gray-900/50 p-3 text-center">
          <div className="text-lg font-medium text-white">
            {data.quality.completenessScore ? `${data.quality.completenessScore}/10` : '—'}
          </div>
          <div className="text-[10px] text-gray-500">Completeness</div>
        </div>
      </div>

      {/* Expanded Details — Pro+ for full data + export */}
      {expanded && (
        <>
          {canExport ? (
            <div className="p-4 space-y-4">
              {/* Temporal Data */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-white font-medium">Temporal Data</span>
                </div>
                <div className="pl-5 space-y-0.5">
                  <DataRow label="Event Date" value={data.temporal.eventDate} />
                  <DataRow label="Event Time" value={data.temporal.eventTime || 'Not recorded'} />
                  <DataRow label="Duration" value={formatDuration(data.temporal.durationSeconds)} extracted={isExtracted && !!data.temporal.durationSeconds} />
                  <DataRow label="Time Certainty" value={data.temporal.timeCertainty} />
                </div>
              </div>

              {/* Location Data */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-white font-medium">Location</span>
                </div>
                <div className="pl-5 space-y-0.5">
                  <DataRow label="Location" value={[data.location.name, data.location.stateProvince, data.location.country].filter(Boolean).join(', ')} />
                  {data.location.coordinates && (
                    <DataRow
                      label="Coordinates"
                      value={`${data.location.coordinates.latitude.toFixed(4)}, ${data.location.coordinates.longitude.toFixed(4)} (${data.location.coordinates.precision})`}
                    />
                  )}
                  <DataRow label="Location Type" value={data.location.locationType} />
                </div>
              </div>

              {/* Phenomenon — flag extracted data */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-white font-medium">Phenomenon Characteristics</span>
                </div>
                <div className="pl-5 space-y-0.5">
                  <DataRow label="Shape" value={data.phenomenon.shape} extracted={isExtracted} />
                  <DataRow label="Colors" value={data.phenomenon.colors?.join(', ')} extracted={isExtracted} />
                  <DataRow label="Brightness" value={data.phenomenon.brightness} />
                  <DataRow label="Sound" value={data.phenomenon.sound} extracted={isExtracted} />
                  <DataRow label="Motion" value={data.motion.type} extracted={isExtracted} />
                  <DataRow label="Speed" value={data.motion.speedApparent} />
                  <DataRow label="Altitude" value={data.motion.altitudeApparent} />
                </div>
              </div>

              {/* Observer */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Eye className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-white font-medium">Observer Information</span>
                </div>
                <div className="pl-5 space-y-0.5">
                  <DataRow label="Witness Count" value={formatWitnessCount(data.observer.witnessCount)} />
                  <DataRow label="Experience" value={data.observer.experienceLevel} />
                  <DataRow label="Visual Aids" value={data.observer.visualAids?.join(', ')} />
                  <DataRow label="Physical State" value={data.observer.physicalState} />
                </div>
              </div>

              {/* Documentation */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <FileText className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-white font-medium">Documentation</span>
                </div>
                <div className="pl-5 space-y-0.5">
                  <DataRow label="Photo/Video" value={data.documentation.hasPhotoVideo ? 'Yes' : 'No'} />
                  <DataRow label="Physical Evidence" value={data.documentation.hasPhysicalEvidence ? 'Yes' : 'No'} />
                  <DataRow label="Official Report" value={data.documentation.hasOfficialReport ? 'Yes' : 'No'} />
                  <DataRow label="Source" value={data.quality.sourceType} />
                </div>
              </div>

              {/* Data Quality */}
              {(data.quality.dataQualityScore || data.quality.credibilityScore) && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-white font-medium">Data Quality</span>
                  </div>
                  <div className="pl-5 space-y-0.5">
                    {data.quality.dataQualityScore && (
                      <DataRow label="Quality Score" value={`${data.quality.dataQualityScore}/10`} />
                    )}
                    {data.quality.completenessScore && (
                      <DataRow label="Completeness" value={`${data.quality.completenessScore}/10`} />
                    )}
                    {data.quality.credibilityScore && (
                      <DataRow label="Credibility" value={data.quality.credibilityScore} />
                    )}
                  </div>
                </div>
              )}

              {/* Citation & Export */}
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center gap-1.5 mb-3">
                  <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-white font-medium">Citation & Export</span>
                </div>

                {/* Citation */}
                <div className="bg-gray-900/50 rounded p-2 mb-3">
                  <p className="text-[10px] text-gray-400 mb-1">Suggested Citation:</p>
                  <p className="text-xs text-gray-300 font-mono leading-relaxed break-words">
                    {generateCitation()}
                  </p>
                </div>

                {/* Export Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(generateCitation())}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-gray-300 rounded transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy Citation'}
                  </button>
                  <button
                    onClick={downloadJSON}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 rounded transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export JSON
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Soft paywall for non-Pro users */
            <div className="p-4">
              <div className="text-center py-4">
                <Lock className="w-5 h-5 text-gray-500 mx-auto mb-2" />
                <p className="text-sm text-gray-400 mb-1">Full research data & export tools</p>
                <p className="text-xs text-gray-500 mb-3">
                  Structured observation data, citation generation, and JSON export are available on the Pro plan.
                </p>
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white rounded-lg transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(135deg, #9000f0, #7a00cc)' }}
                >
                  Upgrade to Pro
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {/* Collapsed prompt */}
      {!expanded && (
        <div className="px-4 pb-3 pt-2">
          <button
            onClick={() => { if (onToggleExpand) { onToggleExpand() } else { setInternalExpanded(true) } }}
            className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            {canExport
              ? 'View full structured data & export options'
              : 'View structured data'
            }
          </button>
        </div>
      )}
    </div>
  )
}
