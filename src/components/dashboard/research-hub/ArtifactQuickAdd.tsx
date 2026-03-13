'use client'

import type { CaseFile, ArtifactSourceType, ArtifactVerdict } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Search, X, Loader2, FileText, Link2, ExternalLink, AlertTriangle, CheckCircle } from 'lucide-react'
import { useState, useCallback, useRef, useEffect } from 'react'

interface ArtifactQuickAddProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: {
    source_type: ArtifactSourceType
    report_id?: string
    external_url?: string
    title: string
    description?: string
    thumbnail_url?: string
    source_platform?: string
    metadata_json?: Record<string, any>
    user_note?: string
    verdict?: ArtifactVerdict
    tags?: string[]
    case_file_id?: string
  }) => Promise<void>
  caseFiles: CaseFile[]
  defaultCaseFileId?: string
}

type TabType = 'report' | 'url'

var SOURCE_TYPE_OPTIONS: Array<{ value: ArtifactSourceType; label: string }> = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'twitter', label: 'X.com' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'news', label: 'News' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' },
]

var VERDICT_OPTIONS: Array<{ value: ArtifactVerdict; label: string; color: string }> = [
  { value: 'compelling', label: 'Compelling', color: 'bg-amber-500/20 border-amber-500/50' },
  { value: 'inconclusive', label: 'Inconclusive', color: 'bg-blue-500/20 border-blue-500/50' },
  { value: 'skeptical', label: 'Skeptical', color: 'bg-gray-500/20 border-gray-500/50' },
  { value: 'needs_info', label: 'Needs Info', color: 'bg-purple-500/20 border-purple-500/50' },
]

interface ExtractedData {
  url: string
  url_hash: string
  source_type: string
  source_platform: string
  title: string | null
  description: string | null
  thumbnail_url: string | null
  site_name: string | null
  platform_metadata: Record<string, any>
  is_duplicate: boolean
  duplicate_artifact_id: string | null
  needs_client_extraction?: boolean
}


