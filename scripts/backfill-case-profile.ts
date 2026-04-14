/**
 * Backfill case_profile for existing OBERF/NDERF reports.
 *
 * We don't store raw HTML — so the only way to pick up the 9 new
 * structured questionnaire fields added on Apr 14 2026 is to re-fetch
 * each source_url and re-run buildCaseProfile() on the fresh HTML.
 *
 * This script preserves everything else on the report (title, narrative,
 * tags, location, dates) and only overwrites metadata.case_profile. If
 * the remote page is gone (404) or the fetch fails we skip the report.
 *
 * Run with:
 *   npx tsx scripts/backfill-case-profile.ts [--limit=N] [--source=oberf|nderf]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  buildCaseProfile,
  nderfLabelResolver,
  interpretNDERFAnswer,
  extractFieldAny,
  NDERFCaseProfile,
} from '../src/lib/ingestion/adapters/nderf';
import {
  buildOBERFFieldMap,
  oberfLabelResolver,
} from '../src/lib/ingestion/adapters/oberf';

// Next's Node runtime normally loads these automatically; when running
// under plain tsx we need to pull them in explicitly.
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Parse CLI args
const argv = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const found = argv.find(a => a.startsWith('--' + name + '='));
  return found ? found.split('=')[1] : undefined;
}
const limit = parseInt(getArg('limit') || '2000', 10);
const sourceFilter = getArg('source'); // 'oberf' | 'nderf' | undefined (both)
const onlySlug = getArg('slug');

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ParadocsBackfill/1.0 (+https://paradocs.example.com)' },
    });
    if (!res.ok) {
      console.log(`  [fetch] ${res.status} ${url}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.log(`  [fetch] error ${url}: ${(e as Error).message}`);
    return null;
  }
}

function buildProfileFromHtml(sourceType: string, html: string): NDERFCaseProfile | null {
  // Pass empty ndeType/trigger — we only care about the expanded factual
  // fields from the questionnaire; the ingest-time values for ndeType
  // and trigger are preserved via the merge step below.
  if (sourceType === 'oberf') {
    const fieldMap = buildOBERFFieldMap(html);
    const getField = oberfLabelResolver(fieldMap);
    return buildCaseProfile(getField, '', undefined);
  }
  if (sourceType === 'nderf') {
    const getField = nderfLabelResolver(html);
    return buildCaseProfile(getField, '', undefined);
  }
  return null;
}

async function main() {
  console.log(`Backfill starting. limit=${limit} source=${sourceFilter || 'oberf,nderf'}${onlySlug ? ' slug=' + onlySlug : ''}`);

  let query = supabase
    .from('reports')
    .select('id, slug, source_type, source_url, metadata')
    .in('source_type', sourceFilter ? [sourceFilter] : ['oberf', 'nderf'])
    .not('source_url', 'is', null)
    .limit(limit);
  if (onlySlug) query = query.eq('slug', onlySlug);

  const { data: reports, error } = await query;
  if (error) { console.error(error); process.exit(1); }
  if (!reports || reports.length === 0) { console.log('No reports found.'); return; }

  console.log(`Processing ${reports.length} reports...`);

  let updated = 0, skipped = 0, failed = 0, unchanged = 0;
  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    const existing: NDERFCaseProfile | undefined = (r.metadata as any)?.case_profile;
    const progress = `[${i + 1}/${reports.length}]`;
    console.log(`${progress} ${r.slug} (${r.source_type})`);

    const html = await fetchHtml(r.source_url!);
    if (!html) { failed++; continue; }

    const fresh = buildProfileFromHtml(r.source_type!, html);
    if (!fresh) { skipped++; continue; }

    // Merge: prefer fresh values, but keep existing ones the new parse
    // didn't find (e.g. out-of-body default from archive-type inference
    // applied at ingest time in oberf.ts).
    const merged: NDERFCaseProfile = { ...(existing || {}), ...fresh };

    // Count how many of the new fields were populated
    const newFieldKeys: Array<keyof NDERFCaseProfile> = [
      'mysticalBeing', 'deceasedPresent', 'otherworldly', 'specialKnowledge',
      'futureScenes', 'afterlifeAware', 'memoryAccuracy', 'realityBelief', 'lifeChanged',
    ];
    const newPopulated = newFieldKeys.filter(k => merged[k] !== undefined).length;
    const existingPopulated = newFieldKeys.filter(k => existing && existing[k] !== undefined).length;
    console.log(`  new-fields: ${existingPopulated} → ${newPopulated}`);

    if (newPopulated === existingPopulated && JSON.stringify(merged) === JSON.stringify(existing)) {
      unchanged++;
      continue;
    }

    const nextMetadata = { ...(r.metadata as any), case_profile: merged };
    const { error: updErr } = await supabase
      .from('reports')
      .update({ metadata: nextMetadata })
      .eq('id', r.id);
    if (updErr) {
      console.log(`  update failed: ${updErr.message}`);
      failed++;
    } else {
      updated++;
    }

    // Rate limit — be kind to OBERF/NDERF servers (they're small sites).
    await new Promise(res => setTimeout(res, 750));
  }

  console.log(`\nDone. updated=${updated} unchanged=${unchanged} skipped=${skipped} failed=${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
