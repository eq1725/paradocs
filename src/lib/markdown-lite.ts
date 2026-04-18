/**
 * markdown-lite — Tiny markdown parser for user notes.
 *
 * Supports the subset our users actually need:
 *   - **bold** / *italic* / ***bold italic***
 *   - `inline code` and ```fenced code blocks```
 *   - [text](url) links
 *   - [[Wikilinks]] to other saved entries (resolved by caller via a map)
 *   - Headings (# through ###)
 *   - Blockquotes (>)
 *   - Unordered lists (- or *) and ordered lists (1.)
 *   - Horizontal rules (---)
 *
 * Everything else is rendered as escaped plain text.
 *
 * Output: an array of React nodes, safe to render directly. No HTML is
 * interpolated from user input — we build React elements instead, so XSS
 * is structurally prevented.
 */

import React from 'react'

// ── Types ──

export interface WikilinkTarget {
  id: string
  displayLabel: string
}

export interface ParseOptions {
  /** Map of normalized-title → entry info for resolving [[Wikilinks]]. */
  wikilinks?: Map<string, WikilinkTarget>
  /** Called when a wikilink is clicked. Receives the entry id. */
  onWikilinkClick?: (entryId: string) => void
}

// ── Public API ──

/**
 * Parse a markdown string into React nodes.
 */
export function renderMarkdown(source: string, opts: ParseOptions = {}): React.ReactNode {
  if (!source) return null
  // The Tiptap editor's markdown serializer used to escape wikilink
  // brackets (`\[\[Title\]\]`). Un-escape those back to literal `[[...]]`
  // before parsing so old notes saved with the buggy escape still render
  // as clickable wikilinks.
  const normalized = source
    .replace(/\r\n/g, '\n')
    .replace(/\\\[\\\[([\s\S]+?)\\\]\\\]/g, (_m, inner) => `[[${inner}]]`)
  const blocks = splitBlocks(normalized)
  return React.createElement(
    React.Fragment,
    null,
    ...blocks.map((block, i) => renderBlock(block, i, opts))
  )
}

/**
 * Extract every [[Wikilink target]] reference from markdown source.
 * Used by backlinks logic — "which entries does this note mention?"
 */
export function extractWikilinkTargets(source: string): string[] {
  if (!source) return []
  // Tolerate escaped-bracket legacy saves (see renderMarkdown note).
  const normalized = source.replace(/\\\[\\\[([\s\S]+?)\\\]\\\]/g, (_m, inner) => `[[${inner}]]`)
  const out: string[] = []
  const re = /\[\[([^\]]+?)\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(normalized)) !== null) {
    const label = m[1].trim()
    if (label) out.push(label)
  }
  return out
}

/** Normalize a title for wikilink resolution (lowercase, collapse whitespace). */
export function normalizeWikilinkKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * renderNotePreview — inline-only rendering for short note previews on
 * entry cards. Flattens the doc structure (headings, lists, paragraphs)
 * into a single inline flow so it fits on one clamped line without block
 * elements fighting the layout. Keeps bold/italic/code/links/wikilinks
 * so the preview reads the same as the full editor view — just smaller.
 */
