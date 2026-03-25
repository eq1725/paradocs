'use client'

import React from 'react'
import { Sparkles, Flame, Target, Crown, ArrowRight, TrendingUp, Award, Zap } from 'lucide-react'
import Link from 'next/link'
import { classNames } from '@/lib/utils'

/**
 * ConstellationProgress — Progression milestone overlay.
 *
 * Shows contextual messaging based on how many items the user
 * has logged in their constellation. Replaces generic guidance
 * with celebration of milestones and next-step prompts.
 *
 * Milestones:
 * 0-4 items   → "Start logging" prompt with CTA
 * 5-9 items   → "Your web is forming" — categories starting to emerge
 * 10-24 items → "Categories emerge" — show category breakdown
 * 25-49 items → "Clusters visible" — highlight strongest clusters
 * 50+ items   → "Full constellation" — celebration + stats
 */

export default function ConstellationProgress(props: {
  totalEntries: number
  categoriesExplored: number
  uniqueTags: number
  connectionsFound: number
  rank: string
  rankIcon: string
}) {
  var totalEntries = props.totalEntries
  var categoriesExplored = props.categoriesExplored
  var uniqueTags = props.uniqueTags
  var connectionsFound = props.connectionsFound
  var rank = props.rank
  var rankIcon = props.rankIcon

  // Determine milestone tier
  var tier = 'start'
  if (totalEntries >= 50) {
    tier = 'master'
  } else if (totalEntries >= 25) {
    tier = 'clusters'
  } else if (totalEntries >= 10) {
    tier = 'emerging'
  } else if (totalEntries >= 5) {
    tier = 'forming'
  }

  // Tier 0-4: Start logging
  function renderStartTier() {
    return (
      <div
        className={classNames(
          'bg-gradient-to-br from-purple-900/40 to-blue-900/40',
          'border border-purple-800/50',
          'rounded-xl p-4 sm:p-6',
          'backdrop-blur-sm'
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={classNames(
              'w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0',
              'border border-purple-500/30'
            )}
          >
            <Sparkles className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">Welcome to your constellation</h3>
            <p className="text-gray-400 text-sm mb-4">
              Every entry becomes a star in your night sky. Browse the reports below, find something
              intriguing, and log your verdict, notes, and thoughts.
            </p>
            <Link
              href="/explore"
              className={classNames(
                'inline-flex items-center gap-2 px-5 py-3 sm:px-4 sm:py-2 rounded-lg',
                'bg-purple-600 hover:bg-purple-700 transition-colors',
                'text-white text-sm font-medium min-h-[44px] sm:min-h-0'
              )}
            >
              Browse Reports
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Tier 5-9: Your web is forming
  function renderFormingTier() {
    return (
      <div
        className={classNames(
          'bg-gradient-to-br from-blue-900/40 to-cyan-900/40',
          'border border-blue-800/50',
          'rounded-xl p-4 sm:p-6',
          'backdrop-blur-sm'
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={classNames(
              'w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0',
              'border border-blue-500/30'
            )}
          >
            <TrendingUp className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">Your web is forming</h3>
            <p className="text-gray-400 text-sm mb-3">
              Great start! You've logged {totalEntries} entries across {categoriesExplored} categories. Keep
              exploring to reveal patterns and connections.
            </p>
            <div className="flex items-center gap-2 text-sm text-blue-300">
              <Zap className="w-4 h-4" />
              <span>Next milestone at 10 entries</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Tier 10-24: Patterns emerging
  function renderEmergingTier() {
    return (
      <div
        className={classNames(
          'bg-gradient-to-br from-green-900/40 to-emerald-900/40',
          'border border-green-800/50',
          'rounded-xl p-4 sm:p-6',
          'backdrop-blur-sm'
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={classNames(
              'w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0',
              'border border-green-500/30'
            )}
          >
            <Target className="w-6 h-6 text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">Patterns are emerging</h3>
            <p className="text-gray-400 text-sm mb-3">
              Excellent work! You've created {uniqueTags} tags and found {connectionsFound} connections. Categories
              are starting to cluster.
            </p>
            <div className="text-xs text-gray-500 mt-2">
              <span>{categoriesExplored} of 11 categories explored</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Tier 25-49: Clusters visible
  function renderClustersTier() {
    return (
      <div
        className={classNames(
          'bg-gradient-to-br from-amber-900/40 to-orange-900/40',
          'border border-amber-800/50',
          'rounded-xl p-4 sm:p-6',
          'backdrop-blur-sm'
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={classNames(
              'w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0',
              'border border-amber-500/30'
            )}
          >
            <Flame className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">Your constellation is taking shape</h3>
            <p className="text-gray-400 text-sm mb-3">
              Remarkable progress! {totalEntries} entries, {connectionsFound} connections, and {categoriesExplored}{' '}
              categories mapped. Clusters are becoming visible.
            </p>
            <div className="text-xs text-gray-500">
              <span>Current rank: {rankIcon} {rank}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Tier 50+: Master researcher
  function renderMasterTier() {
    return (
      <div
        className={classNames(
          'bg-gradient-to-br from-indigo-900/50 to-purple-900/50',
          'border border-indigo-700/50',
          'rounded-xl p-4 sm:p-6',
          'backdrop-blur-sm',
          'relative overflow-hidden'
        )}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-16 -mt-16" />
        <div className="relative flex items-start gap-4">
          <div
            className={classNames(
              'w-12 h-12 rounded-lg bg-indigo-500/30 flex items-center justify-center shrink-0',
              'border border-indigo-500/40',
              'animate-pulse'
            )}
          >
            <Crown className="w-6 h-6 text-indigo-300" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">Master researcher</h3>
            <p className="text-gray-300 text-sm mb-4">
              You've built an extraordinary constellation! {totalEntries} entries documented, {uniqueTags} tags
              created, and {connectionsFound} connections mapped across all {categoriesExplored} categories.
            </p>
            <div
              className={classNames(
                'bg-indigo-950/40 border border-indigo-800/50 rounded-lg p-3',
                'text-xs text-indigo-200 space-y-1'
              )}
            >
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-400" />
                <span>Rank: {rankIcon} {rank}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render based on tier
  var content
  if (tier === 'start') {
    content = renderStartTier()
  } else if (tier === 'forming') {
    content = renderFormingTier()
  } else if (tier === 'emerging') {
    content = renderEmergingTier()
  } else if (tier === 'clusters') {
    content = renderClustersTier()
  } else if (tier === 'master') {
    content = renderMasterTier()
  }

  return <div className="mb-6">{content}</div>
}
