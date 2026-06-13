#!/usr/bin/env tsx
/**
 * CA-EXTRACT-CONSOLIDATED — V11.18.29
 *
 * ONE consolidated Haiku call per snippet that fuses the three current
 * passes (ca-extract-ingest extract + consolidated-ai worker + classify-
 * phenomena-batch classifier) into a single prompt. On success we have
 * everything needed to insert as status='approved' WITH report_phenomena
 * junction rows — no second worker pass, no later classifier sweep.
 *
 * Predicted quality drop vs the 3-pass pipeline: 3–5% (longer prompt,
 * single judgment surface). This script is the validation harness for
 * that prediction. Validate against the 1897 ground truth (716 inserted
 * rows from the existing pipeline) before bulk-dump path is greenlit.
 *
 * ── Usage ──────────────────────────────────────────────────────────────
 *   set -a; source .env.local; set +a
 *
 *   # Dry-run smoke test — live Haiku, NO DB writes. Outputs per-snippet
 *   # results to outputs/ca-consolidated-1897-smoketest.json so the
 *   # comparison harness can join them against the existing DB rows.
 *   npx tsx scripts/ca-extract-consolidated.ts \
 *     --shard 'outputs/ca-shards/*-1897.json' \
 *     --dry-run \
 *     --max-cost 5
 *
 * ── Flags ──────────────────────────────────────────────────────────────
 *   --shard <file|glob>   Shard file or glob. May repeat. Required.
 *   --dry-run             No DB writes; write per-snippet JSON to disk.
 *   --max-cost USD        Stop submitting new chunks past this. Default 5.
 *   --limit N             Process at most N snippets.
 *   --out PATH            Override dry-run output path.
 *
 * ── Output schema (dry-run JSON, one row per snippet) ──────────────────
 *   {
 *     customId, baseId, sha256, snippet (first 200ch), hitTerm,
 *     paperDate, paperCity, paperState,
 *     status: 'accepted' | 'rejected_by_extract' | 'rejected_by_gate' |
 *             'parse_failed' | 'no_accounts',
 *     rejection_reason?: string,        // for non-accepted rows
 *     fallback_used: boolean,           // true if we'd fall back to 3-pass
 *     usage: { in, out, cache_w, cache_r, cost_usd },
 *     accounts: [{ ...full consolidated shape — see ConsolidatedAccount }]
 *   }
 *
 * Inserts (when NOT --dry-run; reserved for Phase 3 once quality clears):
 *   reports row (status='approved') + report_phenomena junction rows
 *   matching classify-phenomena-batch.ts shape.
 *
 * ── Fallback path ──────────────────────────────────────────────────────
 *   On JSON parse failure OR missing required field → fallback_used=true.
 *   Dry-run mode just records this; live mode (TODO Phase 3) would
 *   re-queue for the existing 3-pass path. Fallback rate is reported in
 *   the summary so Chase can size cost/quality risk.
 *
 * NOT a replacement for ca-extract-ingest.ts. That script stays as-is.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import type { CaSnippet } from './ca-harvest';

// ─────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4000;         // bumped from 2000 — output now carries all fields
const TEMPERATURE = 0.2;
const BATCH_API_URL = 'https://api.anthropic.com/v1/messages/batches';

// Batch pricing
const HAIKU_INPUT_BATCH = 0.5;
const HAIKU_OUTPUT_BATCH = 2.5;
const HAIKU_CACHE_WRITE_BATCH = 0.625;
const HAIKU_CACHE_READ_BATCH = 0.05;

// Live (non-batch) pricing for prewarm + future single-call paths
const HAIKU_INPUT_LIVE = 1.0;
const HAIKU_OUTPUT_LIVE = 5.0;

const CHUNK_SIZE = 500;          // smaller than ca-extract-ingest: prompt is 3-4x larger
const QUOTE_NGRAM = 8;
const QUOTE_MIN_CONTAINMENT = 0.85;   // V11.18.29 spec says ≥85%
const BODY_MIN_CHARS = 400;
const BODY_MAX_CHARS = 3000;

const ALLOWED_CATEGORIES = [
  'ghosts_hauntings', 'psychic_phenomena', 'ufos_aliens',
  'cryptids', 'religion_mythology', 'esoteric_practices',
] as const;
type CaCategory = (typeof ALLOWED_CATEGORIES)[number];

const SMOKETEST_DEFAULT = path.resolve(process.cwd(), 'outputs/ca-consolidated-1897-smoketest.json');

// ─────────────────────────────────────────────────────────────────────
// CONSOLIDATED SYSTEM PROMPT
// (merge of: ca-extract-ingest extract prompt + consolidated-ai worker
//  fields + classifier catalog. Keeps all 4 V11.18.27/28 rejection rules,
//  the period-language tone discipline, anti-fabrication rules, frame
//  discipline, and per-snippet phenomenon picks.)
// ─────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_HEADER = `You are the editorial intelligence for Paradocs, a documentary archive of anomalous experiences. Your input is an OCR text snippet cut from a named, dated US newspaper page (1789–1963; the paper name, date, and place are given). OCR noise is expected — read through it.

TASK: For each GENUINE REPORTED ANOMALOUS EXPERIENCE in the snippet, emit a single consolidated account that contains BOTH the structured retelling AND the editorial fields (narrative, pull quote, assessment, witness profile, phenomenon classification). The snippet may contain zero, one, or several distinct events.

OUTPUT — STRICT JSON only, no prose, no markdown fences:
{"accounts":[ ... ]}   or   {"accounts":[]}   when nothing qualifies.

====================================================================
ACCEPTANCE GATE — when is a snippet a "genuine reported anomalous experience"?
====================================================================
A witnessed event reported as fact (a named or described person saw/heard/experienced something anomalous at a real time and place). The following do NOT count:
- fiction or serialized stories, poetry
- advertisements (incl. fortune-teller/clairvoyant ads and patent-medicine copy)
- joke or humor columns
- folklore retold purely as entertainment with no witness
- skeptical essays that discuss the topic without any witness account

REJECTION RULES (all four still apply — V11.18.27/28):

1. REJECT mundane weather/storm events (lightning strikes, tornado damage, flood reports) UNLESS the piece also includes an anomalous element (presentiment, apparition, premonition, vision, prophetic dream connected to the event). "Person/property struck by lightning" alone = reject.

2. REJECT "freaks of nature" curiosity-column pieces. Tells: animals described as winged/two-headed/double-headed/albino-as-curiosity; specimens "preserved in alcohol" or "exhibited as a curiosity"; tinsmiths/farmers/butchers proudly displaying oddities. These are 19th-century humor/wonderment, not witness reports of anomalous creatures. Return no account.

3. REJECT routine wildlife reports of known species (whales, snakes, large fish, panthers) UNLESS the description explicitly marks the creature as unknown to science, impossibly large beyond species norms, glowing/luminous, spectral, or behaviorally bizarre in ways no zoologist would explain. "Large whale sighted" alone = reject. "Whale-shaped creature, 200 feet, glowing eyes, fled at supernatural speed" = keep.

4. REJECT cryptid-as-mundane-zoology reports. Period newspapers contain many "unknown animal" stories that are zoological mysteries, not paranormal phenomena: large unfamiliar marine creature with no anomalous markers, naked wild man in woods (= vagrant/hermit/escaped patient), 20-foot snake (= rare large boa/python), out-of-range big cat (= escaped exotic pet, rare native predator). A creature qualifies as a cryptid ONLY if the account includes EXPLICIT PARANORMAL MARKERS: anomalous behavior (intelligent malevolent pursuit, impossible movement, vanishing/dematerializing), impossible physiology (size far exceeding biological maximum, glowing/luminous attributes, multi-humped forms impossible for known species), supernatural framing (immunity to weapons, supernatural intelligence/strength). Without explicit paranormal markers, return no account.

FOLKLORE ESSAYS: travelogue or essay pieces describing a community's beliefs in general (no specific witnessed event with a person, time, and place) do NOT qualify — return no account. retold_folklore=true is for borderline cases where a specific legend is recounted with named places/people but uncertain witness standing.

====================================================================
ANTI-FABRICATION HARD RULES
====================================================================
- NEVER invent witnesses, dates, places, or details not in the snippet.
- Match source intensity. "slight fever" → NOT "fever-stricken". "saw a light" → NOT "blinded by brilliant light".
- Preserve witness names, places, and dates exactly as printed.
- Present testimony as testimony ("she told the reporter", "it is said").

====================================================================
PERIOD-LANGUAGE DISCIPLINE
====================================================================
Describe people and communities in modern, neutral language regardless of the source's wording — never carry period racial, ethnic, or colonial terms or framings into modern_title/modern_summary/modern_body (the verbatim_quote may contain them only when essential to verification; prefer choosing a different quote). If the source's framing is itself racially or ethnically charged (mockery, stereotype, anomaly attributed to a group's supposed credulity), set period_sensitive=true so the row is held for human review.

====================================================================
EDITORIAL VOICE (for paradocs_narrative, pull_quote, answer_line)
====================================================================
- THIRD-PERSON ONLY. Never first-person pronouns (I, me, my, we, us, our).
- Use "the witness", "the experiencer", "she/he/they". Default "they" unless source explicitly states gender.
- A seasoned investigator's voice — evidence-first, never credulous, never dismissive.
- Treat the anomalous content seriously; do NOT collapse it into a known mechanism (no "hallucination", "imagination", "merely psychological", "just a dream"). The witness perceived what they perceived.

====================================================================
ACCOUNT SCHEMA — every account in accounts[] must have ALL these fields
====================================================================
{
  "modern_title": "<=90 chars, lead with the experience in plain English; place/year when grounding; no clickbait, no exclamation marks>",
  "modern_summary": "<1-2 sentences, modern English, for a feed card>",
  "modern_body": "<400-3000 chars (target 120-350 words). Faithful modern retelling. Keep the original's hedges. Close with one plain sentence citing the newspaper and date.>",
  "event_date": "YYYY-MM-DD" | null,
  "location": {"city": string|null, "state": string|null},
  "category": "ghosts_hauntings" | "psychic_phenomena" | "ufos_aliens" | "cryptids" | "religion_mythology" | "esoteric_practices",
  "verbatim_quote": "<ONE striking sentence copied EXACTLY from the snippet, OCR warts and all — used for hallucination verification. Do NOT paraphrase.>",
  "genre_flags": {"fiction_suspected": bool, "advertisement": bool, "retold_folklore": bool, "period_sensitive": bool},

  // ---- editorial fields (from the consolidated-ai worker) ----
  "paradocs_narrative": "<2-3 paragraphs (\\\\n\\\\n separated), max 200 words total. Third-person editorial. Lead with a grounding sensory anchor. SETUP → EXPERIENCE → REACTION/AFTERMATH. NOT a paraphrase of modern_body — a curator's analysis.>",
  "answer_line": "<1-2 sentences, max 280 chars. Hedge voice TL;DR: 'The source describes...', 'A 19-year-old reports...'>",
  "pull_quote": "<1 sentence, max 20 words. ORIGINAL editorial line (NOT a witness quote). An analyst's observation about the evidence or implications. Must include at least one concrete sensory or physical detail. Screenshot-worthy. THIRD-PERSON.>",
  "paradocs_assessment": {
    "frames": [
      {"label": "<2-5 words, e.g. 'The Recurring Image', 'The Spatial Anchor', 'The Witness's Protocol'>", "body": "<2-4 sentences, 40-80 words. Describes a notable FEATURE of the account — NOT a hypothesis or scientific explanation. BANNED label shapes: anything ending 'Hypothesis' / 'Effect'; anything starting 'Cognitive' / 'Psychological' / 'Neurological'; anything with 'Bias' / 'Hallucination' / 'Pareidolia' / 'Confabulation' / 'Mass Hysteria'.>"}
    ],
    "open_questions": ["<1-3 inquiry-voice questions, 10-20 words each>"],
    "similar_phenomena": ["<2-3 related phenomenon names>"],
    "emotional_tone": "frightening|awe_inspiring|ambiguous|clinical|unsettling|hopeful",
    "credibility_signal": "<1 phrase, max 8 words>",
    "discovery_tags": ["<3-6 plain-language tags>"]
  },
  "witness_profile": {
    "gender": "male|female|nonbinary|unspecified",
    "age_range": "child|teen|18-29|30-49|50-69|70+|unspecified",
    "occupation_category": "<broad category or unspecified>",
    "state_at_event": "awake_alert|meditation|drowsy_falling_asleep|sleeping|driving|physical_activity|intoxicated|unspecified",
    "with_others": true|false|null,
    "prior_similar_experience": true|false|null,
    "confidence": 0.0-1.0
  },

  // ---- classifier fields (from the catalog below) ----
  "phenomenon_primary": "<slug from CATALOG below, matching account.category>" | null,
  "phenomenon_secondaries": ["<up to 2 additional slugs from CATALOG, may cross categories>"],
  "phenomenon_confidence": 0.0-1.0
}

Rules:
- One account per DISTINCT reported event; a snippet may contain several (or none).
- If genuinely unsure whether it is fiction, set fiction_suspected=true rather than omitting.
- If a reprint crediting another paper, still extract it (dedup happens elsewhere) but keep the original locale named in the story.
- For paradocs_narrative: NEVER copy/paraphrase sentences from the snippet. Echo FACTS (date, location, sequence), never source LANGUAGE. The one exception is the verbatim_quote field, which MUST be copied exactly.

====================================================================
PHENOMENON CATALOG — pick phenomenon_primary from this list (must match account.category). phenomenon_secondaries may cross categories.
====================================================================
`;

const SYSTEM_PROMPT_FOOTER = `
====================================================================
Return ONLY the JSON. No markdown fences. No commentary before or after.
`;

// ─────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  shards: string[];
  dryRun: boolean;
  limit: number;
  maxCostUsd: number;
  pollIntervalSec: number;
  maxWaitSec: number;
  outPath: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const shards: string[] = [];
  const args: CliArgs = {
    shards, dryRun: false, limit: 0, maxCostUsd: 5,
    pollIntervalSec: 30, maxWaitSec: 5400,
    outPath: SMOKETEST_DEFAULT,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--shard') shards.push(argv[++i]);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || 0;
    else if (a === '--max-cost') args.maxCostUsd = parseFloat(argv[++i]) || 5;
    else if (a === '--poll-interval') args.pollIntervalSec = parseInt(argv[++i], 10) || 30;
    else if (a === '--max-wait') args.maxWaitSec = parseInt(argv[++i], 10) || 5400;
    else if (a === '--out') args.outPath = path.resolve(process.cwd(), argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/ca-extract-consolidated.ts --shard <file|glob> [--dry-run] [--limit N] [--max-cost 5] [--out PATH]');
      process.exit(0);
    }
  }
  if (shards.length === 0) {
    console.error('Specify --shard <file|glob> (repeatable)');
    process.exit(1);
  }
  return args;
}

function expandShardSpecs(specs: string[]): string[] {
  const files: string[] = [];
  for (const spec of specs) {
    const abs = path.resolve(process.cwd(), spec);
    if (!abs.includes('*')) {
      if (fs.existsSync(abs)) files.push(abs);
      else console.warn('[ca-cons] shard not found: ' + abs);
      continue;
    }
    const dir = path.dirname(abs);
    const pat = path.basename(abs);
    const rx = new RegExp('^' + pat.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    if (!fs.existsSync(dir)) { console.warn('[ca-cons] shard dir not found: ' + dir); continue; }
    for (const f of fs.readdirSync(dir).sort()) {
      if (rx.test(f)) files.push(path.join(dir, f));
    }
  }
  return Array.from(new Set(files));
}

// ─────────────────────────────────────────────────────────────────────
// JOBS
// ─────────────────────────────────────────────────────────────────────

interface SnippetJob {
  customId: string;
  shardFile: string;
  shardIndex: number;
  snip: CaSnippet;
  baseId: string;
  sha256: string;
}

function loadJobs(shardFiles: string[], limit: number): SnippetJob[] {
  const jobs: SnippetJob[] = [];
  let g = 0;
  for (const file of shardFiles) {
    let arr: CaSnippet[];
    try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e: any) {
      console.warn('[ca-cons] unparseable shard ' + file + ': ' + (e?.message || e));
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
// VALIDATION (extends ca-extract-ingest's gates; same lexicon)
// ─────────────────────────────────────────────────────────────────────

interface ConsolidatedAccount {
  modern_title?: string;
  modern_summary?: string;
  modern_body?: string;
  event_date?: string | null;
  location?: { city?: string | null; state?: string | null };
  category?: string;
  verbatim_quote?: string;
  genre_flags?: { fiction_suspected?: boolean; advertisement?: boolean; retold_folklore?: boolean; period_sensitive?: boolean };
  paradocs_narrative?: string;
  answer_line?: string;
  pull_quote?: string;
  paradocs_assessment?: any;
  witness_profile?: any;
  phenomenon_primary?: string | null;
  phenomenon_secondaries?: string[];
  phenomenon_confidence?: number;
}

function normWords(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

function quoteContainment(quote: string, snippet: string): number {
  const qw = normWords(quote);
  const sw = normWords(snippet);
  if (qw.length < QUOTE_NGRAM) {
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

const PERIOD_TERM_LEXICON = /\b(negro(es)?|negress(es)?|colored (man|men|woman|women|people|folks?|boys?|girls?|church|preacher|preachers|congregation|servant|servants)|darke?y(s|ies)?|mammy|coon(s)?|chinam[ae]n|chinee|injun(s)?|redskin(s)?|papoose(s)?|squaw(s)?|hottentot(s)?|half-breed(s)?|savage (tribe|race|blood)|coolie(s)?|pickaninn(y|ies)|mulatto(es)?|oriental(s)?|japs?(?!an))\b/i;

interface ValidationResult { ok: boolean; reason?: string; fallback?: boolean; }

/** Returns ok=false (+ reason) when an account must be dropped. fallback=true
 *  marks missing-editorial-field cases where the 3-pass path could rescue. */
