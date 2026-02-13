/**
 * Weekly Digests Dashboard Page
 *
 * Shows the user's weekly anomaly report history with
 * in-app viewing of each digest.
 */

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Newspaper,
  Mail,
  MailOpen,
  Eye,
  Calendar,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
  Flame,
  BookOpen,
  FileText,
  Settings,
  Loader2,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { supabase } from '@/lib/supabase'

// ============================================
// TYPES
// ============================================

interface DigestReport {
  id: string
  title: string
  slug: string
  category: string
  location_text: string | null
  view_count: number
}

interface DigestSection {
  title: string
  icon: string
  items: DigestReport[]
}

interface DigestData {
  greeting: string
  streak: { current_streak: number; longest_streak: number; total_activities: number } | null
  journal_count: number
  sections: DigestSection[]
  total_new_reports: number
  top_category: string | null
}

interface Digest {
  id: string
  week_start: string
  week_end: string
  read_at: string | null
  email_sent_at: string | null
  created_at: string
  digest_data: DigestData
}

// ============================================
// CATEGORY CONFIG
// ============================================

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  ufo: { label: 'UFO Sightings', icon: '🛸' },
  cryptid: { label: 'Cryptid Encounters', icon: '🦶' },
  ghost: { label: 'Ghost & Hauntings', icon: '👻' },
  psychic: { label: 'Psychic Phenomena', icon: '🔮' },
  conspiracy: { label: 'Conspiracies', icon: '🕵️' },
  mythological: { label: 'Mythological', icon: '🐉' },
  extraterrestrial: { label: 'Extraterrestrial', icon: '👽' },
  other: { label: 'Other Anomalies', icon: '❓' },
}

// ============================================
// COMPONENT
// ============================================

