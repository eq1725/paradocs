// Dúchas (National Folklore Collection, Ireland) Adapter — Schools' Collection (CBÉS)
//
// FACTS+LINK ONLY. Dúchas data is © National Folklore Collection, UCD,
// licensed CC BY-NC 4.0. Paradocs is commercial, so this adapter ingests
// ONLY the uncopyrightable fact layer: title, topic, place, coordinates,
// collection-era date, school, language — plus attribution and a deep link
// to read the story on duchas.ie. It NEVER stores transcript text
// (`page.Transcripts[].Text`) or the `Extract` snippet, and it NEVER stores
// the names/ages/addresses of informants or collectors (1930s schoolchildren
// — PII posture: roles and counts only).
//
// Clean-room narrative enrichment is a SEPARATE, flag-gated script
// (scripts/duchas-narrative-enrich.ts) pending written permission from
// NFC/Gaois — same pattern as the erowid adapter. Do not wire it here.
//
// API: https://docs.gaois.ie/en/data/duchas/v0.6/api (prerelease v0.6)
// Auth: X-Api-Key header. Key from https://www.gaois.ie/en/technology/developers/
// Attribution (required): "Folklore data by Dúchas © National Folklore
// Collection, UCD and licensed under CC BY-NC 4.0."

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

const API_BASE = 'https://www.duchas.ie/api/v0.6';
const ATTRIBUTION =
  'Folklore data by Dúchas © National Folklore Collection, UCD and licensed under CC BY-NC 4.0.';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Topic → Paradocs taxonomy mapping
//
// CBÉS topics are hierarchical (Schools' Collection Subject List,
// /cbes/topics, fields ID/TitleEN/TitleGA/SubTopics). We don't hardcode
// TopicIDs — they're resolved at runtime by matching TitleEN against these
// rules. Run scripts/duchas-smoke-test.ts to dump the full topic tree and
// refine this list against real titles/IDs.
// ---------------------------------------------------------------------------

export interface TopicRule {
  /** Case-insensitive match against topic TitleEN */
  pattern: RegExp;
  category: string; // PhenomenonCategory
  tags: string[];
  /** Optional deterministic phenomenon_types slug (engine resolvePhenomenonTypeBySlug) */
  experienceTypeSlug?: string;
}

export const DUCHAS_TOPIC_RULES: TopicRule[] = [
  { pattern: /ghost|apparition|haunt/i, category: 'ghosts_hauntings', tags: ['folklore', 'ghost'], experienceTypeSlug: 'ghost' },
  { pattern: /banshee/i, category: 'ghosts_hauntings', tags: ['folklore', 'banshee'], experienceTypeSlug: 'banshee' },
  { pattern: /fairy|fairies|s[ií]dhe|leprechaun|changeling/i, category: 'religion_mythology', tags: ['folklore', 'fairy'] },
  { pattern: /p[úu]ca|pooka|mermaid|merrow|supernatural being/i, category: 'religion_mythology', tags: ['folklore', 'supernatural-being'] },
  { pattern: /supernatural|otherworld|afterworld|after-?life/i, category: 'religion_mythology', tags: ['folklore', 'supernatural'] },
  { pattern: /witch|charm|spell|piseog|pishogue/i, category: 'esoteric_practices', tags: ['folklore', 'witchcraft'] },
  { pattern: /cure|folk medicine|herbs?\b/i, category: 'esoteric_practices', tags: ['folklore', 'folk-cure'] },
  { pattern: /holy well|patron|pilgrimage|religious (story|tale)/i, category: 'religion_mythology', tags: ['folklore', 'religious'] },
  { pattern: /strange animal|mysterious (animal|creature)/i, category: 'cryptids', tags: ['folklore', 'creature'] },
];

interface MatchedTopic {
  id: number;
  titleEN: string;
  titleGA?: string;
  rule: TopicRule;
  /** Path of ancestor titles, e.g. "Beliefs > The Supernatural" */
  path: string;
}

