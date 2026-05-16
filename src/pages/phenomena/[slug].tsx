'use client'

/**
 * Phenomenon page — thin "Reports tagged [X]" view.
 *
 * T1.3 simplification: stripped ai_* descriptive copy rendering per
 * the encyclopedia → tag-vocabulary pivot. The route is preserved
 * (Q1=b) so SEO and inbound links keep working; ai_* fields remain
 * in the DB (Q3=a) but are no longer rendered.
 *
 * What renders:
 *   - Small icon/image, category chip, H1 name, "N reports tagged"
 *   - YourSignalForPhenomenon personalized callout (silent for anon)
 *   - Grid of tagged reports (or empty-state CTA back to /explore)
 *   - Tag-fallback branch (slug has no encyclopedia entry but does
 *     have tagged reports) preserved as the lighter fallback.
 *
 * What was removed (vs. the pre-T1.3 ~1125-line file):
 *   - Tab nav (Overview / History / Media / Reports)
 *   - All ai_description / ai_history / ai_characteristics / ai_theories
 *     / ai_paradocs_analysis / ai_quick_facts / ai_cultural_impact /
 *     ai_notable_sightings rendering
 *   - Quick Facts sidebar, Recent Reports sidebar, PhenomenonMiniMap
 *   - Media tab (phenomena_media + image_gallery rendering)
 *   - Lightbox modal
 *   - AskTheUnknown widget (depended on ai_description for context)
 *   - ContentSection helper
 *
 * The /api/phenomena/[slug] endpoint is untouched — it still returns
 * the ai_* fields; we just don't render them. Separate cleanup later
 * if we want to trim the API response too.
 */

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { ArrowLeft, FileText, Telescope } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_CONFIG } from '@/lib/constants'
import PhenomenonIcon from '@/components/ui/PhenomenonIcon'
import { classNames } from '@/lib/utils'
import YourSignalForPhenomenon from '@/components/phenomena/YourSignalForPhenomenon'
import { BackToTodayBar } from '@/components/discover/BackToTodayBar'

interface Phenomenon {
  id: string | null
  name: string
  slug: string
  category: string | null
  icon?: string
  aliases?: string[]
  primary_image_url?: string | null
  report_count?: number
}

interface RelatedReport {
  id: string
  title: string
  slug: string
  summary: string
  category: string
  location_name: string
  country: string
  event_date: string
  view_count: number
  match_confidence?: number
}

