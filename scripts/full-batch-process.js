/**
 * Full Batch Process - Browser Console Script
 *
 * Run this in the browser console while logged in as admin to:
 * 1. Generate AI content for all phenomena
 * 2. Link all reports to phenomena
 *
 * Usage:
 * 1. Go to https://beta.discoverparadocs.com
 * 2. Log in as admin
 * 3. Open browser console (F12 -> Console)
 * 4. Copy/paste this entire script and run it
 */

(async function fullBatchProcess() {
  const CONTENT_BATCH_SIZE = 5;    // Small batches for AI content (rate limited)
  const LINK_BATCH_SIZE = 1000;    // Larger batches for linking
  const CONTENT_DELAY = 3000;       // 3 second delay between content batches
  const LINK_DELAY = 1000;          // 1 second delay between link batches

  console.log('='.repeat(70));
  console.log('FULL BATCH PROCESS - Phenomena Encyclopedia');
  console.log('='.repeat(70));
  console.log('');

  // Step 1: Check current status
  console.log('[1/3] Checking current status...');
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

  console.log('Current Status:');
  console.log(`  Phenomena: ${statusData.status.phenomena.total} total, ${statusData.status.phenomena.withContent} with content`);
  console.log(`  Reports: ${statusData.status.reports.total} total, ${statusData.status.reports.linked} with links`);
  console.log('');

  // Step 2: Generate AI content for phenomena
  const needsContent = statusData.status.phenomena.needsContent;
  if (needsContent > 0) {
    console.log(`[2/3] Generating AI content for ${needsContent} phenomena...`);
    console.log('  (This may take a while due to AI rate limits)');
    console.log('');

    let contentOffset = 0;
    let contentDone = false;
    let totalGenerated = 0;
    let totalFailed = 0;

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
        console.error('Content generation error:', data);
        break;
      }

      totalGenerated += data.results.success;
      totalFailed += data.results.failed;

      if (data.results.details) {
        data.results.details.forEach(d => {
          const icon = d.status === 'success' ? '✓' : '✗';
          console.log(`  ${icon} ${d.name}`);
        });
      }

      console.log(`  Progress: ${totalGenerated} generated, ${totalFailed} failed, ${data.remaining || 0} remaining`);

      contentDone = data.done;
      contentOffset = data.nextOffset;

      if (!contentDone) {
        await new Promise(resolve => setTimeout(resolve, CONTENT_DELAY));
      }
    }

    console.log('');
    console.log(`Content generation complete: ${totalGenerated} success, ${totalFailed} failed`);
    console.log('');
  } else {
    console.log('[2/3] All phenomena already have content ✓');
    console.log('');
  }

  // Step 3: Link reports to phenomena
  console.log(`[3/3] Linking ${statusData.status.reports.total.toLocaleString()} reports to phenomena...`);
  console.log('');

  let linkOffset = 0;
  let linkDone = false;
  let totalProcessed = 0;
  let totalMatches = 0;
  let totalLinked = 0;
  const startTime = Date.now();

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
      console.error('Link error:', data);
      break;
    }

    totalProcessed += data.results.processed;
    totalMatches += data.results.matches;
    totalLinked += data.results.linked;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (totalProcessed / (elapsed / 60)).toFixed(0);
    const progress = ((linkOffset / (data.totalReports || 1)) * 100).toFixed(1);

    console.log(`  Batch: ${data.results.processed} processed, ${data.results.matches} matches | Total: ${totalProcessed.toLocaleString()} (${progress}%) | ${rate}/min`);

    linkDone = data.done;
    linkOffset = data.nextOffset;

    if (!linkDone) {
      await new Promise(resolve => setTimeout(resolve, LINK_DELAY));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('='.repeat(70));
  console.log('BATCH PROCESS COMPLETE');
  console.log('='.repeat(70));
  console.log(`Reports processed: ${totalProcessed.toLocaleString()}`);
  console.log(`Matches found: ${totalMatches.toLocaleString()}`);
  console.log(`Links created: ${totalLinked.toLocaleString()}`);
  console.log(`Time elapsed: ${totalTime}s`);
  console.log('='.repeat(70));

  return {
    contentGenerated: statusData.status.phenomena.needsContent,
    reportsProcessed: totalProcessed,
    matchesFound: totalMatches,
    linksCreated: totalLinked,
    timeSeconds: parseFloat(totalTime)
  };
})();
