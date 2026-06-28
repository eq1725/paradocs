#!/usr/bin/env tsx
/**
 * CA-EXTRACT-INGEST — AI + DB stage for the Chronicling America harvest.
 *
 * Reads snippet shards produced by scripts/ca-harvest.ts
 * (outputs/ca-shards/<term-slug>-<year>.json) and, for each snippet, makes
 * ONE consolidated Haiku call via the Anthropic BATCH API (50% off; same
 * submit/poll/prompt-cache pattern as scripts/classify-phenomena-batch.ts,
 * incl. the V11.17.91 sync cache prewarm before the first chunk). The model
 * decides whether the OCR snippet contains a genuine reported anomalous
 * experience and, if so, emits modern retellings (accounts[]) that are
 * validated and inserted as status='pending_review'.
 *
 * ⚠ REVIEW PATH NOTE: `npx tsx scripts/pd-bulk-approve.ts` does NOT cover
 * this source — it reads the PD_SOURCES registry (pd-sources.config.ts) and
 * 'chronicling-america' is not in it. The founder reviews these rows via the
 * admin pending_review queue (or extends pd-bulk-approve later). Every
 * insert here is pending_review, so nothing ships unreviewed.
 *
 * ── Usage (founder, in terminal) ────────────────────────────────────
 *   set -a; source .env.local; set +a
 *
 *   # Estimate only — parse shards, print counts + cost. No AI, no DB.
 *   npx tsx scripts/ca-extract-ingest.ts --shard 'outputs/ca-shards/*-1895.json' --dry-run
 *
 *   # Live: submit batch, poll, validate, insert pending_review rows
 *   npx tsx scripts/ca-extract-ingest.ts --shard 'outputs/ca-shards/*-1895.json'
 *
 *   # Resume polling a batch that was left in flight (manifest written at
 *   # submit time to outputs/ca-extract-batches/<batch_id>.json)
 *   npx tsx scripts/ca-extract-ingest.ts --resume msgbatch_xxx
 *
 * ── Flags ───────────────────────────────────────────────────────────
 *   --shard <file|glob>   Shard file or glob (basename * supported). May
 *                         repeat. Required unless --resume.
 *   --dry-run             Parse shards + print estimate. No AI, no DB.
 *   --limit N             Process at most N snippets.
 *   --max-cost USD        Stop submitting new chunks past this (default 25).
 *   --poll-interval S     Batch poll seconds (default 30).
 *   --max-wait S          Per-batch poll ceiling (default 5400).
 *   --resume <batch_id>   Skip submit; poll + persist an in-flight batch.
 *
 * ── Per-account validation (hallucination guards) ───────────────────
 *   - verbatim_quote: word 8-gram containment >= 0.8 against the snippet
 *     (normalized case/punct); quotes under 8 words must be a normalized
 *     substring of the snippet.
 *   - event_date <= paper date (the paper date is the ceiling; missing or
 *     invalid dates fall back to the paper date, precision 'estimated').
 *   - modern_body 400–3000 chars.
 *   - category must be one of the 6 allowed; accounts the model itself
 *     genre-flags as fiction_suspected/advertisement are dropped
 *     (retold_folklore is kept but flagged in metadata for review).
 *
 * ── Insert shape (mirrors scripts/pd-text-ingest.ts) ────────────────
 *   status 'pending_review', source_type 'chronicling-america',
 *   original_report_id 'ca-{lccn}-{date}-p{page}-{n}',
 *   source_url = loc.gov resource permalink,
 *   source_label = '{paperTitle} ({date})',
 *   metadata: { public_domain:true, newspaper, lccn, page, hitTerm,
 *     snippet_sha256, original_snippet (full PD snippet — held outright),
 *     extraction:'consolidated-v1', genre_flags, verbatim_quote, … }.
 *   Dedup: (source_type, original_report_id) pre-pass + snippet_sha256
 *   fingerprint check against existing metadata. Location resolves through
 *   normalizeLocation/geocodeWithFallback (engine geocode path).
 *   Cost-logged to paradocs_narrative_cost_log, service 'ca-extract'.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { CA_TERM_SETS, caTermSlug } from '../src/lib/ingestion/ca-harvest.config';
import type { CaSnippet } from './ca-harvest';

// ─────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 2000;
const TEMPERATURE = 0.2;
const BATCH_API_URL = 'https://api.anthropic.com/v1/messages/batches';

// Batch pricing (matches classify-phenomena-batch.ts)
const HAIKU_INPUT_BATCH = 0.5;          // $/M tokens
const HAIKU_OUTPUT_BATCH = 2.5;
const HAIKU_CACHE_WRITE_BATCH = 0.625;
const HAIKU_CACHE_READ_BATCH = 0.05;

const CHUNK_SIZE = 1000;                // snippets are ~5KB each; stay well under payload caps
const QUOTE_NGRAM = 8;
const QUOTE_MIN_CONTAINMENT = 0.8;
const BODY_MIN_CHARS = 400;
const BODY_MAX_CHARS = 3000;

const ALLOWED_CATEGORIES = [
  'ghosts_hauntings', 'psychic_phenomena', 'ufos_aliens',
  'cryptids', 'religion_mythology', 'esoteric_practices',
] as const;
type CaCategory = (typeof ALLOWED_CATEGORIES)[number];

const BATCH_DIR = path.resolve(process.cwd(), 'outputs/ca-extract-batches');

// ── SEEN-FINGERPRINT LEDGER (V11.18.32) ──────────────────────────────
// The DB-fingerprint dedup (existingShas) only knows about snippets that
// became rows — i.e. snippets the extractor ACCEPTED. Snippets the model
// REJECTS (fiction, quote-not-verbatim, empty, etc.) leave no DB trace, so
// on every re-run over the same shard glob they were re-submitted to Haiku
// and re-rejected — ~95% of a daemon wave's spend was re-litigating known
// rejects. This ledger records EVERY snippet whose batch request succeeded
// (accepted AND rejected — both deterministic at temp 0.2), so later runs
// skip them. Plain append-only file, one sha256 per line; unset env keeps
// the default path. Crash-safe (append) and trivially mergeable.
const SEEN_LEDGER = process.env.CA_SEEN_LEDGER
  ? path.resolve(process.cwd(), process.env.CA_SEEN_LEDGER)
  : path.resolve(process.cwd(), 'outputs/ca-extract-seen.ndjson');

function loadSeenLedger(): Set<string> {
  const seen = new Set<string>();
  if (!fs.existsSync(SEEN_LEDGER)) return seen;
  try {
    const txt = fs.readFileSync(SEEN_LEDGER, 'utf8');
    for (const line of txt.split('\n')) { const s = line.trim(); if (s) seen.add(s); }
  } catch (e: any) {
    console.warn('[ca-extract] seen-ledger read failed (' + (e?.message || e) + ') — treating as empty');
  }
  return seen;
}

/** Append shas not already in `known` to the ledger; mutate `known` to match. */
function appendSeen(shas: Iterable<string>, known: Set<string>): void {
  const fresh: string[] = [];
  for (const s of shas) { if (s && !known.has(s)) { known.add(s); fresh.push(s); } }
  if (fresh.length === 0) return;
  try {
    fs.mkdirSync(path.dirname(SEEN_LEDGER), { recursive: true });
    fs.appendFileSync(SEEN_LEDGER, fresh.join('\n') + '\n');
  } catch (e: any) {
    console.warn('[ca-extract] seen-ledger append failed (' + (e?.message || e) + ') — dedup will not persist this run');
  }
}