export default function DigestsPage() {
  const router = useRouter()
  const [digests, setDigests] = useState<Digest[]>([])
  const [selectedDigest, setSelectedDigest] = useState<Digest | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [optedIn, setOptedIn] = useState(false)

  const fetchDigests = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    try {
      const res = await fetch('/api/user/digests?limit=20', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setDigests(data.digests || [])
        setTotal(data.total || 0)
      }
    } catch (err) {
      console.error('Error fetching digests:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Check if user is opted in
  useEffect(() => {
    const checkOptIn = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data } = await (supabase
        .from('profiles') as any)
        .select('notification_settings')
        .eq('id', session.user.id)
        .single()

      if (data?.notification_settings?.email_weekly_digest) {
        setOptedIn(true)
      }
    }
    checkOptIn()
    fetchDigests()
  }, [fetchDigests])

  // Handle selecting a digest (mark as read)
  const openDigest = async (digest: Digest) => {
    setSelectedDigest(digest)

    if (!digest.read_at) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await fetch(`/api/user/digests?id=${digest.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        // Update local state
        setDigests(prev =>
          prev.map(d => d.id === digest.id ? { ...d, read_at: new Date().toISOString() } : d)
        )
      }
    }
  }

  const formatDateRange = (start: string, end: string) => {
    const s = new Date(start + 'T00:00:00')
    const e = new Date(end + 'T00:00:00')
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
  }

  // ============================================
  // DIGEST DETAIL VIEW
  // ============================================

  if (selectedDigest) {
    const d = selectedDigest.digest_data
    return (
      <DashboardLayout title="Weekly Report">
        {/* Back button */}
        <button
          onClick={() => setSelectedDigest(null)}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to all digests
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-purple-400 tracking-wide mb-1">
            ✦ Weekly Anomaly Report ✦
          </h1>
          <p className="text-gray-500 text-sm uppercase tracking-widest">
            {formatDateRange(selectedDigest.week_start, selectedDigest.week_end)}
          </p>
        </div>

        {/* Greeting */}
        <p className="text-gray-300 text-lg mb-8">{d.greeting}</p>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          {d.streak && (
            <div className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
              <div className="text-3xl font-bold text-orange-500 flex items-center justify-center gap-1">
                <Flame className="w-6 h-6" />
                {d.streak.current_streak}
              </div>
              <div className="text-gray-500 text-xs mt-1">Day Streak</div>
            </div>
          )}
          <div className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
            <div className="text-3xl font-bold text-purple-400">
              {d.total_new_reports}
            </div>
            <div className="text-gray-500 text-xs mt-1">New Reports</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
            <div className="text-3xl font-bold text-blue-400 flex items-center justify-center gap-1">
              <BookOpen className="w-5 h-5" />
              {d.journal_count}
            </div>
            <div className="text-gray-500 text-xs mt-1">Journal Entries</div>
          </div>
        </div>

        {/* Sections */}
        {d.sections.map((section, i) => (
          <div key={i} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-200 mb-4">
              {section.icon} {section.title}
            </h2>
            <div className="space-y-3">
              {section.items.map((report) => {
                const catConfig = CATEGORY_LABELS[report.category] || CATEGORY_LABELS.other
                return (
                  <Link
                    key={report.id}
                    href={`/report/${report.slug}`}
                    className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-purple-500/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-purple-400 font-medium truncate">
                          {catConfig.icon} {report.title}
                        </p>
                        <p className="text-gray-500 text-sm mt-1">
                          {catConfig.label}
                          {report.location_text ? ` · ${report.location_text}` : ''}
                          {report.view_count > 0 ? ` · ${report.view_count} views` : ''}
                        </p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-600 flex-shrink-0 mt-1" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {d.sections.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>No highlighted reports for this week.</p>
          </div>
        )}

        {/* CTA */}
        <div className="text-center mt-8">
          <Link
            href="/dashboard/constellation"
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Explore Your Constellation →
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  // ============================================
  // DIGEST LIST VIEW
  // ============================================

  return (
    <DashboardLayout title="Weekly Reports">
      {/* Opt-in banner */}
      {!optedIn && !loading && (
        <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <Mail className="w-6 h-6 text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-1">
                Get weekly anomaly reports in your inbox
              </h3>
              <p className="text-gray-400 text-sm mb-3">
                Personalized weekly digests based on your interests, including trending reports,
                streak updates, and activity in your followed categories.
              </p>
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
              >
                <Settings className="w-4 h-4" />
                Enable in Settings → Notifications
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && digests.length === 0 && (
        <div className="text-center py-20">
          <Newspaper className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <h3 className="text-gray-400 font-medium mb-2">No digests yet</h3>
          <p className="text-gray-600 text-sm max-w-sm mx-auto">
            {optedIn
              ? 'Your first weekly anomaly report will arrive next Monday.'
              : 'Enable weekly digests in Settings to receive personalized anomaly reports.'}
          </p>
        </div>
      )}

      {/* Digest list */}
      {!loading && digests.length > 0 && (
        <div className="space-y-3">
          {digests.map((digest) => {
            const d = digest.digest_data
            const isRead = !!digest.read_at
            const wasEmailed = !!digest.email_sent_at

            return (
              <button
                key={digest.id}
                onClick={() => openDigest(digest)}
                className={`w-full text-left bg-gray-900 border rounded-xl p-5 hover:border-purple-500/40 transition-colors ${
                  isRead ? 'border-gray-800' : 'border-purple-500/30'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Read indicator */}
                  <div className="flex-shrink-0">
                    {isRead ? (
                      <MailOpen className="w-5 h-5 text-gray-600" />
                    ) : (
                      <Mail className="w-5 h-5 text-purple-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`font-medium truncate ${isRead ? 'text-gray-400' : 'text-white'}`}>
                        Weekly Anomaly Report
                      </h3>
                      {!isRead && (
                        <span className="bg-purple-500/20 text-purple-400 text-xs px-2 py-0.5 rounded-full flex-shrink-0">
                          New
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDateRange(digest.week_start, digest.week_end)}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        {d.total_new_reports} reports
                      </span>
                      {d.streak && d.streak.current_streak > 0 && (
                        <span className="flex items-center gap-1 text-orange-500">
                          <Flame className="w-3.5 h-3.5" />
                          {d.streak.current_streak}d streak
                        </span>
                      )}
                      {wasEmailed && (
                        <span className="flex items-center gap-1" title="Sent via email">
                          <Mail className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-gray-600 flex-shrink-0" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </DashboardLayout>
  )
}
