#!/usr/bin/env tsx
/**
 * PD-TEXT Ingestion Runner — config-driven public-domain book corpora.
 *
 * Parameterized clone of scripts/spr-phantasms-ingest.ts: same single-pass
 * design, OCR-repair pass, quality gates, nderf-shaped pending_review
 * inserts, state file, and flags — but the WORK comes from the PD_SOURCES
 * registry (src/lib/ingestion/pd-sources.config.ts) via --source <key>.
 * Parsing is fully local via the pd-text adapter helpers
 * (src/lib/ingestion/adapters/pd-text.ts).
 *
 * PUBLIC DOMAIN: every PD_SOURCES entry is an unambiguously PD work;
 * every report carries metadata.public_domain = true → engine V11.18.22
 * stores the full text (no 2,000-char copyright cap).
 *
 * ── Usage ───────────────────────────────────────────────────────────
 *
 *   set -a; source .env.local; set +a
 *
 *   # Dry run — parse only. NO DB, NO AI. (Downloads the archive.org OCR
 *   # text to outputs/pd-<key>-v<N>.txt on first run if missing.) Writes
 *   # outputs/pd-<key>-dry-run.json with stats + first 15 mapped reports.
 *   tsx scripts/pd-text-ingest.ts --source flammarion-unknown --dry-run
 *
 *   # Live ingest (Haiku OCR repair + insert as pending_review)
 *   tsx scripts/pd-text-ingest.ts --source myers-human-personality --concurrency 6 --max-cost 10
 *
 *   # Resume from case 370, skip the Haiku repair pass
 *   tsx scripts/pd-text-ingest.ts --source flammarion-unknown --start-case 370 --skip-clean
 *
 * ── Flags ───────────────────────────────────────────────────────────
 *   --source KEY       REQUIRED. PD_SOURCES registry key.
 *   --dry-run          Parse + map only; write outputs/pd-<key>-dry-run.json.
 *   --limit N          Process at most N cases.
 *   --skip-clean       Skip the Haiku OCR-repair call (ocr_cleaned=false).
 *   --concurrency N    Parallel case workers (default 6).
 *   --start-case N     Resume: only process caseNumber >= N.
 *   --max-cost USD     Abort when this run's Haiku spend exceeds it ($10).
 *   --v1 / --v2 PATH   Override local OCR text paths for volume 1 / 2.
 *   --keep-borderline  Keep borderline-scored cases (see spr script notes).
 *   --skip-prefilter   Bypass modern-web content pre-filters (see spr notes).
 *
 * ── Live flow per case ──────────────────────────────────────────────
 *   Identical to spr-phantasms-ingest.ts: sha256 audit hash → Haiku OCR
 *   repair (cost-logged, service 'pd-ocr-repair') → dedup
 *   (source_type=<cfg.sourceType> + original_report_id) → PII redact →
 *   enrich → quality assess → smart re-evaluate → geocode → insert as
 *   status='pending_review' (exact nderf payload shape) → deterministic
 *   phenomenon-linking mirror. State: outputs/pd-<key>-ingest-state.json.
 *
 * ── Chapter-mode sources (cfg.mode='chapter') ───────────────────────
 *   A SEGMENTATION step is inserted between parse and OCR repair (live
 *   only — --dry-run reports raw chapter slices): one Haiku call per
 *   chapter slice (cost-logged, service 'pd-segmentation') returns strict
 *   JSON {"accounts":[{text,witness_hint,date_hint,place_hint}]} where each
 *   text is a VERBATIM narrative span from the chapter. Every account is
 *   validated as near-verbatim (≥85% of its word 8-grams must appear in
 *   the chapter text — rejects hallucinations), must be ≥400 chars, and
 *   then becomes its own report (original_report_id <key>-ch<N>-a<M>,
 *   metadata.segmented=true) flowing through the normal per-report
 *   pipeline. Chapters yielding 0 usable accounts (minutes, reviews,
 *   theory) are counted and skipped.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import {
  parsePdVolume,
  pdCaseToReport,
  defaultLocalFile,
  archiveTxtUrl,
  PdParsedCase,
  PdVolumeStats,
} from '../src/lib/ingestion/adapters/pd-text';
import { PD_SOURCES, PdSourceConfig, PdVolumeDef } from '../src/lib/ingestion/pd-sources.config';
import { ScrapedReport } from '../src/lib/ingestion/types';
import { extractDate } from '../src/lib/ingestion/utils/extract-date';

// ─────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_MAX_COST_USD = 10;

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
// Live (non-batch) Haiku 4.5 pricing — matches src/lib/services/ai-cost-logger.ts
const HAIKU_INPUT_USD_PER_M = 1.0;
const HAIKU_OUTPUT_USD_PER_M = 5.0;
const HAIKU_MAX_TOKENS = 8192;
const HAIKU_TIMEOUT_MS = 90_000;
const HAIKU_MAX_RETRIES = 2;

const OCR_REPAIR_SYSTEM_PROMPT =
  'You repair OCR transcription errors in 19th- and early-20th-century printed English. ' +
  'Fix broken/misrecognized words, remove page-header artifacts and stray characters, rejoin split words. ' +
  'Do NOT rewrite, modernize, summarize, omit, or add content. ' +
  'Preserve original wording, punctuation, and period spellings exactly. ' +
  'Output only the repaired text.';

// ── Chapter segmentation (mode 'chapter' sources, live only) ─────────
// One Haiku call per chapter slice, BETWEEN parse and OCR repair: the
// chapter is split into discrete verbatim experience accounts; everything
// editorial is discarded. Accounts are validated as near-verbatim
// substrings of the chapter (8-gram containment) before becoming reports.

const SEGMENTATION_SYSTEM_PROMPT =
  'You extract first-hand anomalous-experience accounts from chapters of public-domain ' +
  '19th/early-20th-century books and journals that collect such accounts (apparitions, ' +
  'hauntings, premonitions, telepathic impressions, deathbed visions, poltergeist episodes, ' +
  'prophetic dreams, and similar).\n' +
  '\n' +
  'INPUT: one chapter (or part of a chapter), possibly with OCR noise.\n' +
  'OUTPUT: STRICT JSON, nothing else — no prose, no markdown fences:\n' +
  '{"accounts":[{"text":"...","witness_hint":"...","date_hint":"...","place_hint":"..."}]}\n' +
  '\n' +
  'Rules:\n' +
  '- Each entry in "accounts" is ONE discrete experience narrative: a specific person\'s ' +
  'report of a specific anomalous experience (or one self-contained story about one).\n' +
  '- "text" must be reproduced VERBATIM from the chapter: an exact, contiguous ' +
  'transcription of the narrative span, including any quoted letter or testimony it ' +
  'consists of. Do NOT rewrite, paraphrase, modernize, fix spelling or OCR errors, ' +
  'summarize, abridge, or add a single word. The ONLY editing allowed is choosing where ' +
  'the span starts and ends, so that surrounding commentary/apparatus is left out.\n' +
  '- EXCLUDE entirely (never inside "text", never as an account): the author\'s or ' +
  'editor\'s theorizing and connective discussion, meeting minutes and society business, ' +
  'member lists, notices, book reviews, statistics and tables, footnote/citation ' +
  'apparatus, page headers, tables of contents.\n' +
  '- If a narrative is interrupted by a brief editorial aside, return the longest clean ' +
  'contiguous span (or two separate accounts if both halves stand alone as narratives).\n' +
  '- "witness_hint": who experienced/reported it, exactly as the text names them ' +
  '(e.g. "Mrs. W. of Brighton", "a clergyman\'s daughter"); "" if unstated.\n' +
  '- "date_hint": when the experience occurred, as stated in the text ' +
  '(e.g. "June 1867", "twelve years ago"); "" if unstated.\n' +
  '- "place_hint": where it occurred (e.g. "Edinburgh", "a farmhouse in Sussex"); ' +
  '"" if unstated.\n' +
  '- If the chapter contains NO experience narratives (pure theory, minutes, reviews, ' +
  'tables, front matter), return exactly {"accounts":[]}.';

/** Accounts shorter than this are discarded (too thin to stand as reports). */
const SEGMENT_MIN_ACCOUNT_CHARS = 400;
/** Minimum share of an account's 8-grams that must appear in its chapter. */
const SEGMENT_MIN_CONTAINMENT = 0.85;
const SEGMENT_NGRAM = 8;

