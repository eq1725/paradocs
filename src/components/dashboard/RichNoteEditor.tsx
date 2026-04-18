'use client'

/**
 * RichNoteEditor — Tiptap-based WYSIWYG editor for research notes.
 *
 * Storage remains plain markdown (the `user_note` TEXT column is unchanged).
 * We use `tiptap-markdown` to roundtrip markdown <-> Tiptap's internal doc
 * model, so every other surface that renders notes (NodeDetailPanel's
 * preview, the backlinks panel, the digest email, markdown-lite.ts)
 * continues to work without modification.
 *
 * Click Bold → selection renders bold in-place. No asterisks visible.
 * No Write/Preview toggle. Behaves like Word/Notion, not a markdown IDE.
 *
 * Wikilinks (`[[title]]`) are preserved in markdown roundtrip. While
 * typing, a picker popover still opens when the user types `[[` — handled
 * by the parent (it watches `onWikilinkQuery` and calls `insertWikilink`
 * through the ref-exposed imperative API).
 */

import React, { forwardRef, useEffect, useImperativeHandle } from 'react'
import { useEditor, EditorContent, Extension, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { Markdown } from 'tiptap-markdown'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * tiptap-markdown escapes `[` and `]` as `\[` and `\]` because they're
 * markdown special characters. That corrupts our `[[Wikilink]]` syntax —
 * stored markdown ends up looking like `\[\[Title\]\]`, which
 * markdown-lite (used everywhere else to render notes) doesn't recognize
 * as a wikilink. Strip those specific escape sequences back out on read.
 *
 * We're careful to only unescape the `[[...]]` pattern; other escaped
 * brackets (e.g. inside `\[not a link\]`) stay escaped.
 */
function unescapeWikilinks(md: string): string {
  // Match \[\[ ... \]\] and strip the backslashes inside the wrapper.
  return md.replace(/\\\[\\\[([\s\S]+?)\\\]\\\]/g, (_m, inner) => `[[${inner}]]`)
}

function getMarkdownSafe(editor: Editor | null): string {
  if (!editor) return ''
  const raw = (editor.storage as any)?.markdown?.getMarkdown?.() ?? ''
  return unescapeWikilinks(raw)
}

/**
 * WikilinkDecorationExtension — paints a chip-like visual treatment over
 * any `[[Title]]` tokens in the editor, without touching the underlying
 * doc. The text itself remains plain markdown characters so it still
 * roundtrips cleanly through tiptap-markdown; the decoration is a pure
 * view-layer overlay.
 *
 * Clicking the decoration emits a window event the parent can listen for
 * to navigate to the linked save.
 */
const WIKILINK_REGEX = /\[\[([^\[\]\n]+?)\]\]/g
const wikilinkPluginKey = new PluginKey('paradocs-wikilink-deco')

const WikilinkDecorationExtension = Extension.create({
  name: 'wikilinkDecoration',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: wikilinkPluginKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              const text = node.text
              let m: RegExpExecArray | null
              WIKILINK_REGEX.lastIndex = 0
              while ((m = WIKILINK_REGEX.exec(text)) !== null) {
                const from = pos + m.index
                const to = from + m[0].length
                decorations.push(
                  Decoration.inline(from, to, {
                    class: 'paradocs-wikilink-chip',
                    'data-wikilink-title': m[1],
                  }),
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

export interface RichNoteEditorHandle {
  /** Focus the editor surface */
  focus: () => void
  /** Current markdown representation of the doc */
  getMarkdown: () => string
  /** Replace the entire doc with new markdown content */
  setMarkdown: (md: string) => void
  /** Insert a wikilink token at the cursor position. Replaces any
   *  preceding `[[partial` typed before the picker opened. */
  insertWikilink: (title: string) => void
  /** The underlying editor — exposed so the toolbar can run commands */
  getEditor: () => Editor | null
}

interface RichNoteEditorProps {
  /** Initial markdown content (may include [[wikilinks]]) */
  initialMarkdown: string
  /** Fires whenever the doc changes — passes the markdown representation */
  onChange: (markdown: string) => void
  /** Placeholder shown when the editor is empty */
  placeholder?: string
  /**
   * Called every time the caret sits just after `[[` with no closing `]]`.
   * Passes the partial query string the user has typed so far (may be ''
   * when they've just opened the brackets). Pass `null` when the trigger
   * is no longer active.
   */
  onWikilinkQuery?: (query: string | null) => void
  /** Auto-focus the editor on mount */
  autoFocus?: boolean
}

const RichNoteEditor = forwardRef<RichNoteEditorHandle, RichNoteEditorProps>(function RichNoteEditor(
  { initialMarkdown, onChange, placeholder, onWikilinkQuery, autoFocus },
  ref,
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Keep the starter kit minimal — we don't need code blocks / horizontal rules
        // for short research notes. Users can paste them if needed; they'll roundtrip.
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-primary-300 underline underline-offset-2 hover:text-primary-200',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || '',
        emptyEditorClass: 'is-editor-empty',
      }),
      CharacterCount.configure(),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-',
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      WikilinkDecorationExtension,
    ],
    content: initialMarkdown || '',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class:
          'paradocs-rich-editor focus:outline-none min-h-full px-6 py-5 text-[15px] leading-relaxed text-gray-100',
        spellcheck: 'true',
      },
    },
    onUpdate({ editor }) {
      const md = getMarkdownSafe(editor)
      onChange(md)
      // Detect wikilink trigger — look at the 32 chars before the cursor
      // and see if there's an unclosed `[[`.
      if (!onWikilinkQuery) return
      const { from } = editor.state.selection
      const start = Math.max(0, from - 64)
      const textBefore = editor.state.doc.textBetween(start, from, '\n', '\n')
      const lastOpen = textBefore.lastIndexOf('[[')
      const lastClose = textBefore.lastIndexOf(']]')
      if (lastOpen > lastClose) {
        const partial = textBefore.slice(lastOpen + 2)
        if (partial.length < 60 && !partial.includes('\n')) {
          onWikilinkQuery(partial)
          return
        }
      }
      onWikilinkQuery(null)
    },
    onSelectionUpdate({ editor }) {
      // Also re-check trigger on pure caret moves so the picker closes when
      // the user arrow-keys away from the `[[` without typing.
      if (!onWikilinkQuery) return
      const { from } = editor.state.selection
      const start = Math.max(0, from - 64)
      const textBefore = editor.state.doc.textBetween(start, from, '\n', '\n')
      const lastOpen = textBefore.lastIndexOf('[[')
      const lastClose = textBefore.lastIndexOf(']]')
      if (lastOpen > lastClose) {
        const partial = textBefore.slice(lastOpen + 2)
        if (partial.length < 60 && !partial.includes('\n')) {
          onWikilinkQuery(partial)
          return
        }
      }
      onWikilinkQuery(null)
    },
    // SSR-safe: Tiptap needs a browser DOM to boot up.
    immediatelyRender: false,
  })

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus(),
      getMarkdown: () => getMarkdownSafe(editor ?? null),
      setMarkdown: (md: string) => editor?.commands.setContent(md || '', { emitUpdate: true }),
      insertWikilink: (title: string) => {
        if (!editor) return
        const { from } = editor.state.selection
        const start = Math.max(0, from - 64)
        const textBefore = editor.state.doc.textBetween(start, from, '\n', '\n')
        const lastOpen = textBefore.lastIndexOf('[[')
        if (lastOpen === -1) {
          // No open bracket found — just insert fresh at cursor.
          editor.chain().focus().insertContent('[[' + title + ']]').run()
          return
        }
        // Replace from the `[[` position through the cursor with a clean
        // `[[title]]` token. Calculate the absolute positions.
        const absOpenFrom = from - (textBefore.length - lastOpen)
        editor
          .chain()
          .focus()
          .deleteRange({ from: absOpenFrom, to: from })
          .insertContent('[[' + title + ']]')
          .run()
      },
      getEditor: () => editor,
    }),
    [editor],
  )

  // Sync prop changes back into the editor (e.g. if parent resets content)
  useEffect(() => {
    if (!editor) return
    const current = getMarkdownSafe(editor)
    if (current === initialMarkdown) return
    // Only replace if the parent truly changed the source — avoids caret
    // resets while the user is typing.
    editor.commands.setContent(initialMarkdown || '', { emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMarkdown, editor])

  // wordCount is read directly by the parent via ref.getEditor() — we
  // expose it here as a data attribute for any non-ref consumers. Computed
  // on every render, which is fine since Tiptap's CharacterCount extension
  // only runs when content changes.
  const wordCount =
    (editor?.storage as any)?.characterCount?.words?.() ?? 0

  // Styles for the ProseMirror surface + wikilink chip live in
  // src/styles/globals.css under the `.paradocs-rich-editor` scope.
  // They can't live inline via styled-jsx because CSS comments with
  // literal backticks collide with the template-literal wrapper.
  return (
    <>
      <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
      <span data-word-count={wordCount} hidden />
    </>
  )
})

export default RichNoteEditor
