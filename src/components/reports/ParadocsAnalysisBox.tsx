/**
 * ParadocsAnalysisBox Component
 *
 * Displays the Paradocs Analysis for mass-ingested reports.
 * Narrative section: Paradocs editorial voice (NOT labeled as AI).
 * Assessment sections: credibility, mundane explanations, content type, similar phenomena.
 * Purple gradient styling matches the encyclopedia phenomena page Paradocs Analysis box.
 *
 * SWC compliant: var, function(){}, string concat, no template literals in JSX, unicode escapes.
 */

import React, { useState, useMemo } from 'react'
import { Lightbulb, Shield, AlertCircle, Tag, ChevronDown, ChevronUp } from 'lucide-react'
import { classNames } from '@/lib/utils'
import Link from 'next/link'

/**
 * Narrative text highlighting for skimmer engagement.
 *
 * Strategy:
 *  - First sentence of each paragraph: brighter text (topic sentence anchor)
 *  - Parenthetical content like (3:28 AM): purple accent (specific data)
 *  - Em-dash clauses: slightly emphasized (analytical asides)
 *  - Key analytical/evidential phrases: medium weight white
 *
 * SWC compliant: var, function(){}, no arrow functions or template literals.
 */

// Phrases that signal key analytical weight — bold white
var HIGHLIGHT_PHRASES = [
  // Evidence & credibility signals
  /\b(video evidence|physical evidence|photographic evidence|radar data|multiple witnesses|secondary observer|corroborating (?:evidence|witness|testimony|data))\b/gi,
  // Analytical conclusions
  /\b(noteworthy|notably|significantly|critically|distinguishes|elevates|complicating factor|recurring (?:pattern|theme)|consistent with|inconsistent with)\b/gi,
  // Phenomenon descriptors (multi-word)
  /\b(close-proximity (?:UAP|UFO) encounter|triangular (?:configuration|formation)|geometric formation|acoustic signature|behavioral marker|structured craft|formation integrity)\b/gi,
  // Named phenomena & historical references
  /\b(Belgian wave|Rendlesham Forest|Phoenix Lights|Nimitz encounter|Tic[\s-]Tac|Hudson Valley)\b/gi,
]

// Specific measurements and data points — semibold white
var DATA_PATTERN = /\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)|\d+(?:,\d{3})*\s*(?:feet|ft|meters?|m|miles?|mi|km|mph|km\/h|knots?|seconds?|minutes?|hours?)|\d+\/100)\b/g

// Parenthetical content — purple accent for specific inline data
var PAREN_PATTERN = /(\([^)]{3,60}\))/g

/**
 * Split a paragraph into first sentence + rest.
 * Uses period+space or period+end as sentence boundary.
 */
function splitFirstSentence(text) {
  var match = text.match(/^(.+?[.!?])(\s+.+)?$/)
  if (match && match[2]) {
    return { first: match[1], rest: match[2] }
  }
  return { first: text, rest: '' }
}

/**
 * Render text with inline highlights.
 * Returns an array of React elements with strategic bold/color accents.
 */
function renderHighlightedText(text, baseClass) {
  // Build a merged pattern that captures all highlight types
  // We process in order: data points > phrases > parentheticals
  var segments = []
  var lastIndex = 0

  // Collect all matches with their positions and types
  var allMatches = []

  // Data points
  var m
  DATA_PATTERN.lastIndex = 0
  while ((m = DATA_PATTERN.exec(text)) !== null) {
    allMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0], type: 'data' })
  }

  // Highlight phrases
  for (var p = 0; p < HIGHLIGHT_PHRASES.length; p++) {
    HIGHLIGHT_PHRASES[p].lastIndex = 0
    while ((m = HIGHLIGHT_PHRASES[p].exec(text)) !== null) {
      allMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0], type: 'phrase' })
    }
  }

  // Parentheticals
  PAREN_PATTERN.lastIndex = 0
  while ((m = PAREN_PATTERN.exec(text)) !== null) {
    allMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0], type: 'paren' })
  }

  // Sort by position, remove overlaps (keep earlier/longer match)
  allMatches.sort(function(a, b) { return a.start - b.start || b.end - a.end })
  var filtered = []
  var maxEnd = 0
  for (var i = 0; i < allMatches.length; i++) {
    if (allMatches[i].start >= maxEnd) {
      filtered.push(allMatches[i])
      maxEnd = allMatches[i].end
    }
  }

  // Build segments
  for (var j = 0; j < filtered.length; j++) {
    var match = filtered[j]
    if (match.start > lastIndex) {
      segments.push(React.createElement('span', { key: 'plain-' + j }, text.substring(lastIndex, match.start)))
    }
    var cls = match.type === 'data'
      ? 'font-semibold text-white'
      : match.type === 'phrase'
        ? 'font-medium text-gray-100'
        : 'text-purple-300/90'
    segments.push(React.createElement('span', { key: 'hl-' + j, className: cls }, match.text))
    lastIndex = match.end
  }

  // Remaining text
  if (lastIndex < text.length) {
    segments.push(React.createElement('span', { key: 'tail' }, text.substring(lastIndex)))
  }

  return segments.length > 0 ? segments : [text]
}

