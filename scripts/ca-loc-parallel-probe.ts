/**
 * ca-loc-parallel-probe.ts — V11.18.31
 *
 * Empirical LoC (loc.gov / Chronicling America) concurrency probe.
 *
 * WHY THIS EXISTS
 *   ca-harvest.ts is a strictly SEQUENTIAL single-stream fetcher: every
 *   request awaits the previous one, spaced by --rate-ms (default 3000ms).
 *   Its throughput ceiling is therefore set by per-request LATENCY, not by
 *   the rate gate — and Chronicling America OCR ("full_text=1") renders can
 *   take 20-40s server-side on a cold page. At one-in-flight that's ~2-3
 *   pages/min no matter how low --rate-ms goes. The only way to hide that
 *   latency is to keep several requests IN FLIGHT at once (concurrency P).
 *
 *   Published LoC etiquette is ~20 requests/min/IP, and they ban crawlers
 *   that push. So before we run a multi-day unattended harvest at P>1, we
 *   need DATA: at what concurrency does loc.gov start returning 429/503?
 *   This probe ramps P=1 → 2 → 3 (configurable), measures the 429/503 rate
 *   and latency at each level, and recommends the highest SAFE concurrency
 *   plus an estimated wall-clock for the full 1898-1928 tranche.
 *
 * SAFETY
 *   - Hits the SAME endpoints + User-Agent as ca-harvest.ts (no new load
 *     signature loc.gov hasn't already seen from us).
 *   - Aborts ramping the moment a level's error rate crosses --abort-rate,
 *     then cools down. It never escalates past a level that misbehaved.
 *   - Total request budget is tiny (levels × --per-level + a few searches).
 *   - Read-only: no DB, no AI, no writes except the OCR disk cache that
 *     ca-harvest.ts already populates (shared, content-addressed, safe).
 *
 * USAGE (run on the OPERATOR TERMINAL — this exceeds the 45s sandbox budget)
 *   set -a; source .env.local; set +a   # not strictly needed (no DB/AI)
 *   npx tsx scripts/ca-loc-parallel-probe.ts                 # default ramp
 *   npx tsx scripts/ca-loc-parallel-probe.ts --quick         # 3-request smoke
 *   npx tsx scripts/ca-loc-parallel-probe.ts --levels 1,2,3,4 --per-level 16
 *   npx tsx scripts/ca-loc-parallel-probe.ts --term "sea serpent" --year 1898
 *
 * FLAGS
 *   --term <phrase>     Search phrase to source pages from (default "haunted house").
 *   --year <Y>          Year to search (default 1898 — the smoke-test year).
 *   --levels <csv>      Concurrency levels to ramp through (default "1,2,3").
 *   --per-level <n>     OCR fetches measured per level (default 12).
 *   --abort-rate <f>    Error fraction (429/503/timeout) that aborts ramp (default 0.20).
 *   --cooldown-sec <n>  Pause between levels, lets loc.gov forget us (default 20).
 *   --timeout-ms <n>    Per-request abort deadline (default 90000, matches harvester).
 *   --quick             One search + 3 OCR fetches at P=1 only (endpoint smoke).
 */

const USER_AGENT = 'Paradocs-Ingest/1.0 (PD newspaper research)';
const SEARCH_BASE = 'https://www.loc.gov/collections/chronicling-america/';

interface Args {
  term: string;
  year: number;
  levels: number[];
  perLevel: number;
  abortRate: number;
  cooldownSec: number;
  timeoutMs: number;
  quick: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const flag = (n: string, d: string | null = null) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : d;
  };
  const quick = argv.includes('--quick');
  return {
    term: flag('--term', 'haunted house')!,
    year: parseInt(flag('--year', '1898')!, 10),
    levels: quick ? [1] : (flag('--levels', '1,2,3')!).split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean),
    perLevel: quick ? 3 : parseInt(flag('--per-level', '12')!, 10),
    abortRate: parseFloat(flag('--abort-rate', '0.20')!),
    cooldownSec: parseInt(flag('--cooldown-sec', '20')!, 10),
    timeoutMs: parseInt(flag('--timeout-ms', '90000')!, 10),
    quick,
  };
}

interface FetchResult {
  ok: boolean;
  status: number;        // HTTP status, or 0 for network/timeout error
  kind: 'ok' | 'rate_limit' | 'server_error' | 'timeout' | 'network' | 'parse';
  latencyMs: number;
  bytes: number;
}

