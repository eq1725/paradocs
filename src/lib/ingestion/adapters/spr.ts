// SPR — "Phantasms of the Living" (Gurney, Myers & Podmore, 1886) Adapter
//
// IMPORTANT — PUBLIC DOMAIN. The work was published 1886 by the Society for
// Psychical Research; the authors died 1888 (Gurney), 1901 (Myers), and 1910
// (Podmore), so the text is unambiguously public domain worldwide. The
// adapter sets metadata.public_domain = true on every report, which triggers
// the engine's V11.18.22 truncation bypass (capDescriptionForStorage): the
// FULL case text is stored instead of the 2,000-char Option-A copyright cap.
//
// Source: Internet Archive OCR plain text of the two volumes —
//   vol 1: https://archive.org/details/phantasmsoflivin01gurn  (cases 1–217)
//   vol 2: https://archive.org/details/phantasmsoflivin02gurn  (cases 218–702)
//
// The corpus is ~760 numbered first-hand case depositions ("(370)  From
// Mrs.  Mainwaring,  Knowles,  Ardingly,  Hayward's  Heath.") collected and
// cross-examined by the SPR founders — the earliest large systematic corpus
// of apparition/crisis-telepathy testimony in existence.
//
// Parsing strategy (all deterministic — NO AI in the adapter):
//   - Case markers: `^\(\s*(\d{1,3})\s*\)` at line start.
//   - Monotonic-increasing case-number guard per volume: the books also use
//     "(1) (2) (3)" for footnote lists, enumerated arguments, and the vol-1
//     experiment series, and the vol-2 Supplement restarts small sequences.
//     A marker is accepted only if its number is greater than the last
//     accepted number in that volume (gaps tolerated — OCR drops some).
//     Additionally, an implausible forward JUMP (> +40) is accepted only if
//     one of the next few raw markers continues from it (n+1/n+2); this
//     rejects OCR misreads like "(296)" appearing where "(246)" was printed,
//     which would otherwise swallow cases 247–295. Rejected markers are
//     logged.
//   - Deterministic OCR cleanup: rejoin hyphenated linebreaks, drop page
//     headers/artifacts, collapse double-spaced OCR runs, preserve paragraph
//     breaks. The mass-ingest script (scripts/spr-phantasms-ingest.ts) can
//     additionally run a Haiku OCR-repair pass; the adapter itself marks
//     metadata.ocr_cleaned = false.

import * as fs from 'fs';
import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';
import { extractDate } from '../utils/extract-date';

export interface SprVolumeConfig {
  /** Local path to the already-downloaded _djvu.txt OCR dump (preferred). */
  file?: string;
  /** Explicit override URL for the OCR text. */
  url?: string;
  /** Internet Archive identifier, e.g. 'phantasmsoflivin01gurn'. */
  archiveId: string;
  vol: number;
}

const DEFAULT_VOLUMES: SprVolumeConfig[] = [
  { file: 'outputs/phantasms-v1.txt', archiveId: 'phantasmsoflivin01gurn', vol: 1 },
  { file: 'outputs/phantasms-v2.txt', archiveId: 'phantasmsoflivin02gurn', vol: 2 },
];

const SOURCE_TYPE = 'spr';
const SOURCE_LABEL = 'SPR — Phantasms of the Living (1886)';
const MAX_BODY_CHARS = 12_000;
const MIN_BODY_CHARS = 200;
const SUMMARY_CHARS = 380;
const MAX_TITLE_CHARS = 200;
// Forward jumps larger than this need successor confirmation (see header).
const JUMP_TOLERANCE = 40;

const CASE_MARKER_RE = /^\(\s*(\d{1,3})\s*\)/;

// ---------------------------------------------------------------------------
// OCR cleanup (deterministic)
// ---------------------------------------------------------------------------

