// Node.js ESM script to bulk import from Arctic Shift
// Run with: node scripts/run-import.mjs

const ARCTIC_SHIFT_API = 'https://arctic-shift.photon-reddit.com/api/posts/search';
const IMPORT_API = 'https://beta.discoverparadocs.com/api/admin/direct-import';

const SUBREDDITS = [
  'nde', 'tulpas', 'astralprojection', 'luciddreaming', 'psychonaut',
  'psychic', 'skinwalkers', 'cryptozoology', 'haunted', 'humanoidencounters',
  'aliens', 'thetruthishere', 'ufo', 'uap'
];

async function fetchPosts(subreddit, beforeTs, limit = 500) {
  let url = `${ARCTIC_SHIFT_API}?subreddit=${subreddit}&limit=${limit}`;
  if (beforeTs) url += `&before=${beforeTs}`;

  const resp = await fetch(url);
  const data = await resp.json();
  return data.data || [];
}

async function importPosts(posts) {
  const resp = await fetch(IMPORT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ posts })
  });
  const result = await resp.json();
  return result.result || { inserted: 0, skipped: 0, rejected: 0, errors: 0 };
}

async function processSubreddit(subreddit) {
  console.log(`\n=== Processing r/${subreddit} ===`);

  let beforeTs = null;
  let stats = { total: 0, inserted: 0, skipped: 0, rejected: 0 };

  for (let batch = 1; batch <= 100; batch++) {
    const posts = await fetchPosts(subreddit, beforeTs);

    if (posts.length === 0) {
      console.log(`  Batch ${batch}: No more posts`);
      break;
    }

    stats.total += posts.length;
    const result = await importPosts(posts);

    stats.inserted += result.inserted;
    stats.skipped += result.skipped;
    stats.rejected += result.rejected;

    console.log(`  Batch ${batch}: ${posts.length} posts -> +${result.inserted} new, ${result.skipped} skip`);

    beforeTs = posts[posts.length - 1]?.created_utc;

    if (posts.length < 500) break;

    // Rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  DONE: ${stats.inserted} inserted from ${stats.total} total`);
  return stats;
}

async function main() {
  console.log('=== Arctic Shift Bulk Import ===\n');
  console.log(`Processing ${SUBREDDITS.length} subreddits...`);

  const results = {};
  const grandTotal = { posts: 0, inserted: 0, skipped: 0, rejected: 0 };

  for (const sub of SUBREDDITS) {
    try {
      const stats = await processSubreddit(sub);
      results[sub] = stats;
      grandTotal.posts += stats.total;
      grandTotal.inserted += stats.inserted;
      grandTotal.skipped += stats.skipped;
      grandTotal.rejected += stats.rejected;
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results[sub] = { error: err.message };
    }

    // Delay between subreddits
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n\n========== FINAL RESULTS ==========');
  console.log(JSON.stringify(results, null, 2));
  console.log('\nGRAND TOTAL:', JSON.stringify(grandTotal));
}

main().catch(console.error);