// ─────────────────────────────────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  source: string | null;
  dryRun: boolean;
  limit: number;
  skipClean: boolean;
  concurrency: number;
  startCase: number;
  maxCostUsd: number;
  v1Path: string | null;
  v2Path: string | null;
  /** Keep borderline-scored cases instead of dropping them. smartReEvaluate's
   * promotion signals are tuned for modern web content; PD-book cases are
   * pre-vetted period depositions and ALL inserts land as DB status
   * 'pending_review' anyway, so the founder remains the gate. Kept rows get
   * metadata.score_status='borderline_kept' for easy queue filtering. */
  keepBorderline: boolean;
  /** Bypass the modern-web content pre-filters (isObviouslyLowQuality +
   * assessQuality hard rejects). The shared filter lists are Reddit-derived
   * and false-positive on Victorian prose — e.g. /\b(print)\b/ ("printed in
   * the Journal"), /\b(dressed as)\b/, /\b(discussion)\b/. All inserts
   * remain DB status 'pending_review'; bypassed rows are tagged
   * metadata.score_status='prefilter_bypassed' for queue filtering. */
  skipPrefilter: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  function flag(name: string, def: string | null = null): string | null {
    const idx = argv.indexOf(name);
    if (idx < 0) return def;
    return argv[idx + 1];
  }
  function bool(name: string): boolean {
    return argv.indexOf(name) >= 0;
  }
  return {
    source: flag('--source', null),
    dryRun: bool('--dry-run'),
    limit: parseInt(flag('--limit', '100000') || '100000'),
    skipClean: bool('--skip-clean'),
    concurrency: parseInt(flag('--concurrency', String(DEFAULT_CONCURRENCY)) || String(DEFAULT_CONCURRENCY)),
    startCase: parseInt(flag('--start-case', '0') || '0'),
    maxCostUsd: parseFloat(flag('--max-cost', String(DEFAULT_MAX_COST_USD)) || String(DEFAULT_MAX_COST_USD)),
    v1Path: flag('--v1', null),
    v2Path: flag('--v2', null),
    keepBorderline: bool('--keep-borderline'),
    skipPrefilter: bool('--skip-prefilter'),
  };
}

function stateFilePath(cfg: PdSourceConfig): string {
  return path.resolve(process.cwd(), 'outputs/pd-' + cfg.key + '-ingest-state.json');
}
function dryRunFilePath(cfg: PdSourceConfig): string {
  return path.resolve(process.cwd(), 'outputs/pd-' + cfg.key + '-dry-run.json');
}

// ─────────────────────────────────────────────────────────────────────
// VOLUME ACQUISITION + PARSE (shared by dry + live)
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve a volume's OCR text on disk; download from archive.org to
 * outputs/pd-<key>-v<N>.txt when missing (the only network this script
 * ever uses, and the only one allowed: archive.org *_djvu.txt).
 */
async function ensureVolumeFile(cfg: PdSourceConfig, vol: PdVolumeDef, override: string | null): Promise<string> {
  const dl = defaultLocalFile(cfg, vol.vol);
  const candidates = [override, vol.localFile, dl, '../' + dl].filter(Boolean) as string[];
  for (const c of candidates) {
    const abs = path.resolve(process.cwd(), c);
    if (fs.existsSync(abs)) return abs;
  }
  const url = archiveTxtUrl(vol.archiveId);
  console.log('[pd-ingest:' + cfg.key + '] vol ' + vol.vol + ': downloading ' + url);
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Paradocs-Archive/1.0; +https://www.discoverparadocs.com)' },
  });
  if (!resp.ok) {
    throw new Error(
      'vol ' + vol.vol + ': download failed (HTTP ' + resp.status + ') for ' + url +
      '. Obtain the text manually and place it at ' + dl + ' (see PD_SOURCES["' + cfg.key + '"].notes).',
    );
  }
  const text = await resp.text();
  const abs = path.resolve(process.cwd(), dl);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
  console.log('[pd-ingest:' + cfg.key + '] vol ' + vol.vol + ': saved ' + abs + ' (' + text.length + ' chars)');
  return abs;
}