function validateAccount(acc: ConsolidatedAccount, snip: CaSnippet): ValidationResult {
  // Extract gates (same as ca-extract-ingest.ts)
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
  if (PERIOD_TERM_LEXICON.test(`${acc.modern_title} ${acc.modern_summary} ${acc.modern_body}`)) {
    acc.genre_flags = { ...gf, period_sensitive: true };
  }

  // Editorial-field presence (consolidated-only). Missing → fallback to 3-pass.
  const missing: string[] = [];
  if (!acc.paradocs_narrative || acc.paradocs_narrative.length < 50) missing.push('paradocs_narrative');
  if (!acc.answer_line || acc.answer_line.length < 10) missing.push('answer_line');
  if (!acc.pull_quote || acc.pull_quote.length < 5) missing.push('pull_quote');
  if (!acc.paradocs_assessment || typeof acc.paradocs_assessment !== 'object') missing.push('paradocs_assessment');
  if (!acc.witness_profile || typeof acc.witness_profile !== 'object') missing.push('witness_profile');
  if (missing.length > 0) return { ok: false, reason: 'missing_editorial_' + missing.join(','), fallback: true };

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// CATALOG BUILDER (phenomena from DB → inline catalog for prompt)
// ─────────────────────────────────────────────────────────────────────

interface Phen { id: string; slug: string; name: string; aliases: string[] | null; ai_summary: string | null; category: string; }

async function loadCatalog(supabase: any): Promise<{ block: string; bySlug: Map<string, Phen> }> {
  const all: Phen[] = [];
  for (const cat of ALLOWED_CATEGORIES) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from('phenomena')
        .select('id, slug, name, aliases, ai_summary, category')
        .eq('status', 'active').eq('category', cat)
        .range(from, from + 999);
      if (error) throw new Error('catalog fetch ' + cat + ': ' + error.message);
      for (const r of (data || [])) all.push(r as Phen);
      if (!data || data.length < 1000) break;
      from += 1000;
    }
  }
  const bySlug = new Map<string, Phen>();
  const lines: string[] = [];
  const byCat = new Map<string, Phen[]>();
  for (const p of all) {
    bySlug.set(p.slug, p);
    if (!byCat.has(p.category)) byCat.set(p.category, []);
    byCat.get(p.category)!.push(p);
  }
  for (const cat of ALLOWED_CATEGORIES) {
    const phs = byCat.get(cat) || [];
    if (phs.length === 0) continue;
    lines.push('--- ' + cat + ' (' + phs.length + ') ---');
    for (const p of phs) {
      const aliasStr = (p.aliases && p.aliases.length > 0) ? ' [aka: ' + p.aliases.slice(0, 4).join(', ') + ']' : '';
      const summary = (p.ai_summary || '').replace(/\n/g, ' ').substring(0, 110);
      lines.push('- ' + p.slug + ' | ' + p.name + aliasStr);
      if (summary) lines.push('    ' + summary);
    }
    lines.push('');
  }
  return { block: lines.join('\n'), bySlug };
}

