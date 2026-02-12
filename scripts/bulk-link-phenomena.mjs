#!/usr/bin/env node
/**
 * Bulk Link Phenomena - Supabase JS approach (v3)
 * Processes one phenomenon at a time, one pattern at a time.
 * Uses simple ilike on title only first (fast), then summary.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function findAndLinkReports(phenomenonId, pattern, field, confidence) {
  let offset = 0;
  const CHUNK = 5000;
  let linked = 0;

  while (true) {
    const clean = pattern.replace(/[%.\\]/g, '');
    const { data: reports, error } = await supabase
      .from('reports')
      .select('id')
      .eq('status', 'approved')
      .ilike(field, `%${clean}%`)
      .range(offset, offset + CHUNK - 1)
      .order('id', { ascending: true });

    if (error) {
      // If timeout, try smaller chunk
      if (error.message.includes('timeout') && CHUNK > 1000) {
        console.error(`    Timeout on "${pattern}" in ${field}, skipping rest`);
      } else {
        console.error(`    Error: ${error.message}`);
      }
      break;
    }

    if (!reports || reports.length === 0) break;

    // Bulk upsert links
    const inserts = reports.map(r => ({
      report_id: r.id,
      phenomenon_id: phenomenonId,
      confidence,
      tagged_by: 'auto'
    }));

    for (let j = 0; j < inserts.length; j += 500) {
      const batch = inserts.slice(j, j + 500);
      const { error: insertErr } = await supabase
        .from('report_phenomena')
        .upsert(batch, { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true });

      if (insertErr) {
        console.error(`    Insert error: ${insertErr.message}`);
      } else {
        linked += batch.length;
      }
    }

    if (reports.length < CHUNK) break;
    offset += CHUNK;
  }

  return linked;
}

async function main() {
  console.log('Connected to Supabase.\n');

  const { data: phenomena, error: phenError } = await supabase
    .from('phenomena')
    .select('id, name, aliases, category')
    .eq('status', 'active');

  if (phenError) {
    console.error('Error fetching phenomena:', phenError);
    process.exit(1);
  }

  console.log(`Found ${phenomena.length} active phenomena to process.\n`);

  let totalLinked = 0;
  const startTime = Date.now();

  for (let i = 0; i < phenomena.length; i++) {
    const p = phenomena[i];
    const patterns = [p.name, ...(p.aliases || [])].filter(Boolean);
    let phenomenonLinked = 0;

    // Search title first (highest confidence), then summary, then description
    const fields = [
      { name: 'title', confidence: 0.85 },
      { name: 'summary', confidence: 0.75 },
      { name: 'description', confidence: 0.6 }
    ];

    for (const field of fields) {
      for (const pattern of patterns) {
        if (pattern.length < 3) continue; // Skip very short patterns
        const linked = await findAndLinkReports(p.id, pattern, field.name, field.confidence);
        phenomenonLinked += linked;
      }
    }

    totalLinked += phenomenonLinked;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${i + 1}/${phenomena.length}] ${p.name}: ${phenomenonLinked.toLocaleString()} linked (${elapsed}s total)`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log('BULK LINK COMPLETE');
  console.log(`Phenomena processed: ${phenomena.length}`);
  console.log(`Total new links: ${totalLinked.toLocaleString()}`);
  console.log(`Time: ${totalTime}s`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
