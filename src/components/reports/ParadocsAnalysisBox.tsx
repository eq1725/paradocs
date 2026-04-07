/**
 * ParadocsAnalysisBox Component
 *
 * Displays the Paradocs editorial analysis for mass-ingested reports.
 * Two sections:
 *   1. Narrative — Paradocs editorial voice, clean readable prose
 *   2. Assessment — credibility score, factors, alternative explanations, related phenomena
 *
 * Design principles:
 *   - The narrative IS the content. No highlighting gimmicks, no pull-quotes.
 *   - First paragraph styled as a lede for scanners.
 *   - Credibility score and reasoning shown by default (most interesting to readers).
 *   - Alternative explanations and related phenomena are expandable detail.
 *   - Clean, confident typography that lets the editorial voice carry the experience.
 *
 * SWC compliant: var, function(){}, string concat, no template literals in JSX, unicode escapes.
 */

import React, { useState } from 'react'
import { Shield, Scale, Compass, ChevronDown, ChevronUp } from 'lucide-react'
import { classNames } from '@/lib/utils'
import Link from 'next/link'

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
  emotional_tone?: string
}

interface Props {
  narrative: string | null
  assessment: ParadocsAssessment | null
  className?: string
}

/**
 * Credibility score label and color
 */
function getCredibilityLabel(score: number): { label: string; color: string; bgColor: string; barColor: string } {
  if (score >= 80) return { label: 'Strong', color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', barColor: 'bg-emerald-400' }
  if (score >= 60) return { label: 'Moderate', color: 'text-sky-400', bgColor: 'bg-sky-500/15', barColor: 'bg-sky-400' }
  if (score >= 40) return { label: 'Limited', color: 'text-amber-400', bgColor: 'bg-amber-500/15', barColor: 'bg-amber-400' }
  return { label: 'Weak', color: 'text-red-400', bgColor: 'bg-red-500/15', barColor: 'bg-red-400' }
}

/**
 * Likelihood badge colors
 */
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

  var credScore = assessment ? assessment.credibility_score : null
  var credInfo = credScore != null ? getCredibilityLabel(credScore) : null

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
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
              <Compass className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Paradocs Analysis</h2>
          </div>
        </div>

        {/* ── Narrative ── */}
        {paragraphs.length > 0 && (
          <div className="px-5 pt-4 pb-2 sm:px-6">
            {/* Lede paragraph — slightly larger, brighter */}
            <p className="text-[15px] sm:text-base text-gray-200 leading-relaxed mb-4">
              {paragraphs[0]}
            </p>

            {/* Remaining paragraphs — standard body */}
            {paragraphs.slice(1).map(function(paragraph, i) {
              return (
                <p key={i} className="text-[14px] sm:text-[15px] text-gray-400 leading-relaxed mb-4 last:mb-0">
                  {paragraph}
                </p>
              )
            })}
          </div>
        )}

        {/* ── Assessment ── */}
        {assessment && (
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">

            {/* Credibility Score — always visible */}
            {credScore != null && credInfo && (
              <div className="border-t border-white/[0.06] pt-5 mt-2">
                {/* Score bar */}
                <div className="flex items-center gap-3 mb-3">
                  <Shield className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-300">Credibility</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={classNames('h-full rounded-full transition-all', credInfo.barColor)}
                      style={{ width: credScore + '%' }}
                    />
                  </div>
                  <span className={classNames('text-sm font-semibold tabular-nums', credInfo.color)}>
                    {credScore}
                  </span>
                  <span className={classNames(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    credInfo.bgColor, credInfo.color
                  )}>
                    {credInfo.label}
                  </span>
                </div>

                {/* Credibility reasoning — always visible, the most interesting part */}
                {assessment.credibility_reasoning && (
                  <p className="text-sm text-gray-400 leading-relaxed mb-3 ml-7">
                    {assessment.credibility_reasoning}
                  </p>
                )}

                {/* Credibility factors — compact inline */}
                {assessment.credibility_factors && assessment.credibility_factors.length > 0 && (
                  <div className="ml-7 space-y-1.5">
                    {assessment.credibility_factors.map(function(factor, i) {
                      return (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className={classNames(
                            'w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0',
                            factor.impact === 'positive' ? 'bg-emerald-400' :
                              factor.impact === 'negative' ? 'bg-red-400' : 'bg-gray-500'
                          )} />
                          <span className="text-gray-500">
                            <span className="text-gray-300 font-medium">{factor.name}</span>
                            {' \u2014 '}
                            {factor.description}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
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