// ── CONTENT-FINGERPRINT LEDGER (V11.20.10) ───────────────────────────
// The seen-ledger above catches EXACT OCR snippet sha256 — same printing,
// re-submitted. It MISSES syndicated reprints: the same 1900s–1910s wire story
// reprinted across dozens of papers, each with different OCR (different sha)
// but a near-identical modern retelling. This PARALLEL ledger guards against
// those: a normalized content fingerprint of the ACCEPTED modern body. One
// fingerprint per line, loaded into a Set at wave start; checked against the
// ledger AND against existing DB rows' metadata.content_fp. Mirrors the
// seen-ledger pattern exactly. Seed it from existing canonicals via
// `npx tsx scripts/ca-dedup.ts --seed-ledger`.
const FP_LEDGER = process.env.CA_CONTENT_FP_LEDGER
  ? path.resolve(process.cwd(), process.env.CA_CONTENT_FP_LEDGER)
  : path.resolve(process.cwd(), 'outputs/ca-content-fp-ledger.txt');
const FP_MIN_LEN = 30;

// EXACT validated logic — keep identical to scripts/ca-dedup.ts contentFp().
function contentFp(desc: string | null | undefined): string {
  let d = (desc || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = d.match(/\b(published|reported|recount|account of|describes|tells)\b/);
  if (m) d = d.slice((m.index || 0) + m[0].length);
  d = d.replace(/\s+/g, ' ').trim();
  return d.slice(0, 90);
}

function loadFpLedger(): Set<string> {
  const fps = new Set<string>();
  if (!fs.existsSync(FP_LEDGER)) return fps;
  try {
    for (const line of fs.readFileSync(FP_LEDGER, 'utf8').split('\n')) { const s = line.trim(); if (s) fps.add(s); }
  } catch (e: any) {
    console.warn('[ca-extract] content-fp ledger read failed (' + (e?.message || e) + ') — treating as empty');
  }
  return fps;
}

/** Append one fingerprint if new; mutate `known` to match. */
function appendFp(fp: string, known: Set<string>): void {
  if (!fp || known.has(fp)) return;
  known.add(fp);
  try {
    fs.mkdirSync(path.dirname(FP_LEDGER), { recursive: true });
    fs.appendFileSync(FP_LEDGER, fp + '\n');
  } catch (e: any) {
    console.warn('[ca-extract] content-fp ledger append failed (' + (e?.message || e) + ') — dedup will not persist this run');
  }
}

const SYSTEM_PROMPT = `You are an editor for Paradocs, a documentary archive of anomalous experiences. Your input is an OCR text snippet cut from a named, dated US newspaper page (1789–1963; the paper name, date, and place are given). OCR noise (broken words, stray characters) is expected — read through it.

TASK: Decide whether the snippet contains at least one GENUINE REPORTED ANOMALOUS EXPERIENCE — a witnessed event reported as fact (a named or described person saw/heard/experienced something anomalous at a real time and place). The following do NOT count: fiction or serialized stories, poetry, advertisements (incl. fortune-teller/clairvoyant ads and patent-medicine copy), joke or humor columns, folklore retold purely as entertainment with no witness, and skeptical essays that discuss the topic without any witness account.

OUTPUT: STRICT JSON only — no prose, no markdown fences:
{"accounts":[{...}]}   or, when nothing qualifies:   {"accounts":[]}

Each account object:
{
  "modern_title": string,        // <=90 chars, documentary register: lead with the experience in plain English; place/year when grounding; no clickbait, no exclamation marks
  "modern_summary": string,      // 1-2 sentences, modern English, for a feed card
  "modern_body": string,         // 120-350 words. Faithful modern retelling. Keep the original's hedges ("it is said", "claims to have seen"). Preserve witness names, places, and dates exactly as printed. Present testimony as testimony ("she told the reporter"). Close with one plain sentence citing the newspaper and date, e.g. "The account appeared in the San Antonio Daily Light on November 13, 1895."
  "event_date": string|null,     // YYYY-MM-DD, when the EXPERIENCE occurred per the story text. The paper's print date is the CEILING (the event cannot postdate the paper) and is usually within days of the event. Use -01 for unknown month/day. null if indeterminable.
  "location": {"city": string|null, "state": string|null, "country": string|null},  // where the EVENT actually happened per the story text (NOT where the paper was published — 1900s US papers reprinted foreign stories). country: full English name e.g. "United States","United Kingdom","China"; null only if the story gives no geographic clue. city/state null fields fall back to the paper's own locale downstream
  "category": "ghosts_hauntings"|"psychic_phenomena"|"ufos_aliens"|"cryptids"|"religion_mythology"|"esoteric_practices",
  "verbatim_quote": string,      // ONE striking sentence copied EXACTLY from the snippet (OCR warts and all) — used for verification, do not paraphrase
  "genre_flags": {"fiction_suspected": boolean, "advertisement": boolean, "retold_folklore": boolean, "period_sensitive": boolean}
}

Rules:
- One account per DISTINCT reported event; a snippet may contain several (or none).
- NEVER invent witnesses, dates, places, or details not in the snippet.
- If the piece is clearly a reprint crediting another paper, still extract it (dedup happens elsewhere) but keep the original locale named in the story.
- When genuinely unsure whether it is fiction, set fiction_suspected=true rather than omitting the account.
- PERIOD LANGUAGE: describe people and communities in modern, neutral language regardless of the source's wording — never carry period racial, ethnic, or colonial terms or framings into modern_title/modern_summary/modern_body (the verbatim_quote may contain them only when essential to verification; prefer choosing a different quote). If the source's framing is itself racially or ethnically charged — mockery, stereotype, or the anomaly being attributed to a group's supposed credulity — set period_sensitive=true so the row is held for human review.
- FOLKLORE ESSAYS: travelogue or essay pieces describing a community's beliefs in general (no specific witnessed event with a person, time, and place) do NOT qualify — return no account for them. retold_folklore=true is for borderline cases where a specific legend is recounted with named places/people but uncertain witness standing.
- REJECT mundane weather/storm events (lightning strikes, tornado damage, flood reports) UNLESS the piece also includes an anomalous element (presentiment, apparition, premonition, vision, prophetic dream connected to the event). Return no account if the story is purely "person/property struck by lightning."
- REJECT "freaks of nature" curiosity-column pieces. Tells: animals described as winged, two-headed, double-headed, albino-as-curiosity; specimens "preserved in alcohol" or "exhibited as a curiosity"; tinsmiths/farmers/butchers proudly displaying oddities. These are 19th-century newspaper humor/wonderment, not witness reports of anomalous creatures. Return no account.
- REJECT routine wildlife reports of known species (whales, snakes, large fish, panthers) UNLESS the description explicitly marks the creature as unknown to science, impossibly large beyond species norms, glowing/luminous, spectral, or behaviorally bizarre in ways no zoologist would explain. "Large whale sighted" alone = reject. "Whale-shaped creature, 200 feet, glowing eyes, fled at supernatural speed" = keep.
- REJECT cryptid-as-mundane-zoology reports. Period newspapers contain many "unknown animal" stories that are zoological mysteries, not paranormal phenomena: large unfamiliar marine creature with no anomalous markers, naked wild man in woods (= vagrant/hermit/escaped patient), 20-foot snake (= rare large boa/python), out-of-range big cat (= escaped exotic pet, rare native predator). A creature qualifies as a cryptid ONLY if the account includes EXPLICIT PARANORMAL MARKERS: anomalous behavior (intelligent malevolent pursuit, impossible movement, vanishing/dematerializing), impossible physiology (size far exceeding biological maximum, glowing/luminous attributes, multi-humped forms impossible for known species), supernatural framing (immunity to weapons, supernatural intelligence/strength). Without explicit paranormal markers, return no account.`;

// ─────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  shards: string[];
  dryRun: boolean;
  audit: boolean;
  backfillLedger: boolean;
  limit: number;
  maxCostUsd: number;
  pollIntervalSec: number;
  maxWaitSec: number;
  resume: string | null;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const shards: string[] = [];
  const args: CliArgs = {
    shards, dryRun: false, audit: false, backfillLedger: false, limit: 0, maxCostUsd: 25,
    pollIntervalSec: 30, maxWaitSec: 5400, resume: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--shard') shards.push(argv[++i]);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--audit') args.audit = true;
    else if (a === '--backfill-ledger') args.backfillLedger = true;
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || 0;
    else if (a === '--max-cost') args.maxCostUsd = parseFloat(argv[++i]) || 25;
    else if (a === '--poll-interval') args.pollIntervalSec = parseInt(argv[++i], 10) || 30;
    else if (a === '--max-wait') args.maxWaitSec = parseInt(argv[++i], 10) || 5400;
    else if (a === '--resume') args.resume = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/ca-extract-ingest.ts --shard <file|glob> [--dry-run] [--audit] [--backfill-ledger] [--limit N] [--max-cost 25] [--poll-interval 30] [--resume batch_id]');
      console.log('  --audit           Full dedup pre-pass (DB + seen-ledger), report would-submit/skip + cost, then exit. No spend, no inserts.');
      console.log('  --backfill-ledger Mark every snippet in the given shards as already-seen in the ledger, then exit. One-time migration.');
      process.exit(0);
    }
  }
  if (shards.length === 0 && !args.resume) {
    console.error('Specify --shard <file|glob> (repeatable) or --resume <batch_id>');
    process.exit(1);
  }
  return args;
}