/** True for lines that are page-printing artifacts, not narrative text.
 * `runningHeadWords` are ALL-CAPS title words used to spot running heads
 * ("PHANTASMS OF THE LIVING."); pd-text passes per-source words, spr keeps
 * its original default so behavior is unchanged. */
export function isArtifactLine(line: string, runningHeadWords: string[] = ['PHANTASMS']): boolean {
  const t = line.trim();
  if (t.length === 0) return false; // blank lines = paragraph breaks, keep
  // Google/IA scanner watermark
  if (/^Digitized\s+by/i.test(t)) return true;
  // Chapter headers: "CHAP. XII." / "chap, iv]"
  if (/^CHAP\.?\s/i.test(t)) return true;
  // Bare page numbers: "350" / "350."
  if (/^\d{1,4}\s*\.?$/.test(t)) return true;
  // Roman-numeral-only lines (front-matter page numbers): "xliv." / "IX"
  if (/^[ivxlcdmIVXLCDM]+\s*\.?$/.test(t) && !/^(I|i)$/.test(t)) return true;
  // Running heads containing the book title in caps: "PHANTASMS OF THE LIVING."
  if (t === t.toUpperCase() && runningHeadWords.some(w => t.includes(w))) return true;
  // Running heads with chapter-bracket markers and/or page numbers at either
  // end: "350  SUPPLEMENT.  [chap.", "in.]  TO  SPONTANEOUS  TELEPATHY.  97".
  // Strip the page furniture; if anything was stripped and the remaining core
  // is an all-caps section title, it's a header.
  const core = t
    // Leading chapter-bracket: "III.]", "xii.]", and OCR misreads like "in.]"
    // (safe to generalize — the remaining core must still be ALL CAPS).
    .replace(/^[A-Za-z]{0,8}\.?,?\s*\]\s*/, '')
    .replace(/^\d{1,4}\s+/, '')                      // leading page number
    .replace(/\[\s*chap\.?\s*\]?\s*\.?$/i, '')       // trailing "[chap."
    .replace(/\s+\d{1,4}\s*\.?$/, '')                // trailing page number
    .trim();
  if (core !== t && core.length > 0 && /[A-Z]/.test(core) && core === core.toUpperCase()) {
    return true;
  }
  // Printer's signature marks at page foot: "H", "H 2" (single capital,
  // optionally + digit; 'I' and 'A' excluded — real words).
  if (/^[B-HJ-Z]\s*\d?$/.test(t)) return true;
  return false;
}

/**
 * Deterministic OCR cleanup. Order matters:
 *  1. drop artifact lines
 *  2. rejoin hyphenated linebreaks ("there-\nfore" → "therefore")
 *  3. join single newlines into spaces, keep blank lines as paragraph breaks
 *  4. collapse runs of spaces (IA OCR double-spaces everything)
 */