export function renderNotePreview(source: string, opts: ParseOptions = {}): React.ReactNode {
  if (!source) return null
  const normalized = source
    .replace(/\r\n/g, '\n')
    .replace(/\\\[\\\[([\s\S]+?)\\\]\\\]/g, (_m, inner) => `[[${inner}]]`)
  // Take the first non-empty line(s) until a blank line, then flatten.
  // We keep enough to fill 1-2 clamped lines of card space and toss the rest.
  const firstBlock = normalized.split(/\n{2,}/)[0] || ''
  // Strip leading block markers (heading #, list -, quote >, etc.) so the
  // inline renderer isn't asked to interpret them as structural.
  const cleaned = firstBlock
    .split('\n')
    .map(l => l.replace(/^\s*(#{1,3}\s+|[-*]\s+|\d+\.\s+|>\s?)/, ''))
    .join(' ')
    .trim()
  if (!cleaned) return null
  return React.createElement(React.Fragment, null, ...renderInline(cleaned, opts))
}

// ── Block parsing ──

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; content: string }
  | { kind: 'blockquote'; content: string }
  | { kind: 'hr' }
  | { kind: 'code'; lang: string; content: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'paragraph'; content: string }
  | { kind: 'empty' }

function splitBlocks(source: string): Block[] {
  const lines = source.split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Blank
    if (/^\s*$/.test(line)) { i++; continue }

    // Heading
    const h = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (h) {
      blocks.push({ kind: 'heading', level: h[1].length as 1 | 2 | 3, content: h[2] })
      i++
      continue
    }

    // HR
    if (/^-{3,}$/.test(line.trim())) {
      blocks.push({ kind: 'hr' })
      i++
      continue
    }

    // Fenced code
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // consume closing fence
      blocks.push({ kind: 'code', lang, content: buf.join('\n') })
      continue
    }

    // Blockquote (consume consecutive > lines)
    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ kind: 'blockquote', content: buf.join('\n') })
      continue
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push({ kind: 'ul', items })
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocks.push({ kind: 'ol', items })
      continue
    }

    // Paragraph (accumulate non-blank lines as a single paragraph)
    const buf: string[] = [line]
    i++
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ kind: 'paragraph', content: buf.join(' ') })
  }
  return blocks
}

