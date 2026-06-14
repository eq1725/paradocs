#!/usr/bin/env tsx
/**
 * CA-HARVEST — Chronicling America (Library of Congress) newspaper harvester.
 *
 * NO AI. NO DB. Network: www.loc.gov + tile.loc.gov ONLY, strictly
 * sequential, >= --rate-ms (default 3000ms) between requests, identified
 * User-Agent 'Paradocs-Ingest/1.0 (PD newspaper research)'. Everything
 * harvested is pre-1929 US newspaper text — public domain.
 *
 * ── API FACTS (probed + verified 2026-06-12) ────────────────────────
 * The old chroniclingamerica.loc.gov JSON API is RETIRED:
 *   GET chroniclingamerica.loc.gov/lccn/sn86090439/1895-11-13/ed-1/seq-7/ocr.txt
 *   → 308 → www.loc.gov/resource/sn86090439/1895-11-13/ed-1/?sp=7&st=text
 *   → 403 bot-challenge HTML ("Just a moment…") — NOT machine-usable.
 *
 * SEARCH (works):
 *   https://www.loc.gov/collections/chronicling-america/
 *     ?q="saw a ghost"&dates=1895/1895&fo=json&c=100&sp=2
 *     &at=results,pagination&dl=page
 *   - &at=results,pagination strips facets/UI blobs: measured 1,836,040 bytes
 *     → 9,812 bytes for the same c=2 query. Still ~3-18s server time.
 *   - &dl=page restricts hits to page-level segments (the API's own
 *     pagination URLs carry it).
 *   - pagination.of = total hits; page through with &sp=N.
 *   - Each result carries: date, number_lccn[], location_city/county/state[],
 *     partof_title[], id (resource permalink …/ed-1/?sp=7), page_id,
 *     word_coordinates_url.
 *
 * OCR TEXT — cheapest method (METHOD USED HERE, verified):
 *   result.word_coordinates_url + '&full_text=1'
 *   e.g. https://tile.loc.gov/text-services/word-coordinates-service
 *          ?format=alto_xml&segment=/service/ndnp/…/1060.xml&full_text=1
 *   → JSON { "<segment>": { "full_text": "Übe ©ailv Kgbt.\nWED'SDAY,
 *     NOVEMBER 13, '95\nMenger Hotel\n…" } } — 18,644 chars for the probe
 *     page, contained the literal phrase "saw a ghost". 0.35s warm; first
 *     (uncached) render server-side can take 30s+, so the fetch timeout is
 *     generous. ONE request per page, no extra resource-JSON round-trip.
 *   (Alternative probed: resource URL + &fo=json&at=resources also exposes
 *   resources[0].fulltext_file = the same tile.loc.gov URL — but that costs
 *   an extra request per page, so it is not used.)
 *
 * ── Usage ───────────────────────────────────────────────────────────
 *   # Dry run: search counts only, no OCR fetches
 *   npx tsx scripts/ca-harvest.ts --terms cryptids --year 1895 --dry-run
 *
 *   # Full harvest of 3 phrases for 1895, OCR + snippets
 *   npx tsx scripts/ca-harvest.ts \
 *     --terms "saw a ghost,haunted house,apparition" --year 1895 \
 *     --max-pages 3 --fetch-ocr
 *
 *   # All enabled terms, a year range, sandbox-chunked (exit before 45s kill)
 *   npx tsx scripts/ca-harvest.ts --terms all --years 1890-1899 \
 *     --fetch-ocr --budget-sec 40        # re-run to resume; state is durable
 *
 * ── Flags ───────────────────────────────────────────────────────────
 *   --terms <csv|category|all>  REQUIRED. Category key from
 *                               ca-harvest.config.ts, 'all', or CSV phrases.
 *   --year <Y> | --years <Y1-Y2>  REQUIRED. Searched per single year.
 *   --max-pages <n>     Search-result pages per term×year (default 5).
 *   --rows <n>          Results per search page (default 100, max 100ish).
 *   --rate-ms <n>       Min ms between ANY two loc.gov requests (default 3000).
 *   --dry-run           Searches only — counts per term×year, no OCR.
 *   --fetch-ocr         Also download page OCR + cut/dedup/filter snippets.
 *   --budget-sec <n>    Exit cleanly (state saved) after n seconds (0 = off).
 *                       For chunked runs under the 45s sandbox limit.
 *
 * ── Pipeline per term×year (with --fetch-ocr) ───────────────────────
 *   search (slim payload, paged) → collect result metadata → per page:
 *   OCR fetch (disk-cached at outputs/ca-ocr-cache/<page_id>.txt) →
 *   find every hit of the phrase (whitespace-normalized match) → ±2,500-char
 *   windows, overlapping windows MERGED → noise heuristics (>40% non-alpha;
 *   fiction markers near the hit: CHAPTER/A STORY/[Continued/SERIAL;
 *   ad-dense: FOR SALE/CURES/WANTED/$ density) → SYNDICATION DEDUP:
 *   normalized 8-gram shingles; a snippet sharing >= 60% of its shingles
 *   with an already-kept snippet in the same shard is a wire-service
 *   duplicate — the EARLIEST paper date wins (later one dropped, or the
 *   kept one is replaced if the newcomer is earlier).
 *   NOTE: dedup scope is per term×year shard; cross-term duplicates of the
 *   same story are rare (different ±2.5k windows) and the founder's review
 *   queue + extract-stage sha256 dedup are the backstop.
 *
 * ── Outputs ─────────────────────────────────────────────────────────
 *   outputs/ca-shards/<term-slug>-<year>.json  — array of
 *     { snippet, lccn, paperTitle, date, page, city, county, state,
 *       resourceUrl, hitTerm, fingerprint }
 *   outputs/ca-harvest-state.json — resumable per term×year×searchpage and
 *     per-OCR-index; safe to re-run the same command after any interruption.
 *   outputs/ca-ocr-cache/<page_id>.txt — raw page OCR (re-runs are free).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { resolveCaTerms, caTermSlug } from '../src/lib/ingestion/ca-harvest.config';

// ─────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────

const USER_AGENT = 'Paradocs-Ingest/1.0 (PD newspaper research)';
const SEARCH_BASE = 'https://www.loc.gov/collections/chronicling-america/';
// First-render OCR can take 30s+ server-side. Overridable for chunked
// sandbox runs (CA_FETCH_TIMEOUT_MS=15000 fails fast; the resumable state
// retries the page on the next run, usually hitting LoC's now-warm cache).
const FETCH_TIMEOUT_MS = parseInt(process.env.CA_FETCH_TIMEOUT_MS || '90000', 10);
const MAX_RETRIES = 2;

const SNIPPET_RADIUS = 2_500;          // chars each side of a hit
const SHINGLE_N = 8;                   // words per shingle
const SHINGLE_OVERLAP_DROP = 0.6;      // >=60% shared shingles = wire dupe
const NON_ALPHA_DROP = 0.4;            // >40% non-alpha chars = table/figure OCR
const FICTION_WINDOW = 600;            // chars around hit checked for fiction markers
const EST_EXTRACT_COST_PER_SNIPPET = 0.0009; // consolidated Haiku batch call

// STATE_FILE is the only single-writer artifact. SHARD_DIR is safe to share
// across processes (shards are named <slug>-<year>.json, so year-partitioned
// workers never touch the same file) and OCR_CACHE_DIR is content-addressed
// by pageId (idempotent writes). To run multiple harvester PROCESSES in
// parallel (see scripts/ca-harvest-parallel.sh), give each worker its own
// state file via CA_STATE_FILE so they don't clobber each other's progress.
// Empty/unset CA_STATE_FILE preserves the original single-stream behavior.
const STATE_FILE = process.env.CA_STATE_FILE
  ? path.resolve(process.cwd(), process.env.CA_STATE_FILE)
  : path.resolve(process.cwd(), 'outputs/ca-harvest-state.json');
const SHARD_DIR = path.resolve(process.cwd(), 'outputs/ca-shards');
const OCR_CACHE_DIR = path.resolve(process.cwd(), 'outputs/ca-ocr-cache');

// ─────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  terms: string;
  years: number[];
  maxPages: number;
  rows: number;
  rateMs: number;
  dryRun: boolean;
  fetchOcr: boolean;
  budgetSec: number;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const flag = (n: string, d: string | null = null) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : d;
  };
  const terms = flag('--terms');
  const year = flag('--year');
  const yearsSpec = flag('--years');
  if (!terms || (!year && !yearsSpec)) {
    console.error('Usage: tsx scripts/ca-harvest.ts --terms <csv|category|all> (--year Y | --years Y1-Y2) [--max-pages 5] [--rows 100] [--rate-ms 3000] [--dry-run] [--fetch-ocr] [--budget-sec 0]');
    process.exit(1);
  }
  let years: number[] = [];
  if (yearsSpec) {
    const m = yearsSpec.match(/^(\d{4})\s*-\s*(\d{4})$/);
    if (!m) { console.error('--years must be Y1-Y2, e.g. 1880-1928'); process.exit(1); }
    for (let y = parseInt(m[1]); y <= parseInt(m[2]); y++) years.push(y);
  } else {
    years = [parseInt(year!)];
  }
  return {
    terms,
    years,
    maxPages: parseInt(flag('--max-pages', '5')!),
    rows: parseInt(flag('--rows', '100')!),
    rateMs: parseInt(flag('--rate-ms', '3000')!),
    dryRun: argv.includes('--dry-run'),
    fetchOcr: argv.includes('--fetch-ocr'),
    budgetSec: parseInt(flag('--budget-sec', '0')!),
  };
}

// ─────────────────────────────────────────────────────────────────────
// POLITE FETCH (sequential, spaced, identified)
// ─────────────────────────────────────────────────────────────────────

let lastRequestAt = 0;
let requestCount = 0;
const runStartMs = Date.now();
/** Set from --budget-sec in main(); politeFetch refuses retries past it so a
 * retry/backoff chain can never run long past the budget. */
