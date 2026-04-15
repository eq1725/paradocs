// scripts/backfill-oberf-header-chrome.ts
// Strip the OBERF/NDERF page-header chrome
//   "<FirstName> <LastInitial[.]> Experience Home Page Share Experience
//    New Experiences Experience description:"
// from existing `reports.description` + `reports.summary` rows, and
// re-regenerate Paradocs Analysis for any rows whose paradocs_narrative
// contains a name byline.
//
// Run:
//   npx tsx scripts/backfill-oberf-header-chrome.ts --limit=500
//   npx tsx scripts/backfill-oberf-header-chrome.ts --limit=500 --regen-analysis

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });

import { stripOBERFHeaderChrome } from '../src/lib/ingestion/adapters/oberf';
// NOTE: do NOT static-import paradocs-analysis.service here. That module
// transitively evaluates src/lib/supabase.ts at import-time, which needs
// NEXT_PUBLIC_SUPABASE_URL. ESM hoists all imports above dotenv.config,
// so .env.local hasn't been loaded yet at that point. We dynamic-import
// inside main() after dotenv has run.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const argv = process.argv.slice(2);
const limit = parseInt((argv.find(a => a.startsWith('--limit=')) || '--limit=500').split('=')[1], 10);
const regen = argv.includes('--regen-analysis');

// Same byline detector used by the Paradocs analysis sanitizer. Duplicated
// here so this script stays self-contained.
const BYLINE_RE = /(^|[.!?]\s+)([A-Z][a-zA-Z'\-]{1,24})\s+([A-Z])\.?(?=\s+(?:reports|describes|recounts|narrates|shares|offers|recalls|presents|submits|provides|details|documents|writes|states|experiences|says|claims|notes|observes|remembers|awakens|awakes|encounters|witnesses|sees|hears|feels|explains|tells|a |an |the )|\s*['\u2019]s\b)/;

function hasNameByline(text: string | null | undefined): boolean {
  if (!text) return false;
  return BYLINE_RE.test(text);
}

async function main() {
  console.log(`[backfill-oberf-chrome] limit=${limit} regen=${regen}`);

  // STEP 1: find reports whose description/summary still carries the header chrome
  const { data: polluted, error } = await sb
    .from('reports')
    .select('id, slug, description, summary')
    .or('description.ilike.%Home Page Share Experience%,description.ilike.%New Experiences Experience description%,summary.ilike.%Home Page Share Experience%,summary.ilike.%New Experiences Experience description%')
    .limit(limit);

  if (error) {
    console.error('[backfill-oberf-chrome] fetch error:', error);
    process.exit(1);
  }

  console.log(`[backfill-oberf-chrome] found ${polluted?.length || 0} polluted description rows`);

  let cleaned = 0;
  for (const r of polluted || []) {
    const newDesc = r.description ? stripOBERFHeaderChrome(r.description) : r.description;
    const newSummary = r.summary ? stripOBERFHeaderChrome(r.summary) : r.summary;
    const patch: Record<string, unknown> = {};
    if (newDesc && newDesc !== r.description) patch.description = newDesc;
    if (newSummary && newSummary !== r.summary) patch.summary = newSummary;
    if (Object.keys(patch).length === 0) continue;

    const { error: upErr } = await sb.from('reports').update(patch).eq('id', r.id);
    if (upErr) {
      console.error(`[backfill-oberf-chrome] update failed for ${r.slug}:`, upErr.message);
      continue;
    }
    cleaned++;
    console.log(`[backfill-oberf-chrome] cleaned ${r.slug}`);
  }
  console.log(`[backfill-oberf-chrome] descriptions_cleaned=${cleaned}`);

  // STEP 2: find reports whose paradocs_narrative leaks an experiencer name byline
  const { data: analyses, error: err2 } = await sb
    .from('reports')
    .select('id, slug, paradocs_narrative')
    .not('paradocs_narrative', 'is', null)
    .limit(10000);

  if (err2) {
    console.error('[backfill-oberf-chrome] analyses fetch error:', err2);
    process.exit(1);
  }

  const leakers = (analyses || []).filter((r: any) => hasNameByline(r.paradocs_narrative));
  console.log(`[backfill-oberf-chrome] found ${leakers.length} paradocs_narrative rows with name byline`);
  for (const l of leakers) {
    console.log(`  - ${l.slug}`);
  }

  if (!regen) {
    console.log('[backfill-oberf-chrome] skip regeneration (pass --regen-analysis to regenerate)');
    return;
  }

  const { generateAndSaveParadocsAnalysis } = await import('../src/lib/services/paradocs-analysis.service');
  let regenerated = 0;
  for (const l of leakers) {
    console.log(`[backfill-oberf-chrome] regenerating analysis for ${l.slug}`);
    const ok = await generateAndSaveParadocsAnalysis(l.id);
    if (ok) regenerated++;
    // Gentle pacing to stay under rate limits.
    await new Promise(r => setTimeout(r, 800));
  }
  console.log(`[backfill-oberf-chrome] analyses_regenerated=${regenerated}/${leakers.length}`);
}

main().catch(err => {
  console.error('[backfill-oberf-chrome] fatal:', err);
  process.exit(1);
});
