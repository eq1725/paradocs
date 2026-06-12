// PD-TEXT — generic public-domain book-corpus adapter.
//
// Generalization of the spr adapter (Phantasms of the Living, 1886) so any
// public-domain work with numbered case depositions can be ingested by
// adding a PD_SOURCES entry (src/lib/ingestion/pd-sources.config.ts) —
// no new adapter code. The spr source itself stays on its dedicated
// adapter; pd-text shares its battle-tested helpers (cleanOcrBody,
// applyMonotonicGuard, extractWitnessInfo) so OCR cleanup and the marker
// guard behave identically.
//
// IMPORTANT — PUBLIC DOMAIN ONLY. Every report carries
// metadata.public_domain = true, which triggers the engine's V11.18.22
// truncation bypass (full text stored, no 2,000-char copyright cap). The
// registry must therefore only ever contain unambiguously PD works.
//
// Parsing strategy (all deterministic — NO AI in the adapter):
//   - mode 'numbered' (default): case markers come from config.markerRegex
//     (group 1 = case number, optional group 2 = sub-letter for "718 A"-style
//     numbering), with the monotonic-increasing guard per volume, same as
//     spr (per-source jumpTolerance / confirmWindow / sub-letter support;
//     can be disabled for citation-style numbering, Flammarion's "Letter N.").
//   - mode 'chapter': volumes split on config.chapterRegex heading lines
//     instead — each chapter becomes ONE preliminary report
//     (original_report_id <key>-ch<N>; bodies over maxBodyChars overflow
//     into additional -p2/-p3 parts cut at paragraph boundaries). Chapter
//     titles come from the regex's optional capture group, or from a short
//     ALL-CAPS line directly under the head, or are constructed
//     ("Chapter N"). The live ingest script then segments each chapter into
//     discrete experience accounts with a Haiku step (<key>-ch<N>-a<M>);
//     metadata.segmented marks which rows are chapter slices (false) vs
//     extracted accounts (true).
//   - Optional contentStartRegex skips TOC/front matter that repeats the
//     marker/heading format (Myers, Owen, Stead, JSPR index).
//   - Deterministic OCR cleanup via spr's cleanOcrBody, with per-source
//     running-head words derived from the work title (+ artifactWords).

import * as fs from 'fs';
import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';
import { extractDate } from '../utils/extract-date';
import {
  cleanOcrBody,
  applyMonotonicGuard,
  extractWitnessInfo,
  RawMarker,
  MarkerScanResult,
} from './spr';
import { PD_SOURCES, PdSourceConfig, PdVolumeDef } from '../pd-sources.config';

const DEFAULT_MIN_BODY_CHARS = 200;
const DEFAULT_MAX_BODY_CHARS = 12_000;
const SUMMARY_CHARS = 380;
const MAX_TITLE_CHARS = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function defaultLocalFile(cfg: PdSourceConfig, vol: number): string {
  return 'outputs/pd-' + cfg.key + '-v' + vol + '.txt';
}

/** ALL-CAPS words used by isArtifactLine to spot running heads. */
export function runningHeadWordsFor(cfg: PdSourceConfig): string[] {
  const titleWords = cfg.workTitle
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(w => w.length >= 4);
  return Array.from(new Set([...titleWords, ...(cfg.artifactWords || []).map(w => w.toUpperCase())]));
}

// ---------------------------------------------------------------------------
// Volume parsing
// ---------------------------------------------------------------------------

export interface PdParsedCase {
  /** Display/id form: '370', '718A', '788-2' for repeated citation numbers,
   * or 'ch4' / 'ch4-p2' for chapter-mode slices. */
  caseId: string;
  /** Case number, or the 1-based chapter ordinal in chapter mode. */
  caseNumber: number;
  sub?: string;
  vol: number;
  archiveId: string;
  body: string;             // cleaned
  witnessLine: string | null;
  locationName: string | null;
  // ── chapter mode only ──
  /** 1-based chapter ordinal (document order, per volume). */
  chapterIndex?: number;
  /** Heading-derived title, or null when only "Chapter N" is known. */
  chapterTitle?: string | null;
  /** 1-based overflow part within the chapter (1 = first/only slice). */
  part?: number;
}

