import React from 'react'

interface FormattedDescriptionProps {
  text: string
  className?: string
}

// Check if a line is an ALL-CAPS section header
// Must be mostly uppercase letters and look like a heading (not a sentence)
function isAllCapsHeader(line: string): boolean {
  const trimmed = line.trim()
  // Must be under 120 chars (headers shouldn't be paragraphs) and at least 3 chars
  if (trimmed.length > 120 || trimmed.length < 3) return false
  // Remove em-dashes, hyphens, and punctuation for analysis
  const cleaned = trimmed.replace(/[—\-:.,'"]/g, ' ').trim()
  const words = cleaned.split(/\s+/).filter(w => w.length > 0)
  // Single words must be at least 4 chars to be a header (avoids "A", "IT", "OK")
  if (words.length < 1) return false
  if (words.length === 1 && cleaned.length < 4) return false
  // At least 80% of alphabetic characters should be uppercase
  const letters = trimmed.replace(/[^a-zA-Z]/g, '')
  if (letters.length < 3) return false
  const upperCount = (letters.match(/[A-Z]/g) || []).length
  return upperCount / letters.length >= 0.8
}

// Convert ALL-CAPS header to title case for display
function toTitleCase(text: string): string {
  const smallWords = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'up', 'as'])
  return text
    .toLowerCase()
    .split(/(\s+|—)/)
    .map((word, i) => {
      if (word === '—' || /^\s+$/.test(word)) return word
      if (i !== 0 && smallWords.has(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join('')
}

// Generate a URL-safe slug from header text for anchor linking
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[—]/g, '-')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// Extract the first significant quoted passage from a paragraph for pull-quote treatment
// Returns the quote text and the speaker attribution if detectable
// Words that look like names (capitalized) but aren't — pronouns, articles, common words
const NOT_NAMES = new Set([
  'He', 'She', 'It', 'We', 'They', 'His', 'Her', 'Its', 'Our', 'Their',
  'The', 'This', 'That', 'These', 'Those', 'There', 'Here', 'Where', 'When',
  'One', 'Two', 'Three', 'Some', 'Many', 'Most', 'All', 'Both', 'Each',
  'According', 'However', 'Although', 'Because', 'Before', 'After', 'During',
  'Several', 'Multiple', 'Various', 'Other', 'Another', 'Such', 'What',
])

// Validate that a captured string looks like an actual person's name
function isLikelyName(candidate: string): boolean {
  if (!candidate || candidate.length < 3) return false
  // Split into words and check each
  const words = candidate.split(/\s+/)
  // First word must not be a common non-name word
  if (NOT_NAMES.has(words[0])) return false
  // First word must be at least 3 chars (no "He", "Mr" without period)
  if (words[0].length < 3) return false
  // Should not contain periods except for initials (e.g. "Dr." or "J.")
  // Should look like 1-4 proper name words
  if (words.length > 4) return false
  return true
}

// Check if quoted text looks like a title/citation rather than testimony
function looksLikeTitle(quote: string): boolean {
  // Contains a colon followed by subtitle (common in report/book titles)
  if (/^[A-Z].*:\s+[A-Z]/.test(quote)) return true
  // Mostly title-cased words with few lowercase (titles capitalize most words)
  const titleWords = quote.match(/\b[A-Z][a-z]+\b/g) || []
  const totalWords = quote.split(/\s+/).length
  if (totalWords <= 12 && titleWords.length / totalWords > 0.6) return true
  // Contains publication/reference indicators
  if (/\b(Report|Edition|Volume|Journal|Published|Press|University)\b/.test(quote)) return true
  return false
}

// Check if quote is followed by citation-like context
function looksLikeCitation(afterQuote: string): boolean {
  // Followed by year in parentheses
  if (/^\s*[,.]?\s*\(\d{4}\)/.test(afterQuote)) return true
  // Followed by "by Author" pattern
  if (/^\s*by\s+[A-Z]/.test(afterQuote)) return true
  return false
}

function extractPullQuote(text: string): { quote: string; attribution: string } | null {
  // Match quoted text that's substantial (40+ chars) — both straight and curly quotes
  const quotePattern = /["\u201C]([^"\u201D]{40,250})["\u201D]/
  const match = text.match(quotePattern)
  if (!match) return null

  const quote = match[1].trim()
  const matchIndex = match.index || 0

  // Try to find attribution near the quote
  const beforeQuote = text.slice(0, matchIndex)
  const afterQuote = text.slice(matchIndex + match[0].length)

  // Reject quotes that look like titles or citations — not testimony
  if (looksLikeTitle(quote)) return null
  if (looksLikeCitation(afterQuote)) return null

  // Attribution verbs — the word that connects a name to their quote
  const verbs = '(?:[Ss]aid|[Ss]tated|[Tt]old|[Rr]ecalled|[Nn]oted|[Ww]rote|[Tt]estified|[Rr]evealed|[Ee]xplained|[Rr]eported|[Cc]laimed|[Dd]eclared)'

  // Check for "Name verb:" pattern CLOSE to the quote (last 200 chars before it)
  const nearBefore = beforeQuote.slice(-200)
  const beforeAttr = nearBefore.match(new RegExp('([A-Z][a-z]{2,}(?:\\s[A-Z][a-z.]{1,}){0,3})\\s+' + verbs + '\\b'))
  if (beforeAttr && isLikelyName(beforeAttr[1])) {
    return { quote, attribution: beforeAttr[1] }
  }

  // Check for "verb Name" after the quote
  const afterAttr = afterQuote.match(new RegExp('^\\s*' + verbs + '\\s+([A-Z][a-z]{2,}(?:\\s[A-Z][a-z.]{1,}){0,3})'))
  if (afterAttr && isLikelyName(afterAttr[1])) {
    return { quote, attribution: afterAttr[1] }
  }

  // Check for em-dash attribution: — Name (common in formatted quotes)
  const dashAttr = afterQuote.match(/^\s*[\n]?\s*[\u2014\-]{1,2}\s*([A-Z][a-z]{2,}(?:\s[A-Z][a-z.]{1,}){0,3})/)
  if (dashAttr && isLikelyName(dashAttr[1])) {
    return { quote, attribution: dashAttr[1] }
  }

  // No attribution found — do not render as pull quote
  // Unattributed quotes are confusing to readers and often indicate
  // the quoted text is a title, reference, or contextual phrase
  return null
}

// Renders report description text with:
// - Clickable URLs (http/https links become anchor tags)
// - Basic markdown: **bold**, *italic*, ## headers
// - ALL-CAPS section headers → styled h2/h3 with anchor IDs
// - Pull quotes extracted from testimony passages
// - Preserves whitespace/newlines
export default function FormattedDescription({ text, className = '' }: FormattedDescriptionProps) {
  if (!text) return null

  const paragraphs = text.split(/\n\n+/)

  // First pass: identify which paragraphs are headers and which have pull-quote-worthy content
  // We limit pull quotes to ~1 per section to avoid visual overload
  const pullQuoteIndices = new Set<number>()
  let lastHeaderIdx = -1
  let sectionHasPullQuote = false

  paragraphs.forEach((paragraph, idx) => {
    const trimmed = paragraph.trim()
    if (!trimmed) return

    // Check if this is a section header
    if (isAllCapsHeader(trimmed) || trimmed.match(/^(#{1,3})\s+(.+)/)) {
      lastHeaderIdx = idx
      sectionHasPullQuote = false
      return
    }

    // Only add one pull quote per section, and not right after a header
    if (!sectionHasPullQuote && idx > lastHeaderIdx + 1) {
      const pq = extractPullQuote(trimmed)
      if (pq) {
        pullQuoteIndices.add(idx)
        sectionHasPullQuote = true
      }
    }
  })

  return (
    <div className={className}>
      {paragraphs.map((paragraph, pIdx) => {
        const trimmed = paragraph.trim()
        if (!trimmed) return null

        // Check for markdown-style headers (## Header)
        const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)/)
        if (headerMatch) {
          const level = headerMatch[1].length
          const headerText = headerMatch[2]
          const Tag = (level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4') as keyof JSX.IntrinsicElements
          const headerId = slugify(headerText)
          return (
            <Tag
              key={pIdx}
              id={headerId}
              className={
                level === 1
                  ? 'text-lg sm:text-xl font-semibold text-white mt-8 sm:mt-10 mb-3 sm:mb-4 pl-3 sm:pl-4 border-l-2 border-primary-500'
                  : level === 2
                  ? 'text-base sm:text-lg font-semibold text-white mt-6 sm:mt-8 mb-2.5 sm:mb-3 pl-3 sm:pl-4 border-l-2 border-primary-500/60'
                  : 'text-sm sm:text-base font-semibold text-white mt-5 sm:mt-6 mb-2.5 sm:mb-3'
              }
            >
              {formatInlineText(headerText)}
            </Tag>
          )
        }

        // Check for ALL-CAPS section headers
        if (isAllCapsHeader(trimmed)) {
          const displayText = toTitleCase(trimmed)
          const headerId = slugify(trimmed)
          return (
            <h2
              key={pIdx}
              id={headerId}
              className="text-lg sm:text-xl font-semibold text-white mt-8 sm:mt-10 mb-3 sm:mb-4 pl-3 sm:pl-4 border-l-2 border-primary-500 tracking-wide"
            >
              {displayText}
            </h2>
          )
        }

        // Check if this paragraph has a pull quote
        if (pullQuoteIndices.has(pIdx)) {
          const pq = extractPullQuote(trimmed)
          if (pq) {
            // Render the full paragraph normally, then add a styled pull quote after
            const lines = trimmed.split(/\n/)
            return (
              <React.Fragment key={pIdx}>
                <p className="mb-4">
                  {lines.map((line, lIdx) => (
                    <React.Fragment key={lIdx}>
                      {lIdx > 0 && <br />}
                      {formatInlineText(line)}
                    </React.Fragment>
                  ))}
                </p>
                <aside className="my-6 sm:my-8 mx-auto max-w-2xl" aria-label="Pull quote">
                  <blockquote className="relative px-4 sm:px-6 py-4 sm:py-5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <div
                      className="absolute top-2.5 sm:top-3 left-3 sm:left-4 text-3xl sm:text-4xl text-primary-500/30 font-serif leading-none select-none"
                      aria-hidden="true"
                    >
                      {'\u201C'}
                    </div>
                    <p className="text-base sm:text-lg text-white/90 italic leading-relaxed pl-5 sm:pl-6">
                      {pq.quote}
                    </p>
                    {pq.attribution && (
                      <footer className="mt-2 sm:mt-3 pl-5 sm:pl-6 text-xs sm:text-sm text-white/50">
                        {'\u2014 '}{pq.attribution}
                      </footer>
                    )}
                  </blockquote>
                </aside>
              </React.Fragment>
            )
          }
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
      const isInternal = url.includes('discoverparadocs.com') || url.includes('paradocs.com')
      const displayUrl = isInternal ? url.replace(/https?:\/\/(beta\.|www\.)?(discoverparadocs|paradocs)\.com/, '') : url
      parts.push(
        <a
          key={match.index + '-link'}
          href={isInternal ? displayUrl : url}
          {...(!isInternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="text-primary-400 hover:text-primary-300 underline underline-offset-2 break-all"
        >
          {url}
        </a>
      )
      if (trailingPunct) parts.push(trailingPunct)
    } else if (match[2]) {
      // **bold**
      parts.push(
        <strong key={match.index + '-bold'} className="font-semibold text-white">
          {match[2]}
        </strong>
      )
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={match.index + '-italic'} className="italic text-gray-200">
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