export function cleanOcrBody(raw: string, runningHeadWords?: string[]): string {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').filter(l => !isArtifactLine(l, runningHeadWords));
  let text = lines.join('\n');
  // Rejoin hyphenated linebreaks (allow blank artifact-removed gap between
  // the hyphen and the continuation, which happens at page boundaries).
  text = text.replace(/([A-Za-z])-[ \t]*\n+[ \t]*([a-z])/g, '$1$2');
  // Mark paragraph breaks, then flatten intra-paragraph newlines.
  text = text
    .split(/\n[ \t]*\n+/)                       // paragraphs
    .map(p => p.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter(p => p.length > 0)
    .join('\n\n');
  return text.trim();
}

// ---------------------------------------------------------------------------
// Marker scan + monotonic guard
// ---------------------------------------------------------------------------

export interface RawMarker {
  lineIdx: number;
  num: number;
  /** Optional sub-letter for "903 A"-style section numbering (pd-text/Myers).
   * Always undefined for spr's "(370)" markers. */
  sub?: string;
}

export interface MarkerScanResult {
  accepted: RawMarker[];
  rejected: { lineIdx: number; num: number; reason: string }[];
}

export interface MonotonicGuardOptions {
  /** Forward jumps larger than this need successor confirmation. Default 40 (spr). */
  jumpTolerance?: number;
  /** How many raw markers ahead to consult when confirming a jump. Default 3 (spr). */
  confirmWindow?: number;
  /** Accept an equal case number when its sub-letter advances ("718 A" → "718 B"). */
  subLetters?: boolean;
}

/**
 * Apply the per-volume monotonic-increasing guard (with OCR-jump lookahead)
 * over the raw marker stream. Exported for tests/dry-run stats and reused by
 * the generic pd-text adapter; with no options the behavior is exactly the
 * original spr guard.
 */
export function applyMonotonicGuard(markers: RawMarker[], opts: MonotonicGuardOptions = {}): MarkerScanResult {
  const jumpTolerance = opts.jumpTolerance ?? JUMP_TOLERANCE;
  const confirmWindow = opts.confirmWindow ?? 3;
  const subLetters = !!opts.subLetters;
  const accepted: RawMarker[] = [];
  const rejected: { lineIdx: number; num: number; reason: string }[] = [];
  let last = 0;
  let lastSub = '';
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    if (m.num <= last) {
      // "718 A" → "718 B": same number, advancing sub-letter (pd-text only).
      if (subLetters && m.num === last && (m.sub || '') > lastSub) {
        accepted.push(m);
        lastSub = m.sub || '';
        continue;
      }
      rejected.push({ lineIdx: m.lineIdx, num: m.num, reason: 'non-monotonic (last accepted ' + last + ')' });
      continue;
    }
    if (m.num > last + jumpTolerance) {
      // Implausible jump — confirm with the next few raw markers. A real
      // sequence start (e.g. vol 2 opening at 218) is followed by n+1; an
      // OCR misread ("296" for "246") is followed by unrelated numbers.
      const lookahead = markers.slice(i + 1, i + 1 + confirmWindow).map(x => x.num);
      const confirmed = lookahead.some(n => n === m.num + 1 || n === m.num + 2 || (subLetters && n === m.num));
      if (!confirmed) {
        rejected.push({ lineIdx: m.lineIdx, num: m.num, reason: 'implausible jump from ' + last + ' (unconfirmed by successors ' + lookahead.join(',') + ')' });
        continue;
      }
    }
    accepted.push(m);
    last = m.num;
    lastSub = m.sub || '';
  }
  return { accepted, rejected };
}

// ---------------------------------------------------------------------------
// Witness line
// ---------------------------------------------------------------------------

export interface WitnessInfo {
  witnessLine: string | null;
  locationName: string | null;
}

/**
 * Many vol-2 cases open with a deposition header:
 *   "From Mrs. Mainwaring, Knowles, Ardingly, Hayward's Heath."
 * location_name = everything after the FIRST comma (trailing period
 * trimmed). We deliberately do NOT guess country/city/state fields — the
 * ingest engine / script geocoding fallbacks handle that.
 */
export function extractWitnessInfo(cleanBody: string): WitnessInfo {
  const firstPara = cleanBody.split('\n\n', 1)[0].trim();
  if (!/^From\s+/.test(firstPara) || firstPara.length > 300) {
    return { witnessLine: null, locationName: null };
  }
  const witnessLine = firstPara;
  const commaIdx = firstPara.indexOf(',');
  let locationName: string | null = null;
  if (commaIdx > 0 && commaIdx < firstPara.length - 1) {
    locationName = firstPara
      .substring(commaIdx + 1)
      .trim()
      .replace(/[.\s]+$/, '')
      .trim() || null;
  }
  return { witnessLine, locationName };
}

// ---------------------------------------------------------------------------
// Volume parsing
// ---------------------------------------------------------------------------

export interface SprParsedCase {
  caseNumber: number;
  vol: number;
  archiveId: string;
  body: string;             // cleaned
  witnessLine: string | null;
  locationName: string | null;
}

