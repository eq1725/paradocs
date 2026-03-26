/**
 * Test Ingestion Script — 20 Reports for Quality Review
 *
 * Runs the full ingestion pipeline for a single source with limit=20.
 * Used to verify pipeline quality before scaling up.
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/test-ingest-20.ts [source-slug]
 * Default source: nuforc
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

async function main() {
  const sourceSlug = process.argv[2] || 'nuforc';
  const limit = parseInt(process.argv[3] || '20');

  console.log(`\n=== Paradocs Test Ingestion ===`);
  console.log(`Source: ${sourceSlug}`);
  console.log(`Limit: ${limit}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Verify env vars
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Anthropic API Key: ${process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET (AI features will be skipped)'}`);
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET (embeddings will be skipped)'}`);
  console.log('');

  // Create admin client
  const supabase = createClient(supabaseUrl, serviceKey);

  // Look up source UUID from slug
  const { data: sources, error: srcError } = await supabase
    .from('data_sources')
    .select('id, name, slug, adapter_type, is_active')
    .eq('is_active', true)
    .order('name');

  if (srcError) {
    console.error('ERROR querying data_sources:', srcError.message);
    process.exit(1);
  }

  console.log(`Active data sources (${sources?.length || 0}):`);
  sources?.forEach(s => {
    const marker = s.slug === sourceSlug || s.adapter_type === sourceSlug ? ' ◄ SELECTED' : '';
    console.log(`  - ${s.name} (slug: ${s.slug}, adapter: ${s.adapter_type})${marker}`);
  });
  console.log('');

  // Find the target source
  const targetSource = sources?.find(s => s.slug === sourceSlug || s.adapter_type === sourceSlug);
  if (!targetSource) {
    console.error(`ERROR: No active source found with slug or adapter_type "${sourceSlug}"`);
    console.error('Available slugs:', sources?.map(s => s.slug).join(', '));
    process.exit(1);
  }

  console.log(`Found source: ${targetSource.name} (ID: ${targetSource.id})`);
  console.log(`Adapter type: ${targetSource.adapter_type}`);
  console.log('');

  // Import and run ingestion
  console.log(`Starting ingestion of ${limit} reports...`);
  console.log('---');

  const { runIngestion } = await import('@/lib/ingestion/engine');

  const result = await runIngestion(targetSource.id, limit);

  console.log('---');
  console.log('\n=== INGESTION RESULTS ===');
  console.log(`Success: ${result.success}`);
  console.log(`Job ID: ${result.jobId}`);
  console.log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
  console.log(`Records found: ${result.recordsFound}`);
  console.log(`Records inserted: ${result.recordsInserted}`);
  console.log(`Records updated: ${result.recordsUpdated}`);
  console.log(`Records skipped (dedup): ${result.recordsSkipped}`);
  console.log(`Records rejected (quality): ${result.recordsRejected}`);
  console.log(`Records pending review: ${result.recordsPendingReview}`);
  console.log(`Phenomena linked: ${result.phenomenaLinked}`);
  if (result.error) {
    console.log(`Error: ${result.error}`);
  }

  // Now query the inserted reports to verify quality
  if (result.recordsInserted > 0) {
    console.log('\n=== QUALITY CHECK — Inserted Reports ===\n');

    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select(`
        id, title, source_type, status,
        source_url, event_date, event_date_precision,
        feed_hook, paradocs_narrative, paradocs_assessment,
        emotional_tone, location_text, latitude, longitude,
        created_at
      `)
      .eq('source_type', targetSource.adapter_type)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (reportsError) {
      console.error('ERROR querying reports:', reportsError.message);
    } else if (reports) {
      // Summary stats
      const hasSourceUrl = reports.filter(r => r.source_url).length;
      const hasFeedHook = reports.filter(r => r.feed_hook).length;
      const hasNarrative = reports.filter(r => r.paradocs_narrative).length;
      const hasAssessment = reports.filter(r => r.paradocs_assessment).length;
      const hasTone = reports.filter(r => r.emotional_tone).length;
      const hasLocation = reports.filter(r => r.latitude && r.longitude).length;
      const hasEventDate = reports.filter(r => r.event_date).length;

      console.log(`Coverage (${reports.length} reports):`);
      console.log(`  source_url:         ${hasSourceUrl}/${reports.length} (${(hasSourceUrl/reports.length*100).toFixed(0)}%) ${hasSourceUrl === reports.length ? '✅' : '⚠️ MISSING'}`);
      console.log(`  feed_hook:          ${hasFeedHook}/${reports.length} (${(hasFeedHook/reports.length*100).toFixed(0)}%) ${hasFeedHook > 0 ? '✅' : '⚠️ MISSING (need ANTHROPIC_API_KEY)'}`);
      console.log(`  paradocs_narrative: ${hasNarrative}/${reports.length} (${(hasNarrative/reports.length*100).toFixed(0)}%) ${hasNarrative > 0 ? '✅' : '⚠️ MISSING (need ANTHROPIC_API_KEY)'}`);
      console.log(`  paradocs_assessment:${hasAssessment}/${reports.length} (${(hasAssessment/reports.length*100).toFixed(0)}%) ${hasAssessment > 0 ? '✅' : '⚠️ MISSING (need ANTHROPIC_API_KEY)'}`);
      console.log(`  emotional_tone:     ${hasTone}/${reports.length} (${(hasTone/reports.length*100).toFixed(0)}%)`);
      console.log(`  event_date:         ${hasEventDate}/${reports.length} (${(hasEventDate/reports.length*100).toFixed(0)}%)`);
      console.log(`  geolocation:        ${hasLocation}/${reports.length} (${(hasLocation/reports.length*100).toFixed(0)}%)`);

      // Show first 5 reports detail
      console.log('\n--- Sample Reports (first 5) ---\n');
      reports.slice(0, 5).forEach((r, i) => {
        console.log(`[${i+1}] ${r.title}`);
        console.log(`    Status: ${r.status}`);
        console.log(`    Source URL: ${r.source_url || 'MISSING'}`);
        console.log(`    Event date: ${r.event_date || 'none'} (precision: ${r.event_date_precision || 'none'})`);
        console.log(`    Location: ${r.location_text || 'none'} ${r.latitude ? `(${r.latitude}, ${r.longitude})` : '(no coords)'}`);
        console.log(`    Feed hook: ${r.feed_hook ? r.feed_hook.substring(0, 80) + '...' : 'NOT GENERATED'}`);
        console.log(`    Paradocs narrative: ${r.paradocs_narrative ? r.paradocs_narrative.substring(0, 80) + '...' : 'NOT GENERATED'}`);
        console.log(`    Assessment: ${r.paradocs_assessment ? 'YES (credibility: ' + (r.paradocs_assessment as any).credibility_score + ')' : 'NOT GENERATED'}`);
        console.log(`    Tone: ${r.emotional_tone || 'none'}`);
        console.log('');
      });
    }
  }

  console.log('\n=== Test ingestion complete ===\n');
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
