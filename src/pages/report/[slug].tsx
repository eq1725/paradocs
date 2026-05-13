/**
 * Report detail page — V10.4 Phase 2 rewrite
 *
 * Mass-market mobile-first single page. The bulk of the layout
 * + state lives in src/components/reports/ReportPageV2.tsx; this
 * file is just data-fetching (getStaticProps / getStaticPaths)
 * + a thin wrapper that delegates.
 *
 * Replaces the prior 1700-line page that stacked 25+ sections
 * (KeepExploring + FurtherReading + PatternConnections +
 * ConnectionCards + AskTheUnknown FAB + three save buttons +
 * Paradocs Analysis box + tag cloud + comments + ...) — all of
 * that is either subsumed into ReportPageV2's section order or
 * dropped entirely per the V10.4 panel review.
 *
 * Index-report ToS posture preserved: scrubIndexReport() strips
 * the verbatim source description before the data leaves the
 * server. The client only ever sees AI-rewritten text
 * (paradocs_narrative, answer_line, etc.) which has been run
 * through the V10.4 anti-fabrication pipeline (hedge voice +
 * claim-citation + audit log).
 */

import React from 'react'
import { useRouter } from 'next/router'
import ReportPageV2 from '@/components/reports/ReportPageV2'
import type { RelatedReport } from '@/components/reports/ReportBelowFold'

interface PatternChip {
  label: string
  count: number
  href: string
}

interface ReportPageProps {
  slug: string
  initialReport?: any
  initialMedia?: any[]
  initialRelated?: RelatedReport[]
  initialPatterns?: PatternChip[]
  fetchError?: boolean
  notFound?: boolean
}

export default function ReportPage({
  initialReport,
  initialMedia,
  initialRelated,
  initialPatterns,
  fetchError,
}: ReportPageProps) {
  const router = useRouter()

  if (router.isFallback) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400 text-sm">
        Loading report…
      </div>
    )
  }

  if (fetchError || !initialReport) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-300 px-6 text-center">
        <h1 className="text-xl font-semibold text-white mb-2">Report not available</h1>
        <p className="text-sm text-gray-500 mb-4 max-w-md">
          We couldn’t load this report. It may have been removed or there was a temporary issue
          reaching the archive.
        </p>
        <button
          onClick={() => router.push('/discover')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
        >
          Back to Today
        </button>
      </div>
    )
  }

  return (
    <ReportPageV2
      report={initialReport}
      media={initialMedia || []}
      relatedReports={initialRelated || []}
      patterns={initialPatterns || []}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}

/**
 * Scrub verbatim source content from index reports before the
 * data leaves the server. We never republish someone else's
 * prose; the client only sees AI-rewritten text. The DB keeps
 * the raw description for analysis regeneration.
 */
function scrubIndexReport(reportData: any): any {
  if (!reportData) return reportData
  const sourceType = reportData.source_type
  const isCurated = sourceType === 'curated' || sourceType === 'editorial' || sourceType === 'user_submission'
  if (isCurated) return reportData

  const narrative: string | null = reportData.paradocs_narrative || null
  const metaFromNarrative = narrative
    ? (narrative.length > 200 ? narrative.slice(0, 197).trim() + '...' : narrative)
    : null

  return {
    ...reportData,
    description: null,
    summary: metaFromNarrative || reportData.answer_line || reportData.feed_hook || null,
  }
}

