/**
 * Batch Link Runner v2 - Optimized Browser Console Script
 *
 * Processes ~1.9M reports to link them to phenomena via pattern matching.
 *
 * Usage:
 * 1. Go to https://beta.discoverparadocs.com
 * 2. Log in as admin
 * 3. Open browser console (F12 -> Console)
 * 4. Copy/paste this entire script and run it
 *
 * To stop gracefully:   window.STOP_BATCH = true
 * To reset progress:    localStorage.removeItem('batchLinkProgress')
 * To resume from stop:  just re-run the script
 */

(async function batchLinkRunnerV2() {
  const BATCH_SIZE = 1000;
  const DELAY_MS = 500;
  const MAX_RETRIES = 3;
  const RETRY_BASE_DELAY = 2000;

  // Get auth token from localStorage
  const tokenData = JSON.parse(localStorage.getItem('sb-bhkbctdmwnowfmqpksed-auth-token') || 'null');
  const accessToken = tokenData?.access_token;
  if (!accessToken) {
    console.error('%c✗ No auth token found. Make sure you are logged in.', 'color: #F44336; font-weight: bold');
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  };

  // Resume support
  const STORAGE_KEY = 'batchLinkProgress';
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');

  let offset = saved?.offset || 0;
  let totalProcessed = saved?.totalProcessed || 0;
  let totalLinked = saved?.totalLinked || 0;
  let totalMatches = saved?.totalMatches || 0;
  let totalSkipped = saved?.totalSkipped || 0;
  let batchCount = saved?.batchCount || 0;
  let done = false;
  let errors = 0;

  // Graceful stop flag
  window.STOP_BATCH = false;

  // Rolling average for ETA
  const batchTimes = [];
  const MAX_ROLLING = 20;

  console.log('='.repeat(60));
  console.log('BATCH LINK RUNNER v2 - Optimized for 1.9M reports');
  console.log('='.repeat(60));
  if (saved) {
    console.log(`%cRESUMING from batch ${batchCount}, offset ${offset}`, 'color: #4CAF50; font-weight: bold');
    console.log(`  Previous progress: ${totalProcessed.toLocaleString()} processed, ${totalLinked.toLocaleString()} linked`);
  }
  console.log(`Batch size: ${BATCH_SIZE} | Delay: ${DELAY_MS}ms | Retries: ${MAX_RETRIES}`);
  console.log(`To stop: window.STOP_BATCH = true`);
  console.log(`To reset: localStorage.removeItem('${STORAGE_KEY}')`);
  console.log('');

  const sessionStart = Date.now();

  while (!done) {
    if (window.STOP_BATCH) {
      console.log('%c⏸ STOPPED by user. Re-run script to resume.', 'color: #FF9800; font-weight: bold');
      saveProgress();
      break;
    }

    batchCount++;
    const batchStart = Date.now();

    let result = null;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch('/api/admin/phenomena/batch-link', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            batchSize: BATCH_SIZE,
            offset: offset,
            dryRun: false
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
        }

        result = await response.json();

        if (!result.success) {
          throw new Error(`API Error: ${result.error}`);
        }

        break;

      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          const retryDelay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
          console.warn(`  ⚠ Attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}. Retrying in ${retryDelay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    if (!result) {
      console.error(`%c✗ Batch ${batchCount} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`, 'color: #F44336');
      errors++;
      saveProgress();
      if (errors >= 5) {
        console.error('%cToo many consecutive errors. Stopping. Re-run to resume.', 'color: #F44336; font-weight: bold');
        break;
      }
      offset += BATCH_SIZE;
      await new Promise(resolve => setTimeout(resolve, RETRY_BASE_DELAY * 4));
      continue;
    }

    errors = 0;

    totalProcessed += result.results.processed;
    totalLinked += result.results.linked;
    totalMatches += result.results.matches;
    totalSkipped += result.results.skipped;

    const batchTime = Date.now() - batchStart;
    batchTimes.push(batchTime);
    if (batchTimes.length > MAX_ROLLING) batchTimes.shift();

    const avgBatchMs = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
    const sessionElapsed = ((Date.now() - sessionStart) / 1000).toFixed(1);
    const rate = (totalProcessed / (sessionElapsed / 60)).toFixed(0);

    const estimatedRemaining = Math.max(0, 1960000 - totalProcessed);
    const batchesRemaining = Math.ceil(estimatedRemaining / BATCH_SIZE);
    const etaMs = batchesRemaining * (avgBatchMs + DELAY_MS);
    const etaMin = (etaMs / 60000).toFixed(1);

    const pct = ((totalProcessed / 1960000) * 100).toFixed(2);

    console.log(
      `[Batch ${batchCount}] +${result.results.processed} processed, +${result.results.linked} linked, +${result.results.matches} matches ` +
      `| %c${pct}%` +
      `%c | Total: ${totalProcessed.toLocaleString()} | ~${rate}/min | ETA: ${etaMin}m`,
      'color: #4CAF50; font-weight: bold',
      'color: inherit'
    );

    if (result.results.sampleLinks && result.results.sampleLinks.length > 0 && batchCount % 10 === 1) {
      console.log('  Sample links:');
      result.results.sampleLinks.slice(0, 3).forEach(link => {
        console.log(`    → "${link.reportTitle}" → ${link.phenomenonName} (${(link.confidence * 100).toFixed(0)}%)`);
      });
    }

    done = result.done;
    offset = result.nextOffset || (offset + BATCH_SIZE);

    if (batchCount % 10 === 0) {
      saveProgress();
    }

    if (!done) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  if (done) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    saveProgress();
  }

  const totalTime = ((Date.now() - sessionStart) / 1000).toFixed(1);

  console.log('');
  console.log('='.repeat(60));
  console.log(done ? 'BATCH LINK COMPLETE ✓' : 'BATCH LINK PAUSED (re-run to resume)');
  console.log('='.repeat(60));
  console.log(`Total batches this session: ${batchCount - (saved?.batchCount || 0)}`);
  console.log(`Total reports processed: ${totalProcessed.toLocaleString()}`);
  console.log(`Total matches found: ${totalMatches.toLocaleString()}`);
  console.log(`Total new links created: ${totalLinked.toLocaleString()}`);
  console.log(`Total skipped (already linked): ${totalSkipped.toLocaleString()}`);
  console.log(`Session time: ${totalTime}s`);
  console.log(`Average rate: ${(totalProcessed / (totalTime / 60)).toFixed(0)} reports/min`);
  if (!done) {
    console.log(`%cSaved at offset ${offset}. Re-run script to continue.`, 'color: #FF9800');
  }
  console.log('='.repeat(60));

  return {
    batches: batchCount,
    processed: totalProcessed,
    matches: totalMatches,
    linked: totalLinked,
    skipped: totalSkipped,
    timeSeconds: parseFloat(totalTime),
    done
  };

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      offset, totalProcessed, totalLinked, totalMatches, totalSkipped, batchCount,
      savedAt: new Date().toISOString()
    }));
  }
})();
