import { useState, useEffect } from 'react'
import { List, ChevronDown, ChevronUp } from 'lucide-react'

interface TOCItem {
  id: string
  text: string
  level: number
}

interface ArticleTableOfContentsProps {
  description: string
}

// Check if a line is an ALL-CAPS section header (mirrors FormattedDescription logic)
function isAllCapsHeader(line: string): boolean {
  var trimmed = line.trim()
  if (trimmed.length > 120 || trimmed.length < 3) return false
  var cleaned = trimmed.replace(/[—\-:.,'"]/g, ' ').trim()
  var words = cleaned.split(/\s+/).filter(function (w) { return w.length > 0 })
  if (words.length < 1) return false
  if (words.length === 1 && cleaned.length < 4) return false
  var letters = trimmed.replace(/[^a-zA-Z]/g, '')
  if (letters.length < 3) return false
  var upperCount = (letters.match(/[A-Z]/g) || []).length
  return upperCount / letters.length >= 0.8
}

function toTitleCase(text: string): string {
  var smallWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'up', 'as']
  return text
    .toLowerCase()
    .split(/(\s+|—)/)
    .map(function (word, i) {
      if (word === '—' || /^\s+$/.test(word)) return word
      if (i !== 0 && smallWords.indexOf(word) !== -1) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join('')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[—]/g, '-')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// Extract TOC items from report description text
function extractTOCItems(text: string): TOCItem[] {
  if (!text) return []

  var paragraphs = text.split(/\n\n+/)
  var items: TOCItem[] = []

  paragraphs.forEach(function (paragraph) {
    var trimmed = paragraph.trim()
    if (!trimmed) return

    // Markdown-style headers
    var headerMatch = trimmed.match(/^(#{1,3})\s+(.+)/)
    if (headerMatch) {
      items.push({
        id: slugify(headerMatch[2]),
        text: headerMatch[2],
        level: headerMatch[1].length
      })
      return
    }

    // ALL-CAPS headers
    if (isAllCapsHeader(trimmed)) {
      items.push({
        id: slugify(trimmed),
        text: toTitleCase(trimmed),
        level: 1
      })
    }
  })

  return items
}

export default function ArticleTableOfContents({ description }: ArticleTableOfContentsProps) {
  var items = extractTOCItems(description)
  var [activeId, setActiveId] = useState('')
  var [isExpanded, setIsExpanded] = useState(false)

  // useEffect MUST be called before any conditional return (Rules of Hooks)
  useEffect(function () {
    if (items.length < 3) return // No sections to observe
    // Track which section is currently in view
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '-20% 0px -60% 0px' }
    )

    items.forEach(function (item) {
      var el = document.getElementById(item.id)
      if (el) observer.observe(el)
    })

    return function () { observer.disconnect() }
  }, [items.length])

  // Don't render if fewer than 3 sections — AFTER all hooks
  if (items.length < 3) return null

  function handleClick(id: string) {
    var el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Offset for sticky header
      setTimeout(function () {
        window.scrollBy({ top: -80, behavior: 'smooth' })
      }, 300)
    }
  }

  // Show first 4 items by default on desktop, all when expanded
  var visibleItems = isExpanded ? items : items.slice(0, 4)
  var hasMore = items.length > 4

  return (
    <nav className="mb-4 sm:mb-6 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 sm:p-4" aria-label="Table of contents">
      <div className="flex items-center gap-2 mb-2.5 sm:mb-3">
        <List className="w-4 h-4 text-primary-400" />
        <span className="text-xs sm:text-sm font-medium text-white/70">In This Report</span>
        <span className="text-xs text-white/30 ml-auto">{items.length} sections</span>
      </div>
      <ol className="space-y-1">
        {visibleItems.map(function (item, idx) {
          var isActive = item.id === activeId
          return (
            <li key={item.id}>
              <button
                onClick={function () { handleClick(item.id) }}
                className={
                  'w-full text-left px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm transition-colors ' +
                  (item.level > 1 ? 'pl-5 sm:pl-6 ' : '') +
                  (isActive
                    ? 'text-primary-400 bg-primary-500/10'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]')
                }
              >
                <span className="text-white/20 mr-2 text-xs tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
                {item.text}
              </button>
            </li>
          )
        })}
      </ol>
      {hasMore && (
        <button
          onClick={function () { setIsExpanded(!isExpanded) }}
          className="flex items-center gap-1 mt-2 px-3 py-1 text-xs text-white/40 hover:text-white/60 transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              {items.length - 4} more sections
            </>
          )}
        </button>
      )}
    </nav>
  )
}
