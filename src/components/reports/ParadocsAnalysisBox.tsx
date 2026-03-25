/**
 * ParadocsAnalysisBox Component
 *
 * Displays the Paradocs Analysis for mass-ingested reports.
 * Narrative section: Paradocs editorial voice (NOT labeled as AI).
 * Assessment sections: labeled "AI-Assisted Analysis" (credibility, mundane explanations, content type, similar phenomena).
 * Purple gradient styling matches the encyclopedia phenomena page Paradocs Analysis box.
 *
 * SWC compliant: var, function(){}, string concat, no template literals in JSX, unicode escapes.
 */

import React, { useState } from 'react'
import { Lightbulb, Shield, AlertCircle, Tag, ChevronDown, ChevronUp, Info } from 'lucide-react'
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
  content_type?: string
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

        {/* Narrative — the main content. NOT labeled as AI-generated. */}
        {narrative && (
          <div className="prose prose-invert prose-purple max-w-none mb-6">
            {narrative.split('\n\n').map(function(paragraph, i) {
              return (
                <p key={i} className="text-gray-300 leading-relaxed mb-4 last:mb-0">
                  {paragraph}
                </p>
              )
            })}
          </div>
        )}

        {/* Assessment sections — collapsible, labeled "AI-Assisted Analysis" */}
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
                  <div className="mt-3 space-y-3">
                    {assessment.credibility_reasoning && (
                      <p className="text-sm text-gray-400">{assessment.credibility_reasoning}</p>
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
                    <p className="text-[10px] text-gray-600 flex items-center gap-1 mt-2">
                      <Info className="w-3 h-3" />
                      AI-Assisted Analysis
                    </p>
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
                  <div className="mt-3 space-y-3">
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
                    <p className="text-[10px] text-gray-600 flex items-center gap-1 mt-2">
                      <Info className="w-3 h-3" />
                      AI-Assisted Analysis
                    </p>
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
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 rounded-full text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        {assessment.content_type.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase() })}
                      </span>
                      {assessment.is_first_hand && (
                        <span className="px-3 py-1 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                          First-hand Account
                        </span>
                      )}
                      {assessment.confidence && (
                        <span className="px-3 py-1 rounded-full text-xs bg-white/10 text-gray-400">
                          {assessment.confidence + ' confidence'}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-600 flex items-center gap-1 mt-2">
                      <Info className="w-3 h-3" />
                      AI-Assisted Analysis
                    </p>
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
                  <div className="mt-3 flex flex-wrap gap-2">
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
