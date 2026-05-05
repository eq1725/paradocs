/**
 * Anonymous streak tracking — V8 retention engine.
 *
 * Tracks daily visits in localStorage for unsigned-in users. Per panel
 * review (REPORT_EDITORIAL_CARD_PANEL_REVIEW + earlier streak panel),
 * the day-3 sign-in nudge is the highest-leverage retention pattern
 * for unsigned-in users — endowed-progress effect (Duolingo, Headspace,
 * NYT Games) doubles continuation likelihood.
 *
 * Display rule: don't render the streak chip until day 3, then surface
 * with a dismissable "Sign in to save your streak →" nudge.
 *
 * Storage:
 *   - paradocs_anon_streak_last (ISO date YYYY-MM-DD): last visit
 *   - paradocs_anon_streak_days (integer): consecutive day count
 *
 * SWC-compatible: var, function expressions, string concat only.
 */

var STREAK_LAST_KEY = 'paradocs_anon_streak_last'
var STREAK_DAYS_KEY = 'paradocs_anon_streak_days'

function isoDate(d: Date): string {
  var year = d.getFullYear()
  var month = d.getMonth() + 1
  var day = d.getDate()
  return year + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day
}

function daysBetween(a: string, b: string): number {
  // Returns b - a in calendar days, treating both as midnight local.
  var da = new Date(a + 'T00:00:00')
  var db = new Date(b + 'T00:00:00')
  var ms = db.getTime() - da.getTime()
  return Math.round(ms / 86400000)
}

/**
 * Tick the anonymous streak. Call on every /discover mount for
 * unsigned-in users. Returns the current streak day count.
 *
 * Logic:
 *   - First visit: initialize to day 1
 *   - Same day as last visit: no-op, return existing count
 *   - One day after last visit: increment streak
 *   - Two+ days after last visit: streak broken, reset to 1
 */
export function tickAnonStreak(): number {
  if (typeof window === 'undefined') return 0
  try {
    var today = isoDate(new Date())
    var lastVisit = localStorage.getItem(STREAK_LAST_KEY)
    var daysRaw = localStorage.getItem(STREAK_DAYS_KEY)
    var days = daysRaw ? parseInt(daysRaw, 10) : 0
    if (isNaN(days) || days < 0) days = 0

    if (!lastVisit) {
      // First-ever visit
      localStorage.setItem(STREAK_LAST_KEY, today)
      localStorage.setItem(STREAK_DAYS_KEY, '1')
      return 1
    }

    if (lastVisit === today) {
      // Same calendar day — no change
      return days || 1
    }

    var gap = daysBetween(lastVisit, today)
    var nextDays: number
    if (gap === 1) {
      // Consecutive day — increment
      nextDays = days + 1
    } else if (gap > 1) {
      // Streak broken — reset
      nextDays = 1
    } else {
      // Future / negative gap (clock weirdness) — leave alone
      nextDays = days || 1
    }

    localStorage.setItem(STREAK_LAST_KEY, today)
    localStorage.setItem(STREAK_DAYS_KEY, String(nextDays))
    return nextDays
  } catch (e) {
    // localStorage disabled / quota exceeded — silently no-op
    return 0
  }
}

/**
 * Read the current anonymous streak day count without ticking.
 */
export function readAnonStreak(): number {
  if (typeof window === 'undefined') return 0
  try {
    var raw = localStorage.getItem(STREAK_DAYS_KEY)
    if (!raw) return 0
    var n = parseInt(raw, 10)
    return isNaN(n) || n < 0 ? 0 : n
  } catch (e) {
    return 0
  }
}

/**
 * Clear the anonymous streak record. Called after a successful sign-in
 * once the streak has been migrated to the user's account record.
 */
export function clearAnonStreak(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STREAK_LAST_KEY)
    localStorage.removeItem(STREAK_DAYS_KEY)
  } catch (e) {}
}

/**
 * Check whether the sign-in nudge should be shown. Per panel verdict:
 * don't surface anything until day 3. At day 3+, show the streak chip
 * AND a dismissable sign-in nudge.
 */
export function shouldShowAnonStreakNudge(streakDays: number, isAnonymous: boolean): boolean {
  return isAnonymous && streakDays >= 3
}

var NUDGE_DISMISSED_KEY = 'paradocs_anon_streak_nudge_dismissed'

/**
 * Has the user dismissed the sign-in nudge in this session? Stored as
 * 'YYYY-MM-DD' so the nudge can re-surface the next day.
 */
export function isNudgeDismissedToday(): boolean {
  if (typeof window === 'undefined') return false
  try {
    var raw = localStorage.getItem(NUDGE_DISMISSED_KEY)
    if (!raw) return false
    return raw === isoDate(new Date())
  } catch (e) {
    return false
  }
}

export function dismissNudgeForToday(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(NUDGE_DISMISSED_KEY, isoDate(new Date()))
  } catch (e) {}
}