// Flatten the hierarchical /cbes/topics tree and match against rules.
export function matchTopics(topicsJson: any, rules: TopicRule[] = DUCHAS_TOPIC_RULES): MatchedTopic[] {
  const matched: MatchedTopic[] = [];
  const walk = (node: any, path: string[]) => {
    if (!node || typeof node !== 'object') return;
    const title = node.TitleEN || '';
    if (node.ID && title) {
      const rule = rules.find((r) => r.pattern.test(title));
      if (rule) {
        matched.push({
          id: node.ID,
          titleEN: title,
          titleGA: node.TitleGA,
          rule,
          path: path.join(' > '),
        });
      }
    }
    const children = node.SubTopics;
    const childArray = Array.isArray(children) ? children : children ? [children] : [];
    for (const child of childArray) walk(child, [...path, title].filter(Boolean));
  };
  const roots = Array.isArray(topicsJson) ? topicsJson : topicsJson?.results || topicsJson?.topics || [topicsJson];
  for (const root of roots) walk(root, []);
  return matched;
}

// ---------------------------------------------------------------------------
// Fetch with auth, polite rate limiting, and backoff
// ---------------------------------------------------------------------------

export async function duchasFetch(
  path: string,
  apiKey: string,
  opts: { retries?: number; rateLimitMs?: number } = {}
): Promise<{ json: any; status: number; ms: number; bytes: number }> {
  const retries = opts.retries ?? 3;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  for (let attempt = 0; ; attempt++) {
    const start = Date.now();
    const res = await fetch(url, {
      headers: {
        'X-Api-Key': apiKey,
        Accept: 'application/json',
        'User-Agent': 'Paradocs-Ingest/1.0 (folklore archive research; facts+attribution indexing)',
      },
    });
    const ms = Date.now() - start;

    if (res.status === 401) {
      throw new Error('[Duchas] 401 UNAUTHORISED — check DUCHAS_API_KEY (https://www.gaois.ie/en/technology/developers/)');
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const backoff = Math.min(30_000, 2_000 * 2 ** attempt);
      console.warn(`[Duchas] ${res.status} on ${url} — backing off ${backoff}ms (attempt ${attempt + 1}/${retries})`);
      await delay(backoff);
      continue;
    }
    if (!res.ok) {
      throw new Error(`[Duchas] HTTP ${res.status} on ${url}`);
    }
    const text = await res.text();
    return { json: JSON.parse(text), status: res.status, ms, bytes: text.length };
  }
}

// ---------------------------------------------------------------------------
// CBÉS payload → ScrapedReport mapping (facts only)
// ---------------------------------------------------------------------------

interface ItemContext {
  volume: any;
  part: any;
  item: any;
  matchedTopic?: MatchedTopic;
  /** ItemIDs that have at least one community transcript on this volume's pages */
  transcribedItemIds: Set<number>;
}

function firstLocation(item: any, part: any): { place?: any; county?: any; precision: 'city' | 'region' | null; synthetic: boolean } {
  // Prefer the item's own story locations, then the school's location.
  const itemLocs = toArray(item.LocationsIreland);
  const schoolLocs = toArray(part?.School?.Locations);
  const place = itemLocs[0] || schoolLocs[0];
  if (place?.Coordinates?.Latitude != null) {
    return { place, county: toArray(place.Counties)[0], precision: 'city', synthetic: false };
  }
  const county = toArray(item.Counties)[0] || (place ? toArray(place.Counties)[0] : undefined);
  if (county?.Coordinates?.Latitude != null) {
    return { place, county, precision: 'region', synthetic: true };
  }
  return { place, county, precision: null, synthetic: false };
}

function toArray(x: any): any[] {
  return Array.isArray(x) ? x : x != null ? [x] : [];
}

