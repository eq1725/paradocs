/**
 * Narrative paraphrase check — Copyright Sprint 2
 *
 * Pure function: compute n-gram overlap between Paradocs's
 * `paradocs_narrative` and the report's source `description`.
 *
 * Background:
 *   The Haiku narrative derivative-work sub-audit
 *   (HAIKU_NARRATIVE_DERIVATIVE_AUDIT.md) sampled 15 production rows and
 *   found 4/15 LIGHT-PARAPHRASE cases (5-gram overlap up to 3.6%, longest
 *   verbatim run up to 9 words). The audit recommends flagging anything
 *   above:
 *     - 5-gram overlap > 5%
 *     - longest verbatim 7-gram run >= 7 words
 *   for regeneration via the post-Sprint-1 (anti-paraphrase) prompt.
 *
 * Methodology (mirrors audit appendix):
 *   1. Lowercase both strings.
 *   2. Strip non-alphanumeric → all whitespace.
 *   3. Collapse whitespace → single spaces.
 *   4. Tokenize on whitespace.
 *   5. Build n-gram sets/sequences from each side.
 *
 * No external dependencies (Node stdlib only). Safe to use from a
 * tree-shaken Edge or browser environment.
 */

/**
 * Tokenize a string into normalized lowercase words. Punctuation and
 * symbols become whitespace, then whitespace is collapsed and split.
 */
export function tokenizeNarrative(input: string): string[] {
  if (!input) return [];
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(function (w) { return w.length > 0; });
}

/**
 * Build the set of distinct n-grams (joined by single space) from a
 * token sequence.
 */
function ngramSet(tokens: string[], n: number): Set<string> {
  var set = new Set<string>();
  if (tokens.length < n) return set;
  for (var i = 0; i <= tokens.length - n; i++) {
    set.add(tokens.slice(i, i + n).join(' '));
  }
  return set;
}

/**
 * Build the ORDERED list of n-grams (with duplicates) from a token
 * sequence — used for the longest-verbatim-run scan, which needs to
 * walk the narrative in order to find consecutive run lengths.
 */