/**
 * Render a narrative paragraph with first-sentence emphasis and inline highlights.
 */
function NarrativeParagraph(props) {
  var text = props.text
  var index = props.index
  var parts = splitFirstSentence(text)

  return React.createElement('p', {
    key: index,
    className: 'text-gray-300 leading-relaxed mb-4 last:mb-0'
  }, [
    // First sentence — brighter, slightly heavier for topic-sentence anchoring
    React.createElement('span', {
      key: 'first',
      className: 'text-gray-100'
    }, renderHighlightedText(parts.first, 'text-gray-100')),
    // Rest of paragraph — standard weight with highlights
    parts.rest ? React.createElement('span', {
      key: 'rest'
    }, renderHighlightedText(parts.rest, 'text-gray-300')) : null
  ])
}

/**
 * Render credibility reasoning with positive/negative phrase coloring.
 */
function CredibilityReasoningText(props) {
  var text = props.text
  var score = props.score

  // Highlight specific evidential phrases contextually
  var positivePatterns = /\b(strengthen|elevate|corroborat|specific|precise|consistent|attentive|careful observation)\w*\b/gi
  var negativePatterns = /\b(lack(?:s|ing)?|absence|deficit|ambiguity|complicat|insufficient|uncorroborat|disagree|discrepancy|bias|subjective)\w*\b/gi

  var segments = []
  var lastIdx = 0
  var allM = []

  positivePatterns.lastIndex = 0
  var pm
  while ((pm = positivePatterns.exec(text)) !== null) {
    allM.push({ start: pm.index, end: pm.index + pm[0].length, text: pm[0], type: 'pos' })
  }

  negativePatterns.lastIndex = 0
  while ((pm = negativePatterns.exec(text)) !== null) {
    allM.push({ start: pm.index, end: pm.index + pm[0].length, text: pm[0], type: 'neg' })
  }

  // Also highlight data points
  DATA_PATTERN.lastIndex = 0
  while ((pm = DATA_PATTERN.exec(text)) !== null) {
    allM.push({ start: pm.index, end: pm.index + pm[0].length, text: pm[0], type: 'data' })
  }

  allM.sort(function(a, b) { return a.start - b.start })
  var filt = []
  var mEnd = 0
  for (var i = 0; i < allM.length; i++) {
    if (allM[i].start >= mEnd) {
      filt.push(allM[i])
      mEnd = allM[i].end
    }
  }

  for (var j = 0; j < filt.length; j++) {
    var mt = filt[j]
    if (mt.start > lastIdx) {
      segments.push(React.createElement('span', { key: 'p-' + j }, text.substring(lastIdx, mt.start)))
    }
    var color = mt.type === 'pos'
      ? 'font-medium text-green-400/80'
      : mt.type === 'neg'
        ? 'font-medium text-yellow-400/80'
        : 'font-semibold text-white'
    segments.push(React.createElement('span', { key: 'c-' + j, className: color }, mt.text))
    lastIdx = mt.end
  }
  if (lastIdx < text.length) {
    segments.push(React.createElement('span', { key: 'ct' }, text.substring(lastIdx)))
  }

  return React.createElement('p', { className: 'text-sm text-gray-400 leading-relaxed' }, segments)
}

