/**
 * Batch Link Runner - Browser Console Script
 *
 * Run this in the browser console while logged in as admin to process
 * all reports and link them to phenomena.
 *
 * Usage:
 * 1. Go to https://beta.discoverparadocs.com
 * 2. Log in as admin
 * 3. Open browser console (F12 -> Console)
 * 4. Copy/paste this entire script and run it
 */

(async function batchLinkRunner() {
  const BATCH_SIZE = 500;  // Process 500 reports per batch
  const DELAY_MS = 2000;   // 2 second delay between batches
  const MAX_BATCHES = null; // Set to a number to limit, or null for all

  let offset = 0;
  let totalProcessed = 0;
  let totalLinked = 0;
  let totalMatches = 0;
  let totalSkipped = 0;
  let batchCount = 0;
  let done = false;

  console.log('='.repeat(60));
  console.log('BATCH LINK RUNNER - Processing all reports');
  console.log('='.repeat(60));
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Delay between batches: ${DELAY_MS}ms`);
  console.log('');

  const startTime = Date.now();

  while (!done) {
    batchCount++;

    if (MAX_BATCHES && batchCount > MAX_BATCHES) {
      console.log(`Reached max batch limit (${MAX_BATCHES})`);
      break;
    }

    console.log(`[Batch ${batchCount}] Processing offset ${offset}...`);

    try {
      const response = await fetch('/api/admin/phenomena/batch-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchSize: BATCH_SIZE,
          offset: offset,
          dryRun: false
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[Batch ${batchCount}] HTTP Error:`, error);
        break;
      }

      const result = await response.json();

      if (!result.success) {
        console.error(`[Batch ${batchCount}] API Error:`, result.error);
        break;
      }

      // Update totals
      totalProcessed += result.results.processed;
      totalLinked += result.results.linked;
      totalMatches += result.results.matches;
      totalSkipped += result.results.skipped;

      // Progress update
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (totalProcessed / (elapsed / 60)).toFixed(0);

      console.log(`[Batch ${batchCount}] Processed: ${result.results.processed}, Linked: ${result.results.linked}, Matches: ${result.results.matches}, Skipped: ${result.results.skipped}`);
      console.log(`  Total: ${totalProcessed} processed, ${totalLinked} linked, ${totalMatches} matches (${elapsed}s elapsed, ~${rate}/min)`);

      // Show sample links if any new ones
      if (result.results.sampleLinks && result.results.sampleLinks.length > 0) {
        console.log('  Sample new links:');
        result.results.sampleLinks.slice(0, 3).forEach(link => {
          console.log(`    - "${link.reportTitle}" → ${link.phenomenonName} (${(link.confidence * 100).toFixed(0)}%)`);
        });
      }

      // Check if done
      done = result.done;
      offset = result.nextOffset || offset;

      if (!done) {
        // Delay before next batch
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }

    } catch (error) {
      console.error(`[Batch ${batchCount}] Fetch Error:`, error);
      break;
    }
  }

  // Final summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('='.repeat(60));
  console.log('BATCH LINK COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total batches: ${batchCount}`);
  console.log(`Total reports processed: ${totalProcessed.toLocaleString()}`);
  console.log(`Total matches found: ${totalMatches.toLocaleString()}`);
  console.log(`Total new links created: ${totalLinked.toLocaleString()}`);
  console.log(`Total skipped (already linked): ${totalSkipped.toLocaleString()}`);
  console.log(`Time elapsed: ${totalTime}s`);
  console.log(`Average rate: ${(totalProcessed / (totalTime / 60)).toFixed(0)} reports/min`);
  console.log('='.repeat(60));

  return {
    batches: batchCount,
    processed: totalProcessed,
    matches: totalMatches,
    linked: totalLinked,
    skipped: totalSkipped,
    timeSeconds: parseFloat(totalTime)
  };
})();
