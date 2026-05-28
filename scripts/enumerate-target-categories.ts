#!/usr/bin/env tsx
/**
 * One-shot enumeration of phenomena in the 3 categories that the
 * priority-classifier doesn't yet cover (ufos_aliens, ghosts_hauntings,
 * cryptids). Prints slug, name, category, report_count for each so we
 * can curate TARGETS entries.
 *
 * Run:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/enumerate-target-categories.ts
 */

import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const CATEGORIES = ['ufos_aliens', 'ghosts_hauntings', 'cryptids']

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  for (const cat of CATEGORIES) {
    const { data, error } = await sb
      .from('phenomena')
      .select('slug, name, category, report_count')
      .eq('category', cat)
      .order('report_count', { ascending: false })

    if (error) {
      console.error(`ERROR ${cat}:`, error.message)
      continue
    }

    console.log(`\n=== ${cat} (${data?.length || 0} phenomena) ===`)
    let total = 0
    for (const p of data || []) {
      console.log(`  ${String(p.report_count || 0).padStart(5)} | ${p.slug.padEnd(40)} | ${p.name}`)
      total += p.report_count || 0
    }
    console.log(`  ${'─'.repeat(60)}`)
    console.log(`  total: ${total} report-links across ${data?.length || 0} phens`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
