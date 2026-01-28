/**
 * FeatureGate Component
 *
 * Wraps content that requires a specific subscription feature.
 * Shows the content if user has access, otherwise shows an upgrade prompt.
 */

import React, { ReactNode } from 'react'
import Link from 'next/link'
import { Lock, Sparkles } from 'lucide-react'
import { useSubscription } from '@/lib/hooks/useSubscription'
import type { FeatureKey, TierName } from '@/lib/subscription'

interface FeatureGateProps {
  feature: FeatureKey
  children: ReactNode
  fallback?: ReactNode
  requiredTier?: TierName
  showLock?: boolean
  blur?: boolean
}

const featureDescriptions: Partial<Record<FeatureKey, {
  title: string
  description: string
  minTier: TierName
}>> = {
  ai_insights: {
    title: 'AI Insights',
    description: 'Get AI-powered analysis of paranormal patterns and trends.',
    minTier: 'basic'
  },
  data_export: {
    title: 'Data Export',
    description: 'Export your reports and data to CSV, JSON, or PDF formats.',
    minTier: 'pro'
  },
  api_access: {
    title: 'API Access',
    description: 'Access our API for custom integrations and automation.',
    minTier: 'pro'
  },
  alerts: {
    title: 'Alert System',
    description: 'Get notified when new reports match your criteria.',
    minTier: 'basic'
  },
  advanced_search: {
    title: 'Advanced Search',
    description: 'Use powerful filters and search operators to find reports.',
    minTier: 'basic'
  },
  custom_reports: {
    title: 'Custom Reports',
    description: 'Create custom report templates for your organization.',
    minTier: 'enterprise'
  },
  team_members: {
    title: 'Team Collaboration',
    description: 'Invite team members to collaborate on investigations.',
    minTier: 'enterprise'
  },
  analytics_dashboard: {
    title: 'Analytics Dashboard',
    description: 'View detailed analytics and statistics about your reports.',
    minTier: 'basic'
  }
}

export function FeatureGate({
  feature,
  children,
  fallback,
  requiredTier,
  showLock = true,
  blur = false
}: FeatureGateProps) {
  const { canAccess, loading, tierName } = useSubscription()

  // Show nothing while loading
  if (loading) {
    return (
      <div className="animate-pulse bg-gray-800/50 rounded-lg h-32" />
    )
  }

  // Check if user has access
  const hasAccess = canAccess(feature)

  if (hasAccess) {
    return <>{children}</>
  }

  // Show custom fallback if provided
  if (fallback) {
    return <>{fallback}</>
  }

  // Get feature info for the locked state
  const featureInfo = featureDescriptions[feature]
  const minTier = requiredTier || featureInfo?.minTier || 'basic'

  // Default locked state
  return (
    <div className="relative">
      {/* Blurred content preview */}
      {blur && (
        <div className="absolute inset-0 overflow-hidden rounded-lg">
          <div className="blur-sm opacity-30 pointer-events-none">
            {children}
          </div>
        </div>
      )}

      {/* Lock overlay */}
      <div className={`
        ${blur ? 'absolute inset-0' : ''}
        flex flex-col items-center justify-center p-8
        bg-gray-900/90 rounded-lg border border-gray-700
        text-center min-h-[200px]
      `}>
        {showLock && (
          <div className="p-4 bg-gray-800 rounded-full mb-4">
            <Lock className="w-8 h-8 text-gray-400" />
          </div>
        )}

        <h3 className="text-lg font-semibold text-white mb-2">
          {featureInfo?.title || 'Premium Feature'}
        </h3>

        <p className="text-gray-400 mb-4 max-w-md">
          {featureInfo?.description || 'This feature requires a premium subscription.'}
        </p>

        <div className="flex items-center gap-2 text-sm text-purple-400 mb-4">
          <Sparkles className="w-4 h-4" />
          <span>
            Available with {minTier.charAt(0).toUpperCase() + minTier.slice(1)} and above
          </span>
        </div>

        <Link
          href="/dashboard/subscription"
          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
        >
          Upgrade Now
        </Link>
      </div>
    </div>
  )
}

/**
 * Simple hook version for conditional rendering
 */
export function useFeatureAccess(feature: FeatureKey): {
  hasAccess: boolean
  loading: boolean
  tierName: TierName | null
} {
  const { canAccess, loading, tierName } = useSubscription()

  return {
    hasAccess: canAccess(feature),
    loading,
    tierName
  }
}

export default FeatureGate
