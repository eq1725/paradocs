'use client'

/**
 * CaseFileBar — horizontal scrollable row of the user's case files.
 *
 * Each chip shows the case file's cover color, title, and artifact count.
 * Tapping a chip filters the Lab list to that case file's entries. Tapping
 * the "+ New" chip at the end opens CreateCaseFileModal.
 *
 * This is the Ancestry-style "investigations" strip that gives the research
 * hub structure without requiring a full folder hierarchy.
 */

import React, { useState } from 'react'
import { Plus, FolderOpen, X as XIcon, Loader2 } from 'lucide-react'
import type { CaseFile } from '@/lib/constellation-types'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'

interface CaseFileBarProps {
  caseFiles: CaseFile[]
  selectedCaseFileId: string | null
  onSelectCaseFile: (id: string | null) => void
  /** Called after a create/delete so the parent can refetch user-map. */
  onMutate: () => void
  /** Hide the "+ New case file" chip. Use on surfaces where creation
   *  lives elsewhere (e.g. Cases tab is the canonical create surface). */
  hideCreate?: boolean
}

const COLOR_PRESETS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#ef4444', '#64748b',
]

export default function CaseFileBar({
  caseFiles,
  selectedCaseFileId,
  onSelectCaseFile,
  onMutate,
  hideCreate = false,
}: CaseFileBarProps) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <>
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 py-1">
        {/* Clear-filter chip (only when filtering) */}
        {selectedCaseFileId && (
          <button
            onClick={() => onSelectCaseFile(null)}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-gray-300 hover:bg-white/10 transition-colors"
            title="Show all saves"
          >
            <XIcon className="w-3 h-3" />
            All saves
          </button>
        )}

        {caseFiles.map(cf => {
          const active = cf.id === selectedCaseFileId
          return (
            <button
              key={cf.id}
              onClick={() => onSelectCaseFile(active ? null : cf.id)}
              className={classNames(
                'flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors whitespace-nowrap',
                active
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-white/[0.03] border-white/5 text-gray-300 hover:bg-white/[0.06] hover:text-white'
              )}
              style={active ? { boxShadow: `0 0 0 1px ${cf.cover_color}60, 0 0 10px ${cf.cover_color}40` } : undefined}
              title={cf.description || cf.title}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: cf.cover_color, boxShadow: `0 0 4px ${cf.cover_color}` }}
                aria-hidden
              />
              <span className="truncate max-w-[140px]">{cf.title}</span>
              <span className={classNames(
                'text-[10px] tabular-nums',
                active ? 'text-white/80' : 'text-gray-500'
              )}>
                {cf.artifact_count}
              </span>
            </button>
          )
        })}

        {/* + New case file (hidden on surfaces where creation belongs
            elsewhere, e.g. the Map tab — Cases tab is the canonical
            creation surface). */}
        {!hideCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-600/10 border border-primary-500/30 text-primary-300 text-[11px] font-medium hover:bg-primary-600/20 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3 h-3" />
            <span className="hidden sm:inline">New case file</span>
            <span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      {createOpen && (
        <CreateCaseFileModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            onMutate()
          }}
        />
      )}
    </>
  )
}

// ── Create modal ──

interface CreateCaseFileModalProps {
  onClose: () => void
  onCreated: () => void
}

export function CreateCaseFileModal({ onClose, onCreated }: CreateCaseFileModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverColor, setCoverColor] = useState<string>(COLOR_PRESETS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const t = title.trim()
    if (!t) { setError('Give this case file a name'); return }
    setSaving(true)
    setError(null)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) throw new Error('Sign in expired — refresh the page.')
      const res = await fetch('/api/constellation/case-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: t, description: description.trim(), cover_color: coverColor }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Create failed' }))
        throw new Error(err.error || 'Create failed')
      }
      onCreated()
    } catch (err: any) {
      setError(err?.message || 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary-600/20">
              <FolderOpen className="w-4 h-4 text-primary-400" />
            </div>
            <h2 className="text-sm font-semibold text-white">New case file</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Name
            </label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Skinwalker Ranch, Arizona Wave"
              maxLength={120}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50 transition-colors"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Description <span className="text-gray-600 normal-case">— optional</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What are you investigating in this case file?"
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">
              Cover color
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map(color => {
                const active = color === coverColor
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setCoverColor(color)}
                    className={classNames(
                      'w-9 h-9 rounded-md border transition-all',
                      active ? 'border-white/50 scale-110' : 'border-white/10 hover:border-white/30'
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={'Pick color ' + color}
                  >
                    {active && (
                      <span className="block w-2 h-2 rounded-full bg-white mx-auto" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 px-4 py-3 flex items-center justify-end gap-2">
          {error && (
            <p className="text-xs text-red-400 flex-1 min-w-0 truncate">{error}</p>
          )}
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Creating...' : 'Create case file'}
          </button>
        </div>
      </div>
    </div>
  )
}
