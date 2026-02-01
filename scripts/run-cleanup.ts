#!/usr/bin/env npx tsx
/**
 * Run cleanup of question-only posts locally (no timeout limits)
 *
 * Usage: npx tsx scripts/run-cleanup.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const dryRun = process.argv.includes('--dry-run');

// Question prefix patterns
const PREFIX_PATTERNS = [
  'what is %', 'what are %', 'what do %', 'what does %', 'what would %',
  'what could %', 'what should %', 'what can %', 'what if %',
  'why is %', 'why are %', 'why do %', 'why does %',
  'how is %', 'how are %', 'how do %', 'how does %', 'how can %', 'how would %',
  'where is %', 'where are %', 'where do %',
  'when is %', 'when are %', 'when do %',
  'does anyone %', 'does anybody %', 'does someone %',
  'do you %', 'do any %',
  'is anyone %', 'is there %', 'is it %',
  'are there %', 'are you %',
  'can anyone %', 'can someone %', 'can you %',
  'could anyone %', 'could someone %',
  'would anyone %', 'would you %',
  'should i %', 'should we %',
  'has anyone %', 'has anybody %',
  'have you %', 'have any %',
  'will anyone %',
  'thoughts on %', 'opinion on %', 'opinions on %',
  'what do you think%',
  'explain %', 'define %', 'eli5 %', 'eli5:%', 'tldr %', 'tldr:%',
  'if you %', 'if we %', 'if they %', 'if someone %', 'if i %',
  'which one %', 'which is %', 'which are %',
  'who is %', 'who are %', 'who was %', 'who would %',
];

async function runCleanup() {
  console.log(`\n🧹 Question Post Cleanup (${dryRun ? 'DRY RUN' : 'LIVE DELETE'})\n`);
  console.log(`Processing ${PREFIX_PATTERNS.length} patterns...\n`);

  const idsToDelete = new Set<string>();
  const samples: { title: string; pattern: string }[] = [];
  let patternsWithMatches = 0;

  for (let i = 0; i < PREFIX_PATTERNS.length; i++) {
    const pattern = PREFIX_PATTERNS[i];

    try {
      const { data: matches, error } = await supabase
        .from('reports')
        .select('id, title')
        .ilike('title', pattern)
        .limit(5000);

      if (error) {
        console.log(`  ❌ "${pattern}" - Error: ${error.message}`);
        continue;
      }

      if (matches && matches.length > 0) {
        patternsWithMatches++;
        console.log(`  ✓ "${pattern}" → ${matches.length} matches`);

        for (const match of matches) {
          if (!idsToDelete.has(match.id)) {
            idsToDelete.add(match.id);
            if (samples.length < 20) {
              samples.push({ title: match.title, pattern });
            }
          }
        }
      }
    } catch (err) {
      console.log(`  ❌ "${pattern}" - Exception:`, err);
    }

    // Progress
    if ((i + 1) % 20 === 0) {
      console.log(`\n  Progress: ${i + 1}/${PREFIX_PATTERNS.length} patterns, ${idsToDelete.size} unique matches\n`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Patterns processed: ${PREFIX_PATTERNS.length}`);
  console.log(`   Patterns with matches: ${patternsWithMatches}`);
  console.log(`   Total reports to delete: ${idsToDelete.size}`);

  if (samples.length > 0) {
    console.log(`\n📋 Sample matches:`);
    samples.slice(0, 10).forEach(s => {
      console.log(`   - "${s.title.substring(0, 60)}..." (${s.pattern})`);
    });
  }

  if (dryRun) {
    console.log(`\n⏸️  DRY RUN - No deletions made`);
    console.log(`   Run without --dry-run to delete these reports`);
    return;
  }

  if (idsToDelete.size === 0) {
    console.log(`\n✅ No reports to delete`);
    return;
  }

  console.log(`\n🗑️  Deleting ${idsToDelete.size} reports...`);

  const idsArray = Array.from(idsToDelete);
  const batchSize = 500;
  let deleted = 0;

  for (let i = 0; i < idsArray.length; i += batchSize) {
    const batch = idsArray.slice(i, i + batchSize);

    const { error } = await supabase
      .from('reports')
      .delete()
      .in('id', batch);

    if (error) {
      console.log(`   ❌ Batch ${Math.floor(i/batchSize) + 1} error: ${error.message}`);
    } else {
      deleted += batch.length;
      console.log(`   ✓ Batch ${Math.floor(i/batchSize) + 1}: ${batch.length} deleted (total: ${deleted})`);
    }
  }

  console.log(`\n✅ Cleanup complete! Deleted ${deleted} reports`);
}

runCleanup().catch(console.error);
