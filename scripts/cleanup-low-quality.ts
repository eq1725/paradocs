/**
 * Cleanup Low Quality Reports
 * Identifies and removes posts that aren't actual experiences
 * Run: SUPABASE_SERVICE_ROLE_KEY="your_key" npx tsx scripts/cleanup-low-quality.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually
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

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing required env vars.')
  console.error('Run with: SUPABASE_SERVICE_ROLE_KEY="your_key" npx tsx scripts/cleanup-low-quality.ts')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Single-word cryptid/phenomenon names that aren't experiences
const NAME_ONLY_PATTERNS = [
  /^(bigfoot|sasquatch|yeti|mothman|chupacabra|jackalope|wendigo|skinwalker|dogman|goatman)$/i,
  /^(thunderbird|jersey devil|loch ness|nessie|ogopogo|champ|mokele-mbembe|bunyip)$/i,
  /^(grey|gray|nordic|reptilian|mantis)s?\s*(alien)?$/i,
  /^(ufo|uap|orb|triangle|tic tac|cigar)s?$/i,
  /^(ghost|apparition|poltergeist|shadow person|hat man|demon)s?$/i,
  /^(tulpa|nde|obe|astral projection|sleep paralysis)$/i,
  /^(cryptid|creature|monster|alien|entity)$/i,
]

// Check if description has first-person experience markers
function hasFirstPersonExperience(description: string): boolean {
  const patterns = [
    /\b(I|we)\s+(saw|heard|felt|experienced|encountered|witnessed|noticed|remember|was)\b/i,
    /\bmy\s+(experience|encounter|sighting|story)\b/i,
    /\bhappened\s+to\s+me\b/i,
    /\bI\s+was\s+(walking|driving|sitting|lying|standing|outside|inside|at|in)\b/i,
  ]
  return patterns.some(p => p.test(description))
}

// Check if title is just a name
function isNameOnlyTitle(title: string): boolean {
  const trimmed = title.trim()
  return NAME_ONLY_PATTERNS.some(p => p.test(trimmed))
}

// Mode: 'scan' just lists, 'delete' removes them
const MODE = process.argv[2] || 'scan'
const BATCH_SIZE = 100

async function main() {
  console.log(`=== Low Quality Report Cleanup (${MODE.toUpperCase()} mode) ===\n`)

  if (MODE === 'delete') {
    console.log('⚠️  DELETE MODE - Reports will be permanently removed!\n')
  }

  let offset = 0
  let totalScanned = 0
  let totalFlagged = 0
  let totalDeleted = 0
  const flaggedReports: { id: string; title: string; slug: string; reason: string }[] = []

  // Get total count first
  const { count } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })

  console.log(`Total reports in database: ${count}\n`)

  while (true) {
    const { data: reports, error } = await supabase
      .from('reports')
      .select('id, title, slug, description, source_label')
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      console.error('Error fetching reports:', error)
      break
    }

    if (!reports || reports.length === 0) break

    for (const report of reports) {
      totalScanned++
      let flagReason = ''

      // Check 1: Name-only title without first-person experience
      if (isNameOnlyTitle(report.title)) {
        if (!hasFirstPersonExperience(report.description || '')) {
          flagReason = 'Name-only title, no first-person experience'
        }
      }

      // Check 2: Very short description (under 100 chars)
      if (!flagReason && (report.description?.length || 0) < 100) {
        flagReason = 'Description too short'
      }

      // Check 3: Title matches common non-experience patterns
      const nonExperiencePatterns = [
        /^(daily|weekly|monthly)\s+(cryptid|creature|monster|ufo|ghost)/i,
        /\b(cryptid|creature|monster)\s+(of the day|of the week)\b/i,
        /^(look at this|check out this)\s+(pic|photo|image|video|article|link)\b/i,
        /\b(my|some|new|more)\s+(art|artwork|drawing|painting)\b/i,
        /\bart\s+(i made|i drew|inspired by)\b/i,
        /\b(meme|shitpost)\b/i,
        /\b(for sale|buy now|merch|merchandise|etsy|redbubble)\b/i,
      ]
      if (!flagReason) {
        for (const pattern of nonExperiencePatterns) {
          if (pattern.test(report.title)) {
            flagReason = `Non-experience pattern: ${pattern.source.substring(0, 20)}`
            break
          }
        }
      }

      // False positive exclusions - don't flag these
      if (flagReason) {
        const title = report.title.toLowerCase()
        const desc = (report.description || '').toLowerCase()

        // "Art Bell" is a person, not artwork
        if (/art bell/i.test(report.title)) flagReason = ''

        // "Not a joke" means it's serious
        if (/not a joke/i.test(report.title)) flagReason = ''

        // "Drawing/sketch of what I saw" is still an experience
        if (/\b(drawing|sketch)\s+(of )?(what|something)\s+i\s+(saw|witnessed)/i.test(report.title)) flagReason = ''

        // "Here's what I saw/experienced" is an experience
        if (/here'?s\s+what\s+i\s+(saw|experienced|witnessed)/i.test(report.title)) flagReason = ''

        // If description has clear first-person experience, keep it
        if (flagReason && /\bi\s+(saw|witnessed|experienced|encountered)\s+(a|an|the|this|something)/i.test(desc)) {
          flagReason = ''
        }
      }

      if (flagReason) {
        totalFlagged++
        flaggedReports.push({
          id: report.id,
          title: report.title,
          slug: report.slug,
          reason: flagReason
        })

        if (MODE === 'delete') {
          // Delete from report_phenomena first (foreign key)
          await supabase
            .from('report_phenomena')
            .delete()
            .eq('report_id', report.id)

          // Then delete the report
          const { error: deleteError } = await supabase
            .from('reports')
            .delete()
            .eq('id', report.id)

          if (!deleteError) {
            totalDeleted++
          } else {
            console.error(`Failed to delete ${report.slug}:`, deleteError.message)
          }
        }
      }
    }

    offset += BATCH_SIZE
    process.stdout.write(`\rScanned: ${totalScanned} | Flagged: ${totalFlagged}${MODE === 'delete' ? ` | Deleted: ${totalDeleted}` : ''}`)
  }

  console.log('\n\n=== Results ===')
  console.log(`Total scanned: ${totalScanned}`)
  console.log(`Total flagged: ${totalFlagged}`)
  if (MODE === 'delete') {
    console.log(`Total deleted: ${totalDeleted}`)
  }

  if (MODE === 'scan' && flaggedReports.length > 0) {
    console.log('\n=== Flagged Reports (first 50) ===')
    for (const report of flaggedReports.slice(0, 50)) {
      console.log(`- "${report.title}" (${report.slug})`)
      console.log(`  Reason: ${report.reason}`)
    }

    if (flaggedReports.length > 50) {
      console.log(`\n... and ${flaggedReports.length - 50} more`)
    }

    console.log('\nTo delete these reports, run:')
    console.log('SUPABASE_SERVICE_ROLE_KEY="your_key" npx tsx scripts/cleanup-low-quality.ts delete')
  }
}

main().catch(console.error)
