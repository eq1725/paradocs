#!/usr/bin/env node
/**
 * Simple batch import runner for Reddit data
 * Processes all .ndjson files in data/reddit/
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'reddit');

// Check if directory exists
if (!fs.existsSync(DATA_DIR)) {
  console.error('Error: data/reddit directory not found');
  process.exit(1);
}

// Get all .ndjson files
const files = fs.readdirSync(DATA_DIR)
  .filter(f => f.endsWith('.ndjson'))
  .map(f => path.join(DATA_DIR, f));

if (files.length === 0) {
  console.error('No .ndjson files found in data/reddit/');
  process.exit(1);
}

console.log(`Found ${files.length} files to process:\n`);
files.forEach(f => console.log(`  - ${path.basename(f)}`));
console.log('');

// Process each file using the Next.js API route approach
// We'll use a direct Node.js script that imports the modules

const runScript = `
const path = require('path');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Need to use dynamic import for ES modules
async function run() {
  // Register ts-node for TypeScript files
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
      module: 'commonjs',
      esModuleInterop: true
    }
  });

  const { batchImportRedditDump } = require('../src/lib/ingestion/batch-reddit-importer');
  const { createClient } = require('@supabase/supabase-js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in environment');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const files = ${JSON.stringify(files)};

  for (const filePath of files) {
    console.log('\\n' + '='.repeat(60));
    console.log('Processing:', path.basename(filePath));
    console.log('='.repeat(60) + '\\n');

    try {
      await batchImportRedditDump(supabase, filePath, {
        batchSize: 100,
        skipDuplicates: true,
        useAITitles: false
      });
      console.log('\\n✓ Completed:', path.basename(filePath));
    } catch (error) {
      console.error('\\n✗ Error processing', path.basename(filePath), error.message);
    }
  }

  console.log('\\n' + '='.repeat(60));
  console.log('All files processed!');
  console.log('='.repeat(60));
}

run().catch(console.error);
`;

// Write temp script and run it
const tempScript = path.join(__dirname, '_temp_import.js');
fs.writeFileSync(tempScript, runScript);

try {
  execSync(`node "${tempScript}"`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
} finally {
  // Cleanup
  fs.unlinkSync(tempScript);
}