export interface SprVolumeStats {
  vol: number;
  archiveId: string;
  rawMarkers: number;
  acceptedMarkers: number;
  rejectedMarkers: number;
  skippedShort: number;
  cases: number;
}

export function parseVolume(rawText: string, volume: SprVolumeConfig): { cases: SprParsedCase[]; stats: SprVolumeStats; rejectedLog: string[] } {
  const lines = rawText.replace(/\r\n?/g, '\n').split('\n');
  const rawMarkers: RawMarker[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = CASE_MARKER_RE.exec(lines[i]);
    if (m) rawMarkers.push({ lineIdx: i, num: parseInt(m[1], 10) });
  }

  const { accepted, rejected } = applyMonotonicGuard(rawMarkers);
  const rejectedLog = rejected.map(
    r => '[spr] vol ' + volume.vol + ' line ' + (r.lineIdx + 1) + ': rejected marker (' + r.num + ') — ' + r.reason,
  );

  const cases: SprParsedCase[] = [];
  let skippedShort = 0;
  for (let i = 0; i < accepted.length; i++) {
    const start = accepted[i].lineIdx;
    const end = i + 1 < accepted.length ? accepted[i + 1].lineIdx : lines.length;
    let raw = lines.slice(start, end).join('\n');
    // Strip the "(370)" marker itself off the front.
    raw = raw.replace(CASE_MARKER_RE, '').replace(/^[ \t]+/, '');

    let body = cleanOcrBody(raw);
    if (body.length > MAX_BODY_CHARS) {
      // Cap at ~12k chars, cutting at the last paragraph (or word) boundary.
      let cut = body.lastIndexOf('\n\n', MAX_BODY_CHARS);
      if (cut < MAX_BODY_CHARS * 0.5) cut = body.lastIndexOf(' ', MAX_BODY_CHARS);
      if (cut < MAX_BODY_CHARS * 0.5) cut = MAX_BODY_CHARS;
      body = body.substring(0, cut).trim();
    }
    if (body.length < MIN_BODY_CHARS) {
      skippedShort++;
      continue;
    }

    const { witnessLine, locationName } = extractWitnessInfo(body);
    cases.push({
      caseNumber: accepted[i].num,
      vol: volume.vol,
      archiveId: volume.archiveId,
      body,
      witnessLine,
      locationName,
    });
  }

  return {
    cases,
    stats: {
      vol: volume.vol,
      archiveId: volume.archiveId,
      rawMarkers: rawMarkers.length,
      acceptedMarkers: accepted.length,
      rejectedMarkers: rejected.length,
      skippedShort,
      cases: cases.length,
    },
    rejectedLog,
  };
}

// ---------------------------------------------------------------------------
// ScrapedReport mapping
// ---------------------------------------------------------------------------

export function caseToReport(c: SprParsedCase): ScrapedReport {
  let title = 'Phantasms of the Living — Case ' + c.caseNumber;
  if (c.locationName) {
    const withLoc = title + ', ' + c.locationName;
    if (withLoc.length <= MAX_TITLE_CHARS) title = withLoc;
    else title = withLoc.substring(0, MAX_TITLE_CHARS - 1).replace(/[\s,]+$/, '') + '…';
  }

  let summary = c.body.replace(/\n+/g, ' ').trim();
  if (summary.length > SUMMARY_CHARS) {
    let cut = summary.lastIndexOf(' ', SUMMARY_CHARS);
    if (cut < SUMMARY_CHARS * 0.6) cut = SUMMARY_CHARS;
    summary = summary.substring(0, cut).trim() + '…';
  }

  const extracted = extractDate({ prose: c.body });

  const report: ScrapedReport = {
    title,
    summary,
    description: c.body,
    category: 'psychic_phenomena',
    credibility: 'medium',
    source_type: SOURCE_TYPE,
    source_label: SOURCE_LABEL,
    source_url: 'https://archive.org/details/' + c.archiveId,
    original_report_id: 'spr-phantasms-' + c.caseNumber,
    tags: ['apparition', 'historical', 'spr', 'phantasms'],
    event_date: extracted.date || undefined,
    event_date_precision: extracted.precision,
    event_date_extracted_from: extracted.source,
    metadata: {
      public_domain: true, // V11.18.22 — engine stores full text, no 2k cap
      work: 'Phantasms of the Living',
      authors: 'Gurney, Myers & Podmore',
      published: 1886,
      volume: c.vol,
      caseNumber: c.caseNumber,
      witnessLine: c.witnessLine,
      archiveId: c.archiveId,
      content_type: 'historical_case',
      ocr_cleaned: false, // flipped true by the Haiku repair pass in the script
      // Deterministic encyclopedia link (engine/orchestrator linker no-ops
      // if the slug doesn't exist in phenomena/phenomenon_types).
      experienceTypeSlug: 'apparition',
    },
  };
  if (c.locationName) report.location_name = c.locationName;
  return report;
}

