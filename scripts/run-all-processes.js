/**
 * Run All Processes - Complete Setup Script
 *
 * This script runs ALL batch processes to fully set up the Phenomena Encyclopedia:
 * 1. Update images for all phenomena
 * 2. Generate AI content for all phenomena
 * 3. Link all reports to phenomena
 *
 * Run this in the browser console while logged in as admin at https://beta.discoverparadocs.com
 */

(async function runAllProcesses() {
  console.log('='.repeat(70));
  console.log('COMPLETE PHENOMENA ENCYCLOPEDIA SETUP');
  console.log('='.repeat(70));
  console.log('');

  const startTime = Date.now();

  // ============================================
  // STEP 1: Update Images
  // ============================================
  console.log('[STEP 1/4] Updating phenomenon images...');

  try {
    const imgRes = await fetch('/api/admin/phenomena/update-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false })
    });
    const imgData = await imgRes.json();

    if (imgData.success) {
      console.log(`  ✓ Images updated: ${imgData.results.updated} specific, ${imgData.results.categoryDefaults} defaults, ${imgData.results.skipped} skipped`);
    } else {
      console.error('  ✗ Image update failed:', imgData);
    }
  } catch (error) {
    console.error('  ✗ Image update error:', error);
  }
  console.log('');

  // ============================================
  // STEP 2: Check Status
  // ============================================
  console.log('[STEP 2/4] Checking current status...');

  const statusRes = await fetch('/api/admin/phenomena/batch-process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status' })
  });
  const statusData = await statusRes.json();

  if (!statusData.success) {
    console.error('Failed to get status:', statusData);
    return;
  }

  console.log('  Current Status:');
  console.log(`    Phenomena: ${statusData.status.phenomena.total} total, ${statusData.status.phenomena.withContent} with content, ${statusData.status.phenomena.needsContent} need content`);
  console.log(`    Reports: ${statusData.status.reports.total.toLocaleString()} total`);
  console.log('');

  // ============================================
  // STEP 3: Generate AI Content
  // ============================================
  const needsContent = statusData.status.phenomena.needsContent;

  if (needsContent > 0) {
    console.log(`[STEP 3/4] Generating AI content for ${needsContent} phenomena...`);
    console.log('  (This takes ~2 seconds per phenomenon due to AI rate limits)');
    console.log(`  Estimated time: ~${Math.ceil(needsContent * 2 / 60)} minutes`);
    console.log('');

    let contentOffset = 0;
    let contentDone = false;
    let totalGenerated = 0;
    let totalFailed = 0;
    const CONTENT_BATCH_SIZE = 5;

    while (!contentDone) {
      const res = await fetch('/api/admin/phenomena/batch-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_content',
          batchSize: CONTENT_BATCH_SIZE,
          offset: contentOffset
        })
      });

      const data = await res.json();
      if (!data.success) {
        console.error('  Content generation error:', data);
        break;
      }

      totalGenerated += data.results.success;
      totalFailed += data.results.failed;

      if (data.results.details) {
        data.results.details.forEach(d => {
          const icon = d.status === 'success' ? '✓' : '✗';
          console.log(`    ${icon} ${d.name}`);
        });
      }

      contentDone = data.done;
      contentOffset = data.nextOffset;

      if (!contentDone) {
        console.log(`  Progress: ${totalGenerated}/${needsContent} generated (${data.remaining || 0} remaining)`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log('');
    console.log(`  ✓ Content generation complete: ${totalGenerated} success, ${totalFailed} failed`);
  } else {
    console.log('[STEP 3/4] All phenomena already have content ✓');
  }
  console.log('');

  // ============================================
  // STEP 4: Link Reports to Phenomena
  // ============================================
  console.log(`[STEP 4/4] Linking ${statusData.status.reports.total.toLocaleString()} reports to phenomena...`);
  console.log('');

  let linkOffset = 0;
  let linkDone = false;
  let totalProcessed = 0;
  let totalMatches = 0;
  let totalLinked = 0;
  const linkStartTime = Date.now();
  const LINK_BATCH_SIZE = 1000;

  while (!linkDone) {
    const res = await fetch('/api/admin/phenomena/batch-process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'link_reports',
        batchSize: LINK_BATCH_SIZE,
        offset: linkOffset
      })
    });

    const data = await res.json();
    if (!data.success) {
      console.error('  Link error:', data);
      break;
    }

    totalProcessed += data.results.processed;
    totalMatches += data.results.matches;
    totalLinked += data.results.linked;

    const elapsed = ((Date.now() - linkStartTime) / 1000).toFixed(1);
    const rate = (totalProcessed / (elapsed / 60)).toFixed(0);
    const progress = data.totalReports ? ((linkOffset / data.totalReports) * 100).toFixed(1) : '?';

    console.log(`  Processed: ${totalProcessed.toLocaleString()} (${progress}%) | Matches: ${totalMatches.toLocaleString()} | Rate: ${rate}/min`);

    linkDone = data.done;
    linkOffset = data.nextOffset;

    if (!linkDone) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('');
  console.log('='.repeat(70));
  console.log('SETUP COMPLETE!');
  console.log('='.repeat(70));
  console.log(`Total time: ${totalTime} minutes`);
  console.log(`Reports processed: ${totalProcessed.toLocaleString()}`);
  console.log(`Phenomenon matches found: ${totalMatches.toLocaleString()}`);
  console.log(`Report-phenomenon links created: ${totalLinked.toLocaleString()}`);
  console.log('='.repeat(70));

  return {
    totalTime: parseFloat(totalTime),
    reportsProcessed: totalProcessed,
    matchesFound: totalMatches,
    linksCreated: totalLinked
  };
})();
