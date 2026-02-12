#!/usr/bin/env npx ts-node
/**
 * ParaDocs Bulk Import Script
 *
 * This script performs comprehensive data ingestion from:
 * - Reddit (via Arctic Shift API)
 * - NUFORC (via web scraper)
 * - BFRO (via web scraper)
 * - Other configured sources
 *
 * Usage:
 *   npx ts-node scripts/bulk-import-all.ts [options]
 *
 * Options:
 *   --reddit-only     Only import from Reddit
 *   --scrapers-only   Only run web scrapers
 *   --subreddit=NAME  Import single subreddit
 *   --limit=N         Limit per source (default: 1000)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DIRECT_IMPORT_API = process.env.API_BASE
  ? `${process.env.API_BASE}/api/admin/direct-import`
  : 'https://discoverparadocs.com/api/admin/direct-import';

const ADMIN_INGEST_API = process.env.API_BASE
  ? `${process.env.API_BASE}/api/admin/ingest`
  : 'https://discoverparadocs.com/api/admin/ingest';

const ARCTIC_SHIFT_API = 'https://arctic-shift.photon-reddit.com/api/posts/search';

// All paranormal-related subreddits
const SUBREDDITS = [
  // Core paranormal
  'paranormal',
  'ghosts',
  'thetruthishere',
  'haunted',
  'creepy',

  // UFOs & Aliens
  'ufos',
  'ufo',
  'aliens',
  'uap',
  'UFOB',

  // Cryptids
  'bigfoot',
  'cryptids',
  'cryptozoology',
  'dogman',
  'crawlersightings',
  'skinwalkers',
  'fleshgait',

  // High strangeness
  'highstrangeness',
  'glitch_in_the_matrix',
  'humanoidencounters',
  'missing411',
  'Thetruthishere',

  // Consciousness & experiences
  'nde',
  'astralprojection',
  'luciddreaming',
  'psychonaut',
  'psychic',
  'tulpas',

  // Shadow entities
  'shadowpeople',
  'hatman',

  // Misc
  'unexplainedphotos',
  'paranormalencounters',
  'spoopyghost',
];

interface RedditPost {
  id: string;
  title: string;
  selftext?: string;
  author: string;
  subreddit: string;
  created_utc: number;
  score: number;
  num_comments?: number;
  permalink?: string;
  link_flair_text?: string;
}

interface ImportResult {
  subreddit: string;
  fetched: number;
  inserted: number;
  skipped: number;
  rejected: number;
  errors: number;
}

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value || true;
  return acc;
}, {} as Record<string, string | boolean>);

async function fetchFromArcticShift(
  subreddit: string,
  limit: number = 1000,
  before?: number
): Promise<RedditPost[]> {
  let url = `${ARCTIC_SHIFT_API}?subreddit=${subreddit}&limit=${limit}&sort=created_utc:desc`;

  if (before) {
    url += `&created_utc=<${before}`;
  }

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error(`  ❌ Error fetching r/${subreddit}:`, error);
    return [];
  }
}

async function importPosts(posts: RedditPost[]): Promise<{
  inserted: number;
  skipped: number;
  rejected: number;
  errors: number;
}> {
  try {
    const response = await fetch(DIRECT_IMPORT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts })
    });

    const result = await response.json();
    return result.result || { inserted: 0, skipped: 0, rejected: 0, errors: 0 };
  } catch (error) {
    console.error('  ❌ Import error:', error);
    return { inserted: 0, skipped: 0, rejected: 0, errors: posts.length };
  }
}

async function importSubreddit(
  subreddit: string,
  totalLimit: number = 2000
): Promise<ImportResult> {
  console.log(`\n📥 r/${subreddit}`);

  let allPosts: RedditPost[] = [];
  let lastTimestamp: number | undefined;
  let batchNum = 0;

  // Fetch in batches until we hit the limit
  while (allPosts.length < totalLimit) {
    batchNum++;
    const batchSize = Math.min(1000, totalLimit - allPosts.length);

    process.stdout.write(`   Batch ${batchNum}: fetching...`);
    const posts = await fetchFromArcticShift(subreddit, batchSize, lastTimestamp);

    if (posts.length === 0) {
      console.log(' done (no more posts)');
      break;
    }

    allPosts.push(...posts);
    lastTimestamp = posts[posts.length - 1]?.created_utc;
    console.log(` got ${posts.length} posts`);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));

    if (posts.length < batchSize) break;
  }

  if (allPosts.length === 0) {
    return { subreddit, fetched: 0, inserted: 0, skipped: 0, rejected: 0, errors: 0 };
  }

  // Import in batches of 500
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalRejected = 0;
  let totalErrors = 0;

  const importBatchSize = 500;
  for (let i = 0; i < allPosts.length; i += importBatchSize) {
    const batch = allPosts.slice(i, i + importBatchSize);
    process.stdout.write(`   Importing ${i + 1}-${Math.min(i + importBatchSize, allPosts.length)}...`);

    const result = await importPosts(batch);
    totalInserted += result.inserted;
    totalSkipped += result.skipped;
    totalRejected += result.rejected;
    totalErrors += result.errors;

    console.log(` +${result.inserted} inserted`);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`   ✅ Total: ${totalInserted} inserted, ${totalSkipped} skipped, ${totalRejected} rejected`);

  return {
    subreddit,
    fetched: allPosts.length,
    inserted: totalInserted,
    skipped: totalSkipped,
    rejected: totalRejected,
    errors: totalErrors
  };
}

async function triggerScraper(source: string, limit: number = 500): Promise<void> {
  console.log(`\n🔄 Triggering ${source} scraper (limit: ${limit})...`);

  try {
    const response = await fetch(`${ADMIN_INGEST_API}?source=${source}&limit=${limit}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: This requires proper auth token in production
      }
    });

    const result = await response.json();
    console.log(`   Result:`, JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`   ❌ Error triggering ${source}:`, error);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          ParaDocs Bulk Import Script                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  const limit = parseInt(args.limit as string) || 2000;
  const redditOnly = args['reddit-only'];
  const scrapersOnly = args['scrapers-only'];
  const singleSubreddit = args.subreddit as string;

  const startTime = Date.now();
  const results: ImportResult[] = [];

  // Single subreddit mode
  if (singleSubreddit) {
    console.log(`\n🎯 Importing single subreddit: r/${singleSubreddit}`);
    const result = await importSubreddit(singleSubreddit, limit);
    results.push(result);
  }
  // Reddit import
  else if (!scrapersOnly) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  PHASE 1: Reddit Import via Arctic Shift');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    for (const subreddit of SUBREDDITS) {
      try {
        const result = await importSubreddit(subreddit, limit);
        results.push(result);

        // Delay between subreddits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`  ❌ Failed to process r/${subreddit}:`, error);
      }
    }
  }

  // Web scrapers
  if (!redditOnly && !singleSubreddit) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  PHASE 2: Web Scrapers');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n⚠️  Note: Web scrapers require admin authentication.');
    console.log('   Run these via the admin panel or set ADMIN_JWT_TOKEN.');

    // These will fail without proper auth, but we show what would be done
    // await triggerScraper('nuforc', 500);
    // await triggerScraper('bfro', 200);
    // await triggerScraper('nderf', 200);
  }

  // Summary
  const duration = Math.round((Date.now() - startTime) / 1000);
  const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                    IMPORT SUMMARY                        ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Duration:      ${duration}s`.padEnd(59) + '║');
  console.log(`║  Subreddits:    ${results.length}`.padEnd(59) + '║');
  console.log(`║  Posts Fetched: ${totalFetched.toLocaleString()}`.padEnd(59) + '║');
  console.log(`║  Inserted:      ${totalInserted.toLocaleString()}`.padEnd(59) + '║');
  console.log(`║  Skipped:       ${totalSkipped.toLocaleString()}`.padEnd(59) + '║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Top subreddits by new records
  const topSubs = results
    .filter(r => r.inserted > 0)
    .sort((a, b) => b.inserted - a.inserted)
    .slice(0, 10);

  if (topSubs.length > 0) {
    console.log('\n📊 Top subreddits by new records:');
    topSubs.forEach((r, i) => {
      console.log(`   ${i + 1}. r/${r.subreddit}: +${r.inserted}`);
    });
  }
}

main().catch(console.error);
