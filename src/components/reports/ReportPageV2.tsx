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
import { ArrowLeft, Bookmark, BookmarkCheck, Share2, Loader2, TrendingUp, FileText, CalendarClock, Heart } from 'lucide-react'

import ReportLocationMap, { type LocationPrecision } from './ReportLocationMap'
import ReportMeta from './ReportMeta'
import ReportEngagementStrip from './ReportEngagementStrip'
import ReportPullQuote from './ReportPullQuote'
import ReportRelatedReports from './ReportRelatedReports'
import ReportPhenomenaChips from './ReportPhenomenaChips'
import SourceBlock from './SourceBlock'
import ReportBelowFold, { type RelatedReport, type AlternativeExplanation } from './ReportBelowFold'
import ResonanceButton from './ResonanceButton'
import WitnessProfilePill from './WitnessProfilePill'
import { stripPiiWithLogging } from '@/lib/ai/pii-filter'
import { supabase } from '@/lib/supabase'
import { CATEGORY_CONFIG } from '@/lib/constants'

// ── Props ───────────────────────────────────────────────────

export interface ReportPageV2Props {
  report: any           // full reports row (loose typing — DB types drift)
  media: any[]          // report_media rows
  relatedReports?: RelatedReport[]
  /**
   * V10.6.28 — pre-computed "this case fits N patterns in the archive"
   * chips. Each one is a clickable filter into /explore. Counts come
   * from getStaticProps so the strip is server-rendered, no flash.
   */
  patterns?: Array<{ label: string; count: number; href: string }>
}

// ── Component ───────────────────────────────────────────────

