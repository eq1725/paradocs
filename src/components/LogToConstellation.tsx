import React, { useState, useEffect, useRef } from 'react'
import { Star, X, Check, AlertCircle, HelpCircle, Search, Tag, Trash2 } from 'lucide-react'

interface LogToConstellationProps {
  isOpen: boolean
  onClose: () => void
  reportId: string
  reportTitle: string
  reportCategory: string
  userToken: string
  onLogged?: (entry: any) => void
}

const VERDICTS = [
  { value: 'compelling', label: 'Compelling', icon: "✦", color: 'text-amber-400 border-amber-400/40 bg-amber-400/10', desc: 'Strong evidence or credible account' },
  { value: 'inconclusive', label: 'Inconclusive', icon: "◐", color: 'text-blue-400 border-blue-400/40 bg-blue-400/10', desc: 'Interesting but not enough to draw conclusions' },
  { value: 'skeptical', label: 'Skeptical', icon: '⊘', color: 'text-gray-400 border-gray-400/40 bg-gray-400/10', desc: 'Likely has a conventional explanation' },
  { value: 'needs_info', label: 'Need More Info', icon: '?', color: 'text-purple-400 border-purple-400/40 bg-purple-400/10', desc: 'Worth investigating further' },
]

export default function LogToConstellation({
  isOpen, onClose, reportId, reportTitle, reportCategory, userToken, onLogged
}: LogToConstellationProps) {
  const [note, setNote] = useState('')
  const [verdict, setVerdict] = useState('needs_info')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  // Check for existing entry when opened
  useEffect(() => {
    if (!isOpen || !reportId || !userToken) return
    setLoading(true)
    fetch(`/api/constellation/entries?report_id=${reportId}`, {
      headers: { Authorization: `Bearer ${userToken}` }
    })
      .then(r => r.json())
      .then(data => {
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
      .catch(() => {})
      .finally(() => {
        setLoading(false)
        setTimeout(() => noteRef.current?.focus(), 100)
      })
  }, [isOpen, reportId, userToken])

  function handleAddTag() {
    const cleaned = tagInput.trim().toLowerCase().replace(/^#/, '')
    if (cleaned && !tags.includes(cleaned)) {
      setTags([...tags, cleaned])
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
    setTags(tags.filter(t => t !== tag))
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const resp = await fetch('/api/constellation/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ report_id: reportId, note, verdict, tags })
      })
      const data = await resp.json()
      if (resp.ok && data.entry) {
        onLogged?.(data.entry)
        onClose()
      }
    } catch (err) {
      console.error('Failed to log entry:', err)
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ entry_id: existing.id })
      })
      onLogged?.(null)
      onClose()
    } catch (err) {
      console.error('Failed to delete entry:', err)
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 mb-0 sm:mb-0 bg-gray-900 border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-white/5 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Star className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">
                {existing ? 'Edit Constellation Entry' : 'Log to Constellation'}
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
            <div className="w-6 h-6 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="px-5 py-4 space-y-5">
            {/* Verdict Selector */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 block">
                Your Verdict
              </label>
              <div className="grid grid-cols-2 gap-2">
                {VERDICTS.map(v => (
                  <button
                    key={v.value}
                    onClick={() => setVerdict(v.value)}
                    className={`
                      flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all text-left
                      ${verdict === v.value
                        ? v.color + ' ring-1 ring-current/30'
                        : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300'
                      }
                    `}
                  >
                    <span className="text-base leading-none">{v.icon}</span>
                    <div>
                      <span className="font-medium block text-xs">{v.label}</span>
                    </div>
                  </button>
                ))}
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
                onChange={e => setNote(e.target.value)}
                placeholder="This reminds me of the Phoenix Lights — same triangular description, same military proximity..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                rows={3}
              />
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 block">
                Tags <span className="text-gray-600 normal-case">(press Enter to add — stars with shared tags connect)</span>
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-white/5 border border-white/10 rounded-lg min-h-[42px] focus-within:border-purple-500/50 transition-colors">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-white ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => tagInput && handleAddTag()}
                  placeholder={tags.length === 0 ? 'e.g. triangle-craft, military-adjacent' : ''}
                  className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 pb-1">
              {existing ? (
                <div>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Remove from constellation?</span>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-xs text-red-400 hover:text-red-300 font-medium"
                      >
                        {deleting ? 'Removing...' : 'Yes, remove'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="text-xs text-gray-500 hover:text-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove entry
                    </button>
                  )) }
  
    
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
/div>
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
 />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Star className="v-4 h-4">
                    </Star>
                  )}
                  {existing ? 'Update Entry' : 'Log to Constellation'}
                </button>
            </div>
          </div>
        )}
      </div>
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
