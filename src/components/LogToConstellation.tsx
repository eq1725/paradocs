import React, { useState, useEffect, useRef } from 'react'
import { BookOpen, X, Check, AlertCircle, HelpCircle, Search, Tag, Trash2, Folder, ChevronDown, ChevronRight, Plus, Circle } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'

interface LogToConstellationProps {
  isOpen: boolean
  onClose: () => void
  reportId: string
  reportTitle: string
  reportCategory: string
  userToken: string
  onLogged?: (entry: any) => void
}

interface CaseFileOption {
  id: string
  title: string
  cover_color: string
  artifact_count: number
}

var VERDICTS = [
  { value: 'compelling', label: 'Compelling', icon: '\u2726', color: 'text-amber-400 border-amber-400/40 bg-amber-400/10', desc: 'Strong evidence or credible account' },
  { value: 'inconclusive', label: 'Inconclusive', icon: '\u25D0', color: 'text-blue-400 border-blue-400/40 bg-blue-400/10', desc: 'Interesting but not enough to draw conclusions' },
  { value: 'skeptical', label: 'Skeptical', icon: '\u2298', color: 'text-gray-400 border-gray-400/40 bg-gray-400/10', desc: 'Likely has a conventional explanation' },
  { value: 'needs_info', label: 'Need More Info', icon: '?', color: 'text-purple-400 border-purple-400/40 bg-purple-400/10', desc: 'Worth investigating further' },
]

