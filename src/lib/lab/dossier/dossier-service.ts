// V11.17.71 - Pro Dossier
//
// Persistence layer between the dossier compute engine and the API
// endpoints. Wraps:
//   - getOrComputeDossier — the lazy-on-first-view path
//   - forceRecompute      — manual refresh + cron path
//   - getDossierById      — read for export-pdf / share-card endpoints
//   - getDossierByShareToken — unauth public read
//
// All writes are service-role; all owner reads check user_id match.

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeChecksum,
  computeDossier,
  dossierStaleReason,
  getArchiveSize,
} from './dossier-engine'
import type { ProDossierRow, DossierSections } from './dossier-types'

/** Columns we always select. */
var DOSSIER_SELECT =
  'id, user_id, experience_report_id, sections_json, rarity_score, checksum, computed_at, created_at, updated_at, is_public_shareable, share_token'

/** Columns we always select for the user's experience input. */
var USER_REPORT_SELECT = `
  id, submitted_by, slug, title, summary, description, category, tags,
  paradocs_assessment, latitude, longitude, city, state_province, country,
  location_description, event_date, event_date_raw, event_time, phenomenon_type_id,
  status, created_at, updated_at,
  phenomenon_type:phenomenon_types(name)
`

function generateShareToken(): string {
  // 24 bytes of randomness → 32 base64url chars. Plenty unguessable.
  return crypto.randomBytes(24).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Look up the user's experience report. Returns null when missing OR
 * when the caller is not the owner (defensive — the API also gates).
 */
export async function fetchOwnedExperience(
  svc: SupabaseClient,
  userId: string,
  experienceReportId: string,
): Promise<any | null> {
  try {
    var r = await svc
      .from('reports')
      .select(USER_REPORT_SELECT)
      .eq('id', experienceReportId)
      .eq('submitted_by', userId)
      .neq('status', 'deleted')
      .maybeSingle()
    return (r && (r as any).data) || null
  } catch (_e) {
    return null
  }
}

/**
 * Lazy fetch — return cached Dossier if fresh, else compute and persist.
 * Returns { row, computed: boolean, stale_reason: string | null }.
 */
export async function getOrComputeDossier(
  svc: SupabaseClient,
  userId: string,
  experienceReportId: string,
  opts?: { force?: boolean },
): Promise<{ row: ProDossierRow | null; computed: boolean; stale_reason: string | null }> {
  var userReport = await fetchOwnedExperience(svc, userId, experienceReportId)
  if (!userReport) return { row: null, computed: false, stale_reason: 'no_experience' }

  var cached: ProDossierRow | null = null
  try {
    var cRes = await svc
      .from('pro_dossiers')
      .select(DOSSIER_SELECT)
      .eq('user_id', userId)
      .eq('experience_report_id', experienceReportId)
      .maybeSingle()
    cached = ((cRes && (cRes as any).data) || null) as ProDossierRow | null
  } catch (_e) {
    cached = null
  }

  var archiveSize = await getArchiveSize(svc)
  var checksum = computeChecksum(userReport, archiveSize)
  var staleReason: string | null = opts?.force
    ? 'forced'
    : dossierStaleReason(cached, userReport, checksum, archiveSize)
  if (!staleReason && cached) {
    return { row: cached, computed: false, stale_reason: null }
  }

  // Compute fresh.
  var sections: DossierSections = await computeDossier(svc, userReport)
  var rarity = sections.rarity_percentile.percentile

  // Preserve existing share token / public flag on recompute.
  var shareToken = cached?.share_token || null
  var isPublic = cached?.is_public_shareable || false

  var payload = {
    user_id: userId,
    experience_report_id: experienceReportId,
    sections_json: sections,
    rarity_score: rarity,
    checksum: checksum,
    computed_at: new Date().toISOString(),
    is_public_shareable: isPublic,
    share_token: shareToken,
  }

  try {
    var upRes = await svc
      .from('pro_dossiers')
      .upsert(payload, { onConflict: 'user_id,experience_report_id' })
      .select(DOSSIER_SELECT)
      .single()
    var row = ((upRes && (upRes as any).data) || null) as ProDossierRow | null
    return { row: row, computed: true, stale_reason: staleReason }
  } catch (e: any) {
    console.warn('[dossier-service] upsert failed:', e && e.message)
    return { row: cached, computed: false, stale_reason: staleReason }
  }
}

/** Force-recompute regardless of staleness. */
export async function forceRecompute(
  svc: SupabaseClient,
  userId: string,
  experienceReportId: string,
): Promise<ProDossierRow | null> {
  var out = await getOrComputeDossier(svc, userId, experienceReportId, { force: true })
  return out.row
}

/** Fetch by id, gating on owner OR (public + share_token enabled). */
export async function getDossierById(
  svc: SupabaseClient,
  dossierId: string,
  callerUserId: string | null,
): Promise<ProDossierRow | null> {
  try {
    var r = await svc
      .from('pro_dossiers')
      .select(DOSSIER_SELECT)
      .eq('id', dossierId)
      .maybeSingle()
    var row = ((r && (r as any).data) || null) as ProDossierRow | null
    if (!row) return null
    if (callerUserId && row.user_id === callerUserId) return row
    if (row.is_public_shareable && row.share_token) return row
    return null
  } catch (_e) {
    return null
  }
}

/** Fetch by share token — public, unauthenticated. */
export async function getDossierByShareToken(
  svc: SupabaseClient,
  token: string,
): Promise<ProDossierRow | null> {
  try {
    var r = await svc
      .from('pro_dossiers')
      .select(DOSSIER_SELECT)
      .eq('share_token', token)
      .eq('is_public_shareable', true)
      .maybeSingle()
    return ((r && (r as any).data) || null) as ProDossierRow | null
  } catch (_e) {
    return null
  }
}

/**
 * Toggle the public-share flag. Returns the updated row (with a
 * freshly minted share_token if we just turned public ON for the
 * first time).
 */
export async function togglePublicShare(
  svc: SupabaseClient,
  userId: string,
  dossierId: string,
  desiredFlag: boolean,
): Promise<ProDossierRow | null> {
  try {
    var current = await svc
      .from('pro_dossiers')
      .select(DOSSIER_SELECT)
      .eq('id', dossierId)
      .eq('user_id', userId)
      .maybeSingle()
    var row = ((current && (current as any).data) || null) as ProDossierRow | null
    if (!row) return null

    var newToken = row.share_token
    if (desiredFlag && !newToken) newToken = generateShareToken()

    var upd = await svc
      .from('pro_dossiers')
      .update({
        is_public_shareable: desiredFlag,
        share_token: newToken,
      })
      .eq('id', dossierId)
      .eq('user_id', userId)
      .select(DOSSIER_SELECT)
      .single()
    return ((upd && (upd as any).data) || null) as ProDossierRow | null
  } catch (e: any) {
    console.warn('[dossier-service] toggle failed:', e && e.message)
    return null
  }
}

/**
 * List the user's stale Dossiers (used by the nightly cron). Returns
 * the experience_report_ids that need recomputation, ordered by
 * staleness (oldest first).
 */
export async function listStaleDossiers(
  svc: SupabaseClient,
  limit: number,
): Promise<Array<{ user_id: string; experience_report_id: string; dossier_id: string }>> {
  try {
    var sinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    var r = await svc
      .from('pro_dossiers')
      .select('id, user_id, experience_report_id, computed_at')
      .lt('computed_at', sinceIso)
      .order('computed_at', { ascending: true })
      .limit(limit)
    var rows: any[] = (r && (r as any).data) || []
    return rows.map(function (x) {
      return { user_id: x.user_id, experience_report_id: x.experience_report_id, dossier_id: x.id }
    })
  } catch (_e) {
    return []
  }
}