/** Minimal glob: literal paths, or a '*' wildcard within the basename. */
function expandShardSpecs(specs: string[]): string[] {
  const files: string[] = [];
  for (const spec of specs) {
    const abs = path.resolve(process.cwd(), spec);
    if (!abs.includes('*')) {
      if (fs.existsSync(abs)) files.push(abs);
      else console.warn('[ca-extract] shard not found: ' + abs);
      continue;
    }
    const dir = path.dirname(abs);
    const pat = path.basename(abs);
    const rx = new RegExp('^' + pat.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    if (!fs.existsSync(dir)) { console.warn('[ca-extract] shard dir not found: ' + dir); continue; }
    for (const f of fs.readdirSync(dir).sort()) {
      if (rx.test(f)) files.push(path.join(dir, f));
    }
  }
  return Array.from(new Set(files));
}

// ─────────────────────────────────────────────────────────────────────
// SNIPPET JOBS
// ─────────────────────────────────────────────────────────────────────

interface SnippetJob {
  customId: string;            // 's<global index>'
  shardFile: string;
  shardIndex: number;
  snip: CaSnippet;
  baseId: string;              // ca-{lccn}-{date}-p{page}
  sha256: string;              // of the snippet text exactly as stored
}

function loadJobs(shardFiles: string[], limit: number): SnippetJob[] {
  const jobs: SnippetJob[] = [];
  let g = 0;
  for (const file of shardFiles) {
    let arr: CaSnippet[];
    try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e: any) {
      console.warn('[ca-extract] unparseable shard ' + file + ': ' + (e?.message || e));
      continue;
    }
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      if (!s || typeof s.snippet !== 'string' || !s.lccn || !s.date) continue;
      jobs.push({
        customId: 's' + g++,
        shardFile: file,
        shardIndex: i,
        snip: s,
        baseId: 'ca-' + s.lccn + '-' + s.date + '-p' + s.page,
        sha256: crypto.createHash('sha256').update(s.snippet, 'utf8').digest('hex'),
      });
      if (limit > 0 && jobs.length >= limit) return jobs;
    }
  }
  return jobs;
}