// ─────────────────────────────────────────────────────────────────────
// ANTHROPIC BATCH HELPERS
// ─────────────────────────────────────────────────────────────────────

function apiKey(): string {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) { console.error('[ca-cons] ANTHROPIC_API_KEY missing — source .env.local first.'); process.exit(1); }
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
    (u.input_tokens || 0) / 1e6 * HAIKU_INPUT_LIVE +
    (u.cache_creation_input_tokens || 0) / 1e6 * HAIKU_INPUT_LIVE * 1.25 +
    (u.output_tokens || 0) / 1e6 * HAIKU_OUTPUT_LIVE;
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
// SMOKETEST RESULT SHAPE (--dry-run JSON output)
// ─────────────────────────────────────────────────────────────────────

interface SmoketestRow {
  customId: string;
  baseId: string;
  sha256: string;
  shardFile: string;
  hitTerm: string;
  paperDate: string;
  paperCity: string | null;
  paperState: string | null;
  snippetPreview: string;
  status: 'accepted' | 'rejected_by_extract' | 'rejected_by_gate' | 'parse_failed' | 'no_accounts' | 'batch_error';
  rejectionReasons: string[];
  fallbackUsed: boolean;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; cost_usd: number };
  accountsRaw: ConsolidatedAccount[];
  accountsAccepted: ConsolidatedAccount[];
}

