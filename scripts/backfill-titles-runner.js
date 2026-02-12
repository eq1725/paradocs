/**
 * Title Backfill Runner - Browser Console Script
 *
 * Pattern-based title improvement for ~1.5M+ Reddit reports.
 * Runs FREE pattern matching (no AI cost) to replace raw Reddit titles
 * with descriptive, phenomenon-aware titles.
 *
 * Usage:
 * 1. Go to https://beta.discoverparadocs.com
 * 2. Log in as admin
 * 3. Open browser console (F12 -> Console)
 * 4. Copy/paste this entire script and run it
 *
 * To stop gracefully:   window.STOP_TITLES = true
 * To reset progress:    localStorage.removeItem('titleBackfillProgress')
 * To resume from stop:  just re-run the script
 */

(async function titleBackfillRunner() {
  const BATCH_SIZE = 500;
  const DELAY_MS = 300;
  const MAX_RETRIES = 3;
  const RETRY_BASE_DELAY = 2000;

  // Fresh headers on every call (prevents token expiry)
  function getHeaders() {
    const tokenData = JSON.parse(localStorage.getItem('sb-bhkbctdmwnowfmqpksed-auth-token') || 'null');
    const accessToken = tokenData?.access_token;
    if (!accessToken) {
      throw new Error('No auth token found. Make sure you are logged in.');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    };
  }

  // Verify auth
  try {
    getHeaders();
  } catch (e) {
    console.error('%c✗ ' + e.message, 'color: #F44336; font-weight: bold');
    return;
  }

  // Resume support
  const STORAGE_KEY = 'titleBackfillProgress';
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');

  let offset = saved?.offset || 0;
  let totalProcessed = saved?.totalProcessed || 0;
  let totalImproved = saved?.totalImproved || 0;
  let totalSkipped = saved?.totalSkipped || 0;
  let totalAlreadyGood = saved?.totalAlreadyGood || 0;
  let batchCount = saved?.batchCount || 0;
  let done = false;
  let errors = 0;

  // Graceful stop flag
  window.STOP_TITLES = false;

  // Rolling average for ETA
  const batchTimes = [];
  const MAX_ROLLING = 20;

  console.log('='.repeat(60));
  console.log('TITLE BACKFILL RUNNER - Pattern-based (FREE)');
  console.log('='.repeat(60));
  if (saved) {
    console.log(`%cRESUMING from batch ${batchCount}, offset ${offset}`, 'color: #4CAF50; font-weight: bold');
    console.log(`  Previous: ${totalProcessed.toLocaleString()} processed, ${totalImproved.toLocaleString()} improved`);
  }
  console.log(`Batch size: ${BATCH_SIZE} | Delay: ${DELAY_MS}ms`);
  console.log(`To stop: window.STOP_TITLES = true`);
  console.log(`To reset: localStorage.removeItem('${STORAGE_KEY}')`);
  console.log('');

  const sessionStart = Date.now();

  while (!done) {
    if (window.STOP_TITLES) {
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
        const response = await fetch('/api/admin/backfill-titles', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            batchSize: BATCH_SIZE,
            offset: offset,
            mode: 'pattern',
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
        console.error('%cToo many consecutive errors. Stopping.', 'color: #F44336; font-weight: bold');
        break;
      }
      offset += BATCH_SIZE;
      await new Promise(resolve => setTimeout(resolve, RETRY_BASE_DELAY * 4));
      continue;
    }

    errors = 0;

    totalProcessed += result.results.processed;
    totalImproved += result.results.improved;
    totalSkipped += result.results.skipped;
    totalAlreadyGood += result.results.alreadyGood;

    const batchTime = Date.now() - batchStart;
    batchTimes.push(batchTime);
    if (batchTimes.length > MAX_ROLLING) batchTimes.shift();

    const avgBatchMs = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
    const sessionElapsed = ((Date.now() - sessionStart) / 1000).toFixed(1);
    const rate = (totalProcessed / (sessionElapsed / 60)).toFixed(0);

    // Estimate remaining (use totalRemaining from first batch if available)
    const estimatedTotal = result.totalRemaining
      ? totalProcessed + result.totalRemaining
      : 1500000; // Fallback estimate
    const estimatedRemaining = Math.max(0, estimatedTotal - totalProcessed);
    const batchesRemaining = Math.ceil(estimatedRemaining / BATCH_SIZE);
    const etaMs = batchesRemaining * (avgBatchMs + DELAY_MS);
    const etaMin = (etaMs / 60000).toFixed(1);

    const pct = ((totalProcessed / estimatedTotal) * 100).toFixed(2);

    console.log(
      `[Batch ${batchCount}] +${result.results.processed} processed, +${result.results.improved} improved, +${result.results.alreadyGood} good ` +
      `| %c${pct}%` +
      `%c | Total: ${totalProcessed.toLocaleString()} | ~${rate}/min | ETA: ${etaMin}m`,
      'color: #4CAF50; font-weight: bold',
      'color: inherit'
    );

    // Show sample improvements periodically
    if (result.results.sampleImprovements && result.results.sampleImprovements.length > 0 && batchCount % 10 === 1) {
      console.log('  Sample improvements:');
      result.results.sampleImprovements.forEach(s => {
        console.log(`    ✎ "${s.old}" → "${s.new}"`);
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
  console.log(done ? 'TITLE BACKFILL COMPLETE ✓' : 'TITLE BACKFILL PAUSED (re-run to resume)');
  console.log('='.repeat(60));
  console.log(`Total batches this session: ${batchCount - (saved?.batchCount || 0)}`);
  console.log(`Total reports processed: ${totalProcessed.toLocaleString()}`);
  console.log(`Titles improved: ${totalImproved.toLocaleString()}`);
  console.log(`Already good (no change needed): ${totalAlreadyGood.toLocaleString()}`);
  console.log(`Skipped (no pattern match): ${totalSkipped.toLocaleString()}`);
  console.log(`Session time: ${totalTime}s`);
  console.log(`Average rate: ${(totalProcessed / (totalTime / 60)).toFixed(0)} reports/min`);
  if (!done) {
    console.log(`%cSaved at offset ${offset}. Re-run script to continue.`, 'color: #FF9800');
  }
  console.log('='.repeat(60));

  return {
    batches: batchCount,
    processed: totalProcessed,
    improved: totalImproved,
    skipped: totalSkipped,
    alreadyGood: totalAlreadyGood,
    timeSeconds: parseFloat(totalTime),
    done
  };

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      offset, totalProcessed, totalImproved, totalSkipped, totalAlreadyGood, batchCount,
      savedAt: new Date().toISOString()
    }));
  }
})();
