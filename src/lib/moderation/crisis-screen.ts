/**
 * crisis-screen — lightweight first-pass detector for acute-crisis
 * language in user submissions.
 *
 * V11.41 — APP_EXPERIENCE_PANEL_REVIEW.md P0-6 (readiness plan
 * workstream C). Paradocs invites people to describe intense personal
 * experiences; some of what arrives will be someone in acute distress
 * rather than an anomalous account. The product's job is to notice,
 * offer resources gently, and route the report to priority human
 * review — never to block, shame, or amplify.
 *
 * Design constraints:
 *   - Client + server safe (pure function, no deps).
 *   - Conservative pattern list aimed at FIRST-PERSON acute intent.
 *     Third-person/historical mentions ("my grandmother took her own
 *     life in 1962") will sometimes match — that's acceptable: the
 *     only consequences are a supportive resources card and priority
 *     human review, both of which fail safe.
 *   - Never used to gate or reject a submission.
 *
 * SWC compat: var + function() form.
 */

export interface CrisisScreenResult {
  flagged: boolean
  matched: string[]
}

// First-person acute-intent patterns. Word-boundary anchored,
// case-insensitive. Deliberately short and high-precision.
var PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'suicide_intent', re: /\b(want|going|plan(?:ning)?|ready)\s+to\s+(kill\s+myself|end\s+(?:my\s+life|it\s+all)|die)\b/i },
  { label: 'suicide_direct', re: /\b(kill(?:ing)?\s+myself|end(?:ing)?\s+my\s+life|take\s+my\s+(?:own\s+)?life|suicidal|suicide\s+note)\b/i },
  { label: 'self_harm', re: /\b(hurt(?:ing)?\s+myself|harm(?:ing)?\s+myself|self[-\s]?harm(?:ing)?|cut(?:ting)?\s+myself)\b/i },
  { label: 'hopelessness_acute', re: /\b(no\s+reason\s+(?:left\s+)?to\s+(?:live|go\s+on)|better\s+off\s+dead|can'?t\s+go\s+on\s+(?:any\s*more|living))\b/i },
  { label: 'goodbye', re: /\b(this\s+is\s+(?:my\s+)?goodbye|saying\s+goodbye\s+to\s+everyone|won'?t\s+be\s+here\s+(?:tomorrow|much\s+longer))\b/i },
]

export function screenForCrisis(text: string): CrisisScreenResult {
  var matched: string[] = []
  var t = String(text || '')
  if (t.length > 0) {
    for (var i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i].re.test(t)) matched.push(PATTERNS[i].label)
    }
  }
  return { flagged: matched.length > 0, matched: matched }
}

export default screenForCrisis
