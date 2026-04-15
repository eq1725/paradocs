/**
 * Stamp metadata.location_precision on every geocoded report that's
 * missing it. Uses a simple heuristic over city/state/country:
 *   - city present          → 'city'
 *   - state only            → 'state'
 *   - country only          → 'country'
 *
 * Does NOT re-extract locations (use backfill-location.ts for that).
 * Does NOT clobber an existing metadata.location_precision.
 *
 * Run:
 *   npx tsx scripts/backfill-location-precision.ts [--limit=N]
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const argv = process.argv.slice(2);
function arg(name: string): string | undefined {
  const f = argv.find(a => a.startsWith('--' + name + '='));
  return f ? f.split('=')[1] : undefined;
}
const limit = parseInt(arg('limit') || '10000', 10);

type Row = {
  id: string;
  slug: string;
  city: string | null;
  state_province: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, any> | null;
};

function derivePrecision(r: Row): 'city' | 'state' | 'country' | null {
  if (r.city) return 'city';
  if (r.state_province) return 'state';
  if (r.country) return 'country';
  return null;
}

async function main() {
  console.log(`Precision backfill. limit=${limit}`);

  const { data, error } = await supabase
    .from('reports')
    .select('id, slug, city, state_province, country, latitude, longitude, metadata')
    .not('location_name', 'is', null)
    .limit(limit);

  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) { console.log('None to process'); return; }

  console.log(`Scanning ${data.length} reports...`);
  let stamped = 0, already = 0, skipped = 0;

  for (const r of data as Row[]) {
    const existing = r.metadata && r.metadata.location_precision;
    if (existing) { already++; continue; }
    const p = derivePrecision(r);
    if (!p) { skipped++; continue; }

    const newMeta = Object.assign({}, r.metadata || {}, { location_precision: p });
    const { error: upErr } = await supabase
      .from('reports')
      .update({ metadata: newMeta })
      .eq('id', r.id);
    if (upErr) { console.log(`  ${r.slug}: update failed: ${upErr.message}`); skipped++; }
    else { stamped++; }
  }

  console.log(`\nDone. stamped=${stamped} already_had=${already} skipped=${skipped}`);
}

main().catch(e => { console.error(e); process.exit(1); });
