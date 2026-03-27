// Run from project root: node scripts/reingest-nuforc.js
//
// Step 1: Deletes all NUFORC reports + related data (direct to Supabase — fast)
// Step 2: Calls the ingest API on Vercel with limit=20

require('dotenv').config({ path: '.env.local' });
var { createClient } = require('@supabase/supabase-js');

var NUFORC_SOURCE_ID = 'dedab32e-0fcf-4a91-bcdc-720948b57077';
var LIMIT = 20;
var BASE_URL = 'https://beta.discoverparadocs.com';

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function deleteExisting() {
  console.log('\n=== STEP 1: Delete existing NUFORC reports ===\n');

  var result = await supabase
    .from('reports')
    .select('id, title, status')
    .eq('source_type', 'nuforc');

  if (result.error) {
    console.error('Find error:', result.error);
    return false;
  }

  var reports = result.data;
  console.log('Found ' + (reports ? reports.length : 0) + ' NUFORC reports');

  if (!reports || reports.length === 0) {
    console.log('Nothing to delete — clean slate.');
    return true;
  }

  var ids = reports.map(function (r) { return r.id; });

  var statusCounts = {};
  reports.forEach(function (r) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });
  console.log('Status breakdown:', JSON.stringify(statusCounts));

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
  console.log('Calling Vercel API (this takes 2-3 min for full-page fetches)...\n');

  try {
    var response = await fetch(
      BASE_URL + '/api/admin/ingest?source=' + NUFORC_SOURCE_ID + '&limit=' + LIMIT,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + serviceKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(300000), // 5 min local timeout
      }
    );

    if (!response.ok) {
      var text = await response.text();
      console.error('Ingest API error (' + response.status + '):', text.substring(0, 500));
      return;
    }

    var result = await response.json();
    console.log('\n=== INGESTION RESULT ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Request failed:', err.message || err);
    console.log('\nIf this timed out, check the database — some reports may have been ingested.');
  }
}

async function main() {
  console.log('NUFORC Re-Ingest Script');
  console.log('========================');
  console.log('Limit: ' + LIMIT);

  var deleted = await deleteExisting();
  if (!deleted) {
    console.error('Delete step failed, aborting.');
    process.exit(1);
  }

  await reingest();

  // Final check
  console.log('\n=== FINAL STATE ===');
  var { data: final } = await supabase
    .from('reports')
    .select('id, status')
    .eq('source_type', 'nuforc');

  if (final) {
    var counts = {};
    final.forEach(function(r) { counts[r.status] = (counts[r.status]||0)+1; });
    console.log('Total NUFORC reports: ' + final.length);
    console.log('Status breakdown:', JSON.stringify(counts));
  }

  console.log('\nDone!');
}

main().catch(function (err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
