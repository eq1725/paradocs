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
import { ArrowLeft, Bookmark, BookmarkCheck, Share2, Loader2, TrendingUp, FileText, CalendarClock, Heart, User, BookOpen } from 'lucide-react'

import ReportLocationMap, { type LocationPrecision } from './ReportLocationMap'
import ReportMeta from './ReportMeta'
import ReportEngagementStrip from './ReportEngagementStrip'
import ReportPullQuote from './ReportPullQuote'
import ReportRelatedReports from './ReportRelatedReports'
// V10.7.B.2 — ReportPhenomenaChips usage absorbed into SourceAndWitnessBlock; import retained removed.
import SourceBlock from './SourceBlock'
import ReportBelowFold, { type RelatedReport, type AlternativeExplanation } from './ReportBelowFold'
import ResonanceButton from './ResonanceButton'
// V10.7.B.2 — WitnessProfilePill standalone usage replaced by SourceAndWitnessBlock; component file kept for backward-compat.
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
  /**
   * V10.7.B.0 — pre-fetched nearby reports (haversine RPC, 80km radius,
   * 50 row cap). Consumed by ReportLocationMap to render cluster
   * bubbles + single pins via Supercluster. Empty array = no nearby
   * data or the focal report has no coords.
   */
  nearby?: Array<{
    id: string
    slug: string
    title: string
    category: string | null
    latitude: number
    longitude: number
    distance_km: number
  }>
}

// ── Component ───────────────────────────────────────────────

