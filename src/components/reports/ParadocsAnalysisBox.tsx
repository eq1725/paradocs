/**
 * ParadocsAnalysisBox Component — Hybrid Architecture
 *
 * Renders the Paradocs Analysis for mass-ingested reports.
 * New structure from single-call generation:
 *   - pull_quote: the screenshot-worthy line (hero element)
 *   - analysis: 4-6 sentence evidence-first editorial (paradocs_narrative)
 *   - credibility_signal: 1 phrase, max 8 words (replaces numeric score)
 *   - mundane_explanations: expandable alternative explanations
 *   - similar_phenomena: expandable related phenomena links
 *
 * Backward compatible: reads legacy fields (credibility_score, credibility_reasoning,
 * credibility_factors) from old reports that haven't been regenerated.
 *
 * SWC compliant: var, function(){}, string concat.
 */

import React, { useState } from 'react'
import { Shield, Scale, Compass, ChevronDown, ChevronUp } from 'lucide-react'
import { classNames } from '@/lib/utils'
import Link from 'next/link'

export interface ParadocsAssessment {
  // New hybrid fields
  pull_quote?: string
  credibility_signal?: string
  mundane_explanations?: Array<{
    explanation: string
    likelihood: 'high' | 'medium' | 'low'
    reasoning: string
  }>
  similar_phenomena?: string[]
  emotional_tone?: string
  // Legacy fields (still readable from old reports)
  credibility_score?: number
  credibility_reasoning?: string
  credibility_factors?: Array<{
    name: string
    impact: 'positive' | 'negative' | 'neutral'
    description: string
  }>
}

interface Props {
  narrative: string | null   // paradocs_narrative (analysis text)
  assessment: ParadocsAssessment | null
  className?: string
}

function getLikelihoodStyle(likelihood: string): string {
  if (likelihood === 'high') return 'bg-amber-500/15 text-amber-400 border-amber-500/25'
  if (likelihood === 'medium') return 'bg-sky-500/15 text-sky-400 border-sky-500/25'
  return 'bg-white/5 text-gray-500 border-white/10'
}

export default function ParadocsAnalysisBox({ narrative, assessment, className }: Props) {
  var _a = useState({
    explanations: false,
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

  // Graceful fallback when analysis hasn't been generated yet
  if (!narrative && !assessment) {
    return (
      <div className={classNames('relative rounded-xl overflow-hidden mb-8', className)}>
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-gray-900/40 to-gray-900/50 rounded-xl" />
        <div className="absolute inset-0 border border-purple-500/20 rounded-xl" />
        <div className="relative p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <Compass className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Paradocs Analysis</h2>
          </div>
          <p className="text-gray-500 text-sm">
            Analysis is being prepared for this report. Check back soon.
          </p>
        </div>
      </div>
    )
  }

  // Extract fields — support both new hybrid and legacy format
  var pullQuote = assessment ? assessment.pull_quote : null
  var credSignal = assessment ? assessment.credibility_signal : null

  // Legacy fallback: if no credibility_signal, build one from old score
  if (!credSignal && assessment && typeof assessment.credibility_score === 'number') {
    var score = assessment.credibility_score
    if (score >= 80) credSignal = 'Strong supporting evidence'
    else if (score >= 60) credSignal = 'Moderate supporting detail'
    else if (score >= 40) credSignal = 'Limited corroboration'
    else credSignal = 'Single unverified account'
  }

  // Split narrative into paragraphs
  var paragraphs = narrative ? narrative.split('\n\n').filter(function(p) { return p.trim().length > 0 }) : []

  return (
    <div className={classNames('relative rounded-xl overflow-hidden mb-8', className)}>
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/25 via-gray-900/40 to-gray-900/50 rounded-xl" />
      <div className="absolute inset-0 border border-purple-500/20 rounded-xl" />

      <div className="relative">
        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-0 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                <Compass className="w-4 h-4 text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Paradocs Analysis</h2>
            </div>
            {/* Credibility Signal — top right, always visible */}
            {credSignal && (
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-400 font-medium">{credSignal}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Pull Quote — the hero element ── */}
        {pullQuote && (
          <div className="mx-5 mt-4 sm:mx-6 pl-4 border-l-2 border-purple-500/40">
            <p className="text-[15px] sm:text-base text-gray-200 leading-relaxed font-medium italic">
              {pullQuote}
            </p>
          </div>
        )}

        {/* ── Analysis ── */}
        {paragraphs.length > 0 && (
          <div className="px-5 pt-4 pb-2 sm:px-6">
            {paragraphs.map(function(paragraph, i) {
              return (
                <p key={i} className={classNames(
                  'leading-relaxed mb-4 last:mb-0',
                  i === 0
                    ? 'text-[15px] sm:text-base text-gray-200'
                    : 'text-[14px] sm:text-[15px] text-gray-400'
                )}>
                  {paragraph}
                </p>
              )
            })}
          </div>
        )}

        {/* ── Expandable Sections ── */}
        {assessment && (
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">

            {/* Legacy credibility reasoning — shown for old reports that have it */}
            {!credSignal && assessment.credibility_reasoning && (
              <div className="border-t border-white/[0.06] pt-4 mt-2">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-300">Credibility</span>
                  {typeof assessment.credibility_score === 'number' && (
                    <span className="text-sm text-gray-500 font-semibold tabular-nums">
                      {assessment.credibility_score}/100
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 leading-relaxed ml-6">
                  {assessment.credibility_reasoning}
                </p>
              </div>
            )}

            {/* Alternative Explanations — expandable */}
            {assessment.mundane_explanations && assessment.mundane_explanations.length > 0 && (
              <div className="border-t border-white/[0.06] pt-4 mt-4">
                <button
                  onClick={function() { toggleSection('explanations') }}
                  className="flex items-center justify-between w-full text-left group"
                >
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                      Alternative Explanations
                    </span>
                    <span className="text-xs text-gray-600">
                      {assessment.mundane_explanations.length}
                    </span>
                  </div>
                  {(expandedSections as any).explanations ? (
                    <ChevronUp className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                  )}
                </button>

                {(expandedSections as any).explanations && (
                  <div className="mt-3 space-y-2.5 ml-6">
                    {assessment.mundane_explanations.map(function(exp, i) {
                      return (
                        <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-medium text-gray-300">{exp.explanation}</span>
                            <span className={classNames(
                              'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide border',
                              getLikelihoodStyle(exp.likelihood)
                            )}>
                              {exp.likelihood}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 leading-relaxed">{exp.reasoning}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Related Phenomena — expandable */}
            {assessment.similar_phenomena && assessment.similar_phenomena.length > 0 && (
              <div className="border-t border-white/[0.06] pt-4 mt-4">
                <button
                  onClick={function() { toggleSection('phenomena') }}
                  className="flex items-center justify-between w-full text-left group"
                >
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                      Related Phenomena
                    </span>
                    <span className="text-xs text-gray-600">
                      {assessment.similar_phenomena.length}
                    </span>
                  </div>
                  {(expandedSections as any).phenomena ? (
                    <ChevronUp className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                  )}
                </button>

                {(expandedSections as any).phenomena && (
                  <div className="mt-3 flex flex-wrap gap-2 ml-6">
                    {assessment.similar_phenomena.map(function(phenomenon, i) {
                      var phenomenonSlug = phenomenon.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                      return (
                        <Link
                          key={i}
                          href={'/phenomena/' + phenomenonSlug}
                          className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-purple-300 bg-white/[0.03] hover:bg-purple-500/10 border border-white/[0.06] hover:border-purple-500/20 transition-all"
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