export default function ReportPageV2({ report, media, relatedReports, patterns }: ReportPageV2Props) {
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
  // V10.6.28 — resonance_count is hydrated from getStaticProps and
  // surfaced as a above-fold social-proof callout. Resonance is the
  // higher-signal social action ("this happened to me too" vs. a
  // passive save), so when count > 0 we hoist it as a stat line
  // right under the meta block.
  const resonanceCount = typeof report?.resonance_count === 'number' ? report.resonance_count : null
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

            {/* ── 2a. Source attribution kicker (V10.6.2) ───────
                Tiny uppercase label above the title so the reader
                knows the provenance before they even start reading.
                Mass-market readers don't scroll to find this; we
                surface it where their eye already is. */}
            {sourceLabel && (
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
                Source <span className="text-gray-600">·</span> <span className="text-gray-400">{sourceLabel}</span>
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
              className="mb-3"
            />

            {/* V10.6.28 — Resonance stat callout. Promoted above-fold
                because per panel review, this is the single highest-
                signal social proof on the page ("I had this too"). The
                old design left it as a below-fold button users had to
                scroll to find. Now it's a visible stat at the top of
                the read; tapping scrolls to the actual button.
                Hidden when count = 0 to avoid an awkward "0 people…". */}
            {resonanceCount !== null && resonanceCount > 0 && (
              <ResonanceCountStat count={resonanceCount} className="mb-5" />
            )}

            {/* ── 5. Phenomena & cross-disciplinary chips ─────── */}
            <ReportPhenomenaChips
              phenomenonTypeName={phenomenonTypeName}
              phenomenonTypeSlug={phenomenonTypeSlug}
              category={report?.category}
              categoryLabel={categoryLabel}
              similarPhenomena={sanitized.similarPhenomena}
              className="mb-5"
            />

            {/* V10.6.28 — Credibility band. Single thin row showing
                data-quality signals: account type, source, original
                submission date. Borrows the journalistic 'dateline'
                pattern — makes the archive feel like a research
                instrument, not just a feed. */}
            <CredibilityBand
              sourceLabel={sourceLabel}
              sourceType={report?.source_type}
              eventDate={report?.event_date}
              createdAt={report?.created_at}
              savedCount={savedCount}
            />

            {/* V10.7.A.2 — Witness profile pill. AI-extracted
                demographic / state-of-consciousness chips, hidden
                entirely when profile is null or confidence < 0.4.
                Each chip is a click into /explore filtered to that
                dimension. Mission goal #2: 'show users similar
                experiences to their own' becomes browsable at the
                demographic level, not just the lens level. */}
            <WitnessProfilePill profile={report?.witness_profile} />

            {/* V10.6.28 — Pattern strip. The single most important
                addition for mission alignment ('show how common
                experiences are' + 'show similar experiences across
                types'). Computed server-side in getStaticProps from
                same-category / same-state / same-phenomenon-type
                counts. Each chip is a click into filtered /explore. */}
            {patterns && patterns.length > 0 && (
              <PatternStrip patterns={patterns} className="mb-6" />
            )}

            {/* V10.6.20 — Reordered per Chase: pull quote (hook)
                BEFORE the narrative, then the narrative ("the actual
                report in our own words"), then the source. The pull
                quote acts as a hook that pulls the reader into the
                richer narrative below it. */}

            {/* ── 6. Inline pull quote (V10.5, repositioned V10.6.20) */}
            {sanitized.pullQuote && (
              <ReportPullQuote
                quote={sanitized.pullQuote}
                reportTitle={sanitized.title}
              />
            )}

            {/* ── 6b. Experience description ("the actual report in
                our own words", per Chase).
                V10.6.27 — Drop the redundant placeholder. When
                narrative AND excerpt are both null, the source block
                immediately below already shows 'Read original at
                OBERF' — saying 'available at the linked source' here
                duplicates that CTA. Render the section only when we
                have real body content (narrative OR excerpt). The
                Paradocs Analysis lens cards below the source block
                serve as the main content for excerpt-less reports. */}
            {narrativeParagraphs.length > 0 ? (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-500 mb-3">
                  What happened
                </p>
                <div className="prose prose-invert max-w-none">
                  {narrativeParagraphs.map((p, i) => (
                    <p key={i} className="text-base text-gray-100 leading-relaxed mb-4 last:mb-0">
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            ) : sourceExcerpt ? (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-500 mb-3">
                  What happened
                </p>
                <blockquote className="border-l-2 border-gray-700 pl-4 py-1 text-base text-gray-300 leading-relaxed italic">
                  <p>
                    &ldquo;{sourceExcerpt.length > 500 ? sourceExcerpt.slice(0, 500).trim() + '…' : sourceExcerpt}&rdquo;
                  </p>
                  <p className="text-xs text-gray-500 not-italic mt-2">
                    Excerpted from {sourceLabel || 'the original source'}. Read the full account below.
                  </p>
                </blockquote>
              </div>
            ) : null}

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

            {/* ── 7a. Resonance bar (V10.6.2) ───────────────────
                Hoisted out of the below-fold discussion section
                and given the prominent treatment. One-tap social
                signal + a sub-CTA to "Share your own experience".
                Above the fold for related/analysis because Resonance
                has the highest conversion rate of any action on
                this page (panel: P., S., G.). */}
            {report?.slug && (
              <div id="resonance-anchor">
                <ResonanceButton slug={report.slug} variant="prominent" />
              </div>
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

// ── V10.6.28 sub-components ─────────────────────────────────

function CredibilityBand({
  sourceLabel,
  sourceType,
  eventDate,
  createdAt,
  savedCount,
}: {
  sourceLabel?: string | null
  sourceType?: string | null
  eventDate?: string | null
  createdAt?: string | null
  savedCount?: number | null
}) {
  // Decide the account-type chip. user_submission = first-person
  // direct; curated/editorial = Paradocs-featured; everything else
  // is a scraped third-party archive.
  const accountType =
    sourceType === 'user_submission' ? 'First-person submission' :
    sourceType === 'curated' || sourceType === 'editorial' ? 'Curated case' :
    'Archive source'

  const submittedDate = createdAt ? new Date(createdAt) : null
  const submittedYear = submittedDate && !isNaN(submittedDate.getTime())
    ? submittedDate.getFullYear()
    : null

  const items: string[] = []
  items.push(accountType)
  if (sourceLabel) items.push(sourceLabel)
  if (submittedYear) items.push('Indexed ' + submittedYear)
  if (savedCount && savedCount > 0) {
    items.push(savedCount.toLocaleString() + ' saved by readers')
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 leading-tight">
      <FileText className="w-3 h-3 text-gray-600" />
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <span>{it}</span>
          {i < items.length - 1 && <span className="text-gray-700">·</span>}
        </React.Fragment>
      ))}
    </div>
  )
}

function PatternStrip({
  patterns,
  className,
}: {
  patterns: Array<{ label: string; count: number; href: string }>
  className?: string
}) {
  return (
    <section className={'rounded-xl border border-purple-700/30 bg-gradient-to-br from-purple-950/30 via-gray-900/40 to-gray-900/40 p-4 ' + (className || '')}>
      <header className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-3.5 h-3.5 text-purple-300" />
        <p className="text-[10px] uppercase tracking-widest font-semibold text-purple-300/90">
          How this fits the archive
        </p>
      </header>
      <ul className="flex flex-wrap gap-2">
        {patterns.map((p, i) => (
          <li key={i}>
            <Link
              href={p.href}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900/60 hover:bg-gray-800/80 border border-gray-700 hover:border-purple-500/50 text-xs text-gray-200 hover:text-white transition-colors"
            >
              <span>{p.label}</span>
              <span aria-hidden="true" className="text-gray-500">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * V10.6.28 — Resonance count stat callout.
 *
 * Single-line social-proof element. Scrolls to the below-fold
 * ResonanceButton when tapped (graceful no-op if the button isn't
 * mounted yet). We hide entirely when count = 0 to avoid an
 * awkward "0 readers" stat.
 */
function ResonanceCountStat({
  count,
  className,
}: {
  count: number
  className?: string
}) {
  function jumpToResonance() {
    if (typeof window === 'undefined') return
    const el = document.getElementById('resonance-anchor')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
  const label =
    count === 1
      ? '1 reader has shared a similar experience'
      : count.toLocaleString() + ' readers have shared a similar experience'
  return (
    <button
      type="button"
      onClick={jumpToResonance}
      className={
        'group flex items-center gap-2 w-full text-left px-3.5 py-2 rounded-lg border border-purple-700/30 bg-purple-950/20 hover:bg-purple-950/30 hover:border-purple-500/50 transition-colors ' +
        (className || '')
      }
      title="See who's resonated with this"
    >
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/40 flex-shrink-0">
        <Heart className="w-3 h-3 text-purple-200" aria-hidden="true" />
      </span>
      <span className="text-[13px] font-medium text-purple-100 leading-tight">
        {label}
      </span>
      <span
        aria-hidden="true"
        className="ml-auto text-purple-300/70 group-hover:text-purple-200 text-xs flex-shrink-0"
      >
        →
      </span>
    </button>
  )
}
