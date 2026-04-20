// Verify the NDE-family taxonomy migration applied correctly.
// Run AFTER pasting 20260414_nde_family_taxonomy.sql into the Supabase dashboard
// SQL editor.
//
// Usage: node scripts/verify-nde-taxonomy.js

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// Canonical slugs from migration 20260414_nde_family_taxonomy.sql
const EXPECTED_SLUGS = [
  'near-death-experience',
  'out-of-body-experience',
  'sudden-obe',
  'spiritually-transformative-experience',
  'deathbed-vision',
  'after-death-communication',
  'nearing-end-of-life-experience',
  'nde-like-experience',
  'pre-birth-memory',
  'prayer-experience',
  'dream-experience',
  'premonition-experience',
  'shared-death-experience',
  'distressing-nde',
  'other-experience',
];

async function checkPhenomenonTypes() {
  console.log('\n=== phenomenon_types ===');
  const { data, error } = await supabase
    .from('phenomenon_types')
    .select('slug, name, category')
    .in('slug', EXPECTED_SLUGS)
    .order('slug');

  if (error) {
    console.error('Query error:', error.message);
    return { ok: false, missing: EXPECTED_SLUGS };
  }

  const foundSlugs = new Set((data || []).map(r => r.slug));
  const missing = EXPECTED_SLUGS.filter(s => !foundSlugs.has(s));

  console.log(`Found: ${foundSlugs.size}/${EXPECTED_SLUGS.length}`);
  for (const row of data || []) {
    console.log(`  \u2713 ${row.slug.padEnd(42)} [${row.category}] ${row.name}`);
  }
  if (missing.length) {
    console.log(`  \u2717 MISSING: ${missing.join(', ')}`);
  }
  return { ok: missing.length === 0, missing };
}

async function checkPhenomenaEncyclopedia() {
  console.log('\n=== phenomena (encyclopedia) ===');
  const { data, error } = await supabase
    .from('phenomena')
    .select('slug, name, phenomenon_type_id, aliases, status, ai_summary')
    .in('slug', EXPECTED_SLUGS)
    .order('slug');

  if (error) {
    console.error('Query error:', error.message);
    return { ok: false, missing: EXPECTED_SLUGS };
  }

  const foundSlugs = new Set((data || []).map(r => r.slug));
  const missing = EXPECTED_SLUGS.filter(s => !foundSlugs.has(s));

  console.log(`Found: ${foundSlugs.size}/${EXPECTED_SLUGS.length}`);
  let issues = 0;
  for (const row of data || []) {
    const problems = [];
    if (!row.phenomenon_type_id) problems.push('no type FK');
    if (!row.aliases || row.aliases.length === 0) problems.push('no aliases');
    if (row.status !== 'active') problems.push(`status=${row.status}`);
    if (!row.ai_summary) problems.push('no ai_summary');
    const suffix = problems.length ? `  \u26a0 ${problems.join(', ')}` : '';
    console.log(`  \u2713 ${row.slug.padEnd(42)} aliases=${(row.aliases || []).length} ${suffix}`);
    if (problems.length) issues++;
  }
  if (missing.length) {
    console.log(`  \u2717 MISSING: ${missing.join(', ')}`);
  }
  return { ok: missing.length === 0 && issues === 0, missing, issues };
}

async function checkFKIntegrity() {
  console.log('\n=== FK integrity (phenomena.phenomenon_type_id \u2192 phenomenon_types) ===');
  const { data, error } = await supabase
    .from('phenomena')
    .select('slug, phenomenon_type_id, phenomenon_types(slug)')
    .in('slug', EXPECTED_SLUGS);

  if (error) {
    console.error('Query error:', error.message);
    return { ok: false };
  }

  let mismatches = 0;
  for (const row of data || []) {
    const typeSlug = row.phenomenon_types && row.phenomenon_types.slug;
    if (typeSlug !== row.slug) {
      console.log(`  \u2717 ${row.slug} \u2192 ${typeSlug || '(null)'}  (expected ${row.slug})`);
      mismatches++;
    } else {
      console.log(`  \u2713 ${row.slug.padEnd(42)} \u2192 ${typeSlug}`);
    }
  }
  return { ok: mismatches === 0, mismatches };
}

async function checkLegacyOBEUpgrade() {
  console.log('\n=== legacy OBE upgrade (slug "obe" should no longer exist) ===');
  const { data, error } = await supabase
    .from('phenomenon_types')
    .select('slug')
    .eq('slug', 'obe');
  if (error) {
    console.error('Query error:', error.message);
    return { ok: false };
  }
  if ((data || []).length > 0) {
    console.log('  \u2717 phenomenon_types.slug = "obe" still exists \u2014 upgrade step did not run');
    return { ok: false };
  }
  console.log('  \u2713 legacy "obe" slug successfully upgraded to "out-of-body-experience"');
  return { ok: true };
}

async function main() {
  console.log('Verifying NDE-family taxonomy migration (20260414)...');
  console.log('Target:', supabaseUrl.replace(/^https?:\/\//, ''));

  const t = await checkPhenomenonTypes();
  const p = await checkPhenomenaEncyclopedia();
  const fk = await checkFKIntegrity();
  const legacy = await checkLegacyOBEUpgrade();

  console.log('\n=== Summary ===');
  console.log(`phenomenon_types:  ${t.ok ? 'PASS' : 'FAIL'}`);
  console.log(`phenomena:         ${p.ok ? 'PASS' : 'FAIL'}`);
  console.log(`FK integrity:      ${fk.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Legacy OBE fix:    ${legacy.ok ? 'PASS' : 'FAIL'}`);

  const allOK = t.ok && p.ok && fk.ok && legacy.ok;
  if (!allOK) {
    console.log('\nOne or more checks failed. Re-run the migration in the Supabase SQL editor and try again.');
    process.exit(1);
  }
  console.log('\nAll checks passed \u2014 taxonomy is ready for B1.5 QA/QC smoke tests.');
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
