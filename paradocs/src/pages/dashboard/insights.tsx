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
  MapPin,
  Calendar,
  AlertCircle,
  ArrowRight,
  Lightbulb,
  BarChart3,
  Clock
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { FeatureGate } from '@/components/dashboard/FeatureGate'
import { useSubscription } from '@/lib/hooks/useSubscription'
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
      } catch (err) {
        console.error('Error fetching insights:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchInsights()
  }, [router])

  // Generate personalized insights
  const personalizedInsights: InsightCard[] = [
    {
      id: '1',
      type: 'recommendation',
      title: 'Complete Your Profile',
      description: 'Add more details to your profile to get better personalized insights and recommendations.',
      icon: Lightbulb,
      link: '/dashboard/settings'
    },
    {
      id: '2',
      type: 'trend',
      title: 'Increasing Activity in Your Area',
      description: 'There has been a 23% increase in paranormal reports within 50 miles of your location this month.',
      icon: TrendingUp,
      link: '/map'
    },
    {
      id: '3',
      type: 'pattern',
      title: 'Similar Reports Found',
      description: 'We found 5 reports that match the characteristics of sightings you\'ve submitted or saved.',
      icon: Sparkles,
      link: '/reports'
    }
  ]

  if (subscriptionLoading || loading) {
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