async function timedFetch(url: string, timeoutMs: number): Promise<FetchResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' },
      signal: controller.signal,
    });
    const body = await resp.text(); // body read is part of latency (cold renders stream slowly)
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    if (resp.status === 429) return { ok: false, status: 429, kind: 'rate_limit', latencyMs, bytes: body.length };
    if (resp.status >= 500) return { ok: false, status: resp.status, kind: 'server_error', latencyMs, bytes: body.length };
    if (!resp.ok) return { ok: false, status: resp.status, kind: 'network', latencyMs, bytes: body.length };
    return { ok: true, status: resp.status, kind: 'ok', latencyMs, bytes: body.length };
  } catch (e: any) {
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    const aborted = /abort/i.test(String(e?.message || e));
    return { ok: false, status: 0, kind: aborted ? 'timeout' : 'network', latencyMs, bytes: 0 };
  }
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

/** Pull a list of OCR endpoints (word_coordinates_url + full_text=1) from one search page. */
async function sourcePageUrls(term: string, year: number, want: number, timeoutMs: number): Promise<string[]> {
  const url = buildSearchUrl(term, year, 1, 100);
  console.log('[probe] sourcing pages: search "' + term + '" ' + year + ' …');
  const r = await timedFetch(url, timeoutMs);
  if (!r.ok) {
    throw new Error('seed search failed: HTTP ' + r.status + ' (' + r.kind + ') after ' + r.latencyMs + 'ms');
  }
  // timedFetch discards the body; refetch the JSON we need (one extra request, fine).
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' } });
  const data: any = await resp.json();
  const results: any[] = Array.isArray(data.results) ? data.results : [];
  const urls: string[] = [];
  for (const res of results) {
    const wc = typeof res.word_coordinates_url === 'string' ? res.word_coordinates_url : null;
    if (!wc) continue;
    urls.push(wc + (wc.includes('?') ? '&' : '?') + 'full_text=1');
    if (urls.length >= want) break;
  }
  if (urls.length === 0) throw new Error('no word_coordinates_url found in search results for "' + term + '" ' + year);
  console.log('[probe] sourced ' + urls.length + ' OCR endpoints (search latency ' + r.latencyMs + 'ms)');
  return urls;
}

/** Run `urls` through a concurrency-P pool, return per-request results. */
async function runAtConcurrency(urls: string[], P: number, timeoutMs: number): Promise<FetchResult[]> {
  const out: FetchResult[] = [];
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= urls.length) return;
      const r = await timedFetch(urls[i], timeoutMs);
      out.push(r);
      const tag = r.ok ? 'ok' : r.kind.toUpperCase();
      process.stdout.write('    [' + tag + ' ' + r.latencyMs + 'ms' + (r.status ? ' http' + r.status : '') + ']\n');
    }
  }
  await Promise.all(Array.from({ length: Math.min(P, urls.length) }, () => worker()));
  return out;
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))];
}

interface LevelStat {
  P: number;
  n: number;
  errors: number;
  rateLimit: number;
  serverErr: number;
  timeout: number;
  errRate: number;
  p50: number;
  p95: number;
  wallSec: number;
  reqPerMin: number;
  aborted: boolean;
}

function summarizeLevel(P: number, results: FetchResult[], wallMs: number, abortRate: number): LevelStat {
  const lat = results.map(r => r.latencyMs);
  const rateLimit = results.filter(r => r.kind === 'rate_limit').length;
  const serverErr = results.filter(r => r.kind === 'server_error').length;
  const timeout = results.filter(r => r.kind === 'timeout').length;
  const network = results.filter(r => r.kind === 'network').length;
  const errors = rateLimit + serverErr + timeout + network;
  const errRate = results.length ? errors / results.length : 1;
  const wallSec = wallMs / 1000;
  return {
    P, n: results.length, errors, rateLimit, serverErr, timeout,
    errRate, p50: pct(lat, 50), p95: pct(lat, 95),
    wallSec, reqPerMin: wallSec > 0 ? (results.length / wallSec) * 60 : 0,
    aborted: errRate >= abortRate,
  };
}

