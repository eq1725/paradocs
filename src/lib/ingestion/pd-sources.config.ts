// PD-SOURCES — registry of public-domain book corpora for the generic
// pd-text ingestion pipeline (src/lib/ingestion/adapters/pd-text.ts,
// scripts/pd-text-ingest.ts, scripts/pd-modernize.ts).
//
// Each entry describes ONE public-domain work whose Internet Archive OCR
// text (<archiveId>_djvu.txt) is parseable either into numbered case
// depositions (mode 'numbered', the shape the spr adapter pioneered for
// "Phantasms of the Living", 1886) or into chapters of continuous
// anthology prose (mode 'chapter': split on chapterRegex heads, then the
// live ingest's Haiku segmentation step extracts the discrete verbatim
// experience accounts). The spr source itself stays on its dedicated
// adapter for backward compatibility; everything new goes here.
//
// PUBLIC DOMAIN ONLY. `published` doubles as the event-date ceiling for the
// modernize pass (an experience cannot postdate the book it was printed in)
// and appears in attribution/closer lines. Do not add anything still in
// copyright.
//
// Regex notes — markerRegex MUST:
//   - be line-anchored (^) — it is tested per line of the OCR dump;
//   - capture the case number as group 1 (decimal digits);
//   - when markerHasSubLetter is true, capture the sub-letter as group 2
//     ("718 A." → group 1 = '718', group 2 = 'A').
// Every regex below was written against the ACTUAL downloaded OCR text
// (grep-verified) — never guess a marker format from memory.

import { PhenomenonCategory } from '../database.types';

export interface PdVolumeDef {
  /** Internet Archive identifier, e.g. 'linconnuunknown00flamrich'. */
  archiveId: string;
  vol: number;
  /** Optional pre-downloaded OCR dump path (repo-root-relative). When
   * absent, the pipeline downloads to outputs/pd-<key>-v<vol>.txt. */
  localFile?: string;
}

export interface PdSourceConfig {
  /** Registry key; also the default source_type and original_report_id prefix. */
  key: string;
  workTitle: string;
  authors: string;
  /** Publication year — event-date ceiling for pd-modernize AND shown in
   * attribution / the modernize closer. */
  published: number;
  sourceLabel: string;
  /** reports.source_type value. Equals `key` by convention. */
  sourceType: string;
  category: PhenomenonCategory;
  tags: string[];
  /** Deterministic encyclopedia link; the linker no-ops when the slug does
   * not exist in phenomena/phenomenon_types. */
  experienceTypeSlug?: string;
  volumes: PdVolumeDef[];
  /** Parse mode (default 'numbered'). 'numbered' slices on markerRegex case
   * markers; 'chapter' slices on chapterRegex heading lines — each chapter
   * becomes ONE preliminary report (<key>-ch<N>, overflow parts -p2/-p3…)
   * which the LIVE ingest then splits into discrete experience accounts via
   * a Haiku segmentation step (<key>-ch<N>-a<M>). Dry runs report chapter
   * slices only. */
  mode?: 'numbered' | 'chapter';
  /** Line-anchored marker regex (string form). Group 1 = case number;
   * group 2 = sub-letter when markerHasSubLetter. REQUIRED for mode
   * 'numbered' (the default); ignored in mode 'chapter'. */
  markerRegex?: string;
  /** Chapter mode only — line-anchored heading matcher (string form), tested
   * per line like markerRegex. Optional group 1 captures the chapter title
   * when it sits on the heading line itself (JSPR article heads); when the
   * regex captures nothing, the parser checks the first non-empty line below
   * the heading for a short ALL-CAPS title ("CHAPTER I." / "INTRODUCTION.").
   * Like markerRegex, every chapterRegex must be verified against the ACTUAL
   * downloaded OCR text — OCR mangles heads (CHAPTEK/CHAPTEE/CPIAPTER/Xm). */
  chapterRegex?: string;
  /** Chapter mode only — hints for the live Haiku segmentation step. */
  segmentation?: {
    /** True when chapters are anthologies of many discrete accounts. */
    expectMultiplePerChapter: boolean;
    notes?: string;
  };
  /** Group 2 of markerRegex is an A–Z sub-letter ("903 A" style, Myers). */
  markerHasSubLetter?: boolean;
  /** Default true. Set false when marker numbers are citation/archive
   * numbers that restart or wander (Flammarion's "Letter N." labels) —
   * every marker is then accepted in document order and duplicate ids get
   * a '-2'/'-3' suffix. */
  useMonotonicGuard?: boolean;
  /** Monotonic-guard lookahead (raw markers consulted to confirm an
   * implausible forward jump). Default 3, same as spr. */
  markerConfirmWindow?: number;
  /** Forward jumps larger than this need successor confirmation. Default 40,
   * same as spr. Raise for sparse appendix numbering (Myers gaps up to ~170). */
  jumpTolerance?: number;
  /** Skip everything up to (and including) the first line matching this —
   * used to jump past tables of contents that repeat the marker format. */
  contentStartRegex?: string;
  /** Extra ALL-CAPS words (beyond the work-title words) that identify
   * running-head artifact lines, e.g. 'APPENDICES'. */
  artifactWords?: string[];
  /** Default 200 (spr). */
  minBodyChars?: number;
  /** Default 12000 (spr). */
  maxBodyChars?: number;
  /** Closing-attribution clause for the modernize pass, e.g. "collected by
   * Sir William Barrett and published in Death-Bed Visions (1926)". */
  modernizeCloser: string;
  notes?: string;
}

