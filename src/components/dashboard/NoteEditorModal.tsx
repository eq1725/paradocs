'use client'

/**
 * NoteEditorModal — the unlock for rich research notes.
 *
 * Lets users edit the `user_note` field on any save — external artifacts
 * (via PATCH /api/constellation/artifacts/:id) or Paradocs-report saves
 * (via POST /api/constellation/entries, which upserts by user + report_id).
 *
 * The editor is markdown-aware with:
 *   - Live preview pane (side-by-side on desktop, tabbed on mobile)
 *   - [[Wikilink]] picker that lists existing saves when the user types `[[`
 *   - Formatting hints at the bottom (bold, italic, lists, links)
 *
 * Saving triggers onSaved so the caller can refresh the user-map payload
 * and the updated note appears in the feed.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X as XIcon, Bold, Italic, Link as LinkIcon, List as ListIcon,
  Hash, Eye, Edit3, Loader2, Check, Sparkles,
} from 'lucide-react'
import type { EntryNode } from '@/lib/constellation-types'
import { supabase } from '@/lib/supabase'
import { renderMarkdown, normalizeWikilinkKey, type WikilinkTarget } from '@/lib/markdown-lite'
import { classNames } from '@/lib/utils'

interface NoteEditorModalProps {
  /** The entry whose note is being edited */
  entry: EntryNode
  /** All user entries — used to resolve [[Wikilinks]] in the preview + picker */
  allEntries: EntryNode[]
  onClose: () => void
  /** Called after a successful save */
  onSaved: () => void
}

type ViewMode = 'write' | 'preview'

