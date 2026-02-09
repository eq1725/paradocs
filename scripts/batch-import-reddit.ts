#!/usr/bin/env npx ts-node
/**
 * Batch Reddit Data Import Script
 *
 * Imports both Reddit SUBMISSIONS and COMMENTS from zstd-compressed NDJSON dumps.
 * Comments are automatically detected (they have 'body' but no 'title') and
 * will have titles generated from their content.
 *
 * Usage:
 *   npx ts-node scripts/batch-import-reddit.ts <file_path> [options]
 *
 * Options:
 *   --limit=N         Max records to import (for testing)
 *   --batch-size=N    Records per batch (default: 100)
 *   --ai-titles       Use AI to enhance titles (slower but better)
 *   --subreddits=a,b  Comma-separated list of target subreddits
 *
 * Examples:
 *   # Import submissions
 *   npx ts-node scripts/batch-import-reddit.ts ./data/paranormal_submissions.zst
 *
 *   # Import comments (valuable personal experiences in replies!)
 *   npx ts-node scripts/batch-import-reddit.ts ./data/paranormal_comments.zst
 *
 *   # Test with limit
 *   npx ts-node scripts/batch-import-reddit.ts ./data/dump.zst --limit=1000
 *
 * Data Sources:
 *   - Arctic Shift: https://arctic-shift.photon-reddit.com/download-tool
 *     (Download both "submissions" and "comments" for each subreddit!)
 *   - Academic Torrents: https://academictorrents.com/details/56aa49f9653ba545f48df2e33679f014d2829c10
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { batchImportRedditDump, estimateDumpSize, TARGET_SUBREDDITS, ImportProgress } from '../src/lib/ingestion/batch-reddit-importer';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Reddit Batch Import Script
==========================

Imports Reddit data dumps (zstd-compressed NDJSON) from Arctic Shift or Academic Torrents.
Works with BOTH submissions (posts) AND comments - comments are auto-detected!

Usage:
  npx ts-node scripts/batch-import-reddit.ts <file_path> [options]

Options:
  --limit=N         Max records to import (for testing)
  --batch-size=N    Records per batch (default: 100)
  --ai-titles       Use AI to enhance titles (slower but better quality)
  --subreddits=a,b  Comma-separated list of target subreddits
  --estimate        Only estimate file size, don't import

Target Subreddits (default):
  ${Array.from(TARGET_SUBREDDITS).join(', ')}

Examples:
  # Import submissions from a dump file
  npx ts-node scripts/batch-import-reddit.ts ./data/paranormal_submissions.zst

  # Import comments (personal experiences shared in replies!)
  npx ts-node scripts/batch-import-reddit.ts ./data/paranormal_comments.zst

  # Test with first 1000 records
  npx ts-node scripts/batch-import-reddit.ts ./data/dump.zst --limit=1000

  # Import only specific subreddits
  npx ts-node scripts/batch-import-reddit.ts ./data/dump.zst --subreddits=Paranormal,UFOs,Ghosts

Data Sources (download BOTH submissions AND comments!):
  - Arctic Shift Download Tool: https://arctic-shift.photon-reddit.com/download-tool
  - Academic Torrents (2005-2024): https://academictorrents.com/details/56aa49f9653ba545f48df2e33679f014d2829c10

Note: Comments require 200+ characters (vs 100 for submissions) since they lack context.
      Titles are auto-generated from the first sentence of the comment body.
`);
    process.exit(0);
  }

  // Parse arguments
  const filePath = args.find(a => !a.startsWith('--'));

  if (!filePath) {
    console.error('Error: File path is required');
    process.exit(1);
  }

  // Parse options
  const limit = args.find(a => a.startsWith('--limit='))?.split('=')[1];
  const batchSize = args.find(a => a.startsWith('--batch-size='))?.split('=')[1];
  const useAITitles = args.includes('--ai-titles');
  const estimateOnly = args.includes('--estimate');
  const subredditsArg = args.find(a => a.startsWith('--subreddits='))?.split('=')[1];
  const subreddits = subredditsArg ? subredditsArg.split(',') : undefined;

  console.log('\n=== Reddit Batch Import ===\n');
  console.log(`File: ${filePath}`);
  console.log(`Limit: ${limit || 'none'}`);
  console.log(`Batch size: ${batchSize || '100'}`);
  console.log(`AI titles: ${useAITitles ? 'enabled' : 'disabled'}`);
  console.log(`Subreddits: ${subreddits ? subreddits.join(', ') : 'default targets'}`);

  // Estimate file size
  console.log('\nEstimating file size...');
  try {
    const estimate = await estimateDumpSize(filePath);
    console.log(`File size: ${(estimate.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Estimated lines: ~${estimate.lines.toLocaleString()}`);

    if (estimateOnly) {
      process.exit(0);
    }
  } catch (err) {
    console.error(`Could not estimate file size: ${err}`);
  }

  // Progress callback
  const onProgress = (progress: ImportProgress) => {
    const elapsed = (Date.now() - progress.startTime) / 1000;
    const rate = progress.processedLines / elapsed;
    const eta = progress.totalLines > 0
      ? ((progress.totalLines - progress.processedLines) / rate / 60).toFixed(1)
      : '?';

    process.stdout.write(
      `\rProcessed: ${progress.processedLines.toLocaleString()} | ` +
      `Matched: ${progress.matchedSubreddit.toLocaleString()} | ` +
      `Inserted: ${progress.inserted.toLocaleString()} | ` +
      `Rate: ${rate.toFixed(0)}/s | ` +
      `ETA: ${eta}m   `
    );
  };

  // Run import
  console.log('\nStarting import...\n');

  try {
    const result = await batchImportRedditDump({
      filePath,
      limit: limit ? parseInt(limit) : undefined,
      batchSize: batchSize ? parseInt(batchSize) : 100,
      useAITitles,
      subreddits,
      onProgress
    });

    console.log('\n\n=== Import Complete ===\n');
    console.log(`Total lines processed: ${result.totalLines.toLocaleString()}`);
    console.log(`Matched target subreddits: ${result.matchedSubreddit.toLocaleString()}`);
    console.log(`Passed quality filters: ${result.passedFilters.toLocaleString()}`);
    console.log(`Successfully inserted: ${result.inserted.toLocaleString()}`);
    console.log(`Updated existing: ${result.updated.toLocaleString()}`);
    console.log(`Skipped (duplicates): ${result.skipped.toLocaleString()}`);
    console.log(`Rejected (quality): ${result.rejected.toLocaleString()}`);
    console.log(`Errors: ${result.errors.toLocaleString()}`);
    console.log(`\nTime: ${((Date.now() - result.startTime) / 1000 / 60).toFixed(1)} minutes`);

  } catch (error) {
    console.error('\nImport failed:', error);
    process.exit(1);
  }
}

main();