export const PD_SOURCES: Record<string, PdSourceConfig> = {
  /**
   * Sir William Barrett — Death-Bed Visions (1926). Barrett d. 1925 (the
   * book appeared posthumously); public domain.
   *
   * ⚠ TEXT ACQUISITION BLOCKED (June 2026): every archive.org scan of the
   * 1926 work is access-restricted — b29813992 (Wellcome) and
   * deathbedvisionsp0000barr (1986 reprint, inlibrary) both return HTTP 401
   * for *_djvu.txt, and advancedsearch shows no open copy. markerRegex is
   * therefore UNVERIFIED (never run against real text). Obtain the text by
   * other lawful means, drop it at outputs/pd-barrett-v1.txt, verify the
   * marker format with grep, fix the regex, THEN run the pipeline.
   */
  barrett: {
    key: 'barrett',
    workTitle: 'Death-Bed Visions',
    authors: 'Sir William Barrett',
    published: 1926,
    sourceLabel: 'Barrett — Death-Bed Visions (1926)',
    sourceType: 'barrett',
    category: 'ghosts_hauntings',
    tags: ['deathbed-vision', 'apparition', 'historical'],
    experienceTypeSlug: 'deathbed-vision',
    volumes: [{ archiveId: 'b29813992', vol: 1, localFile: 'outputs/pd-barrett-v1.txt' }],
    // UNVERIFIED — placeholder pending text acquisition (see note above).
    markerRegex: '^\\s*Case\\s+(\\d{1,3})\\s*[.:]',
    modernizeCloser: 'collected by Sir William Barrett and published in Death-Bed Visions (1926)',
    notes:
      'BLOCKED: no downloadable OCR text on archive.org (all scans 401 access-restricted). ' +
      'Regex unverified; do not live-ingest until the text is obtained and the marker format confirmed.',
  },

  /**
   * Sidgwick et al. — "Report on the Census of Hallucinations"
   * (Proceedings S.P.R., Vol. X, Part XXVI, 1894). Published 1894;
   * public domain. Open scan: proceedingsofsoc10soci (State Library of
   * Pennsylvania; no access restriction, *_djvu.txt downloadable).
   *
   * Marker format (verified in proceedingsofsoc10soci_djvu.txt): every
   * fully-quoted narrative opens with a standalone census citation —
   * schedule number + collector number in parentheses at line start,
   * usually followed by the informant on the same line:
   *   "(733.  5.)  From  Mrs.  S."
   *   "(400.16.)  From  Mr.  A.  E."
   *   "(725.  6.)"            ← informant line follows beneath
   * OCR variants handled: "(243.  14.  j" (j = broken ')'), "(152.  9).",
   * "(73U.  18.)" (U = misread 0), "(470   1.)" (lost dot). 197 markers,
   * all inside the case chapters (lines ~6216–25551); a separator between
   * the two numbers is MANDATORY so front-matter "(10)"-style list items
   * and tables never match. The numbers are archive citations that wander
   * freely (733, 729, 19, 53, …) — monotonic guard OFF, group 1 (the
   * schedule number) is the slice id; repeats get -2/-3 suffixes.
   * Inline cross-references in discussion prose use a "No. " prefix
   * ("(No. 545. 18.)") and therefore never match either.
   */
  'spr-census': {
    key: 'spr-census',
    workTitle: 'Report on the Census of Hallucinations',
    authors: 'Henry Sidgwick, Alice Johnson, F. W. H. Myers, Frank Podmore, Eleanor M. Sidgwick',
    published: 1894,
    sourceLabel: 'SPR — Census of Hallucinations (1894)',
    sourceType: 'spr-census',
    category: 'psychic_phenomena',
    tags: ['apparition', 'census', 'historical', 'spr'],
    experienceTypeSlug: 'apparition',
    volumes: [{ archiveId: 'proceedingsofsoc10soci', vol: 1 }],
    markerRegex: '^\\s*\\(\\s*(\\d{1,3})[UOl]?\\s*(?:[.,]\\s*|\\s+)\\d{1,2}\\s*[.,]?\\s*[)j]',
    useMonotonicGuard: false,
    modernizeCloser:
      'collected by the Society for Psychical Research and published in the Report on the Census of Hallucinations (Proceedings S.P.R., Vol. X, 1894)',
    notes:
      'Census schedule/collector numbers are citations, not a sequence — guard disabled. ' +
      'Running heads in this scan are mixed-case ("Report on the Census of Hallucinations.") ' +
      'so some survive cleanOcrBody; the live Haiku repair pass removes them. The final case ' +
      '(422. 22.) runs to EOF and is capped at maxBodyChars, so its tail carries some ' +
      'end-of-volume apparatus.',
  },

  /**
   * Camille Flammarion — L'Inconnu / The Unknown (English ed., Harper, 1900).
   * Flammarion d. 1925; public domain.
   *
   * Marker format (verified in linconnuunknown00flamrich_djvu.txt): each
   * reader-letter narrative is separated by a standalone citation line
   *   "Letter  2."  /  "Letter  11 ."  /  "Letter  554,"
   * (218 such lines). The letter numbers are Flammarion's ARCHIVE numbers:
   * they restart and wander per chapter (…715, 787, 388, 327, … 7, 39, …),
   * so the monotonic guard is OFF — every marker is a narrative boundary
   * and the number is just an identifier (duplicates get -2/-3 suffixes).
   * In print the "Letter N." line cites the narrative ABOVE it, so each
   * slice actually holds the narrative FOLLOWING the cited one; the label
   * is treated as a stable slice id, not a strict citation.
   */
  'flammarion-unknown': {
    key: 'flammarion-unknown',
    workTitle: 'The Unknown',
    authors: 'Camille Flammarion',
    published: 1900,
    sourceLabel: 'Flammarion — The Unknown (1900)',
    sourceType: 'flammarion-unknown',
    category: 'psychic_phenomena',
    tags: ['premonition', 'telepathy', 'historical'],
    experienceTypeSlug: 'telepathy',
    volumes: [{ archiveId: 'linconnuunknown00flamrich', vol: 1 }],
    markerRegex: '^Letter\\s+(\\d{1,3})\\s*[.,]',
    useMonotonicGuard: false,
    modernizeCloser: "collected by Camille Flammarion and published in The Unknown (L'Inconnu, 1900)",
    notes:
      'Letter numbers are archive citations, not a sequence — guard disabled. ' +
      'Slices between chapter boundaries may carry some of Flammarion\'s connective ' +
      'discussion; the modernize pass is instructed to drop editorial apparatus.',
  },

  /**
   * Camille Flammarion — Death and Its Mystery (English transl., 3 vols:
   * I Before Death 1921/22, II At the Moment of Death 1922, III After
   * Death 1923). Flammarion d. 1925; public domain.
   *
   * Identifier mapping (verified June 2026 — the obvious-looking ids LIE):
   *   vol 1 = deathitsmysteryb00flamrich  ("Before Death", Unwin 1922)
   *   vol 2 = deathitsmystery00flam       ("At the Moment of Death" — NOT vol 1!)
   *   vol 3 = deathitsmystery1923flam     ("After Death", Century 1923)
   * deathitsmystery01flam / 02flam do not exist; deathitsmystery03flam is an
   * alternate vol-3 scan (77 markers, garbled cover OCR); dli.ministry.01612
   * is also vol 3, not a distinct volume.
   *
   * Marker format (grep-verified in all three downloaded _djvu.txt files):
   * paren-wrapped citation lines on their own line, e.g.
   *   "(Letter  1465.)"  /  "(Letter  4565.)"  /  "(Letter  596.)  Drome."
   * Counts for ^\(Letter\s+\d{1,4}\s*[.,]: v1=25, v2=87, v3=77. Numbers are
   * Flammarion's archive numbers (same files as L'Inconnu, now up to 4
   * digits) and wander freely (985 → 4106 → 2325 → 73…), so the monotonic
   * guard is OFF. As in L'Inconnu the printed label cites the narrative
   * ABOVE it; each slice holds the following narrative + discussion and the
   * label is a stable slice id, not a strict citation. A few OCR-mangled
   * labels ("(Letter  84L)", "(Letter  m.)") are deliberately not matched.
   */
  'flammarion-death-mystery': {
    key: 'flammarion-death-mystery',
    workTitle: 'Death and Its Mystery',
    authors: 'Camille Flammarion',
    published: 1923,
    sourceLabel: 'Flammarion — Death and Its Mystery (1921–1923)',
    sourceType: 'flammarion-death-mystery',
    category: 'psychic_phenomena',
    tags: ['premonition', 'apparition', 'historical', 'flammarion'],
    experienceTypeSlug: 'apparition',
    volumes: [
      { archiveId: 'deathitsmysteryb00flamrich', vol: 1 },
      { archiveId: 'deathitsmystery00flam', vol: 2 },
      { archiveId: 'deathitsmystery1923flam', vol: 3 },
    ],
    markerRegex: '^\\(Letter\\s+(\\d{1,4})\\s*[.,]\\s*\\)?',
    useMonotonicGuard: false,
    modernizeCloser:
      'collected by Camille Flammarion and published in Death and Its Mystery (1921–1923)',
    notes:
      'Citation-style "(Letter N.)" markers — guard disabled, duplicates get -2/-3 ' +
      'suffixes. Only letter-cited narratives are sliced; the volumes contain many ' +
      'more uncited accounts that a future chapter-mode could recover.',
  },

  /**
   * Camille Flammarion — Haunted Houses (Les maisons hantées; English
   * transl., Appleton, 1924). Flammarion d. 1925; public domain.
   *
   * CHAPTER MODE (flipped June 2026): the open scan hauntedhouses00flam_0
   * (1924; the other hit, hauntedhouses00flam, is a 1971 reprint) is
   * continuous chapter prose with narratives embedded in discussion — grep
   * finds NO per-case numbering (exactly 2 standalone "(Letter N.)" lines in
   * the whole book, no "Case N." / "No. N" / "Observation N" heads), so the
   * old numbered-mode citation regex yielded only ~2 slices.
   *
   * Chapter heads (verified in hauntedhouses00flam_0_djvu.txt): 13 body
   * lines "CHAPTER  I" … "CHAPTER  XII", "CHAPTER  Xm" (OCR for XIII), no
   * trailing period, ALL-CAPS title on the following line(s):
   *   "CHAPTER  I"  → "EXPERIMENTAL  PROOFS  OF  SURVIVAL"
   *   "CHAPTER  II" → "HAUNTED  HOUSES:  A  FIRST  SURVEY  OF  THE" (wraps)
   * TOC lines are "CHAPTER  PAGE" (PAGE not in the roman class) and
   * "I. NAME … page" — neither matches, so no contentStartRegex is needed.
   */
  'flammarion-haunted-houses': {
    key: 'flammarion-haunted-houses',
    workTitle: 'Haunted Houses',
    authors: 'Camille Flammarion',
    published: 1924,
    sourceLabel: 'Flammarion — Haunted Houses (1924)',
    sourceType: 'flammarion-haunted-houses',
    category: 'ghosts_hauntings',
    tags: ['haunting', 'historical', 'flammarion'],
    experienceTypeSlug: 'haunting',
    volumes: [{ archiveId: 'hauntedhouses00flam_0', vol: 1 }],
    mode: 'chapter',
    // 'm' admits the OCR head "CHAPTER  Xm" (= XIII); 'PAGE'/'PAOS' TOC
    // headers can never match the roman-numeral class.
    chapterRegex: '^CHAPTER\\s+[IVXLY1lm]+\\s*$',
    segmentation: {
      expectMultiplePerChapter: true,
      notes:
        'Chapters interleave many short haunting/poltergeist testimonies with ' +
        'Flammarion\'s commentary; segmentation keeps the verbatim testimonies ' +
        'and discards the connective discussion.',
    },
    modernizeCloser:
      'collected by Camille Flammarion and published in Haunted Houses (1924)',
    notes:
      'Continuous chapter prose, no parseable per-case markers (only 2 "(Letter N.)" ' +
      'citation lines in the entire book) — chapter mode splits on the 13 verified ' +
      '"CHAPTER <roman>" heads and the live Haiku segmentation step extracts the ' +
      'individual narratives.',
  },

  /**
   * F. W. H. Myers — Human Personality and Its Survival of Bodily Death
   * (Longmans, 1903, 2 vols). Myers d. 1901; public domain.
   *
   * Marker format (verified in humanpersonality0{1,2}myeriala_djvu.txt):
   * evidential appendix sections numbered by chapter-section + sub-letter:
   *   "718  A.     From  Proceedings  S.P.R.,  vol.  iii.  p.  92. …"
   *   "716  B.  From  Proceedings  S.P.R.,  vol.  viii.  p.  236. …"
   * Vol 1 appendices run 207A–668G; vol 2 runs 713A–980A. Numbers are
   * monotonic with sub-letters but gappy (238→407, 751→811), so
   * jumpTolerance is raised to 250. The front-matter TOC repeats the same
   * format, so parsing starts after the first standalone "APPENDICES" line.
   * Chapter text (sections "718." without a letter) never matches.
   */
  'myers-human-personality': {
    key: 'myers-human-personality',
    workTitle: 'Human Personality and Its Survival of Bodily Death',
    authors: 'Frederic W. H. Myers',
    published: 1903,
    sourceLabel: 'Myers — Human Personality (1903)',
    sourceType: 'myers-human-personality',
    category: 'psychic_phenomena',
    tags: ['apparition', 'telepathy', 'survival', 'historical'],
    experienceTypeSlug: 'apparition',
    volumes: [
      { archiveId: 'humanpersonality01myeriala', vol: 1 },
      { archiveId: 'humanpersonality02myeriala', vol: 2 },
    ],
    markerRegex: '^(\\d{3,4})\\s+([A-Z])\\s*\\.',
    markerHasSubLetter: true,
    jumpTolerance: 250,
    contentStartRegex: '^APPENDICES\\s*$',
    artifactWords: ['APPENDICES', 'CHAPTER'],
    modernizeCloser:
      'collected by Frederic W. H. Myers and published in Human Personality and Its Survival of Bodily Death (1903)',
    notes:
      'Appendix-only parse (the evidential case sections); chapter prose is skipped. ' +
      'Sub-lettered sections (718 A, 718 B…) are separate cases.',
  },

  /**
   * Catherine Crowe — The Night-Side of Nature; or, Ghosts and Ghost Seers
   * (1848). Crowe d. 1872; public domain.
   *
   * Scan: nightsidenature01crowgoog (Google scan of a one-volume edition,
   * 18 chapters I–XVIII — the complete work; "01" is NOT a volume number).
   * The alternate nightsideofnatur00crowuoft has badly mangled heads
   * ("CHAPTER L", "CHAPTER T.", "CHAPTER XVUL") — avoid.
   *
   * Chapter heads (verified in nightsidenature01crowgoog_djvu.txt — 18
   * matches, all body):
   *   "CHAPTER I."   → next line "INTRODUCTION."
   *   "CHAPTER 11."  → next line "THE DWELLER IN THE TEMPLE."  (11 = OCR II)
   *   "CHAPTER XVL"  (= XVI)
   * The TOC column header "CHAPTER PAOS" (= PAGE) can never match the
   * roman class, and TOC entries are "I. — ^Introduction 7" — no
   * contentStartRegex needed.
   */
  'crowe-night-side': {
    key: 'crowe-night-side',
    workTitle: 'The Night-Side of Nature',
    authors: 'Catherine Crowe',
    published: 1848,
    sourceLabel: 'Crowe — The Night-Side of Nature (1848)',
    sourceType: 'crowe-night-side',
    category: 'ghosts_hauntings',
    tags: ['haunting', 'apparition', 'historical'],
    experienceTypeSlug: 'haunting',
    volumes: [{ archiveId: 'nightsidenature01crowgoog', vol: 1 }],
    mode: 'chapter',
    chapterRegex: '^CHAPTER\\s+[IVXLY1l]+\\s*\\.?\\s*$',
    segmentation: {
      expectMultiplePerChapter: true,
      notes:
        'Thematic chapters (warnings, wraiths, haunted houses…) each quote many ' +
        'discrete anecdotes inside Crowe\'s essayistic discussion; segmentation ' +
        'keeps the anecdotes, drops the theory.',
    },
    modernizeCloser:
      'collected by Catherine Crowe and published in The Night-Side of Nature (1848)',
    notes:
      'Chapter titles sit on the line BELOW the head ("CHAPTER I." / "INTRODUCTION.") ' +
      'and are picked up by the parser\'s next-line ALL-CAPS heuristic.',
  },

  /**
   * Robert Dale Owen — Footfalls on the Boundary of Another World (1860).
   * Owen d. 1877; public domain.
   *
   * Scan: foot00fallsonboundowenrich. Body chapter heads are heavily
   * OCR-mangled (verified — 16 body matches after the contentStart skip):
   *   "CHAPTEK  I."   (K = broken R)
   *   "CHAPTEE  III." / "CHAPTEE  lY." / "CHAPTEE  1."  (E = broken R)
   *   "CHAPTER  II."
   * The TOC (lines ~290–560) repeats BOOK/CHAPTER heads, so parsing starts
   * after the unique "LIST OF AUTHORS CITED," line (~595) that separates
   * front matter from the body. Standalone "BOOK N." lines are NOT used as
   * boundaries — each book's title page collapses into the tail of the
   * previous chapter and is discarded by segmentation.
   */
  'owen-footfalls': {
    key: 'owen-footfalls',
    workTitle: 'Footfalls on the Boundary of Another World',
    authors: 'Robert Dale Owen',
    published: 1860,
    sourceLabel: 'Owen — Footfalls on the Boundary of Another World (1860)',
    sourceType: 'owen-footfalls',
    category: 'ghosts_hauntings',
    tags: ['haunting', 'apparition', 'historical'],
    experienceTypeSlug: 'haunting',
    volumes: [{ archiveId: 'foot00fallsonboundowenrich', vol: 1 }],
    mode: 'chapter',
    chapterRegex: '^\\s*CHAPTE[RKE]\\s+[IVXLY1l]+\\s*\\.?\\s*$',
    contentStartRegex: '^LIST\\s+OF\\s+AUTHORS\\s+CITED',
    segmentation: {
      expectMultiplePerChapter: true,
      notes:
        'Owen argues a thesis chapter by chapter, quoting attested narratives ' +
        '(often footnoted depositions) inside the argument; segmentation keeps ' +
        'the narratives, drops the argument and the citation apparatus.',
    },
    modernizeCloser:
      'collected by Robert Dale Owen and published in Footfalls on the Boundary of Another World (1860)',
    notes:
      'OCR head variants CHAPTEK/CHAPTEE/CHAPTER all matched; contentStartRegex ' +
      'skips the TOC + index of authors, which repeat the head format.',
  },

  /**
   * W. T. Stead — Real Ghost Stories (collected from the Review of Reviews
   * Christmas numbers 1891–92; this scan is the 1897 reissue — preface
   * signed "August, 1897. W. T. STEAD."). Stead d. 1912; public domain.
   *
   * Scan: realghoststories00stea. Body heads (verified — 20 matches after
   * the contentStart skip; Part I has 13 chapters, Part II has 7):
   *   "CHAPTER  I"  → next line "THE THOUGHT BODY, OR THE DOUBLE"
   *   "CHAPTER  V."
   * The TOC (lines ~444–516) repeats the head format (including the
   * artifact "CHAPTER X PAGK"), so parsing starts at the unique Part-I
   * body title "THE GHOST THAT DWELLS IN EACH OF US" (line ~520). The
   * untitled introduction between that line and CHAPTER I falls before the
   * first head and is dropped.
   */
  'stead-real-ghost-stories': {
    key: 'stead-real-ghost-stories',
    workTitle: 'Real Ghost Stories',
    authors: 'W. T. Stead',
    published: 1897,
    sourceLabel: 'Stead — Real Ghost Stories (1897)',
    sourceType: 'stead-real-ghost-stories',
    category: 'ghosts_hauntings',
    tags: ['apparition', 'haunting', 'historical'],
    experienceTypeSlug: 'apparition',
    volumes: [{ archiveId: 'realghoststories00stea', vol: 1 }],
    mode: 'chapter',
    chapterRegex: '^CHAPTER\\s+[IVXLY1l]+\\s*\\.?\\s*$',
    contentStartRegex: '^THE\\s+GHOST\\s+THAT\\s+DWELLS',
    segmentation: {
      expectMultiplePerChapter: true,
      notes:
        'Stead strings together correspondents\' first-hand stories (many quoted ' +
        'verbatim from letters) with journalistic linking text; segmentation keeps ' +
        'the stories, drops the linking commentary.',
    },
    modernizeCloser:
      'collected by W. T. Stead and published in Real Ghost Stories (1897)',
    notes:
      'First published as Review of Reviews Christmas numbers 1891–92; the scan is ' +
      'the 1897 reissue, so published=1897 is the safe event-date ceiling.',
  },

  /**
   * Andrew Lang — The Book of Dreams and Ghosts (1897). Lang d. 1912;
   * public domain.
   *
   * Scan: bookofdreamsghos00languoft. Body heads (verified — 14 matches):
   *   "CHAPTER  I." … "CHAPTER  XIV."
   *   "CPIAPTER  VL"  (= CHAPTER VI; PI = broken H, VL = broken VI)
   * The TOC uses mixed-case "Chapter XIII." entries, which the ALL-CAPS
   * head regex never matches — no contentStartRegex needed. Chapters open
   * with a mixed-case synopsis paragraph (not an ALL-CAPS title), so most
   * report titles are the constructed "Chapter N" form; the ALL-CAPS lines
   * INSIDE chapters are individual story titles and are left in the body
   * for the segmentation step to use as account boundaries.
   */
  'lang-dreams-ghosts': {
    key: 'lang-dreams-ghosts',
    workTitle: 'The Book of Dreams and Ghosts',
    authors: 'Andrew Lang',
    published: 1897,
    sourceLabel: 'Lang — The Book of Dreams and Ghosts (1897)',
    sourceType: 'lang-dreams-ghosts',
    category: 'ghosts_hauntings',
    tags: ['apparition', 'dream', 'historical'],
    experienceTypeSlug: 'apparition',
    volumes: [{ archiveId: 'bookofdreamsghos00languoft', vol: 1 }],
    mode: 'chapter',
    chapterRegex: '^\\s*(?:CHAPTER|CPIAPTER)\\s+[IVXLY1l]+\\s*\\.?\\s*$',
    segmentation: {
      expectMultiplePerChapter: true,
      notes:
        'Lang retells named stories ("LORD BROUGHAM\'S STORY", "THE COLD HAND") ' +
        'back to back with light commentary; segmentation keeps each story, ' +
        'drops Lang\'s framing remarks.',
    },
    modernizeCloser:
      'collected by Andrew Lang and published in The Book of Dreams and Ghosts (1897)',
    notes:
      'OCR head variant CPIAPTER VL (= CHAPTER VI) is matched explicitly; without ' +
      'it chapters V and VI fuse into one slice.',
  },

  /**
   * Journal of the Society for Psychical Research, Vol. XX (1921–22) —
   * PILOT for periodical ingestion via chapter mode. All contributions
   * published 1921–22; public domain in the US (pre-1930).
   *
   * Scan: journalofsociety20sociuoft (University of Toronto copy — the
   * pre-downloaded outputs/jspr-vol20-inspect.txt IS this scan, kept at
   * outputs/pd-spr-jspr-pilot-v1.txt as the localFile).
   *
   * Structure: monthly issues, each opening with a masthead
   * ("No.  CCCLXXL— VOL.  XX.  JANUARY,  1921"), then ALL-CAPS section/
   * article heads (verified):
   *   "CASES."  /  "CASE."           ← the experience-account sections
   *   "A  METHOD  OF  INVESTIGATION  INTO  THOUGHT-"  (wraps to next line)
   *   "MEETING  OF  THE  COUNCIL."  /  "NEW   MEMBERS."  /  "REVIEWS."
   * The chapterRegex matches CASES?/REVIEWS? plus any ALL-CAPS line ≥12
   * chars whose first word is not a common apparatus/table word; running
   * heads are mixed-case ("Journal of Society for Psychical Research.
   * JAN., 1921.") and never match. The volume INDEX precedes the first
   * issue (lines ~57–1449) and is skipped via contentStartRegex on the
   * first masthead ("No.  CCC…" — vol XX issue numbers are all CCCLXX*).
   * Expect ~230 heads, many of them apparatus fragments — those yield 0
   * accounts at segmentation and are discarded.
   */
  'spr-jspr-pilot': {
    key: 'spr-jspr-pilot',
    workTitle: 'Journal of the Society for Psychical Research, Vol. XX',
    authors: 'Society for Psychical Research',
    published: 1922,
    sourceLabel: 'SPR — Journal Vol. XX (1921–22)',
    sourceType: 'spr-jspr-pilot',
    category: 'psychic_phenomena',
    tags: ['apparition', 'telepathy', 'spr', 'historical', 'journal'],
    experienceTypeSlug: 'apparition',
    volumes: [
      { archiveId: 'journalofsociety20sociuoft', vol: 1, localFile: 'outputs/pd-spr-jspr-pilot-v1.txt' },
    ],
    mode: 'chapter',
    chapterRegex:
      '^\\s*(?!THE\\b|OF\\b|TO\\b|IN\\b|ON\\b|AT\\b|BY\\b|AND\\b|FOR\\b|WILL\\b|WHEN\\b|TABLE\\b|TOTAL\\b|NEW\\b|MEETING\\b|MEETINGS\\b|ANNUAL\\b|PRIVATE\\b|NOTICE\\b|GENERAL\\b|RESULT\\b|RESULTS\\b|LIST\\b|INDEX\\b|VOLUME\\b|JOURNAL\\b|SUPPLEMENTARY\\b)' +
      '(CASES?\\.?|REVIEWS?\\.?|[A-Z][A-Z0-9 .,;:()\'"&-]{11,})\\s*$',
    contentStartRegex: '^No\\.\\s+CCC',
    minBodyChars: 300,
    segmentation: {
      expectMultiplePerChapter: true,
      notes:
        'Journal apparatus — council/meeting minutes, conversazione notices, new-' +
        'member lists, book reviews, statistical thought-transference tables — ' +
        'yields no experience narratives; the segmentation step returns 0 accounts ' +
        'for those chapters and they are counted and discarded. Only the CASES/' +
        'CASE sections and case-bearing articles produce reports.',
    },
    modernizeCloser:
      'collected by the Society for Psychical Research and published in the Journal of the Society for Psychical Research, Vol. XX (1921–22)',
    notes:
      'PILOT periodical source. Heads are noisy (~230 matched lines incl. wrapped ' +
      'titles and signature lines); harmless — non-account chapters die at ' +
      'segmentation. minBodyChars raised to 300 to drop fragment slices early.',
  },
};

export function getPdSource(key: string): PdSourceConfig | null {
  return PD_SOURCES[key] || null;
}

export function listPdSources(): string[] {
  return Object.keys(PD_SOURCES);
}
