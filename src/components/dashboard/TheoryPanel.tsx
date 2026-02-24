import React, { useState } from 'react'
import { X, Lightbulb, Plus, Check, Trash2, ChevronDown, ChevronRight, Globe, Lock, Edit3 } from 'lucide-react'
import { EntryNode } from '@/pages/dashboard/constellation'
import { ConnectionData } from './ConnectionDrawer'

const VERDICT_ICONS: Record<string, { icon: string; color: string }> = {
  compelling: { icon: '✦', color: 'text-amber-400' },
  inconclusive: { icon: '◐', color: 'text-blue-400' },
  skeptical: { icon: '⊘', color: 'text-gray-400' },
  needs_info: { icon: '?', color: 'text-purple-400' },
}

export interface TheoryData {
  id: string
  title: string
  thesis: string
  entry_ids: string[]
  connection_ids: string[]
  is_public: boolean
  created_at: string
  updated_at: string
}

interface TheoryPanelProps {
  isOpen: boolean
  onClose: () => void
  theories: TheoryData[]
  entries: EntryNode[]
  connections: ConnectionData[]
  userToken: string
  onTheoryChanged: () => void
}

export default function TheoryPanel({
  isOpen,
  onClose,
  theories,
  entries,
  connections,
  userToken,
  onTheoryChanged,
}: TheoryPanelProps) {
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [editingTheory, setEditingTheory] = useState<TheoryData | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [thesis, setThesis] = useState('')
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([])
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const resetForm = () => {
    setTitle('')
    setThesis('')
    setSelectedEntryIds([])
    setSelectedConnectionIds([])
    setIsPublic(false)
    setEditingTheory(null)
  }

  const startEdit = (theory: TheoryData) => {
    setTitle(theory.title)
    setThesis(theory.thesis)
    setSelectedEntryIds(theory.entry_ids)
    setSelectedConnectionIds(theory.connection_ids)
    setIsPublic(theory.is_public)
    setEditingTheory(theory)
    setMode('edit')
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const method = mode === 'edit' ? 'PUT' : 'POST'
      const body: any = {
        title,
        thesis,
        entry_ids: selectedEntryIds,
        connection_ids: selectedConnectionIds,
        is_public: isPublic,
      }
      if (mode === 'edit' && editingTheory) {
        body.theory_id = editingTheory.id
      }

      const resp = await fetch('/api/constellation/theories', {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify(body),
      })
      const data = await resp.json().catch(() => null)
      if (resp.ok) {
        onTheoryChanged()
        resetForm()
        setMode('list')
      } else {
        const msg = data?.error || `Save failed (${resp.status})`
        setError(msg)
        console.error('Theory save error:', resp.status, data)
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
      console.error('Theory save exception:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (theoryId: string) => {
    const resp = await fetch('/api/constellation/theories', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({ theory_id: theoryId }),
    })
    if (resp.ok) onTheoryChanged()
  }

  const toggleEntry = (id: string) => {
    setSelectedEntryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleConnection = (id: string) => {
    setSelectedConnectionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            <h2 className="text-white font-semibold">
              {mode === 'list' ? 'Your Theories' : mode === 'create' ? 'New Theory' : 'Edit Theory'}
            </h2>
            {mode === 'list' && (
              <span className="text-gray-500 text-sm">({theories.length})</span>
            )}
          </div>
          <button onClick={() => { resetForm(); setMode('list'); onClose() }} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {mode === 'list' && (
            <>
              {theories.length === 0 ? (
                <div className="text-center py-8">
                  <Lightbulb className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm mb-1">No theories yet</p>
                  <p className="text-gray-500 text-xs mb-4">
                    Theories are named collections of connected entries with a written thesis.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {theories.map(theory => {
                    const isExpanded = expandedId === theory.id
                    const theoryEntries = entries.filter(e => theory.entry_ids.includes(e.id))
                    return (
                      <div key={theory.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : theory.id)}
                          className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-800/80 transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium text-sm">{theory.title}</span>
                              {theory.is_public ? (
                                <Globe className="w-3 h-3 text-green-400" />
                              ) : (
                                <Lock className="w-3 h-3 text-gray-500" />
                              )}
                            </div>
                            <div className="text-gray-500 text-xs mt-0.5">
                              {theory.entry_ids.length} entries · {theory.connection_ids.length} connections
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-0">
                            {theory.thesis && (
                              <p className="text-gray-300 text-sm mb-3 pl-7">{theory.thesis}</p>
                            )}
                            {theoryEntries.length > 0 && (
                              <div className="pl-7 mb-3">
                                <div className="text-xs text-gray-500 mb-1.5">Supporting entries:</div>
                                <div className="space-y-1">
                                  {theoryEntries.slice(0, 5).map(e => {
                                    const v = VERDICT_ICONS[e.verdict] || VERDICT_ICONS.needs_info
                                    return (
                                      <div key={e.id} className="flex items-center gap-2 text-xs">
                                        <span className={v.color}>{v.icon}</span>
                                        <span className="text-gray-300 truncate">{e.name}</span>
                                      </div>
                                    )
                                  })}
                                  {theoryEntries.length > 5 && (
                                    <div className="text-xs text-gray-500">+{theoryEntries.length - 5} more</div>
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2 pl-7">
                              <button
                                onClick={() => startEdit(theory)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                              >
                                <Edit3 className="w-3 h-3" /> Edit
                              </button>
                              <button
                                onClick={() => handleDelete(theory.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-red-900/50 text-gray-400 hover:text-red-400 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {(mode === 'create' || mode === 'edit') && (
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1">Theory Name</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder='e.g., "Military Proximity Hypothesis"'
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                  autoFocus
                />
              </div>

              {/* Thesis */}
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1">Thesis</label>
                <textarea
                  value={thesis}
                  onChange={e => setThesis(e.target.value)}
                  placeholder="Explain the pattern you've observed and your hypothesis..."
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-primary-500"
                />
              </div>

              {/* Select entries */}
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-2">
                  Supporting Entries ({selectedEntryIds.length} selected)
                </label>
                <div className="max-h-40 overflow-y-auto space-y-1 bg-gray-800/30 rounded-lg p-2">
                  {entries.map(entry => {
                    const isSelected = selectedEntryIds.includes(entry.id)
                    const v = VERDICT_ICONS[entry.verdict] || VERDICT_ICONS.needs_info
                    return (
                      <button
                        key={entry.id}
                        onClick={() => toggleEntry(entry.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                          isSelected
                            ? 'bg-primary-500/15 border border-primary-500/30'
                            : 'hover:bg-gray-800 border border-transparent'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-primary-500 border-primary-500' : 'border-gray-600'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className={v.color}>{v.icon}</span>
                        <span className="text-gray-300 truncate">{entry.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Select connections */}
              {connections.length > 0 && (
                <div>
                  <label className="text-gray-400 text-xs font-medium block mb-2">
                    Related Connections ({selectedConnectionIds.length} selected)
                  </label>
                  <div className="max-h-32 overflow-y-auto space-y-1 bg-gray-800/30 rounded-lg p-2">
                    {connections.map(conn => {
                      const isSelected = selectedConnectionIds.includes(conn.id)
                      const a = entries.find(e => e.id === conn.entryAId)
                      const b = entries.find(e => e.id === conn.entryBId)
                      if (!a || !b) return null
                      return (
                        <button
                          key={conn.id}
                          onClick={() => toggleConnection(conn.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                            isSelected
                              ? 'bg-cyan-500/15 border border-cyan-500/30'
                              : 'hover:bg-gray-800 border border-transparent'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-gray-600'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className="text-gray-300 truncate">{a.name} → {b.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Public toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${isPublic ? 'bg-green-500' : 'bg-gray-700'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isPublic ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <div className="flex items-center gap-1.5">
                  {isPublic ? <Globe className="w-3.5 h-3.5 text-green-400" /> : <Lock className="w-3.5 h-3.5 text-gray-500" />}
                  <span className="text-sm text-gray-400">{isPublic ? 'Visible on public profile' : 'Private'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex items-center justify-between">
          {mode === 'list' ? (
            <>
              <div />
              <button
                onClick={() => { resetForm(); setMode('create') }}
                disabled={entries.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Theory
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { resetForm(); setMode('list') }}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                ← Back to list
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Saving...' : mode === 'edit' ? 'Update Theory' : 'Create Theory'}
              </button>
            </>
          )}
        </div>
        {error && (
          <div className="mx-4 mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
