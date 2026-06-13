// CA-HARVEST — search-term registry for the Chronicling America
// (Library of Congress, loc.gov) newspaper harvest pipeline:
//   scripts/ca-harvest.ts        (search + OCR snippet harvest — NO AI, NO DB)
//   scripts/ca-extract-ingest.ts (Haiku Batch extraction + pending_review inserts)
//
// ── FOUNDER-EDITABLE ─────────────────────────────────────────────────
// Add/remove terms freely. Each term is searched as an EXACT PHRASE
// (the harvester wraps it in double quotes) against the full OCR text
// of every digitized newspaper page, one search per term × year.
//
// Quality hints (they are documentation + a downstream review signal,
// not a filter — only `enabled` controls whether a term is searched):
//   'high'   — specific multi-word phrase that almost always sits inside a
//              real reported-event story ("saw a ghost", "sea serpent").
//   'medium' — real signal but noisier: also matches fiction, ads, jokes,
//              reprint filler ("spook", "airship" near 1896-97 is great,
//              elsewhere it's aviation news).
//
// DELIBERATELY EXCLUDED single words (too noisy to be worth the OCR
// fetches — millions of hits, mostly metaphor/fiction/ads):
//   "ghost"            ("ghost of a chance", Holy Ghost, ghost writer…)
//   "monster"          (political cartoons, "monster sale", "monster rally")
//   "vision"/"spirit"  (religion columns, "spirit of the law", liquor ads)
//   "dream"            (patent-medicine ads, "dream of fair women" fiction)
//
// PERIOD VOCABULARY NOTES (1880–1928 target window):
//   - "airship" is the pre-1903 UFO word (the 1896–97 mystery airship wave).
//   - "spook" / "ha'nt" / "spectre" were everyday newspaper words for
//     apparitions; "wild man" was the standard cryptid-hominid label.
//   - "second sight" / "presentiment" / "death warning" are the period's
//     psychic-phenomena vocabulary; "telepathy" only after ~1882 (SPR coinage).

export type CaTermQuality = 'high' | 'medium';

export interface CaSearchTerm {
  /** Exact phrase sent to loc.gov full-text search (quoted by the harvester). */
  phrase: string;
  quality: CaTermQuality;
  /** Searched only when true — flip to false to bench a noisy term. */
  enabled: boolean;
  /** Optional founder note shown in logs. */
  note?: string;
  /** Cap on search-result pages fetched per term×year. Default = harvester's
   *  --max-pages (5). Set to 1 to preserve a noisy term as taxonomy harvest
   *  but cap its budget impact. */
  maxPages?: number;
}

