import React from 'react'

interface FormattedDescriptionProps {
  text: string
  className?: string
}

// Renders report description text with:
// - Clickable URLs (http/https links become anchor tags)
// - Basic markdown: **bold**, *italic*, ## headers
// - Preserves whitespace/newlines
export default function FormattedDescription({ text, className = '' }: FormattedDescriptionProps) {
  if (!text) return null

  const paragraphs = text.split(/\n\n+/)

  return (
    <div className={className}>
      {paragraphs.map((paragraph, pIdx) => {
        const trimmed = paragraph.trim()
        if (!trimmed) return null

        // Check for markdown-style headers
        const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)/)
        if (headerMatch) {
          const level = headerMatch[1].length
          const headerText = headerMatch[2]
          const Tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4'
          const sizeClass = level === 1 ? 'text-xl' : level === 2 ? 'text-lg' : 'text-base'
          return (
            <Tag key={pIdx} className={`${sizeClass} font-semibold text-white mt-6 mb-3`}>
              {formatInlineText(headerText)}
            </Tag>
          )
        }

        // Regular paragraph — split by single newlines to preserve line breaks
        const lines = trimmed.split(/\n/)
        return (
          <p key={pIdx} className="mb-4 last:mb-0">
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {formatInlineText(line)}
              </React.Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}

// Format inline text: URLs, **bold**, *italic*
function formatInlineText(text: string): React.ReactNode[] {
  // Regex that matches URLs, **bold**, or *italic*
  const pattern = /(https?:\/\/[^\s<>"')\]]+)|\*\*(.+?)\*\*|\*(.+?)\*/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[1]) {
      // URL — make it clickable
      const url = match[1].replace(/[.,;:!?)]+$/, '') // Strip trailing punctuation
      const trailingPunct = match[1].slice(url.length)
      parts.push(
        <a
          key={`${match.index}-link`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-400 hover:text-primary-300 underline underline-offset-2 break-all"
        >
          {url}
        </a>
      )
      if (trailingPunct) parts.push(trailingPunct)
    } else if (match[2]) {
      // **bold**
      parts.push(
        <strong key={`${match.index}-bold`} className="font-semibold text-white">
          {match[2]}
        </strong>
      )
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={`${match.index}-italic`} className="italic text-gray-200">
          {match[3]}
        </em>
      )
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}