async function main() {
  const args = parseArgs();
  console.log('=== ca-loc-parallel-probe (V11.18.31) ===');
  console.log('term="' + args.term + '" year=' + args.year +
    ' | levels=[' + args.levels.join(',') + '] per-level=' + args.perLevel +
    ' abort-rate=' + args.abortRate + ' timeout=' + args.timeoutMs + 'ms' +
    (args.quick ? ' | QUICK SMOKE' : ''));
  console.log('endpoint=' + SEARCH_BASE + '  UA="' + USER_AGENT + '"\n');

  // Source enough distinct OCR endpoints to cover the largest level without reuse.
  const want = Math.max(...args.levels) * args.perLevel + args.perLevel;
  let urls: string[];
  try {
    urls = await sourcePageUrls(args.term, args.year, want, args.timeoutMs);
  } catch (e: any) {
    console.error('\n[probe] FATAL: ' + (e?.message || e));
    console.error('[probe] If this is a 429/503, loc.gov may already be throttling this IP — wait and retry.');
    process.exit(1);
  }

  const stats: LevelStat[] = [];
  let urlCursor = 0;
  for (const P of args.levels) {
    // Use a FRESH slice of URLs per level so warm-cache hits don't flatter higher P.
    const slice: string[] = [];
    for (let k = 0; k < args.perLevel; k++) {
      slice.push(urls[urlCursor % urls.length]);
      urlCursor++;
    }
    console.log('\n--- level P=' + P + ' : ' + slice.length + ' OCR fetches, ' + P + ' in flight ---');
    const t0 = Date.now();
    const results = await runAtConcurrency(slice, P, args.timeoutMs);
    const stat = summarizeLevel(P, results, Date.now() - t0, args.abortRate);
    stats.push(stat);
    console.log('  P=' + P + ': errRate=' + (stat.errRate * 100).toFixed(0) + '% (429:' + stat.rateLimit +
      ' 5xx:' + stat.serverErr + ' timeout:' + stat.timeout + ') | p50=' + stat.p50 + 'ms p95=' + stat.p95 +
      'ms | throughput=' + stat.reqPerMin.toFixed(1) + ' req/min');
    if (stat.aborted) {
      console.log('  ⚠ P=' + P + ' crossed abort-rate (' + (args.abortRate * 100).toFixed(0) + '%) — STOPPING ramp here.');
      break;
    }
    if (P !== args.levels[args.levels.length - 1] && !args.quick) {
      console.log('  cooldown ' + args.cooldownSec + 's before next level…');
      await new Promise(r => setTimeout(r, args.cooldownSec * 1000));
    }
  }

  // ── Recommendation ──────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  console.log('P   n    429  5xx  to   errRate  p50ms   p95ms   req/min');
  for (const s of stats) {
    console.log(
      String(s.P).padEnd(4) + String(s.n).padEnd(5) + String(s.rateLimit).padEnd(5) +
      String(s.serverErr).padEnd(5) + String(s.timeout).padEnd(5) +
      (s.errRate * 100).toFixed(0).padStart(5) + '%  ' +
      String(s.p50).padStart(6) + '  ' + String(s.p95).padStart(6) + '  ' +
      s.reqPerMin.toFixed(1).padStart(7));
  }

  const safe = stats.filter(s => !s.aborted && s.errRate < args.abortRate);
  const best = safe.length ? safe.reduce((a, b) => (b.reqPerMin > a.reqPerMin ? b : a)) : null;

  console.log('\n=== RECOMMENDATION ===');
  if (args.quick) {
    console.log('Quick smoke complete — endpoint + parsing OK. Re-run without --quick for the full ramp.');
  } else if (!best) {
    console.log('No concurrency level stayed under the abort threshold. Stay at P=1 (single-stream harvester,');
    console.log('rate-ms=3000) and consider re-probing off-peak. loc.gov may be throttling this IP today.');
  } else {
    const reqPerApproved = 1; // ~1 search+OCR roundtrip dominated by OCR fetch
    // Tranche envelope: ~50k approved. Throughput is the OCR-fetch bottleneck.
    const targetApproved = 50000;
    // Rough: 1 OCR fetch ≈ 1 candidate snippet; approval ratio folded into the 50k target already.
    const hours = (targetApproved * reqPerApproved) / best.reqPerMin / 60;
    console.log('Safe concurrency: P=' + best.P + '  (' + best.reqPerMin.toFixed(1) + ' req/min, errRate ' +
      (best.errRate * 100).toFixed(0) + '%, p95 ' + best.p95 + 'ms)');
    console.log('Recommended harvester config:');
    console.log('  - run ' + best.P + ' year-partitioned worker(s) via scripts/ca-harvest-parallel.sh (P=' + best.P + ')');
    console.log('  - keep per-worker --rate-ms 3000 (aggregate ≈ ' + (best.P * 20) + ' req/min target ceiling)');
    console.log('  - VERY rough full-tranche OCR wall-clock at this throughput: ~' + hours.toFixed(0) +
      'h (' + (hours / 24).toFixed(1) + ' days) — refine against real approval yield.');
    if (best.P === 1) {
      console.log('  NOTE: only P=1 was safe. Parallel fan-out gives no benefit today; run the single-stream daemon.');
    }
  }
  console.log('\nDone. No data written (OCR disk cache shared with ca-harvest.ts).');
}

main().catch(e => { console.error('[probe] unhandled:', e); process.exit(1); });
