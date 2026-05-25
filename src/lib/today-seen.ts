/**
 * today-seen.ts — Client-side "already seen" tracking for the
 * Today / Discover feed.
 *
 * V11.17.38 — Chase's PR-7 follow-up: a user who closes the tab and
 * returns the same day should see a fresh slice, not the same reports
 * they already scrolled past. Implements a 24h-rolling Set persisted
 * to localStorage. Items are marked "seen" when the user dwells >1.5s
 * OR taps / saves / votes — i.e. real engagement, not just a swipe-by.
 *
 * Server-side dedup would require schema work + an API contract
 * change. Client-side is enough for the "same browser, same day"
 * case (which is what Chase described). When users span devices we
 * fall back to the existing feed-v2 random-seed shuffle.
 */

const STORAGE_KEY = 'paradocs_today_seen_v1'
const TTL_MS = 24 * 60 * 60 * 1000  // 24h rolling window
const MAX_ENTRIES = 500              // upper bound so a power-user can't
                                     // pin every report on Earth into local
                                     // storage. Oldest get evicted.

interface SeenRecord {
  id: string
  ts: number   // when this id was marked seen (ms)
}

function readRaw(): SeenRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r: any) => r && typeof r.id === 'string' && typeof r.ts === 'number')
  } catch (_e) {
    return []
  }
}

function writeRaw(records: SeenRecord[]): void {
  if (typeof window === 'undefined') return
  try {
    // Cap to MAX_ENTRIES, keeping the newest.
    const trimmed = records.length > MAX_ENTRIES
      ? records.slice(records.length - MAX_ENTRIES)
      : records
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch (_e) {
    // quota exhausted, ignore — feed continues working without dedup.
  }
}

function pruneExpired(records: SeenRecord[]): SeenRecord[] {
  const cutoff = Date.now() - TTL_MS
  return records.filter(r => r.ts >= cutoff)
}

/**
 * Get all currently-valid seen IDs (within the 24h rolling window).
 * Cheap enough to call once at component mount.
 */
export function getSeenIds(): Set<string> {
  const fresh = pruneExpired(readRaw())
  // Side-effect: if we evicted anything, persist the pruned version
  // so the next read isn't doing the work again.
  if (fresh.length !== readRaw().length) writeRaw(fresh)
  return new Set(fresh.map(r => r.id))
}

/**
 * Mark a single report/phenomenon/special-card id as seen.
 * Idempotent — if the id is already present, refreshes its timestamp
 * (which extends its TTL by another 24h).
 */
export function markSeen(id: string): void {
  if (!id) return
  const records = pruneExpired(readRaw())
  // Remove any existing record for this id, then push a fresh one.
  const next = records.filter(r => r.id !== id)
  next.push({ id, ts: Date.now() })
  writeRaw(next)
}

/**
 * Clear all seen-state. Exposed for "Show everything" affordances /
 * debugging. Not currently wired into UI but available for the
 * day when users want a reset button.
 */
export function clearSeen(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(STORAGE_KEY) } catch (_e) {}
}

/**
 * Bulk mark — used when initial fetch yields a long list of items
 * and we want to track that the user "saw the menu" without firing
 * per-item events. Currently unused; reserved for future scoring.
 */
export function markSeenBulk(ids: string[]): void {
  if (!ids.length) return
  const set = new Set(ids)
  const records = pruneExpired(readRaw())
  const remaining = records.filter(r => !set.has(r.id))
  const now = Date.now()
  for (const id of ids) remaining.push({ id, ts: now })
  writeRaw(remaining)
}
