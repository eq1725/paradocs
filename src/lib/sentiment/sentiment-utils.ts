// V11.17.74 - Sentiment + endpoints (Tier 3D)
//
// Small set of helpers that translate numeric sentiment scores into
// the language-pattern descriptors the Lab surfaces use. All copy
// stays inside the editorial vocabulary fence from
// LAB_PANEL_REVIEW_V3 §5 (no diagnostic words).

export var ALLOWED_EMOTIONS: ReadonlyArray<string> = [
  'fear',
  'awe',
  'calm',
  'confusion',
  'anger',
  'sadness',
  'joy',
  'neutral',
]

/**
 * Bucket a valence score into a documentary-voice phrase.
 * Returns short noun-phrases suitable for "your account language reads
 * closer to <X>" copy.
 */
export function valenceLabel(valence: number | null): string {
  if (valence == null || isNaN(valence)) return 'neutral'
  if (valence <= -0.6) return 'sustained unease'
  if (valence <= -0.2) return 'initial alarm'
  if (valence < 0.2) return 'reportorial neutral'
  if (valence < 0.6) return 'curiosity-and-resolution'
  return 'wonder-and-calm'
}

/**
 * Bucket an arousal score into a short descriptor.
 */
export function arousalLabel(arousal: number | null): string {
  if (arousal == null || isNaN(arousal)) return 'unspecified intensity'
  if (arousal < 0.25) return 'low-affect / reportorial'
  if (arousal < 0.55) return 'moderate intensity'
  if (arousal < 0.8) return 'high intensity'
  return 'acute / overwhelmed'
}

/**
 * Render the dominant emotion as a documentary-voice noun phrase that
 * fits inside corpus-baseline copy:
 *   "<X>% of <phen_family> reports skew toward <emotionLabel>".
 */
export function emotionLabel(emotion: string | null | undefined): string {
  if (!emotion) return 'a neutral register'
  var e = String(emotion).toLowerCase()
  if (e === 'fear') return 'sustained alarm'
  if (e === 'awe') return 'wonder-and-awe'
  if (e === 'calm') return 'calm-and-resolution'
  if (e === 'confusion') return 'disorientation'
  if (e === 'anger') return 'anger-and-intrusion'
  if (e === 'sadness') return 'wistfulness'
  if (e === 'joy') return 'positive affect'
  return 'a neutral register'
}

/**
 * Format a numeric valence/arousal to a fixed-decimal string with the
 * sign preserved (so +0.230 not 0.230). Used by the smoke-test report.
 */
export function formatSignedScore(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '—'
  var v = n as number
  var s = v.toFixed(3)
  return v >= 0 ? '+' + s : s
}
