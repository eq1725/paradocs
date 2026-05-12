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
import ReportEngagementStrip from './ReportEngagementStrip'
import ReportPullQuote from './ReportPullQuote'
import ReportRelatedReports from './ReportRelatedReports'
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
  // V10.5 — when the source row has explicit metadata.location_precision,
  // we trust it. Otherwise we infer from which fields are populated.
  // CRITICAL: we also detect "centroid-looking" coordinates (state-
  // capital / country-center placeholders) by checking whether the
  // coords land suspiciously close to a known state/country centroid.
  // When detected, we downgrade precision to 'region' so the map
  // renders a badge instead of a misleading pin (the Georgia → Atlantic
  // bug stemmed from a state-centroid placeholder coord).
  const mapPrecision: LocationPrecision = useMemo(() => {
    const meta = report?.metadata || {}
    const raw = (meta.location_precision || meta.locationPrecision || '').toString().toLowerCase()
    if (raw === 'exact') return 'exact'
    if (raw === 'city' || raw === 'town') return 'city'
    if (raw === 'region' || raw === 'state' || raw === 'province' || raw === 'county') return 'region'
    if (raw === 'country') return 'country'
    // No explicit precision — infer.
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

  // ── Engagement metrics ────────────────────────────────────
  // savedCount comes back as `saved_count` on the report row when
  // we add the aggregate (see getStaticProps). View + comment
  // counts have been on the row for ages.
  const viewCount = typeof report?.view_count === 'number' ? report.view_count : null
  const savedCount = typeof report?.saved_count === 'number' ? report.saved_count : null
  const commentCount = typeof report?.comment_count === 'number' ? report.comment_count : null
  const readTimeWords = useMemo(() => {
    let total = 0
    if (sanitized.narrative) total += sanitized.narrative.split(/\s+/).filter(Boolean).length
    if (sanitized.answerLine) total += sanitized.answerLine.split(/\s+/).filter(Boolean).length
    return total
  }, [sanitized.narrative, sanitized.answerLine])

  // Split the AI narrative on \n\n into proper paragraphs for
  // mobile readability (V10.5). Previously the whole thing shipped
  // as one block.
  const narrativeParagraphs = useMemo(() => {
    if (!sanitized.narrative) return []
    return sanitized.narrative
      .split(/\n\s*\n+/)
      .map(p => p.trim())
      .filter(Boolean)
  }, [sanitized.narrative])

  // Curated-case detection — was rendered as "Notable Case" pre-V10.5
  // which read as editorial endorsement to mass-market eyes. Reword
  // to "Curated case" (descriptive, not endorsing).
  const isCurated = !!(report?.featured || report?.source_type === 'curated' || report?.source_type === 'editorial')

  // V10.6 — OG image URL MUST be absolute. Social platforms
  // (iMessage, Slack, Twitter, Discord, etc.) fetch the og:image
  // independently of the page request, so a relative URL
  // resolves to nothing. iOS Safari's share-sheet preview was
  // falling back to the generic site icon because of this.
  // Try in order: env var → window.location.origin → known prod URL.
  const siteUrl =
    (typeof process !== 'undefined' && process.env && (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL)) ||
    (typeof window !== 'undefined' && window.location && window.location.origin) ||
    'https://www.discoverparadocs.com'
  const ogImageUrl = report?.slug ? siteUrl + '/api/og/report/' + report.slug : null
  const canonicalUrl = report?.slug ? siteUrl + '/report/' + report.slug : siteUrl

  return (
    <>
      <Head>
        <title>{report?.title ? report.title + ' | Paradocs' : 'Report | Paradocs'}</title>
        {sanitized.answerLine && (
          <meta name="description" content={sanitized.answerLine} />
        )}
        {/* V10.6 — Open Graph + Twitter Card with ABSOLUTE URLs. */}
        {ogImageUrl && (
          <>
            <meta property="og:title" content={(sanitized.title || 'Paradocs report')} />
            {sanitized.answerLine && (
              <meta property="og:description" content={sanitized.answerLine} />
            )}
            <meta property="og:image" content={ogImageUrl} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta property="og:image:type" content="image/png" />
            <meta property="og:type" content="article" />
            <meta property="og:url" content={canonicalUrl} />
            <meta property="og:site_name" content="Paradocs" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={(sanitized.title || 'Paradocs report')} />
            {sanitized.answerLine && (
              <meta name="twitter:description" content={sanitized.answerLine} />
            )}
            <meta name="twitter:image" content={ogImageUrl} />
            <link rel="canonical" href={canonicalUrl} />
          </>
        )}
      </Head>

      <article className="min-h-screen bg-gray-950 text-gray-100">
        {/* ── 1. Animated map (replaces hero image) ──────────── */}
        {/* V10.5 — map shrunk to ~35vh (was 240px ≈ 28vh per the
            panel: too dominating for what's essentially context). */}
        <div className="relative" style={{ height: '35vh', minHeight: 200, maxHeight: 320 }}>
          <ReportLocationMap
            latitude={report?.latitude}
            longitude={report?.longitude}
            precision={mapPrecision}
            pinLabel={pinLabel}
            regionLabel={regionLabel}
            height={1000 /* let the wrapper control via CSS */}
            className="absolute inset-0 h-full"
          />
        </div>

        {/* V10.6 — Side rail dropped. The rail was rendering the
            same Related Reports already shown inline, so it was
            dead weight. Main column widens to max-w-3xl centered;
            desktop wastes less screen, mobile unchanged. */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
          <div>
            {/* ── Page chrome ────────────────────────────────── */}
            <header className="flex items-center justify-between gap-2 -mt-8 mb-6 relative z-10">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-full bg-gray-900/85 backdrop-blur-sm border border-gray-700 text-xs text-gray-300 hover:bg-gray-800 transition-colors min-h-[44px]"
                aria-label="Back"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleShare}
                  className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-gray-900/85 backdrop-blur-sm border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
                  aria-label={copied ? 'Link copied' : 'Share'}
                  title={copied ? 'Link copied' : 'Share'}
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !user}
                  className={
                    'inline-flex items-center justify-center w-11 h-11 rounded-full backdrop-blur-sm border transition-colors ' +
                    (isSaved
                      ? 'bg-purple-600/30 border-purple-500/60 text-purple-100'
                      : 'bg-gray-900/85 border-gray-700 text-gray-300 hover:bg-gray-800')
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

            {/* Curated badge — V10.5 reframed from "Notable Case"
                (which read as endorsement) to "Curated case"
                (descriptive). Only renders when applicable. */}
            {isCurated && (
              <div
                className="inline-flex items-center gap-1 px-2 py-1 mb-2 rounded-md text-[10px] font-bold uppercase tracking-widest bg-purple-600/15 border border-purple-500/40 text-purple-200"
                title="Curated by Paradocs editorial — included in the index because of historical significance or pattern relevance."
              >
                Curated case
              </div>
            )}

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
              className="mb-4"
            />

            {/* ── 4b. Engagement strip (V10.5) ───────────────── */}
            <ReportEngagementStrip
              viewCount={viewCount}
              savedCount={savedCount}
              commentCount={commentCount}
              readTimeWords={readTimeWords}
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

            {/* ── 6. Experience description (V10.5 paragraph-split) */}
            {narrativeParagraphs.length > 0 && (
              <div className="mb-2 prose prose-invert max-w-none">
                {narrativeParagraphs.map((p, i) => (
                  <p key={i} className="text-base text-gray-100 leading-relaxed mb-4 last:mb-0">
                    {p}
                  </p>
                ))}
              </div>
            )}

            {/* ── 6b. Inline pull quote (V10.5) ──────────────── */}
            {sanitized.pullQuote && (
              <ReportPullQuote
                quote={sanitized.pullQuote}
                reportTitle={sanitized.title}
              />
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

            {/* ── 7b. Related Reports (V10.6) ────────────────
                Single visible 5-card grid. Was previously split
                across an above-fold 3-card preview AND a below-
                fold N-card accordion that rendered identical
                content. Merged per Chase's note. */}
            {relatedReports && relatedReports.length > 0 && (
              <ReportRelatedReports
                items={relatedReports}
                className="my-6"
              />
            )}

            {/* ── 8. Below the fold (collapsibles) ───────────── */}
            <ReportBelowFold
              reportSlug={report?.slug}
              pullQuote={sanitized.pullQuote}
              frames={sanitized.frames}
              openQuestions={sanitized.openQuestions}
              alternativeExplanations={sanitized.alternativeExplanations}
              className="mt-2"
            />
          </div>
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
  frames: Array<{ label: string; body: string }>
  openQuestions: string[]
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
      frames: [],
      openQuestions: [],
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

  // V10.6 — NEW: frames + open_questions replace the
  // alternative-explanations + likelihood pattern entirely.
  // We still parse alternativeExplanations for backward
  // compat with reports that haven't been regenerated yet
  // (they fall through with no frames rendered).
  const frames: Array<{ label: string; body: string }> = Array.isArray(assessment.frames)
    ? assessment.frames
        .map((f: any) => ({
          label: stripPiiWithLogging(f.label || '', { field: 'paradocs_assessment.frames.label', reportId }),
          body: stripPiiWithLogging(f.body || '', { field: 'paradocs_assessment.frames.body', reportId }),
        }))
        .filter((f: any) => f.label && f.body)
    : []

  const openQuestions: string[] = Array.isArray(assessment.open_questions)
    ? assessment.open_questions
        .map((q: any) => stripPiiWithLogging(typeof q === 'string' ? q : (q?.question || ''), { field: 'paradocs_assessment.open_questions', reportId }))
        .filter((q: string) => q && q.length > 0)
    : []

  // Legacy field — only surfaced when a report hasn't been
  // regenerated through the V10.6 pipeline yet.
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
    frames,
    openQuestions,
    alternativeExplanations: altExplanations,
    similarPhenomena,
    submitterDisplayName,
  }
}