export default function NoteEditorModal({ entry, allEntries, onClose, onSaved }: NoteEditorModalProps) {
  const [note, setNote] = useState(entry.note || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('write')
  const [wikilinkSearch, setWikilinkSearch] = useState<string | null>(null) // null = picker closed

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const isExternal = !!entry.sourceType && entry.sourceType !== 'paradocs_report'
  const hasArtifactId = !!entry.artifactId
  // Paradocs-report entries currently only work if the entry has a reportId
  // (so /api/constellation/entries can upsert). External saves need artifactId.
  const canSave = isExternal ? hasArtifactId : !!entry.reportId

  // Body-scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Esc closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !wikilinkSearch) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, wikilinkSearch])

  // Wikilinks resolver map for the preview pane
  const wikilinkMap = useMemo(() => {
    const m = new Map<string, WikilinkTarget>()
    for (const e of allEntries) {
      if (!e.name || e.id === entry.id) continue
      m.set(normalizeWikilinkKey(e.name), { id: e.id, displayLabel: e.name })
    }
    return m
  }, [allEntries, entry.id])

  // When the user is inside a [[...| — trigger wikilink picker.
  // Track the cursor position each input change so we know where to insert.
  const handleNoteChange = (next: string) => {
    setNote(next)
    // Detect if the cursor is right after `[[` without a closing `]]`
    const cursor = textareaRef.current?.selectionStart ?? next.length
    const upToCursor = next.slice(0, cursor)
    const lastOpen = upToCursor.lastIndexOf('[[')
    const lastClose = upToCursor.lastIndexOf(']]')
    if (lastOpen > lastClose) {
      const partial = upToCursor.slice(lastOpen + 2)
      // Only open picker if partial is short enough to look like a query
      if (partial.length >= 0 && partial.length < 60 && !partial.includes('\n')) {
        setWikilinkSearch(partial)
        return
      }
    }
    setWikilinkSearch(null)
  }

  // Resolve wikilink picker matches
  const wikilinkMatches = useMemo(() => {
    if (wikilinkSearch === null) return []
    const q = wikilinkSearch.toLowerCase().trim()
    const entries = allEntries.filter(e => e.id !== entry.id && !e.isGhost && e.name)
    if (!q) return entries.slice(0, 6)
    return entries
      .filter(e => e.name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [wikilinkSearch, allEntries, entry.id])

  // Commit a wikilink choice into the textarea
  const insertWikilink = (title: string) => {
    const t = textareaRef.current
    if (!t) return
    const cursor = t.selectionStart ?? note.length
    const upToCursor = note.slice(0, cursor)
    const lastOpen = upToCursor.lastIndexOf('[[')
    if (lastOpen === -1) return
    // Replace from `[[` through current cursor with `[[title]]`
    const before = note.slice(0, lastOpen)
    const after = note.slice(cursor)
    const nextText = before + '[[' + title + ']]' + after
    setNote(nextText)
    setWikilinkSearch(null)
    // Re-focus and set cursor after the inserted wikilink
    setTimeout(() => {
      if (!t) return
      const newPos = (before + '[[' + title + ']]').length
      t.focus()
      t.setSelectionRange(newPos, newPos)
    }, 0)
  }

  // Toolbar actions — wrap selection with markdown syntax
  const wrapSelection = (prefix: string, suffix: string = prefix) => {
    const t = textareaRef.current
    if (!t) return
    const start = t.selectionStart ?? 0
    const end = t.selectionEnd ?? 0
    const selected = note.slice(start, end) || 'text'
    const replaced = note.slice(0, start) + prefix + selected + suffix + note.slice(end)
    setNote(replaced)
    setTimeout(() => {
      if (!t) return
      t.focus()
      t.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
    }, 0)
  }

  const handleSave = useCallback(async () => {
    if (!canSave) {
      setError(
        isExternal
          ? 'Cannot edit — this external save is missing an artifact ID.'
          : 'Cannot edit notes on this Paradocs report yet.'
      )
      return
    }
    setSaving(true); setError(null)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) throw new Error('Sign in expired — refresh and try again.')

      if (isExternal) {
        const res = await fetch('/api/constellation/artifacts/' + entry.artifactId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ user_note: note }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Save failed' }))
          throw new Error(err.error || 'Save failed')
        }
      } else {
        // Paradocs-report saves: upsert via /api/constellation/entries
        const res = await fetch('/api/constellation/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            report_id: entry.reportId,
            note,
            verdict: entry.verdict,
            tags: entry.tags || [],
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Save failed' }))
          throw new Error(err.error || 'Save failed')
        }
      }
      onSaved()
    } catch (err: any) {
      setError(err?.message || 'Something went wrong')
      setSaving(false)
    }
  }, [canSave, isExternal, entry.artifactId, entry.reportId, entry.verdict, entry.tags, note, onSaved])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-4xl bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[92vh] sm:h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-primary-600/20 flex-shrink-0">
              <Edit3 className="w-4 h-4 text-primary-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">Edit notes</h2>
              <p className="text-[10px] text-gray-500 truncate">{entry.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-800 text-gray-500 hover:text-white transition-colors flex-shrink-0"
            aria-label="Close editor"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: formatting buttons on the left, Write/Preview toggle on the right.
            The toggle replaces the old always-on split view. Gives the textarea
            the full width of the modal and lets users switch to render-preview
            only when they want to verify formatting before saving. */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-800 flex-shrink-0 overflow-x-auto scrollbar-hide">
          <ToolbarButton onClick={() => wrapSelection('**')} label="Bold" icon={Bold} disabled={viewMode === 'preview'} />
          <ToolbarButton onClick={() => wrapSelection('*')} label="Italic" icon={Italic} disabled={viewMode === 'preview'} />
          <ToolbarButton onClick={() => wrapSelection('- ', '')} label="Bullet list" icon={ListIcon} disabled={viewMode === 'preview'} />
          <ToolbarButton onClick={() => wrapSelection('## ', '')} label="Heading" icon={Hash} disabled={viewMode === 'preview'} />
          <ToolbarButton onClick={() => wrapSelection('[', '](https://)')} label="Link" icon={LinkIcon} disabled={viewMode === 'preview'} />
          <div className="w-px h-4 bg-gray-800 mx-1" />
          <ToolbarButton onClick={() => wrapSelection('[[', ']]')} label="Link to another save in your library" icon={Sparkles} disabled={viewMode === 'preview'} />

          {/* Pushes the segmented toggle to the right edge of the toolbar */}
          <div className="flex-1" />

          <div className="flex-shrink-0 inline-flex items-center rounded-md bg-white/[0.04] border border-white/10 p-0.5 text-[11px]" role="tablist" aria-label="Editor view mode">
            {(['write', 'preview'] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                role="tab"
                aria-selected={viewMode === m}
                className={classNames(
                  'flex items-center gap-1 px-2 py-1 rounded transition-colors',
                  viewMode === m ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200',
                )}
              >
                {m === 'write' ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span className="hidden sm:inline">{m === 'write' ? 'Write' : 'Preview'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Body: a single full-width pane that swaps between textarea and
            rendered preview based on viewMode. No more side-by-side. */}
        <div className="flex-1 relative overflow-hidden">
          {viewMode === 'write' ? (
            <>
              <textarea
                ref={textareaRef}
                value={note}
                onChange={e => handleNoteChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape' && wikilinkSearch !== null) {
                    e.preventDefault()
                    setWikilinkSearch(null)
                  }
                }}
                placeholder="What stood out about this source? What do you want to remember? Type [[ to link to another save."
                className="absolute inset-0 w-full h-full px-6 py-5 bg-gray-950 text-[15px] text-gray-100 placeholder-gray-600 leading-relaxed focus:outline-none resize-none"
                spellCheck
                autoFocus
              />

              {/* Wikilink picker — docks above the footer. Scoped to Write mode. */}
              {wikilinkSearch !== null && (
                <div
                  className="absolute z-10 bg-gray-950 border border-gray-800 rounded-lg shadow-2xl w-72"
                  style={{ bottom: '16px', left: '24px' }}
                >
                  <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-cyan-300" />
                    <span className="text-[11px] font-medium text-gray-300">
                      Link to a save {wikilinkSearch ? '· "' + wikilinkSearch + '"' : ''}
                    </span>
                  </div>
                  {wikilinkMatches.length === 0 ? (
                    <div className="px-3 py-4 text-[11px] text-gray-500 text-center">
                      No matching saves. Keep typing to create a placeholder link.
                    </div>
                  ) : (
                    <ul className="max-h-56 overflow-y-auto py-1">
                      {wikilinkMatches.map(m => (
                        <li key={m.id}>
                          <button
                            onClick={() => insertWikilink(m.name)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] text-gray-200 hover:bg-white/5 transition-colors"
                          >
                            <span className="truncate">{m.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 overflow-y-auto px-6 py-5">
              {note.trim() ? (
                <div className="max-w-none text-[15px] leading-relaxed">
                  {renderMarkdown(note, { wikilinks: wikilinkMap })}
                </div>
              ) : (
                <p className="text-sm text-gray-600 italic">
                  Nothing written yet — switch to Write to start your note.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-4 py-2.5 flex items-center gap-2 flex-shrink-0">
          <div className="flex-1 min-w-0 text-[10px] text-gray-600 tabular-nums">
            {note.trim()
              ? `${note.trim().split(/\s+/).length} words`
              : 'Empty'}
          </div>
          {error && (
            <div className="text-[11px] text-red-400 truncate max-w-[50%]">
              {error}
            </div>
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
            disabled={saving || !canSave}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save note'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Toolbar button helper. `disabled` dims the button and prevents clicks
// when the editor is in Preview mode (no textarea to act on).
function ToolbarButton({
  onClick,
  label,
  icon: Icon,
  disabled,
}: {
  onClick: () => void
  label: string
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent"
      title={label}
      aria-label={label}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  )
}