let hardDeadlineMs = Infinity;

function elapsed(): string {
  return '+' + Math.round((Date.now() - runStartMs) / 1000) + 's';
}

async function politeFetch(url: string, rateMs: number): Promise<string> {
  const wait = lastRequestAt + rateMs - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0 && Date.now() > hardDeadlineMs) throw new Error('budget-sec reached during retry — will retry next run');
    lastRequestAt = Date.now();
    requestCount++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' },
        signal: controller.signal,
      });
      // NOTE: the timer stays armed through resp.text() — on a cold tile
      // render LoC returns headers fast but STREAMS the body for 30s+, so
      // body read must be under the same abort deadline as the headers.
      if (resp.status === 429 || resp.status >= 500) {
        clearTimeout(timer);
        // loc.gov rate-limits hard (they ban crawlers that push) — back WAY off.
        const backoff = 15_000 * (attempt + 1);
        console.warn('[ca-harvest] [' + elapsed() + '] HTTP ' + resp.status + ' — backing off ' + backoff / 1000 + 's (' + url.slice(0, 100) + ')');
        if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, backoff)); continue; }
        throw new Error('HTTP ' + resp.status + ' after retries');
      }
      if (!resp.ok) { clearTimeout(timer); throw new Error('HTTP ' + resp.status); }
      const body = await resp.text();
      clearTimeout(timer);
      return body;
    } catch (e: any) {
      clearTimeout(timer);
      if (attempt < MAX_RETRIES && /abort|fetch failed|ECONN|ETIMEDOUT/i.test(String(e?.message || e))) {
        await new Promise(r => setTimeout(r, 5_000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error('unreachable');
}

// ─────────────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────────────

interface CaResultMeta {
  lccn: string;
  date: string;            // YYYY-MM-DD (paper date)
  page: number;            // sequence within the issue (sp= in permalink)
  city: string | null;
  county: string | null;
  state: string | null;
  paperTitle: string;
  resourceUrl: string;     // loc.gov permalink (result.id)
  pageId: string;          // e.g. sn86090439-1895-11-13-ed-1-1060
  wordCoordsUrl: string;   // tile.loc.gov word-coordinates-service URL
}

function buildSearchUrl(phrase: string, year: number, sp: number, rows: number): string {
  const params = new URLSearchParams({
    q: '"' + phrase + '"',
    dates: year + '/' + year,
    fo: 'json',
    c: String(rows),
    at: 'results,pagination',
    dl: 'page',
  });
  if (sp > 1) params.set('sp', String(sp));
  return SEARCH_BASE + '?' + params.toString();
}

function first<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v.length ? v[0] : null) : v;
}

function parseResult(r: any): CaResultMeta | null {
  const lccn = first<string>(r.number_lccn);
  const date = typeof r.date === 'string' ? r.date : first<string>(r.dates);
  const resourceUrl = typeof r.id === 'string' ? r.id : null;
  const wordCoordsUrl = typeof r.word_coordinates_url === 'string' ? r.word_coordinates_url : null;
  const pageId = typeof r.page_id === 'string' ? r.page_id : null;
  if (!lccn || !date || !resourceUrl || !wordCoordsUrl || !pageId) return null;
  const spMatch = resourceUrl.match(/[?&]sp=(\d+)/);
  const page = spMatch ? parseInt(spMatch[1]) : parseInt(String(r.shelf_id || '1')) || 1;
  const rawTitle = first<string>(r.partof_title) || ('lccn ' + lccn);
  // "san antonio daily light (san antonio, tex.) 1886-1907" → keep as-is but Title Case the head
  const paperTitle = rawTitle.replace(/\s+\d{4}-\d{4}\s*$/, '').trim();
  return {
    lccn,
    date,
    page,
    city: first<string>(r.location_city),
    county: first<string>(r.location_county),
    state: first<string>(r.location_state),
    paperTitle,
    resourceUrl,
    pageId,
    wordCoordsUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────
// OCR FETCH (word_coordinates_url + &full_text=1; disk-cached)
// ─────────────────────────────────────────────────────────────────────

/** The text service highlights the search term with [[tag]]…[[/tag]] markers
 * (the word_coordinates_url from a search result carries the query) — strip
 * them or phrase matching fails. */
function stripHighlightTags(text: string): string {
  return text.replace(/\[\[\/?tag\]\]/g, '');
}

async function fetchPageOcr(meta: CaResultMeta, rateMs: number): Promise<string | null> {
  const cacheFile = path.join(OCR_CACHE_DIR, meta.pageId + '.txt');
  if (fs.existsSync(cacheFile)) return stripHighlightTags(fs.readFileSync(cacheFile, 'utf8'));
  const url = meta.wordCoordsUrl + (meta.wordCoordsUrl.includes('?') ? '&' : '?') + 'full_text=1';
  let raw: string;
  try {
    raw = await politeFetch(url, rateMs);
  } catch (e: any) {
    console.warn('[ca-harvest] [' + elapsed() + '] OCR fetch failed for ' + meta.pageId + ': ' + (e?.message || e));
    return null;
  }
  try {
    const data = JSON.parse(raw);
    const firstVal: any = Object.values(data)[0];
    const rawText = firstVal && typeof firstVal.full_text === 'string' ? firstVal.full_text : null;
    if (!rawText) return null;
    const text = stripHighlightTags(rawText);
    fs.mkdirSync(OCR_CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, text);
    return text;
  } catch {
    console.warn('[ca-harvest] [' + elapsed() + '] OCR response unparseable for ' + meta.pageId);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// SNIPPET CUTTING + NOISE + SYNDICATION DEDUP
// ─────────────────────────────────────────────────────────────────────

export interface CaSnippet {
  snippet: string;
  lccn: string;
  paperTitle: string;
  date: string;
  page: number;
  city: string | null;
  county: string | null;
  state: string | null;
  resourceUrl: string;
  hitTerm: string;
  /** sha256 of the case/punct/whitespace-normalized snippet text. */
  fingerprint: string;
}

/** Collapse all whitespace to single spaces (OCR line breaks split phrases). */
function normalizeWs(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/** All hit offsets of phrase in normalized text (case-insensitive). */
function findHits(normText: string, phrase: string): number[] {
  const hay = normText.toLowerCase();
  const needle = phrase.toLowerCase();
  const hits: number[] = [];
  let idx = 0;
  while ((idx = hay.indexOf(needle, idx)) !== -1) {
    hits.push(idx);
    idx += needle.length;
  }
  return hits;
}

/** ±SNIPPET_RADIUS windows around each hit, overlapping windows merged. */
function cutWindows(normText: string, hits: number[], phraseLen: number): { start: number; end: number; hitCenters: number[] }[] {
  const windows: { start: number; end: number; hitCenters: number[] }[] = [];
  for (const h of hits) {
    const start = Math.max(0, h - SNIPPET_RADIUS);
    const end = Math.min(normText.length, h + phraseLen + SNIPPET_RADIUS);
    const last = windows[windows.length - 1];
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
      last.hitCenters.push(h);
    } else {
      windows.push({ start, end, hitCenters: [h] });
    }
  }
  return windows;
}

const FICTION_MARKERS = /CHAPTER\s+[IVXLC0-9]|\bA STORY\b|\[Continued|\(Continued from|\bSERIAL\b|\bA TALE\b/;
const AD_MARKERS = /\bFOR SALE\b|\bCURES?\b|\bWANTED\b|\bFOR RENT\b|\bGUARANTEED\b/gi;

type NoiseReason = 'non_alpha' | 'fiction_marker' | 'ad_dense' | null;

function noiseCheck(snippet: string, hitOffsetsInSnippet: number[]): NoiseReason {
  // (1) table/figure OCR: >40% of chars are not letters/whitespace
  let nonAlpha = 0;
  for (let i = 0; i < snippet.length; i++) {
    const c = snippet.charCodeAt(i);
    const isAlpha = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 32;
    if (!isAlpha) nonAlpha++;
  }
  if (nonAlpha / Math.max(1, snippet.length) > NON_ALPHA_DROP) return 'non_alpha';

  // (2) fiction markers near any hit
  for (const off of hitOffsetsInSnippet) {
    const lo = Math.max(0, off - FICTION_WINDOW);
    const hi = Math.min(snippet.length, off + FICTION_WINDOW);
    if (FICTION_MARKERS.test(snippet.slice(lo, hi))) return 'fiction_marker';
  }

  // (3) advertising-dense: many ad phrases, or high $ density
  const adHits = (snippet.match(AD_MARKERS) || []).length;
  const dollarDensity = (snippet.split('$').length - 1) / Math.max(1, snippet.length);
  if (adHits >= 4 || dollarDensity > 0.004) return 'ad_dense';

  return null;
}

/** Words for shingling: lowercase alphanumerics only. */
function shingleSet(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i + SHINGLE_N <= words.length; i++) set.add(words.slice(i, i + SHINGLE_N).join(' '));
  return set;
}

function shingleOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let hits = 0;
  a.forEach(s => { if (b.has(s)) hits++; });
  return hits / a.size;
}

function snippetFingerprint(text: string): string {
  const norm = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return crypto.createHash('sha256').update(norm, 'utf8').digest('hex');
}

// ─────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────

interface JobCounters {
  searchRequests: number;
  resultsCollected: number;
  pagesOcrFetched: number;
  ocrErrors: number;
  snippets: number;
  dupesDropped: number;
  noiseDropped: { non_alpha: number; fiction_marker: number; ad_dense: number };
}

interface JobState {
  term: string;
  year: number;
  totalResults: number | null;     // pagination.of from first search page
  searchPagesFetched: number;      // sp pages completed
  searchDone: boolean;
  results: CaResultMeta[];         // collected metadata, in API order
  ocrIndex: number;                // next results[] index to OCR
  ocrDone: boolean;
  counters: JobCounters;
}

interface HarvestState {
  version: 1;
  startedAt: string;
  lastUpdatedAt: string;
  jobs: Record<string, JobState>;
}

function loadState(): HarvestState {
  if (fs.existsSync(STATE_FILE)) {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* corrupt → fresh */ }
  }
  return { version: 1, startedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString(), jobs: {} };
}

function saveState(state: HarvestState): void {
  state.lastUpdatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function emptyJob(term: string, year: number): JobState {
  return {
    term, year,
    totalResults: null,
    searchPagesFetched: 0,
    searchDone: false,
    results: [],
    ocrIndex: 0,
    ocrDone: false,
    counters: {
      searchRequests: 0, resultsCollected: 0, pagesOcrFetched: 0, ocrErrors: 0,
      snippets: 0, dupesDropped: 0,
      noiseDropped: { non_alpha: 0, fiction_marker: 0, ad_dense: 0 },
    },
  };
}

function shardPath(term: string, year: number): string {
  return path.join(SHARD_DIR, caTermSlug(term) + '-' + year + '.json');
}

function loadShard(term: string, year: number): CaSnippet[] {
  const p = shardPath(term, year);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
  }
  return [];
}

function saveShard(term: string, year: number, snippets: CaSnippet[]): void {
  fs.mkdirSync(SHARD_DIR, { recursive: true });
  fs.writeFileSync(shardPath(term, year), JSON.stringify(snippets, null, 1));
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const terms = resolveCaTerms(args.terms);
  if (terms.length === 0) { console.error('[ca-harvest] no terms resolved from "' + args.terms + '"'); process.exit(1); }

  console.log('[ca-harvest] terms: ' + terms.map(t => '"' + t.phrase + '"').join(', '));
  console.log('[ca-harvest] years: ' + args.years[0] + (args.years.length > 1 ? '-' + args.years[args.years.length - 1] : '') +
    ' | max-pages=' + args.maxPages + ' rows=' + args.rows + ' rate-ms=' + args.rateMs +
    ' | ' + (args.dryRun ? 'DRY RUN (search counts only)' : args.fetchOcr ? 'fetch-ocr ON' : 'metadata only'));

  const state = loadState();
  const budgetMs = args.budgetSec > 0 ? args.budgetSec * 1000 : Infinity;
  if (args.budgetSec > 0) hardDeadlineMs = runStartMs + budgetMs;
  const overBudget = () => Date.now() - runStartMs > budgetMs;
  let budgetHit = false;

  // Per-run new-snippet tracking for the summary
  const runNewSnippetLens: number[] = [];
  let runDupes = 0;
  let runNoise = 0;

  outer:
  for (const { phrase } of terms) {
    for (const year of args.years) {
      const key = caTermSlug(phrase) + ':' + year;
      if (!state.jobs[key]) state.jobs[key] = emptyJob(phrase, year);
      const job = state.jobs[key];

      // ── SEARCH PHASE ────────────────────────────────────────────────
      while (!job.searchDone && job.searchPagesFetched < args.maxPages) {
        if (overBudget()) { budgetHit = true; break outer; }
        const sp = job.searchPagesFetched + 1;
        const url = buildSearchUrl(phrase, year, sp, args.rows);
        let body: string;
        try {
          body = await politeFetch(url, args.rateMs);
        } catch (e: any) {
          console.warn('[ca-harvest] [' + elapsed() + '] search failed "' + phrase + '" ' + year + ' sp=' + sp + ': ' + (e?.message || e) + ' — will retry next run');
          saveState(state);
          break;
        }
        let data: any;
        try { data = JSON.parse(body); } catch {
          console.warn('[ca-harvest] [' + elapsed() + '] search JSON parse failed sp=' + sp + ' — will retry next run');
          saveState(state);
          break;
        }
        const results: any[] = Array.isArray(data.results) ? data.results : [];
        const of = data.pagination && typeof data.pagination.of === 'number' ? data.pagination.of : null;
        if (job.totalResults === null && of !== null) job.totalResults = of;
        for (const r of results) {
          const meta = parseResult(r);
          if (meta) { job.results.push(meta); job.counters.resultsCollected++; }
        }
        job.counters.searchRequests++;
        job.searchPagesFetched = sp;
        const lastPage = !data.pagination || !data.pagination.next || results.length === 0;
        if (lastPage || job.searchPagesFetched >= args.maxPages) job.searchDone = true;
        console.log('[ca-harvest] [' + elapsed() + '] search "' + phrase + '" ' + year + ' sp=' + sp +
          ' → ' + results.length + ' results (total hits: ' + (job.totalResults ?? '?') + ')' +
          (job.searchDone ? ' [search done]' : ''));
        saveState(state);
      }

      if (args.dryRun || !args.fetchOcr) continue;

      // ── OCR + SNIPPET PHASE ─────────────────────────────────────────
      const shard = loadShard(phrase, year);
      // Rebuild dedup index from anything already in the shard (resume-safe).
      const shingleIndex: { set: Set<string>; date: string; idx: number }[] =
        shard.map((s, i) => ({ set: shingleSet(s.snippet), date: s.date, idx: i }));

      while (job.ocrIndex < job.results.length) {
        if (overBudget()) { budgetHit = true; saveShard(phrase, year, shard); saveState(state); break outer; }
        const meta = job.results[job.ocrIndex];
        const ocr = await fetchPageOcr(meta, args.rateMs);
        job.ocrIndex++;
        if (!ocr) {
          job.counters.ocrErrors++;
          saveState(state);
          continue;
        }
        job.counters.pagesOcrFetched++;

        const normText = normalizeWs(ocr);
        const hits = findHits(normText, phrase);
        const windows = cutWindows(normText, hits, phrase.length);
        let pageNew = 0;

        for (const w of windows) {
          const snippetText = normText.slice(w.start, w.end).trim();
          const hitOffsets = w.hitCenters.map(h => h - w.start);

          const noise = noiseCheck(snippetText, hitOffsets);
          if (noise) {
            job.counters.noiseDropped[noise]++;
            runNoise++;
            continue;
          }

          const shingles = shingleSet(snippetText);
          let dupOfIdx = -1;
          for (const entry of shingleIndex) {
            if (shingleOverlap(shingles, entry.set) >= SHINGLE_OVERLAP_DROP) { dupOfIdx = entry.idx; break; }
          }
          const record: CaSnippet = {
            snippet: snippetText,
            lccn: meta.lccn,
            paperTitle: meta.paperTitle,
            date: meta.date,
            page: meta.page,
            city: meta.city,
            county: meta.county,
            state: meta.state,
            resourceUrl: meta.resourceUrl,
            hitTerm: phrase,
            fingerprint: snippetFingerprint(snippetText),
          };
          if (dupOfIdx >= 0) {
            const kept = shard[dupOfIdx];
            if (kept && meta.date < kept.date) {
              // Newcomer ran EARLIER — it is the origin paper; swap it in.
              shard[dupOfIdx] = record;
              shingleIndex.find(e => e.idx === dupOfIdx)!.set = shingles;
              shingleIndex.find(e => e.idx === dupOfIdx)!.date = meta.date;
            }
            job.counters.dupesDropped++;
            runDupes++;
            continue;
          }
          shard.push(record);
          shingleIndex.push({ set: shingles, date: meta.date, idx: shard.length - 1 });
          job.counters.snippets++;
          runNewSnippetLens.push(snippetText.length);
          pageNew++;
        }

        console.log('[ca-harvest] [' + elapsed() + '] ocr ' + meta.pageId + ' (' + (job.ocrIndex) + '/' + job.results.length + ' "' + phrase + '" ' + year + ')' +
          ' hits=' + hits.length + ' new-snippets=' + pageNew +
          ' | shard=' + shard.length + ' dup=' + job.counters.dupesDropped +
          ' noise=' + (job.counters.noiseDropped.non_alpha + job.counters.noiseDropped.fiction_marker + job.counters.noiseDropped.ad_dense));

        if (job.ocrIndex % 5 === 0 || job.ocrIndex >= job.results.length) {
          saveShard(phrase, year, shard);
          saveState(state);
        }
      }
      if (job.searchDone && job.ocrIndex >= job.results.length) job.ocrDone = true;
      saveShard(phrase, year, shard);
      saveState(state);
    }
  }

  // ── SUMMARY ───────────────────────────────────────────────────────
  console.log('\n=== ca-harvest summary ===');
  if (budgetHit) console.log('STOPPED on --budget-sec (' + args.budgetSec + 's) — state saved; re-run the same command to resume.');
  let totHits = 0, totPages = 0, totSnips = 0, totDup = 0, totNoise = 0, totErr = 0;
  for (const { phrase } of terms) {
    for (const year of args.years) {
      const job = state.jobs[caTermSlug(phrase) + ':' + year];
      if (!job) continue;
      const noise = job.counters.noiseDropped.non_alpha + job.counters.noiseDropped.fiction_marker + job.counters.noiseDropped.ad_dense;
      console.log(
        '  "' + phrase + '" ' + year + ': hits=' + (job.totalResults ?? '?') +
        ' collected=' + job.counters.resultsCollected +
        (args.fetchOcr ? (' ocr=' + job.counters.pagesOcrFetched + '/' + job.results.length +
          ' snippets=' + job.counters.snippets + ' dup=' + job.counters.dupesDropped +
          ' noise=' + noise + ' (nonAlpha=' + job.counters.noiseDropped.non_alpha +
          ' fiction=' + job.counters.noiseDropped.fiction_marker +
          ' ads=' + job.counters.noiseDropped.ad_dense + ') ocrErr=' + job.counters.ocrErrors) : '') +
        (job.searchDone ? '' : ' [search INCOMPLETE]') +
        (args.fetchOcr && !job.ocrDone ? ' [ocr INCOMPLETE: ' + job.ocrIndex + '/' + job.results.length + ']' : ''));
      totHits += job.totalResults || 0;
      totPages += job.counters.pagesOcrFetched;
      totSnips += job.counters.snippets;
      totDup += job.counters.dupesDropped;
      totNoise += noise;
      totErr += job.counters.ocrErrors;
    }
  }
  console.log('  ── totals: search-hits=' + totHits + ' pages-ocr-fetched=' + totPages +
    ' snippets=' + totSnips + ' dupes-dropped=' + totDup + ' noise-dropped=' + totNoise + ' ocr-errors=' + totErr);
  if (runNewSnippetLens.length > 0) {
    const sorted = runNewSnippetLens.slice().sort((a, b) => a - b);
    console.log('  this run: ' + runNewSnippetLens.length + ' new snippets, median ' +
      sorted[Math.floor(sorted.length / 2)] + ' chars, ' + runDupes + ' dupes, ' + runNoise + ' noise');
  }
  console.log('  est extraction cost for all ' + totSnips + ' snippets: $' +
    (totSnips * EST_EXTRACT_COST_PER_SNIPPET).toFixed(2) +
    ' (' + EST_EXTRACT_COST_PER_SNIPPET + '/snippet, consolidated Haiku batch)');
  console.log('  requests this run: ' + requestCount + ' in ' + elapsed());
  console.log('  shards: ' + SHARD_DIR);
  console.log('  state:  ' + STATE_FILE);
}

main().catch(err => {
  console.error('[ca-harvest] Fatal:', err);
  process.exit(1);
});
