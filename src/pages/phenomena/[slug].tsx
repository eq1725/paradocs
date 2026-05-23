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

import React, { useEffect, useState, useCallback, useRef } from 'react'
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
import PhenomenonFilterBar, {
  PhenomenonFilters,
  DEFAULT_FILTERS,
} from '@/components/phenomena/PhenomenonFilterBar'

interface Phenomenon {
  id: string | null
  name: string
  slug: string
  category: string | null
  icon?: string
  aliases?: string[]
  primary_image_url?: string | null
  report_count?: number
  ai_summary?: string | null
  // V11.16 — image provenance fields (nullable; only populated on
  // phenomena adopted by the new image pipeline)
  image_attribution?: string | null
  image_alt_text?: string | null
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

const PAGE_SIZE = 20

function filtersToQuery(f: PhenomenonFilters): string {
  const parts: string[] = []
  if (f.sort && f.sort !== 'confidence') parts.push('sort=' + encodeURIComponent(f.sort))
  if (f.country) parts.push('country=' + encodeURIComponent(f.country))
  if (f.decade) parts.push('decade=' + encodeURIComponent(f.decade))
  if (f.search) parts.push('search=' + encodeURIComponent(f.search))
  return parts.length ? '?' + parts.join('&') : ''
}

function filtersFromQuery(q: Record<string, string | string[] | undefined>): PhenomenonFilters {
  function s(k: string): string | undefined {
    const v = q[k]
    return Array.isArray(v) ? v[0] : v
  }
  const sort = s('sort')
  return {
    sort: (sort === 'newest' || sort === 'oldest' || sort === 'popular' || sort === 'most_viewed')
      ? sort
      : 'confidence',
    country: s('country') || null,
    decade: (s('decade') as any) || null,
    search: s('search') || '',
  }
}

export default function PhenomenonPage() {
  const router = useRouter()
  const { slug } = router.query

  const [phenomenon, setPhenomenon] = useState<Phenomenon | null>(null)
  const [reports, setReports] = useState<RelatedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [isTagFallback, setIsTagFallback] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [filters, setFiltersState] = useState<PhenomenonFilters>(DEFAULT_FILTERS)
  const [resultTotal, setResultTotal] = useState<number | null>(null)
  const [facets, setFacets] = useState<{ countries: Record<string, number>; decades: Record<string, number> } | null>(null)
  const filterFetchSeq = useRef(0)

  // Sync initial filter state from URL once the route is ready.
  useEffect(() => {
    if (!router.isReady) return
    setFiltersState(filtersFromQuery(router.query))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady])

  // Initial load: fetch phenomenon metadata. Reports come from the
  // filtered endpoint below so the first paint reflects the URL state.
  useEffect(() => {
    if (slug && typeof slug === 'string') {
      loadPhenomenonMeta(slug)
      loadFacets(slug)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Refetch reports whenever filters or slug change. Sequencing prevents
  // a slow stale response from clobbering a fast newer one.
  useEffect(() => {
    if (!slug || typeof slug !== 'string') return
    if (!router.isReady) return
    const seq = ++filterFetchSeq.current
    loadReports(slug, filters, 0, seq, /*append=*/false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, filters.sort, filters.country, filters.decade, filters.search, router.isReady])

  async function loadPhenomenonMeta(phenomenonSlug: string) {
    try {
      const res = await fetch(`/api/phenomena/${phenomenonSlug}?limit=1&offset=0`)
      if (!res.ok) {
        router.push('/explore?view=categories')
        return
      }
      const data = await res.json()
      setPhenomenon(data.phenomenon)
      setIsTagFallback(!!data.is_tag_fallback)
      // Track view — non-blocking, signed-in only.
      if (data.phenomenon?.id) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.access_token) {
            fetch('/api/activity/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
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
      console.error('Error loading phenomenon meta:', error)
    }
  }

  async function loadFacets(phenomenonSlug: string) {
    try {
      const res = await fetch(`/api/phenomena/${phenomenonSlug}/facets`)
      if (!res.ok) return
      const data = await res.json()
      setFacets({ countries: data.countries || {}, decades: data.decades || {} })
    } catch (e) {
      console.error('Error loading facets:', e)
    }
  }

  async function loadReports(
    phenomenonSlug: string,
    activeFilters: PhenomenonFilters,
    offset: number,
    seq: number,
    append: boolean,
  ) {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const page = Math.floor(offset / PAGE_SIZE) + 1
      const qs = filtersToQuery(activeFilters)
      const sep = qs ? '&' : '?'
      const url = `/api/phenomena/${phenomenonSlug}/reports${qs}${sep}page=${page}&limit=${PAGE_SIZE}`
      const res = await fetch(url)
      if (seq !== filterFetchSeq.current) return // superseded
      if (!res.ok) {
        if (!append) { setReports([]); setHasMore(false); setResultTotal(0) }
        return
      }
      const data = await res.json()
      if (seq !== filterFetchSeq.current) return // superseded between fetch + parse
      const page1 = (data.reports || []) as RelatedReport[]
      const total = data.pagination?.total ?? 0
      setResultTotal(total)
      if (append) {
        setReports(prev => prev.concat(page1))
        const newLen = reports.length + page1.length
        setHasMore(page1.length >= PAGE_SIZE && newLen < total)
      } else {
        setReports(page1)
        setHasMore(page1.length >= PAGE_SIZE && page1.length < total)
      }
    } catch (e) {
      console.error('Error loading reports:', e)
      if (!append) { setReports([]); setHasMore(false); setResultTotal(0) }
    } finally {
      if (append) setLoadingMore(false)
      else setLoading(false)
    }
  }

  // Push filter changes to URL (shallow nav, no scroll jump).
  const handleFiltersChange = useCallback((next: PhenomenonFilters) => {
    setFiltersState(next)
    if (typeof slug !== 'string') return
    const qs = filtersToQuery(next)
    router.replace(
      { pathname: `/phenomena/${slug}`, query: Object.fromEntries(
        new URLSearchParams(qs.startsWith('?') ? qs.substring(1) : qs).entries()
      ) },
      undefined,
      { shallow: true, scroll: false },
    )
  }, [router, slug])

  async function loadMore() {
    if (!phenomenon || loadingMore || !hasMore) return
    const seq = filterFetchSeq.current
    await loadReports(phenomenon.slug, filters, reports.length, seq, /*append=*/true)
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
                    alt={phenomenon.image_alt_text || phenomenon.name}
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

            {/* Description (ai_summary) lives inside the hero so it
                reads as part of the header, above the divider line. */}
            {phenomenon.ai_summary && (
              <p className="text-[15px] leading-relaxed text-gray-300 mt-5 sm:mt-6 max-w-3xl">
                {phenomenon.ai_summary}
              </p>
            )}

            {/* V11.16 — image attribution credit. Required for CC BY-SA
                images and good citizenship for the rest. Rendered as
                small, low-emphasis text so it doesn't compete with the
                main copy. dangerouslySetInnerHTML is OK here because
                the attribution string is server-controlled (written by
                the adoption script, never user input). */}
            {phenomenon.image_attribution && (
              <p
                className="text-[10px] text-gray-500 mt-3 [&_a]:text-gray-400 [&_a]:hover:text-gray-200 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: phenomenon.image_attribution }}
              />
            )}
          </div>
        </div>

        {/* Filter bar — sticky beneath hero, pinned while scrolling reports */}
        <PhenomenonFilterBar
          filters={filters}
          onChange={handleFiltersChange}
          facets={facets || undefined}
          resultCount={resultTotal === null ? undefined : resultTotal}
        />

        {/* Personalized callout — silent for anon / no-match cases */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <YourSignalForPhenomenon slug={phenomenon.slug} />
        </div>

        {/* Reports grid (or empty state) */}
        <div
          className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8"
          aria-busy={loading}
        >
          {loading && reports.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
            </div>
          ) : reports.length === 0 ? (
            <FilteredEmptyState
              phenomenonName={phenomenon.name}
              filtersActive={
                filters.sort !== 'confidence' ||
                !!filters.country ||
                !!filters.decade ||
                !!filters.search
              }
              onClearFilters={() => handleFiltersChange(DEFAULT_FILTERS)}
            />
          ) : (
            <>
              <ReportGrid reports={reports} />
              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-gray-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingMore ? 'Loading…' : 'Load more reports'}
                  </button>
                </div>
              )}
            </>
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

// V11.15.3 — Empty state for the filter-active case. Splits the two
// empty conditions visually because they call for different CTAs:
// no-tagged-reports is "browse elsewhere," filter-too-narrow is
// "clear filters."
function FilteredEmptyState(props: {
  phenomenonName: string
  filtersActive: boolean
  onClearFilters: () => void
}) {
  if (!props.filtersActive) {
    return <EmptyState phenomenonName={props.phenomenonName} />
  }
  return (
    <div className="text-center py-12 sm:py-16">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 mb-5">
        <Telescope className="w-6 h-6 text-gray-500" />
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        No reports match these filters
      </h2>
      <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
        Try widening your filters — there may be {props.phenomenonName} reports outside the current country, decade, or search.
      </p>
      <button
        type="button"
        onClick={props.onClearFilters}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 transition-colors"
      >
        Clear all filters
      </button>
    </div>
  )
}