function buildUserPrompt(s: CaSnippet): string {
  return [
    'NEWSPAPER: ' + s.paperTitle,
    'PRINT DATE: ' + s.date,
    'PLACE OF PUBLICATION: ' + [s.city, s.county, s.state].filter(Boolean).join(', '),
    'SEARCH TERM THAT MATCHED: "' + s.hitTerm + '"',
    '',
    'OCR SNIPPET:',
    s.snippet,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────

interface ExtractedAccount {
  modern_title?: string;
  modern_summary?: string;
  modern_body?: string;
  event_date?: string | null;
  location?: { city?: string | null; state?: string | null; country?: string | null };
  category?: string;
  verbatim_quote?: string;
  genre_flags?: { fiction_suspected?: boolean; advertisement?: boolean; retold_folklore?: boolean; period_sensitive?: boolean };
}

function normWords(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

/** Share of the quote's word 8-grams present in the snippet (normalized). */
function quoteContainment(quote: string, snippet: string): number {
  const qw = normWords(quote);
  const sw = normWords(snippet);
  if (qw.length < QUOTE_NGRAM) {
    // Short quote: require it to be a normalized substring.
    return sw.join(' ').includes(qw.join(' ')) ? 1 : 0;
  }
  const grams = new Set<string>();
  for (let i = 0; i + QUOTE_NGRAM <= sw.length; i++) grams.add(sw.slice(i, i + QUOTE_NGRAM).join(' '));
  let total = 0, hits = 0;
  for (let i = 0; i + QUOTE_NGRAM <= qw.length; i++) {
    total++;
    if (grams.has(qw.slice(i, i + QUOTE_NGRAM).join(' '))) hits++;
  }
  return total > 0 ? hits / total : 0;
}

type Rejection = string;

function validateAccount(acc: ExtractedAccount, snip: CaSnippet): { ok: true } | { ok: false; reason: Rejection } {
  if (!acc.modern_title || acc.modern_title.length > 120) return { ok: false, reason: 'bad_title' };
  if (!acc.modern_summary || acc.modern_summary.length > 600) return { ok: false, reason: 'bad_summary' };
  if (!acc.modern_body || acc.modern_body.length < BODY_MIN_CHARS || acc.modern_body.length > BODY_MAX_CHARS) {
    return { ok: false, reason: 'bad_body_length_' + (acc.modern_body ? acc.modern_body.length : 0) };
  }
  if (!acc.category || ALLOWED_CATEGORIES.indexOf(acc.category as CaCategory) < 0) return { ok: false, reason: 'bad_category' };
  if (!acc.verbatim_quote || typeof acc.verbatim_quote !== 'string') return { ok: false, reason: 'missing_quote' };
  const containment = quoteContainment(acc.verbatim_quote, snip.snippet);
  if (containment < QUOTE_MIN_CONTAINMENT) return { ok: false, reason: 'quote_not_verbatim_' + containment.toFixed(2) };
  if (acc.event_date != null && acc.event_date !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acc.event_date)) return { ok: false, reason: 'bad_date_format' };
    if (acc.event_date > snip.date) return { ok: false, reason: 'date_after_paper' };
    if (acc.event_date < '1700-01-01') return { ok: false, reason: 'implausible_date' };
  }
  const gf = acc.genre_flags || {};
  if (gf.fiction_suspected) return { ok: false, reason: 'fiction_suspected' };
  if (gf.advertisement) return { ok: false, reason: 'advertisement' };
  // V11.18.24 — deterministic period-language backstop. The June 12 sweep
  // found the model self-flags period_sensitive unreliably (0 of 893 flagged;
  // 17 had period racial terms in modern text, mostly inside embedded
  // verbatim quotes). The model is an unreliable self-reporter, so we also
  // check the MODERN text (title+summary+body) against a lexicon and force
  // the flag on — held for human review by pd-bulk-approve, never dropped.
  if (PERIOD_TERM_LEXICON.test(`${acc.modern_title} ${acc.modern_summary} ${acc.modern_body}`)) {
    acc.genre_flags = { ...gf, period_sensitive: true };
  }
  return { ok: true };
}

// Period racial/ethnic terms that must not pass into modern text unflagged.
// Word-boundary anchored; extend as review surfaces more.
const PERIOD_TERM_LEXICON = /\b(negro(es)?|negress(es)?|colored (man|men|woman|women|people|folks?|boys?|girls?|church|preacher|preachers|congregation|servant|servants)|darke?y(s|ies)?|mammy|coon(s)?|chinam[ae]n|chinee|injun(s)?|redskin(s)?|papoose(s)?|squaw(s)?|hottentot(s)?|half-breed(s)?|savage (tribe|race|blood)|coolie(s)?|pickaninn(y|ies)|mulatto(es)?|oriental(s)?|japs?(?!an))\b/i;

// ─────────────────────────────────────────────────────────────────────
// SLUG (identical to nderf-mass-ingest.ts / pd-text-ingest.ts)
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
// ANTHROPIC BATCH HELPERS (mirrors classify-phenomena-batch.ts)
// ─────────────────────────────────────────────────────────────────────

function apiKey(): string {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) { console.error('[ca-extract] ANTHROPIC_API_KEY missing — source .env.local first.'); process.exit(1); }
  return k;
}