export default function LogToConstellation({
  isOpen, onClose, reportId, reportTitle, reportCategory, userToken, onLogged
}: LogToConstellationProps) {
  var { showToast } = useToast()
  var [note, setNote] = useState('')
  var [verdict, setVerdict] = useState('needs_info')
  var [tags, setTags] = useState<string[]>([])
  var [tagInput, setTagInput] = useState('')
  var [saving, setSaving] = useState(false)
  var [existing, setExisting] = useState<any>(null)
  var [loading, setLoading] = useState(true)
  var [deleting, setDeleting] = useState(false)
  var [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  var noteRef = useRef<HTMLTextAreaElement>(null)

  // Case file state
  var [caseFiles, setCaseFiles] = useState<CaseFileOption[]>([])
  var [selectedCaseFileId, setSelectedCaseFileId] = useState<string | null>(null)
  var [showCaseFiles, setShowCaseFiles] = useState(false)
  var [newCaseFileName, setNewCaseFileName] = useState('')
  var [creatingCaseFile, setCreatingCaseFile] = useState(false)

  // Check for existing entry when opened
  useEffect(function() {
    if (!isOpen || !reportId || !userToken) return
    setLoading(true)
    fetch('/api/constellation/entries?report_id=' + reportId, {
      headers: { Authorization: 'Bearer ' + userToken }
    })
      .then(function(r) { return r.json() })
      .then(function(data) {
        if (data.entry) {
          setExisting(data.entry)
          setNote(data.entry.note || '')
          setVerdict(data.entry.verdict || 'needs_info')
          setTags(data.entry.tags || [])
        } else {
          setExisting(null)
          setNote('')
          setVerdict('needs_info')
          setTags([])
        }
      })
      .catch(function() {})
      .finally(function() {
        setLoading(false)
        setTimeout(function() { noteRef.current && noteRef.current.focus() }, 100)
      })
  }, [isOpen, reportId, userToken])

  // Fetch case files when opened
  useEffect(function() {
    if (!isOpen || !userToken) return
    fetch('/api/research-hub/case-files', {
      headers: { Authorization: 'Bearer ' + userToken, 'Content-Type': 'application/json' }
    })
      .then(function(r) { return r.json() })
      .then(function(data) {
        setCaseFiles(data.caseFiles || [])
      })
      .catch(function() {})
  }, [isOpen, userToken])

  function handleAddTag() {
    var cleaned = tagInput.trim().toLowerCase().replace(/^#/, '')
    if (cleaned && !tags.includes(cleaned)) {
      setTags([].concat(tags, [cleaned]))
    }
    setTagInput('')
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddTag()
    }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1))
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter(function(t) { return t !== tag }))
  }

  async function handleCreateCaseFile() {
    if (!newCaseFileName.trim() || creatingCaseFile) return
    setCreatingCaseFile(true)
    try {
      var resp = await fetch('/api/research-hub/case-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + userToken },
        body: JSON.stringify({ title: newCaseFileName.trim(), cover_color: '#7a00cc', icon: 'folder' })
      })
      var data = await resp.json()
      var newCf = data.caseFile || data
      if (newCf && newCf.id) {
        setCaseFiles(function(prev) { return [].concat(prev, [newCf]) })
        setSelectedCaseFileId(newCf.id)
        setNewCaseFileName('')
      }
    } catch (err) {
      console.error('Failed to create case file:', err)
    } finally {
      setCreatingCaseFile(false)
    }
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      var resp = await fetch('/api/constellation/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + userToken },
        body: JSON.stringify({ report_id: reportId, note: note, verdict: verdict, tags: tags })
      })
      var data = await resp.json()
      if (resp.ok && data.entry) {
        // If a case file was selected, add the artifact to it
        if (selectedCaseFileId && data.artifactId) {
          try {
            await fetch('/api/research-hub/case-file-artifacts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + userToken },
              body: JSON.stringify({ case_file_id: selectedCaseFileId, artifact_id: data.artifactId })
            })
          } catch (cfErr) {
            console.error('Failed to add to case file:', cfErr)
          }
        }
        onLogged && onLogged(data.entry)
        onClose()
        var cfName = selectedCaseFileId ? caseFiles.find(function(cf) { return cf.id === selectedCaseFileId }) : null
        if (cfName) {
          showToast('success', 'Saved to Research Hub \u00B7 Filed in ' + cfName.title)
        } else {
          showToast('success', 'Saved to Research Hub')
        }
        setSelectedCaseFileId(null)
        setShowCaseFiles(false)
      } else {
        showToast('error', data && data.error ? data.error : 'Failed to save')
      }
    } catch (err) {
      console.error('Failed to save:', err)
      showToast('error', 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!existing || deleting) return
    setDeleting(true)
    try {
      await fetch('/api/constellation/entries', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + userToken },
        body: JSON.stringify({ entry_id: existing.id })
      })
      onLogged && onLogged(null)
      onClose()
      showToast('info', 'Removed from Research Hub')
    } catch (err) {
      console.error('Failed to delete entry:', err)
      showToast('error', 'Failed to remove entry')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (!isOpen) return null

  var selectedCf = selectedCaseFileId ? caseFiles.find(function(cf) { return cf.id === selectedCaseFileId }) : null

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 mb-0 sm:mb-0 bg-gray-900 border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-white/5 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">
                {existing ? 'Edit Research Entry' : 'Save to Research Hub'}
              </h3>
              <p className="text-gray-500 text-xs truncate max-w-[280px]">{reportTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center">
            <div className="w-6 h-6 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="px-5 py-4 space-y-5">
            {/* Verdict Selector */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 block">
                Your Verdict
              </label>
              <div className="grid grid-cols-2 gap-2">
                {VERDICTS.map(function(v) {
                  return (
                    <button
                      key={v.value}
                      onClick={function() { setVerdict(v.value) }}
                      className={
                        'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all text-left ' +
                        (verdict === v.value
                          ? v.color + ' ring-1 ring-current/30'
                          : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300')
                      }
                    >
                      <span className="text-base leading-none">{v.icon}</span>
                      <div>
                        <span className="font-medium block text-xs">{v.label}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 block">
                Research Note <span className="text-gray-600 normal-case">(what stood out to you?)</span>
              </label>
              <textarea
                ref={noteRef}
                value={note}
                onChange={function(e) { setNote(e.target.value) }}
                placeholder="This reminds me of the Phoenix Lights \u2014 same triangular description, same military proximity..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
                rows={3}
              />
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 block">
                Tags <span className="text-gray-600 normal-case">(press Enter to add)</span>
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-white/5 border border-white/10 rounded-lg min-h-[42px] focus-within:border-indigo-500/50 transition-colors">
                {tags.map(function(tag) {
                  return (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs"
                    >
                      <Tag className="w-3 h-3" />
                      {tag}
                      <button onClick={function() { removeTag(tag) }} className="hover:text-white ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )
                })}
                <input
                  value={tagInput}
                  onChange={function(e) { setTagInput(e.target.value) }}
                  onKeyDown={handleTagKeyDown}
                  onBlur={function() { tagInput && handleAddTag() }}
                  placeholder={tags.length === 0 ? 'e.g. triangle-craft, military-adjacent' : ''}
                  className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                />
              </div>
            </div>

            {/* Case File Picker (optional) */}
            {!existing && (
              <div>
                <button
                  onClick={function() { setShowCaseFiles(!showCaseFiles) }}
                  className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 hover:text-gray-300 transition-colors"
                >
                  {showCaseFiles ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <Folder className="w-3.5 h-3.5" />
                  File into a Case File
                  <span className="text-gray-600 normal-case font-normal">(optional)</span>
                </button>

                {showCaseFiles && (
                  <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                    {/* Case file list */}
                    <div className="max-h-40 overflow-y-auto py-1">
                      {/* Skip / no case file option */}
                      <button
                        onClick={function() { setSelectedCaseFileId(null) }}
                        className={
                          'w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ' +
                          (selectedCaseFileId === null
                            ? 'bg-white/5 text-white'
                            : 'text-gray-400 hover:bg-white/5 hover:text-gray-300')
                        }
                      >
                        <span className="text-gray-600">{'\u2014'}</span>
                        <span>No case file (unsorted)</span>
                      </button>

                      {caseFiles.map(function(cf) {
                        return (
                          <button
                            key={cf.id}
                            onClick={function() { setSelectedCaseFileId(cf.id) }}
                            className={
                              'w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ' +
                              (selectedCaseFileId === cf.id
                                ? 'bg-indigo-500/10 text-indigo-300'
                                : 'text-gray-400 hover:bg-white/5 hover:text-gray-300')
                            }
                          >
                            <Circle
                              className="w-2.5 h-2.5 flex-shrink-0"
                              fill={cf.cover_color || '#4B5563'}
                              color={cf.cover_color || '#4B5563'}
                            />
                            <span className="truncate flex-1">{cf.title}</span>
                            <span className="text-xs text-gray-600 flex-shrink-0">
                              {cf.artifact_count}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Create new case file inline */}
                    <div className="border-t border-white/10 px-3 py-2 flex items-center gap-2">
                      <Plus className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      <input
                        value={newCaseFileName}
                        onChange={function(e) { setNewCaseFileName(e.target.value) }}
                        onKeyDown={function(e) {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleCreateCaseFile()
                          }
                        }}
                        placeholder="New case file name..."
                        className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                      />
                      {newCaseFileName.trim() && (
                        <button
                          onClick={handleCreateCaseFile}
                          disabled={creatingCaseFile}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          {creatingCaseFile ? '...' : 'Create'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Selected case file indicator */}
                {selectedCf && !showCaseFiles && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-xs text-indigo-300">
                    <Circle
                      className="w-2 h-2 flex-shrink-0"
                      fill={selectedCf.cover_color || '#4B5563'}
                      color={selectedCf.cover_color || '#4B5563'}
                    />
                    <span>{'Filing into: ' + selectedCf.title}</span>
                    <button
                      onClick={function() { setSelectedCaseFileId(null) }}
                      className="ml-auto hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 pb-1">
              {existing ? (
                <div>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Remove from Research Hub?</span>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-xs text-red-400 hover:text-red-300 font-medium"
                      >
                        {deleting ? 'Removing...' : 'Yes, remove'}
                      </button>
                      <button
                        onClick={function() { setShowDeleteConfirm(false) }}
                        className="text-xs text-gray-500 hover:text-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={function() { setShowDeleteConfirm(true) }}
                      className="text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove entry
                    </button>
                  )}
                </div>
              ) : (
                <div />
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <BookOpen className="w-4 h-4" />
                )}
                {existing ? 'Update Entry' : 'Save to Research Hub'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
