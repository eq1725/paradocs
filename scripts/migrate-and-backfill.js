// Run migration and backfill
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL:', supabaseUrl ? 'Found' : 'Missing');
console.log('Key:', supabaseKey ? 'Found' : 'Missing');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAndMigrate() {
  console.log('\n=== Checking Migration Status ===');

  // Check if ai_tags column exists
  const { data: sample, error } = await supabase
    .from('report_media')
    .select('*')
    .limit(1);

  if (error) {
    console.log('Query error (table may be empty):', error.message);
  }

  const hasNewColumns = sample && sample[0] && 'ai_tags' in sample[0];

  if (hasNewColumns) {
    console.log('✓ Migration already applied - ai_tags column exists');
  } else {
    console.log('⚠ Migration needed - run this SQL in Supabase dashboard:');
    console.log(`
ALTER TABLE public.report_media
ADD COLUMN IF NOT EXISTS ai_tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_description TEXT,
ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_report_media_ai_tags
ON public.report_media USING GIN (ai_tags);
    `);
  }

  return hasNewColumns;
}

async function countReportsWithMedia() {
  console.log('\n=== Media Statistics ===');

  // Count total media
  const { count: mediaCount } = await supabase
    .from('report_media')
    .select('*', { count: 'exact', head: true });
  console.log(`Total media records: ${mediaCount || 0}`);

  // Count Reddit reports
  const { count: redditCount } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('source_type', 'reddit')
    .eq('status', 'approved');
  console.log(`Approved Reddit reports: ${redditCount || 0}`);

  // Count reports with has-media tag
  const { data: withMedia } = await supabase
    .from('reports')
    .select('id')
    .contains('tags', ['has-media'])
    .limit(1000);
  console.log(`Reports with has-media tag: ${withMedia?.length || 0}`);

  return { mediaCount, redditCount };
}

async function runBackfill(limit = 20, dryRun = false) {
  console.log(`\n=== Running Backfill (limit: ${limit}, dryRun: ${dryRun}) ===`);

  // Find Reddit reports without media
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, original_report_id, title, description')
    .eq('source_type', 'reddit')
    .eq('status', 'approved')
    .not('original_report_id', 'like', 'reddit-comment-%')
    .limit(limit);

  if (error) {
    console.log('Error fetching reports:', error.message);
    return;
  }

  console.log(`Found ${reports.length} Reddit reports to check`);

  let processed = 0;
  let mediaFound = 0;
  let mediaInserted = 0;

  for (const report of reports) {
    // Check if report already has media
    const { count } = await supabase
      .from('report_media')
      .select('*', { count: 'exact', head: true })
      .eq('report_id', report.id);

    if (count && count > 0) {
      continue; // Already has media
    }

    // Extract image URLs from description
    const imageUrls = extractImageUrls(report.description || '');

    if (imageUrls.length > 0) {
      mediaFound += imageUrls.length;
      console.log(`Found ${imageUrls.length} images in: ${report.title?.substring(0, 40)}...`);

      if (!dryRun) {
        for (let i = 0; i < imageUrls.length; i++) {
          const { error: insertError } = await supabase
            .from('report_media')
            .insert({
              report_id: report.id,
              media_type: 'image',
              url: imageUrls[i],
              is_primary: i === 0
            });

          if (!insertError) {
            mediaInserted++;
          } else {
            console.log('Insert error:', insertError.message);
          }
        }

        // Add has-media tag
        const { data: existing } = await supabase
          .from('reports')
          .select('tags')
          .eq('id', report.id)
          .single();

        const tags = existing?.tags || [];
        if (!tags.includes('has-media')) {
          await supabase
            .from('reports')
            .update({ tags: [...tags, 'has-media'] })
            .eq('id', report.id);
        }
      }
    }
    processed++;
  }

  console.log(`\nBackfill Results:`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Media found: ${mediaFound}`);
  console.log(`  Media inserted: ${mediaInserted}`);
}

function extractImageUrls(text) {
  if (!text) return [];
  const urls = [];

  // Match image URLs
  const patterns = [
    /https?:\/\/i\.redd\.it\/[a-zA-Z0-9]+\.(jpg|jpeg|png|gif|webp)/gi,
    /https?:\/\/i\.imgur\.com\/[a-zA-Z0-9]+\.(jpg|jpeg|png|gif|webp)/gi,
    /https?:\/\/[^\s\)\]]+\.(jpg|jpeg|png|gif|webp)(\?[^\s\)\]]*)?/gi,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const match of matches) {
      const clean = match.replace(/&amp;/g, '&');
      if (!urls.includes(clean)) {
        urls.push(clean);
      }
    }
  }

  return urls;
}

async function main() {
  const migrated = await checkAndMigrate();
  await countReportsWithMedia();

  // Run backfill with a small batch first
  await runBackfill(50, false);

  console.log('\n=== Done ===');
}

main().catch(console.error);
