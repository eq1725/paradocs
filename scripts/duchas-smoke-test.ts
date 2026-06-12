#!/usr/bin/env npx tsx
/**
 * Dúchas adapter smoke test — DRY RUN, no DB writes.
 *
 * Measures, against the live Dúchas API (v0.6, prerelease):
 *   1. Auth + base latency (/api/v0.6)
 *   2. The full CBÉS topic tree (/cbes/topics) — dumped to JSON so the
 *      founder can refine DUCHAS_TOPIC_RULES against real titles/IDs
 *   3. Which topics our rules match, with per-topic item counts
 *   4. Response envelope shape + pagination behaviour (unknown in prerelease docs)
 *   5. Transcript coverage (% of items with ≥1 Meitheal transcript)
 *   6. Language split (en/ga) and geo coverage (place coords vs county vs none)
 *   7. Mapped ScrapedReport samples (capped) for eyeball review
 *   8. source_url construction spot-check (3 HEAD/GET requests)
 *   9. Extrapolated full-ingest estimate (items, requests, wall-clock at rate limit)
 *
 * Usage:
 *   DUCHAS_API_KEY=xxx npx tsx scripts/duchas-smoke-test.ts [--limit 200] [--topics <id,id>] [--language en]
 *
 * Outputs:
 *   outputs/duchas-topic-tree.json
 *   outputs/duchas-smoke-test-results.json   (includes ScrapedReport samples)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { duchasFetch, matchTopics, mapCbesResponse, DUCHAS_TOPIC_RULES } from '../src/lib/ingestion/adapters/duchas';

const RATE_LIMIT_MS = 750;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function toArray(x: any): any[] {
  return Array.isArray(x) ? x : x != null ? [x] : [];
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apiKey = process.env.DUCHAS_API_KEY;
  if (!apiKey) {
    console.error('DUCHAS_API_KEY missing. Register (free) at https://www.gaois.ie/en/technology/developers/ and add to .env.local');
    process.exit(1);
  }
  const sampleLimit = parseInt(arg('limit') || '200', 10);
  const topicFilter = arg('topics')?.split(',').map(Number);
  const language = arg('language'); // undefined = both

  const outDir = path.resolve(process.cwd(), 'outputs');
  fs.mkdirSync(outDir, { recursive: true });
  const results: any = { ranAt: new Date().toISOString(), rateLimitMs: RATE_LIMIT_MS, requests: [] };

  // ---- 1. Auth + base latency --------------------------------------------
  console.log('\n=== 1. API metadata / auth check ===');
  const meta = await duchasFetch('/api'.replace('/api', ''), apiKey).catch(async () => duchasFetch('', apiKey));
  console.log(`OK — ${meta.ms}ms, ${meta.bytes} bytes`);
  results.authOk = true;
  results.baseLatencyMs = meta.ms;

  // ---- 2 + 3. Topic tree + rule matches ----------------------------------
  console.log('\n=== 2. CBÉS topic tree ===');
  await delay(RATE_LIMIT_MS);
  const topicsRes = await duchasFetch('/cbes/topics', apiKey);
  fs.writeFileSync(path.join(outDir, 'duchas-topic-tree.json'), JSON.stringify(topicsRes.json, null, 2));
  console.log(`Topic tree fetched (${topicsRes.ms}ms) → outputs/duchas-topic-tree.json`);

  let matched = matchTopics(topicsRes.json);
  if (topicFilter?.length) matched = matched.filter((t) => topicFilter.includes(t.id));
  console.log(`\nMatched ${matched.length} topics against DUCHAS_TOPIC_RULES:`);
  for (const t of matched) console.log(`  [${t.id}] ${t.path ? t.path + ' > ' : ''}${t.titleEN} (${t.titleGA || '—'}) → ${t.rule.category}`);
  results.matchedTopics = matched.map((t) => ({ id: t.id, titleEN: t.titleEN, path: t.path, category: t.rule.category }));
  if (matched.length === 0) {
    console.error('\nNo topic matched — inspect outputs/duchas-topic-tree.json and update DUCHAS_TOPIC_RULES.');
    process.exit(2);
  }

  // ---- 4–7. Pull items per topic, measure --------------------------------
  console.log('\n=== 3. Per-topic item pulls ===');
  const stats = {
    items: 0, withTranscript: 0, withTitle: 0,
    geo: { placeCoords: 0, countyCoords: 0, none: 0 },
    lang: {} as Record<string, number>,
    perTopic: [] as any[],
  };
  const samples: any[] = [];
  let envelopeShapeLogged = false;

  for (const topic of matched) {
    if (samples.length >= sampleLimit) break;
    await delay(RATE_LIMIT_MS);
    const params = new URLSearchParams({ TopicID: String(topic.id) });
    if (language) params.set('Language', language);
    let res;
    try {
      res = await duchasFetch(`/cbes?${params}`, apiKey);
    } catch (e) {
      console.warn(`  topic ${topic.id} failed: ${e instanceof Error ? e.message : e}`);
      results.requests.push({ topic: topic.id, error: String(e) });
      continue;
    }
    results.requests.push({ topic: topic.id, ms: res.ms, kb: Math.round(res.bytes / 1024) });

    if (!envelopeShapeLogged) {
      const shape = Array.isArray(res.json)
        ? `array[${res.json.length}]`
        : `object keys: ${Object.keys(res.json).join(', ')}`;
      console.log(`  Envelope shape: ${shape}`);
      results.envelopeShape = shape;
      envelopeShapeLogged = true;
    }

    // Raw item-level stats (independent of mapping)
    const volumes = Array.isArray(res.json) ? res.json : res.json?.results || res.json?.volumes || [];
    let topicItems = 0, topicTranscribed = 0;
    for (const volume of volumes) {
      const transcribed = new Set<number>();
      for (const page of toArray(volume.Pages)) for (const t of toArray(page.Transcripts)) if (t?.ItemID) transcribed.add(t.ItemID);
      for (const part of toArray(volume.Parts)) {
        for (const item of toArray(part.Items)) {
          const itemTopicIds = toArray(item.Topics).map((t: any) => t?.ID);
          if (itemTopicIds.length > 0 && !itemTopicIds.includes(topic.id)) continue;
          topicItems++;
          stats.items++;
          if (transcribed.has(item.ID)) { topicTranscribed++; stats.withTranscript++; }
          if (item.Title) stats.withTitle++;
          for (const l of toArray(item.Languages)) stats.lang[l] = (stats.lang[l] || 0) + 1;
          const hasPlaceCoords = toArray(item.LocationsIreland).some((p: any) => p?.Coordinates?.Latitude != null)
            || toArray(part?.School?.Locations).some((p: any) => p?.Coordinates?.Latitude != null);
          const hasCountyCoords = toArray(item.Counties).some((c: any) => c?.Coordinates?.Latitude != null);
          if (hasPlaceCoords) stats.geo.placeCoords++;
          else if (hasCountyCoords) stats.geo.countyCoords++;
          else stats.geo.none++;
        }
      }
    }
    stats.perTopic.push({ id: topic.id, titleEN: topic.titleEN, items: topicItems, transcribed: topicTranscribed, ms: res.ms, kb: Math.round(res.bytes / 1024) });
    console.log(`  [${topic.id}] ${topic.titleEN}: ${topicItems} items, ${topicTranscribed} transcribed (${res.ms}ms, ${Math.round(res.bytes / 1024)}KB)`);

    // Mapped samples for eyeball review
    const mapped = mapCbesResponse(res.json, topic, sampleLimit - samples.length);
    samples.push(...mapped);
  }

  // ---- 8. source_url spot-check ------------------------------------------
  console.log('\n=== 4. source_url spot-check ===');
  const urlChecks: any[] = [];
  for (const r of samples.slice(0, 3)) {
    await delay(RATE_LIMIT_MS);
    try {
      const res = await fetch(r.source_url, { method: 'GET', headers: { 'User-Agent': 'Paradocs-Ingest/1.0' }, redirect: 'follow' });
      urlChecks.push({ url: r.source_url, status: res.status });
      console.log(`  ${res.status} ${r.source_url}`);
    } catch (e) {
      urlChecks.push({ url: r.source_url, error: String(e) });
      console.log(`  FAIL ${r.source_url}: ${e}`);
    }
  }
  results.urlChecks = urlChecks;

  // ---- 9. Summary + extrapolation ----------------------------------------
  const avgMs = results.requests.filter((r: any) => r.ms).reduce((a: number, r: any) => a + r.ms, 0) / Math.max(1, results.requests.filter((r: any) => r.ms).length);
  const totalMatchedItems = stats.perTopic.reduce((a, t) => a + t.items, 0);
  const fullRequests = matched.length; // one request per topic (pre-pagination knowledge)
  const fullWallClockMin = (fullRequests * (avgMs + RATE_LIMIT_MS)) / 60_000;

  results.stats = stats;
  results.summary = {
    sampledItems: stats.items,
    transcriptCoveragePct: stats.items ? Math.round((100 * stats.withTranscript) / stats.items) : 0,
    titleCoveragePct: stats.items ? Math.round((100 * stats.withTitle) / stats.items) : 0,
    languageSplit: stats.lang,
    geoSplit: stats.geo,
    avgRequestMs: Math.round(avgMs),
    estimate: {
      note: 'Pre-pagination estimate; per-topic counts may be truncated by an undocumented page size — compare counts against duchas.ie topic pages before trusting.',
      matchedTopicItems: totalMatchedItems,
      requestsForFullPass: fullRequests,
      wallClockMinutesAtRateLimit: Math.round(fullWallClockMin),
      classifierCostUsd: `${(totalMatchedItems * 0.0006).toFixed(2)}–${(totalMatchedItems * 0.001).toFixed(2)} (facts-only; topic mapping may make this ~$0)`,
    },
  };
  results.samples = samples.slice(0, 25);

  fs.writeFileSync(path.join(outDir, 'duchas-smoke-test-results.json'), JSON.stringify(results, null, 2));

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(results.summary, null, 2));
  console.log(`\nFull results + ${results.samples.length} mapped samples → outputs/duchas-smoke-test-results.json`);
  console.log('Topic tree → outputs/duchas-topic-tree.json');
}

main().catch((e) => {
  console.error('\nSmoke test failed:', e);
  process.exit(1);
});
