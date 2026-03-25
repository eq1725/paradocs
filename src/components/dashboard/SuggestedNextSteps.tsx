/**
 * SuggestedNextSteps — Context-aware progression prompts.
 *
 * Analyzes the user's current state and shows the most relevant
 * next action they should take. Replaces the generic "Suggested
 * Explorations" section with something personalized.
 *
 * Priority order:
 * 1. No saved reports -> "Save your first case from the feed"
 * 2. No case files -> "Create an investigation folder"
 * 3. Case file with < 3 artifacts -> "Add more evidence to {name}"
 * 4. No constellation entries -> "Log something to your constellation"
 * 5. Free tier -> subtle upgrade prompt
 * 6. Has everything -> "Keep exploring" with category suggestions
 */

import React from 'react'
import Link from 'next/link'
import {
  Bookmark,
  FolderOpen,
  Plus,
  Star,
  ArrowRight,
  Compass,
  Zap,
} from 'lucide-react'
import type { TierName } from '@/lib/subscription'

interface SuggestedNextStepsProps {
  savedCount: number
  caseFileCount: number
  artifactCount: number
  constellationEntries: number
  tierName: TierName | null
  /** Smallest case file for the "add more evidence" prompt */
  smallestCaseFile?: { id: string; title: string; artifact_count: number } | null
}

interface StepConfig {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  title: string
  description: string
  href: string
  ctaLabel: string
}

export default function SuggestedNextSteps(props: SuggestedNextStepsProps) {
  var steps: StepConfig[] = []

  // Build context-aware steps (max 3)
  if (props.savedCount === 0) {
    steps.push({
      icon: Bookmark,
      iconColor: 'text-purple-400',
      iconBg: 'bg-purple-500/10',
      title: 'Save your first case',
      description: 'Browse the feed and bookmark reports that interest you. Build your personal research library.',
      href: '/explore',
      ctaLabel: 'Browse Cases',
    })
  }

  if (props.caseFileCount === 0 && steps.length < 3) {
    steps.push({
      icon: FolderOpen,
      iconColor: 'text-indigo-400',
      iconBg: 'bg-indigo-500/10',
      title: 'Create an investigation',
      description: 'Group related evidence into case files. Think of each one as a research folder.',
      href: '/dashboard/research-hub',
      ctaLabel: 'Open Research Hub',
    })
  }

  if (props.smallestCaseFile && props.smallestCaseFile.artifact_count < 3 && steps.length < 3) {
    steps.push({
      icon: Plus,
      iconColor: 'text-cyan-400',
      iconBg: 'bg-cyan-500/10',
      title: 'Add more evidence to ' + props.smallestCaseFile.title,
      description: props.smallestCaseFile.artifact_count + ' artifact' + (props.smallestCaseFile.artifact_count !== 1 ? 's' : '') + ' so far. Add URLs from YouTube, Reddit, or news sites to build your case.',
      href: '/dashboard/research-hub',
      ctaLabel: 'Add Evidence',
    })
  }

  if (props.constellationEntries === 0 && steps.length < 3) {
    steps.push({
      icon: Star,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
      title: 'Start your constellation',
      description: 'Log items to your constellation map to visualize connections across your research.',
      href: '/dashboard/constellation',
      ctaLabel: 'View Constellation',
    })
  }

  if (props.tierName === 'free' && steps.length < 3) {
    steps.push({
      icon: Zap,
      iconColor: 'text-yellow-400',
      iconBg: 'bg-yellow-500/10',
      title: 'Unlock AI pattern detection',
      description: 'Pro researchers get AI-powered insights that find connections across your evidence.',
      href: '/dashboard/subscription',
      ctaLabel: 'See Plans',
    })
  }

  // Fallback for active users who have done everything
  if (steps.length === 0) {
    steps.push({
      icon: Compass,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10',
      title: 'Keep exploring',
      description: 'Discover new cases, save evidence, and let the AI find patterns you might miss.',
      href: '/explore',
      ctaLabel: 'Explore',
    })
  }

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Suggested Next Steps
      </h3>
      <div className="space-y-2">
        {steps.map(function(step, i) {
          var Icon = step.icon
          return (
            <Link
              key={i}
              href={step.href}
              className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 transition-colors group"
            >
              <div className={'p-2 rounded-lg flex-shrink-0 ' + step.iconBg}>
                <Icon className={'w-4 h-4 ' + step.iconColor} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {step.title}
                </p>
                <p className="text-xs text-gray-500 line-clamp-1 sm:line-clamp-2">
                  {step.description}
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 group-hover:text-gray-400 flex-shrink-0 transition-colors">
                <span className="hidden sm:inline">{step.ctaLabel}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