export async function getStaticProps({ params }: { params: { slug: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    // Primary report fetch — pulls the phenomenon_type relation
    // for chip display + the submitter profile (display_name only)
    // for the optional non-anonymous attribution.
    const { data: reportData, error: reportError } = await sb
      .from('reports')
      .select(`
        *,
        phenomenon_type:phenomenon_types(id, name, slug),
        submitter_profile:profiles!reports_submitted_by_fkey(display_name, username, avatar_url)
      `)
      .eq('slug', params.slug)
      .eq('status', 'approved')
      .single()

    if (reportError || !reportData) {
      return { notFound: true }
    }

    const safeReport = scrubIndexReport(reportData)

    // V10.5 — fetch the saved_count aggregate for the engagement
    // strip. saved_reports is the legacy bookmark table; we
    // count rows pointing at this report.
    try {
      const { count: savedCount } = await (sb.from('saved_reports') as any)
        .select('id', { count: 'exact', head: true })
        .eq('report_id', (reportData as any).id)
      ;(safeReport as any).saved_count = savedCount || 0
    } catch {
      ;(safeReport as any).saved_count = 0
    }

    // V10.6.28 — fetch the resonance_count too. Resonance is a
    // higher-signal social proof than save (the user is asserting
    // "this happened to me too", not just bookmarking). We surface
    // it as a stat callout above the meta block when count > 0.
    try {
      const { count: resonanceCount } = await (sb.from('report_resonance') as any)
        .select('id', { count: 'exact', head: true })
        .eq('report_id', (reportData as any).id)
      ;(safeReport as any).resonance_count = resonanceCount || 0
    } catch {
      ;(safeReport as any).resonance_count = 0
    }

    // Media items (uploaded photos/docs for direct submissions).
    const { data: mediaData } = await sb
      .from('report_media')
      .select('id, media_type, url, thumbnail_url, caption, is_primary')
      .eq('report_id', (reportData as any).id)
      .order('is_primary', { ascending: false })

    // Related reports — same category, within radius if we have
    // coordinates, otherwise just same category sorted by recency.
    // Limit 5 (subsumes the old KeepExploring + RelatedReports).
    let related: RelatedReport[] = []
    try {
      const { data: relRows } = await sb
        .from('reports')
        .select('id, slug, title, category, location_name, event_date')
        .eq('category', (reportData as any).category)
        .neq('id', (reportData as any).id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(5)
      if (relRows) {
        related = relRows.map((r: any) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          category: r.category,
          location_name: r.location_name,
          event_date: r.event_date,
        }))
      }
    } catch {
      // Best-effort — empty array is fine if this fails.
    }

    // V10.6.28 — Pattern strip data. Cheap aggregate counts that
    // show this report's "fit" in the broader archive. Three
    // dimensions: same-category total, same-phenomenon-type total
    // (if available), and same-state/region total. Each one becomes
    // a clickable chip → filtered /explore.
    let patterns: Array<{ label: string; count: number; href: string }> = []
    try {
      const cat = (reportData as any).category
      const stateProv = (reportData as any).state_province
      const phenomenonTypeId = (reportData as any).phenomenon_type_id
      const categoryLabel = (reportData as any).category ? prettyCategory((reportData as any).category) : null

      // Same category
      if (cat) {
        const { count } = await (sb.from('reports') as any)
          .select('id', { count: 'exact', head: true })
          .eq('category', cat)
          .eq('status', 'approved')
        if (count && count > 1 && categoryLabel) {
          patterns.push({
            label: count.toLocaleString() + ' reports in ' + categoryLabel,
            count,
            href: '/explore?category=' + encodeURIComponent(cat),
          })
        }
      }

      // Same state/region (US-centric for now)
      if (stateProv) {
        const { count } = await (sb.from('reports') as any)
          .select('id', { count: 'exact', head: true })
          .eq('state_province', stateProv)
          .eq('status', 'approved')
        if (count && count > 1) {
          patterns.push({
            label: count.toLocaleString() + ' reports in ' + stateProv,
            count,
            href: '/explore?state=' + encodeURIComponent(stateProv),
          })
        }
      }

      // Same phenomenon type (sub-category, e.g., "Orb sighting")
      if (phenomenonTypeId) {
        const { count } = await (sb.from('reports') as any)
          .select('id', { count: 'exact', head: true })
          .eq('phenomenon_type_id', phenomenonTypeId)
          .eq('status', 'approved')
        if (count && count > 1) {
          // Get the phenomenon name for the label
          const ptName = (reportData as any).phenomenon_type && (reportData as any).phenomenon_type.name
          if (ptName) {
            patterns.push({
              label: count.toLocaleString() + ' similar ' + ptName + ' reports',
              count,
              href: '/explore?phenomenon=' + encodeURIComponent(((reportData as any).phenomenon_type && (reportData as any).phenomenon_type.slug) || ptName),
            })
          }
        }
      }
    } catch {
      // Best-effort. If counts fail, just don't show the pattern strip.
    }

    return {
      props: {
        slug: params.slug,
        initialReport: safeReport,
        initialMedia: mediaData || [],
        initialRelated: related,
        initialPatterns: patterns,
      },
      revalidate: 120,
    }
  } catch (error) {
    return {
      props: {
        slug: params.slug,
        initialReport: null,
        initialMedia: [],
        initialRelated: [],
        initialPatterns: [],
        fetchError: true,
      },
      revalidate: 30,
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────

const CATEGORY_PRETTY: Record<string, string> = {
  ufos_aliens: 'UFOs & Aliens',
  cryptids: 'Cryptids',
  ghosts_hauntings: 'Ghosts & Hauntings',
  psychic_phenomena: 'Psychic Phenomena',
  consciousness_practices: 'Consciousness',
  psychological_experiences: 'Psychological',
  biological_factors: 'Biological',
  perception_sensory: 'Perception',
  religion_mythology: 'Religion & Mythology',
  esoteric_practices: 'Esoteric Practices',
  combination: 'Other',
}

function prettyCategory(slug: string): string {
  return CATEGORY_PRETTY[slug] || slug.replace(/_/g, ' ')
}
