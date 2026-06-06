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

interface NearbyReport {
  id: string
  slug: string
  title: string
  category: string | null
  latitude: number
  longitude: number
  distance_km: number
}

interface ReportPageProps {
  slug: string
  initialReport?: any
  initialMedia?: any[]
  initialRelated?: RelatedReport[]
  initialPatterns?: PatternChip[]
  initialNearby?: NearbyReport[]
  fetchError?: boolean
  notFound?: boolean
}

export default function ReportPage({
  initialReport,
  initialMedia,
  initialRelated,
  initialPatterns,
  initialNearby,
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
      nearby={initialNearby || []}
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

  // V10.7.C REVERTED in V10.7.D: do NOT compute a source_excerpt
  // fallback for the 'What happened' slot. Chase's read: rendering
  // raw first-person source text in the third-person editorial slot
  // breaks the page's voice and duplicates what the source block
  // below already shows under proper fair-use attribution. The
  // 'What happened' section now ONLY renders when paradocs_narrative
  // is populated (AI third-person paraphrase). When null, the page
  // relies on the source block excerpt + lens cards for body content.
  // V10.7.D claim-check tuning makes narrative-null cases rare.

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
      // V11.17.98 — Before 404-ing, check whether this slug is a known
      // historical alias (a slug refreshed by the live ingestion path
      // or by the slug-refresh backfill script). If so, 301 to the
      // current canonical slug. Keeps shared links / push notifications
      // / SEO index entries working across the V11.17.98 rename pass.
      try {
        const { data: aliasRow } = await (sb
          .from('report_slug_aliases') as any)
          .select('report_id')
          .eq('old_slug', params.slug)
          .maybeSingle()
        if (aliasRow && (aliasRow as any).report_id) {
          const { data: currentRow } = await sb
            .from('reports')
            .select('slug')
            .eq('id', (aliasRow as any).report_id)
            .eq('status', 'approved')
            .maybeSingle()
          const currentSlug = currentRow && (currentRow as any).slug
          if (currentSlug && currentSlug !== params.slug) {
            return {
              redirect: {
                destination: '/report/' + currentSlug,
                permanent: true,
              },
              revalidate: 300,
            } as any
          }
        }
      } catch {
        // Best-effort. If the alias lookup fails for any reason, fall
        // through to the normal 404 path.
      }

      // V11.12 — Include `revalidate` on the notFound branch so Vercel
      // doesn't cache the 404 indefinitely. When a report is later
      // admin-approved (status pending_review → approved), the cached
      // 404 was sticking around: subsequent visits would hit Vercel's
      // edge cache and return 404 without re-running getStaticProps.
      // With `revalidate: 60`, the page re-checks the DB every minute
      // for blocked slugs, so newly-approved reports start rendering
      // within ~1 minute of approval. The admin-approve endpoint also
      // calls res.revalidate() for instant invalidation on its end.
      return { notFound: true, revalidate: 60 }
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

    // V10.7.E.8 — video data for user video submissions. Mirrors the
    // join feed-v2 does: pull the latest report_videos row that's
    // 'ready', sign both the playback URL and the sibling poster JPEG,
    // and attach the result to safeReport.video. Uses the service-role
    // key so private storage buckets are accessible. Signed URLs live
    // 4h, matching feed-v2's TTL.
    if ((reportData as any).has_video) {
      try {
        const { createClient: makeAdmin } = await import('@supabase/supabase-js')
        const admin = makeAdmin(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        const { data: videoRow } = await (admin
          .from('report_videos') as any)
          .select('id, storage_bucket, storage_path, transcript_segments, transcript_lang, duration_sec')
          .eq('report_id', (reportData as any).id)
          .eq('status', 'ready')
          .order('published_at', { ascending: false, nullsFirst: false } as any)
          .limit(1)
          .maybeSingle()
        if (videoRow && (videoRow as any).storage_path) {
          var SIGNED_TTL_SEC = 4 * 60 * 60
          var v: any = videoRow
          var bucket: string = v.storage_bucket || 'report_videos'
          var posterPath: string | null = null
          try {
            var p: string = v.storage_path
            var dot = p.lastIndexOf('.')
            if (dot > 0) posterPath = p.substring(0, dot) + '.jpg'
          } catch (_) { /* leave poster null */ }
          const signResults = await Promise.all([
            (admin.storage as any).from(bucket).createSignedUrl(v.storage_path, SIGNED_TTL_SEC),
            posterPath
              ? (admin.storage as any).from(bucket).createSignedUrl(posterPath, SIGNED_TTL_SEC).catch(function () { return null })
              : Promise.resolve(null),
          ])
          var signed: any = signResults[0]
          var posterSigned: any = signResults[1]
          if (signed?.data?.signedUrl) {
            ;(safeReport as any).video = {
              video_id: v.id,
              playback_url: signed.data.signedUrl,
              poster_url: posterSigned?.data?.signedUrl || null,
              segments: v.transcript_segments || null,
              duration_sec: v.duration_sec || null,
              transcript_lang: v.transcript_lang || null,
            }
          }
        }
      } catch (e: any) {
        console.warn('[getStaticProps] video signed-URL fetch failed:', e?.message || e)
      }
    }

    // V10.7.B.0 — fetch nearby reports for the map cluster overlay.
    // Calls the haversine RPC (single source of truth for "X km of Y")
    // so this and the /api/reports/[slug]/nearby endpoint produce
    // identical results. ~80km radius is the sweet spot for "drive-
    // and-explore" geography on the report-page mini-map; the
    // global /map page handles larger-radius browsing.
    let nearby: Array<{
      id: string; slug: string; title: string; category: string | null;
      latitude: number; longitude: number; distance_km: number;
    }> = []
    if ((reportData as any).latitude && (reportData as any).longitude) {
      try {
        const { data: rpcRows } = await (sb as any).rpc('nearby_reports_within_km', {
          p_report_id: (reportData as any).id,
          p_radius_km: 80,
          p_limit: 50,
        })
        if (Array.isArray(rpcRows)) {
          nearby = rpcRows.map((r: any) => ({
            id: r.id,
            slug: r.slug,
            title: r.title,
            category: r.category,
            latitude: typeof r.latitude === 'string' ? parseFloat(r.latitude) : r.latitude,
            longitude: typeof r.longitude === 'string' ? parseFloat(r.longitude) : r.longitude,
            distance_km: typeof r.distance_km === 'string' ? parseFloat(r.distance_km) : r.distance_km,
          }))
        }
      } catch (err) {
        console.warn('[getStaticProps] nearby RPC failed:', err)
      }
    }

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

    // V10.7.E — Pattern strip rebalanced. The V10.6.28 version had a
    // same-category chip that duplicated the Related Reports section
    // ("more reports in Psychic Phenomena" + a 4-card grid of those
    // reports right after). Dropped same-category. New facets:
    //
    //   - Geographic radius (uses already-fetched nearby data,
    //     pairs with the map hero) — most actionable
    //   - Same state (broader geographic browse)
    //   - Same witness state (uses V10.7.A witness_profile.state_at_event)
    //   - Same phenomenon type (narrower than category)
    //
    // Each chip carves the corpus on a DIFFERENT axis from Related
    // Reports (always category-anchored). Cap at 4 chips total.
    let patterns: Array<{ label: string; count: number; href: string }> = []
    try {
      const stateProv = (reportData as any).state_province
      const phenomenonTypeId = (reportData as any).phenomenon_type_id

      // Geographic radius — count from the nearby array we already
      // fetched. Cheap (already in memory). Pairs with the map at top.
      // V10.9.D.8 — display in miles for US-focused audience. Internal
      // radius stays in km because the haversine RPC takes km.
      if (nearby.length > 0 && (reportData as any).latitude && (reportData as any).longitude) {
        const radiusKm = 80
        const radiusMi = Math.round(radiusKm * 0.621371) // ≈ 50 mi
        const nm = nearby.length
        patterns.push({
          label: nm.toLocaleString() + ' similar cases within ' + radiusMi + ' mi',
          count: nm,
          href: '/map?center=' + (reportData as any).latitude + ',' + (reportData as any).longitude + '&zoom=8',
        })
      }

      // Same state/region (US-centric for now)
      if (stateProv) {
        const { count } = await (sb.from('reports') as any)
          .select('id', { count: 'exact', head: true })
          .eq('state_province', stateProv)
          .eq('status', 'approved')
        if (count && count > 1) {
          patterns.push({
            label: count.toLocaleString() + ' cases in ' + stateProv,
            count,
            href: '/explore?state=' + encodeURIComponent(stateProv),
          })
        }
      }

      // V10.7.E — Same witness state-of-consciousness. Uses the
      // witness_state_at_event generated column (V10.7.A.0) so this is
      // an indexed query, not a JSONB scan. Filter by the SAME state
      // the focal report's witness was in (meditating, driving,
      // sleeping, etc.) to find demographically-similar cases.
      const wState = (reportData as any).witness_state_at_event
      if (wState && wState !== 'unspecified') {
        const { count } = await (sb.from('reports') as any)
          .select('id', { count: 'exact', head: true })
          .eq('witness_state_at_event', wState)
          .neq('id', (reportData as any).id)
          .eq('status', 'approved')
        if (count && count > 0) {
          const STATE_LABELS: Record<string, string> = {
            awake_alert: 'while awake and alert',
            meditation: 'during meditation',
            drowsy_falling_asleep: 'while drowsy or falling asleep',
            sleeping: 'while sleeping',
            driving: 'while driving',
            physical_activity: 'during physical activity',
            intoxicated: 'while intoxicated',
          }
          const stateLabel = STATE_LABELS[wState] || wState.replace(/_/g, ' ')
          patterns.push({
            label: count.toLocaleString() + ' cases ' + stateLabel,
            count,
            href: '/explore?witness_state=' + encodeURIComponent(wState),
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

      // Cap at 4 chips for visual density.
      if (patterns.length > 4) patterns = patterns.slice(0, 4)
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
        initialNearby: nearby,
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
  perception_sensory: 'Perception',
  religion_mythology: 'Religion & Mythology',
  esoteric_practices: 'Esoteric Practices',
}

function prettyCategory(slug: string): string {
  return CATEGORY_PRETTY[slug] || slug.replace(/_/g, ' ')
}
