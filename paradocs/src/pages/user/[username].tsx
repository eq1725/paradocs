/**
 * User Reputation Profile Page
 *
 * Displays detailed reputation and credibility information for witnesses
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
// Layout wrapper is provided by _app.tsx
import {
  User,
  Shield,
  Star,
  Award,
  Calendar,
  FileText,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Clock,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  Target,
  Zap
} from 'lucide-react'

interface ReputationLevel {
  level: number
  title: string
  min_score: number
  max_score: number | null
  color: string
}

interface Badge {
  id: string
  name: string
  description: string
  icon: string
  earned_at: string
}

interface Breakdown {
  reports_submitted: number
  reports_approved: number
  approval_rate: number
  high_credibility_reports: number
  verified_reports: number
  total_upvotes_received: number
  total_downvotes_received: number
  comments_made: number
  helpful_comments: number
  account_age_days: number
  last_activity: string | null
}

interface ReputationData {
  user: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    bio: string | null
    role: string
    created_at: string
  }
  reputation: {
    score: number
    level: ReputationLevel
    trust_score: number
    badges: Badge[]
    breakdown: Breakdown
    recent_activity: {
      reports_last_30_days: number
      is_active: boolean
    }
  }
  all_levels: ReputationLevel[]
}

export default function UserProfilePage() {
  const router = useRouter()
  const { username } = router.query

  const [data, setData] = useState<ReputationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (username) {
      fetchReputation()
    }
  }, [username])

  async function fetchReputation() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/users/${username}/reputation`)
      if (response.ok) {
        const result = await response.json()
        setData(result)
      } else if (response.status === 404) {
        setError('User not found')
      } else {
        setError('Failed to load profile')
      }
    } catch (err) {
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const getLevelColor = (color: string) => {
    const colors: Record<string, string> = {
      gray: 'text-gray-400 bg-gray-500/20',
      green: 'text-green-400 bg-green-500/20',
      blue: 'text-blue-400 bg-blue-500/20',
      purple: 'text-purple-400 bg-purple-500/20',
      amber: 'text-amber-400 bg-amber-500/20',
      red: 'text-red-400 bg-red-500/20',
    }
    return colors[color] || colors.gray
  }

  const getTrustScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 60) return 'text-blue-400'
    if (score >= 40) return 'text-amber-400'
    return 'text-red-400'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return `${Math.floor(diffDays / 365)} years ago`
  }

  if (loading) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading profile...</p>
          </div>
        </div>
      </>
    )
  }

  if (error || !data) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Profile Not Found</h1>
            <p className="text-gray-400 mb-6">{error || 'Unable to load this profile'}</p>
            <Link href="/" className="btn btn-primary">
              Return Home
            </Link>
          </div>
        </div>
      </>
    )
  }

  const { user, reputation, all_levels } = data
  const { breakdown } = reputation

  return (
    <>
      <Head>
        <title>{user.display_name || user.username} | ParaDocs</title>
        <meta name="description" content={`Reputation profile for ${user.display_name || user.username}`} />
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="glass-card p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-full bg-primary-600 flex items-center justify-center text-4xl font-bold text-white">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.username} className="w-full h-full rounded-full object-cover" />
                ) : (
                  (user.display_name || user.username)[0].toUpperCase()
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-display font-bold text-white">
                  {user.display_name || user.username}
                </h1>
                {(user.role === 'moderator' || user.role === 'admin') && (
                  <span className="px-2 py-1 rounded-full text-xs bg-purple-500/20 text-purple-400 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Staff
                  </span>
                )}
                {user.role === 'contributor' && (
                  <span className="px-2 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Contributor
                  </span>
                )}
              </div>
              <p className="text-gray-400 mb-3">@{user.username}</p>
              {user.bio && (
                <p className="text-gray-300 text-sm mb-4">{user.bio}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Joined {formatDate(user.created_at)}
                </span>
                {reputation.recent_activity.is_active && (
                  <span className="flex items-center gap-1 text-green-400">
                    <Zap className="w-4 h-4" />
                    Active
                  </span>
                )}
              </div>
            </div>

            {/* Reputation Score */}
            <div className="text-center md:text-right">
              <div className={`inline-block px-4 py-2 rounded-lg ${getLevelColor(reputation.level.color)}`}>
                <div className="text-3xl font-bold">{reputation.score}</div>
                <div className="text-sm">{reputation.level.title}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="glass-card p-4 text-center">
            <FileText className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{breakdown.reports_submitted}</div>
            <div className="text-xs text-gray-400">Reports Submitted</div>
          </div>
          <div className="glass-card p-4 text-center">
            <CheckCircle className="w-6 h-6 text-green-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{Math.round(breakdown.approval_rate * 100)}%</div>
            <div className="text-xs text-gray-400">Approval Rate</div>
          </div>
          <div className="glass-card p-4 text-center">
            <Target className="w-6 h-6 text-purple-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{breakdown.high_credibility_reports}</div>
            <div className="text-xs text-gray-400">High Credibility</div>
          </div>
          <div className="glass-card p-4 text-center">
            <Shield className={`w-6 h-6 mx-auto mb-2 ${getTrustScoreColor(reputation.trust_score)}`} />
            <div className="text-2xl font-bold text-white">{reputation.trust_score}</div>
            <div className="text-xs text-gray-400">Trust Score</div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Left Column - Badges */}
          <div className="md:col-span-1">
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                Badges Earned
              </h2>
              {reputation.badges.length > 0 ? (
                <div className="space-y-3">
                  {reputation.badges.map((badge) => (
                    <div
                      key={badge.id}
                      className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <span className="text-2xl">{badge.icon}</span>
                      <div>
                        <div className="text-sm font-medium text-white">{badge.name}</div>
                        <div className="text-xs text-gray-400">{badge.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">
                  No badges earned yet
                </p>
              )}
            </div>

            {/* Level Progress */}
            <div className="glass-card p-6 mt-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                Level Progress
              </h2>
              <div className="space-y-3">
                {all_levels.map((level, idx) => {
                  const isCurrentLevel = level.level === reputation.level.level
                  const isPastLevel = level.level < reputation.level.level
                  const progress = isCurrentLevel
                    ? level.max_score
                      ? ((reputation.score - level.min_score) / (level.max_score - level.min_score)) * 100
                      : 100
                    : isPastLevel ? 100 : 0

                  return (
                    <div key={level.level} className={`${isCurrentLevel ? 'ring-1 ring-primary-500 rounded-lg' : ''}`}>
                      <div className="flex items-center justify-between p-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${getLevelColor(level.color)}`}>
                            Lv.{level.level}
                          </span>
                          <span className={`text-sm ${isCurrentLevel ? 'text-white font-medium' : 'text-gray-400'}`}>
                            {level.title}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {level.max_score ? `${level.min_score}-${level.max_score}` : `${level.min_score}+`}
                        </span>
                      </div>
                      <div className="h-1 bg-gray-800 rounded-full mx-2 mb-2">
                        <div
                          className={`h-full rounded-full ${isPastLevel || isCurrentLevel ? 'bg-primary-500' : 'bg-gray-700'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right Column - Detailed Stats */}
          <div className="md:col-span-2">
            {/* Activity Breakdown */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400" />
                Activity Breakdown
              </h2>

              <div className="space-y-4">
                {/* Reports Section */}
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Reports</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-400">Total Submitted</span>
                        <span className="text-lg font-bold text-white">{breakdown.reports_submitted}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">Approved</span>
                        <span className="text-lg font-bold text-green-400">{breakdown.reports_approved}</span>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-400">High Credibility</span>
                        <span className="text-lg font-bold text-purple-400">{breakdown.high_credibility_reports}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">Verified</span>
                        <span className="text-lg font-bold text-amber-400">{breakdown.verified_reports}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Engagement Section */}
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Engagement</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white/5 rounded-lg p-4 text-center">
                      <ThumbsUp className="w-5 h-5 text-green-400 mx-auto mb-1" />
                      <div className="text-lg font-bold text-white">{breakdown.total_upvotes_received}</div>
                      <div className="text-xs text-gray-400">Upvotes</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 text-center">
                      <ThumbsDown className="w-5 h-5 text-red-400 mx-auto mb-1" />
                      <div className="text-lg font-bold text-white">{breakdown.total_downvotes_received}</div>
                      <div className="text-xs text-gray-400">Downvotes</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 text-center">
                      <MessageSquare className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                      <div className="text-lg font-bold text-white">{breakdown.comments_made}</div>
                      <div className="text-xs text-gray-400">Comments</div>
                    </div>
                  </div>
                </div>

                {/* Account Info */}
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Account</h3>
                  <div className="bg-white/5 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-400 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Account Age
                      </span>
                      <span className="text-sm text-white">
                        {breakdown.account_age_days} days ({Math.round(breakdown.account_age_days / 365 * 10) / 10} years)
                      </span>
                    </div>
                    {breakdown.last_activity && (
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-400 flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          Last Activity
                        </span>
                        <span className="text-sm text-white">
                          {formatTimeAgo(breakdown.last_activity)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Recent (30 days)
                      </span>
                      <span className="text-sm text-white">
                        {reputation.recent_activity.reports_last_30_days} reports
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Trust Score Explanation */}
            <div className="glass-card p-6 mt-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                Trust Score Breakdown
              </h2>
              <p className="text-sm text-gray-400 mb-4">
                The trust score is calculated based on multiple factors to indicate overall reliability.
              </p>
              <div className="relative h-4 bg-gray-800 rounded-full overflow-hidden mb-4">
                <div
                  className={`absolute left-0 top-0 h-full ${
                    reputation.trust_score >= 80 ? 'bg-green-500' :
                    reputation.trust_score >= 60 ? 'bg-blue-500' :
                    reputation.trust_score >= 40 ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${reputation.trust_score}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>0</span>
                <span className="text-red-400">Low</span>
                <span className="text-amber-400">Moderate</span>
                <span className="text-blue-400">Good</span>
                <span className="text-green-400">Excellent</span>
                <span>100</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
