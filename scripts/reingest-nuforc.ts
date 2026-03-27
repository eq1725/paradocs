#!/usr/bin/env npx ts-node --compiler-options {"module":"commonjs","esModuleInterop":true,"resolveJsonModule":true,"moduleResolution":"node","paths":{"@/*":["./src/*"]}}
// Run from project root: npx ts-node -O '{"module":"commonjs","esModuleInterop":true,"paths":{"@/*":["./src/*"]}}' scripts/reingest-nuforc.ts

require('dotenv').config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

var NUFORC_SOURCE_ID = 'dedab32e-0fcf-4a91-bcdc-720948b57077';
var LIMIT = 20;

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteExisting() {
  console.log('\n=== STEP 1: Delete existing NUFORC reports ===\n');

  var { data: reports, error: findErr } = await supabase
    .from('reports')
    .select('id, title, status')
    .eq('source_type', 'nuforc');

  if (findErr) {
    console.error('Find error:', findErr);
    return false;
  }

  console.log('Found ' + (reports?.length || 0) + ' NUFORC reports');

  if (!reports || reports.length === 0) {
    console.log('Nothing to delete — clean slate.');
    return true;
  }

  var ids = reports.map(function (r: any) { return r.id; });

  // Count statuses
  var statusCounts: Record<string, number> = {};
  reports.forEach(function (r: any) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });
  console.log('Status breakdown:', JSON.stringify(statusCounts));

  // Delete related records
  var r1 = await supabase.from('report_media').delete({ count: 'exact' }).in('report_id', ids);
  console.log('Deleted media:', r1.count || 0);

  var r2 = await supabase.from('report_embeddings').delete({ count: 'exact' }).in('report_id', ids);
  console.log('Deleted embeddings:', r2.count || 0);

  await supabase.from('votes').delete().in('report_id', ids);
  await supabase.from('comments').delete().in('report_id', ids);
  await supabase.from('report_phenomena').delete().in('report_id', ids);

  var r3 = await supabase.from('reports').delete({ count: 'exact' }).eq('source_type', 'nuforc');
  if (r3.error) {
    console.error('Delete error:', r3.error);
    return false;
  }
  console.log('Deleted reports:', r3.count || 0);
  console.log('Cleanup complete!\n');
  return true;
}

async function reingest() {
  console.log('=== STEP 2: Re-ingest ' + LIMIT + ' NUFORC reports ===\n');

  // Dynamic import to pick up path aliases
  var { runIngestion } = require('../src/lib/ingestion/engine');

  var result = await runIngestion(NUFORC_SOURCE_ID, { limit: LIMIT });
  console.log('\n=== INGESTION RESULTS ===');
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  console.log('NUFORC Re-Ingest Script');
  console.log('========================');
  console.log('Source ID: ' + NUFORC_SOURCE_ID);
  console.log('Limit: ' + LIMIT);

  var deleted = await deleteExisting();
  if (!deleted) {
    console.error('Delete step failed, aborting.');
    process.exit(1);
  }

  await reingest();
  console.log('\nDone!');
}

main().catch(function (err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