// ---------------------------------------------------------------------------
// Text acquisition
// ---------------------------------------------------------------------------

async function loadVolumeText(volume: SprVolumeConfig): Promise<string> {
  if (volume.file && fs.existsSync(volume.file)) {
    console.log('[spr] vol ' + volume.vol + ': reading local file ' + volume.file);
    return fs.readFileSync(volume.file, 'utf8');
  }
  const url = volume.url || 'https://archive.org/download/' + volume.archiveId + '/' + volume.archiveId + '_djvu.txt';
  console.log('[spr] vol ' + volume.vol + ': fetching ' + url);
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Paradocs-Archive/1.0; +https://www.discoverparadocs.com)' },
  });
  if (!resp.ok) throw new Error('Failed to fetch ' + url + ': HTTP ' + resp.status);
  return resp.text();
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const sprAdapter: SourceAdapter = {
  name: 'spr',

  async scrape(config: Record<string, any>, limit: number = 10_000): Promise<AdapterResult> {
    const volumes: SprVolumeConfig[] = (config && Array.isArray(config.volumes) && config.volumes.length > 0)
      ? config.volumes
      : DEFAULT_VOLUMES;

    const reports: ScrapedReport[] = [];
    const errors: string[] = [];
    // A case number must be unique across the whole work; if OCR junk in a
    // later volume repeats an earlier number, keep the first and log.
    const seenCaseNumbers = new Map<number, number>(); // caseNumber → vol

    try {
      for (const volume of volumes) {
        if (reports.length >= limit) break;
        let text: string;
        try {
          text = await loadVolumeText(volume);
        } catch (e: any) {
          errors.push('vol ' + volume.vol + ': ' + (e?.message || e));
          continue;
        }

        const { cases, stats, rejectedLog } = parseVolume(text, volume);
        rejectedLog.forEach(l => console.log(l));
        console.log(
          '[spr] vol ' + stats.vol + ': ' + stats.rawMarkers + ' raw markers, ' +
          stats.acceptedMarkers + ' accepted, ' + stats.rejectedMarkers + ' rejected, ' +
          stats.skippedShort + ' skipped (<' + MIN_BODY_CHARS + ' chars), ' +
          stats.cases + ' cases',
        );

        for (const c of cases) {
          if (reports.length >= limit) break;
          if (seenCaseNumbers.has(c.caseNumber)) {
            console.log('[spr] vol ' + c.vol + ': case (' + c.caseNumber + ') repeats vol ' +
              seenCaseNumbers.get(c.caseNumber) + ' — keeping first, skipping');
            continue;
          }
          seenCaseNumbers.set(c.caseNumber, c.vol);
          reports.push(caseToReport(c));
        }
      }

      console.log('[spr] Parse complete. Total reports: ' + reports.length);
      return {
        success: true,
        reports,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };
    } catch (error) {
      console.error('[spr] Scrape failed:', error);
      return {
        success: false,
        reports,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};