export function mapItemToReport(ctx: ItemContext): ScrapedReport | null {
  const { volume, part, item, matchedTopic, transcribedItemIds } = ctx;
  if (!item?.ID) return null;

  const { place, county, precision, synthetic } = firstLocation(item, part);
  const placeName: string | undefined = place?.NameEN || place?.NameGA;
  const countyName: string | undefined = county?.QualifiedNameEN || county?.NameEN;
  const schoolName: string | undefined = part?.School?.Name;
  const languages: string[] = toArray(item.Languages);
  const hasTranscript = transcribedItemIds.has(item.ID);

  const topicEN = matchedTopic?.titleEN || toArray(item.Topics)[0]?.TitleEN || 'Folklore';
  const rule = matchedTopic?.rule;

  // Title: item title if present; otherwise a factual constructed title.
  // We deliberately do NOT fall back to `Extract` (NC-licensed text).
  const title =
    (item.Title && String(item.Title).trim()) ||
    `${topicEN}${placeName ? ` — ${placeName}` : countyName ? ` — ${countyName}` : ''} (Schools' Collection)`;

  // Description: our own words, facts only. The engine will store this as the
  // report body; there is intentionally no narrative content here.
  const locClause = placeName
    ? `${placeName}${countyName ? `, ${countyName}` : ''}`
    : countyName || 'Ireland';
  const langClause = languages.includes('ga') && languages.includes('en')
    ? 'in Irish and English'
    : languages.includes('ga')
      ? 'in Irish'
      : 'in English';
  const description =
    `Folklore account recorded for the Schools' Collection (Bailiúchán na Scol), ` +
    `collected by schoolchildren in ${locClause} between 1937 and 1939, written ${langClause}. ` +
    `Catalogued under "${topicEN}" in the National Folklore Collection, UCD` +
    `${schoolName ? `; recorded at ${schoolName} school` : ''}. ` +
    `The full manuscript ${hasTranscript ? 'and community transcript are' : 'is'} available at dúchas.ie. ` +
    ATTRIBUTION;

  const sourceUrl = `https://www.duchas.ie/en/cbes/${volume.ID}/${item.FirstPageID ?? toArray(item.Pages)[0]}/${item.ID}`;

  return {
    title: title.slice(0, 200),
    summary: description.slice(0, 400),
    description,
    category: rule?.category || 'religion_mythology',
    location_name: locClause === 'Ireland' ? 'Ireland' : `${locClause}, Ireland`,
    country: 'Ireland',
    state_province: county?.NameEN || undefined,
    city: placeName || undefined,
    latitude: place?.Coordinates?.Latitude ?? county?.Coordinates?.Latitude ?? undefined,
    longitude: place?.Coordinates?.Longitude ?? county?.Coordinates?.Longitude ?? undefined,
    coords_synthetic: synthetic || undefined,
    location_precision: precision || undefined,
    // Legends are undated; 1937–39 is the COLLECTION period, not the event
    // date. Leaving event_date unset keeps OnThisDate honest.
    event_date: undefined,
    event_date_precision: 'unknown',
    event_date_extracted_from: 'none',
    credibility: 'medium',
    source_type: 'duchas',
    source_label: 'Dúchas — National Folklore Collection',
    source_url: sourceUrl,
    original_report_id: `duchas-cbes-${item.ID}`,
    tags: rule ? rule.tags : ['folklore'],
    metadata: {
      collection: 'CBES',
      itemId: item.ID,
      volumeId: volume.ID,
      volumeNumber: volume.VolumeNumber ?? volume.Number ?? undefined,
      pageIds: toArray(item.Pages),
      topicId: matchedTopic?.id ?? toArray(item.Topics)[0]?.ID,
      topicTitleEN: topicEN,
      topicTitleGA: matchedTopic?.titleGA ?? toArray(item.Topics)[0]?.TitleGA,
      topicPath: matchedTopic?.path,
      languages,
      schoolName,
      // PII posture: counts/roles only — never names, ages, or addresses of
      // informants/collectors (1930s schoolchildren and their families).
      informantCount: toArray(item.Informants).length,
      collectorCount: toArray(item.Collectors).length,
      hasTranscript,
      collectionPeriod: '1937-1939',
      content_type: 'historical_case',
      experienceTypeSlug: rule?.experienceTypeSlug,
      license: 'CC BY-NC 4.0',
      attribution: ATTRIBUTION,
      factsOnly: true, // marker: no source narrative text was stored
    },
  };
}

