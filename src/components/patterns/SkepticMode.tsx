'use client'

import React, { useState } from 'react'
import {
  Scale,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Eye,
  EyeOff
} from 'lucide-react'
import { classNames } from '@/lib/utils'
import type { AlternativeHypothesis } from '@/lib/services/pattern-scoring.service'

interface SkepticModeProps {
  hypotheses: AlternativeHypothesis[]
  className?: string
}

export default function SkepticMode({ hypotheses, className = '' }: SkepticModeProps) {
  const [isEnabled, setIsEnabled] = useState(false)
  const [expandedHypothesis, setExpandedHypothesis] = useState<string | null>(null)

  const getPlausibilityColor = (score: number) => {
    if (score >= 0.7) return 'text-red-400 bg-red-500/20'
    if (score >= 0.5) return 'text-amber-400 bg-amber-500/20'
    if (score >= 0.3) return 'text-yellow-400 bg-yellow-500/20'
    return 'text-green-400 bg-green-500/20'
  }

  const getPlausibilityLabel = (score: number) => {
    if (score >= 0.7) return 'Highly Plausible'
    if (score >= 0.5) return 'Moderately Plausible'
    if (score >= 0.3) return 'Somewhat Plausible'
    return 'Less Plausible'
  }

  return (
    <div className={classNames('glass-card overflow-hidden', className)}>
      {/* Toggle Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={classNames(
            'w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
            isEnabled ? 'bg-purple-500/20' : 'bg-gray-700/50'
          )}>
            <Scale className={classNames(
              'w-5 h-5 transition-colors',
              isEnabled ? 'text-purple-400' : 'text-gray-400'
            )} />
          </div>
          <div>
            <h3 className="font-medium text-white">Skeptic Mode</h3>
            <p className="text-sm text-gray-400">
              {isEnabled ? 'Viewing alternative explanations' : 'Consider mundane explanations'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsEnabled(!isEnabled)}
          className={classNames(
            'relative w-14 h-7 rounded-full transition-colors',
            isEnabled ? 'bg-purple-600' : 'bg-gray-700'
          )}
        >
          <span
            className={classNames(
              'absolute top-1 w-5 h-5 rounded-full bg-white transition-transform flex items-center justify-center',
              isEnabled ? 'translate-x-8' : 'translate-x-1'
            )}
          >
            {isEnabled ? (
              <Eye className="w-3 h-3 text-purple-600" />
            ) : (
              <EyeOff className="w-3 h-3 text-gray-400" />
            )}
          </span>
        </button>
      </div>

      {/* Hypotheses List */}
      {isEnabled && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-700/50 pt-4">
          <p className="text-xs text-gray-500 mb-3">
            Before concluding this is anomalous, consider these alternative explanations ranked by plausibility:
          </p>

          {hypotheses.map((hypothesis) => (
            <div
              key={hypothesis.id}
              className="border border-gray-700/50 rounded-lg overflow-hidden"
            >
              {/* Hypothesis Header */}
              <button
                onClick={() => setExpandedHypothesis(
                  expandedHypothesis === hypothesis.id ? null : hypothesis.id
                )}
                className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={classNames(
                    'px-2 py-1 rounded text-xs font-medium',
                    getPlausibilityColor(hypothesis.plausibilityScore)
                  )}>
                    {Math.round(hypothesis.plausibilityScore * 100)}%
                  </span>
                  <div className="text-left">
                    <h4 className="text-sm font-medium text-white">{hypothesis.name}</h4>
                    <p className="text-xs text-gray-400">
                      {getPlausibilityLabel(hypothesis.plausibilityScore)}
                    </p>
                  </div>
                </div>
                {expandedHypothesis === hypothesis.id ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {/* Expanded Content */}
              {expandedHypothesis === hypothesis.id && (
                <div className="px-3 pb-3 space-y-3 border-t border-gray-700/30">
                  <p className="text-sm text-gray-300 pt-3">
                    {hypothesis.description}
                  </p>

                  {/* Evidence For */}
                  <div className="p-2 bg-red-500/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <ThumbsUp className="w-3 h-3 text-red-400" />
                      <span className="text-xs text-red-400 font-medium">
                        Evidence Supporting This Explanation
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {hypothesis.evidenceFor.map((evidence, i) => (
                        <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                          <span className="text-red-400">•</span>
                          <span>{evidence}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Evidence Against */}
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <ThumbsDown className="w-3 h-3 text-green-400" />
                      <span className="text-xs text-green-400 font-medium">
                        Evidence Against This Explanation
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {hypothesis.evidenceAgainst.map((evidence, i) => (
                        <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                          <span className="text-green-400">•</span>
                          <span>{evidence}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Disclaimer */}
          <div className="flex items-start gap-2 p-3 bg-gray-800/50 rounded-lg mt-3">
            <HelpCircle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400">
              Plausibility scores are estimates based on general research principles
              and may not reflect specific circumstances of this pattern.
              Researchers should evaluate evidence independently.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
