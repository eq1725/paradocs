#!/usr/bin/env node
/**
 * Reddit Batch Import Script (ES Module version)
 * Processes all .ndjson files in data/reddit/
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('Starting import script...');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Target subreddits (paranormal-related)
const TARGET_SUBREDDITS = new Set([
  'paranormal', 'ufos', 'ghosts', 'cryptids', 'glitch_in_the_matrix',
  'highstrangeness', 'thetruthishere', 'bigfoot', 'aliens', 'skinwalkers',
  'humanoidencounters', 'nde', 'astralprojection', 'ghoststories',
  'missing411', 'crawlersightings', 'dogman', 'ufo', 'uap', 'haunted'
]);

// Category mapping
const SUBREDDIT_CATEGORIES = {
  'ufos': 'ufos_aliens', 'ufo': 'ufos_aliens', 'aliens': 'ufos_aliens', 'uap': 'ufos_aliens',
  'ghosts': 'ghosts_hauntings', 'paranormal': 'ghosts_hauntings', 'thetruthishere': 'ghosts_hauntings',
  'haunted': 'ghosts_hauntings', 'ghoststories': 'ghosts_hauntings',
  'bigfoot': 'cryptids', 'cryptids': 'cryptids', 'dogman': 'cryptids', 'crawlersightings': 'cryptids',
  'skinwalkers': 'cryptids', 'humanoidencounters': 'cryptids',
  'glitch_in_the_matrix': 'high_strangeness', 'highstrangeness': 'high_strangeness',
  'missing411': 'high_strangeness',
  'nde': 'nde_consciousness', 'astralprojection': 'nde_consciousness'
};

// Simple quality filter patterns
const REJECT_PATTERNS = [
  /\b(share your|tell me about|what's your)\b/i,
  /\b(i (made|drew|painted|created))\b/i,
  /\b(for sale|buy now|etsy|merch)\b/i,
  /\b(meme|shitpost|joke)\b/i,
  /\[(removed|deleted)\]/i,
];

// POSITIVE filters - signs of first-hand experience (what we WANT)
const EXPERIENCE_PATTERNS = [
  // First-person experience verbs
  /\b(I|we)\s+(saw|seen|heard|felt|experienced|encountered|witnessed|noticed|remember|had)\b/i,
  // Story markers
  /\b(this happened|it happened|one time|one night|a few years ago|back in|when I was|years ago)\b/i,
  // Personal narrative indicators
  /\b(my (experience|encounter|sighting|story)|happened to me|I was there|I remember)\b/i,
  // Time/place specifics suggesting real account
  /\b(around \d|about \d|\d (am|pm)|at night|that night|that day|in (my|the) (house|room|car|bed))\b/i,
  // Emotional reactions (suggest genuine experience)
  /\b(scared|terrified|freaked|couldn't explain|still don't know|to this day|never forget)\b/i,
];

function shouldReject(text) {
  return REJECT_PATTERNS.some(p => p.test(text));
}

function hasExperienceMarkers(text) {
  return EXPERIENCE_PATTERNS.some(p => p.test(text));
}

function generateSlug(title, id, source) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  // Create short hash from id
  let hash = 0;
  const key = `${source}-${id}`;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  const shortHash = Math.abs(hash).toString(36).substring(0, 6);

  return `${base}-${shortHash}`;
}

async function processFile(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\nProcessing: ${fileName}`);
  console.log('='.repeat(50));

  const isComments = fileName.includes('comments');
  const sourceType = isComments ? 'reddit-comments' : 'reddit-posts';

  const stats = {
    total: 0,
    matched: 0,
    passed: 0,
    inserted: 0,
    skipped: 0,
    errors: 0
  };

  console.log('Opening file stream...');
  const fileStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });

  fileStream.on('error', (err) => {
    console.error('File stream error:', err);
  });

  console.log('Creating readline interface...');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Starting to read lines...');
  let batch = [];
  const BATCH_SIZE = 500;  // Larger batches for bulk insert efficiency
  let lastLog = Date.now();

  for await (const line of rl) {
    stats.total++;

    // Log every 10K lines OR every 5 seconds
    const now = Date.now();
    if (stats.total % 10000 === 0 || (now - lastLog > 5000)) {
      console.log(`  Lines: ${stats.total.toLocaleString()} | Passed: ${stats.passed.toLocaleString()} | Inserted: ${stats.inserted.toLocaleString()} | TooShort: ${(stats.tooShort||0).toLocaleString()} | NoExp: ${(stats.noExperience||0).toLocaleString()}`);
      lastLog = now;
    }

    try {
      const post = JSON.parse(line);
      const subreddit = (post.subreddit || '').toLowerCase();

      // Check if target subreddit
      if (!TARGET_SUBREDDITS.has(subreddit)) continue;
      stats.matched++;

      // Get content
      const description = isComments ? (post.body || '') : (post.selftext || '');
      const title = isComments
        ? (description.split(/[.!?]/)[0] || 'Reddit Comment').substring(0, 100)
        : (post.title || 'Untitled');

      // Length check - lower threshold, we want personal experiences
      const minLength = isComments ? 100 : 75;
      if (description.length < minLength) {
        stats.tooShort = (stats.tooShort || 0) + 1;
        continue;
      }

      // Quality filter - reject obvious non-experiences
      if (shouldReject(title + ' ' + description)) {
        stats.rejected = (stats.rejected || 0) + 1;
        continue;
      }

      // POSITIVE filter - require signs of first-hand experience
      // This is what ParaDocs is about: actual anecdotal reports
      if (!hasExperienceMarkers(description)) {
        stats.noExperience = (stats.noExperience || 0) + 1;
        continue;
      }
      stats.passed++;

      // Build report
      const report = {
        title: title.substring(0, 200),
        slug: generateSlug(title, post.id, sourceType),
        summary: description.substring(0, 200) + (description.length > 200 ? '...' : ''),
        description,
        category: SUBREDDIT_CATEGORIES[subreddit] || 'ghosts_hauntings',
        source_type: sourceType,
        original_report_id: post.id,
        source_url: `https://reddit.com${post.permalink || `/r/${subreddit}/comments/${post.id}`}`,
        source_label: `r/${post.subreddit}`,
        event_date: new Date(post.created_utc * 1000).toISOString().split('T')[0],
        status: 'approved',
        credibility: 'medium',
        tags: [subreddit, isComments ? 'comment-experience' : 'post'],
        country: 'Unknown'
      };

      batch.push(report);

      // Process batch
      if (batch.length >= BATCH_SIZE) {
        const results = await processBatch(batch, stats);
        batch = [];
      }

    } catch (e) {
      stats.errors++;
    }
  }

  // Process remaining
  if (batch.length > 0) {
    await processBatch(batch, stats);
  }

  console.log(`\nCompleted: ${fileName}`);
  console.log(`  Total lines: ${stats.total.toLocaleString()}`);
  console.log(`  Matched subreddit: ${stats.matched.toLocaleString()}`);
  console.log(`  Too short (<100 chars): ${(stats.tooShort||0).toLocaleString()}`);
  console.log(`  Rejected (spam/meta): ${(stats.rejected||0).toLocaleString()}`);
  console.log(`  No experience markers: ${(stats.noExperience||0).toLocaleString()}`);
  console.log(`  Passed all filters: ${stats.passed.toLocaleString()}`);
  console.log(`  Inserted: ${stats.inserted.toLocaleString()}`);
  console.log(`  Skipped (duplicates): ${stats.skipped.toLocaleString()}`);
  console.log(`  Errors: ${stats.errors.toLocaleString()}`);

  return stats;
}

async function processBatch(batch, stats) {
  if (batch.length === 0) return;

  // Insert records one by one for reliability (bulk can fail silently)
  for (const report of batch) {
    try {
      const { error } = await supabase.from('reports').insert(report);
      if (error) {
        if (error.code === '23505') {
          stats.skipped++;  // Duplicate
        } else {
          stats.errors++;
          if (stats.errors <= 5) {
            console.log(`  DB Error: ${error.message}`);
          }
        }
      } else {
        stats.inserted++;
      }
    } catch (e) {
      stats.errors++;
    }
  }
}

// Main
async function main() {
  const dataDir = path.join(__dirname, '..', 'data', 'reddit');

  if (!fs.existsSync(dataDir)) {
    console.error('data/reddit directory not found');
    process.exit(1);
  }

  const files = fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.ndjson'))
    .map(f => path.join(dataDir, f))
    .sort(); // Process in order

  console.log(`\nFound ${files.length} files to process:`);
  files.forEach(f => console.log(`  - ${path.basename(f)}`));

  const totals = { inserted: 0, skipped: 0, errors: 0 };

  for (const file of files) {
    const stats = await processFile(file);
    totals.inserted += stats.inserted;
    totals.skipped += stats.skipped;
    totals.errors += stats.errors;
  }

  console.log('\n' + '='.repeat(50));
  console.log('ALL FILES COMPLETE');
  console.log('='.repeat(50));
  console.log(`Total inserted: ${totals.inserted.toLocaleString()}`);
  console.log(`Total skipped: ${totals.skipped.toLocaleString()}`);
  console.log(`Total errors: ${totals.errors.toLocaleString()}`);
}

main().catch(console.error);
