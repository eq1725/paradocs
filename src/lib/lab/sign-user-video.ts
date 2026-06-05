// V11.17.78 - submission card upgrade
//
// signUserVideoUrl — shared signed-URL helper for the user's own
// report videos. Extracted from the duplicate copies that previously
// lived in `src/pages/report/[slug].tsx` (L223-270) and
// `src/pages/api/discover/feed-v2.ts` (L610-720) so the My Record
// surface can attach the same { posterUrl, videoUrl, durationSec }
// triple to a user's own dossier card without re-implementing the
// signing dance a third time.
//
// Why a Map result for the batch helper: lab.tsx loads up to 50
// reports per user and may need to sign the few that have video.
// Returning a `Map<reportId, video>` keeps the call site O(1) when
// it's painting per-experience cards.
//
// Storage convention (set by upload-url.ts + finalize.ts):
//   bucket = report_videos
//   storage_path = '<report_id>/<video_id>.mp4'
//   poster (server-generated) = same basename, .jpg extension
//
// SWC: var + function() form per repo convention.
//
// SECURITY: signs URLs with the service-role key. Only invoke this
// from server-side contexts (getServerSideProps, API routes). Never
// import this file into a browser bundle.

import { createClient } from '@supabase/supabase-js'

/** Shape of the (subset of) report row this helper needs. */
export interface ReportForVideoSigning {
  id: string
  has_video?: boolean | null
}

/** Shape returned for one signed video. */
export interface SignedUserVideo {
  videoId: string
  videoUrl: string | null
  posterUrl: string | null
  durationSec: number | null
  segments: unknown[] | null
  transcriptLang: string | null
}

/** Single-row signature requested by the panel spec. */
export interface SignUserVideoSingleResult {
  posterUrl: string | null
  videoUrl: string | null
  durationSec: number | null
}

var SIGNED_TTL_SEC = 60 * 60 // 1h per panel guidance for My Record

function getAdminClient() {
  var url = process.env.NEXT_PUBLIC_SUPABASE_URL
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('sign-user-video: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
}

/**
 * Sign the playback + poster URL for a single report.
 *
 * Returns nulls (not throws) when the report has no `has_video`,
 * has no matching `report_videos` row, or signing fails — every
 * failure mode degrades to "no video preview" on the card.
 */
export async function signUserVideoUrl(
  report: { id: string; has_video?: boolean | null },
): Promise<SignUserVideoSingleResult> {
  var empty: SignUserVideoSingleResult = { posterUrl: null, videoUrl: null, durationSec: null }
  if (!report || !report.id || !report.has_video) return empty

  try {
    var batch = await signUserVideosForReports([report])
    var hit = batch.get(report.id)
    if (!hit) return empty
    return {
      posterUrl: hit.posterUrl,
      videoUrl: hit.videoUrl,
      durationSec: hit.durationSec,
    }
  } catch (e: any) {
    console.warn('[sign-user-video] single signing failed', {
      report_id: report.id,
      message: e?.message || String(e),
    })
    return empty
  }
}

/**
 * Batch helper — sign every video-bearing report in one round trip,
 * keyed by report_id. Used by lab.tsx loadReports() so a user with
 * multiple video submissions gets all posters signed in parallel.
 */
export async function signUserVideosForReports(
  reports: ReportForVideoSigning[],
): Promise<Map<string, SignedUserVideo>> {
  var out = new Map<string, SignedUserVideo>()
  if (!reports || reports.length === 0) return out

  var withVideo = reports.filter(function (r) { return r && r.id && r.has_video === true })
  if (withVideo.length === 0) return out

  var admin
  try {
    admin = getAdminClient()
  } catch (e: any) {
    console.warn('[sign-user-video] admin client unavailable:', e?.message || e)
    return out
  }

  var ids = withVideo.map(function (r) { return r.id })

  var rowsResp: any = await (admin.from('report_videos') as any)
    .select('id, report_id, storage_bucket, storage_path, mime_type, duration_sec, transcript_segments, transcript_lang')
    .in('report_id', ids)
    .eq('status', 'ready')
    .order('published_at', { ascending: false, nullsFirst: false } as any)

  var rows: any[] = (rowsResp && rowsResp.data) || []
  if (rows.length === 0) return out

  // First row per report wins — already sorted published_at desc above.
  var firstPerReport: Record<string, any> = {}
  rows.forEach(function (v: any) {
    if (!firstPerReport[v.report_id]) firstPerReport[v.report_id] = v
  })

  var signOne = async function (v: any): Promise<void> {
    var bucket: string = v.storage_bucket || 'report_videos'
    var posterPath: string | null = null
    try {
      var p: string = v.storage_path || ''
      var dot = p.lastIndexOf('.')
      if (dot > 0) posterPath = p.substring(0, dot) + '.jpg'
    } catch (_e) { /* leave poster null */ }

    try {
      var signResults = await Promise.all([
        (admin.storage as any).from(bucket).createSignedUrl(v.storage_path, SIGNED_TTL_SEC),
        posterPath
          ? (admin.storage as any).from(bucket).createSignedUrl(posterPath, SIGNED_TTL_SEC).catch(function () { return null })
          : Promise.resolve(null),
      ])
      var signed: any = signResults[0]
      var posterSigned: any = signResults[1]
      if (signed && signed.data && signed.data.signedUrl) {
        out.set(v.report_id, {
          videoId: v.id,
          videoUrl: signed.data.signedUrl,
          posterUrl: (posterSigned && posterSigned.data && posterSigned.data.signedUrl) || null,
          durationSec: typeof v.duration_sec === 'number' ? v.duration_sec : null,
          segments: v.transcript_segments || null,
          transcriptLang: v.transcript_lang || null,
        })
      } else {
        console.warn('[sign-user-video] createSignedUrl returned no URL', {
          video_id: v.id,
          report_id: v.report_id,
          bucket: bucket,
          storage_path: v.storage_path,
          signed_error: signed && signed.error && signed.error.message,
        })
      }
    } catch (e: any) {
      console.warn('[sign-user-video] createSignedUrl threw', {
        video_id: v.id,
        report_id: v.report_id,
        bucket: v.storage_bucket || 'report_videos',
        storage_path: v.storage_path,
        message: e?.message || String(e),
      })
    }
  }

  await Promise.all(Object.keys(firstPerReport).map(function (rid) { return signOne(firstPerReport[rid]) }))

  return out
}
