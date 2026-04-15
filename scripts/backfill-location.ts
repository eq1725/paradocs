/**
 * Backfill location fields (location_name, country, state_province, city,
 * latitude, longitude) for OBERF/NDERF reports that are missing them.
 *
 * The recent extractLocation() patch adds a state-only fallback (e.g. "home
 * in Kansas"). We re-run location extraction on the stored description +
 * source HTML and — when a new location appears — geocode and persist it.
 *
 * We never clobber existing coordinates or location_name.
 *
 * Run with:
 *   npx tsx scripts/backfill-location.ts [--limit=N] [--source=oberf|nderf]
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });

import { createClient } from '@supabase/supabase-js';
import { extractLocation, extractLocationSmart } from '../src/lib/ingestion/adapters/nderf';
import { geocodeLocation, buildLocationQuery } from '../src/lib/services/geocoding.service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const argv = process.argv.slice(2);
function arg(name: string): string | undefined {
  const f = argv.find(a => a.startsWith('--' + name + '='));
  return f ? f.split('=')[1] : undefined;
}
const limit = parseInt(arg('limit') || '2000', 10);
const source = arg('source');
const onlySlug = arg('slug');
// Default to LLM-first extraction so multi-location narratives resolve
// to the event location instead of whichever city is mentioned first.
// Pass --regex to force pure regex extraction (faster, no API calls).
const useLLM = !argv.includes('--regex');

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'ParadocsBackfill/1.0' },
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Backfill location. limit=${limit} source=${source || 'oberf,nderf'}${onlySlug ? ' slug=' + onlySlug : ''}`);

  const selectCols = 'id, slug, source_type, source_url, description, location_name, latitude, longitude, country, state_province, city, metadata';
  let q = supabase
    .from('reports')
    .select(selectCols)
    .in('source_type', source ? [source] : ['oberf', 'nderf'])
    .is('location_name', null)
    .limit(limit);
  if (onlySlug) q = supabase
    .from('reports')
    .select(selectCols)
    .eq('slug', onlySlug);

  const { data, error } = await q;
  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) { console.log('None to process'); return; }

  console.log(`Processing ${data.length} reports...`);
  let updated = 0, unchanged = 0, geocoded = 0, failed = 0;

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const progress = `[${i + 1}/${data.length}]`;
    console.log(`${progress} ${r.slug} (${r.source_type})`);

    // Prefer local description; fetch HTML only if description is thin.
    const content = r.description || '';
    let html = '';
    if (content.length < 400 && r.source_url) {
      html = await fetchHtml(r.source_url) || '';
    }
    const loc = useLLM
      ? await extractLocationSmart(content, html)
      : extractLocation(content, html);
    if (!loc.location_name) {
      console.log('  no location extracted');
      unchanged++;
      continue;
    }
    console.log(`  extracted: ${loc.location_name} (${loc.country || ''})`);

    const update: any = {};
    if (!r.location_name && loc.location_name) update.location_name = loc.location_name;
    if (!r.country && loc.country) update.country = loc.country;
    if (!r.state_province && loc.state_province) update.state_province = loc.state_province;
    if (!r.city && loc.city) update.city = loc.city;

    // Geocode if we don't already have coords
    if ((r.latitude == null || r.longitude == null) && loc.location_name) {
      const query = buildLocationQuery({
        city: loc.city,
        state: loc.state_province,
        country: loc.country,
        location_name: loc.location_name,
      });
      if (query) {
        try {
          const geo = await geocodeLocation(query);
          if (geo) {
            update.latitude = geo.latitude;
            update.longitude = geo.longitude;
            geocoded++;
            console.log(`  geocoded: ${geo.latitude.toFixed(3)}, ${geo.longitude.toFixed(3)}`);
          }
        } catch (e) {
          console.log(`  geocode error: ${(e as Error).message}`);
        }
      }
    }

    // Stamp location_precision into metadata so the map can style fuzzy pins.
    if (loc.precision) {
      const existingMeta = r.metadata || {};
      if (existingMeta.location_precision !== loc.precision) {
        update.metadata = Object.assign({}, existingMeta, { location_precision: loc.precision });
      }
    }

    if (Object.keys(update).length === 0) { unchanged++; continue; }

    const { error: upErr } = await supabase.from('reports').update(update).eq('id', r.id);
    if (upErr) { console.log(`  update failed: ${upErr.message}`); failed++; }
    else { updated++; }

    // rate limit for geocoder friendliness
    await new Promise(res => setTimeout(res, 300));
  }

  console.log(`\nDone. updated=${updated} geocoded=${geocoded} unchanged=${unchanged} failed=${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