export function ArtifactQuickAdd({
  isOpen,
  onClose,
  onSave,
  caseFiles,
  defaultCaseFileId,
}: ArtifactQuickAddProps) {
  var [activeTab, setActiveTab] = useState<TabType>('report')
  var [searchQuery, setSearchQuery] = useState('')
  var [searchResults, setSearchResults] = useState<Array<{ id: string; title: string }>>([])
  var [isSearching, setIsSearching] = useState(false)
  var [selectedReport, setSelectedReport] = useState<{ id: string; title: string } | null>(null)

  var [externalUrl, setExternalUrl] = useState('')
  var [sourceType, setSourceType] = useState<ArtifactSourceType>('website')
  var [title, setTitle] = useState('')
  var [thumbnailUrl, setThumbnailUrl] = useState('')
  var [sourcePlatform, setSourcePlatform] = useState('')
  var [platformMetadata, setPlatformMetadata] = useState<Record<string, any>>({})
  var [note, setNote] = useState('')
  var [verdict, setVerdict] = useState<ArtifactVerdict | null>(null)
  var [tagsInput, setTagsInput] = useState('')
  var [caseFileId, setCaseFileId] = useState<string | undefined>(defaultCaseFileId)
  var [isSaving, setIsSaving] = useState(false)

  // URL extraction state
  var [isExtracting, setIsExtracting] = useState(false)
  var [extractError, setExtractError] = useState<string | null>(null)
  var [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  var [isDuplicate, setIsDuplicate] = useState(false)
  var [extractedDescription, setExtractedDescription] = useState<string | null>(null)

  var [tagSuggestions, setTagSuggestions] = useState<string[]>([])

  var searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  var extractTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch user's previously used tags on mount
  useEffect(function() {
    async function fetchTags() {
      try {
        var session = await supabase.auth.getSession()
        var token = session.data.session?.access_token
        if (!token) return

        var resp = await fetch('/api/research-hub/tags', {
          headers: { 'Authorization': 'Bearer ' + token },
        })
        if (resp.ok) {
          var data = await resp.json()
          setTagSuggestions(data.tags || [])
        }
      } catch {
        // Non-critical
      }
    }
    if (isOpen) fetchTags()
  }, [isOpen])

  var handleSearchChange = useCallback(function(query: string) {
    setSearchQuery(query)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!query.trim()) {
      setSearchResults([])
      return
    }

    searchTimeoutRef.current = setTimeout(async function() {
      setIsSearching(true)
      try {
        var response = await fetch('/api/search/fulltext?q=' + encodeURIComponent(query) + '&limit=5')
        if (response.ok) {
          var data = await response.json()
          setSearchResults(data.results || [])
        }
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setIsSearching(false)
      }
    }, 300)
  }, [])

  // Auto-extract metadata when URL changes
  var handleUrlChange = useCallback(function(url: string) {
    setExternalUrl(url)
    setExtractError(null)
    setExtractedData(null)
    setIsDuplicate(false)
    setExtractedDescription(null)

    if (extractTimeoutRef.current) {
      clearTimeout(extractTimeoutRef.current)
    }

    if (!url.trim()) return

    // Basic URL validation
    try {
      new URL(url)
    } catch {
      return // Not a valid URL yet, wait for more input
    }

    extractTimeoutRef.current = setTimeout(async function() {
      setIsExtracting(true)
      setExtractError(null)

      try {
        var session = await supabase.auth.getSession()
        var token = session.data.session?.access_token
        if (!token) {
          setExtractError('Not authenticated')
          return
        }

        var response = await fetch('/api/research-hub/extract-url', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: url }),
        })

        if (!response.ok) {
          var errorData = await response.json()
          setExtractError(errorData.error || 'Failed to extract metadata')
          return
        }

        var data: ExtractedData = await response.json()
        setExtractedData(data)

        // Auto-fill fields from extracted data
        if (data.title && !title) {
          setTitle(data.title)
        }
        if (data.source_type) {
          setSourceType(data.source_type as ArtifactSourceType)
        }
        if (data.source_platform) {
          setSourcePlatform(data.source_platform)
        }
        if (data.thumbnail_url) {
          setThumbnailUrl(data.thumbnail_url)
        }
        if (data.platform_metadata) {
          setPlatformMetadata(data.platform_metadata)
        }
        if (data.description) {
          setExtractedDescription(data.description)
        }
        if (data.is_duplicate) {
          setIsDuplicate(true)
        }
      } catch (err) {
        setExtractError('Network error. Check the URL and try again.')
      } finally {
        setIsExtracting(false)
      }
    }, 600)
  }, [title])

  var handleSelectReport = function(report: { id: string; title: string }) {
    setSelectedReport(report)
    setTitle(report.title)
  }

  var handleSave = async function() {
    if (activeTab === 'report') {
      if (!selectedReport) return

      setIsSaving(true)
      try {
        var tags = tagsInput
          .split(',')
          .map(function(t) { return t.trim() })
          .filter(Boolean)

        await onSave({
          source_type: 'paradocs_report',
          report_id: selectedReport.id,
          title: selectedReport.title,
          user_note: note || undefined,
          verdict: verdict || undefined,
          tags: tags.length > 0 ? tags : undefined,
          case_file_id: caseFileId,
        })

        handleReset()
        onClose()
      } finally {
        setIsSaving(false)
      }
    } else {
      if (!externalUrl.trim() || !title.trim()) return

      setIsSaving(true)
      try {
        var tags = tagsInput
          .split(',')
          .map(function(t) { return t.trim() })
          .filter(Boolean)

        await onSave({
          source_type: sourceType,
          external_url: externalUrl,
          title: title,
          description: extractedDescription || undefined,
          thumbnail_url: thumbnailUrl || undefined,
          source_platform: sourcePlatform || undefined,
          metadata_json: Object.keys(platformMetadata).length > 0 ? platformMetadata : undefined,
          user_note: note || undefined,
          verdict: verdict || undefined,
          tags: tags.length > 0 ? tags : undefined,
          case_file_id: caseFileId,
        })

        handleReset()
        onClose()
      } finally {
        setIsSaving(false)
      }
    }
  }

  var handleReset = function() {
    setSearchQuery('')
    setSearchResults([])
    setSelectedReport(null)
    setExternalUrl('')
    setSourceType('website')
    setTitle('')
    setThumbnailUrl('')
    setSourcePlatform('')
    setPlatformMetadata({})
    setNote('')
    setVerdict(null)
    setTagsInput('')
    setCaseFileId(defaultCaseFileId)
    setExtractedData(null)
    setExtractError(null)
    setIsDuplicate(false)
    setExtractedDescription(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-800/50">
          <h2 className="text-lg font-semibold text-white">Add to Research Hub</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-6 pt-4">
          <button
            onClick={function() { setActiveTab('report') }}
            className={classNames(
              'flex items-center gap-2 px-4 py-2 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'report'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            )}
          >
            <FileText className="w-4 h-4" />
            Save Report
          </button>
          <button
            onClick={function() { setActiveTab('url') }}
            className={classNames(
              'flex items-center gap-2 px-4 py-2 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'url'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            )}
          >
            <Link2 className="w-4 h-4" />
            Paste URL
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {activeTab === 'report' ? (
            <>
              {/* Search Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Search Paradocs Reports
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={function(e) { handleSearchChange(e.target.value) }}
                    placeholder="Search by title..."
                    className={classNames(
                      'w-full pl-10 pr-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                      'text-white placeholder-gray-500 text-sm',
                      'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
                    )}
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" />
                  )}
                </div>
              </div>

              {/* Search Results */}
              {searchQuery && (
                <div className="space-y-2">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map(function(report) {
                      return (
                        <button
                          key={report.id}
                          onClick={function() { handleSelectReport(report) }}
                          className={classNames(
                            'w-full text-left p-3 rounded-lg border transition-colors text-sm',
                            selectedReport?.id === report.id
                              ? 'border-indigo-500 bg-indigo-500/10'
                              : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                            <span className="text-gray-200 line-clamp-2">{report.title}</span>
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="py-6 text-center text-sm text-gray-500">
                      No reports found
                    </div>
                  )}
                </div>
              )}

              {/* Selected Report Display */}
              {selectedReport && (
                <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-1">Selected Report</p>
                  <p className="text-sm text-white font-medium line-clamp-2">{selectedReport.title}</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* URL Input with auto-extraction */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Paste a URL
                </label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={function(e) { handleUrlChange(e.target.value) }}
                    placeholder="https://youtube.com/watch?v=..."
                    className={classNames(
                      'w-full pl-10 pr-10 py-2 rounded-lg bg-gray-800 border',
                      'text-white placeholder-gray-500 text-sm',
                      'focus:outline-none focus:ring-1',
                      isDuplicate
                        ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/30'
                        : extractedData
                        ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/30'
                        : 'border-gray-700 focus:border-indigo-500 focus:ring-indigo-500/30'
                    )}
                  />
                  {isExtracting && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 animate-spin" />
                  )}
                  {extractedData && !isExtracting && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                  )}
                </div>
              </div>

              {/* Extraction Error */}
              {extractError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-red-300">{extractError}</span>
                </div>
              )}

              {/* Duplicate Warning */}
              {isDuplicate && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="text-amber-300">You{"'"}ve already saved this URL. Saving again will create a duplicate.</span>
                </div>
              )}

              {/* Extracted Preview Card */}
              {extractedData && (
                <div className="rounded-lg bg-gray-800/50 border border-gray-700 overflow-hidden">
                  {extractedData.thumbnail_url && (
                    <div className="relative h-32 bg-gray-800">
                      <img
                        src={extractedData.thumbnail_url}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={function(e) { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/70 text-xs text-gray-300">
                        {extractedData.source_platform}
                      </div>
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-xs text-gray-400 mb-1">
                      {extractedData.site_name || extractedData.source_platform}
                    </p>
                    {extractedData.title && (
                      <p className="text-sm text-white font-medium line-clamp-2 mb-1">{extractedData.title}</p>
                    )}
                    {extractedData.description && (
                      <p className="text-xs text-gray-400 line-clamp-2">{extractedData.description}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Manual thumbnail URL — shown when server can't extract image */}
              {extractedData && !extractedData.thumbnail_url && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Thumbnail URL (Optional)
                    <span className="ml-2 text-xs text-amber-400 font-normal">
                      Could not auto-detect image
                    </span>
                  </label>
                  <input
                    type="url"
                    value={thumbnailUrl}
                    onChange={function(e) { setThumbnailUrl(e.target.value) }}
                    placeholder="Paste an image URL..."
                    className={classNames(
                      'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                      'text-white placeholder-gray-500 text-sm',
                      'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
                    )}
                  />
                  {thumbnailUrl && (
                    <div className="mt-2 h-20 rounded-lg overflow-hidden bg-gray-800">
                      <img
                        src={thumbnailUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={function(e) { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Source Type (auto-detected, but editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Source Type
                  {extractedData && (
                    <span className="ml-2 text-xs text-green-400 font-normal">Auto-detected</span>
                  )}
                </label>
                <select
                  value={sourceType}
                  onChange={function(e) { setSourceType(e.target.value as ArtifactSourceType) }}
                  className={classNames(
                    'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                    'text-white text-sm',
                    'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
                  )}
                >
                  {SOURCE_TYPE_OPTIONS.map(function(opt) {
                    return (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Title (auto-filled, but editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Title
                  {extractedData && extractedData.title && (
                    <span className="ml-2 text-xs text-green-400 font-normal">Auto-filled</span>
                  )}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={function(e) { setTitle(e.target.value) }}
                  placeholder="Enter a title..."
                  className={classNames(
                    'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                    'text-white placeholder-gray-500 text-sm',
                    'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
                  )}
                />
              </div>

              {/* Description (auto-filled from extraction, but editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description (Optional)
                  {extractedData && extractedData.description && (
                    <span className="ml-2 text-xs text-green-400 font-normal">Auto-filled</span>
                  )}
                </label>
                <textarea
                  value={extractedDescription || ''}
                  onChange={function(e) { setExtractedDescription(e.target.value || null) }}
                  placeholder="Add a description..."
                  rows={2}
                  className={classNames(
                    'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                    'text-white placeholder-gray-500 text-sm resize-none',
                    'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
                  )}
                />
              </div>
            </>
          )}

          {/* Shared Fields */}

          {/* Case File Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Case File
            </label>
            <select
              value={caseFileId || ''}
              onChange={function(e) { setCaseFileId(e.target.value || undefined) }}
              className={classNames(
                'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                'text-white text-sm',
                'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
              )}
            >
              <option value="">None / Unsorted</option>
              {caseFiles.map(function(cf) {
                return (
                  <option key={cf.id} value={cf.id}>
                    {cf.title}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Verdict Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Verdict (Optional)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VERDICT_OPTIONS.map(function(opt) {
                return (
                  <button
                    key={opt.value}
                    onClick={function() { setVerdict(verdict === opt.value ? null : opt.value) }}
                    className={classNames(
                      'px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                      verdict === opt.value
                        ? 'bg-indigo-500/30 border-indigo-500 text-white'
                        : 'border-gray-700 bg-gray-800/30 text-gray-300 hover:border-gray-600'
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={note}
              onChange={function(e) { setNote(e.target.value) }}
              placeholder="Add your thoughts or observations..."
              rows={3}
              className={classNames(
                'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                'text-white placeholder-gray-500 text-sm resize-none',
                'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
              )}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Tags (comma-separated, optional)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={function(e) { setTagsInput(e.target.value) }}
              placeholder="research, ufo, sighting"
              className={classNames(
                'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                'text-white placeholder-gray-500 text-sm',
                'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
              )}
            />
            {tagSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tagSuggestions
                  .filter(function(tag) {
                    var currentTags = tagsInput.split(',').map(function(t) { return t.trim().toLowerCase() })
                    return !currentTags.includes(tag.toLowerCase())
                  })
                  .slice(0, 12)
                  .map(function(tag) {
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={function() {
                          var current = tagsInput.trim()
                          if (current && !current.endsWith(',')) {
                            setTagsInput(current + ', ' + tag)
                          } else if (current) {
                            setTagsInput(current + ' ' + tag)
                          } else {
                            setTagsInput(tag)
                          }
                        }}
                        className="px-2 py-0.5 text-xs rounded-full bg-gray-800 text-gray-400 border border-gray-700 hover:border-indigo-500 hover:text-indigo-300 transition-colors"
                      >
                        #{tag}
                      </button>
                    )
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800 bg-gray-800/30">
          <button
            onClick={onClose}
            className={classNames(
              'px-4 py-2 rounded-lg font-medium transition-colors text-sm',
              'bg-gray-800 text-gray-300 hover:bg-gray-700'
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              isSaving || isExtracting ||
              (activeTab === 'report' ? !selectedReport : !externalUrl.trim() || !title.trim())
            }
            className={classNames(
              'px-4 py-2 rounded-lg font-medium transition-all text-sm',
              'flex items-center gap-2',
              isSaving || isExtracting || (activeTab === 'report' ? !selectedReport : !externalUrl.trim() || !title.trim())
                ? 'bg-indigo-500/50 text-white cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
            )}
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isDuplicate ? 'Save Anyway' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ArtifactQuickAdd
