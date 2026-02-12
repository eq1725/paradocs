/**
 * Media Pipeline Test — Small batch test script
 *
 * Tests the full media pipeline on a small batch:
 *   - URL extraction from text
 *   - Junk media filtering
 *   - Dead URL validation (HEAD requests)
 *   - Content viability classification
 *   - Arctic Shift recovery for media-primary posts
 *   - Auto-archive for hollow reports
 *
 * Paste into browser console on beta.discoverparadocs.com
 */
(async function testMediaPipeline() {
  const BATCH_SIZE = 100;
  const MAX_BATCHES = 10; // ~1000 reports
  const START_OFFSET = 1500; // Start past previous tests

  function getHeaders() {
    const t = JSON.parse(localStorage.getItem('sb-bhkbctdmwnowfmqpksed-auth-token') || 'null');
    if (!t?.access_token) throw new Error('Not logged in');
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t.access_token}` };
  }

  let offset = START_OFFSET;
  const totals = { checked: 0, inserted: 0, dead: 0, junk: 0, flagged: 0, archived: 0, recovered: 0 };

  console.log('='.repeat(55));
  console.log('MEDIA PIPELINE TEST — Full pipeline with recovery');
  console.log('='.repeat(55));

  for (let batch = 1; batch <= MAX_BATCHES; batch++) {
    const start = Date.now();
    const res = await fetch('/api/admin/batch-media-backfill', {
      method: 'POST', headers: getHeaders(),
      body: JSON.stringify({ batchSize: BATCH_SIZE, offset, mode: 'text', dryRun: false })
    });
    const data = await res.json();
    if (!data.success) { console.error('Failed:', data); break; }

    const r = data.results;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    totals.checked += r.processed;
    totals.inserted += r.mediaInserted;
    totals.dead += r.deadUrlSkipped || 0;
    totals.junk += r.filteredJunk || 0;
    totals.flagged += r.mediaPrimaryFlagged || 0;
    totals.archived += r.mediaPrimaryArchived || 0;
    totals.recovered += r.mediaRecovered || 0;

    const cc = r.classificationCounts || {};
    const parts = [];
    if (r.mediaInserted) parts.push(`+${r.mediaInserted} inserted`);
    if (r.mediaRecovered) parts.push(`🔄${r.mediaRecovered} recovered`);
    if (r.deadUrlSkipped) parts.push(`💀${r.deadUrlSkipped} dead`);
    if (r.mediaPrimaryArchived) parts.push(`📦${r.mediaPrimaryArchived} archived`);

    console.log(
      `[${batch}/${MAX_BATCHES}] ${parts.join(', ') || 'no media'} | ` +
      `${cc['text-primary']||0}T ${cc['media-primary']||0}M ${cc['link-primary']||0}L | ${elapsed}s`
    );

    // Show recovered media
    if (r.sampleMedia?.length) {
      r.sampleMedia.filter(s => s.title.includes('[recovered]')).forEach(s =>
        console.log(`  🔄 Recovered: "${s.title}" → ${s.url}`)
      );
    }

    // Show archived posts
    if (r.sampleArchived?.length) {
      r.sampleArchived.forEach(s =>
        console.log(`  📦 Archived: "${s.title}" [${s.reason}]`)
      );
    }

    // Show dead URLs
    if (r.sampleFiltered?.length) {
      r.sampleFiltered.filter(s => s.reason === 'dead-url').forEach(s =>
        console.log(`  💀 Dead: ${s.url}`)
      );
    }

    offset = data.nextOffset;
    if (data.done) break;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(55));
  console.log('PIPELINE TEST COMPLETE');
  console.log('='.repeat(55));
  console.log(`Reports checked:     ${totals.checked}`);
  console.log(`Media inserted:      ${totals.inserted} (${totals.recovered} recovered via Arctic Shift)`);
  console.log(`Dead URLs skipped:   ${totals.dead}`);
  console.log(`Junk filtered:       ${totals.junk}`);
  console.log(`Media-primary found: ${totals.flagged}`);
  console.log(`Archived (hollow):   ${totals.archived}`);
  console.log('='.repeat(55));
  console.log('\n→ Check the site to verify inserted media looks good');
  console.log('→ Archived reports should no longer appear in searches');
})();