interface CredibilityFactor {
  name: string
  impact: 'positive' | 'negative' | 'neutral'
  description: string
}

interface MundaneExplanation {
  explanation: string
  likelihood: 'high' | 'medium' | 'low'
  reasoning: string
}

export interface ParadocsAssessment {
  credibility_score?: number
  credibility_reasoning?: string
  credibility_factors?: CredibilityFactor[]
  mundane_explanations?: MundaneExplanation[]
  content_type?: string | { suggested_type?: string; is_first_hand_account?: boolean; confidence?: string }
  is_first_hand?: boolean
  confidence?: string
  similar_phenomena?: string[]
}

interface Props {
  narrative: string | null
  assessment: ParadocsAssessment | null
  className?: string
}

export default function ParadocsAnalysisBox({ narrative, assessment, className }: Props) {
  var _a = useState({
    credibility: true,
    mundane: false,
    contentType: false,
    phenomena: false
  })
  var expandedSections = _a[0]
  var setExpandedSections = _a[1]

  function toggleSection(section: string) {
    setExpandedSections(function(prev) {
      var next = Object.assign({}, prev) as any
      next[section] = !next[section]
      return next
    })
  }

  // Graceful fallback when narrative is not yet generated
  if (!narrative && !assessment) {
    return (
      <div className={classNames('relative rounded-xl overflow-hidden mb-8', className)}>
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-indigo-900/30 to-gray-900/40 rounded-xl" />
        <div className="absolute inset-0 border border-purple-500/30 rounded-xl" />
        <div className="relative p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Paradocs Analysis</h2>
              <p className="text-xs text-purple-400 font-medium tracking-wider uppercase">
                Contextual Analysis
              </p>
            </div>
          </div>
          <p className="text-gray-400 text-sm italic">
            Analysis is being prepared for this report. Check back soon.
          </p>
        </div>
      </div>
    )
  }

  var credScore = assessment ? assessment.credibility_score : null
  var credColor = credScore != null
    ? (credScore >= 70 ? 'text-green-400' : credScore >= 40 ? 'text-yellow-400' : 'text-red-400')
    : 'text-gray-400'
  var credBgColor = credScore != null
    ? (credScore >= 70 ? 'bg-green-400' : credScore >= 40 ? 'bg-yellow-400' : 'bg-red-400')
    : 'bg-gray-400'

  return (
    <div className={classNames('relative rounded-xl overflow-hidden mb-8', className)}>
      {/* Purple gradient background — matches phenomena/[slug].tsx */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-indigo-900/30 to-gray-900/40 rounded-xl" />
      <div className="absolute inset-0 border border-purple-500/30 rounded-xl" />
      <div className="relative p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Lightbulb className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Paradocs Analysis</h2>
            <p className="text-xs text-purple-400 font-medium tracking-wider uppercase">
              Contextual Analysis
            </p>
          </div>
        </div>

        {/* Narrative — the main content with strategic highlights for skimmers. */}
        {narrative && (
          <div className="prose prose-invert prose-purple max-w-none mb-0">
            {narrative.split('\n\n').map(function(paragraph, i) {
              return React.createElement(NarrativeParagraph, { key: i, text: paragraph, index: i })
            })}
          </div>
        )}

        {/* Assessment sections — collapsible */}
        {assessment && (
          <div className="space-y-0">
            {/* Credibility Assessment */}
            {credScore != null && (
              <div className="border-t border-purple-500/20 pt-4 mt-4">
                <button
                  onClick={function() { toggleSection('credibility') }}
                  className="flex items-center justify-between w-full text-left gap-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Shield className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-white">Credibility Assessment</span>
                    <span className={classNames('text-sm font-bold', credColor)}>
                      {credScore}/100
                    </span>
                    {/* Visual bar */}
                    <div className="hidden sm:flex items-center gap-1.5 ml-1">
                      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={classNames('h-full rounded-full', credBgColor)}
                          style={{ width: credScore + '%' }}
                        />
                      </div>
                    </div>
                  </div>
                  {(expandedSections as any).credibility ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {(expandedSections as any).credibility && (
                  <div className="mt-3 pb-1 space-y-3">
                    {assessment.credibility_reasoning && (
                      React.createElement(CredibilityReasoningText, {
                        text: assessment.credibility_reasoning,
                        score: credScore
                      })
                    )}
                    {assessment.credibility_factors && assessment.credibility_factors.length > 0 && (
                      <div className="space-y-2">
                        {assessment.credibility_factors.map(function(factor, i) {
                          return (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <span className={classNames(
                                'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                                factor.impact === 'positive' ? 'bg-green-400' :
                                  factor.impact === 'negative' ? 'bg-red-400' : 'bg-gray-400'
                              )} />
                              <div>
                                <span className="text-white font-medium">{factor.name}:</span>{' '}
                                <span className="text-gray-400">{factor.description}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Mundane / Alternative Explanations */}
            {assessment.mundane_explanations && assessment.mundane_explanations.length > 0 && (
              <div className="border-t border-purple-500/20 pt-4 mt-4">
                <button
                  onClick={function() { toggleSection('mundane') }}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">Alternative Explanations</span>
                  </div>
                  {(expandedSections as any).mundane ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {(expandedSections as any).mundane && (
                  <div className="mt-3 pb-1 space-y-3">
                    {assessment.mundane_explanations.map(function(exp, i) {
                      return (
                        <div key={i} className="bg-white/5 rounded-lg p-3">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white break-words">{exp.explanation}</span>
                            <span className={classNames(
                              'text-xs px-2 py-0.5 rounded-full whitespace-nowrap',
                              exp.likelihood === 'high' ? 'bg-yellow-500/20 text-yellow-400' :
                                exp.likelihood === 'medium' ? 'bg-blue-500/20 text-blue-400' :
                                  'bg-gray-500/20 text-gray-400'
                            )}>
                              {exp.likelihood}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400 break-words">{exp.reasoning}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Content Classification */}
            {assessment.content_type && (
              <div className="border-t border-purple-500/20 pt-4 mt-4">
                <button
                  onClick={function() { toggleSection('contentType') }}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">Content Classification</span>
                  </div>
                  {(expandedSections as any).contentType ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {(expandedSections as any).contentType && (
                  <div className="mt-3 pb-1 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 rounded-full text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        {(function() {
                          var ct = assessment.content_type
                          var typeStr = typeof ct === 'string' ? ct : (ct && typeof ct === 'object' ? (ct.suggested_type || 'unknown') : 'unknown')
                          return typeStr.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase() })
                        })()}
                      </span>
                      {(assessment.is_first_hand || (typeof assessment.content_type === 'object' && assessment.content_type && assessment.content_type.is_first_hand_account)) && (
                        <span className="px-3 py-1 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                          First-hand Account
                        </span>
                      )}
                      {(assessment.confidence || (typeof assessment.content_type === 'object' && assessment.content_type && assessment.content_type.confidence)) && (
                        <span className="px-3 py-1 rounded-full text-xs bg-white/10 text-gray-400">
                          {(assessment.confidence || (typeof assessment.content_type === 'object' && assessment.content_type ? assessment.content_type.confidence : '')) + ' confidence'}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Related Phenomena */}
            {assessment.similar_phenomena && assessment.similar_phenomena.length > 0 && (
              <div className="border-t border-purple-500/20 pt-4 mt-4">
                <button
                  onClick={function() { toggleSection('phenomena') }}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">Related Phenomena</span>
                  </div>
                  {(expandedSections as any).phenomena ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {(expandedSections as any).phenomena && (
                  <div className="mt-3 pb-1 flex flex-wrap gap-2">
                    {assessment.similar_phenomena.map(function(phenomenon, i) {
                      var phenomenonSlug = phenomenon.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                      return (
                        <Link
                          key={i}
                          href={'/phenomena/' + phenomenonSlug}
                          className="px-3 py-1.5 rounded-full text-xs bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 border border-purple-500/20 hover:border-purple-500/40 transition-colors"
                        >
                          {phenomenon}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