function isBlockStart(line: string): boolean {
  return (
    /^(#{1,3})\s+/.test(line) ||
    /^-{3,}$/.test(line.trim()) ||
    /^```/.test(line.trim()) ||
    /^>\s?/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line)
  )
}

// ── Block → React ──

function renderBlock(block: Block, key: number, opts: ParseOptions): React.ReactNode {
  switch (block.kind) {
    case 'heading': {
      const Tag = ('h' + block.level) as 'h1' | 'h2' | 'h3'
      const cls = block.level === 1
        ? 'text-base font-bold text-white mt-3 mb-1.5'
        : block.level === 2
          ? 'text-sm font-semibold text-white mt-3 mb-1.5'
          : 'text-xs font-semibold text-gray-200 uppercase tracking-wider mt-2 mb-1'
      return React.createElement(Tag, { key, className: cls }, renderInline(block.content, opts))
    }
    case 'blockquote':
      return React.createElement(
        'blockquote',
        { key, className: 'border-l-2 border-primary-500/40 pl-3 my-2 text-gray-400 italic' },
        renderInline(block.content, opts)
      )
    case 'hr':
      return React.createElement('hr', { key, className: 'border-gray-800 my-3' })
    case 'code':
      return React.createElement(
        'pre',
        { key, className: 'bg-black/40 border border-gray-800 rounded-md p-2 my-2 overflow-x-auto text-[11px] text-gray-300 font-mono' },
        React.createElement('code', null, block.content)
      )
    case 'ul':
      return React.createElement(
        'ul',
        { key, className: 'list-disc list-inside my-1.5 space-y-0.5 text-gray-300' },
        ...block.items.map((item, j) =>
          React.createElement('li', { key: j }, renderInline(item, opts))
        )
      )
    case 'ol':
      return React.createElement(
        'ol',
        { key, className: 'list-decimal list-inside my-1.5 space-y-0.5 text-gray-300' },
        ...block.items.map((item, j) =>
          React.createElement('li', { key: j }, renderInline(item, opts))
        )
      )
    case 'paragraph':
      return React.createElement(
        'p',
        { key, className: 'text-gray-300 text-sm leading-relaxed my-2' },
        renderInline(block.content, opts)
      )
    case 'empty':
    default:
      return null
  }
}

// ── Inline parsing ──
//
// Walks the source left-to-right, emitting React nodes. Order of precedence
// matters: we check patterns in sequence, preferring the longest / most
// specific match starting at each cursor position.

function renderInline(source: string, opts: ParseOptions): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let i = 0
  let keyCounter = 0
  let textBuf = ''

  const flushText = () => {
    if (textBuf) {
      out.push(textBuf)
      textBuf = ''
    }
  }

  while (i < source.length) {
    // [[Wikilink]]
    if (source[i] === '[' && source[i + 1] === '[') {
      const end = source.indexOf(']]', i + 2)
      if (end !== -1) {
        flushText()
        const label = source.slice(i + 2, end).trim()
        out.push(renderWikilink(label, opts, ++keyCounter))
        i = end + 2
        continue
      }
    }

    // [text](url)
    if (source[i] === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(source.slice(i))
      if (m) {
        flushText()
        out.push(
          React.createElement(
            'a',
            {
              key: ++keyCounter,
              href: m[2],
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'text-primary-400 hover:text-primary-300 underline',
            },
            m[1]
          )
        )
        i += m[0].length
        continue
      }
    }

    // ***bold italic***
    if (source.startsWith('***', i)) {
      const end = source.indexOf('***', i + 3)
      if (end !== -1) {
        flushText()
        out.push(
          React.createElement(
            'strong',
            { key: ++keyCounter, className: 'font-semibold text-white' },
            React.createElement('em', { className: 'italic' }, source.slice(i + 3, end))
          )
        )
        i = end + 3
        continue
      }
    }

    // **bold**
    if (source.startsWith('**', i)) {
      const end = source.indexOf('**', i + 2)
      if (end !== -1) {
        flushText()
        out.push(
          React.createElement(
            'strong',
            { key: ++keyCounter, className: 'font-semibold text-white' },
            source.slice(i + 2, end)
          )
        )
        i = end + 2
        continue
      }
    }

    // *italic* (but avoid matching inside words — require delimiter)
    if (source[i] === '*' && source[i + 1] !== '*' && source[i + 1] !== ' ') {
      const end = source.indexOf('*', i + 1)
      if (end !== -1 && source[end - 1] !== ' ') {
        flushText()
        out.push(
          React.createElement(
            'em',
            { key: ++keyCounter, className: 'italic text-gray-200' },
            source.slice(i + 1, end)
          )
        )
        i = end + 1
        continue
      }
    }

    // `inline code`
    if (source[i] === '`') {
      const end = source.indexOf('`', i + 1)
      if (end !== -1) {
        flushText()
        out.push(
          React.createElement(
            'code',
            {
              key: ++keyCounter,
              className: 'px-1 py-0.5 rounded bg-black/40 border border-gray-800 text-[11px] font-mono text-primary-300',
            },
            source.slice(i + 1, end)
          )
        )
        i = end + 1
        continue
      }
    }

    // Plain URL (http/https)
    const urlMatch = /^https?:\/\/[^\s<>")]+/.exec(source.slice(i))
    if (urlMatch) {
      flushText()
      out.push(
        React.createElement(
          'a',
          {
            key: ++keyCounter,
            href: urlMatch[0],
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'text-primary-400 hover:text-primary-300 underline break-all',
          },
          urlMatch[0]
        )
      )
      i += urlMatch[0].length
      continue
    }

    // Default: accumulate character
    textBuf += source[i]
    i++
  }

  flushText()
  return out
}

function renderWikilink(
  label: string,
  opts: ParseOptions,
  key: number
): React.ReactNode {
  const key_ = normalizeWikilinkKey(label)
  const target = opts.wikilinks?.get(key_)
  const displayLabel = (target?.displayLabel || label).trim()
  // Pinned to ABSOLUTE px values (not em) so the chip renders identically
  // in the editor (parent = 15px body) and the detail panel (parent = 14px
  // body). Using em-based sizing previously let the chip shrink/grow with
  // each surface's body text, which is how the two drifted visually.
  // Keep inline (not inline-flex) so the chip doesn't inflate line-height.
  const commonStyle =
    'inline align-baseline cursor-pointer transition-colors ' +
    'px-[6px] py-[1px] rounded-md font-medium text-[13px]'
  if (target) {
    return React.createElement(
      'button',
      {
        key,
        onClick: () => opts.onWikilinkClick?.(target.id),
        className:
          commonStyle +
          ' bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 ' +
          'hover:bg-cyan-500/20 hover:border-cyan-500/40 hover:text-cyan-200',
        title: 'Open ' + displayLabel,
      },
      displayLabel,
    )
  }
  // Unresolved wikilink — still visible, but flagged as broken.
  return React.createElement(
    'span',
    {
      key,
      className:
        commonStyle +
        ' bg-gray-700/30 border border-gray-600/40 text-gray-400 cursor-default',
      title: 'No save matches this wikilink yet',
    },
    displayLabel,
  )
}
