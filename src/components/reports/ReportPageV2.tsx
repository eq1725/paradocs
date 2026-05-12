'use client'

/**
 * ReportPageV2 — V10.4 Phase 2
 *
 * Mass-market mobile-first replacement for the dense 25+ section
 * report page. New section order (per panel review V10.4):
 *
 *   1. Animated map (replaces hero image entirely)
 *   2. Title
 *   3. Answer line (one-sentence faithful paraphrase)
 *   4. Who · Where · When meta block (anonymization-aware)
 *   5. Phenomena & cross-disciplinary chips
 *   6. Experience description (paradocs_narrative)
 *   7. Source attribution + media (3-tier oEmbed)
 *   8. Below-fold collapsible (analysis + related + comments)
 *   9. ONE persistent save affordance in the header
 *
 * Dropped from the prior page: KeepExploring, FurtherReading,
 * PatternConnections, ConnectionCards, floating Ask-the-Unknown
 * FAB, three redundant save buttons, the credibility_signal
 * field, the AI-generated mood image hero, the feed-hook lede
 * (replaced by answer_line), and SourceAttribution +
 * FeaturedMediaCard + MediaMentionBanner + MediaGallery (all
 * collapsed into SourceBlock).
 *
 * All AI-rewritten text shown here is run through
 * stripPiiWithLogging before render — render-time backstop on
 * top of the prompt-level anonymization (V10.4 Phase 1.4).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ArrowLeft, Bookmark, BookmarkCheck, Share2, Loader2 } from 'lucide-react'

import ReportLocationMap, { type LocationPrecision } from './ReportLocationMap'
import ReportMeta from './ReportMeta'
import ReportPhenomenaChips from './ReportPhenomenaChips'
import SourceBlock from './SourceBlock'
import ReportBelowFold, { type RelatedReport, type AlternativeExplanation } from './ReportBelowFold'
import { stripPiiWithLogging } from '@/lib/ai/pii-filter'
import { supabase } from '@/lib/supabase'
import { CATEGORY_CONFIG } from '@/lib/constants'

// ── Props ───────────────────────────────────────────────────

export interface ReportPageV2Props {
  report: any           // full reports row (loose typing — DB types drift)
  media: any[]          // report_media rows
  relatedReports?: RelatedReport[]
}

// ── Component ───────────────────────────────────────────────

export default function ReportPageV2({ report, media, relatedReports }: ReportPageV2Props) {
  const router = useRouter()

  // ── Sanitize AI-rewritten text fields at render time ──────
  // Prompt-level anonymization is the primary safeguard
  // (V10.4 Phase 1). This is defense in depth: regex-strips any
  // PII patterns that slipped through.
  const sanitized = useMemo(() => sanitizeReport(report), [report])

  // ── Save state + handler (preserved from legacy page) ─────
  const [user, setUser] = useState<any>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setUser(session?.user || null)
      if (session?.user && report?.id) {
        // Check if this report is already saved.
        supabase
          .from('saved_reports')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('report_id', report.id)
          .maybeSingle()
          .then(({ data }: any) => {
            if (cancelled) return
            if (data?.id) {
              setIsSaved(true)
              setSavedId(data.id)
            }
          })
      }
    })
    return () => { cancelled = true }
  }, [report?.id])

  const handleSave = useCallback(async () => {
    if (!user || !report || saving) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      if (isSaved && savedId) {
        await fetch('/api/user/saved', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ saved_id: savedId }),
        })
        setIsSaved(false)
        setSavedId(null)
      } else {
        const resp = await fetch('/api/user/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ report_id: report.id }),
        })
        const data = await resp.json()
        if (data.success) {
          setIsSaved(true)
          setSavedId(data.saved_id)
        }
      }
    } catch (e) {
      console.error('Error toggling save:', e)
    } finally {
      setSaving(false)
    }
  }, [user, report, saving, isSaved, savedId])

  const handleShare = useCallback(() => {
    if (typeof window === 'undefined') return
    const url = window.location.href
    if ((navigator as any).share) {
      ;(navigator as any).share({ title: report?.title || 'Paradocs', url }).catch(() => {})
      return
    }
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [report?.title])

  // ── Precision logic for the map ────────────────────────────
  const mapPrecision: LocationPrecision = useMemo(() => {
    const meta = report?.metadata || {}
    const raw = (meta.location_precision || meta.locationPrecision || '').toString().toLowerCase()
    if (raw === 'exact') return 'exact'
    if (raw === 'city' || raw === 'town') return 'city'
    if (raw === 'region' || raw === 'state' || raw === 'province' || raw === 'county') return 'region'
    if (raw === 'country') return 'country'
    if (report?.city) return 'city'
    if (report?.state_province || report?.country) return 'region'
    return 'unknown'
  }, [report])

  const pinLabel = useMemo(() => {
    if (report?.city) return [report.city, report.state_province].filter(Boolean).join(', ')
    if (report?.location_name) return report.location_name
    return null
  }, [report])

  const regionLabel = useMemo(() => {
    const parts: string[] = []
    if (report?.state_province) parts.push(report.state_province)
    if (report?.country && report.country !== 'United States') parts.push(report.country)
    return parts.length ? parts.join(', ') : (report?.location_name || null)
  }, [report])

  // ── Phenomenology display ──────────────────────────────────
  const phenomenonTypeName = (report?.phenomenon_type && (report.phenomenon_type as any).name) || null
  const phenomenonTypeSlug = (report?.phenomenon_type && (report.phenomenon_type as any).slug) || null
  const categoryConfig = CATEGORY_CONFIG[report?.category as keyof typeof CATEGORY_CONFIG] as any
  const categoryLabel = (categoryConfig && categoryConfig.label) || report?.category || null

  // ── Anonymization gate ─────────────────────────────────────
  // Only directly-submitted reports with anonymous_submission=false
  // opt into showing identifying info. Default for everything else
  // is anonymous.
  const anonymize = report?.anonymous_submission !== false
  // Submitter display name is only consulted when anonymize=false,
  // and even then we never expose real names — only display_name.
  const submitterDisplayName = sanitized.submitterDisplayName || null

  // ── Source URL + excerpt for the SourceBlock ───────────────
  const sourceUrl = report?.source_url || null
  const sourceLabel = report?.source_label || null
  // For Tier 2 attribution cards, the excerpt comes from the
  // source's own meta-description / first paragraph. We stash
  // that in metadata.source_excerpt during ingestion.
  const sourceExcerpt = (report?.metadata && (report.metadata.source_excerpt || report.metadata.description)) || null
  const sourceThumbnail = (report?.metadata && (report.metadata.thumbnail_url || report.metadata.og_image)) || null

  // ── Pull primary additional media for the source block ─────
  // The PRIMARY embed comes from source_url via SourceBlock.
  // Additional media (user-uploaded photos for direct submissions,
  // mostly) renders as a strip beneath.
  const additionalMedia = useMemo(() => {
    if (!Array.isArray(media)) return []
    return media
      .filter((m: any) => m && (m.media_type === 'image' || m.media_type === 'document'))
      .map((m: any) => ({
        id: m.id,
        media_type: m.media_type,
        url: m.url,
        thumbnail_url: m.thumbnail_url,
        caption: m.caption,
      }))
  }, [media])

  return (
    <>
      <Head>
        <title>{report?.title ? report.title + ' | Paradocs' : 'Report | Paradocs'}</title>
        {sanitized.answerLine && (
          <meta name="description" content={sanitized.answerLine} />
        )}
      </Head>

      <article className="min-h-screen bg-gray-950 text-gray-100">
        {/* ── 1. Animated map (replaces hero image) ──────────── */}
        <ReportLocationMap
          latitude={report?.latitude}
          longitude={report?.longitude}
          precision={mapPrecision}
          pinLabel={pinLabel}
          regionLabel={regionLabel}
        />

        <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-12">
          {/* ── Page chrome: back + single save affordance ─── */}
          <header className="flex items-center justify-between gap-2 -mt-8 mb-6 relative z-10">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-gray-900/80 backdrop-blur-sm border border-gray-700 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-900/80 backdrop-blur-sm border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
                aria-label={copied ? 'Link copied' : 'Share'}
                title={copied ? 'Link copied' : 'Share'}
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !user}
                className={
                  'inline-flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-sm border transition-colors ' +
                  (isSaved
                    ? 'bg-purple-600/30 border-purple-500/60 text-purple-100'
                    : 'bg-gray-900/80 border-gray-700 text-gray-300 hover:bg-gray-800')
                }
                aria-label={isSaved ? 'Saved' : (user ? 'Save' : 'Sign in to save')}
                aria-pressed={isSaved}
                title={isSaved ? 'Saved to Lab' : (user ? 'Save to Lab' : 'Sign in to save')}
              >
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : isSaved
                    ? <BookmarkCheck className="w-4 h-4" />
                    : <Bookmark className="w-4 h-4" />}
              </button>
            </div>
          </header>

          {/* ── 2. Title ────────────────────────────────────── */}
          <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-3">
            {sanitized.title || 'Untitled report'}
          </h1>

          {/* ── 3. Answer line (TL;DR) ──────────────────────── */}
          {sanitized.answerLine && (
            <p className="text-base text-gray-200 leading-relaxed mb-5 font-medium">
              {sanitized.answerLine}
            </p>
          )}

          {/* ── 4. Meta block ──────────────────────────────── */}
          <ReportMeta
            anonymizeSubmitter={anonymize}
            submitterDisplayName={submitterDisplayName}
            eventDate={report?.event_date}
            eventDateText={report?.event_date_text}
            city={report?.city}
            stateProvince={report?.state_province}
            country={report?.country}
            locationName={report?.location_name}
            witnessCount={report?.witness_count}
            submitterWasWitness={report?.submitter_was_witness}
            className="mb-5"
          />

          {/* ── 5. Phenomena & cross-disciplinary chips ─────── */}
          <ReportPhenomenaChips
            phenomenonTypeName={phenomenonTypeName}
            phenomenonTypeSlug={phenomenonTypeSlug}
            category={report?.category}
            categoryLabel={categoryLabel}
            similarPhenomena={sanitized.similarPhenomena}
            className="mb-6"
          />

          {/* ── 6. Experience description ──────────────────── */}
          {sanitized.narrative && (
            <div className="mb-6 prose prose-invert max-w-none">
              <p className="text-base text-gray-100 leading-relaxed whitespace-pre-line">
                {sanitized.narrative}
              </p>
            </div>
          )}

          {/* ── 7. Source attribution + media (3 tiers) ────── */}
          {sourceUrl && (
            <SourceBlock
              sourceUrl={sourceUrl}
              sourceLabel={sourceLabel}
              excerpt={sourceExcerpt}
              thumbnailUrl={sourceThumbnail}
              additionalMedia={additionalMedia}
              className="mb-6"
            />
          )}

          {/* ── 8. Below the fold ──────────────────────────── */}
          <ReportBelowFold
            reportSlug={report?.slug}
            pullQuote={sanitized.pullQuote}
            alternativeExplanations={sanitized.alternativeExplanations}
            relatedReports={relatedReports}
          />
        </div>
      </article>
    </>
  )
}