async function prewarmCache(systemPrompt: string): Promise<{ cost: number; error?: string }> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return { cost: 0, error: 'prewarm ' + resp.status + ': ' + txt.substring(0, 200) };
  }
  const data: any = await resp.json();
  const u = data.usage || {};
  const cost =
    (u.input_tokens || 0) / 1e6 * 1.0 +
    (u.cache_creation_input_tokens || 0) / 1e6 * 1.25 +
    (u.output_tokens || 0) / 1e6 * 5.0;
  return { cost };
}

async function submitBatch(requests: any[]): Promise<{ batch_id: string } | { error: string }> {
  const resp = await fetch(BATCH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
    },
    body: JSON.stringify({ requests }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return { error: 'submit ' + resp.status + ': ' + txt.substring(0, 300) };
  }
  const data: any = await resp.json();
  if (!data.id) return { error: 'response missing id' };
  return { batch_id: data.id };
}

async function getBatchStatus(batchId: string): Promise<any> {
  const resp = await fetch(BATCH_API_URL + '/' + batchId, {
    headers: { 'x-api-key': apiKey(), 'anthropic-version': '2023-06-01', 'anthropic-beta': 'message-batches-2024-09-24' },
  });
  return resp.json();
}

async function fetchBatchResults(url: string): Promise<any[]> {
  const resp = await fetch(url, {
    headers: { 'x-api-key': apiKey(), 'anthropic-version': '2023-06-01', 'anthropic-beta': 'message-batches-2024-09-24' },
  });
  const text = await resp.text();
  const rows: any[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { rows.push(JSON.parse(trimmed)); } catch { /* skip */ }
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────
// BATCH MANIFEST (for --resume)
// ─────────────────────────────────────────────────────────────────────

interface BatchManifest {
  batchId: string;
  submittedAt: string;
  items: { customId: string; shardFile: string; shardIndex: number }[];
}

function saveManifest(m: BatchManifest): void {
  fs.mkdirSync(BATCH_DIR, { recursive: true });
  fs.writeFileSync(path.join(BATCH_DIR, m.batchId + '.json'), JSON.stringify(m, null, 1));
}

function loadManifest(batchId: string): BatchManifest | null {
  const p = path.join(BATCH_DIR, batchId + '.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

interface Totals {
  snippets: number;
  skippedDup: number;
  submitted: number;
  resultRows: number;
  emptyResults: number;       // accounts: []
  accountsReturned: number;
  accountsRejected: number;
  rejectionReasons: Record<string, number>;
  inserted: number;
  insertDuplicates: number;
  contentDuplicates: number;   // skipped: content fingerprint already seen (syndicated reprint)
  insertErrors: number;
  costUsd: number;
}

async function main() {
  const args = parseArgs();

  // ── Load snippets ───────────────────────────────────────────────────
  let jobs: SnippetJob[];
  if (args.resume) {
    const manifest = loadManifest(args.resume);
    if (!manifest) {
      console.error('[ca-extract] no manifest at ' + path.join(BATCH_DIR, args.resume + '.json') + ' — cannot resume.');
      process.exit(1);
    }
    const byFile = new Map<string, SnippetJob[]>();
    jobs = [];
    for (const item of manifest.items) {
      if (!byFile.has(item.shardFile)) {
        const loaded = loadJobs([item.shardFile], 0);
        byFile.set(item.shardFile, loaded);
      }
      const fileJobs = byFile.get(item.shardFile)!;
      const found = fileJobs.find(j => j.shardIndex === item.shardIndex);
      if (found) jobs.push({ ...found, customId: item.customId });
    }
    console.log('[ca-extract] resume ' + args.resume + ': ' + jobs.length + ' snippets reconstructed from manifest');
  } else {
    const files = expandShardSpecs(args.shards);
    if (files.length === 0) { console.error('[ca-extract] no shard files matched.'); process.exit(1); }
    console.log('[ca-extract] shards: ' + files.map(f => path.basename(f)).join(', '));
    jobs = loadJobs(files, args.limit);
  }
  console.log('[ca-extract] ' + jobs.length + ' snippets loaded');
  if (jobs.length === 0) { console.log('Nothing to do.'); return; }

  // ── Cost estimate ───────────────────────────────────────────────────
  const sysTokens = Math.ceil(SYSTEM_PROMPT.length / 4);
  const avgUserTokens = Math.ceil(jobs.reduce((a, j) => a + buildUserPrompt(j.snip).length, 0) / jobs.length / 4);
  const avgOutputTokens = 450; // accounts:[] is tiny; 1-2 accounts ~600-900
  const perReq =
    sysTokens / 1e6 * HAIKU_CACHE_READ_BATCH +
    avgUserTokens / 1e6 * HAIKU_INPUT_BATCH +
    avgOutputTokens / 1e6 * HAIKU_OUTPUT_BATCH;
  const estTotal = sysTokens / 1e6 * HAIKU_CACHE_WRITE_BATCH + perReq * jobs.length;
  console.log('[ca-extract] est cost: $' + estTotal.toFixed(4) + ' (~$' + perReq.toFixed(6) + '/snippet, sys ~' + sysTokens + ' tok cached, user avg ~' + avgUserTokens + ' tok)');

  if (args.dryRun) {
    console.log('DRY RUN — would submit ' + jobs.length + ' batch requests (NO dedup applied — use --audit for the real would-submit count). No AI, no DB.');
    for (const j of jobs.slice(0, 3)) {
      console.log('  sample ' + j.baseId + ' [' + j.snip.hitTerm + ']: ' + j.snip.snippet.slice(0, 160).replace(/\n/g, ' ') + '…');
    }
    return;
  }

  if (args.backfillLedger) {
    // One-time migration: mark every snippet in the given shards as seen.
    // Safe ONLY when every current snippet has already been extracted at
    // least once (e.g. after the daemon's in-flight wave finishes). After
    // this, the next run skips all of them and only pays for NEW harvest.
    const before = loadSeenLedger();
    const beforeN = before.size;
    appendSeen(jobs.map(j => j.sha256), before);
    console.log('[ca-extract] --backfill-ledger: ledger ' + beforeN + ' → ' + before.size +
      ' shas (+' + (before.size - beforeN) + ' from ' + jobs.length + ' loaded snippets)');
    console.log('[ca-extract] ledger: ' + SEEN_LEDGER);
    return;
  }

  // ── Live: env + DB ──────────────────────────────────────────────────
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[ca-extract] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source .env.local first.');
    process.exit(1);
  }
  apiKey(); // exits if missing

  const { createClient } = await import('@supabase/supabase-js');
  const { normalizeLocation, geocodeWithFallback, makeSupabaseGeocodeCache } =
    await import('../src/lib/ingestion/utils/normalize-location');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const totals: Totals = {
    snippets: jobs.length, skippedDup: 0, submitted: 0, resultRows: 0,
    emptyResults: 0, accountsReturned: 0, accountsRejected: 0, rejectionReasons: {},
    inserted: 0, insertDuplicates: 0, contentDuplicates: 0, insertErrors: 0, costUsd: 0,
  };

  async function logCost(reportId: string | null, originalReportId: string, inputTokens: number, outputTokens: number, cacheCreate: number, cacheRead: number, costUsd: number): Promise<void> {
    try {
      await supabase.from('paradocs_narrative_cost_log').insert({
        service: 'ca-extract',
        report_id: reportId,
        model: HAIKU_MODEL + ' (ca-extract:batch)',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_tokens: cacheCreate || null,
        cost_usd: costUsd,
        status: 'completed',
        reason: originalReportId,
      });
    } catch { /* non-fatal telemetry */ }
  }

  // ── Dedup pre-pass: existing ids + snippet fingerprints ────────────
  console.log('[ca-extract] loading existing chronicling-america rows for dedup…');
  const existingIds = new Set<string>();
  const existingShas = new Set<string>();
  const existingFps = new Set<string>();   // metadata.content_fp on existing rows (syndication guard)
  {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('reports')
        .select('original_report_id, metadata')
        .eq('source_type', 'chronicling-america')
        .range(from, from + 999);
      if (error) { console.warn('[ca-extract] dedup fetch error: ' + error.message); break; }
      for (const r of (data || []) as any[]) {
        if (r.original_report_id) existingIds.add(r.original_report_id);
        const sha = r.metadata && r.metadata.snippet_sha256;
        if (typeof sha === 'string') existingShas.add(sha);
        const fp = r.metadata && r.metadata.content_fp;
        if (typeof fp === 'string' && fp.length >= FP_MIN_LEN) existingFps.add(fp);
      }
      if (!data || data.length < 1000) break;
      from += 1000;
    }
  }
  const seenShas = loadSeenLedger();
  // Content-fingerprint guard: ledger ∪ existing DB content_fp values.
  const seenFps = loadFpLedger();
  for (const fp of existingFps) seenFps.add(fp);
  console.log('[ca-extract] dedup: ' + existingIds.size + ' existing ids, ' + existingShas.size +
    ' DB fingerprints, ' + seenShas.size + ' seen-ledger fingerprints, ' + seenFps.size + ' content fingerprints');

  // Skip a snippet if it became a row (existingShas/Ids) OR was already
  // processed in a prior run, accepted or rejected (seenShas). The ledger is
  // what stops rejected snippets from being re-extracted on every wave.
  let skipDbSha = 0, skipDbId = 0, skipLedger = 0;
  let pending = jobs.filter(j => {
    const dbHit = existingShas.has(j.sha256) || existingIds.has(j.baseId + '-1');
    const ledgerHit = seenShas.has(j.sha256);
    if (dbHit || ledgerHit) {
      totals.skippedDup++;
      if (existingShas.has(j.sha256)) skipDbSha++; else if (existingIds.has(j.baseId + '-1')) skipDbId++;
      if (ledgerHit && !dbHit) skipLedger++;
      return false;
    }
    return true;
  });
  console.log('[ca-extract] ' + pending.length + ' snippets to extract (' + totals.skippedDup +
    ' skipped: ' + (skipDbSha + skipDbId) + ' already-ingested, ' + skipLedger + ' seen-but-rejected-before)');

  if (args.audit) {
    const submitN = pending.length;
    const auditCost = sysTokens / 1e6 * HAIKU_CACHE_WRITE_BATCH + perReq * submitN;
    console.log('\n=== AUDIT (no submit, no inserts, $0 spend) ===');
    console.log('  loaded:            ' + jobs.length);
    console.log('  skip already-ingested (DB sha/id): ' + (skipDbSha + skipDbId));
    console.log('  skip seen-but-rejected (ledger):   ' + skipLedger);
    console.log('  WOULD SUBMIT:      ' + submitN);
    console.log('  projected cost:    $' + auditCost.toFixed(4) + ' (~$' + perReq.toFixed(6) + '/snippet)');
    console.log('================================================');
    return;
  }
  if (pending.length === 0) { printSummary(totals); return; }

  const jobIndex = new Map<string, SnippetJob>();
  for (const j of pending) jobIndex.set(j.customId, j);

  // Snippets whose batch request SUCCEEDED (accepted or rejected) get added
  // here, then flushed to the ledger after each batch so future runs skip them.
  const processedShas = new Set<string>();

  // ── Insert one validated account ───────────────────────────────────
  async function insertAccount(job: SnippetJob, acc: ExtractedAccount, n: number): Promise<void> {
    const s = job.snip;
    const originalReportId = job.baseId + '-' + n;
    if (existingIds.has(originalReportId)) { totals.insertDuplicates++; return; }

    // ── CONTENT-FINGERPRINT GUARD (syndicated-reprint dedup) ──────────
    // Mirrors the snippet-sha seen-ledger but on the ACCEPTED modern body:
    // catches the same wire story reprinted across papers (different OCR →
    // different sha, but near-identical retelling). Skip if the fingerprint
    // (len >= FP_MIN_LEN) is already in the ledger OR on an existing DB row.
    // Short/empty fingerprints are never used to dedup (treated as no-fp).
    const fp = contentFp(acc.modern_body);
    if (fp.length >= FP_MIN_LEN && seenFps.has(fp)) { totals.contentDuplicates++; return; }

    let eventDate = acc.event_date && /^\d{4}-\d{2}-\d{2}$/.test(acc.event_date) ? acc.event_date : null;
    let datePrecision: string = 'exact';
    if (!eventDate) { eventDate = s.date; datePrecision = 'estimated'; }
    else if (/-01-01$/.test(eventDate)) datePrecision = 'year';
    else if (/-01$/.test(eventDate)) datePrecision = 'month';

    const city = (acc.location && acc.location.city) || s.city || null;
    const stateProv = (acc.location && acc.location.state) || s.state || null;
    // V11.29 — use the AI-determined EVENT country instead of hardcoding US.
    // The old hardcoded 'United States' is the wrong-country bug: a story set
    // in "Cheshire, England" geocoded to a US Cheshire. Pass the AI country by
    // NAME with country_code:null so normalizeLocation resolves it in the right
    // country; fall back to the paper's US locale only when the AI gave none.
    const aiCountry = (acc.location && acc.location.country) ? String(acc.location.country).trim() : null;

    let normalized: any = null;
    try {
      normalized = await normalizeLocation(
        {
          city, state_province: stateProv,
          country: aiCountry || 'United States',
          country_code: aiCountry ? null : 'US',
          location_name: [city, stateProv].filter(Boolean).join(', ') || null,
          latitude: null, longitude: null,
        },
        { geocoder: 'maptiler', geocodeFn: geocodeWithFallback, cache: makeSupabaseGeocodeCache(supabase) },
      );
    } catch { /* non-fatal — insert with raw strings */ }

    const gf = acc.genre_flags || {};
    const insertData: Record<string, any> = {
      title: acc.modern_title,
      slug: generateSlug(acc.modern_title || 'untitled', originalReportId, 'chronicling-america'),
      summary: acc.modern_summary,
      description: acc.modern_body,
      category: acc.category,
      location_name: normalized ? normalized.location_name : [city, stateProv].filter(Boolean).join(', ') || null,
      country: normalized ? normalized.country : (aiCountry || 'United States'),
      country_code: normalized ? normalized.country_code : (aiCountry ? null : 'US'),
      state_province: normalized ? normalized.state_province : stateProv,
      city: normalized ? normalized.city : city,
      latitude: normalized ? normalized.latitude : null,
      longitude: normalized ? normalized.longitude : null,
      coords_synthetic: normalized ? !!normalized.coords_synthetic : false,
      event_date: eventDate,
      event_date_precision: datePrecision,
      credibility: 'medium',
      source_type: 'chronicling-america',
      original_report_id: originalReportId,
      // V11.29 — archive off-schema genres AT INGEST so they never pollute the
      // pending/narrate/approve flow (folklore is retold legend, not a witnessed
      // experience; fiction/ads aren't accounts at all — founder decision).
      // period_sensitive stays pending for individual review. Reversible.
      status: (gf.retold_folklore || gf.fiction_suspected || gf.advertisement) ? 'archived' : 'pending_review',
      tags: ['newspaper', 'historical', caTermSlug(s.hitTerm)],
      source_label: s.paperTitle + ' (' + s.date + ')',
      source_url: s.resourceUrl,
      upvotes: 0,
      view_count: 0,
      report_type: 'ingested',
      metadata: {
        public_domain: true,
        newspaper: s.paperTitle,
        lccn: s.lccn,
        page: s.page,
        hitTerm: s.hitTerm,
        snippet_sha256: job.sha256,
        content_fp: fp.length >= FP_MIN_LEN ? fp : null,   // syndication-dedup family key
        original_snippet: s.snippet,         // PD — held outright
        extraction: 'consolidated-v1',
        genre_flags: { fiction_suspected: !!gf.fiction_suspected, advertisement: !!gf.advertisement, retold_folklore: !!gf.retold_folklore, period_sensitive: !!gf.period_sensitive },
        ingest_archived_reason: (gf.retold_folklore ? 'retold_folklore' : gf.fiction_suspected ? 'fiction_suspected' : gf.advertisement ? 'advertisement' : null),
        verbatim_quote: acc.verbatim_quote,
        paper_city: s.city,
        paper_state: s.state,
        location_precision: normalized ? normalized.location_precision : 'unknown',
      },
    };

    const res = await supabase.from('reports').insert(insertData).select('id').single();
    if (res.error) {
      if (res.error.message && res.error.message.indexOf('duplicate key') !== -1) totals.insertDuplicates++;
      else { totals.insertErrors++; console.warn('[ca-extract] insert error ' + originalReportId + ': ' + res.error.message); }
    } else {
      totals.inserted++;
      existingIds.add(originalReportId);
      existingShas.add(job.sha256);
      // Record the content fingerprint so later accounts (this run or future
      // waves) skip the same syndicated story.
      if (fp.length >= FP_MIN_LEN) appendFp(fp, seenFps);
    }
  }

  // ── Process one batch's result rows ────────────────────────────────
  async function processResults(rows: any[]): Promise<void> {
    for (const row of rows) {
      totals.resultRows++;
      const job = jobIndex.get(row.custom_id);
      if (!job) continue;

      const usage = row.result?.message?.usage || {};
      const cost =
        (usage.input_tokens || 0) / 1e6 * HAIKU_INPUT_BATCH +
        (usage.cache_creation_input_tokens || 0) / 1e6 * HAIKU_CACHE_WRITE_BATCH +
        (usage.cache_read_input_tokens || 0) / 1e6 * HAIKU_CACHE_READ_BATCH +
        (usage.output_tokens || 0) / 1e6 * HAIKU_OUTPUT_BATCH;
      totals.costUsd += cost;
      await logCost(null, job.baseId, usage.input_tokens || 0, usage.output_tokens || 0, usage.cache_creation_input_tokens || 0, usage.cache_read_input_tokens || 0, cost);

      if (row.result?.type !== 'succeeded') {
        // Infrastructure failure (errored/expired/canceled) — NOT deterministic.
        // Don't mark seen, so it retries on a later run.
        totals.rejectionReasons['batch_request_' + (row.result?.type || 'failed')] =
          (totals.rejectionReasons['batch_request_' + (row.result?.type || 'failed')] || 0) + 1;
        continue;
      }
      // The model returned a response. Whatever the outcome below (accepted,
      // rejected, empty, unparseable), it's deterministic at temp 0.2, so mark
      // this snippet seen — future runs skip it instead of re-paying for it.
      processedShas.add(job.sha256);
      const text: string = row.result.message?.content?.[0]?.text || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) { totals.rejectionReasons['no_json'] = (totals.rejectionReasons['no_json'] || 0) + 1; continue; }
      let parsed: any;
      try { parsed = JSON.parse(m[0]); } catch { totals.rejectionReasons['bad_json'] = (totals.rejectionReasons['bad_json'] || 0) + 1; continue; }
      const accounts: ExtractedAccount[] = Array.isArray(parsed?.accounts) ? parsed.accounts : [];
      if (accounts.length === 0) { totals.emptyResults++; continue; }

      let n = 0;
      for (const acc of accounts) {
        totals.accountsReturned++;
        n++; // n tracks position in the returned array → stable ids across re-runs (temp ~0)
        const v = validateAccount(acc, job.snip);
        if (!v.ok) {
          totals.accountsRejected++;
          totals.rejectionReasons[v.reason] = (totals.rejectionReasons[v.reason] || 0) + 1;
          continue;
        }
        await insertAccount(job, acc, n);
      }
    }
    // Persist this batch's processed snippets so future runs skip them
    // (this is the fix for re-extracting rejected snippets every wave).
    appendSeen(processedShas, seenShas);
  }

  // ── Poll helper ─────────────────────────────────────────────────────
  async function pollBatch(batchId: string): Promise<void> {
    const start = Date.now();
    while (true) {
      if (Date.now() - start > args.maxWaitSec * 1000) {
        console.warn('[ca-extract] max wait reached; batch ' + batchId + ' left in flight. Resume later with: --resume ' + batchId);
        return;
      }
      await new Promise(r => setTimeout(r, args.pollIntervalSec * 1000));
      const status = await getBatchStatus(batchId);
      const c = status.request_counts || {};
      console.log('[ca-extract] [+' + Math.round((Date.now() - start) / 1000) + 's] ' + batchId +
        ' status=' + status.processing_status + ' processing=' + (c.processing || 0) +
        ' succeeded=' + (c.succeeded || 0) + ' errored=' + (c.errored || 0));
      if (status.processing_status !== 'ended') continue;
      if (!status.results_url) { console.error('[ca-extract] no results_url for ' + batchId); return; }
      const rows = await fetchBatchResults(status.results_url);
      console.log('[ca-extract] got ' + rows.length + ' result rows — validating + inserting…');
      await processResults(rows);
      return;
    }
  }

  // ── Submit or resume ────────────────────────────────────────────────
  if (args.resume) {
    await pollBatch(args.resume);
    printSummary(totals);
    return;
  }

  for (let ci = 0; ci < pending.length; ci += CHUNK_SIZE) {
    if (totals.costUsd >= args.maxCostUsd) {
      console.warn('[ca-extract] max cost reached ($' + totals.costUsd.toFixed(2) + ' >= $' + args.maxCostUsd + ') — stopping before next chunk.');
      break;
    }
    const chunkJobs = pending.slice(ci, ci + CHUNK_SIZE);
    const requests = chunkJobs.map(j => ({
      custom_id: j.customId,
      params: {
        model: HAIKU_MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUserPrompt(j.snip) }],
        temperature: TEMPERATURE,
      },
    }));

    // V11.17.92 pattern: prewarm only before the FIRST chunk; later chunks
    // ride the cache the previous completed batch populated.
    if (ci === 0) {
      const warm = await prewarmCache(SYSTEM_PROMPT);
      if (warm.error) console.warn('[ca-extract] prewarm failed (' + warm.error + ') — proceeding cold');
      else { totals.costUsd += warm.cost; console.log('[ca-extract] prewarm OK ($' + warm.cost.toFixed(5) + ')'); }
    }

    console.log('[ca-extract] submitting chunk ' + (Math.floor(ci / CHUNK_SIZE) + 1) + '/' + Math.ceil(pending.length / CHUNK_SIZE) + ' (' + requests.length + ' snippets)…');
    const sub = await submitBatch(requests);
    if ('error' in sub) { console.error('[ca-extract] submit failed: ' + sub.error); continue; }
    totals.submitted += requests.length;
    console.log('[ca-extract] batch_id: ' + sub.batch_id);
    saveManifest({
      batchId: sub.batch_id,
      submittedAt: new Date().toISOString(),
      items: chunkJobs.map(j => ({ customId: j.customId, shardFile: j.shardFile, shardIndex: j.shardIndex })),
    });
    await pollBatch(sub.batch_id);
  }

  printSummary(totals);
}