export default function ReportPageV2({ report, media, relatedReports, patterns, nearby }: ReportPageV2Props) {
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
    if (report?.state_province) return 'region'
    if (report?.country) return 'country'
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
    // V10.7.I — always include country when there's no finer location.
    // The previous "skip US" rule made country-only US reports render
    // with no badge at all when state was missing too.
    if (report?.country) {
      if (parts.length > 0 && (report.country === 'United States' || report.country === 'USA')) {
        // State present — omit the redundant USA suffix
      } else {
        parts.push(report.country)
      }
    }
    return parts.length ? parts.join(', ') : (report?.location_name || null)
  }, [report])

  // V10.8.C — the engine's normalizeLocation utility now fills lat/lng
  // for every row before insert (precise geocode → state centroid →
  // country centroid). reports.coords_synthetic is the canonical "this
  // is a fuzzy pin, not a real address" flag. The render-side
  // COUNTRY_CENTROIDS table from V10.7.I has been removed — we just
  // read what the DB gives us.
  const mapCoords = useMemo(() => {
    if (typeof report?.latitude === 'number' && typeof report?.longitude === 'number') {
      const synthetic = (report as any).coords_synthetic === true
      return { lat: report.latitude, lng: report.longitude, fromFallback: synthetic }
    }
    return null
  }, [report])

  // V10.8.C — when coords_synthetic is true (centroid fallback), force
  // map zoom to country-scale so we don't pretend the centroid is a
  // real pin. Real precise coords keep whatever precision the adapter
  // reported (or location_precision from metadata).
  const mapPrecisionResolved: LocationPrecision = useMemo(() => {
    if (mapCoords && mapCoords.fromFallback) return 'country'
    return mapPrecision
  }, [mapCoords, mapPrecision])

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
        {/* V10.5 — map shrunk to ~35vh; V10.7.B.3 — mobile cut to
            22vh (~145px on a 6.5" phone) because the prior 35vh ate
            ~280px before scroll, pushing the story below the first
            scroll on every device. Desktop keeps 35vh — the side
            rail there isn't pixel-constrained the same way. The
            tailwind h-[22vh] sm:h-[35vh] pattern + matching min/max
            keeps the focal pin readable at both sizes. */}
        <div className="relative h-[22vh] sm:h-[35vh] min-h-[160px] max-h-[320px]">
          <ReportLocationMap
            latitude={mapCoords ? mapCoords.lat : report?.latitude}
            longitude={mapCoords ? mapCoords.lng : report?.longitude}
            precision={mapPrecisionResolved}
            pinLabel={pinLabel}
            regionLabel={regionLabel}
            height={1000 /* let the wrapper control via CSS */}
            className="absolute inset-0 h-full"
            nearby={nearby}
            nearbyHref={
              report?.latitude && report?.longitude
                ? '/map?center=' + report.latitude + ',' + report.longitude + '&zoom=8'
                : undefined
            }
          />
        </div>

        {/* V10.7.B.4 — Desktop side-rail revived (the V10.6 'dead-
            weight rail' was killed because it duplicated Related
            Reports). The new rail at lg+ carries:
              - Dateline composite (Meta + SourceWitness + Engagement)
              - Resonance prominent card
              - Pattern strip
            Main column at lg+ is purely body reading:
              - Title + answer line
              - Pull quote
              - Narrative
              - Source block
              - Paradocs Analysis
              - Related Reports (4-card grid — stays in main column
                because it needs the wider sm:grid-cols-2 layout)

            Container widens 3xl → 6xl at lg+. Main column is
            max-w-2xl (~672px) for optimal reading width; rail is
            320px. Total ~1024px at lg+ matches max-w-5xl effectively
            while leaving 128px of breathing room from max-w-6xl. */}
        <div className="max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 pb-12">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8 lg:items-start">
            {/* V10.7.B.4.1 — Main column wrapped in <main> so the grid
                container sees exactly TWO children (main + aside).
                Without this wrapper, every direct child (header, h1,
                <p>, etc.) becomes its own grid cell and they alternate
                across the two columns. */}
            <main className="min-w-0">
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

            {/* V10.7.B.7 — Source kicker above the title was DROPPED.
                The SOURCE row in the unified dateline below now
                carries the source attribution plus account type and
                indexed year, which is strictly more information than
                the kicker had. Showing both was duplicate. */}

            {/* ── 2. Title ────────────────────────────────────── */}
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-3">
              {sanitized.title || 'Untitled report'}
            </h1>

            {/* ── 3. Answer line (TL;DR) ──────────────────────── */}
            {sanitized.answerLine && (
              <p className="text-base text-gray-200 leading-relaxed mb-4 font-medium">
                {sanitized.answerLine}
              </p>
            )}

            {/* V10.7.B.4 — Dateline composite + resonance render
                INLINE on mobile only. On lg+ the same content lives
                in the right rail (rendered below in the <aside>).
                Duplicating the JSX is cheap; same data flows both
                places. ResonanceButton state is per-instance so a
                user on a hybrid device that resizes mid-read might
                see two independent states, but that's a corner case. */}
            <div className="lg:hidden mb-6">
              <ReportMeta
                anonymizeSubmitter={anonymize}
                submitterDisplayName={submitterDisplayName}
                eventDate={report?.event_date}
                eventDateText={report?.event_date_text}
                eventDatePrecision={(report as any)?.event_date_precision || null}
                city={report?.city}
                stateProvince={report?.state_province}
                country={report?.country}
                locationName={report?.location_name}
                witnessCount={report?.witness_count}
                submitterWasWitness={report?.submitter_was_witness}
                className="mb-1.5"
              />
              <SourceAndWitnessBlock
                phenomenonTypeName={phenomenonTypeName}
                phenomenonTypeSlug={phenomenonTypeSlug}
                category={report?.category}
                categoryLabel={categoryLabel}
                sourceLabel={sourceLabel}
                sourceType={report?.source_type}
                createdAt={report?.created_at}
                witnessProfile={report?.witness_profile}
                similarPhenomena={sanitized.similarPhenomena}
              />
              <ReportEngagementStrip
                viewCount={viewCount}
                savedCount={savedCount}
                commentCount={commentCount}
                readTimeWords={readTimeWords}
                className="mt-3 mb-4"
              />
              {report?.slug && (
                <div id="resonance-anchor">
                  <ResonanceButton
                    slug={report.slug}
                    variant="prominent"
                    className="m-0"
                  />
                </div>
              )}
            </div>

            {/* V10.7.B.2 — Pattern strip MOVED below the narrative.
                Previously rendered between metadata and pull quote;
                made the reader skip past a "how this fits the archive"
                claim before they knew what *this* was. Re-rendered
                between the source block and resonance bar (below) so
                it lands when the reader has finished the body and is
                ready for cross-corpus context. */}

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

            {/* V10.7.B.4 — Pattern strip renders INLINE on mobile
                only (was inline-always pre-B.4). On lg+ it lives in
                the right rail (rendered in the <aside> below). */}
            {patterns && patterns.length > 0 && (
              <div className="lg:hidden">
                <PatternStrip patterns={patterns} className="mb-6" />
              </div>
            )}

            {/* V10.7.B.7 — Resonance button HOISTED to between answer
                line and dateline grid (above). Removed from this
                position to eliminate the duplicate Chase flagged. The
                'Share your own experience' sub-CTA inside ResonanceButton
                still ships with the prominent variant up top, so the
                share-funnel surface is preserved. */}

            {/* V10.7.B.5 — Paradocs Analysis HOISTED above Related
                Reports. Per screenshot panel review: the analysis
                is the highest-value editorial content on the page
                after the narrative itself, so it belongs right
                after the body/source/pattern stack — NOT below the
                navigation card grid. 'Where to next' (related
                reports) comes last; 'what does this mean' comes
                first. Discussion stays inside ReportBelowFold as
                its own disclosure. */}
            <ReportBelowFold
              reportSlug={report?.slug}
              pullQuote={sanitized.pullQuote}
              frames={sanitized.frames}
              openQuestions={sanitized.openQuestions}
              alternativeExplanations={sanitized.alternativeExplanations}
              className="mt-2 mb-6"
            />

            {/* ── 7b. Related Reports (V10.6, repositioned V10.7.B.5)
                Stays in main column at all breakpoints — needs the
                wider sm:grid-cols-2 layout that wouldn't fit in the
                320px right rail. */}
            {relatedReports && relatedReports.length > 0 && (
              <ReportRelatedReports
                items={relatedReports}
                className="my-6"
              />
            )}
            </main>

          {/* V10.7.B.4 — Desktop side rail. Hidden on mobile (mobile
              renders these same components inline in the main column,
              gated by lg:hidden above). Sticky positioning keeps the
              dateline + resonance + pattern strip visible as the
              reader scrolls the body content in the main column.

              V10.7.B.4.2 — lg:top-24 clears the fixed page navbar
              (~70px). lg:pt-4 on the inner stack adds breathing room
              from the map's bottom edge on initial position (the main
              column has back button + curated badge + h1 padding it
              down; the rail has none of that without the explicit pt).
              V10.7.B.4.3 — bumped lg:pt-4 → lg:pt-12 to align the
              rail's first row (WHEN) with the top of the H1 title in
              the main column. Math: back button has -mt-8 (overlap)
              + 44px height + mb-6 (24px) = ~36px before title; pt-12
              (48px) lands the rail's first row roughly at the title's
              top edge, with a small overshoot that absorbs the
              optional curated-badge row when present. */}
          <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start lg:pt-12">
            <div className="space-y-5">
              <ReportMeta
                anonymizeSubmitter={anonymize}
                submitterDisplayName={submitterDisplayName}
                eventDate={report?.event_date}
                eventDateText={report?.event_date_text}
                eventDatePrecision={(report as any)?.event_date_precision || null}
                city={report?.city}
                stateProvince={report?.state_province}
                country={report?.country}
                locationName={report?.location_name}
                witnessCount={report?.witness_count}
                submitterWasWitness={report?.submitter_was_witness}
                className="mb-1.5"
              />
              <SourceAndWitnessBlock
                phenomenonTypeName={phenomenonTypeName}
                phenomenonTypeSlug={phenomenonTypeSlug}
                category={report?.category}
                categoryLabel={categoryLabel}
                sourceLabel={sourceLabel}
                sourceType={report?.source_type}
                createdAt={report?.created_at}
                witnessProfile={report?.witness_profile}
                similarPhenomena={sanitized.similarPhenomena}
              />
              <ReportEngagementStrip
                viewCount={viewCount}
                savedCount={savedCount}
                commentCount={commentCount}
                readTimeWords={readTimeWords}
              />
              {report?.slug && (
                <ResonanceButton
                  slug={report.slug}
                  variant="prominent"
                  className="m-0"
                />
              )}
              {patterns && patterns.length > 0 && (
                <PatternStrip patterns={patterns} />
              )}
            </div>
          </aside>
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

