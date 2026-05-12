/**
 * unsave — V10.4 Phase 3
 *
 * Single shared entry-point for removing an entry from a user's
 * saves. Handles the three save surfaces:
 *
 *   • Legacy /discover bookmarks (saved_reports, saved_phenomena)
 *   • Constellation entries (full constellation_entries rows)
 *   • External artifacts (PasteUrl saves on constellation_artifacts)
 *
 * Mirrors the logic NodeDetailPanel uses for its Trash button —
 * but without the confirm() dialog (swipe-to-unsave is reversible
 * via the undo toast, so the dialog would feel obstructive).
 *
 * Returns the API response payload (when relevant) so callers can
 * surface a re-save mutation when the user taps Undo.
 */

import { supabase } from '@/lib/supabase'

export interface UnsaveTarget {
  /** The entry's id as it appears in userMapData.entryNodes. */
  id: string
  /** Legacy bookmark? (item is a discover-feed save) */
  isLegacyBookmark?: boolean
  /** Phenomenon save? (vs. report save) */
  isPhenomenonSave?: boolean
  /** Underlying report id if isLegacyBookmark + !isPhenomenonSave. */
  reportId?: string | null
  /** Underlying phenomenon id if isPhenomenonSave. */
  phenomenonId?: string | null
  /** Artifact id if external URL save. */
  artifactId?: string | null
}

export interface UnsaveResult {
  ok: boolean
  /** Surface-level kind so the undo handler knows how to restore. */
  kind: 'legacy_report' | 'legacy_phenomenon' | 'artifact' | 'entry'
  /** Any payload returned by the API. */
  payload?: any
  error?: string
}

export async function unsaveEntry(target: UnsaveTarget): Promise<UnsaveResult> {
  const sess = await supabase.auth.getSession()
  const token = sess.data.session?.access_token
  if (!token) return { ok: false, kind: 'entry', error: 'Not signed in' }

  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }

  const isLegacy = !!target.isLegacyBookmark
  const isPhen = target.isPhenomenonSave === true || (target.id || '').indexOf('savedphen:') === 0

  let url = ''
  let init: RequestInit = { method: 'DELETE', headers }
  let kind: UnsaveResult['kind'] = 'entry'

  if (isLegacy && isPhen) {
    if (!target.phenomenonId) return { ok: false, kind: 'legacy_phenomenon', error: 'Missing phenomenon_id' }
    url = '/api/user/saved-phenomena'
    init.body = JSON.stringify({ phenomenon_id: target.phenomenonId })
    kind = 'legacy_phenomenon'
  } else if (isLegacy) {
    if (!target.reportId) return { ok: false, kind: 'legacy_report', error: 'Missing report_id' }
    url = '/api/user/saved'
    init.body = JSON.stringify({ report_id: target.reportId })
    kind = 'legacy_report'
  } else if (target.artifactId) {
    url = '/api/constellation/artifacts/' + target.artifactId
    kind = 'artifact'
  } else {
    url = '/api/constellation/entries'
    init.body = JSON.stringify({ entry_id: target.id })
    kind = 'entry'
  }

  try {
    const resp = await fetch(url, init)
    const payload = await resp.json().catch(() => null)
    if (!resp.ok) {
      return { ok: false, kind, error: (payload && payload.error) || ('HTTP ' + resp.status), payload }
    }
    return { ok: true, kind, payload }
  } catch (err: any) {
    return { ok: false, kind, error: err?.message || String(err) }
  }
}

/**
 * Re-save an entry that was just unsaved (the undo flow).
 * Reverses unsaveEntry — same three cases.
 */
export async function resaveEntry(target: UnsaveTarget): Promise<UnsaveResult> {
  const sess = await supabase.auth.getSession()
  const token = sess.data.session?.access_token
  if (!token) return { ok: false, kind: 'entry', error: 'Not signed in' }

  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
  const isLegacy = !!target.isLegacyBookmark
  const isPhen = target.isPhenomenonSave === true || (target.id || '').indexOf('savedphen:') === 0

  let url = ''
  let body: any = null
  let kind: UnsaveResult['kind'] = 'entry'

  if (isLegacy && isPhen) {
    url = '/api/user/saved-phenomena'
    body = { phenomenon_id: target.phenomenonId }
    kind = 'legacy_phenomenon'
  } else if (isLegacy) {
    url = '/api/user/saved'
    body = { report_id: target.reportId }
    kind = 'legacy_report'
  } else if (target.artifactId) {
    // Artifact deletion is destructive — the artifact_id no longer
    // exists. Undo for artifacts is best-effort; the caller may need
    // to refetch from the user_map endpoint to recover the row.
    return { ok: false, kind: 'artifact', error: 'artifact_undo_not_supported' }
  } else {
    // Constellation entry undo would re-create the entry row. Not
    // currently supported by /api/constellation/entries POST shape.
    return { ok: false, kind: 'entry', error: 'entry_undo_not_supported' }
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const payload = await resp.json().catch(() => null)
    if (!resp.ok) {
      return { ok: false, kind, error: (payload && payload.error) || ('HTTP ' + resp.status), payload }
    }
    return { ok: true, kind, payload }
  } catch (err: any) {
    return { ok: false, kind, error: err?.message || String(err) }
  }
}