function printSummary(t: Totals): void {
  console.log('\n=== ca-extract-ingest summary ===');
  console.log('snippets loaded:        ' + t.snippets);
  console.log('skipped (already done): ' + t.skippedDup);
  console.log('submitted:              ' + t.submitted);
  console.log('result rows:            ' + t.resultRows);
  console.log('empty (accounts:[]):    ' + t.emptyResults);
  console.log('accounts returned:      ' + t.accountsReturned);
  console.log('accounts rejected:      ' + t.accountsRejected);
  console.log('inserted pending_review:' + t.inserted);
  console.log('insert duplicates:      ' + t.insertDuplicates);
  console.log('content-fp duplicates:  ' + t.contentDuplicates + ' (syndicated reprints skipped)');
  console.log('insert errors:          ' + t.insertErrors);
  console.log('cost:                   $' + t.costUsd.toFixed(4));
  const top = Object.entries(t.rejectionReasons).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (top.length) {
    console.log('top rejection reasons:');
    top.forEach(([r, c]) => console.log('  ' + c + 'x ' + r));
  }
  console.log('\nREVIEW: rows are status=pending_review under source_type=chronicling-america.');
  console.log('NOTE: scripts/pd-bulk-approve.ts does NOT cover this source (different config registry) — review via the admin queue.');
}

main().catch(err => {
  console.error('[ca-extract] Fatal:', err);
  process.exit(1);
});
