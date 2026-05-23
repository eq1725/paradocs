/**
 * V11.15.4 — Meta-commentary / non-experience detector.
 *
 * The consolidated AI extraction occasionally writes summaries that
 * literally state the source isn't a witnessed event:
 *
 *   "The source presents a probabilistic argument rather than a
 *    witnessed event."
 *   "This account is not a witnessed paranormal event but a
 *    meta-commentary."
 *   "The source is not a witnessed event but a rhetorical synthesis."
 *
 * These are free signals — when the AI's own output flags itself as
 * not-an-experience, we should auto-reject rather than ship to the
 * encyclopedia. Paradocs is an experience repository, not a forum for
 * opinion / synthesis / news-citation / solicitation content.
 *
 * Used by:
 *   - scripts/batch-ingest-worker.ts — gate on every new ingestion
 *   - scripts/purge-meta-reports.ts — sweep the existing corpus
 *
 * SWC compat: var + function() form.
 */

// Phrases the AI emits when it doesn't recognize a witness account.
// Match anywhere in summary / analysis / pull_quote. Case-insensitive.
export var META_COMMENTARY_PHRASES: string[] = [
  // Explicit AI self-admissions
  'not a witnessed event',
  'not a paranormal event',
  'not a paranormal experience',
  'not a witness account',
  'not a witnessed paranormal',
  'is not a witnessed',
  'rather than a witnessed event',
  'rather than a witness account',
  // Genre labels the AI assigns to non-experience content
  'meta-commentary',
  'meta commentary',
  'rhetorical synthesis',
  'rhetorical argument',
  'probabilistic argument',
  'philosophical argument',
  'thought experiment',
  // Framing verbs that almost always indicate analysis, not narration
  'the source presents',
  'the source is a synthesis',
  'the source is not a witnessed',
  'the author argues',
  'the author constructs',
  'the user reframes',
  'reframes the debate',
  'reframes the uap',
  'reframes the ufo',
  'inverting the burden of proof',
  'a rhetorical',
  'this is a discussion',
  'this is a critique',
  'this is an opinion',
  // Solicitation patterns
  'soliciting witness accounts',
  'seeks witnesses',
  'seeking witnesses',
  'for our interview series',
  'for our podcast',
  'for our radio show',
]

// Patterns matched against the RAW source text (title + body, pre-AI).
// These don't depend on AI output and run as a cheap reject in the
// quality scorer.
export var PRE_AI_REJECT_PATTERNS: RegExp[] = [
  // Solicitation
  /\b(seeks?|seeking|soliciting|recruiting|looking for|need)\s+(first[-\s]?hand\s+)?(witness(es)?|accounts?|stories|encounters|testimon(y|ies))\b/i,
  /\bfor\s+(my|our)\s+(podcast|radio\s+show|interview\s+series|documentary|youtube\s+channel)\b/i,
  /\binterview\s+series\b/i,
  // Historical news synthesis (cited media outlets followed by year)
  /\b(ABC|CBS|NBC|CNN|BBC|FOX|NPR|AP|Reuters)\s+(News|news|radio|report|tv|article)\b/,
  /\bdocumented\s+by\s+(ABC|CBS|NBC|CNN|BBC|FOX|NPR)\b/i,
  // Meta-commentary about disclosure / the debate
  /\b(the|UAP|UFO)\s+disclosure\s+(debate|movement|community|advocates?)\b/i,
  /\b(reframes?|reframing)\s+(the\s+)?(UAP|UFO|disclosure|debate|argument)\b/i,
  /\bcalls?\s+out\s+(\w+\s+)?(advocates?|insiders?|whistleblowers?|figures?)\b/i,
  /\binvert(ing|s|ed)?\s+the\s+burden\s+of\s+proof\b/i,
  // Synthesis posts ("connects X, Y, and Z")
  /\bconnects?\s+\w+(\s+\w+)?(['']s)?\s+(congressional\s+)?(testimony|claims?|allegations?)\b.{0,80}\b(into|with)\s+(a\s+)?(single|cascading|broader)\b/i,
]

// Returns the first phrase that matched, or null if none.
export function findMetaCommentaryPhrase(text: string): string | null {
  if (!text) return null
  var lower = text.toLowerCase()
  for (var i = 0; i < META_COMMENTARY_PHRASES.length; i++) {
    var phrase = META_COMMENTARY_PHRASES[i]
    if (lower.indexOf(phrase) !== -1) return phrase
  }
  return null
}

// Returns the first pattern that matched, or null. Use against raw
// source text (title + body) BEFORE the AI runs.
export function findPreAiRejectPattern(rawText: string): string | null {
  if (!rawText) return null
  for (var j = 0; j < PRE_AI_REJECT_PATTERNS.length; j++) {
    var re = PRE_AI_REJECT_PATTERNS[j]
    if (re.test(rawText)) return re.source
  }
  return null
}

// Convenience: examine all AI-output fields at once.
export function findMetaInAiOutput(parsed: {
  summary?: string | null
  analysis?: string | null
  pull_quote?: string | null
  feed_hook?: string | null
}): { field: string; phrase: string } | null {
  var fields: Array<keyof typeof parsed> = ['summary', 'analysis', 'pull_quote', 'feed_hook']
  for (var k = 0; k < fields.length; k++) {
    var f = fields[k]
    var text = parsed[f]
    if (typeof text !== 'string') continue
    var hit = findMetaCommentaryPhrase(text)
    if (hit) return { field: String(f), phrase: hit }
  }
  return null
}