export default function PhenomenonPage() {
  const router = useRouter()
  const { slug } = router.query

  const [phenomenon, setPhenomenon] = useState<Phenomenon | null>(null)
  const [reports, setReports] = useState<RelatedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [isTagFallback, setIsTagFallback] = useState(false)

  useEffect(() => {
    if (slug && typeof slug === 'string') {
      loadPhenomenon(slug)
    }
  }, [slug])

  async function loadPhenomenon(phenomenonSlug: string) {
    try {
      const res = await fetch(`/api/phenomena/${phenomenonSlug}`)
      if (!res.ok) {
        // No encyclopedia entry AND no tagged-report fallback either —
        // route to the category browse surface rather than the
        // deprecated /phenomena index (which 301s anyway per T1.2).
        router.push('/explore?view=categories')
        return
      }
      const data = await res.json()
      setPhenomenon(data.phenomenon)
      setReports(data.reports || [])
      setIsTagFallback(!!data.is_tag_fallback)

      // Track view for constellation map — non-blocking, signed-in only.
      if (data.phenomenon?.id) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.access_token) {
            fetch('/api/activity/track', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                action_type: 'view',
                phenomenon_id: data.phenomenon.id,
                category: data.phenomenon.category || null,
              }),
            }).catch(() => {})
          }
        })
      }
    } catch (error) {
      console.error('Error loading phenomenon:', error)
    } finally {
      setLoading(false)
    }
  }

  // Back navigation — use router.back() when the user arrived from
  // /explore or /phenomena so scroll/filter state is preserved;
  // otherwise route to the category browse surface.
  function handleBack() {
    try {
      const stored = sessionStorage.getItem('paradocs_nav_ctx')
      if (stored) {
        const ctx = JSON.parse(stored)
        const referrerBase = ctx.referrerPath?.split('?')[0]
        if (referrerBase === '/explore' || referrerBase === '/phenomena') {
          router.back()
          return
        }
      }
    } catch {}
    router.push('/explore?view=categories')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    )
  }

  if (!phenomenon) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">Phenomenon not found</p>
          <Link href="/explore?view=categories" className="text-purple-400 hover:text-purple-300">
            Browse categories
          </Link>
        </div>
      </div>
    )
  }

  // ── Tag-fallback branch ───────────────────────────────────────────
  // No encyclopedia entry exists for this slug, but the API found
  // reports whose tags array contains it. Preserved from pre-T1.3 so
  // Related-Phenomena links from Paradocs Analysis always land
  // somewhere useful.
  if (isTagFallback) {
    return (
      <>
        <Head>
          <title>{phenomenon.name} reports — Paradocs</title>
          <meta name="description" content={`Reports tagged with ${phenomenon.name} on Paradocs.`} />
        </Head>
        <div className="min-h-screen bg-gray-950">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <button
              onClick={() => { router.back() }}
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="mb-6">
              <p className="text-[11px] uppercase tracking-[0.14em] text-purple-400/80 mb-2">
                Reports tagged with
              </p>
              <h1 className="text-3xl sm:text-4xl font-display font-bold text-white mb-3">
                {phenomenon.name}
              </h1>
              <p className="text-sm text-gray-500">
                {reports.length} {reports.length === 1 ? 'report' : 'reports'} · No encyclopedia entry yet for this phenomenon.
              </p>
            </div>

            <ReportGrid reports={reports} />

            <div className="mt-10 text-center">
              <Link href="/explore?view=categories" className="text-xs text-gray-500 hover:text-purple-300">
                Browse all categories →
              </Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── Main render ───────────────────────────────────────────────────
  const config = phenomenon.category
    ? CATEGORY_CONFIG[phenomenon.category as keyof typeof CATEGORY_CONFIG]
    : null
  const reportCount = phenomenon.report_count ?? reports.length

  return (
    <>
      <Head>
        <title>{phenomenon.name} reports — Paradocs</title>
        <meta
          name="description"
          content={`${reportCount} ${reportCount === 1 ? 'report' : 'reports'} tagged with ${phenomenon.name}${config?.label ? ` in the ${config.label} category` : ''} on Paradocs.`}
        />
      </Head>

      {/* Shown only when user came from /discover (Today feed) */}
      <BackToTodayBar />

      <div className="min-h-screen bg-gray-950">
        {/* Hero — small, focused. Name + category + report count. */}
        <div className="border-b border-gray-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-5"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="flex items-center gap-4 sm:gap-5">
              {/* Small icon/image — 56-64px, anchored left */}
              <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center bg-gray-800/60 rounded-xl border border-gray-700 shrink-0 overflow-hidden">
                {phenomenon.primary_image_url ? (
                  <img
                    src={phenomenon.primary_image_url}
                    alt={phenomenon.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <PhenomenonIcon
                    slug={phenomenon.slug}
                    fallbackEmoji={phenomenon.icon}
                    category={phenomenon.category || undefined}
                    size={40}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0">
                {config && (
                  <span className={classNames(
                    'inline-block px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs mb-1.5',
                    config.bgColor || 'bg-gray-800',
                    config.color || 'text-gray-400'
                  )}>
                    {config.label}
                  </span>
                )}
                <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                  {phenomenon.name}
                </h1>
                <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  {reportCount === 1
                    ? '1 report tagged'
                    : `${reportCount.toLocaleString()} reports tagged`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Personalized callout — silent for anon / no-match cases */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <YourSignalForPhenomenon slug={phenomenon.slug} />
        </div>

        {/* Reports grid (or empty state) */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {reports.length === 0 ? (
            <EmptyState phenomenonName={phenomenon.name} />
          ) : (
            <ReportGrid reports={reports} />
          )}
        </div>
      </div>
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function ReportGrid({ reports }: { reports: RelatedReport[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {reports.map(report => (
        <Link
          key={report.id}
          href={`/report/${report.slug}`}
          className="block rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-purple-500/30 transition-all p-4"
        >
          <h3 className="text-[15px] font-semibold text-white leading-snug mb-1.5 line-clamp-2">
            {report.title}
          </h3>
          {report.summary && (
            <p className="text-xs text-gray-400 leading-relaxed line-clamp-3 mb-2">
              {report.summary}
            </p>
          )}
          <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
            {report.location_name && <span>{report.location_name}</span>}
            {!report.location_name && report.country && <span>{report.country}</span>}
            {report.event_date && (
              <span>{(report.event_date.match(/\d{4}/) || [''])[0]}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

function EmptyState({ phenomenonName }: { phenomenonName: string }) {
  return (
    <div className="text-center py-12 sm:py-16">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 mb-5">
        <Telescope className="w-6 h-6 text-gray-500" />
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        No reports tagged with {phenomenonName} yet
      </h2>
      <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
        As reports get submitted or indexed and tagged with this phenomenon, they&apos;ll show up here.
      </p>
      <Link
        href="/explore?view=categories"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 transition-colors"
      >
        Browse other categories
      </Link>
    </div>
  )
}
