import React, { useState } from 'react'
import { X, Link2, ArrowRight, Check, Trash2 } from 'lucide-react'
import { EntryNode } from '@/pages/dashboard/constellation'

const VERDICT_ICONS: Record<string, { icon: string; color: string }> = {
  compelling: { icon: '✦', color: 'text-amber-400' },
  inconclusive: { icon: '◐', color: 'text-blue-400' },
  skeptical: { icon: '⊘', color: 'text-gray-400' },
  needs_info: { icon: '?', color: 'text-purple-400' },
}

export interface ConnectionData {
  id: string
  entryAId: string
  entryBId: string
  annotation: string
  createdAt?: string
}

interface ConnectionDrawerProps {
  isOpen: boolean
  onClose: () => void
  entries: EntryNode[]
  existingConnections: ConnectionData[]
  userToken: string
  onConnectionCreated: () => void
  onConnectionDeleted: () => void
}

export default function ConnectionDrawer({
  isOpen,
  onClose,
  entries,
  existingConnections,
  userToken,
  onConnectionCreated,
  onConnectionDeleted,
}: ConnectionDrawerProps) {
  const [step, setStep] = useState<'selectA' | 'selectB' | 'annotate'>('selectA')
  const [entryA, setEntryA] = useState<EntryNode | null>(null)
  const [entryB, setEntryB] = useState<EntryNode | null>(null)
  const [annotation, setAnnotation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  if (!isOpen) return null

  const reset = () => {
    setStep('selectA')
    setEntryA(null)
    setEntryB(null)
    setAnnotation('')
    setSearch('')
    setError(null)
  }

  const filteredEntries = entries.filter(e => {
    if (step === 'selectB' && entryA && e.id === entryA.id) return false
    if (!search) return true
    const q = search.toLowerCase()
    return e.name.toLowerCase().includes(q) ||
      e.tags.some(t => t.includes(q)) ||
      e.category.includes(q)
  })

  const handleSelectEntry = (entry: EntryNode) => {
    if (step === 'selectA') {
      setEntryA(entry)
      setStep('selectB')
      setSearch('')
    } else if (step === 'selectB') {
      setEntryB(entry)
      setStep('annotate')
      setSearch('')
    }
  }

  const handleSave = async () => {
    if (!entryA || !entryB) return
    setSaving(true)
    setError(null)
    try {
      const resp = await fetch('/api/constellation/connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          entry_a_id: entryA.id,
          entry_b_id: entryB.id,
          annotation,
        }),
      })
      const data = await resp.json().catch(() => null)
      if (resp.ok) {
        onConnectionCreated()
        reset()
      } else {
        const msg = data?.error || `Save failed (${resp.status})`
        setError(msg)
        console.error('Connection save error:', resp.status, data)
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
      console.error('Connection save exception:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (connectionId: string) => {
    const resp = await fetch('/api/constellation/connections', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({ connection_id: connectionId }),
    })
    if (resp.ok) onConnectionDeleted()
  }

  const EntryCard = ({ entry, onClick }: { entry: EntryNode; onClick?: () => void }) => {
    const v = VERDICT_ICONS[entry.verdict] || VERDICT_ICONS.needs_info
    return (
      <button
        onClick={onClick}
        className="w-full text-left flex items-center gap-3 p-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-primary-500/30 rounded-lg transition-all"
      >
        <span className={`text-lg ${v.color}`}>{v.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white truncate">{entry.name}</div>
          <div className="text-xs text-gray-500 truncate">{entry.category.replace(/_/g, ' ')}</div>
        </div>
        {onClick && <ArrowRight className="w-4 h-4 text-gray-600 shrink-0" />}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-cyan-400" />
            <h2 className="text-white font-semibold">Draw Connection</h2>
          </div>
          <button onClick={() => { reset(); onClose() }} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800/50">
          <div className={`px-2 py-0.5 rounded text-xs font-medium ${step === 'selectA' ? 'bg-primary-500/20 text-primary-400' : entryA ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
            1. First entry
          </div>
          <ArrowRight className="w-3 h-3 text-gray-600" />
          <div className={`px-2 py-0.5 rounded text-xs font-medium ${step === 'selectB' ? 'bg-primary-500/20 text-primary-400' : entryB ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
            2. Second entry
          </div>
          <ArrowRight className="w-3 h-3 text-gray-600" />
          <div className={`px-2 py-0.5 rounded text-xs font-medium ${step === 'annotate' ? 'bg-primary-500/20 text-primary-400' : 'bg-gray-800 text-gray-500'}`}>
            3. Annotate
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {(step === 'selectA' || step === 'selectB') && (
            <>
              <p className="text-gray-400 text-sm mb-3">
                {step === 'selectA'
                  ? 'Select the first entry to connect:'
                  : 'Now select the second entry:'}
              </p>

              {entryA && step === 'selectB' && (
                <div className="mb-3 p-2 bg-primary-500/10 border border-primary-500/20 rounded-lg">
                  <div className="text-xs text-primary-400 mb-1">Connecting from:</div>
                  <div className="text-sm text-white">{entryA.name}</div>
                </div>
              )}

              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search entries..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 mb-3 focus:outline-none focus:border-primary-500"
              />

              <div className="space-y-2">
                {filteredEntries.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-4">
                    {entries.length < 2 ? 'You need at least 2 logged entries to draw connections.' : 'No matching entries.'}
                  </p>
                )}
                {filteredEntries.slice(0, 20).map(entry => (
                  <EntryCard key={entry.id} entry={entry} onClick={() => handleSelectEntry(entry)} />
                ))}
              </div>
            </>
          )}

          {step === 'annotate' && entryA && entryB && (
            <>
              <p className="text-gray-400 text-sm mb-4">
                Describe why these entries are connected:
              </p>

              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-800/50 rounded-lg">
                <div className="flex-1 text-center">
                  <div className="text-sm text-white truncate">{entryA.name}</div>
                  <div className="text-xs text-gray-500">{entryA.category.replace(/_/g, ' ')}</div>
                </div>
                <div className="shrink-0">
                  <Link2 className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="flex-1 text-center">
                  <div className="text-sm text-white truncate">{entryB.name}</div>
                  <div className="text-xs text-gray-500">{entryB.category.replace(/_/g, ' ')}</div>
                </div>
              </div>

              <textarea
                value={annotation}
                onChange={e => setAnnotation(e.target.value)}
                placeholder="e.g., Both involve electromagnetic interference before sighting..."
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-primary-500"
                autoFocus
              />

              {error && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </>
          )}

          {/* Existing connections */}
          {step === 'selectA' && existingConnections.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-800">
              <h3 className="text-gray-400 text-xs font-medium uppercase mb-3">Your Connections ({existingConnections.length})</h3>
              <div className="space-y-2">
                {existingConnections.map(conn => {
                  const a = entries.find(e => e.id === conn.entryAId)
                  const b = entries.find(e => e.id === conn.entryBId)
                  if (!a || !b) return null
                  return (
                    <div key={conn.id} className="flex items-start gap-2 p-2 bg-gray-800/30 rounded-lg">
                      <Link2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-300">
                          <span className="text-white">{a.name}</span>
                          {' → '}
                          <span className="text-white">{b.name}</span>
                        </div>
                        {conn.annotation && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{conn.annotation}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(conn.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex items-center justify-between">
          {step !== 'selectA' && (
            <button
              onClick={() => {
                if (step === 'selectB') { setEntryA(null); setStep('selectA') }
                if (step === 'annotate') { setEntryB(null); setStep('selectB') }
              }}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Back
            </button>
          )}
          {step === 'selectA' && <div />}
          {step === 'annotate' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Connection'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
