'use client'

/**
 * useTodayReturn — sessionStorage marker so report and phenomena pages know
 * the user came from /discover (Today) and should show a "← Back to Today" bar.
 *
 * Set the marker before navigating away from /discover; clear it from the
 * Today header when the user explicitly returns.
 *
 * SWC: var, function expressions, string concat only.
 */

var KEY = 'today_return_marker_v1'

interface ReturnMarker {
  set: number    // timestamp (ms)
  idx: number    // last-known feed position
  total: number  // total cards available at that point
}

export function setTodayReturnMarker(idx: number, total: number) {
  if (typeof window === 'undefined') return
  try {
    var payload: ReturnMarker = { set: Date.now(), idx: idx, total: total }
    sessionStorage.setItem(KEY, JSON.stringify(payload))
  } catch (e) {}
}

export function getTodayReturnMarker(): ReturnMarker | null {
  if (typeof window === 'undefined') return null
  try {
    var raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    var parsed = JSON.parse(raw)
    if (parsed && typeof parsed.idx === 'number') return parsed
  } catch (e) {}
  return null
}

export function clearTodayReturnMarker() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(KEY)
  } catch (e) {}
}

export default { setTodayReturnMarker: setTodayReturnMarker, getTodayReturnMarker: getTodayReturnMarker, clearTodayReturnMarker: clearTodayReturnMarker }