// ── PII / anonymization render-time helpers ──────────────────

function sanitizeReport(report: any): {
  title: string
  answerLine: string | null
  narrative: string | null
  pullQuote: string | null
  alternativeExplanations: AlternativeExplanation[]
  similarPhenomena: string[]
  submitterDisplayName: string | null
} {
  if (!report) {
    return {
      title: '',
      answerLine: null,
      narrative: null,
      pullQuote: null,
      alternativeExplanations: [],
      similarPhenomena: [],
      submitterDisplayName: null,
    }
  }

  const reportId = report.id

  // Title — passed through PII filter (rare but possible).
  const title = stripPiiWithLogging(report.title, { field: 'reports.title', reportId }) || ''

  // Answer line (V10.4 new field). Strip PII as defense in depth.
  const answerLine = report.answer_line
    ? stripPiiWithLogging(report.answer_line, { field: 'reports.answer_line', reportId })
    : null

  // Narrative — the centerpiece of the page. Most likely place
  // for a PII leak; the regex backstop runs here too.
  const narrative = report.paradocs_narrative
    ? stripPiiWithLogging(report.paradocs_narrative, { field: 'reports.paradocs_narrative', reportId })
    : null

  // Pull quote + alternative explanations (V10.4 dropped
  // credibility_signal — we DO NOT surface it anywhere).
  const assessment = report.paradocs_assessment || {}
  const pullQuote = assessment.pull_quote
    ? stripPiiWithLogging(assessment.pull_quote, { field: 'reports.paradocs_assessment.pull_quote', reportId })
    : null

  const altExplanations: AlternativeExplanation[] = Array.isArray(assessment.mundane_explanations)
    ? assessment.mundane_explanations.map((ae: any) => ({
        explanation: stripPiiWithLogging(ae.explanation || '', { field: 'mundane_explanations.explanation', reportId }),
        likelihood: ae.likelihood,
        reasoning: ae.reasoning
          ? stripPiiWithLogging(ae.reasoning, { field: 'mundane_explanations.reasoning', reportId })
          : undefined,
      })).filter((ae: AlternativeExplanation) => ae.explanation && ae.explanation.length > 0)
    : []

  const similarPhenomena: string[] = Array.isArray(assessment.similar_phenomena)
    ? assessment.similar_phenomena.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : []

  // Submitter display name — only meaningful when caller checks
  // anonymous_submission. We never return real names; only the
  // profile display_name.
  const submitterDisplayName = (report.submitter_profile && report.submitter_profile.display_name) || null

  return {
    title,
    answerLine,
    narrative,
    pullQuote,
    alternativeExplanations: altExplanations,
    similarPhenomena,
    submitterDisplayName,
  }
}
