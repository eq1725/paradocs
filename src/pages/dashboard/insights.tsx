/**
 * AI Insights Dashboard Page
 *
 * Shows personalized AI insights based on user's reports and saved items.
 * Feature-gated for Basic tier and above.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  MapPin,
  Calendar,
  AlertCircle,
  ArrowRight,
  Lightbulb,
  BarChart3,
  Clock,
  Settings,
  Star,
  Users,
  Flame
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { FeatureGate } from '@/components/dashboard/FeatureGate'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { usePersonalization } from '@/lib/hooks/usePersonalization'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

interface PatternSummary {
  id: string
  pattern_type: string
  ai_title: string
  ai_summary: string
  report_count: number
  significance_score: number
  status: string
  created_at: string
}

interface InsightCard {
  id: string
  type: 'pattern' | 'trend' | 'recommendation'
  title: string
  description: string
  icon: React.ElementType
  link?: string
  data?: any
}

function InsightCardComponent({ insight }: { insight: InsightCard }) {
  const Icon = insight.icon

  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-purple-900/30 rounded-lg flex-shrink-0">
          <Icon className="w-6 h-6 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white mb-2">
            {insight.title}
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            {insight.description}
          </p>
          {insight.link && (
            <Link
              href={insight.link}
              className="inline-flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition-colors"
            >
              Learn More
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function PatternCard({ pattern }: { pattern: PatternSummary }) {
  const typeIcons: Record<string, React.ElementType> = {
    geographic_cluster: MapPin,
    temporal_anomaly: Clock,
    flap_wave: TrendingUp,
    characteristic_correlation: BarChart3,
    seasonal_pattern: Calendar
  }

  const Icon = typeIcons[pattern.pattern_type] || Sparkles

  const formatType = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  return (
    <Link
      href={`/insights/patterns/${pattern.id}`}
      className="block p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-purple-700 transition-colors group"
    >
      <div className="flex items-start gap-4">
        <div className="p-3 bg-purple-900/30 rounded-lg flex-shrink-0 group-hover:bg-purple-900/50 transition-colors">
          <Icon className="w-6 h-6 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-purple-400 font-medium">
              {formatType(pattern.pattern_type)}
            </span>
            <span className="text-xs text-gray-600">•</span>
            <span className="text-xs text-gray-500">
              {pattern.report_count} reports
            </span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-purple-300 transition-colors">
            {pattern.ai_title || `Pattern #${pattern.id.slice(0, 8)}`}
          </h3>
          <p className="text-gray-400 text-sm line-clamp-2">
            {pattern.ai_summary || 'AI analysis pending...'}
          </p>
        </div>
        <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-purple-400 transition-colors flex-shrink-0" />
      </div>
    </Link>
  )
}

export default function InsightsPage() {
  const router = useRouter()
  const { canAccess, tierName, loading: subscriptionLoading } = useSubscription()
  const {
    data: personalization,
    insights,
    loading: personalizationLoading,
    refreshInsights
  } = usePersonalization()
  const [patterns, setPatterns] = useState<PatternSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          router.push('/login')
          return
        }

        // Fetch recent patterns
        const response = await fetch('/api/patterns/trending')
        if (response.ok) {
          const data = await response.json()
          setPatterns(data.patterns || [])
        }

        // Fetch personalized insights
        refreshInsights()
      } catch (err) {
        console.error('Error fetching insights:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchInsights()
  }, [router, refreshInsights])

  // Generate personalized insights based on user preferences
  const generatePersonalizedInsights = (): InsightCard[] => {
    const cards: InsightCard[] = []

    // If user hasn't set up location, show setup prompt
    if (!insights?.hasLocation) {
      cards.push({
        id: 'setup-location',
        type: 'recommendation',
        title: 'Set Up Location',
        description: 'Share your location to see paranormal activity and patterns near you. Your location is never shared publicly.',
        icon: MapPin,
        link: '/dashboard/settings'
      })
    } else if (insights?.activityMetrics) {
      // Show real activity metrics based on user's location
      const { percent_change, trending_direction, current_count } = insights.activityMetrics
      const { city, state, radius } = insights.location!

      const TrendIcon = trending_direction === 'increasing' ? TrendingUp :
                        trending_direction === 'decreasing' ? TrendingDown : BarChart3

      const trendText = trending_direction === 'increasing' ? 'increase' :
                        trending_direction === 'decreasing' ? 'decrease' : 'stable activity'

      cards.push({
        id: 'local-activity',
        type: 'trend',
        title: trending_direction === 'stable'
          ? 'Stable Activity in Your Area'
          : `${trending_direction === 'increasing' ? 'Increasing' : 'Decreasing'} Activity Near You`,
        description: current_count === 0
          ? `No paranormal reports within ${radius} miles of ${city}, ${state} in the past month. Be the first to document something!`
          : `There has been a ${Math.abs(percent_change)}% ${trendText} in paranormal reports within ${radius} miles of ${city}, ${state} this month (${current_count} total reports).`,
        icon: TrendIcon,
        link: '/map'
      })
    }

    // If user hasn't set up interests, show setup prompt
    if (!insights?.hasInterests) {
      cards.push({
        id: 'setup-interests',
        type: 'recommendation',
        title: 'Select Your Interests',
        description: 'Tell us which phenomena interest you most to get personalized pattern recommendations.',
        icon: Star,
        link: '/dashboard/settings'
      })
    } else {
      // Show trending in their interests (Option 2)
      if (insights?.categoryTrends && insights.categoryTrends.length > 0) {
        const trendingCategories = insights.categoryTrends.filter(t => t.current_count > 0)
        const hotCategory = trendingCategories.find(t => t.trending_direction === 'increasing')

        if (hotCategory) {
          const categoryLabel = CATEGORY_CONFIG[hotCategory.category as keyof typeof CATEGORY_CONFIG]?.label || hotCategory.category
          cards.push({
            id: 'trending-interests',
            type: 'trend',
            title: `${categoryLabel} Activity Rising`,
            description: `${categoryLabel} reports are up ${Math.abs(hotCategory.percent_change)}% this week with ${hotCategory.current_count} new ${hotCategory.current_count === 1 ? 'report' : 'reports'}. Your interest area is heating up!`,
            icon: Flame,
            link: '/explore'
          })
        } else if (trendingCategories.length > 0) {
          // Show general activity in their interests
          const totalReports = trendingCategories.reduce((sum, t) => sum + t.current_count, 0)
          const interestLabels = insights.interestedCategories
            .slice(0, 2)
            .map(cat => CATEGORY_CONFIG[cat]?.label || cat)
            .join(' & ')

          cards.push({
            id: 'interest-activity',
            type: 'trend',
            title: 'Activity in Your Interests',
            description: `${totalReports} new ${totalReports === 1 ? 'report' : 'reports'} in ${interestLabels} this week. Stay tuned for emerging patterns.`,
            icon: BarChart3,
            link: '/explore'
          })
        }
      }

      // Show similar experiencers (Option 5)
      if (insights?.similarExperiencers && insights.similarExperiencers.total_similar_users > 0) {
        const { total_similar_users, users_in_state } = insights.similarExperiencers
        const stateText = insights.location?.state && users_in_state > 0
          ? ` (${users_in_state} in ${insights.location.state})`
          : ''

        cards.push({
          id: 'similar-experiencers',
          type: 'pattern',
          title: 'Similar Investigators',
          description: `${total_similar_users} other ${total_similar_users === 1 ? 'investigator shares' : 'investigators share'} your interests${stateText}. You're part of a growing community!`,
          icon: Users,
          link: '/explore'
        })
      } else if (insights?.similarExperiencers) {
        // User has interests but no similar users yet - show pioneer card (no link needed)
        cards.push({
          id: 'pioneer-investigator',
          type: 'recommendation',
          title: 'Pioneer Investigator',
          description: "You're among the first to set up your investigation profile! As more investigators join, we'll connect you with others who share your interests.",
          icon: Star
        })
      }
    }

    return cards.slice(0, 3) // Max 3 cards
  }

  const personalizedInsights = generatePersonalizedInsights()

  if (subscriptionLoading || loading || personalizationLoading) {
    return (
      <DashboardLayout title="AI Insights">
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-900 rounded-xl animate-pulse" />
          ))}
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="AI Insights">
      <FeatureGate feature="ai_insights" blur>
        {/* Header */}
        <div className="mb-8">
          <p className="text-gray-400">
            AI-powered analysis of paranormal patterns and personalized recommendations.
          </p>
        </div>

        {/* Personalized Insights */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            For You
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {personalizedInsights.map(insight => (
              <InsightCardComponent key={insight.id} insight={insight} />
            ))}
          </div>
        </section>

        {/* Active Patterns */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              Active Patterns
            </h2>
            <Link
              href="/insights"
              className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              View All
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {error ? (
            <div className="p-6 bg-gray-900 rounded-xl text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-white font-medium mb-2">Error Loading Patterns</p>
              <p className="text-gray-400">{error}</p>
            </div>
          ) : patterns.length === 0 ? (
            <div className="p-8 bg-gray-900 rounded-xl text-center">
              <Sparkles className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-white font-medium mb-2">No Active Patterns</p>
              <p className="text-gray-400 mb-4">
                Our AI is continuously analyzing reports to detect patterns.
                Check back soon!
              </p>
              <Link
                href="/insights"
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
              >
                Explore Global Insights
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {patterns.slice(0, 4).map(pattern => (
                <PatternCard key={pattern.id} pattern={pattern} />
              ))}
            </div>
          )}
        </section>

        {/* How It Works */}
        <section className="mt-10 p-6 bg-gray-900 rounded-xl border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">How AI Insights Work</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="w-10 h-10 bg-purple-900/30 rounded-lg flex items-center justify-center mb-3">
                <span className="text-purple-400 font-bold">1</span>
              </div>
              <h4 className="text-white font-medium mb-1">Data Collection</h4>
              <p className="text-sm text-gray-400">
                We analyze thousands of paranormal reports for patterns and anomalies.
              </p>
            </div>
            <div>
              <div className="w-10 h-10 bg-purple-900/30 rounded-lg flex items-center justify-center mb-3">
                <span className="text-purple-400 font-bold">2</span>
              </div>
              <h4 className="text-white font-medium mb-1">Pattern Detection</h4>
              <p className="text-sm text-gray-400">
                Our algorithms identify geographic clusters, temporal patterns, and correlations.
              </p>
            </div>
            <div>
              <div className="w-10 h-10 bg-purple-900/30 rounded-lg flex items-center justify-center mb-3">
                <span className="text-purple-400 font-bold">3</span>
              </div>
              <h4 className="text-white font-medium mb-1">AI Analysis</h4>
              <p className="text-sm text-gray-400">
                Claude AI generates detailed narratives explaining each pattern's significance.
              </p>
            </div>
          </div>
        </section>
      </FeatureGate>
    </DashboardLayout>
  )
}