// Walk a /cbes response (volumes → parts → items, pages → transcripts) and
// map items. Response envelope shape is prerelease — handle array or wrapped.
export function mapCbesResponse(json: any, matchedTopic: MatchedTopic | undefined, limit: number): ScrapedReport[] {
  const volumes = Array.isArray(json) ? json : json?.results || json?.volumes || [];
  const reports: ScrapedReport[] = [];

  for (const volume of volumes) {
    // Index community transcripts by ItemID (text itself is never read beyond
    // existence — facts-only posture).
    const transcribedItemIds = new Set<number>();
    for (const page of toArray(volume.Pages)) {
      for (const t of toArray(page.Transcripts)) {
        if (t?.ItemID) transcribedItemIds.add(t.ItemID);
      }
    }

    for (const part of toArray(volume.Parts)) {
      for (const item of toArray(part.Items)) {
        // When querying by TopicID the API may still return whole volumes;
        // keep only items that actually carry a matching topic (when known).
        if (matchedTopic) {
          const itemTopicIds = toArray(item.Topics).map((t: any) => t?.ID);
          if (itemTopicIds.length > 0 && !itemTopicIds.includes(matchedTopic.id)) continue;
        }
        const report = mapItemToReport({ volume, part, item, matchedTopic, transcribedItemIds });
        if (report) reports.push(report);
        if (reports.length >= limit) return reports;
      }
    }
  }
  return reports;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const duchasAdapter: SourceAdapter = {
  name: 'duchas',

  async scrape(config: Record<string, any>, limit: number = 50): Promise<AdapterResult> {
    const apiKey = config.apiKey || process.env.DUCHAS_API_KEY;
    if (!apiKey) {
      return { success: false, reports: [], error: 'DUCHAS_API_KEY missing (register at gaois.ie Developer Hub)' };
    }
    const rateLimitMs = config.rate_limit_ms ?? 750;
    // 'en' | 'ga' | undefined (both)
    const language: string | undefined = config.language;
    const errors: string[] = [];
    const allReports: ScrapedReport[] = [];

    try {
      // 1. Resolve supernatural-relevant TopicIDs from the live subject list.
      const topicsRes = await duchasFetch('/cbes/topics', apiKey);
      let topics = matchTopics(topicsRes.json);
      if (Array.isArray(config.topicIds) && config.topicIds.length > 0) {
        topics = topics.filter((t) => config.topicIds.includes(t.id));
      }
      console.log(`[Duchas] Matched ${topics.length} supernatural-relevant topics`);
      if (topics.length === 0) {
        return { success: false, reports: [], error: 'No topics matched DUCHAS_TOPIC_RULES — inspect /cbes/topics output' };
      }

      // 2. Pull items per topic (optionally per county for payload bounding).
      const countyIds: (number | undefined)[] = Array.isArray(config.countyIds) && config.countyIds.length > 0
        ? config.countyIds
        : [undefined];

      for (const topic of topics) {
        if (allReports.length >= limit) break;
        for (const countyId of countyIds) {
          if (allReports.length >= limit) break;
          await delay(rateLimitMs);
          const params = new URLSearchParams({ TopicID: String(topic.id) });
          if (language) params.set('Language', language);
          if (countyId) params.set('CountyID', String(countyId));
          try {
            const res = await duchasFetch(`/cbes?${params}`, apiKey);
            const mapped = mapCbesResponse(res.json, topic, limit - allReports.length);
            console.log(`[Duchas] Topic "${topic.titleEN}" (${topic.id})${countyId ? ` county ${countyId}` : ''}: ${mapped.length} items (${res.ms}ms, ${Math.round(res.bytes / 1024)}KB)`);
            allReports.push(...mapped);
          } catch (e) {
            errors.push(`Topic ${topic.id} (${topic.titleEN}): ${e instanceof Error ? e.message : e}`);
          }
        }
      }

      // Cross-topic dedupe (an item can carry several matched topics).
      const seen = new Set<string>();
      const deduped = allReports.filter((r) => {
        if (seen.has(r.original_report_id)) return false;
        seen.add(r.original_report_id);
        return true;
      });

      console.log(`[Duchas] Scrape complete: ${deduped.length} unique items (${allReports.length - deduped.length} cross-topic dupes dropped)`);
      return { success: true, reports: deduped, error: errors.length ? errors.join('; ') : undefined };
    } catch (error) {
      console.error('[Duchas] Scrape failed:', error);
      return { success: false, reports: allReports, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