interface ParsedCorpus {
  volumes: {
    config: PdVolumeDef & { file: string };
    stats: PdVolumeStats;
    rejectedLog: string[];
  }[];
  cases: PdParsedCase[];           // cross-volume deduped, in order
  duplicateCaseIds: { caseId: string; keptVol: number; skippedVol: number }[];
}

async function parseCorpus(cfg: PdSourceConfig, args: CliArgs): Promise<ParsedCorpus> {
  const volumes: ParsedCorpus['volumes'] = [];
  const cases: PdParsedCase[] = [];
  const duplicateCaseIds: ParsedCorpus['duplicateCaseIds'] = [];
  const seen = new Map<string, number>();

  for (const def of cfg.volumes) {
    const override = def.vol === 1 ? args.v1Path : def.vol === 2 ? args.v2Path : null;
    const file = await ensureVolumeFile(cfg, def, override);
    console.log('[pd-ingest:' + cfg.key + '] vol ' + def.vol + ': parsing ' + file);
    const text = fs.readFileSync(file, 'utf8');
    const { cases: volCases, stats, rejectedLog } = parsePdVolume(text, def, cfg);
    rejectedLog.forEach(l => console.log(l));
    console.log(
      '[pd-ingest:' + cfg.key + '] vol ' + stats.vol + ': raw markers=' + stats.rawMarkers +
      ' accepted=' + stats.acceptedMarkers + ' rejected=' + stats.rejectedMarkers +
      ' skippedShort=' + stats.skippedShort + ' cases=' + stats.cases,
    );
    volumes.push({ config: Object.assign({}, def, { file }), stats, rejectedLog });

    for (const c of volCases) {
      if (seen.has(c.caseId)) {
        duplicateCaseIds.push({ caseId: c.caseId, keptVol: seen.get(c.caseId)!, skippedVol: c.vol });
        console.log('[pd-ingest:' + cfg.key + '] case (' + c.caseId + ') repeats across volumes — keeping vol ' + seen.get(c.caseId) + ', skipping vol ' + c.vol);
        continue;
      }
      seen.set(c.caseId, c.vol);
      cases.push(c);
    }
  }

  return { volumes, cases, duplicateCaseIds };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

// ─────────────────────────────────────────────────────────────────────
// DRY RUN — parse only. NO DB, NO AI. (Network only to fetch the
// archive.org OCR text when not already on disk.)
// ─────────────────────────────────────────────────────────────────────

async function runDry(cfg: PdSourceConfig, args: CliArgs): Promise<void> {
  const corpus = await parseCorpus(cfg, args);
  const reports = corpus.cases
    .filter(c => c.caseNumber >= args.startCase)
    .slice(0, args.limit)
    .map(c => pdCaseToReport(c, cfg));

  const bodyLens = reports.map(r => r.description.length);
  const withLocation = reports.filter(r => !!r.location_name).length;
  const withDate = reports.filter(r => !!r.event_date && r.event_date_precision !== 'unknown').length;

  const out = {
    generatedAt: new Date().toISOString(),
    source: cfg.key,
    args,
    volumes: corpus.volumes.map(v => ({
      vol: v.config.vol,
      archiveId: v.config.archiveId,
      file: v.config.file,
      rawMarkers: v.stats.rawMarkers,
      acceptedMarkers: v.stats.acceptedMarkers,
      rejectedMarkers: v.stats.rejectedMarkers,
      skippedShort: v.stats.skippedShort,
      cases: v.stats.cases,
      rejectedLog: v.rejectedLog,
    })),
    duplicateCaseIdsAcrossVolumes: corpus.duplicateCaseIds,
    totals: {
      totalCases: reports.length,
      medianBodyLength: median(bodyLens),
      minBodyLength: bodyLens.length ? Math.min(...bodyLens) : 0,
      maxBodyLength: bodyLens.length ? Math.max(...bodyLens) : 0,
      withLocationName: withLocation,
      pctWithLocationName: reports.length ? Math.round((withLocation / reports.length) * 1000) / 10 : 0,
      withEventDate: withDate,
      pctWithEventDate: reports.length ? Math.round((withDate / reports.length) * 1000) / 10 : 0,
    },
    sampleReports: reports.slice(0, 15),
  };

  const dryFile = dryRunFilePath(cfg);
  fs.mkdirSync(path.dirname(dryFile), { recursive: true });
  fs.writeFileSync(dryFile, JSON.stringify(out, null, 2));

  console.log('\n=== pd-text dry run — ' + cfg.workTitle + ' (' + cfg.key + ') ===');
  for (const v of out.volumes) {
    console.log('vol ' + v.vol + ': raw=' + v.rawMarkers + ' accepted=' + v.acceptedMarkers + ' rejected=' + v.rejectedMarkers + ' cases=' + v.cases);
  }
  console.log('total mapped reports: ' + out.totals.totalCases);
  console.log('median body length:   ' + out.totals.medianBodyLength + ' chars');
  if (cfg.mode === 'chapter') {
    console.log('NOTE: chapter mode — dry run reports raw chapter slices; the live ' +
      'Haiku segmentation step (skipped here) splits each into discrete accounts.');
    console.log('first chapter slices:');
    reports.slice(0, 10).forEach(r =>
      console.log('  ' + r.original_report_id + '  [' + r.description.length + ' chars]  ' + r.title));
  }
  console.log('with location_name:   ' + out.totals.withLocationName + ' (' + out.totals.pctWithLocationName + '%)');
  console.log('with event_date:      ' + out.totals.withEventDate + ' (' + out.totals.pctWithEventDate + '%)');
  console.log('Dry-run report written to ' + dryFile);
}

// ─────────────────────────────────────────────────────────────────────
// STATE (live mode)
// ─────────────────────────────────────────────────────────────────────

interface IngestState {
  startedAt: string;
  source: string;
  args: CliArgs;
  totals: {
    parsed: number;
    processed: number;
    inserted: number;
    duplicates: number;
    filtered: number;
    errors: number;
    ocrRepaired: number;
    ocrRepairSkipped: number;
    costUsd: number;
    rejectionReasons: Record<string, number>;
    // ── chapter mode only ──
    /** Chapter slices segmented by Haiku. */
    segmentedChapters: number;
    /** Chapter slices that yielded 0 usable accounts (counted + skipped). */
    emptyChapters: number;
    /** Chapter slices where the segmentation call itself failed. */
    segmentationFailed: number;
    /** Accounts that passed validation and entered the per-report pipeline. */
    accountsExtracted: number;
    /** Accounts dropped for being under SEGMENT_MIN_ACCOUNT_CHARS. */
    accountsDroppedShort: number;
    /** Accounts rejected as non-verbatim (hallucination guard). */
    accountsRejectedNonVerbatim: number;
  };
  lastProcessedCase: number;
  lastUpdatedAt: string;
}

function emptyState(cfg: PdSourceConfig, args: CliArgs): IngestState {
  return {
    startedAt: new Date().toISOString(),
    source: cfg.key,
    args,
    totals: {
      parsed: 0, processed: 0, inserted: 0, duplicates: 0, filtered: 0,
      errors: 0, ocrRepaired: 0, ocrRepairSkipped: 0, costUsd: 0, rejectionReasons: {},
      segmentedChapters: 0, emptyChapters: 0, segmentationFailed: 0,
      accountsExtracted: 0, accountsDroppedShort: 0, accountsRejectedNonVerbatim: 0,
    },
    lastProcessedCase: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function saveState(cfg: PdSourceConfig, state: IngestState): void {
  state.lastUpdatedAt = new Date().toISOString();
  const file = stateFilePath(cfg);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h + 'h ' + m + 'm ' + s + 's';
}

// ─────────────────────────────────────────────────────────────────────
// SLUG (identical to nderf-mass-ingest.ts)
// ─────────────────────────────────────────────────────────────────────

function generateSlug(title: string, originalId: string | null, sourceType: string): string {
  const titlePart = (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 60);
  const uniqueKey = sourceType + '-' + (originalId || Math.random().toString(36).substring(2, 8));
  let hash = 0;
  for (let i = 0; i < uniqueKey.length; i++) {
    hash = (hash << 5) - hash + uniqueKey.charCodeAt(i);
    hash = hash & hash;
  }
  const suffix = Math.abs(hash).toString(36).substring(0, 6);
  return titlePart + '-' + suffix;
}

// ─────────────────────────────────────────────────────────────────────
// HAIKU OCR REPAIR (live mode only)
// ─────────────────────────────────────────────────────────────────────

interface OcrRepairResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

async function repairOcrWithHaiku(body: string): Promise<OcrRepairResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  for (let attempt = 0; attempt <= HAIKU_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: HAIKU_MAX_TOKENS,
          temperature: 0,
          system: OCR_REPAIR_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: body }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt < HAIKU_MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        return null;
      }
      if (!resp.ok) return null;
      const data: any = await resp.json();
      const text: string | undefined = data?.content?.[0]?.text;
      if (!text || typeof text !== 'string') return null;
      const repaired = text.trim();
      // Sanity guard: repair should not materially shrink or grow the text.
      // If it does, Haiku rewrote/summarized — keep the deterministic body.
      const ratio = repaired.length / Math.max(1, body.length);
      if (ratio < 0.6 || ratio > 1.3) {
        console.warn('[pd-ingest] OCR repair length ratio ' + ratio.toFixed(2) + ' out of bounds — keeping raw body');
        return null;
      }
      const inputTokens = data?.usage?.input_tokens || 0;
      const outputTokens = data?.usage?.output_tokens || 0;
      const costUsd =
        (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_M +
        (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_M;
      return { text: repaired, inputTokens, outputTokens, costUsd };
    } catch (e) {
      clearTimeout(timeoutId);
      if (attempt < HAIKU_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

/** Rebuild the ~380-char summary after the body changes (OCR repair). */
function summarize(body: string): string {
  let summary = body.replace(/\n+/g, ' ').trim();
  if (summary.length > 380) {
    let cut = summary.lastIndexOf(' ', 380);
    if (cut < 380 * 0.6) cut = 380;
    summary = summary.substring(0, cut).trim() + '…';
  }
  return summary;
}

// ─────────────────────────────────────────────────────────────────────
// HAIKU CHAPTER SEGMENTATION (chapter-mode sources, live mode only)
// ─────────────────────────────────────────────────────────────────────

interface SegmentedAccount {
  text: string;
  witness_hint?: string;
  date_hint?: string;
  place_hint?: string;
}

interface SegmentationResult {
  accounts: SegmentedAccount[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** One Haiku call per chapter slice — same raw-fetch/retry pattern as the
 * OCR-repair step. Returns null on hard failure (counted, chapter skipped). */
async function segmentChapterWithHaiku(chapterText: string): Promise<SegmentationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  for (let attempt = 0; attempt <= HAIKU_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: HAIKU_MAX_TOKENS,
          temperature: 0,
          system: SEGMENTATION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: chapterText }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt < HAIKU_MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        return null;
      }
      if (!resp.ok) return null;
      const data: any = await resp.json();
      const text: string | undefined = data?.content?.[0]?.text;
      if (!text || typeof text !== 'string') return null;
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return null;
      let parsed: any;
      try { parsed = JSON.parse(m[0]); } catch { return null; }
      if (!parsed || !Array.isArray(parsed.accounts)) return null;
      const accounts: SegmentedAccount[] = parsed.accounts.filter(
        (a: any) => a && typeof a.text === 'string' && a.text.trim().length > 0,
      );
      const inputTokens = data?.usage?.input_tokens || 0;
      const outputTokens = data?.usage?.output_tokens || 0;
      const costUsd =
        (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_M +
        (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_M;
      return { accounts, inputTokens, outputTokens, costUsd };
    } catch (e) {
      clearTimeout(timeoutId);
      if (attempt < HAIKU_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

/** Whitespace/punctuation-insensitive normalization for verbatim matching. */
function normalizeForMatch(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Hallucination guard: share of the account's word 8-grams present in the
 * chapter's 8-gram set. Whitespace/punctuation/case differences are
 * normalized away, so OCR-faithful transcription scores ~1.0 while any
 * rewriting/paraphrase collapses the score. Accounts under
 * SEGMENT_MIN_CONTAINMENT are rejected and logged.
 */
function ngramContainment(accountText: string, chapterText: string, n: number = SEGMENT_NGRAM): number {
  const aw = normalizeForMatch(accountText);
  const cw = normalizeForMatch(chapterText);
  if (aw.length < n || cw.length < n) return 0;
  const chapterGrams = new Set<string>();
  for (let i = 0; i + n <= cw.length; i++) chapterGrams.add(cw.slice(i, i + n).join(' '));
  let total = 0;
  let hits = 0;
  for (let i = 0; i + n <= aw.length; i++) {
    total++;
    if (chapterGrams.has(aw.slice(i, i + n).join(' '))) hits++;
  }
  return total > 0 ? hits / total : 0;
}

/** Map one validated segmented account to its own ScrapedReport. The id is
 * <chapter slice original_report_id>-a<M> with M = the account's 1-based
 * position in Haiku's returned array (stable across re-runs at temp 0),
 * e.g. crowe-night-side-ch4-a2 or spr-jspr-pilot-ch12-p2-a1. */
function accountToReport(
  chapter: ScrapedReport,
  acc: SegmentedAccount,
  accountIdx: number,
  cfg: PdSourceConfig,
  containment: number,
): ScrapedReport {
  const text = acc.text.trim();
  const meta = chapter.metadata || {};
  const chapterLabel = (meta.chapterTitle as string | null) || 'Chapter ' + (meta.chapter || '?');

  let title = cfg.workTitle + ' — ' + chapterLabel + ' — Account ' + accountIdx;
  if (title.length > 200) title = title.substring(0, 199) + '…';

  const extracted = extractDate({ prose: text });

  return {
    title,
    summary: summarize(text),
    description: text,
    category: cfg.category,
    credibility: 'medium',
    source_type: cfg.sourceType,
    source_label: cfg.sourceLabel,
    source_url: chapter.source_url,
    original_report_id: chapter.original_report_id + '-a' + accountIdx,
    tags: cfg.tags,
    event_date: extracted.date || undefined,
    event_date_precision: extracted.precision,
    event_date_extracted_from: extracted.source,
    metadata: Object.assign({}, meta, {
      caseId: (meta.caseId || '') + '-a' + accountIdx,
      segmented: true,
      segmentation_model: HAIKU_MODEL,
      verbatim_containment: Math.round(containment * 1000) / 1000,
      witness_hint: (acc.witness_hint || '').trim() || null,
      date_hint: (acc.date_hint || '').trim() || null,
      place_hint: (acc.place_hint || '').trim() || null,
      account_index: accountIdx,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────
// LIVE MODE
// ─────────────────────────────────────────────────────────────────────

async function runLive(cfg: PdSourceConfig, args: CliArgs): Promise<void> {
  // Heavy imports are deferred so --dry-run never touches env/DB/AI deps.
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[pd-ingest] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source .env.local first.');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY && !args.skipClean) {
    console.error('[pd-ingest] ANTHROPIC_API_KEY missing and --skip-clean not set. Either source .env.local or pass --skip-clean.');
    process.exit(1);
  }
  if (cfg.mode === 'chapter' && !process.env.ANTHROPIC_API_KEY) {
    // The segmentation step is NOT optional for chapter sources: without it
    // we would insert raw chapter slabs, not discrete experience accounts.
    console.error('[pd-ingest] ANTHROPIC_API_KEY missing — chapter-mode sources require the Haiku segmentation step (it cannot be skipped).');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const { redactReportPii } = await import('../src/lib/ingestion/utils/redact-pii');
  const { enrichReport } = await import('../src/lib/ingestion/enrichment/report-enricher');
  const {
    assessQuality,
    getStatusFromScore,
    isObviouslyLowQuality,
    smartReEvaluate,
  } = await import('../src/lib/ingestion/filters');
  const {
    normalizeLocation,
    geocodeWithFallback,
    makeSupabaseGeocodeCache,
  } = await import('../src/lib/ingestion/utils/normalize-location');
  const { extractAndGeocodeLocation } = await import('../src/lib/services/location-extraction.service');

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // ── Deterministic phenomenon-linker mirror (nderf-mass-ingest V11.17.13) ──
  const phenomenonSlugCache = new Map<string, { phenomenonId: string | null; phenomenonTypeId: string | null }>();

  async function resolveSlugCached(slug: string): Promise<{ phenomenonId: string | null; phenomenonTypeId: string | null }> {
    if (phenomenonSlugCache.has(slug)) return phenomenonSlugCache.get(slug)!;
    let phenomenonId: string | null = null;
    let phenomenonTypeId: string | null = null;
    try {
      const { data: phen } = await supabase.from('phenomena').select('id').eq('slug', slug).eq('status', 'active').maybeSingle();
      phenomenonId = phen ? (phen as any).id : null;
    } catch { /* ignore */ }
    try {
      const { data: ptype } = await supabase.from('phenomenon_types').select('id').eq('slug', slug).maybeSingle();
      phenomenonTypeId = ptype ? (ptype as any).id : null;
    } catch { /* ignore */ }
    const result = { phenomenonId, phenomenonTypeId };
    phenomenonSlugCache.set(slug, result);
    return result;
  }

  async function linkExperienceTypeForRow(row: { id: string; metadata: any }): Promise<boolean> {
    const slug = row.metadata && row.metadata.experienceTypeSlug;
    if (!slug || typeof slug !== 'string') return false;
    const { phenomenonId, phenomenonTypeId } = await resolveSlugCached(slug);
    if (!phenomenonId) return false;
    try {
      await supabase.from('report_phenomena').upsert(
        {
          report_id: row.id,
          phenomenon_id: phenomenonId,
          confidence: 0.95,
          tagged_by: 'auto',
          is_primary: true,
        },
        { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true },
      );
    } catch { return false; }
    if (phenomenonTypeId) {
      try {
        await supabase.from('reports').update({ phenomenon_type_id: phenomenonTypeId }).eq('id', row.id).is('phenomenon_type_id', null);
      } catch { /* ignore */ }
    }
    return true;
  }

  async function logHaikuCost(
    service: 'pd-ocr-repair' | 'pd-segmentation',
    reportId: string | null,
    originalReportId: string,
    r: { inputTokens: number; outputTokens: number; costUsd: number },
  ): Promise<void> {
    try {
      await supabase.from('paradocs_narrative_cost_log').insert({
        service,
        report_id: reportId,
        model: HAIKU_MODEL + ' (' + service + ':' + cfg.key + ')',
        input_tokens: r.inputTokens,
        output_tokens: r.outputTokens,
        cache_creation_tokens: null,
        cost_usd: r.costUsd,
        status: 'completed',
        reason: originalReportId,
      });
    } catch { /* non-fatal */ }
  }

  // ── Parse corpus ────────────────────────────────────────────────────
  const corpus = await parseCorpus(cfg, args);
  let reports = corpus.cases
    .filter(c => c.caseNumber >= args.startCase)
    .slice(0, args.limit)
    .map(c => pdCaseToReport(c, cfg));

  const state = emptyState(cfg, args);
  state.totals.parsed = reports.length;
  saveState(cfg, state);
  console.log('[pd-ingest:' + cfg.key + '] ' + reports.length + ' cases to process (start-case=' + args.startCase + ', limit=' + args.limit + ')');

  // ── Pre-fetch dedup set (nderf convention) ──────────────────────────
  // Chapter mode: account ids (<key>-ch<N>-a<M>) are only known AFTER
  // segmentation, so fetch every existing id for the source_type instead of
  // probing the parsed ids. (Bounded — a few thousand rows at most.)
  const dedupSet = new Set<string>();
  if (cfg.mode === 'chapter') {
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from('reports')
        .select('original_report_id')
        .eq('source_type', cfg.sourceType)
        .range(from, from + 999);
      (data || []).forEach((r: any) => { if (r.original_report_id) dedupSet.add(r.original_report_id); });
      if (!data || data.length < 1000) break;
      from += 1000;
    }
  } else {
    const reportIds = reports.map(r => r.original_report_id).filter(Boolean) as string[];
    for (let i = 0; i < reportIds.length; i += 500) {
      const chunk = reportIds.slice(i, i + 500);
      const { data } = await supabase
        .from('reports')
        .select('original_report_id')
        .eq('source_type', cfg.sourceType)
        .in('original_report_id', chunk);
      (data || []).forEach((r: any) => dedupSet.add(r.original_report_id));
    }
  }
  console.log('[pd-ingest:' + cfg.key + '] dedup: ' + dedupSet.size + ' already in DB');

  const controller = { abort: false, reason: '' };
  let sigintCount = 0;
  process.on('SIGINT', () => {
    sigintCount++;
    if (sigintCount === 1) {
      console.log('\n[pd-ingest] Caught SIGINT, finishing in-flight cases and saving state. Press Ctrl+C again to force-exit.');
      controller.abort = true;
      controller.reason = 'SIGINT';
    } else {
      console.log('[pd-ingest] Force exit on second SIGINT.');
      saveState(cfg, state);
      process.exit(130);
    }
  });

  const runStartMs = Date.now();
  const heartbeat = setInterval(() => {
    const elapsed = Date.now() - runStartMs;
    const t = state.totals;
    const ratePerMin = t.processed > 0 ? Math.round((t.processed / elapsed) * 60_000) : 0;
    console.log(
      '[+' + formatDuration(elapsed) + '] ' +
      'processed ' + t.processed + '/' + t.parsed + ' | ' +
      'inserted ' + t.inserted + ' | ' +
      'dup ' + t.duplicates + ' | ' +
      'filt ' + t.filtered + ' | ' +
      'err ' + t.errors + ' | ' +
      'ocr-repaired ' + t.ocrRepaired + ' | ' +
      (cfg.mode === 'chapter'
        ? 'seg ' + t.segmentedChapters + ' (empty ' + t.emptyChapters + ') | accounts ' + t.accountsExtracted + ' | '
        : '') +
      'cost $' + t.costUsd.toFixed(2) + ' | ' +
      'rate ' + ratePerMin + '/min',
    );
  }, HEARTBEAT_INTERVAL_MS);

  // ── Per-report processor (mirrors spr-phantasms-ingest / nderf step 3).
  // Numbered mode: one parsed case = one report. Chapter mode: called once
  // per VALIDATED segmented account — never for the raw chapter slice. ──
  async function processReport(report: ScrapedReport): Promise<void> {
    const t = state.totals;
    const caseId = report.metadata?.caseId || String(report.metadata?.caseNumber || 0);
    try {
      if (report.original_report_id && dedupSet.has(report.original_report_id)) {
        t.duplicates++;
        return;
      }

      // (1) Audit hash of the deterministic (regex-cleaned) OCR body.
      const rawSha = crypto.createHash('sha256').update(report.description, 'utf8').digest('hex');
      report.metadata = Object.assign({}, report.metadata, { raw_ocr_sha256: rawSha });

      // (2) Haiku OCR repair.
      let ocrCost: OcrRepairResult | null = null;
      if (!args.skipClean) {
        ocrCost = await repairOcrWithHaiku(report.description);
        if (ocrCost) {
          report.description = ocrCost.text;
          report.summary = summarize(ocrCost.text);
          report.metadata.ocr_cleaned = true;
          t.ocrRepaired++;
          t.costUsd += ocrCost.costUsd;
        } else {
          t.ocrRepairSkipped++;
        }
      } else {
        t.ocrRepairSkipped++;
      }

      // (3) PII redact → quality → enrich → geocode → insert (nderf shape).
      redactReportPii(report);

      if (!args.skipPrefilter && isObviouslyLowQuality(report.title, report.description)) {
        t.filtered++;
        t.rejectionReasons['obviously_low_quality'] = (t.rejectionReasons['obviously_low_quality'] || 0) + 1;
        return;
      }

      try { await enrichReport(report); } catch { /* non-fatal */ }

      const qualityResult = assessQuality(report, report.metadata);
      let prefilterBypassed = false;
      if (!qualityResult.passed) {
        if (args.skipPrefilter) {
          // Reddit-derived patterns false-positive on period prose; the
          // founder reviews every row in the pending_review queue anyway.
          prefilterBypassed = true;
          const reason = (qualityResult.reason || 'unknown').substring(0, 40);
          t.rejectionReasons['bypassed: ' + reason] = (t.rejectionReasons['bypassed: ' + reason] || 0) + 1;
        } else {
          t.filtered++;
          const reason = (qualityResult.reason || 'unknown').substring(0, 40);
          t.rejectionReasons[reason] = (t.rejectionReasons[reason] || 0) + 1;
          return;
        }
      }

      const qualityScore = qualityResult.qualityScore ?? ({ total: 0 } as any);
      let initialStatus = prefilterBypassed
        ? ('prefilter_bypassed' as any)
        : getStatusFromScore(qualityScore.total, report.source_type);

      if (initialStatus === 'rejected') {
        t.filtered++;
        t.rejectionReasons['score_rejected'] = (t.rejectionReasons['score_rejected'] || 0) + 1;
        return;
      }

      if (initialStatus === 'pending_review') {
        const reeval = smartReEvaluate(qualityScore, {
          title: report.title,
          description: report.description,
          source_type: report.source_type,
          location_name: report.location_name,
          event_date: report.event_date,
          category: report.category,
        });
        if (reeval.promote) {
          initialStatus = 'approved';
        } else if (args.keepBorderline) {
          // Insert anyway — DB status is 'pending_review' for every row, so
          // the founder reviews these like everything else. Tagged for queue
          // filtering via metadata.score_status below.
          initialStatus = 'borderline_kept' as any;
          t.rejectionReasons['borderline_kept'] = (t.rejectionReasons['borderline_kept'] || 0) + 1;
        } else {
          t.filtered++;
          t.rejectionReasons['score_borderline_no_signals'] = (t.rejectionReasons['score_borderline_no_signals'] || 0) + 1;
          return;
        }
      }

      // NOTE — divergence from nderf (same as spr): period witness-line
      // locations are real place strings, so we KEEP location_name and let
      // normalizeLocation/geocodeWithFallback resolve what it can.
      const locName: string | null = report.location_name || null;

      let normalizedLocation: any = null;
      try {
        normalizedLocation = await normalizeLocation(
          {
            city: report.city || null,
            state_province: report.state_province || null,
            country: report.country || null,
            country_code: (report as any).country_code || null,
            location_name: locName,
            latitude: typeof report.latitude === 'number' ? report.latitude : null,
            longitude: typeof report.longitude === 'number' ? report.longitude : null,
          },
          {
            geocoder: 'maptiler',
            geocodeFn: geocodeWithFallback,
            cache: makeSupabaseGeocodeCache(supabase),
          },
        );
      } catch { /* non-fatal */ }

      const scoreStatus = initialStatus;
      const slug = generateSlug(report.title || 'untitled', report.original_report_id || null, report.source_type);

      const insertData: Record<string, any> = {
        title: report.title,
        slug,
        summary: report.summary,
        description: report.description,
        category: report.category,
        location_name: normalizedLocation ? normalizedLocation.location_name : locName,
        country: normalizedLocation ? normalizedLocation.country : (report.country || null),
        country_code: normalizedLocation ? normalizedLocation.country_code : (report as any).country_code || null,
        state_province: normalizedLocation ? normalizedLocation.state_province : report.state_province,
        city: normalizedLocation ? normalizedLocation.city : report.city,
        latitude: normalizedLocation ? normalizedLocation.latitude : report.latitude,
        longitude: normalizedLocation ? normalizedLocation.longitude : report.longitude,
        coords_synthetic: normalizedLocation ? !!normalizedLocation.coords_synthetic : false,
        event_date: report.event_date,
        event_date_precision: report.event_date_precision || 'unknown',
        credibility: report.credibility || 'medium',
        source_type: report.source_type,
        original_report_id: report.original_report_id,
        status: 'pending_review',
        tags: report.tags || [],
        source_label: report.source_label || cfg.sourceLabel,
        source_url: report.source_url,
        upvotes: 0,
        view_count: 0,
        report_type: 'ingested',
        metadata: Object.assign({}, report.metadata || {}, {
          location_precision: normalizedLocation ? normalizedLocation.location_precision : ((report as any).location_precision || 'unknown'),
          score_status: scoreStatus,
          quality_score: qualityScore.total,
        }),
      };
      if ((report as any).event_date_extracted_from) insertData.event_date_extracted_from = (report as any).event_date_extracted_from;
      if (report.witness_count && report.witness_count > 0) insertData.witness_count = report.witness_count;
      if (report.has_photo_video) insertData.has_photo_video = true;

      // V11.17.56 — location safety net (see engine.ts).
      if (!insertData.location_name) {
        try {
          const resolved = await extractAndGeocodeLocation({
            title: insertData.title || null,
            summary: insertData.summary || null,
            description: insertData.description || null,
          });
          if (resolved) {
            insertData.location_name = resolved.location_name;
            insertData.city = resolved.city;
            insertData.state_province = resolved.state_province;
            insertData.country = resolved.country;
            insertData.latitude = resolved.latitude;
            insertData.longitude = resolved.longitude;
            insertData.location_precision = resolved.location_precision;
          }
        } catch { /* leave null */ }
      }

      const solo = await supabase.from('reports').insert(insertData).select('id, metadata').single();
      if (solo.error) {
        if (solo.error.message && solo.error.message.indexOf('duplicate key') !== -1) {
          t.duplicates++;
        } else {
          t.errors++;
          console.warn('[pd-ingest:' + cfg.key + '] insert error case (' + caseId + '): ' + solo.error.message);
        }
        if (ocrCost) await logHaikuCost('pd-ocr-repair', null, report.original_report_id, ocrCost);
      } else {
        t.inserted++;
        if (solo.data) {
          await linkExperienceTypeForRow(solo.data as { id: string; metadata: any });
          if (ocrCost) await logHaikuCost('pd-ocr-repair', (solo.data as any).id, report.original_report_id, ocrCost);
        }
      }
    } catch (perReportErr: any) {
      t.errors++;
      console.warn('[pd-ingest:' + cfg.key + '] per-report error (' + caseId + '): ' + (perReportErr?.message || perReportErr));
    }
  }

  // ── Per-case wrapper. Chapter mode inserts the SEGMENTATION step here,
  // between parse and the per-report OCR repair: one Haiku call per chapter
  // slice, each validated account then flows through processReport. Live
  // mode only by construction (dry runs return from runDry long before). ──
  async function processCase(report: ScrapedReport): Promise<void> {
    const t = state.totals;
    const caseNumber = report.metadata?.caseNumber || 0;
    const caseId = report.metadata?.caseId || String(caseNumber);
    try {
      if (cfg.mode !== 'chapter') {
        await processReport(report);
        return;
      }

      const seg = await segmentChapterWithHaiku(report.description);
      if (!seg) {
        t.segmentationFailed++;
        console.warn('[pd-ingest:' + cfg.key + '] segmentation failed for ' + caseId + ' — chapter skipped (re-run to retry)');
        return;
      }
      t.segmentedChapters++;
      t.costUsd += seg.costUsd;
      await logHaikuCost('pd-segmentation', null, report.original_report_id, seg);

      const accountReports: ScrapedReport[] = [];
      for (let i = 0; i < seg.accounts.length; i++) {
        const acc = seg.accounts[i];
        // M = position in Haiku's returned array, so ids stay stable across
        // re-runs (temp 0) even when later accounts are dropped/rejected.
        const accountIdx = i + 1;
        const text = (acc.text || '').trim();
        if (text.length < SEGMENT_MIN_ACCOUNT_CHARS) {
          t.accountsDroppedShort++;
          continue;
        }
        const containment = ngramContainment(text, report.description);
        if (containment < SEGMENT_MIN_CONTAINMENT) {
          t.accountsRejectedNonVerbatim++;
          console.warn(
            '[pd-ingest:' + cfg.key + '] REJECTED non-verbatim (likely hallucinated) account ' +
            caseId + '-a' + accountIdx + ' — containment ' + containment.toFixed(2) +
            ' < ' + SEGMENT_MIN_CONTAINMENT + ': "' +
            text.substring(0, 120).replace(/\n+/g, ' ') + '…"',
          );
          continue;
        }
        accountReports.push(accountToReport(report, acc, accountIdx, cfg, containment));
      }

      if (accountReports.length === 0) {
        t.emptyChapters++;
        console.log(
          '[pd-ingest:' + cfg.key + '] ' + caseId + ': 0 usable accounts (' +
          seg.accounts.length + ' returned by Haiku) — chapter skipped',
        );
        return;
      }
      t.accountsExtracted += accountReports.length;
      for (const accountReport of accountReports) {
        if (controller.abort) break;
        await processReport(accountReport);
      }
    } catch (perCaseErr: any) {
      t.errors++;
      console.warn('[pd-ingest:' + cfg.key + '] per-case error (' + caseId + '): ' + (perCaseErr?.message || perCaseErr));
    } finally {
      t.processed++;
      if (caseNumber > state.lastProcessedCase) state.lastProcessedCase = caseNumber;
      if (t.processed % 10 === 0) saveState(cfg, state);
    }
  }

  // ── Worker pool ─────────────────────────────────────────────────────
  let queueIdx = 0;
  async function worker(workerId: number): Promise<void> {
    while (!controller.abort) {
      if (state.totals.costUsd >= args.maxCostUsd) {
        controller.abort = true;
        controller.reason = 'max cost reached ($' + state.totals.costUsd.toFixed(2) + ' >= $' + args.maxCostUsd + ')';
        break;
      }
      const idx = queueIdx++;
      if (idx >= reports.length) break;
      await processCase(reports[idx]);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.max(1, args.concurrency); i++) workers.push(worker(i));

  try {
    await Promise.all(workers);
  } finally {
    clearInterval(heartbeat);
    saveState(cfg, state);
  }

  const t = state.totals;
  console.log('\n=== pd-text Ingest Complete — ' + cfg.workTitle + ' (' + cfg.key + ') ===');
  console.log('Stop reason: ' + (controller.reason || 'all cases processed'));
  console.log('Elapsed: ' + formatDuration(Date.now() - runStartMs));
  console.log('Totals: parsed=' + t.parsed + ' processed=' + t.processed + ' inserted=' + t.inserted + ' dup=' + t.duplicates + ' filtered=' + t.filtered + ' errors=' + t.errors);
  if (cfg.mode === 'chapter') {
    console.log(
      'Segmentation: chapters=' + t.segmentedChapters +
      ' empty(0 accounts)=' + t.emptyChapters +
      ' segFailed=' + t.segmentationFailed +
      ' accounts=' + t.accountsExtracted +
      ' droppedShort(<' + SEGMENT_MIN_ACCOUNT_CHARS + ')=' + t.accountsDroppedShort +
      ' rejectedNonVerbatim=' + t.accountsRejectedNonVerbatim,
    );
  }
  console.log('OCR repair: ' + t.ocrRepaired + ' repaired, ' + t.ocrRepairSkipped + ' skipped/failed');
  console.log('Cost: $' + t.costUsd.toFixed(4));
  console.log('Last processed case: ' + state.lastProcessedCase + ' (resume with --start-case ' + (state.lastProcessedCase + 1) + ')');
  console.log('State persisted to: ' + stateFilePath(cfg));

  const topReasons = Object.entries(t.rejectionReasons).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topReasons.length > 0) {
    console.log('\nTop rejection reasons:');
    topReasons.forEach(([reason, count]) => console.log('  ' + count + 'x ' + reason));
  }
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  if (!args.source || !PD_SOURCES[args.source]) {
    console.error('Usage: tsx scripts/pd-text-ingest.ts --source <key> [flags]');
    console.error('Known sources: ' + Object.keys(PD_SOURCES).join(', '));
    process.exit(1);
  }
  const cfg = PD_SOURCES[args.source];
  console.log('PD-Text Ingest — ' + cfg.workTitle + ' (' + cfg.authors + ', ' + cfg.published + ')');
  console.log('Args: ' + JSON.stringify(args));
  if (cfg.notes) console.log('Source notes: ' + cfg.notes);

  if (args.dryRun) {
    await runDry(cfg, args);
    return;
  }
  await runLive(cfg, args);
}

main().catch(err => {
  console.error('[pd-ingest] Fatal:', err);
  process.exit(1);
});
