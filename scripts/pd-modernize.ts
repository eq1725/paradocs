#!/usr/bin/env npx tsx
/**
 * PD-text modernization pass — parameterized clone of scripts/spr-modernize.ts
 * (founder-approved pattern, June 11, 2026) driven by the PD_SOURCES registry.
 *
 * For every reports row with source_type=<cfg.sourceType> (--source <key>):
 *   1. Haiku rewrites the period deposition into a modern documentary-register
 *      retelling (Gaia voice rules) → becomes `description`.
 *   2. Modern title (≤90 chars) → `title`; modern 1–2 sentence card summary → `summary`.
 *   3. Event date re-derived: the date the EXPERIENCE occurred, never the
 *      letter/deposition date; must be ≤ the work's publication year
 *      (config.published); null when indeterminable.
 *   4. Footnote interleaves, editorial cross-references, and bleed-over from
 *      the following case are excluded from the retelling.
 *   5. The pre-modernization period text is preserved at metadata.original_text
 *      (public domain — we hold it outright; raw OCR sha256 already in metadata).
 *   6. Country canonicalization: England/Scotland/Wales → United Kingdom.
 *
 * Idempotent: rows with metadata.modernized=true are skipped, so chunked
 * re-runs under the sandbox's 45s limit are safe.
 *
 * Usage:
 *   npx tsx scripts/pd-modernize.ts --source flammarion-unknown --dry-run --limit 3
 *   npx tsx scripts/pd-modernize.ts --source myers-human-personality --limit 40
 *   npx tsx scripts/pd-modernize.ts --source barrett                 # all remaining
 * Flags: --source KEY (required), --limit N, --dry-run, --concurrency N
 *        (default 5), --max-cost USD (default 12), --id <original_report_id>
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { PD_SOURCES, PdSourceConfig } from '../src/lib/ingestion/pd-sources.config';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_IN_PER_MTOK = 1.0;
const HAIKU_OUT_PER_MTOK = 5.0;

interface CliArgs { source: string | null; dryRun: boolean; limit: number; concurrency: number; maxCostUsd: number; id: string | null; }
function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const flag = (n: string, d: string | null = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  return {
    source: flag('--source', null),
    dryRun: argv.includes('--dry-run'),
    limit: parseInt(flag('--limit', '100000')!),
    concurrency: parseInt(flag('--concurrency', '5')!),
    maxCostUsd: parseFloat(flag('--max-cost', '12')!),
    id: flag('--id', null),
  };
}

function publishedCutoff(cfg: PdSourceConfig): string {
  return cfg.published + '-12-31';
}

function buildSystemPrompt(cfg: PdSourceConfig): string {
  const work = cfg.workTitle;
  const year = cfg.published;
  return `You are an editor for Paradocs, a documentary archive of anomalous experiences. You retell historical case depositions — first-hand accounts collected by ${cfg.authors} — for a modern general audience.

Given one case text from "${work}" (${year}), output ONLY JSON:

{
  "title": string,        // ≤90 chars. Documentary register: lead with the qualitative core of the experience in plain English. Specific, restrained, no clickbait, no "Case N", no exclamation marks. Include a place or year when it grounds the story.
  "summary": string,      // 1-2 sentences, modern English, for a feed card. What happened, to whom (role not full name is fine), and the corroborating beat if there is one.
  "body": string,         // 150-400 words. Faithful modern retelling in documentary register. Preserve ALL substantive facts: who (keep names as given, incl. initials/redactions like "Mrs. W."), where, when, what was experienced, physical details, other witnesses, and the corroboration/coincidence (e.g. the death learned of later). Present testimony as testimony: "she wrote", "he reported". Where the original hedges, keep the hedge. Quote a short striking phrase from the original verbatim (in quotes) when one exists. Close with one plain sentence situating it: ${cfg.modernizeCloser}. NEVER invent details. EXCLUDE: footnotes and cross-references (e.g. "Compare cases 659 and 670", "see p. 190"), editorial apparatus, page artifacts, and any trailing text that clearly begins the NEXT case (e.g. "The next case is from...", a new "From Mr. X..." attribution after the narrative has concluded).
  "event_date": string|null,   // YYYY-MM-DD. The date the EXPERIENCE occurred — never the date the letter/deposition was written. A date at the head of a letter is the LETTER date; if the narrative says the experience was "in June, 1867" or "12 years ago", derive from that. Use -01 for unknown month/day. Must be <= ${publishedCutoff(cfg)} (the work was published in ${year}). null if genuinely indeterminable.
  "event_date_precision": "exact"|"month"|"year"|"decade"|"estimated"|"unknown",
  "date_basis": string,   // one short clause: where the date came from, e.g. "narrative states 3rd June 1867", "derived: letter 1884 minus 'twelve years ago'", "indeterminable"
  "bleed_over_removed": boolean,  // true if you excluded trailing next-case text
  "footnotes_removed": boolean
}`;
}

async function haiku(caseText: string, systemPrompt: string, apiKey: string): Promise<{ json: any; costUsd: number }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: MODEL, max_tokens: 1500, temperature: 0.2, system: systemPrompt,
          messages: [{ role: 'user', content: caseText.slice(0, 14000) }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (resp.status === 429 || resp.status >= 500) { await new Promise(r => setTimeout(r, 1500 * 2 ** attempt)); continue; }
      if (!resp.ok) throw new Error(`anthropic ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      const data: any = await resp.json();
      const text = data.content?.[0]?.text || '';
      const costUsd = (data.usage.input_tokens * HAIKU_IN_PER_MTOK + data.usage.output_tokens * HAIKU_OUT_PER_MTOK) / 1e6;
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('no JSON in response');
      return { json: JSON.parse(m[0]), costUsd };
    } catch (e: any) {
      clearTimeout(timer);
      if (attempt === 3 || (e?.message && !/abort|429|5\d\d|no JSON|Unexpected/i.test(e.message))) throw e;
      await new Promise(r => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  throw new Error('unreachable');
}

function validate(out: any, cfg: PdSourceConfig): string | null {
  if (!out.title || out.title.length > 120) return 'bad title';
  if (!out.body || out.body.length < 500 || out.body.length > 4500) return `bad body length ${out.body?.length}`;
  if (!out.summary || out.summary.length > 600) return 'bad summary';
  if (out.event_date != null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(out.event_date)) return 'bad date format';
    // Publication-year ceiling: an experience cannot postdate the book.
    if (out.event_date > publishedCutoff(cfg) || out.event_date < '1500-01-01') return `implausible date ${out.event_date}`;
  }
  return null;
}

async function main() {
  const args = parseArgs();
  if (!args.source || !PD_SOURCES[args.source]) {
    console.error('Usage: npx tsx scripts/pd-modernize.ts --source <key> [flags]');
    console.error('Known sources: ' + Object.keys(PD_SOURCES).join(', '));
    process.exit(1);
  }
  const cfg = PD_SOURCES[args.source];
  const systemPrompt = buildSystemPrompt(cfg);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1); }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Fetch unmodernized rows for this source (paged).
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('reports')
      .select('id,original_report_id,title,summary,description,event_date,event_date_precision,country,metadata')
      .eq('source_type', cfg.sourceType).range(from, from + 999).order('original_report_id');
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  let todo = rows.filter(r => r.metadata?.modernized !== true);
  if (args.id) todo = todo.filter(r => r.original_report_id === args.id);
  todo = todo.slice(0, args.limit);
  console.log(`[pd-modernize:${cfg.key}] ${rows.length} ${cfg.sourceType} rows; ${rows.filter(r => r.metadata?.modernized === true).length} already done; processing ${todo.length}${args.dryRun ? ' (DRY RUN)' : ''}`);

  let cost = 0, done = 0, failed = 0, dateChanged = 0, bleed = 0;
  const errors: string[] = [];

  async function processRow(r: any) {
    if (cost >= args.maxCostUsd) return;
    try {
      const { json: out, costUsd } = await haiku(r.description, systemPrompt, apiKey!);
      cost += costUsd;
      const bad = validate(out, cfg);
      if (bad) { failed++; errors.push(`${r.original_report_id}: ${bad}`); return; }
      if (out.event_date !== r.event_date) dateChanged++;
      if (out.bleed_over_removed) bleed++;

      if (args.dryRun) {
        console.log(`\n===== ${r.original_report_id} ($${costUsd.toFixed(4)})`);
        console.log('OLD title:', r.title);
        console.log('NEW title:', out.title);
        console.log('OLD date :', r.event_date, '| NEW date:', out.event_date, `(${out.event_date_precision}; ${out.date_basis})`);
        console.log('summary  :', out.summary);
        console.log('body     :', out.body);
        done++; return;
      }

      const newMeta = Object.assign({}, r.metadata || {}, {
        modernized: true,
        modernize_model: MODEL,
        modernized_at: new Date().toISOString(),
        original_text: r.description,
        pre_modernize_title: r.title,
        pre_modernize_event_date: r.event_date,
        date_basis: out.date_basis,
        bleed_over_removed: !!out.bleed_over_removed,
        footnotes_removed: !!out.footnotes_removed,
      });
      const update: Record<string, any> = {
        title: out.title.slice(0, 200),
        summary: out.summary,
        description: out.body,
        event_date: out.event_date,
        event_date_precision: out.event_date ? out.event_date_precision : 'unknown',
        metadata: newMeta,
      };
      if (r.country === 'England' || r.country === 'Scotland' || r.country === 'Wales') update.country = 'United Kingdom';
      const { error: upErr } = await supabase.from('reports').update(update).eq('id', r.id);
      if (upErr) { failed++; errors.push(`${r.original_report_id}: db ${upErr.message}`); return; }
      done++;
    } catch (e: any) {
      failed++; errors.push(`${r.original_report_id}: ${e?.message || e}`.slice(0, 160));
    }
  }

  // Simple concurrency pool
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(args.concurrency, todo.length) }, async () => {
    while (i < todo.length && cost < args.maxCostUsd) { const r = todo[i++]; await processRow(r); }
  }));

  // Cost log (live mode only)
  if (!args.dryRun && cost > 0) {
    // NB: paradocs_narrative_cost_log has no 'notes' column (discovered in the
    // June 11 sweep — inserts with it fail silently against the schema cache).
    await supabase.from('paradocs_narrative_cost_log').insert({ service: 'pd-modernize', cost_usd: cost, report_id: null, model: MODEL + ' (pd-modernize:' + cfg.key + ')' }).then(({ error }) => {
      if (error) console.warn(`[pd-modernize:${cfg.key}] cost log insert failed:`, error.message);
    });
  }

  console.log(`\n[pd-modernize:${cfg.key}] done=${done} failed=${failed} dateChanged=${dateChanged} bleedRemoved=${bleed} cost=$${cost.toFixed(2)}`);
  if (errors.length) console.log('errors:\n  ' + errors.slice(0, 10).join('\n  '));
  console.log(`remaining: ${todo.length - done - failed > 0 ? todo.length - done - failed : 0} of this batch; rerun to continue (idempotent via metadata.modernized).`);
}

main().catch(e => { console.error(e); process.exit(1); });
