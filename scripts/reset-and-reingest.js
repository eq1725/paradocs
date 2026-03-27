// Run from project root: node scripts/reset-and-reingest.js
//
// Deletes ALL non-curated reports (keeps Roswell and other curated content),
// then re-ingests 20 NUFORC reports with the current pipeline.

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

async function deleteNonCurated() {
  console.log('\n=== STEP 1: Delete all non-curated reports (keeping Roswell + curated) ===\n');

  // Find all non-curated reports
  var { data: reports, error: findErr } = await supabase
    .from('reports')
    .select('id, title, status, source_type, content_origin')
    .neq('content_origin', 'curated');

  if (findErr) {
    console.error('Find error:', findErr);
    return false;
  }

  // Also find any reports that have null content_origin but are not curated
  var { data: nullOrigin } = await supabase
    .from('reports')
    .select('id, title, status, source_type, content_origin')
    .is('content_origin', null)
    .neq('source_type', 'curated');

  var allReports = (reports || []).concat(nullOrigin || []);

  // Deduplicate by ID
  var seen = {};
  var uniqueReports = allReports.filter(function(r) {
    if (seen[r.id]) return false;
    seen[r.id] = true;
    return true;
  });

  console.log('Found ' + uniqueReports.length + ' non-curated reports to delete');

  if (uniqueReports.length === 0) {
    console.log('Nothing to delete.');
    return true;
  }

  // Show what we're keeping
  var { data: kept } = await supabase
    .from('reports')
    .select('id, title, content_origin')
    .eq('content_origin', 'curated');
  if (kept && kept.length > 0) {
    console.log('Keeping ' + kept.length + ' curated reports:');
    kept.forEach(function(r) { console.log('  - ' + r.title); });
  }

  // Group by source_type for logging
  var bySource = {};
  uniqueReports.forEach(function(r) {
    var src = r.source_type || 'unknown';
    bySource[src] = (bySource[src] || 0) + 1;
  });
  console.log('Deleting by source:', JSON.stringify(bySource));

  var ids = uniqueReports.map(function(r) { return r.id; });

  // Delete related records
  var r1 = await supabase.from('report_media').delete({ count: 'exact' }).in('report_id', ids);
  console.log('Deleted media:', r1.count || 0);

  var r2 = await supabase.from('report_embeddings').delete({ count: 'exact' }).in('report_id', ids);
  console.log('Deleted embeddings:', r2.count || 0);

  await supabase.from('votes').delete().in('report_id', ids);
  await supabase.from('comments').delete().in('report_id', ids);
  await supabase.from('report_phenomena').delete().in('report_id', ids);

  // Delete in chunks of 50 (Supabase .in() has limits)
  var deleted = 0;
  for (var i = 0; i < ids.length; i += 50) {
    var chunk = ids.slice(i, i + 50);
    var r3 = await supabase.from('reports').delete({ count: 'exact' }).in('id', chunk);
    if (r3.error) {
      console.error('Delete error at chunk ' + Math.floor(i/50) + ':', r3.error);
    } else {
      deleted += (r3.count || 0);
    }
  }
  console.log('Deleted reports:', deleted);
  console.log('Cleanup complete!\n');
  return true;
}

async function reingest() {
  console.log('=== STEP 2: Re-ingest ' + LIMIT + ' NUFORC reports ===\n');
  console.log('Calling Vercel API (this takes 2-3 min)...\n');

  try {
    var response = await fetch(
      BASE_URL + '/api/admin/ingest?source=' + NUFORC_SOURCE_ID + '&limit=' + LIMIT,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + serviceKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(300000),
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
    console.log('\nCheck the database — some reports may have been ingested.');
  }
}

async function main() {
  console.log('Paradocs Reset & Re-Ingest');
  console.log('===========================');

  var deleted = await deleteNonCurated();
  if (!deleted) {
    console.error('Delete step failed, aborting.');
    process.exit(1);
  }

  await reingest();

  // Step 3: Generate Paradocs Analysis for reports missing it
  console.log('\n=== STEP 3: Generate Paradocs Analysis ===\n');
  console.log('Triggering batch analysis generation (this takes a few minutes)...\n');
  try {
    var analysisResponse = await fetch(
      BASE_URL + '/api/admin/ai/generate-analysis',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'batch-missing', limit: 20 }),
        signal: AbortSignal.timeout(300000),
      }
    );
    if (analysisResponse.ok) {
      var analysisResult = await analysisResponse.json();
      console.log('Analysis result:', JSON.stringify(analysisResult, null, 2));
    } else {
      var analysisText = await analysisResponse.text();
      console.error('Analysis API error (' + analysisResponse.status + '):', analysisText.substring(0, 300));
      console.log('You can run this separately later:');
      console.log('  curl -X POST "' + BASE_URL + '/api/admin/ai/generate-analysis" \\');
      console.log('    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \\');
      console.log('    -H "Content-Type: application/json" \\');
      console.log('    -d \'{"action": "batch-missing", "limit": 20}\'');
    }
  } catch (err) {
    console.error('Analysis generation failed:', err.message || err);
    console.log('Analysis can be run separately after ingestion completes.');
  }

  // Final check
  console.log('\n=== FINAL STATE ===');
  var { data: all } = await supabase
    .from('reports')
    .select('id, status, source_type, content_origin');

  if (all) {
    var byOrigin = {};
    var byStatus = {};
    var bySource = {};
    all.forEach(function(r) {
      var origin = r.content_origin || 'scraped';
      byOrigin[origin] = (byOrigin[origin] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      var src = r.source_type || 'unknown';
      bySource[src] = (bySource[src] || 0) + 1;
    });
    console.log('Total reports: ' + all.length);
    console.log('By origin:', JSON.stringify(byOrigin));
    console.log('By status:', JSON.stringify(byStatus));
    console.log('By source:', JSON.stringify(bySource));
  }

  console.log('\nDone!');
}

main().catch(function (err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
