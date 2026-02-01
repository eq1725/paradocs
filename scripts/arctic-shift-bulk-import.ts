#!/usr/bin/env npx ts-node
/**
 * Arctic Shift Bulk Import Script
 *
 * Fetches Reddit posts from Arctic Shift API and imports to Paradocs
 * Uses pagination to get all historical data
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const IMPORT_API = 'https://beta.discoverparadocs.com/api/admin/direct-import';
const ARCTIC_SHIFT_API = 'https://arctic-shift.photon-reddit.com/api/posts/search';

// Remaining subreddits to import (excluding already done: paranormal, ufos, ghosts, cryptids, glitch_in_the_matrix, highstrangeness)
const REMAINING_SUBREDDITS = [
  'thetruthishere',
  'bigfoot',
  'aliens',
  'skinwalkers',
  'humanoidencounters',
  'ufo',
  'uap',
  'nde',
  'astralprojection',
  'luciddreaming',
  'psychonaut',
  'psychic',
  'cryptozoology',
  'haunted',
  'tulpas'
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

async function fetchPosts(subreddit: string, after?: number, limit: number = 1000): Promise<{ posts: RedditPost[], hasMore: boolean, lastTimestamp?: number }> {
  let url = `${ARCTIC_SHIFT_API}?subreddit=${subreddit}&limit=${limit}&sort=created_utc:desc`;

  if (after) {
    url += `&created_utc=<${after}`;
  }

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      console.error('Invalid response:', data);
      return { posts: [], hasMore: false };
    }

    const posts = data.data as RedditPost[];
    const hasMore = posts.length === limit;
    const lastTimestamp = posts.length > 0 ? posts[posts.length - 1].created_utc : undefined;

    return { posts, hasMore, lastTimestamp };
  } catch (error) {
    console.error('Fetch error:', error);
    return { posts: [], hasMore: false };
  }
}

async function importPosts(posts: RedditPost[]): Promise<{ inserted: number, skipped: number, rejected: number, errors: number }> {
  try {
    const response = await fetch(IMPORT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts })
    });

    const result = await response.json();
    return result.result || { inserted: 0, skipped: 0, rejected: 0, errors: 0 };
  } catch (error) {
    console.error('Import error:', error);
    return { inserted: 0, skipped: 0, rejected: 0, errors: posts.length };
  }
}

async function processSubreddit(subreddit: string): Promise<{ total: number, inserted: number, skipped: number, rejected: number, errors: number }> {
  console.log(`\n=== Processing r/${subreddit} ===`);

  let totalPosts = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalRejected = 0;
  let totalErrors = 0;
  let lastTimestamp: number | undefined;
  let hasMore = true;
  let batchNum = 0;

  while (hasMore) {
    batchNum++;
    console.log(`  Batch ${batchNum}: Fetching posts${lastTimestamp ? ` before ${new Date(lastTimestamp * 1000).toISOString()}` : ''}...`);

    const { posts, hasMore: more, lastTimestamp: newTs } = await fetchPosts(subreddit, lastTimestamp, 1000);
    hasMore = more;
    lastTimestamp = newTs;

    if (posts.length === 0) {
      console.log('  No more posts found.');
      break;
    }

    console.log(`  Fetched ${posts.length} posts. Importing...`);
    totalPosts += posts.length;

    const { inserted, skipped, rejected, errors } = await importPosts(posts);
    totalInserted += inserted;
    totalSkipped += skipped;
    totalRejected += rejected;
    totalErrors += errors;

    console.log(`  Result: +${inserted} inserted, ${skipped} skipped, ${rejected} rejected, ${errors} errors`);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n  r/${subreddit} complete: ${totalPosts} total, ${totalInserted} inserted, ${totalSkipped} skipped`);
  return { total: totalPosts, inserted: totalInserted, skipped: totalSkipped, rejected: totalRejected, errors: totalErrors };
}

async function main() {
  console.log('=== Arctic Shift Bulk Import ===\n');
  console.log(`Target subreddits: ${REMAINING_SUBREDDITS.join(', ')}`);

  const results: Record<string, any> = {};
  let grandTotal = { posts: 0, inserted: 0, skipped: 0, rejected: 0, errors: 0 };

  for (const subreddit of REMAINING_SUBREDDITS) {
    try {
      const result = await processSubreddit(subreddit);
      results[subreddit] = result;
      grandTotal.posts += result.total;
      grandTotal.inserted += result.inserted;
      grandTotal.skipped += result.skipped;
      grandTotal.rejected += result.rejected;
      grandTotal.errors += result.errors;
    } catch (error) {
      console.error(`Failed to process r/${subreddit}:`, error);
      results[subreddit] = { error: String(error) };
    }

    // Delay between subreddits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n\n========== FINAL RESULTS ==========');
  console.log(JSON.stringify(results, null, 2));
  console.log('\nGrand Total:', grandTotal);
}

main().catch(console.error);
