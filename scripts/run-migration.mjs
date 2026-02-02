// Run migration 020 via Supabase
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('Running migration 020_media_ai_tags...');

  // Run each statement separately
  const statements = [
    // Add columns
    `ALTER TABLE public.report_media ADD COLUMN IF NOT EXISTS ai_tags TEXT[] DEFAULT '{}'`,
    `ALTER TABLE public.report_media ADD COLUMN IF NOT EXISTS ai_description TEXT`,
    `ALTER TABLE public.report_media ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ`,

    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_report_media_ai_tags ON public.report_media USING GIN (ai_tags)`,
    `CREATE INDEX IF NOT EXISTS idx_report_media_unanalyzed ON public.report_media (ai_analyzed_at) WHERE ai_analyzed_at IS NULL`,
  ];

  for (const sql of statements) {
    console.log(`Executing: ${sql.substring(0, 60)}...`);
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(e => ({ error: e }));
    if (error) {
      // Try direct query via REST
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql_query: sql })
      });
      if (!response.ok) {
        console.log(`Note: ${sql.substring(0, 40)}... - may need manual execution`);
      }
    }
  }

  console.log('Migration statements sent. Check Supabase dashboard to verify.');
}

runMigration().catch(console.error);
