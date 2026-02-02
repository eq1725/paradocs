/**
 * Seed Phenomena Script
 *
 * Loads phenomena from seed data and creates entries via the API.
 * Run with: npx ts-node scripts/seed-phenomena.ts
 *
 * Or trigger via admin panel / API call.
 */

import phenomenaSeed from '../src/data/phenomena-seed.json';

const API_BASE = process.env.API_BASE || 'https://beta.discoverparadocs.com';

async function seedPhenomena() {
  console.log('='.repeat(60));
  console.log('PHENOMENA SEED SCRIPT');
  console.log('='.repeat(60));
  console.log(`Total phenomena to seed: ${phenomenaSeed.phenomena.length}`);
  console.log('');

  // First, do a dry run to see what would be created
  console.log('Running dry run...');

  try {
    const dryRunResponse = await fetch(`${API_BASE}/api/admin/phenomena/batch-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: This requires authentication - run from browser console or add auth header
      },
      body: JSON.stringify({
        phenomena: phenomenaSeed.phenomena,
        generateContent: false,
        dryRun: true,
      }),
    });

    if (!dryRunResponse.ok) {
      console.error('Dry run failed:', await dryRunResponse.text());
      return;
    }

    const dryRunResult = await dryRunResponse.json();
    console.log('Dry run results:');
    console.log(`  Would create: ${dryRunResult.results.created}`);
    console.log(`  Would skip (already exist): ${dryRunResult.results.skipped}`);

    if (dryRunResult.results.skippedNames.length > 0) {
      console.log('  Skipped names:', dryRunResult.results.skippedNames.slice(0, 10).join(', '));
      if (dryRunResult.results.skippedNames.length > 10) {
        console.log(`    ... and ${dryRunResult.results.skippedNames.length - 10} more`);
      }
    }

    console.log('');
    console.log('To run the actual creation, call the API with dryRun: false');
    console.log('or use the browser console with authentication.');

  } catch (error) {
    console.error('Error:', error);
  }
}

// Export for use as module
export { seedPhenomena };

// Run if called directly
if (require.main === module) {
  seedPhenomena();
}
