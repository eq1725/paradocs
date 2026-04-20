// Resume OBERF per-archive smoke test for the last 5 archives.
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const OBERF_ID = '34f11cb9-e000-4242-b698-bae624024947';
const API = 'http://localhost:3000/api/admin/ingest';
const LIMIT = 5;

const REMAINING = [
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
  await supabase.from('data_sources').update({ scrape_config: patch }).eq('id', OBERF_ID);
}

async function runIngest() {
  const res = await fetch(`${API}?source=${OBERF_ID}&limit=${LIMIT}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
  });
  return res.json();
}

async function main() {
  const results = [];
  try {
    for (const slug of REMAINING) {
      await patchConfig(slug);
      const t0 = Date.now();
      const r = await runIngest();
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const found = r.totalRecordsFound ?? 0;
      const inserted = r.totalRecordsInserted ?? 0;
      const updated = r.totalRecordsUpdated ?? 0;
      const ok = r.success ? '✓' : '✗';
      console.log(`[${slug}] ${ok} found=${found} inserted=${inserted} updated=${updated} (${dt}s)${r.jobs?.[0]?.error ? ' err=' + r.jobs[0].error : ''}`);
      results.push({ slug, found, inserted, updated, success: r.success, error: r.jobs?.[0]?.error || null });
    }
  } finally {
    await supabase.from('data_sources').update({ scrape_config: { rate_limit_ms: 750 } }).eq('id', OBERF_ID);
    console.log('Restored OBERF scrape_config.');
  }

  console.log('\n=== Resume summary ===');
  for (const r of results) {
    console.log(`  ${r.slug.padEnd(42)} found=${r.found} ins=${r.inserted} upd=${r.updated}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
