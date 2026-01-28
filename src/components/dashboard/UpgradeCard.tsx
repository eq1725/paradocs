/**
 * UpgradeCard Component
 *
 * Displays an upgrade prompt with benefits for paid tiers.
 */

import React from 'react'
import Link from 'next/link'
import { Sparkles, Zap, ArrowRight, Check } from 'lucide-react'
import type { TierName } from '@/lib/subscription'

interface UpgradeCardProps {
  currentTier: TierName
  variant?: 'compact' | 'full'
}

const upgradeInfo: Record<TierName, {
  nextTier: TierName | null
  benefits: string[]
  price: number
  highlight: string
}> = {
  free: {
    nextTier: 'basic',
    benefits: [
      'Submit up to 25 reports/month',
      'Save up to 50 reports',
      'Email alerts for your areas',
      'Full AI Insights access'
    ],
    price: 9,
    highlight: 'Unlock AI Insights'
  },
  basic: {
    nextTier: 'pro',
    benefits: [
      'Unlimited reports',
      'API access for integrations',
      'Export data to CSV/JSON',
      'Advanced pattern analysis'
    ],
    price: 29,
    highlight: 'Go Unlimited'
  },
  pro: {
    nextTier: 'enterprise',
    benefits: [
      'Team collaboration tools',
      'Custom report templates',
      'Priority support',
      'Bulk data import'
    ],
    price: 99,
    highlight: 'For Teams'
  },
  enterprise: {
    nextTier: null,
    benefits: [],
    price: 0,
    highlight: ''
  }
}

export function UpgradeCard({ currentTier, variant = 'full' }: UpgradeCardProps) {
  const info = upgradeInfo[currentTier]

  // Don't show upgrade card for enterprise users
  if (!info.nextTier) {
    return null
  }

  if (variant === 'compact') {
    return (
      <Link
        href="/dashboard/subscription"
        className="block p-4 bg-gradient-to-r from-purple-900/50 to-indigo-900/50 rounded-lg border border-purple-700/50 hover:border-purple-600 transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/30 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-white font-medium">{info.highlight}</p>
              <p className="text-sm text-gray-400">
                Upgrade to {info.nextTier.charAt(0).toUpperCase() + info.nextTier.slice(1)}
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-purple-400 group-hover:translate-x-1 transition-transform" />
        </div>
      </Link>
    )
  }

  return (
    <div className="p-6 bg-gradient-to-br from-purple-900/30 to-indigo-900/30 rounded-xl border border-purple-700/50">
      <div className="flex items-start gap-4 mb-4">
        <div className="p-3 bg-purple-600/30 rounded-xl">
          <Zap className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{info.highlight}</h3>
          <p className="text-gray-400">
            Upgrade to {info.nextTier.charAt(0).toUpperCase() + info.nextTier.slice(1)} for ${info.price}/month
          </p>
        </div>
      </div>

      <ul className="space-y-2 mb-6">
        {info.benefits.map((benefit, index) => (
          <li key={index} className="flex items-center gap-2 text-gray-300">
            <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-sm">{benefit}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/dashboard/subscription"
        className="block w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white font-medium text-center rounded-lg transition-colors"
      >
        View Upgrade Options
      </Link>
    </div>
  )
}

export default UpgradeCard
