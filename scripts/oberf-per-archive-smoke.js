// Session B1.5 QA/QC — OBERF per-archive smoke test
//
// OBERF's adapter iterates archives sequentially and stops at the global limit,
// so a single limit=5 call only exercises the first archive (OBE). To QA each
// archive's parser independently, we temporarily patch data_sources.scrape_config
// with { archive_slug: <slug> } for each of the 10 archives, call the admin
// ingest endpoint with limit=5, and capture per-archive results.
//
// Usage: node scripts/oberf-per-archive-smoke.js
//
// Requires the dev server running on http://localhost:3000 and the service
// role key in .env.local.

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const OBERF_ID = '34f11cb9-e000-4242-b698-bae624024947';
const API = 'http://localhost:3000/api/admin/ingest';
const LIMIT = 5;

// Must match OBERF_ARCHIVES in src/lib/ingestion/adapters/oberf.ts
const ARCHIVES = [
  'out-of-body-experience',
  'spiritually-transformative-experience',
  'sudden-obe',
  'deathbed-vision',
  'nde-like-experience',
  'pre-birth-memory',
  'prayer-experience',
  'dream-experience',
  'other-experience',
  'ufo-encounter',
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function patchConfig(archiveSlug) {
  const patch = { rate_limit_ms: 750 };
  if (archiveSlug) patch.archive_slug = archiveSlug;
  const { error } = await supabase
    .from('data_sources')
    .update({ scrape_config: patch })
    .eq('id', OBERF_ID);
  if (error) throw error;
}

async function runIngest() {
  const res = await fetch(`${API}?source=${OBERF_ID}&limit=${LIMIT}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

async function main() {
  // Save original config
  const { data: original } = await supabase
    .from('data_sources').select('scrape_config').eq('id', OBERF_ID).single();
  const originalConfig = original.scrape_config;
  console.log(`Original OBERF scrape_config: ${JSON.stringify(originalConfig)}`);
  console.log(`Running ${LIMIT}-row smoke per archive across ${ARCHIVES.length} archives...\n`);

  const results = [];
  try {
    for (const slug of ARCHIVES) {
      process.stdout.write(`[${slug}] patching config... `);
      await patchConfig(slug);
      process.stdout.write(`ingesting... `);
      const t0 = Date.now();
      const r = await runIngest();
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const found = r.totalRecordsFound ?? 0;
      const inserted = r.totalRecordsInserted ?? 0;
      const updated = r.totalRecordsUpdated ?? 0;
      const ok = r.success ? '✓' : '✗';
      console.log(`${ok} found=${found} inserted=${inserted} updated=${updated} (${dt}s)${r.jobs?.[0]?.error ? ' err=' + r.jobs[0].error : ''}`);
      results.push({ slug, found, inserted, updated, success: r.success, error: r.jobs?.[0]?.error || null, duration: dt });
    }
  } finally {
    await patchConfig(null).catch(() => {});
    // restore original
    await supabase.from('data_sources').update({ scrape_config: originalConfig }).eq('id', OBERF_ID);
    console.log(`\nRestored OBERF scrape_config to ${JSON.stringify(originalConfig)}`);
  }

  console.log('\n=== Summary ===');
  for (const r of results) {
    console.log(`  ${r.slug.padEnd(42)} found=${String(r.found).padStart(2)} ins=${String(r.inserted).padStart(2)} upd=${String(r.updated).padStart(2)} ${r.success ? 'OK' : 'FAIL'}${r.error ? ' ' + r.error : ''}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
