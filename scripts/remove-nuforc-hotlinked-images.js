// Remove hotlinked NUFORC images from report_media table
// Per media policy, NUFORC images should not be hotlinked — only source page links.
// This script deletes image-type media items from NUFORC-sourced reports.
// Video embeds (YouTube) are kept.
//
// Run: node scripts/remove-nuforc-hotlinked-images.js

require('dotenv').config({ path: '.env.local' });
var { createClient } = require('@supabase/supabase-js');

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('Removing hotlinked NUFORC images from report_media...\n');

  // Get all NUFORC report IDs
  var { data: nuforcReports, error: reportsErr } = await supabase
    .from('reports')
    .select('id, title, slug')
    .eq('source_type', 'nuforc');

  if (reportsErr) {
    console.error('Error fetching NUFORC reports:', reportsErr);
    return;
  }

  if (!nuforcReports || nuforcReports.length === 0) {
    console.log('No NUFORC reports found.');
    return;
  }

  console.log('Found ' + nuforcReports.length + ' NUFORC reports');

  var reportIds = nuforcReports.map(function(r) { return r.id; });

  // Find image media items linked to NUFORC reports
  var { data: images, error: mediaErr } = await supabase
    .from('report_media')
    .select('id, report_id, url, media_type')
    .in('report_id', reportIds)
    .eq('media_type', 'image');

  if (mediaErr) {
    console.error('Error fetching media:', mediaErr);
    return;
  }

  if (!images || images.length === 0) {
    console.log('No hotlinked images found. Nothing to remove.');
    return;
  }

  console.log('Found ' + images.length + ' hotlinked images to remove:\n');
  images.forEach(function(img, i) {
    var report = nuforcReports.find(function(r) { return r.id === img.report_id; });
    console.log((i + 1) + '. ' + (report ? report.title : 'unknown') + '\n   URL: ' + img.url + '\n');
  });

  // Delete the image media items
  var imageIds = images.map(function(img) { return img.id; });
  var { error: deleteErr, count } = await supabase
    .from('report_media')
    .delete({ count: 'exact' })
    .in('id', imageIds);

  if (deleteErr) {
    console.error('Error deleting images:', deleteErr);
    return;
  }

  console.log('Deleted ' + (count || 0) + ' hotlinked images.');

  // Also update has_photo_video flag on affected reports if they no longer have any media
  for (var i = 0; i < reportIds.length; i++) {
    var rid = reportIds[i];
    var { data: remaining } = await supabase
      .from('report_media')
      .select('id')
      .eq('report_id', rid);

    if (!remaining || remaining.length === 0) {
      // No media left — but keep has_photo_video true if the description mentions it
      // (the MediaMentionBanner will handle surfacing it)
    }
  }

  console.log('\nDone! NUFORC reports will now show the MediaMentionBanner');
  console.log('component linking to the source page instead of hotlinked images.');
}

main().catch(function(err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
