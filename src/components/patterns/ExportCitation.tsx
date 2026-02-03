'use client'

import React, { useState } from 'react'
import {
  Copy,
  Check,
  FileText,
  Download,
  Quote,
  Share2,
  FileJson,
  FileSpreadsheet
} from 'lucide-react'
import { classNames } from '@/lib/utils'

interface PatternData {
  id: string
  title: string
  patternType: string
  reportCount: number
  confidence: number
  significance: number
  firstDetected: string
  lastUpdated: string
  categories: string[]
  centerPoint?: { lat: number; lng: number }
}

interface ExportCitationProps {
  pattern: PatternData
  className?: string
}

type CitationStyle = 'apa' | 'mla' | 'chicago' | 'bibtex'
type ExportFormat = 'json' | 'csv' | 'markdown'

export default function ExportCitation({ pattern, className = '' }: ExportCitationProps) {
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null)
  const [selectedStyle, setSelectedStyle] = useState<CitationStyle>('apa')

  const currentDate = new Date()
  const accessDate = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
  const year = currentDate.getFullYear()

  const generateCitation = (style: CitationStyle): string => {
    const url = `https://beta.discoverparadocs.com/insights/patterns/${pattern.id}`

    switch (style) {
      case 'apa':
        return `ParaDocs. (${year}). ${pattern.title} [Pattern ${pattern.id.slice(0, 8)}]. ParaDocs Paranormal Database. Retrieved ${accessDate}, from ${url}`

      case 'mla':
        return `"${pattern.title}." ParaDocs Paranormal Database, ${year}, ${url}. Accessed ${accessDate}.`

      case 'chicago':
        return `ParaDocs. "${pattern.title}." Pattern ${pattern.id.slice(0, 8)}. ParaDocs Paranormal Database. Accessed ${accessDate}. ${url}.`

      case 'bibtex':
        return `@misc{paradocs_${pattern.id.slice(0, 8)},
  title = {${pattern.title}},
  author = {{ParaDocs}},
  year = {${year}},
  howpublished = {\\url{${url}}},
  note = {Pattern ID: ${pattern.id}, Accessed: ${accessDate}}
}`

      default:
        return url
    }
  }

  const generateExport = (format: ExportFormat): string => {
    switch (format) {
      case 'json':
        return JSON.stringify({
          id: pattern.id,
          title: pattern.title,
          pattern_type: pattern.patternType,
          report_count: pattern.reportCount,
          confidence_score: pattern.confidence,
          significance_score: pattern.significance,
          first_detected: pattern.firstDetected,
          last_updated: pattern.lastUpdated,
          categories: pattern.categories,
          center_point: pattern.centerPoint,
          source: 'ParaDocs Paranormal Database',
          url: `https://beta.discoverparadocs.com/insights/patterns/${pattern.id}`,
          exported_at: new Date().toISOString()
        }, null, 2)

      case 'csv':
        return `id,title,pattern_type,report_count,confidence_score,significance_score,first_detected,last_updated,categories,latitude,longitude
"${pattern.id}","${pattern.title}","${pattern.patternType}",${pattern.reportCount},${pattern.confidence},${pattern.significance},"${pattern.firstDetected}","${pattern.lastUpdated}","${pattern.categories.join('; ')}",${pattern.centerPoint?.lat || ''},${pattern.centerPoint?.lng || ''}`

      case 'markdown':
        return `# ${pattern.title}

**Pattern ID:** \`${pattern.id}\`
**Type:** ${pattern.patternType.replace(/_/g, ' ')}
**Status:** Active

## Statistics
- **Report Count:** ${pattern.reportCount}
- **Confidence Score:** ${Math.round(pattern.confidence * 100)}%
- **Significance Score:** ${Math.round(pattern.significance * 100)}%

## Timeline
- **First Detected:** ${new Date(pattern.firstDetected).toLocaleDateString()}
- **Last Updated:** ${new Date(pattern.lastUpdated).toLocaleDateString()}

## Categories
${pattern.categories.map(c => `- ${c}`).join('\n')}

${pattern.centerPoint ? `## Location
- **Latitude:** ${pattern.centerPoint.lat}
- **Longitude:** ${pattern.centerPoint.lng}` : ''}

---
*Source: [ParaDocs Paranormal Database](https://beta.discoverparadocs.com/insights/patterns/${pattern.id})*
*Exported: ${new Date().toISOString()}*`

      default:
        return ''
    }
  }

  const copyToClipboard = async (text: string, format: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedFormat(format)
      setTimeout(() => setCopiedFormat(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const citationStyles: { id: CitationStyle; label: string }[] = [
    { id: 'apa', label: 'APA' },
    { id: 'mla', label: 'MLA' },
    { id: 'chicago', label: 'Chicago' },
    { id: 'bibtex', label: 'BibTeX' }
  ]

  const exportFormats: { id: ExportFormat; label: string; icon: React.ElementType; mime: string; ext: string }[] = [
    { id: 'json', label: 'JSON', icon: FileJson, mime: 'application/json', ext: 'json' },
    { id: 'csv', label: 'CSV', icon: FileSpreadsheet, mime: 'text/csv', ext: 'csv' },
    { id: 'markdown', label: 'Markdown', icon: FileText, mime: 'text/markdown', ext: 'md' }
  ]

  return (
    <div className={classNames('glass-card p-4', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="w-5 h-5 text-primary-400" />
        <h3 className="font-medium text-white">Export & Cite</h3>
      </div>

      {/* Citation Section */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Quote className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">Academic Citation</span>
        </div>

        {/* Style Selector */}
        <div className="flex gap-1 mb-2">
          {citationStyles.map(style => (
            <button
              key={style.id}
              onClick={() => setSelectedStyle(style.id)}
              className={classNames(
                'px-2 py-1 text-xs rounded transition-colors',
                selectedStyle === style.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
              )}
            >
              {style.label}
            </button>
          ))}
        </div>

        {/* Citation Text */}
        <div className="relative">
          <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-300 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {generateCitation(selectedStyle)}
          </div>
          <button
            onClick={() => copyToClipboard(generateCitation(selectedStyle), `citation-${selectedStyle}`)}
            className="absolute top-2 right-2 p-1.5 bg-gray-700/50 hover:bg-gray-700 rounded transition-colors"
            title="Copy citation"
          >
            {copiedFormat === `citation-${selectedStyle}` ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Export Section */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Download className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">Export Data</span>
        </div>

        <div className="flex gap-2">
          {exportFormats.map(format => (
            <button
              key={format.id}
              onClick={() => downloadFile(
                generateExport(format.id),
                `pattern-${pattern.id.slice(0, 8)}.${format.ext}`,
                format.mime
              )}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors text-sm text-gray-300"
            >
              <format.icon className="w-4 h-4" />
              {format.label}
            </button>
          ))}
        </div>
      </div>

      {/* Permalink */}
      <div className="mt-4 pt-4 border-t border-gray-700/50">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Permanent Link</span>
          <button
            onClick={() => copyToClipboard(
              `https://beta.discoverparadocs.com/insights/patterns/${pattern.id}`,
              'permalink'
            )}
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
          >
            {copiedFormat === 'permalink' ? (
              <>
                <Check className="w-3 h-3" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy URL
              </>
            )}
          </button>
        </div>
        <code className="block mt-1 text-xs text-gray-400 truncate">
          discoverparadocs.com/insights/patterns/{pattern.id.slice(0, 8)}...
        </code>
      </div>
    </div>
  )
}
