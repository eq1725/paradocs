'use client'

import type { CaseFile, ArtifactSourceType, ArtifactVerdict } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { Search, X, Loader2, FileText } from 'lucide-react'
import { useState, useCallback, useRef } from 'react'

interface ArtifactQuickAddProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: {
    source_type: ArtifactSourceType
    report_id?: string
    external_url?: string
    title: string
    user_note?: string
    verdict?: ArtifactVerdict
    tags?: string[]
    case_file_id?: string
  }) => Promise<void>
  caseFiles: CaseFile[]
  defaultCaseFileId?: string
}

type TabType = 'report' | 'url'
const SOURCE_TYPE_OPTIONS: Array<{ value: ArtifactSourceType; label: string }> = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'news', label: 'News' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' },
]

const VERDICT_OPTIONS: Array<{ value: ArtifactVerdict; label: string; color: string }> = [
  { value: 'compelling', label: 'Compelling', color: 'bg-amber-500/20 border-amber-500/50' },
  { value: 'inconclusive', label: 'Inconclusive', color: 'bg-blue-500/20 border-blue-500/50' },
  { value: 'skeptical', label: 'Skeptical', color: 'bg-gray-500/20 border-gray-500/50' },
  { value: 'needs_info', label: 'Needs Info', color: 'bg-purple-500/20 border-purple-500/50' },
]

export function ArtifactQuickAdd({
  isOpen,
  onClose,
  onSave,
  caseFiles,
  defaultCaseFileId,
}: ArtifactQuickAddProps) {
  const [activeTab, setActiveTab] = useState<TabType>('report')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ id: string; title: string }>>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedReport, setSelectedReport] = useState<{ id: string; title: string } | null>(null)

  const [externalUrl, setExternalUrl] = useState('')
  const [sourceType, setSourceType] = useState<ArtifactSourceType>('website')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [verdict, setVerdict] = useState<ArtifactVerdict | null>(null)
  const [tagsInput, setTagsInput] = useState('')
  const [caseFileId, setCaseFileId] = useState<string | undefined>(defaultCaseFileId)
  const [isSaving, setIsSaving] = useState(false)

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!query.trim()) {
      setSearchResults([])
      return
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const response = await fetch('/api/search/fulltext?q=' + encodeURIComponent(query) + '&limit=5')
        if (response.ok) {
          const data = await response.json()
          setSearchResults(data.results || [])
        }
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setIsSearching(false)
      }
    }, 300)
  }, [])

  const handleSelectReport = (report: { id: string; title: string }) => {
    setSelectedReport(report)
    setTitle(report.title)
  }

  const handleSave = async () => {
    if (activeTab === 'report') {
      if (!selectedReport) return

      setIsSaving(true)
      try {
        const tags = tagsInput
          .split(',')
          .map(t => t.trim())
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
        const tags = tagsInput
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)

        await onSave({
          source_type: sourceType,
          external_url: externalUrl,
          title,
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

  const handleReset = () => {
    setSearchQuery('')
    setSearchResults([])
    setSelectedReport(null)
    setExternalUrl('')
    setSourceType('website')
    setTitle('')
    setNote('')
    setVerdict(null)
    setTagsInput('')
    setCaseFileId(defaultCaseFileId)
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
            onClick={() => setActiveTab('report')}
            className={classNames(
              'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'report'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            )}
          >
            Save Report
          </button>
          <button
            onClick={() => setActiveTab('url')}
            className={classNames(
              'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'url'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            )}
          >
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
                    onChange={(e) => handleSearchChange(e.target.value)}
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
                    searchResults.map((report) => (
                      <button
                        key={report.id}
                        onClick={() => handleSelectReport(report)}
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
                    ))
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
              {/* URL Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  URL
                </label>
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://example.com"
                  className={classNames(
                    'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                    'text-white placeholder-gray-500 text-sm',
                    'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
                  )}
                />
              </div>

              {/* Source Type Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Source Type
                </label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as ArtifactSourceType)}
                  className={classNames(
                    'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                    'text-white text-sm',
                    'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
                  )}
                >
                  {SOURCE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title..."
                  className={classNames(
                    'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                    'text-white placeholder-gray-500 text-sm',
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
              onChange={(e) => setCaseFileId(e.target.value || undefined)}
              className={classNames(
                'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                'text-white text-sm',
                'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
              )}
            >
              <option value="">None / Unsorted</option>
              {caseFiles.map((cf) => (
                <option key={cf.id} value={cf.id}>
                  {cf.title}
                </option>
              ))}
            </select>
          </div>

          {/* Verdict Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Verdict (Optional)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VERDICT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setVerdict(opt.value)}
                  className={classNames(
                    'px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                    verdict === opt.value
                      ? 'bg-indigo-500/30 border-indigo-500 text-white'
                      : 'border-gray-700 bg-gray-800/30 text-gray-300 hover:border-gray-600'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="research, ufo, sighting"
              className={classNames(
                'w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700',
                'text-white placeholder-gray-500 text-sm',
                'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
              )}
            />
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
              isSaving ||
              (activeTab === 'report' ? !selectedReport : !externalUrl.trim() || !title.trim())
            }
            className={classNames(
              'px-4 py-2 rounded-lg font-medium transition-all text-sm',
              'flex items-center gap-2',
              isSaving || (activeTab === 'report' ? !selectedReport : !externalUrl.trim() || !title.trim())
                ? 'bg-indigo-500/50 text-white cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
            )}
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default ArtifactQuickAdd
