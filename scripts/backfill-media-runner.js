/**
 * Media Backfill Runner - Browser Console Script
 *
 * Extracts media URLs from existing Reddit report descriptions
 * and inserts them into the report_media table.
 *
 * Features:
 *   - URL-level deduplication (won't insert same URL twice per report)
 *   - Junk media filtering (logos, tracking pixels, Reddit system images, etc.)
 *   - Dead URL validation (HEAD requests to verify media is still live)
 *   - Content viability classification (flags media-primary posts with dead media)
 *
 * Two modes:
 *   "text" (default) - Fast, free: extracts URLs from description text
 *   "arctic" - Slower: fetches original posts from Arctic Shift API
 *
 * Usage:
 * 1. Go to https://beta.discoverparadocs.com
 * 2. Log in as admin
 * 3. Open browser console (F12 -> Console)
 * 4. Copy/paste this entire script and run it
 *
 * To stop gracefully:   window.STOP_MEDIA = true
 * To reset progress:    localStorage.removeItem('mediaBackfillProgress')
 * To resume from stop:  just re-run the script
 */

(async function mediaBackfillRunner() {
  const MODE = 'text'; // Change to 'arctic' for Pass 2
  const BATCH_SIZE = MODE === 'text' ? 100 : 50; // Smaller batches since HEAD requests add latency
  const DELAY_MS = MODE === 'text' ? 500 : 1000;
  const MAX_RETRIES = 3;
  const RETRY_BASE_DELAY = 2000;

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

  try {
    getHeaders();
  } catch (e) {
    console.error('%c✗ ' + e.message, 'color: #F44336; font-weight: bold');
    return;
  }

  const STORAGE_KEY = 'mediaBackfillProgress';
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');

  let offset = saved?.offset || 0;
  let totalProcessed = saved?.totalProcessed || 0;
  let totalMediaFound = saved?.totalMediaFound || 0;
  let totalMediaInserted = saved?.totalMediaInserted || 0;
  let totalAlreadyHas = saved?.totalAlreadyHas || 0;
  let totalJunkFiltered = saved?.totalJunkFiltered || 0;
  let totalDuplicates = saved?.totalDuplicates || 0;
  let totalDeadUrls = saved?.totalDeadUrls || 0;
  let totalFlagged = saved?.totalFlagged || 0;
  let batchCount = saved?.batchCount || 0;
  let done = false;
  let errors = 0;

  window.STOP_MEDIA = false;

  const batchTimes = [];
  const MAX_ROLLING = 20;

  console.log('='.repeat(60));
  console.log(`MEDIA BACKFILL RUNNER - Mode: ${MODE.toUpperCase()}`);
  console.log('  ✓ URL-level deduplication');
  console.log('  ✓ Junk media filtering');
  console.log('  ✓ Dead URL validation (HEAD requests)');
  console.log('  ✓ Content viability classification');
  console.log('='.repeat(60));
  if (saved) {
    console.log(`%cRESUMING from batch ${batchCount}, offset ${offset}`, 'color: #4CAF50; font-weight: bold');
    console.log(`  Previous: ${totalProcessed.toLocaleString()} processed, ${totalMediaInserted.toLocaleString()} inserted, ${totalFlagged.toLocaleString()} flagged`);
  }
  console.log(`Batch size: ${BATCH_SIZE} | Delay: ${DELAY_MS}ms | Mode: ${MODE}`);
  console.log(`To stop: window.STOP_MEDIA = true`);
  console.log(`To reset: localStorage.removeItem('${STORAGE_KEY}')`);
  console.log('');

  const sessionStart = Date.now();

  while (!done) {
    if (window.STOP_MEDIA) {
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
        const response = await fetch('/api/admin/batch-media-backfill', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            batchSize: BATCH_SIZE,
            offset: offset,
            mode: MODE,
            dryRun: false
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
        }

        result = await response.json();
        if (!result.success) throw new Error(`API Error: ${result.error}`);
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
      console.error(`%c✗ Batch ${batchCount} failed: ${lastError?.message}`, 'color: #F44336');
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
    const r = result.results;

    totalProcessed += r.processed;
    totalMediaFound += r.mediaFound;
    totalMediaInserted += r.mediaInserted;
    totalAlreadyHas += r.alreadyHasMedia || 0;
    totalJunkFiltered += r.filteredJunk || 0;
    totalDuplicates += r.duplicateSkipped || 0;
    totalDeadUrls += r.deadUrlSkipped || 0;
    totalFlagged += r.mediaPrimaryFlagged || 0;

    const batchTime = Date.now() - batchStart;
    batchTimes.push(batchTime);
    if (batchTimes.length > MAX_ROLLING) batchTimes.shift();

    const avgBatchMs = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
    const sessionElapsed = ((Date.now() - sessionStart) / 1000).toFixed(1);
    const rate = (totalProcessed / (sessionElapsed / 60)).toFixed(0);

    const estimatedTotal = result.totalRemaining
      ? totalProcessed + result.totalRemaining
      : 1500000;
    const estimatedRemaining = Math.max(0, estimatedTotal - totalProcessed);
    const batchesRemaining = Math.ceil(estimatedRemaining / BATCH_SIZE);
    const etaMs = batchesRemaining * (avgBatchMs + DELAY_MS);
    const etaMin = (etaMs / 60000).toFixed(1);

    const pct = ((totalProcessed / estimatedTotal) * 100).toFixed(2);

    // Build compact status parts
    const parts = [`+${r.mediaInserted} inserted`];
    if (r.deadUrlSkipped) parts.push(`-${r.deadUrlSkipped} dead`);
    if (r.filteredJunk) parts.push(`-${r.filteredJunk} junk`);
    if (r.mediaPrimaryFlagged) parts.push(`⚑${r.mediaPrimaryFlagged} flagged`);

    console.log(
      `[Batch ${batchCount}] ${r.processed} checked, ${parts.join(', ')} ` +
      `| %c${pct}%` +
      `%c | ${totalProcessed.toLocaleString()} total | ~${rate}/min | ETA: ${etaMin}m`,
      'color: #4CAF50; font-weight: bold',
      'color: inherit'
    );

    // Show classification breakdown periodically
    if (r.classificationCounts && batchCount % 5 === 1) {
      const cc = r.classificationCounts;
      console.log(`  📊 Classification: ${cc['text-primary'] || 0} text, ${cc['media-primary'] || 0} media, ${cc['link-primary'] || 0} link`);
    }

    // Show sample media periodically
    if (r.sampleMedia && r.sampleMedia.length > 0 && batchCount % 10 === 1) {
      console.log('  ✅ Sample media inserted:');
      r.sampleMedia.forEach(s => console.log(`    📸 [${s.type}] "${s.title}" → ${s.url}`));
    }

    // Show filtered/dead samples
    if (r.sampleFiltered && r.sampleFiltered.length > 0 && batchCount % 10 === 1) {
      console.log('  %c🚫 Filtered out:', 'color: #9E9E9E');
      r.sampleFiltered.forEach(s => console.log(`    [${s.reason}] "${s.title}" → ${s.url}`));
    }

    // Show flagged media-primary posts
    if (r.sampleFlagged && r.sampleFlagged.length > 0) {
      console.log('  %c⚑ Flagged (media-primary, no viable media):', 'color: #FF9800');
      r.sampleFlagged.forEach(s => console.log(`    [${s.reason}] "${s.title}"`));
    }

    done = result.done;
    offset = result.nextOffset || (offset + BATCH_SIZE);

    if (batchCount % 5 === 0) saveProgress();

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
  console.log(done ? 'MEDIA BACKFILL COMPLETE ✓' : 'MEDIA BACKFILL PAUSED (re-run to resume)');
  console.log('='.repeat(60));
  console.log(`Total batches this session: ${batchCount - (saved?.batchCount || 0)}`);
  console.log(`Total reports checked: ${totalProcessed.toLocaleString()}`);
  console.log(`Media found in text: ${totalMediaFound.toLocaleString()}`);
  console.log(`Media inserted (live): ${totalMediaInserted.toLocaleString()}`);
  console.log(`Dead URLs skipped: ${totalDeadUrls.toLocaleString()}`);
  console.log(`Junk media filtered: ${totalJunkFiltered.toLocaleString()}`);
  console.log(`Duplicates skipped: ${totalDuplicates.toLocaleString()}`);
  console.log(`Media-primary flagged: ${totalFlagged.toLocaleString()}`);
  console.log(`Session time: ${totalTime}s`);
  console.log(`Average rate: ${(totalProcessed / (totalTime / 60)).toFixed(0)} reports/min`);
  if (!done) {
    console.log(`%cSaved at offset ${offset}. Re-run script to continue.`, 'color: #FF9800');
  }
  console.log('='.repeat(60));

  return {
    batches: batchCount,
    processed: totalProcessed,
    mediaFound: totalMediaFound,
    mediaInserted: totalMediaInserted,
    deadUrlsSkipped: totalDeadUrls,
    junkFiltered: totalJunkFiltered,
    duplicatesSkipped: totalDuplicates,
    mediaPrimaryFlagged: totalFlagged,
    timeSeconds: parseFloat(totalTime),
    done
  };

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      offset, totalProcessed, totalMediaFound, totalMediaInserted, totalAlreadyHas,
      totalJunkFiltered, totalDuplicates, totalDeadUrls, totalFlagged, batchCount,
      savedAt: new Date().toISOString()
    }));
  }
})();