/**
 * V10.7.B.5 — Source & Witness rows (renamed from V10.7.B.2 block).
 *
 * Rendered IN THE SAME 88px grid as ReportMeta so When/Where/Who
 * and Source/Topic/Witness all read as one continuous dateline.
 * The earlier V10.7.B.2 bordered-card treatment made the block read
 * as a separate "metadata thing" and the screenshot panel review
 * called it noise — this redesign collapses the visual separation.
 *
 * Three rows max, each obeying the same hide rules:
 *   - SOURCE: account type · source · indexed year (muted text)
 *   - TOPIC:  phenomenon link · category link (linkable chips)
 *   - WITNESS: age · gender · occupation · state · alone/others
 *              (linkable chips, gated by confidence ≥ 0.4)
 */
function SourceAndWitnessBlock({
  phenomenonTypeName,
  phenomenonTypeSlug,
  category,
  categoryLabel,
  sourceLabel,
  sourceType,
  createdAt,
  witnessProfile,
  similarPhenomena,
  className,
}: {
  phenomenonTypeName?: string | null
  phenomenonTypeSlug?: string | null
  category?: string | null
  categoryLabel?: string | null
  sourceLabel?: string | null
  sourceType?: string | null
  createdAt?: string | null
  witnessProfile?: any
  similarPhenomena?: string[]
  className?: string
}) {
  // ── Row 1: source/category items ────────────────────────────
  const accountType =
    sourceType === 'user_submission' ? 'First-person submission' :
    sourceType === 'curated' || sourceType === 'editorial' ? 'Curated case' :
    'Archive source'
  const submittedDate = createdAt ? new Date(createdAt) : null
  const submittedYear = submittedDate && !isNaN(submittedDate.getTime())
    ? submittedDate.getFullYear()
    : null

  type Row1Item = { label: string; href?: string; muted?: boolean }
  const row1: Row1Item[] = []
  if (phenomenonTypeName && phenomenonTypeSlug) {
    row1.push({
      label: phenomenonTypeName,
      href: '/explore?phenomenon=' + encodeURIComponent(phenomenonTypeSlug),
    })
  }
  if (category && categoryLabel) {
    row1.push({
      label: categoryLabel,
      href: '/explore?category=' + encodeURIComponent(category),
    })
  }
  row1.push({ label: accountType, muted: true })
  if (sourceLabel) row1.push({ label: sourceLabel, muted: true })
  if (submittedYear) row1.push({ label: 'Indexed ' + submittedYear, muted: true })

  // ── Row 2: witness profile chips (V10.7.A.2 inlined) ────────
  const p = witnessProfile || {}
  const CONFIDENCE_FLOOR = 0.4
  const profileVisible =
    p && (typeof p.confidence !== 'number' || p.confidence >= CONFIDENCE_FLOOR)

  type Row2Chip = { label: string; href?: string }
  const row2: Row2Chip[] = []
  if (profileVisible) {
    const ageLabels: Record<string, string> = {
      'child': 'Child', 'teen': 'Teen', '18-29': '18–29',
      '30-49': '30–49', '50-69': '50–69', '70+': '70+',
    }
    const genderLabels: Record<string, string> = {
      female: 'Female', male: 'Male', nonbinary: 'Nonbinary',
    }
    const occLabels: Record<string, string> = {
      student: 'Student', military_vet: 'Military / veteran', medical: 'Medical',
      first_responder: 'First responder', aviation: 'Aviation',
      tradesperson: 'Tradesperson', office: 'Office worker', retired: 'Retired',
      other: 'Other occupation',
    }
    const stateLabels: Record<string, string> = {
      awake_alert: 'Awake & alert', meditation: 'Meditating',
      drowsy_falling_asleep: 'Drowsy / falling asleep', sleeping: 'Sleeping',
      driving: 'Driving', physical_activity: 'Active',
      intoxicated: 'Intoxicated',
    }
    if (p.age_range && p.age_range !== 'unspecified' && ageLabels[p.age_range]) {
      row2.push({ label: ageLabels[p.age_range], href: '/explore?witness_age=' + encodeURIComponent(p.age_range) })
    }
    if (p.gender && p.gender !== 'unspecified' && genderLabels[p.gender]) {
      row2.push({ label: genderLabels[p.gender], href: '/explore?witness_gender=' + encodeURIComponent(p.gender) })
    }
    if (p.occupation_category && p.occupation_category !== 'unspecified' && occLabels[p.occupation_category]) {
      row2.push({ label: occLabels[p.occupation_category], href: '/explore?witness_occupation=' + encodeURIComponent(p.occupation_category) })
    }
    if (p.state_at_event && p.state_at_event !== 'unspecified' && stateLabels[p.state_at_event]) {
      row2.push({ label: stateLabels[p.state_at_event], href: '/explore?witness_state=' + encodeURIComponent(p.state_at_event) })
    }
    if (p.with_others === true) row2.push({ label: 'With others' })
    else if (p.with_others === false) row2.push({ label: 'Alone' })
  }

  // ── Split row1 into a 'source' line and a 'topic' line ─────
  // The original "Row 1" stuffed phenomenon + category + source + year
  // into one wrapping line. Per V10.7.B.5 screenshot review that read
  // as noise. Now we split it into two semantically distinct rows:
  //   SOURCE: who published this case (account type, source, indexed)
  //   TOPIC:  what category / phenomenon (linkable to /explore)
  const sourceItems: Array<{ label: string; muted: boolean }> = []
  sourceItems.push({ label: accountType, muted: false })
  if (sourceLabel) sourceItems.push({ label: sourceLabel, muted: false })
  if (submittedYear) sourceItems.push({ label: 'Indexed ' + submittedYear, muted: true })

  type TopicChip = { label: string; href: string }
  const topicItems: TopicChip[] = []
  if (phenomenonTypeName && phenomenonTypeSlug) {
    topicItems.push({
      label: phenomenonTypeName,
      href: '/explore?phenomenon=' + encodeURIComponent(phenomenonTypeSlug),
    })
  }
  if (category && categoryLabel) {
    topicItems.push({
      label: categoryLabel,
      href: '/explore?category=' + encodeURIComponent(category),
    })
  }

  // ── Hide rule: all three rows empty ─────────────────────────
  if (sourceItems.length === 0 && topicItems.length === 0 && row2.length === 0) {
    return null
  }

  // V10.7.B.5 — match the 88px label-column grid from ReportMeta so
  // SOURCE/TOPIC/WITNESS read as a continuation of the WHEN/WHERE/WHO
  // dateline above. No bordered card chrome anymore — the alignment
  // IS the visual structure.
  // V10.7.B.8 — items-center (was items-start) for vertical centerline
  // alignment between the label cell (icon + 10px text) and value cell
  // (14px text). See ReportMeta for the same fix and explanation.
  return (
    <dl
      aria-label="Source and witness"
      className={
        'grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 items-center text-sm leading-snug ' +
        (className || '')
      }
    >
      {sourceItems.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 min-w-0 text-gray-400">
            <FileText className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <dt className="text-[10px] uppercase tracking-wider font-semibold truncate">Source</dt>
          </div>
          <dd className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-gray-300">
            {sourceItems.map((it, i) => (
              <React.Fragment key={i}>
                <span className={it.muted ? 'text-gray-500' : ''}>{it.label}</span>
                {i < sourceItems.length - 1 && <span className="text-gray-700" aria-hidden>·</span>}
              </React.Fragment>
            ))}
          </dd>
        </>
      )}

      {topicItems.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 min-w-0 text-purple-300/80">
            <BookOpen className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <dt className="text-[10px] uppercase tracking-wider font-semibold truncate">Topic</dt>
          </div>
          <dd className="min-w-0 flex flex-wrap items-center gap-x-1.5 text-gray-200">
            {topicItems.map((it, i) => (
              <React.Fragment key={i}>
                <Link
                  href={it.href}
                  className="text-purple-200 hover:text-purple-100 hover:underline underline-offset-2 decoration-purple-400/50"
                  title={'Browse all ' + it.label}
                >
                  {it.label}
                </Link>
                {i < topicItems.length - 1 && <span className="text-gray-700" aria-hidden>·</span>}
              </React.Fragment>
            ))}
          </dd>
        </>
      )}

      {row2.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 min-w-0 text-cyan-300/90">
            <User className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <dt className="text-[10px] uppercase tracking-wider font-semibold truncate">Witness</dt>
          </div>
          <dd className="min-w-0 flex flex-wrap items-center gap-x-1.5 text-gray-200">
            {row2.map((chip, i) => {
              // V10.7.B.6 — drop chip-pill styling. Chip inner padding
              // was offsetting the TEXT inside the chip from the grid
              // column boundary, so '18-29' looked ~8px right of where
              // 'A single witness' starts. Plain text in the same flex
              // row + '·' separators puts all values on one rhythm
              // with WHEN/WHERE/WHO/SOURCE above. Linkable items get
              // subtle hover-underline; non-linkable items render
              // plain so the eye can't mistake them for tappable.
              const isLink = !!chip.href
              const inner = (
                <span
                  className={
                    isLink
                      ? 'text-gray-100 hover:text-white hover:underline underline-offset-2 decoration-gray-500'
                      : 'text-gray-300'
                  }
                >
                  {chip.label}
                </span>
              )
              return (
                <React.Fragment key={i}>
                  {isLink ? <Link href={chip.href!}>{inner}</Link> : inner}
                  {i < row2.length - 1 && <span className="text-gray-700" aria-hidden>·</span>}
                </React.Fragment>
              )
            })}
          </dd>
        </>
      )}
    </dl>
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
          Similar cases
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
 * V10.7.B.6 — Always render. When count = 0, fall back to a CTA
 * ("Have you experienced something like this?") that still scrolls
 * to the below-fold ResonanceButton when tapped. The earlier
 * count > 0 gate meant most test-corpus reports never showed the
 * affordance above-fold; the below-fold prominent button was the
 * only resonance entry point, and Chase reasonably wanted it more
 * visible near the answer line.
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
  const hasCount = count > 0
  const label = hasCount
    ? (count === 1
        ? '1 reader has shared a similar experience'
        : count.toLocaleString() + ' readers have shared a similar experience')
    : 'Have you experienced something like this?'
  return (
    <button
      type="button"
      onClick={jumpToResonance}
      className={
        'group flex items-center gap-2 w-full text-left px-3.5 py-2 rounded-lg border border-purple-700/30 bg-purple-950/20 hover:bg-purple-950/30 hover:border-purple-500/50 transition-colors ' +
        (className || '')
      }
      title={hasCount ? "See who's resonated with this" : 'Mark resonance'}
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
