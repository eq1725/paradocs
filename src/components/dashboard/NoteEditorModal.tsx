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

type MobileTab = 'edit' | 'preview'

export default function NoteEditorModal({ entry, allEntries, onClose, onSaved }: NoteEditorModalProps) {
  const [note, setNote] = useState(entry.note || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>('edit')
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
        className="w-full sm:max-w-3xl bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh]"
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

        {/* Mobile edit/preview tab switcher (hidden on sm+) */}
        <div className="sm:hidden border-b border-gray-800 flex flex-shrink-0" role="tablist">
          {(['edit', 'preview'] as MobileTab[]).map(t => (
            <button
              key={t}
              onClick={() => setMobileTab(t)}
              role="tab"
              aria-selected={mobileTab === t}
              className={classNames(
                'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
                mobileTab === t
                  ? 'text-white border-b-2 border-primary-500'
                  : 'text-gray-500 hover:text-gray-300'
              )}
            >
              {t === 'edit' ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {t === 'edit' ? 'Write' : 'Preview'}
            </button>
          ))}
        </div>

        {/* Formatting toolbar */}
        <div className={classNames(
          'flex items-center gap-1 px-3 py-1.5 border-b border-gray-800 flex-shrink-0 overflow-x-auto scrollbar-hide',
          mobileTab === 'preview' && 'sm:flex hidden'
        )}>
          <ToolbarButton onClick={() => wrapSelection('**')} label="Bold" icon={Bold} />
          <ToolbarButton onClick={() => wrapSelection('*')} label="Italic" icon={Italic} />
          <ToolbarButton onClick={() => wrapSelection('- ', '')} label="List" icon={ListIcon} />
          <ToolbarButton onClick={() => wrapSelection('## ', '')} label="Heading" icon={Hash} />
          <ToolbarButton onClick={() => wrapSelection('[', '](https://)')} label="Link" icon={LinkIcon} />
          <div className="w-px h-4 bg-gray-800 mx-1" />
          <ToolbarButton onClick={() => wrapSelection('[[', ']]')} label="Wikilink — link to another save" icon={Sparkles} />
        </div>

        {/* Body: side-by-side on sm+, tabbed on mobile */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor */}
          <div className={classNames(
            'flex-1 flex flex-col',
            mobileTab === 'preview' ? 'hidden sm:flex' : 'flex'
          )}>
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
              placeholder="Write your research notes in markdown. Use **bold**, *italic*, - lists, and [[Link to another save]] to connect ideas."
              className="flex-1 w-full px-4 py-3 bg-gray-950 text-sm text-gray-200 placeholder-gray-600 font-mono leading-relaxed focus:outline-none resize-none"
              spellCheck
              autoFocus
            />

            {/* Wikilink picker popover */}
            {wikilinkSearch !== null && (
              <div className="absolute z-10 bg-gray-950 border border-gray-800 rounded-lg shadow-2xl w-64 mt-1"
                style={{
                  // Positioned near the top of the textarea; for MVP we dock
                  // it above the footer rather than at the exact cursor position.
                  bottom: '90px',
                  left: '24px',
                }}
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
          </div>

          {/* Divider (desktop only) */}
          <div className="hidden sm:block w-px bg-gray-800" />

          {/* Preview pane */}
          <div className={classNames(
            'flex-1 overflow-y-auto px-4 py-3',
            mobileTab === 'edit' ? 'hidden sm:block' : 'block'
          )}>
            {note.trim() ? (
              <div className="max-w-none">
                {renderMarkdown(note, { wikilinks: wikilinkMap })}
              </div>
            ) : (
              <div className="text-[11px] text-gray-600 italic">
                Preview appears here as you type.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <div className="flex-1 min-w-0 text-[10px] text-gray-600 truncate hidden sm:block">
            Supports **bold**, *italic*, `code`, lists, headings, [text](url) links, and [[Wikilinks]] to other saves.
          </div>
          {error && (
            <div className="text-[10px] text-red-400 truncate flex-1">
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save note'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Toolbar button helper
function ToolbarButton({
  onClick,
  label,
  icon: Icon,
}: {
  onClick: () => void
  label: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
      title={label}
      aria-label={label}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  )
}
