'use client'

/**
 * NoteEditorModal — WYSIWYG research note editor.
 *
 * Powered by Tiptap (ProseMirror). Clicking Bold toggles bold styling on
 * the current selection in place; no markdown markers visible. Storage
 * is still plain markdown in `user_note` — tiptap-markdown roundtrips
 * the doc so every non-editor surface that renders notes continues to
 * work unchanged.
 *
 * Wikilinks: users can type `[[` to open a picker of their other saves,
 * or click the sparkle toolbar button. Selected titles insert as
 * `[[Save Title]]` which persists through markdown roundtrip and
 * renders as a clickable cross-link everywhere else the note is shown.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X as XIcon, Bold, Italic, ExternalLink, List as ListIcon,
  Hash, Edit3, Loader2, Check, FolderSymlink, Sparkles,
} from 'lucide-react'
import type { EntryNode } from '@/lib/constellation-types'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'
import RichNoteEditor, { type RichNoteEditorHandle } from './RichNoteEditor'

interface NoteEditorModalProps {
  /** The entry whose note is being edited */
  entry: EntryNode
  /** All user entries — used for the wikilink picker */
  allEntries: EntryNode[]
  onClose: () => void
  /** Called after a successful save */
  onSaved: () => void
}

export default function NoteEditorModal({ entry, allEntries, onClose, onSaved }: NoteEditorModalProps) {
  const [note, setNote] = useState(entry.note || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wikilinkSearch, setWikilinkSearch] = useState<string | null>(null) // null = picker closed
  // Bumped by editor state changes so the toolbar re-renders with the
  // correct active/inactive state as the caret moves.
  const [, setTick] = useState(0)

  const editorRef = useRef<RichNoteEditorHandle | null>(null)

  const isExternal = !!entry.sourceType && entry.sourceType !== 'paradocs_report'
  const hasArtifactId = !!entry.artifactId
  const canSave = isExternal ? hasArtifactId : !!entry.reportId

  // Body-scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Esc closes (but not while the wikilink picker is open — Esc should
  // close the picker first).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (wikilinkSearch !== null) {
          setWikilinkSearch(null)
          return
        }
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, wikilinkSearch])

  // Resolve wikilink picker matches
  const wikilinkMatches = useMemo(() => {
    if (wikilinkSearch === null) return []
    const q = wikilinkSearch.toLowerCase().trim()
    const candidates = allEntries.filter(e => e.id !== entry.id && !e.isGhost && e.name)
    if (!q) return candidates.slice(0, 6)
    return candidates
      .filter(e => e.name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [wikilinkSearch, allEntries, entry.id])

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

      const noteMarkdown = editorRef.current?.getMarkdown() ?? note

      if (isExternal) {
        const res = await fetch('/api/constellation/artifacts/' + entry.artifactId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ user_note: noteMarkdown }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Save failed' }))
          throw new Error(err.error || 'Save failed')
        }
      } else {
        const res = await fetch('/api/constellation/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            report_id: entry.reportId,
            note: noteMarkdown,
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

  // Insert a wikilink into the editor at the current cursor, replacing
  // whatever partial `[[foo` the user had typed.
  const insertWikilink = (title: string) => {
    editorRef.current?.insertWikilink(title)
    setWikilinkSearch(null)
  }

  // Compute active-state for the toolbar buttons on every render; tick
  // state is bumped by the editor's selection updates to force refresh.
  const editor = editorRef.current?.getEditor() ?? null
  const isActive = (mark: string, attrs?: Record<string, any>) =>
    !!(editor && editor.isActive(mark, attrs))

  // Wire selection changes → re-render so `isActive` is fresh.
  useEffect(() => {
    if (!editor) return
    const handler = () => setTick(t => t + 1)
    editor.on('selectionUpdate', handler)
    editor.on('update', handler)
    return () => {
      editor.off('selectionUpdate', handler)
      editor.off('update', handler)
    }
  }, [editor])

  // Toolbar button commands — operate on the editor, not on markdown strings.
  const run = (fn: (e: NonNullable<typeof editor>) => void) => () => {
    if (!editor) return
    fn(editor)
  }

  const insertLink = () => {
    if (!editor) return
    const { from, to, empty } = editor.state.selection
    const previousUrl = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', previousUrl || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    if (empty && !previousUrl) {
      // No selection and no existing link — insert the URL text itself
      // and apply the link mark to it. Otherwise setLink on an empty
      // selection silently does nothing, which was #4 of Chase's QA.
      editor
        .chain()
        .focus()
        .insertContent([
          { type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] },
        ])
        .run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const wordCount = editor?.storage.characterCount?.words?.() ?? 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-4xl bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[92vh] sm:h-auto sm:max-h-[min(85vh,900px)] sm:min-h-[600px]"
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

        {/* Formatting toolbar — state-aware toggles (active state mirrors
            the current selection, like Word or Google Docs). */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-800 flex-shrink-0 overflow-x-auto scrollbar-hide">
          <ToolbarButton
            onClick={run(e => e.chain().focus().toggleBold().run())}
            label="Bold"
            icon={Bold}
            active={isActive('bold')}
          />
          <ToolbarButton
            onClick={run(e => e.chain().focus().toggleItalic().run())}
            label="Italic"
            icon={Italic}
            active={isActive('italic')}
          />
          <ToolbarButton
            onClick={run(e => e.chain().focus().toggleBulletList().run())}
            label="Bullet list"
            icon={ListIcon}
            active={isActive('bulletList')}
          />
          <ToolbarButton
            onClick={run(e => e.chain().focus().toggleHeading({ level: 2 }).run())}
            label="Heading"
            icon={Hash}
            active={isActive('heading', { level: 2 })}
          />
          <ToolbarButton
            onClick={insertLink}
            label="Insert external link"
            icon={ExternalLink}
            active={isActive('link')}
          />
          <div className="w-px h-4 bg-gray-800 mx-1" />
          <ToolbarButton
            onClick={run(e => e.chain().focus().insertContent('[[').run())}
            label="Link to another save in your library"
            icon={FolderSymlink}
          />
        </div>

        {/* Editor body */}
        <div className="flex-1 relative overflow-hidden">
          <RichNoteEditor
            ref={editorRef}
            initialMarkdown={entry.note || ''}
            onChange={setNote}
            onWikilinkQuery={setWikilinkSearch}
            placeholder="What stood out about this source? What do you want to remember? Type [[ to link to another save."
            autoFocus
          />

          {/* Wikilink picker — docks above the footer */}
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
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-4 py-2.5 flex items-center gap-2 flex-shrink-0">
          <div className="flex-1 min-w-0 text-[10px] text-gray-600 tabular-nums">
            {wordCount > 0 ? `${wordCount} word${wordCount === 1 ? '' : 's'}` : 'Empty'}
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

// Toolbar button with a Word-style active state. When `active` is true,
// the button gets a filled background so the user sees at a glance that
// the current selection already has that formatting applied.
function ToolbarButton({
  onClick,
  label,
  icon: Icon,
  active,
}: {
  onClick: () => void
  label: string
  icon: React.ComponentType<{ className?: string }>
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'w-7 h-7 flex items-center justify-center rounded-md transition-colors flex-shrink-0',
        active
          ? 'bg-primary-600/25 text-primary-200'
          : 'text-gray-400 hover:text-white hover:bg-white/5',
      )}
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  )
}
