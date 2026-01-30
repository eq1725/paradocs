/**
 * Cleanup script for removing garbage Wikipedia entries from the database
 *
 * Run with: npx tsx scripts/cleanup-garbage-data.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Patterns that indicate garbage data
const garbageTitlePatterns = [
  /^\.mw/i,           // MediaWiki CSS classes
  /^@media/i,         // CSS media queries
  /^\{/,              // JSON/CSS blocks
  /^html\./i,         // CSS selectors
  /^\.skin/i,         // Wikipedia skin CSS
  /^#/,               // CSS ID selectors
  /^function\s/i,     // JavaScript
  /^var\s/i,          // JavaScript
  /^const\s/i,        // JavaScript
  /^\s*\d+\s*$/,      // Just numbers
  /^parser$/i,        // Parser artifacts
  /^theme$/i,         // Theme artifacts
  /^\^/,              // Citation markers
  /^\[/,              // Reference brackets
];

const skipTitlePatterns = [
  /^see also/i,
  /^references$/i,
  /^external links/i,
  /^notes$/i,
  /^bibliography/i,
  /^further reading/i,
  /^main article/i,
  /^citation needed/i,
];

function isGarbageReport(title: string, summary: string | null): boolean {
  // Too short
  if (!title || title.length < 5) return true;
  if (!summary || summary.length < 20) return true;

  // Matches garbage patterns
  for (const pattern of garbageTitlePatterns) {
    if (pattern.test(title.trim())) return true;
  }

  // Matches skip patterns
  for (const pattern of skipTitlePatterns) {
    if (pattern.test(title.trim())) return true;
  }

  // Low alphanumeric ratio
  const alphanumeric = title.replace(/[^a-zA-Z0-9]/g, '').length;
  if (alphanumeric / title.length < 0.5) return true;

  // Contains CSS/code characters
  if (/[{}<>]/.test(title)) return true;

  return false;
}

async function cleanupGarbageData() {
  console.log('Starting garbage data cleanup...\n');

  // First, get all Wikipedia entries
  const { data: reports, error: fetchError } = await supabase
    .from('reports')
    .select('id, title, summary')
    .eq('source_type', 'wikipedia');

  if (fetchError) {
    console.error('Error fetching reports:', fetchError);
    process.exit(1);
  }

  if (!reports || reports.length === 0) {
    console.log('No Wikipedia reports found.');
    return;
  }

  console.log(`Found ${reports.length} Wikipedia reports total.\n`);

  // Find garbage entries
  const garbageIds: string[] = [];
  const garbageExamples: Array<{ title: string; reason: string }> = [];

  for (const report of reports) {
    if (isGarbageReport(report.title, report.summary)) {
      garbageIds.push(report.id);
      if (garbageExamples.length < 10) {
        garbageExamples.push({
          title: report.title.substring(0, 60),
          reason: getGarbageReason(report.title, report.summary)
        });
      }
    }
  }

  console.log(`Found ${garbageIds.length} garbage entries to delete.\n`);

  if (garbageExamples.length > 0) {
    console.log('Example garbage entries:');
    for (const example of garbageExamples) {
      console.log(`  - "${example.title}" (${example.reason})`);
    }
    console.log('');
  }

  if (garbageIds.length === 0) {
    console.log('No garbage entries to delete. Database is clean!');
    return;
  }

  // Delete in batches of 100
  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < garbageIds.length; i += batchSize) {
    const batch = garbageIds.slice(i, i + batchSize);

    const { error: deleteError } = await supabase
      .from('reports')
      .delete()
      .in('id', batch);

    if (deleteError) {
      console.error(`Error deleting batch ${i / batchSize + 1}:`, deleteError);
    } else {
      deleted += batch.length;
      console.log(`Deleted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} entries`);
    }
  }

  console.log(`\nCleanup complete! Deleted ${deleted} garbage entries.`);

  // Show remaining count
  const { count } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('source_type', 'wikipedia');

  console.log(`Remaining Wikipedia reports: ${count}`);
}

function getGarbageReason(title: string, summary: string | null): string {
  if (!title || title.length < 5) return 'title too short';
  if (!summary || summary.length < 20) return 'summary too short';

  if (/^\.mw/i.test(title)) return 'CSS class (.mw)';
  if (/^@media/i.test(title)) return 'CSS media query';
  if (/^\^/.test(title)) return 'citation marker';
  if (/^\[/.test(title)) return 'reference bracket';
  if (/^\{/.test(title)) return 'code/JSON block';
  if (/^html\./i.test(title)) return 'CSS selector';
  if (/^#/.test(title)) return 'CSS ID selector';

  const alphanumeric = title.replace(/[^a-zA-Z0-9]/g, '').length;
  if (alphanumeric / title.length < 0.5) return 'low alphanumeric ratio';

  if (/[{}<>]/.test(title)) return 'contains code characters';

  for (const pattern of skipTitlePatterns) {
    if (pattern.test(title)) return 'navigation/meta item';
  }

  return 'failed validation';
}

// Run the cleanup
cleanupGarbageData().catch(console.error);
