#!/usr/bin/env node
/**
 * Download Reddit Archives from Arctic Shift API
 *
 * Downloads all posts and comments from target paranormal subreddits.
 *
 * Usage:
 *   node scripts/download-reddit-archives.js [options]
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://arctic-shift.photon-reddit.com/api';

// Target paranormal subreddits
const TARGET_SUBREDDITS = [
  'paranormal',
  'ufos',
  'ghosts',
  'cryptids',
  'Glitch_in_the_Matrix',
  'HighStrangeness',
  'Thetruthishere',
  'bigfoot',
  'aliens',
  'skinwalkers',
  'Humanoidencounters',
  'NDE',
  'AstralProjection',
  'Ghoststories',
  'Missing411',
  'crawlersightings',
  'dogman',
];

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`  Attempt ${i + 1} failed:`, error.message);
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      } else {
        throw error;
      }
    }
  }
}

async function downloadSubredditData(subreddit, type, outputDir, startDate, endDate) {
  const endpoint = type === 'posts' ? 'posts/search' : 'comments/search';
  const outputFile = path.join(outputDir, `${subreddit}_${type}.ndjson`);

  const writeStream = fs.createWriteStream(outputFile, { flags: 'w' });

  let totalRecords = 0;
  let after = Math.floor(new Date(startDate).getTime() / 1000);
  const beforeTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

  console.log(`\n📥 Downloading ${type} from r/${subreddit}...`);
  console.log(`   Date range: ${startDate} to ${endDate}`);

  while (after < beforeTimestamp) {
    const url = `${API_BASE}/${endpoint}?subreddit=${subreddit}&after=${after}&before=${beforeTimestamp}&limit=100&sort=asc`;

    try {
      const response = await fetchWithRetry(url);

      if (!response.data || response.data.length === 0) {
        console.log(`   ✓ Complete! ${totalRecords.toLocaleString()} ${type} downloaded`);
        break;
      }

      for (const record of response.data) {
        writeStream.write(JSON.stringify(record) + '\n');
        totalRecords++;
      }

      const lastRecord = response.data[response.data.length - 1];
      after = lastRecord.created_utc + 1;

      if (totalRecords % 1000 === 0) {
        const date = new Date(after * 1000).toISOString().split('T')[0];
        console.log(`   ... ${totalRecords.toLocaleString()} records (reached ${date})`);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 100));

    } catch (error) {
      console.error(`   Error at timestamp ${after}:`, error.message);
      after += 86400; // Skip to next day
    }
  }

  writeStream.end();
  return totalRecords;
}

async function main() {
  const args = process.argv.slice(2);

  let subreddits = TARGET_SUBREDDITS;
  let downloadType = 'both';
  let outputDir = './data/reddit';
  let startDate = '2010-01-01';
  let endDate = new Date().toISOString().split('T')[0];

  for (const arg of args) {
    if (arg.startsWith('--subreddits=')) {
      subreddits = arg.split('=')[1].split(',');
    } else if (arg.startsWith('--type=')) {
      downloadType = arg.split('=')[1];
    } else if (arg.startsWith('--output-dir=')) {
      outputDir = arg.split('=')[1];
    } else if (arg.startsWith('--start-date=')) {
      startDate = arg.split('=')[1];
    } else if (arg.startsWith('--end-date=')) {
      endDate = arg.split('=')[1];
    } else if (arg === '--help') {
      console.log(`
Reddit Archive Downloader (Arctic Shift API)
=============================================

Downloads posts and comments from paranormal subreddits.

Usage:
  node scripts/download-reddit-archives.js [options]

Options:
  --subreddits=a,b     Comma-separated list (default: all paranormal subs)
  --type=posts|comments|both   What to download (default: both)
  --output-dir=path    Output directory (default: ./data/reddit)
  --start-date=YYYY-MM-DD   Start date (default: 2010-01-01)
  --end-date=YYYY-MM-DD     End date (default: today)

Target Subreddits:
  ${TARGET_SUBREDDITS.join(', ')}
`);
      process.exit(0);
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });

  console.log('🚀 Reddit Archive Downloader');
  console.log('============================');
  console.log(`Subreddits: ${subreddits.length}`);
  console.log(`Type: ${downloadType}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Date range: ${startDate} to ${endDate}`);

  const stats = {};

  for (const subreddit of subreddits) {
    stats[subreddit] = {};

    if (downloadType === 'posts' || downloadType === 'both') {
      stats[subreddit].posts = await downloadSubredditData(
        subreddit, 'posts', outputDir, startDate, endDate
      );
    }

    if (downloadType === 'comments' || downloadType === 'both') {
      stats[subreddit].comments = await downloadSubredditData(
        subreddit, 'comments', outputDir, startDate, endDate
      );
    }
  }

  console.log('\n📊 Download Summary');
  console.log('===================');
  let totalPosts = 0;
  let totalComments = 0;

  for (const [sub, counts] of Object.entries(stats)) {
    const posts = counts.posts || 0;
    const comments = counts.comments || 0;
    totalPosts += posts;
    totalComments += comments;
    console.log(`r/${sub}: ${posts.toLocaleString()} posts, ${comments.toLocaleString()} comments`);
  }

  console.log(`\n🎉 Total: ${totalPosts.toLocaleString()} posts, ${totalComments.toLocaleString()} comments`);
  console.log(`\nFiles saved to: ${outputDir}/`);
  console.log('\nNext step - import to database:');
  console.log(`  npx ts-node scripts/batch-import-reddit.ts ${outputDir}/<subreddit>_posts.ndjson`);
}

main().catch(console.error);