function ngramList(tokens: string[], n: number): string[] {
  var out: string[] = [];
  if (tokens.length < n) return out;
  for (var i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

/**
 * 5-gram overlap fraction:
 *   |5-grams(narrative) ∩ 5-grams(source)| / |5-grams(narrative)|
 * Mirrors the audit method exactly. When the narrative is shorter than
 * 5 tokens, returns 0 (no n-grams to compare).
 */
function computeFivegramOverlap(narrativeTokens: string[], sourceTokens: string[]): number {
  var narr = ngramSet(narrativeTokens, 5);
  if (narr.size === 0) return 0;
  var src = ngramSet(sourceTokens, 5);
  var hits = 0;
  // Iterate without for...of so this compiles under ES5 target
  // (the rest of the codebase uses ES5-compatible idioms).
  narr.forEach(function (g) { if (src.has(g)) hits++; });
  return hits / narr.size;
}

/**
 * Longest contiguous verbatim run of tokens from the narrative that
 * also appears (anywhere) in the source. Walks the narrative position-
 * by-position; for each starting index in the narrative, finds the
 * longest match-length whose token sequence is present in any source
 * n-gram of the same length.
 *
 * Capped at 25 tokens to keep cost bounded for pathological inputs.
 * Returns 0 when nothing of length >= 4 matches (mirrors audit floor).
 */
function computeLongestVerbatimRun(narrativeTokens: string[], sourceTokens: string[]): number {
  if (narrativeTokens.length === 0 || sourceTokens.length === 0) return 0;

  // Pre-build n-gram membership for each n in [4..25] from source.
  // Memory cost is modest: ~22 sets, each up to (sourceLen - n + 1) entries.
  var MAX_RUN = 25;
  var sourceNgrams = new Map<number, Set<string>>();
  for (var n = 4; n <= MAX_RUN; n++) {
    sourceNgrams.set(n, ngramSet(sourceTokens, n));
  }

  var best = 0;
  for (var start = 0; start < narrativeTokens.length; start++) {
    // Greedy extend: for this starting position, find the longest
    // run-length L such that narrative[start..start+L) appears in source.
    // Skip if the 4-gram floor isn't met (audit's measurement floor).
    if (narrativeTokens.length - start < 4) break;
    var floor = narrativeTokens.slice(start, start + 4).join(' ');
    var floorSet = sourceNgrams.get(4)!;
    if (!floorSet.has(floor)) continue;

    var runLen = 4;
    for (var ext = 5; ext <= MAX_RUN && start + ext <= narrativeTokens.length; ext++) {
      var candidate = narrativeTokens.slice(start, start + ext).join(' ');
      var set = sourceNgrams.get(ext)!;
      if (set.has(candidate)) {
        runLen = ext;
      } else {
        break;
      }
    }
    if (runLen > best) best = runLen;
  }
  return best;
}

/**
 * Public API: take a narrative + its source body, return the metrics
 * and the flag verdict. The audit-recommended thresholds:
 *   - fivegramOverlap > 0.05
 *   - sevengramMaxRun >= 7
 * Either trigger flags the row.
 *
 * Note: `sevengramMaxRun` is a misnomer-for-clarity — we actually
 * compute the LONGEST contiguous verbatim run (not just 7-grams).
 * The field name advertises the threshold (>= 7) the audit set.
 */
export interface ParaphraseMetrics {
  fivegramOverlap: number;
  sevengramMaxRun: number;
  flagged: boolean;
}

export function checkParaphrase(
  narrative: string,
  sourceBody: string,
): ParaphraseMetrics {
  var narrTok = tokenizeNarrative(narrative);
  var srcTok = tokenizeNarrative(sourceBody);

  var fivegramOverlap = computeFivegramOverlap(narrTok, srcTok);
  var sevengramMaxRun = computeLongestVerbatimRun(narrTok, srcTok);

  var flagged = fivegramOverlap > 0.05 || sevengramMaxRun >= 7;

  return { fivegramOverlap, sevengramMaxRun, flagged };
}

/*
 * Unit-test sanity examples (run by eye, or wire into a future
 * jest/vitest pass — currently inline-documented to keep the lib
 * dependency-free):
 *
 *  Example 1 — fully transformative (audit Sample 10):
 *    narrative = "The witness was caught in a near-death state surrounded by glowing presences."
 *    source    = "I felt myself slip from my body and saw monks in robes around the bed."
 *    expected  → fivegramOverlap ≈ 0.0, sevengramMaxRun = 0, flagged = false
 *
 *  Example 2 — quoted witness fragment (audit Sample 4 — LIGHT-PARAPHRASE):
 *    narrative = 'The questions ("How am I here? Why am I being chased?") anchor the analysis.'
 *    source    = "asking myself a few questions such as how am I here why am I being chased which then leads"
 *    expected  → 9-word verbatim run "how am i here why am i being chased", flagged = true
 *
 *  Example 3 — short factual overlap (audit Sample 1):
 *    narrative = "Three witnesses observed an object hovering to the right of the moon."
 *    source    = "we noticed something hovering to the right of the moon."
 *    expected  → fivegramOverlap > 0.05 if narrative is also short; otherwise unflagged.
 *    The "to the right of the moon" 6-gram is shared — well under 7, so the run
 *    threshold is not tripped. Flag verdict depends on overlap %.
 *
 *  Example 4 — completely empty inputs:
 *    expected  → fivegramOverlap = 0, sevengramMaxRun = 0, flagged = false
 *
 *  Example 5 — narrative shorter than 5 tokens:
 *    narrative = "Bright lights flashed overhead."
 *    expected  → fivegramOverlap = 0 (no 5-grams), flag depends on run alone.
 */
