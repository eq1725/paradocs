/**
 * Link Tulpa reports to Tulpa phenomenon
 * Run: npx tsx scripts/link-tulpa-reports.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually with better parsing
function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }
  return env
}

const env = loadEnv()

// Allow env var override or fall back to .env.local
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing required env vars.')
  console.error('Run with: SUPABASE_SERVICE_ROLE_KEY="your_key" npx tsx scripts/link-tulpa-reports.ts')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const TULPA_PHENOMENON_ID = 'd9372cd4-eff0-4819-936e-dac9ce51ad55'
const BATCH_SIZE = 100  // Smaller batches
const START_OFFSET = 3000  // Resume from where we left off

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log('=== Linking Tulpa Reports to Tulpa Phenomenon ===\n')

  // Get total count
  const { count, error: countError } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .ilike('source_label', '%tulpa%')

  if (countError) {
    console.error('Error getting count:', countError)
    process.exit(1)
  }

  console.log(`Found ${count} Tulpa reports total`)
  console.log(`Starting from offset ${START_OFFSET}`)

  let processed = START_OFFSET
  let inserted = 0
  let errors = 0
  let offset = START_OFFSET

  while (offset < (count || 0)) {
    // Get batch of report IDs
    const { data: reports, error: fetchError } = await supabase
      .from('reports')
      .select('id')
      .ilike('source_label', '%tulpa%')
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (fetchError) {
      console.error(`Error fetching batch at offset ${offset}:`, fetchError)
      offset += BATCH_SIZE
      errors++
      continue
    }

    if (!reports || reports.length === 0) break

    // Insert links one by one to avoid timeout
    for (const report of reports) {
      const { error: insertError } = await supabase
        .from('report_phenomena')
        .upsert({
          report_id: report.id,
          phenomenon_id: TULPA_PHENOMENON_ID,
          confidence: 0.9,
          tagged_by: 'auto_retag'
        }, { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true })

      if (insertError) {
        errors++
      } else {
        inserted++
      }
    }

    processed += reports.length
    offset += BATCH_SIZE

    console.log(`Progress: ${processed}/${count} (${Math.round(processed/count!*100)}%) - Linked: ${inserted}, Errors: ${errors}`)

    // Small delay between batches
    await sleep(100)
  }

  console.log(`\n=== Complete ===`)
  console.log(`Processed: ${processed}`)
  console.log(`Linked: ${inserted}`)
}

main().catch(console.error)
