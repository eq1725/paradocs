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
}

/** Categories mirror PhenomenonCategory values used at extraction time. */
export const CA_TERM_SETS: Record<string, CaSearchTerm[]> = {
  ghosts_hauntings: [
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
  ],

  psychic_phenomena: [
    { phrase: 'strange dream', quality: 'high', enabled: true },
    { phrase: 'premonition', quality: 'high', enabled: true },
    { phrase: 'telepathy', quality: 'medium', enabled: true, note: 'post-1882 vocabulary; earlier years yield ~0' },
    { phrase: 'clairvoyant', quality: 'medium', enabled: true, note: 'many fortune-teller ADS — extractor genre-flags them' },
    { phrase: 'second sight', quality: 'high', enabled: true },
    { phrase: 'death warning', quality: 'high', enabled: true },
    { phrase: 'presentiment', quality: 'high', enabled: true },
    { phrase: 'prophetic dream', quality: 'high', enabled: true },
    { phrase: 'mental telegraphy', quality: 'high', enabled: false, note: 'Mark Twain coinage; tiny but pristine yield — enable for deep sweeps' },
  ],

  ufos_aliens: [
    { phrase: 'airship', quality: 'medium', enabled: true, note: 'GOLD in 1896-97 (mystery airship wave); aviation noise after ~1903' },
    { phrase: 'strange lights in the sky', quality: 'high', enabled: true },
    { phrase: 'mysterious light', quality: 'high', enabled: true },
    { phrase: 'meteor mystery', quality: 'high', enabled: true },
    { phrase: 'strange object in the sky', quality: 'high', enabled: true },
    { phrase: 'lights in the heavens', quality: 'medium', enabled: false, note: 'religious-metaphor heavy; bench first' },
  ],

  cryptids: [
    { phrase: 'sea serpent', quality: 'high', enabled: true },
    { phrase: 'wild man', quality: 'medium', enabled: true, note: 'period hominid label; some "wild man of Borneo" sideshow ads' },
    { phrase: 'strange animal', quality: 'high', enabled: true },
    { phrase: 'monster seen', quality: 'high', enabled: true },
    { phrase: 'strange creature', quality: 'high', enabled: true },
    { phrase: 'lake monster', quality: 'high', enabled: true },
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