/** Categories mirror PhenomenonCategory values used at extraction time. */
export const CA_TERM_SETS: Record<string, CaSearchTerm[]> = {
  ghosts_hauntings: [
    // Core apparition / haunting events
    { phrase: 'saw a ghost', quality: 'high', enabled: true },
    { phrase: 'saw the ghost', quality: 'high', enabled: true },
    { phrase: 'ghost story', quality: 'medium', enabled: true, note: 'also matches fiction columns — extractor genre-flags those' },
    { phrase: 'haunted house', quality: 'high', enabled: true },
    { phrase: 'apparition', quality: 'medium', enabled: true, note: 'single word but rare outside ghost copy' },
    { phrase: 'spook', quality: 'medium', enabled: true, note: 'period slang; some joke-column noise' },
    { phrase: 'phantom', quality: 'medium', enabled: false, note: 'noisy: "phantom of the opera", racehorses, ships' },
    { phrase: 'ghostly figure', quality: 'high', enabled: true },
    { phrase: 'ghostly visitor', quality: 'high', enabled: true },
    { phrase: 'haunted by the ghost', quality: 'high', enabled: true },
    // V11.18.30 additions — ghosts/apparitions
    { phrase: 'spirit photograph', quality: 'high', enabled: true, note: 'NEW: Victorian spirit-photography wave (1860s+)' },
    { phrase: 'phantom rider', quality: 'high', enabled: true, note: 'NEW: classic apparition trope, frequent in Western papers' },
    { phrase: 'phantom carriage', quality: 'high', enabled: true, note: 'NEW: death-omen tradition' },
    { phrase: 'apparition of', quality: 'high', enabled: true, note: 'NEW: "apparition of his late wife" style narrative leads' },
    { phrase: 'vision of the dead', quality: 'high', enabled: true, note: 'NEW: post-mortem visitation reports' },
    { phrase: 'ghostly procession', quality: 'high', enabled: true, note: 'NEW: phantom-funeral/parade folklore' },
    { phrase: 'seance', quality: 'medium', enabled: true, note: 'NEW: spiritualism-era seance reportage; some sensationalism noise' },
    { phrase: 'materialization', quality: 'medium', enabled: true, note: 'NEW: spiritualist medium phenomena; also chemistry-textbook word' },
  ],

  psychic_phenomena: [
    // Core psychic vocabulary
    { phrase: 'strange dream', quality: 'high', enabled: true },
    { phrase: 'premonition', quality: 'high', enabled: true },
    { phrase: 'telepathy', quality: 'medium', enabled: true, note: 'post-1882 vocabulary; earlier years yield ~0' },
    { phrase: 'clairvoyant', quality: 'medium', enabled: true, note: 'many fortune-teller ADS — extractor genre-flags them' },
    { phrase: 'second sight', quality: 'high', enabled: true },
    { phrase: 'death warning', quality: 'high', enabled: true },
    { phrase: 'presentiment', quality: 'high', enabled: true },
    // 'prophetic dream' DROPPED V11.18.30 — replaced by 'prophetic vision' + 'psychic dream'
    { phrase: 'mental telegraphy', quality: 'high', enabled: true, note: 'Mark Twain coinage; tiny but pristine yield — ENABLED V11.18.30' },
    // V11.18.30 additions — psychic
    { phrase: 'crisis apparition', quality: 'high', enabled: true, note: 'NEW: SPR-era technical term; dying-relative-appears trope' },
    { phrase: 'death bed vision', quality: 'high', enabled: true, note: 'NEW: end-of-life experience reports' },
    { phrase: 'voice from beyond', quality: 'high', enabled: true, note: 'NEW: spiritualist + ghost-encounter framing' },
    { phrase: 'prophetic vision', quality: 'high', enabled: true, note: 'NEW: replaces prophetic dream; more newspaper-typical' },
    { phrase: 'psychic dream', quality: 'high', enabled: true, note: 'NEW: complement to prophetic vision' },
    { phrase: 'trance', quality: 'medium', enabled: true, note: 'NEW: medium-trance / fortune-teller noise; extractor genre-flags' },
  ],

  ufos_aliens: [
    // Core sky-anomaly terms
    { phrase: 'airship', quality: 'medium', enabled: true, note: 'GOLD in 1896-97 (mystery airship wave); aviation noise after ~1903' },
    // 'strange lights in the sky', 'meteor mystery', 'strange object in the sky' DROPPED V11.18.30 (low yield / noisy)
    { phrase: 'mysterious light', quality: 'high', enabled: true },
    { phrase: 'lights in the heavens', quality: 'medium', enabled: false, note: 'religious-metaphor heavy; bench first' },
    // V11.18.30 additions — UFO/sky
    { phrase: 'mystery airship', quality: 'high', enabled: true, note: 'NEW: tighter than bare "airship", high 1896-97 yield' },
    { phrase: 'unidentified airship', quality: 'high', enabled: true, note: 'NEW: pre-UFO terminology' },
    { phrase: 'mysterious sky lights', quality: 'high', enabled: true, note: 'NEW: replaces "strange lights in the sky"' },
    { phrase: 'aerial phantom', quality: 'high', enabled: true, note: 'NEW: rare but pristine signal' },
  ],

  cryptids: [
    // 'monster seen', 'lake monster' DROPPED V11.18.30 (founder-editorial)
    { phrase: 'sea serpent', quality: 'high', enabled: true, maxPages: 1, note: 'DOWNGRADED V11.18.30 to maxPages=1: preserve as taxonomy harvest, cap budget' },
    { phrase: 'wild man', quality: 'medium', enabled: true, maxPages: 1, note: 'DOWNGRADED V11.18.30 to maxPages=1: period hominid label; sideshow ad noise' },
    { phrase: 'strange animal', quality: 'high', enabled: true },
    { phrase: 'strange creature', quality: 'high', enabled: true },
    // V11.18.30 additions — cryptids (paranormal-marker phrases only)
    { phrase: 'phantom dog', quality: 'high', enabled: true, note: 'NEW: ghost-dog folklore (Black Shuck etc.)' },
    { phrase: 'phantom horse', quality: 'high', enabled: true, note: 'NEW: spectral-horse encounters' },
    { phrase: 'flying serpent', quality: 'high', enabled: true, note: 'NEW: aerial-cryptid reports' },
  ],
};

/** Slug used in shard filenames, state keys, and report tags. */
export function caTermSlug(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Resolve a --terms value: a category key ('cryptids'), 'all', or a CSV of
 * literal phrases. Category/all resolution honors `enabled`.
 */
export function resolveCaTerms(spec: string): { phrase: string; category: string | null }[] {
  const trimmed = spec.trim();
  if (trimmed === 'all') {
    const out: { phrase: string; category: string | null }[] = [];
    for (const [cat, terms] of Object.entries(CA_TERM_SETS)) {
      for (const t of terms) if (t.enabled) out.push({ phrase: t.phrase, category: cat });
    }
    return out;
  }
  if (CA_TERM_SETS[trimmed]) {
    return CA_TERM_SETS[trimmed].filter(t => t.enabled).map(t => ({ phrase: t.phrase, category: trimmed }));
  }
  // CSV of literal phrases — look up the category when the phrase is known.
  return trimmed
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(phrase => {
      let category: string | null = null;
      for (const [cat, terms] of Object.entries(CA_TERM_SETS)) {
        if (terms.some(t => t.phrase.toLowerCase() === phrase.toLowerCase())) { category = cat; break; }
      }
      return { phrase, category };
    });
}