interface Totals {
  snippets: number;
  resultRows: number;
  accepted: number;            // snippets with ≥1 accepted account
  rejected: number;            // snippets with accounts:[] or all rejected
  parseFailures: number;
  fallbackUsed: number;
  batchErrors: number;
  accountsReturned: number;
  accountsAccepted: number;
  rejectionReasons: Record<string, number>;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreate: number;
  cacheRead: number;
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  const dotenv = await import('dotenv');
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[ca-cons] Missing Supabase env. Source .env.local first.');
    process.exit(1);
  }
  apiKey();

  const files = expandShardSpecs(args.shards);
  if (files.length === 0) { console.error('[ca-cons] no shard files matched.'); process.exit(1); }
  console.log('[ca-cons] shards: ' + files.length + ' files');
  const jobs = loadJobs(files, args.limit);
  console.log('[ca-cons] ' + jobs.length + ' snippets loaded');
  if (jobs.length === 0) return;

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  console.log('[ca-cons] loading phenomenon catalog from DB...');
  const { block: catalogBlock, bySlug } = await loadCatalog(supabase);
  console.log('[ca-cons] catalog: ' + bySlug.size + ' phenomena inlined');

  const SYSTEM_PROMPT = SYSTEM_PROMPT_HEADER + catalogBlock + SYSTEM_PROMPT_FOOTER;
  const sysTokens = Math.ceil(SYSTEM_PROMPT.length / 4);
  const avgUserTokens = Math.ceil(jobs.reduce((a, j) => a + buildUserPrompt(j.snip).length, 0) / jobs.length / 4);
  const avgOutputTokens = 1800;  // consolidated output is much fatter
  const perReq =
    sysTokens / 1e6 * HAIKU_CACHE_READ_BATCH +
    avgUserTokens / 1e6 * HAIKU_INPUT_BATCH +
    avgOutputTokens / 1e6 * HAIKU_OUTPUT_BATCH;
  const estTotal = sysTokens / 1e6 * HAIKU_CACHE_WRITE_BATCH + perReq * jobs.length;
  console.log('[ca-cons] system prompt ~' + sysTokens + ' tokens (cached), avg user ~' + avgUserTokens + ' tokens');
  console.log('[ca-cons] est cost: $' + estTotal.toFixed(4) + ' (~$' + perReq.toFixed(6) + '/snippet)');
  console.log('[ca-cons] max-cost ceiling: $' + args.maxCostUsd);

  if (estTotal > args.maxCostUsd) {
    console.warn('[ca-cons] WARN: estimate ($' + estTotal.toFixed(4) + ') exceeds --max-cost ($' + args.maxCostUsd + '). Will stop early.');
  }

  const jobIndex = new Map<string, SnippetJob>();
  for (const j of jobs) jobIndex.set(j.customId, j);

  const totals: Totals = {
    snippets: jobs.length, resultRows: 0, accepted: 0, rejected: 0,
    parseFailures: 0, fallbackUsed: 0, batchErrors: 0,
    accountsReturned: 0, accountsAccepted: 0,
    rejectionReasons: {}, costUsd: 0,
    inputTokens: 0, outputTokens: 0, cacheCreate: 0, cacheRead: 0,
  };
  const smoketestRows: SmoketestRow[] = [];

  function recordRejection(reason: string): void {
    totals.rejectionReasons[reason] = (totals.rejectionReasons[reason] || 0) + 1;
  }

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
      totals.inputTokens += usage.input_tokens || 0;
      totals.outputTokens += usage.output_tokens || 0;
      totals.cacheCreate += usage.cache_creation_input_tokens || 0;
      totals.cacheRead += usage.cache_read_input_tokens || 0;

      const baseRow: SmoketestRow = {
        customId: job.customId,
        baseId: job.baseId,
        sha256: job.sha256,
        shardFile: path.basename(job.shardFile),
        hitTerm: job.snip.hitTerm,
        paperDate: job.snip.date,
        paperCity: job.snip.city,
        paperState: job.snip.state,
        snippetPreview: job.snip.snippet.slice(0, 200).replace(/\s+/g, ' '),
        status: 'no_accounts',
        rejectionReasons: [],
        fallbackUsed: false,
        usage: {
          input_tokens: usage.input_tokens || 0,
          output_tokens: usage.output_tokens || 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
          cache_read_input_tokens: usage.cache_read_input_tokens || 0,
          cost_usd: cost,
        },
        accountsRaw: [],
        accountsAccepted: [],
      };

      if (row.result?.type !== 'succeeded') {
        baseRow.status = 'batch_error';
        baseRow.rejectionReasons.push('batch_' + (row.result?.type || 'failed'));
        recordRejection('batch_' + (row.result?.type || 'failed'));
        totals.batchErrors++;
        totals.rejected++;
        smoketestRows.push(baseRow);
        continue;
      }

      const text: string = row.result.message?.content?.[0]?.text || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) {
        baseRow.status = 'parse_failed';
        baseRow.fallbackUsed = true;
        baseRow.rejectionReasons.push('no_json');
        recordRejection('no_json');
        totals.parseFailures++;
        totals.fallbackUsed++;
        totals.rejected++;
        smoketestRows.push(baseRow);
        continue;
      }
      let parsed: any;
      try { parsed = JSON.parse(m[0]); }
      catch {
        baseRow.status = 'parse_failed';
        baseRow.fallbackUsed = true;
        baseRow.rejectionReasons.push('bad_json');
        recordRejection('bad_json');
        totals.parseFailures++;
        totals.fallbackUsed++;
        totals.rejected++;
        smoketestRows.push(baseRow);
        continue;
      }
      const accounts: ConsolidatedAccount[] = Array.isArray(parsed?.accounts) ? parsed.accounts : [];
      baseRow.accountsRaw = accounts;

      if (accounts.length === 0) {
        baseRow.status = 'no_accounts';
        totals.rejected++;
        smoketestRows.push(baseRow);
        continue;
      }

      let anyAccepted = false;
      for (const acc of accounts) {
        totals.accountsReturned++;
        const v = validateAccount(acc, job.snip);
        if (v.ok) {
          totals.accountsAccepted++;
          baseRow.accountsAccepted.push(acc);
          anyAccepted = true;
        } else {
          baseRow.rejectionReasons.push(v.reason || 'unknown');
          recordRejection(v.reason || 'unknown');
          if (v.fallback) {
            baseRow.fallbackUsed = true;
            totals.fallbackUsed++;
          }
          // Slug hallucination check (record but don't reject solely on this)
          if (acc.phenomenon_primary && !bySlug.has(acc.phenomenon_primary)) {
            recordRejection('phenomenon_primary_hallucinated');
          }
        }
      }
      if (anyAccepted) {
        baseRow.status = 'accepted';
        totals.accepted++;
      } else {
        baseRow.status = 'rejected_by_gate';
        totals.rejected++;
      }
      smoketestRows.push(baseRow);
    }
  }

  async function pollBatch(batchId: string): Promise<void> {
    const start = Date.now();
    while (true) {
      if (Date.now() - start > args.maxWaitSec * 1000) {
        console.warn('[ca-cons] max wait reached; batch ' + batchId + ' left in flight.');
        return;
      }
      await new Promise(r => setTimeout(r, args.pollIntervalSec * 1000));
      const status = await getBatchStatus(batchId);
      const c = status.request_counts || {};
      console.log('[ca-cons] [+' + Math.round((Date.now() - start) / 1000) + 's] ' + batchId +
        ' status=' + status.processing_status + ' processing=' + (c.processing || 0) +
        ' succeeded=' + (c.succeeded || 0) + ' errored=' + (c.errored || 0));
      if (status.processing_status !== 'ended') continue;
      if (!status.results_url) { console.error('[ca-cons] no results_url for ' + batchId); return; }
      const rows = await fetchBatchResults(status.results_url);
      console.log('[ca-cons] got ' + rows.length + ' result rows — validating...');
      await processResults(rows);
      return;
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────
  for (let ci = 0; ci < jobs.length; ci += CHUNK_SIZE) {
    if (totals.costUsd >= args.maxCostUsd) {
      console.warn('[ca-cons] max cost reached ($' + totals.costUsd.toFixed(4) + ') — stopping before next chunk.');
      break;
    }
    const chunkJobs = jobs.slice(ci, ci + CHUNK_SIZE);
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

    if (ci === 0) {
      console.log('[ca-cons] prewarming system-prompt cache...');
      const warm = await prewarmCache(SYSTEM_PROMPT);
      if (warm.error) console.warn('[ca-cons] prewarm failed (' + warm.error + ') — proceeding cold');
      else { totals.costUsd += warm.cost; console.log('[ca-cons] prewarm OK ($' + warm.cost.toFixed(5) + ')'); }
    }

    console.log('[ca-cons] submitting chunk ' + (Math.floor(ci / CHUNK_SIZE) + 1) + '/' + Math.ceil(jobs.length / CHUNK_SIZE) + ' (' + requests.length + ' snippets)...');
    const sub = await submitBatch(requests);
    if ('error' in sub) { console.error('[ca-cons] submit failed: ' + sub.error); continue; }
    console.log('[ca-cons] batch_id: ' + sub.batch_id);
    await pollBatch(sub.batch_id);
    console.log('[ca-cons] running totals: cost=$' + totals.costUsd.toFixed(4) +
      ' accepted=' + totals.accepted + ' rejected=' + totals.rejected +
      ' parse_failures=' + totals.parseFailures + ' fallback=' + totals.fallbackUsed);
  }

  // ── Write smoketest output ─────────────────────────────────────────
  if (args.dryRun) {
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, JSON.stringify({
      totals,
      rows: smoketestRows,
      generated_at: new Date().toISOString(),
      model: HAIKU_MODEL,
      script: 'ca-extract-consolidated.ts',
    }, null, 1));
    console.log('[ca-cons] wrote smoketest JSON: ' + args.outPath);
  } else {
    console.warn('[ca-cons] LIVE (non-dry-run) INSERT PATH NOT YET IMPLEMENTED — V11.18.29 dispatch is Phase 1+2 only.');
    console.warn('[ca-cons] Once quality clears, the insert path below will be wired:');
    console.warn('[ca-cons]   - reports row, status=approved, source_type=chronicling-america');
    console.warn('[ca-cons]   - report_phenomena junction rows for primary + secondaries');
    console.warn('[ca-cons]   - paradocs_narrative_cost_log row, service=ca-extract-consolidated');
  }

  printSummary(totals);
}

function printSummary(t: Totals): void {
  console.log('\n=== ca-extract-consolidated summary ===');
  console.log('snippets loaded:        ' + t.snippets);
  console.log('result rows:            ' + t.resultRows);
  console.log('accepted (≥1 acct):     ' + t.accepted);
  console.log('rejected:               ' + t.rejected);
  console.log('parse failures:         ' + t.parseFailures);
  console.log('fallback flagged:       ' + t.fallbackUsed);
  console.log('batch errors:           ' + t.batchErrors);
  console.log('accounts returned:      ' + t.accountsReturned);
  console.log('accounts accepted:      ' + t.accountsAccepted);
  console.log('total cost:             $' + t.costUsd.toFixed(4));
  console.log('input tokens:           ' + t.inputTokens);
  console.log('output tokens:          ' + t.outputTokens);
  console.log('cache create:           ' + t.cacheCreate);
  console.log('cache read:             ' + t.cacheRead);
  const top = Object.entries(t.rejectionReasons).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (top.length) {
    console.log('top rejection reasons:');
    top.forEach(([r, c]) => console.log('  ' + c + 'x ' + r));
  }
}

main().catch(err => {
  console.error('[ca-cons] Fatal:', err);
  process.exit(1);
});