export interface PdVolumeStats {
  vol: number;
  archiveId: string;
  rawMarkers: number;
  acceptedMarkers: number;
  rejectedMarkers: number;
  skippedShort: number;
  cases: number;
}

export function parsePdVolume(
  rawText: string,
  volume: PdVolumeDef,
  cfg: PdSourceConfig,
): { cases: PdParsedCase[]; stats: PdVolumeStats; rejectedLog: string[] } {
  if (cfg.mode === 'chapter') return parsePdChapterVolume(rawText, volume, cfg);
  if (!cfg.markerRegex) {
    throw new Error('pd-text:' + cfg.key + ': mode "numbered" requires markerRegex');
  }
  const markerRe = new RegExp(cfg.markerRegex);
  const minBody = cfg.minBodyChars ?? DEFAULT_MIN_BODY_CHARS;
  const maxBody = cfg.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS;
  const headWords = runningHeadWordsFor(cfg);
  const lines = rawText.replace(/\r\n?/g, '\n').split('\n');

  // Skip TOC/front matter that repeats the marker format (Myers).
  let startIdx = 0;
  if (cfg.contentStartRegex) {
    const startRe = new RegExp(cfg.contentStartRegex);
    for (let i = 0; i < lines.length; i++) {
      if (startRe.test(lines[i])) { startIdx = i + 1; break; }
    }
  }

  const rawMarkers: RawMarker[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const m = markerRe.exec(lines[i]);
    if (m) {
      const marker: RawMarker = { lineIdx: i, num: parseInt(m[1], 10) };
      if (cfg.markerHasSubLetter && m[2]) marker.sub = String(m[2]).toUpperCase();
      rawMarkers.push(marker);
    }
  }

  let scan: MarkerScanResult;
  if (cfg.useMonotonicGuard === false) {
    // Citation-style numbering (Flammarion): every marker is a real
    // narrative boundary; numbers restart/wander, so no guard.
    scan = { accepted: rawMarkers.slice(), rejected: [] };
  } else {
    scan = applyMonotonicGuard(rawMarkers, {
      jumpTolerance: cfg.jumpTolerance,
      confirmWindow: cfg.markerConfirmWindow,
      subLetters: cfg.markerHasSubLetter,
    });
  }
  const { accepted, rejected } = scan;
  const rejectedLog = rejected.map(
    r => '[pd-text:' + cfg.key + '] vol ' + volume.vol + ' line ' + (r.lineIdx + 1) + ': rejected marker (' + r.num + ') — ' + r.reason,
  );

  const cases: PdParsedCase[] = [];
  const idCounts = new Map<string, number>();
  let skippedShort = 0;
  for (let i = 0; i < accepted.length; i++) {
    const start = accepted[i].lineIdx;
    const end = i + 1 < accepted.length ? accepted[i + 1].lineIdx : lines.length;
    let raw = lines.slice(start, end).join('\n');
    // Strip the marker itself off the front.
    raw = raw.replace(markerRe, '').replace(/^[ \t]+/, '');

    let body = cleanOcrBody(raw, headWords);
    if (body.length > maxBody) {
      // Cap, cutting at the last paragraph (or word) boundary.
      let cut = body.lastIndexOf('\n\n', maxBody);
      if (cut < maxBody * 0.5) cut = body.lastIndexOf(' ', maxBody);
      if (cut < maxBody * 0.5) cut = maxBody;
      body = body.substring(0, cut).trim();
    }
    if (body.length < minBody) {
      skippedShort++;
      continue;
    }

    const baseId = String(accepted[i].num) + (accepted[i].sub || '');
    const seen = (idCounts.get(baseId) || 0) + 1;
    idCounts.set(baseId, seen);
    const caseId = seen === 1 ? baseId : baseId + '-' + seen;

    const { witnessLine, locationName } = extractWitnessInfo(body);
    cases.push({
      caseId,
      caseNumber: accepted[i].num,
      sub: accepted[i].sub,
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
// Chapter mode (mode: 'chapter')
// ---------------------------------------------------------------------------

/** True for a short standalone ALL-CAPS line that reads as a chapter title
 * ("INTRODUCTION.", "THE DWELLER IN THE TEMPLE."). Tolerates light OCR
 * lowercase noise ("Xm") but rejects prose and quoted epigraphs. */
export function isAllCapsTitleLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 90) return false;
  if (/^["'“*]/.test(t)) return false;          // quoted epigraph
  if (/\d{2,}\s*$/.test(t)) return false;       // TOC page-number tail
  const letters = t.match(/[A-Za-z]/g) || [];
  if (letters.length < 3) return false;
  const uppers = t.match(/[A-Z]/g) || [];
  return uppers.length / letters.length >= 0.8;
}

/** Collapse OCR spacing and de-shout an ALL-CAPS heading for display:
 * "THE  DWELLER  IN  THE  TEMPLE." → "The Dweller in the Temple". */
export function cleanChapterTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim().replace(/[.,;:\s]+$/, '');
  const letters = t.match(/[A-Za-z]/g) || [];
  const uppers = t.match(/[A-Z]/g) || [];
  if (letters.length >= 3 && uppers.length / letters.length >= 0.8) {
    const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with']);
    t = t
      .toLowerCase()
      .split(' ')
      .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
  }
  return t;
}

/** Cut an over-long chapter body into ≤maxBody parts at paragraph (fallback
 * word) boundaries. Mirrors the numbered-mode cap logic, but keeps the
 * overflow instead of discarding it. */
export function splitBodyIntoParts(body: string, maxBody: number): string[] {
  const parts: string[] = [];
  let rest = body.trim();
  while (rest.length > maxBody) {
    let cut = rest.lastIndexOf('\n\n', maxBody);
    if (cut < maxBody * 0.5) cut = rest.lastIndexOf(' ', maxBody);
    if (cut < maxBody * 0.5) cut = maxBody;
    parts.push(rest.substring(0, cut).trim());
    rest = rest.substring(cut).trim();
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

function parsePdChapterVolume(
  rawText: string,
  volume: PdVolumeDef,
  cfg: PdSourceConfig,
): { cases: PdParsedCase[]; stats: PdVolumeStats; rejectedLog: string[] } {
  if (!cfg.chapterRegex) {
    throw new Error('pd-text:' + cfg.key + ': mode "chapter" requires chapterRegex');
  }
  const headRe = new RegExp(cfg.chapterRegex);
  const minBody = cfg.minBodyChars ?? DEFAULT_MIN_BODY_CHARS;
  const maxBody = cfg.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS;
  const headWords = runningHeadWordsFor(cfg);
  const lines = rawText.replace(/\r\n?/g, '\n').split('\n');

  // Skip TOC/front matter that repeats the heading format (Owen, Stead, JSPR).
  let startIdx = 0;
  if (cfg.contentStartRegex) {
    const startRe = new RegExp(cfg.contentStartRegex);
    for (let i = 0; i < lines.length; i++) {
      if (startRe.test(lines[i])) { startIdx = i + 1; break; }
    }
  }

  const heads: { lineIdx: number; title: string | null }[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const m = headRe.exec(lines[i]);
    if (m) heads.push({ lineIdx: i, title: m[1] ? cleanChapterTitle(m[1]) : null });
  }

  // Chapter ids restart per volume; prefix the volume for multi-volume works
  // so original_report_ids stay unique across the whole work.
  const idPrefix = cfg.volumes.length > 1 ? 'v' + volume.vol + '-ch' : 'ch';

  const cases: PdParsedCase[] = [];
  let skippedShort = 0;
  for (let h = 0; h < heads.length; h++) {
    const chapterIndex = h + 1;
    const end = h + 1 < heads.length ? heads[h + 1].lineIdx : lines.length;
    let title = heads[h].title;
    let bodyStart = heads[h].lineIdx + 1;

    // Heading regexes like "CHAPTER I." capture no title — check the first
    // non-empty line below the head for a standalone ALL-CAPS title.
    if (!title) {
      for (let j = bodyStart; j < Math.min(bodyStart + 4, end); j++) {
        const t = lines[j].trim();
        if (!t) continue;
        if (isAllCapsTitleLine(t)) {
          title = cleanChapterTitle(t);
          bodyStart = j + 1;
        }
        break; // only the FIRST non-empty line may be the title
      }
    }

    const body = cleanOcrBody(lines.slice(bodyStart, end).join('\n'), headWords);
    const parts = splitBodyIntoParts(body, maxBody);
    for (let p = 0; p < parts.length; p++) {
      if (parts[p].length < minBody) { skippedShort++; continue; }
      cases.push({
        caseId: idPrefix + chapterIndex + (p > 0 ? '-p' + (p + 1) : ''),
        caseNumber: chapterIndex,
        vol: volume.vol,
        archiveId: volume.archiveId,
        body: parts[p],
        witnessLine: null,     // chapters aggregate many witnesses
        locationName: null,    // …and many places — leave for segmentation
        chapterIndex,
        chapterTitle: title,
        part: p + 1,
      });
    }
  }

  return {
    cases,
    stats: {
      vol: volume.vol,
      archiveId: volume.archiveId,
      rawMarkers: heads.length,
      acceptedMarkers: heads.length,
      rejectedMarkers: 0,
      skippedShort,
      cases: cases.length,
    },
    rejectedLog: [],
  };
}

// ---------------------------------------------------------------------------
// ScrapedReport mapping
// ---------------------------------------------------------------------------

export function pdCaseToReport(c: PdParsedCase, cfg: PdSourceConfig): ScrapedReport {
  const isChapter = typeof c.chapterIndex === 'number';
  let title: string;
  if (isChapter) {
    title = cfg.workTitle + ' — ' + (c.chapterTitle || 'Chapter ' + c.chapterIndex);
    if (c.part && c.part > 1) title += ' (part ' + c.part + ')';
    if (title.length > MAX_TITLE_CHARS) {
      title = title.substring(0, MAX_TITLE_CHARS - 1).replace(/[\s,]+$/, '') + '…';
    }
  } else {
    title = cfg.workTitle + ' — Case ' + c.caseId;
    if (c.locationName) {
      const withLoc = title + ', ' + c.locationName;
      if (withLoc.length <= MAX_TITLE_CHARS) title = withLoc;
      else title = withLoc.substring(0, MAX_TITLE_CHARS - 1).replace(/[\s,]+$/, '') + '…';
    }
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
    category: cfg.category,
    credibility: 'medium',
    source_type: cfg.sourceType,
    source_label: cfg.sourceLabel,
    source_url: 'https://archive.org/details/' + c.archiveId,
    original_report_id: cfg.key + '-' + c.caseId,
    tags: cfg.tags,
    event_date: extracted.date || undefined,
    event_date_precision: extracted.precision,
    event_date_extracted_from: extracted.source,
    metadata: {
      public_domain: true, // V11.18.22 — engine stores full text, no 2k cap
      work: cfg.workTitle,
      authors: cfg.authors,
      published: cfg.published,
      volume: c.vol,
      caseNumber: c.caseNumber,
      caseId: c.caseId,
      witnessLine: c.witnessLine,
      archiveId: c.archiveId,
      content_type: 'historical_case',
      ocr_cleaned: false, // flipped true by the Haiku repair pass in the script
      pd_source_key: cfg.key,
    },
  };
  if (isChapter) {
    // Chapter slices are PRELIMINARY reports: the live ingest's Haiku
    // segmentation step splits them into discrete accounts (segmented:true)
    // and only the accounts are inserted.
    report.metadata!.chapter = c.chapterIndex;
    report.metadata!.chapterTitle = c.chapterTitle || null;
    report.metadata!.chapterPart = c.part || 1;
    report.metadata!.segmented = false;
  }
  if (cfg.experienceTypeSlug) {
    // Deterministic encyclopedia link (engine/orchestrator linker no-ops
    // if the slug doesn't exist in phenomena/phenomenon_types).
    report.metadata!.experienceTypeSlug = cfg.experienceTypeSlug;
  }
  if (c.locationName) report.location_name = c.locationName;
  return report;
}

// ---------------------------------------------------------------------------
// Text acquisition
// ---------------------------------------------------------------------------

export function archiveTxtUrl(archiveId: string): string {
  return 'https://archive.org/download/' + archiveId + '/' + archiveId + '_djvu.txt';
}

async function loadVolumeText(cfg: PdSourceConfig, volume: PdVolumeDef): Promise<string> {
  const candidates = [volume.localFile, defaultLocalFile(cfg, volume.vol)].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log('[pd-text:' + cfg.key + '] vol ' + volume.vol + ': reading local file ' + candidate);
      return fs.readFileSync(candidate, 'utf8');
    }
  }
  const url = archiveTxtUrl(volume.archiveId);
  console.log('[pd-text:' + cfg.key + '] vol ' + volume.vol + ': fetching ' + url);
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Paradocs-Archive/1.0; +https://www.discoverparadocs.com)' },
  });
  if (!resp.ok) throw new Error('Failed to fetch ' + url + ': HTTP ' + resp.status);
  return resp.text();
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const pdTextAdapter: SourceAdapter = {
  name: 'pd-text',

  /**
   * config: { sourceKey: '<PD_SOURCES key>', volumes?: PdVolumeDef[] }
   * volumes overrides the registry's volume list (e.g. local test fixtures).
   */
  async scrape(config: Record<string, any>, limit: number = 10_000): Promise<AdapterResult> {
    const sourceKey: string | undefined = config && config.sourceKey;
    const cfg = sourceKey ? PD_SOURCES[sourceKey] : undefined;
    if (!cfg) {
      return {
        success: false,
        reports: [],
        error: 'pd-text: missing/unknown config.sourceKey (' + String(sourceKey) + '). Known: ' + Object.keys(PD_SOURCES).join(', '),
      };
    }

    const volumes: PdVolumeDef[] = (config && Array.isArray(config.volumes) && config.volumes.length > 0)
      ? config.volumes
      : cfg.volumes;

    const reports: ScrapedReport[] = [];
    const errors: string[] = [];
    // Case ids must be unique across the whole work; if OCR junk in a later
    // volume repeats an earlier id, keep the first and log (spr convention).
    const seenCaseIds = new Map<string, number>(); // caseId → vol

    try {
      for (const volume of volumes) {
        if (reports.length >= limit) break;
        let text: string;
        try {
          text = await loadVolumeText(cfg, volume);
        } catch (e: any) {
          errors.push('vol ' + volume.vol + ': ' + (e?.message || e));
          continue;
        }

        const { cases, stats, rejectedLog } = parsePdVolume(text, volume, cfg);
        rejectedLog.forEach(l => console.log(l));
        console.log(
          '[pd-text:' + cfg.key + '] vol ' + stats.vol + ': ' + stats.rawMarkers + ' raw markers, ' +
          stats.acceptedMarkers + ' accepted, ' + stats.rejectedMarkers + ' rejected, ' +
          stats.skippedShort + ' skipped (<' + (cfg.minBodyChars ?? DEFAULT_MIN_BODY_CHARS) + ' chars), ' +
          stats.cases + ' cases',
        );

        for (const c of cases) {
          if (reports.length >= limit) break;
          if (seenCaseIds.has(c.caseId)) {
            console.log('[pd-text:' + cfg.key + '] vol ' + c.vol + ': case (' + c.caseId + ') repeats vol ' +
              seenCaseIds.get(c.caseId) + ' — keeping first, skipping');
            continue;
          }
          seenCaseIds.set(c.caseId, c.vol);
          reports.push(pdCaseToReport(c, cfg));
        }
      }

      console.log('[pd-text:' + cfg.key + '] Parse complete. Total reports: ' + reports.length);
      return {
        success: true,
        reports,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };
    } catch (error) {
      console.error('[pd-text:' + cfg.key + '] Scrape failed:', error);
      return {
        success: false,
        reports,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};
