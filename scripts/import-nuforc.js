/**
 * NUFORC Data Import Script
 *
 * This script imports UFO sighting data from NUFORC (National UFO Reporting Center)
 * format into the ParaDocs database.
 *
 * Usage:
 *   1. Download NUFORC data CSV from:
 *      - Kaggle: https://www.kaggle.com/datasets/NUFORC/ufo-sightings
 *      - CORGIS: https://corgis-edu.github.io/corgis/csv/ufo_sightings/
 *      - DataHerb: https://github.com/DataHerb/nuforc-ufo-records
 *
 *   2. Place the CSV file in the data/ directory
 *
 *   3. Run: node scripts/import-nuforc.js [options]
 *
 * Options:
 *   --file=<path>     Path to CSV file (default: data/nuforc_sightings.csv)
 *   --limit=<n>       Limit number of records to import
 *   --offset=<n>      Skip first n records
 *   --dry-run         Don't actually insert, just validate
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=')
  acc[key] = value || true
  return acc
}, {})

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// UFO shape to phenomenon type mapping
const SHAPE_TO_TYPE = {
  'light': 'ufo-sighting',
  'circle': 'ufo-sighting',
  'sphere': 'ufo-sighting',
  'fireball': 'ufo-sighting',
  'unknown': 'ufo-sighting',
  'oval': 'ufo-sighting',
  'disk': 'ufo-sighting',
  'triangle': 'ufo-sighting',
  'cigar': 'ufo-sighting',
  'rectangle': 'ufo-sighting',
  'formation': 'ufo-sighting',
  'changing': 'ufo-sighting',
  'diamond': 'ufo-sighting',
  'chevron': 'ufo-sighting',
  'flash': 'ufo-sighting',
  'cylinder': 'ufo-sighting',
  'cone': 'ufo-sighting',
  'cross': 'ufo-sighting',
  'egg': 'ufo-sighting',
  'teardrop': 'ufo-sighting',
  'other': 'ufo-sighting',
}

// US state abbreviations to full names
const US_STATES = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
}

/**
 * Parse CSV content into array of objects
 */
function parseCSV(content) {
  const lines = content.split('\n')
  const headers = parseCSVLine(lines[0])
  const records = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = parseCSVLine(lines[i])
    const record = {}
    headers.forEach((header, idx) => {
      record[header.trim().toLowerCase().replace(/\s+/g, '_')] = values[idx]?.trim() || null
    })
    records.push(record)
  }

  return records
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"' && !inQuotes) {
      inQuotes = true
    } else if (char === '"' && inQuotes) {
      if (nextChar === '"') {
        current += '"'
        i++
      } else {
        inQuotes = false
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }
  values.push(current)

  return values
}

/**
 * Generate a URL-safe slug from a string
 */
function generateSlug(text, id) {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80)
  return `${base}-${id}`
}

/**
 * Parse various date formats from NUFORC data
 */
function parseDate(dateStr) {
  if (!dateStr) return null

  // Try various formats
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY
    /^(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
    /^(\d{1,2})-(\d{1,2})-(\d{4})/, // MM-DD-YYYY
  ]

  for (const format of formats) {
    const match = dateStr.match(format)
    if (match) {
      if (format === formats[1]) {
        return `${match[1]}-${match[2]}-${match[3]}`
      } else {
        const month = match[1].padStart(2, '0')
        const day = match[2].padStart(2, '0')
        const year = match[3]
        return `${year}-${month}-${day}`
      }
    }
  }

  return null
}

/**
 * Parse duration string to minutes
 */
function parseDuration(durationStr) {
  if (!durationStr) return null

  const str = durationStr.toLowerCase()
  let minutes = 0

  // Match hours
  const hourMatch = str.match(/(\d+)\s*(?:hour|hr|h)/i)
  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60

  // Match minutes
  const minMatch = str.match(/(\d+)\s*(?:minute|min|m)/i)
  if (minMatch) minutes += parseInt(minMatch[1])

  // Match seconds
  const secMatch = str.match(/(\d+)\s*(?:second|sec|s)/i)
  if (secMatch) minutes += Math.ceil(parseInt(secMatch[1]) / 60)

  // If just a number, assume seconds
  if (minutes === 0) {
    const numMatch = str.match(/^(\d+)$/)
    if (numMatch) minutes = Math.ceil(parseInt(numMatch[1]) / 60) || 1
  }

  return minutes > 0 ? Math.min(minutes, 10080) : null // Cap at 1 week
}

/**
 * Determine credibility based on available information
 */
function assessCredibility(record) {
  let score = 0

  // Has detailed description
  if (record.text && record.text.length > 200) score++
  if (record.text && record.text.length > 500) score++

  // Has specific location
  if (record.city && record.state) score++

  // Has specific date/time
  if (record.date_time) score++

  // Has shape description
  if (record.shape && record.shape !== 'unknown') score++

  // Has duration
  if (record.duration) score++

  if (score >= 5) return 'high'
  if (score >= 3) return 'medium'
  if (score >= 1) return 'low'
  return 'unverified'
}

/**
 * Transform NUFORC record to ParaDocs format
 */
function transformRecord(record, index, phenomenonTypeId) {
  const city = record.city || ''
  const state = record.state || ''
  const country = record.country || 'United States'
  const stateFullName = US_STATES[state] || state

  // Build location name
  const locationParts = [city, stateFullName].filter(Boolean)
  const locationName = locationParts.join(', ') || null

  // Generate title from shape and location
  const shape = record.shape || 'Unknown'
  const titleShape = shape.charAt(0).toUpperCase() + shape.slice(1).toLowerCase()
  const title = city
    ? `${titleShape} UFO Sighting in ${city}, ${state}`
    : `${titleShape} UFO Sighting`

  // Generate slug
  const slug = generateSlug(title, index)

  // Parse description/summary
  const description = record.text || record.comments || record.summary || 'No description available.'
  const summary = description.length > 250
    ? description.substring(0, 247) + '...'
    : description

  // Parse coordinates
  const latitude = parseFloat(record.latitude || record.city_latitude) || null
  const longitude = parseFloat(record.longitude || record.city_longitude) || null

  // Parse date
  const eventDate = parseDate(record.date_time || record.datetime || record.date)

  // Generate tags based on content
  const tags = ['nuforc', shape.toLowerCase()]
  if (state) tags.push(state.toLowerCase())
  if (description.toLowerCase().includes('triangle')) tags.push('triangular')
  if (description.toLowerCase().includes('light')) tags.push('lights')
  if (description.toLowerCase().includes('military')) tags.push('military')
  if (description.toLowerCase().includes('airplane') || description.toLowerCase().includes('aircraft')) tags.push('aircraft-comparison')

  return {
    title,
    slug,
    summary,
    description,
    category: 'ufo_uap',
    phenomenon_type_id: phenomenonTypeId,
    location_name: locationName,
    country: country === 'us' || country === 'usa' ? 'United States' : country,
    state_province: stateFullName,
    city: city || null,
    latitude,
    longitude,
    event_date: eventDate,
    event_duration_minutes: parseDuration(record.duration),
    credibility: assessCredibility(record),
    source_type: 'nuforc',
    source_url: record.report_link || null,
    original_report_id: record.id || `nuforc-${index}`,
    status: 'approved',
    tags,
    has_photo_video: record.images === 'Yes' || false,
  }
}

/**
 * Main import function
 */
async function importNUFORC() {
  const csvPath = args.file || path.join(__dirname, '..', 'data', 'nuforc_sightings.csv')
  const limit = parseInt(args.limit) || Infinity
  const offset = parseInt(args.offset) || 0
  const dryRun = args['dry-run'] || false

  console.log('='.repeat(60))
  console.log('NUFORC Data Import')
  console.log('='.repeat(60))
  console.log(`CSV Path: ${csvPath}`)
  console.log(`Limit: ${limit === Infinity ? 'None' : limit}`)
  console.log(`Offset: ${offset}`)
  console.log(`Dry Run: ${dryRun}`)
  console.log('='.repeat(60))

  // Check if file exists
  if (!fs.existsSync(csvPath)) {
    console.error(`\nError: CSV file not found at ${csvPath}`)
    console.log('\nTo import NUFORC data:')
    console.log('1. Download from one of these sources:')
    console.log('   - Kaggle: https://www.kaggle.com/datasets/NUFORC/ufo-sightings')
    console.log('   - CORGIS: https://corgis-edu.github.io/corgis/csv/ufo_sightings/')
    console.log('   - DataHerb: https://github.com/DataHerb/nuforc-ufo-records')
    console.log(`2. Place the file at: ${csvPath}`)
    console.log('3. Run this script again')
    process.exit(1)
  }

  // Get phenomenon type ID for UFO Sighting
  const { data: phenomenonTypes } = await supabase
    .from('phenomenon_types')
    .select('*')
    .eq('slug', 'ufo-sighting')
    .single()

  const phenomenonTypeId = phenomenonTypes?.id || null
  console.log(`\nPhenomenon Type ID: ${phenomenonTypeId || 'Not found (will be null)'}`)

  // Read and parse CSV
  console.log('\nReading CSV file...')
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const records = parseCSV(csvContent)
  console.log(`Total records in CSV: ${records.length}`)

  // Apply offset and limit
  const toProcess = records.slice(offset, offset + limit)
  console.log(`Records to process: ${toProcess.length}`)

  if (dryRun) {
    console.log('\n[DRY RUN] Would import the following records:')
    toProcess.slice(0, 5).forEach((record, i) => {
      const transformed = transformRecord(record, offset + i, phenomenonTypeId)
      console.log(`\n${i + 1}. ${transformed.title}`)
      console.log(`   Location: ${transformed.location_name || 'Unknown'}`)
      console.log(`   Date: ${transformed.event_date || 'Unknown'}`)
      console.log(`   Credibility: ${transformed.credibility}`)
    })
    if (toProcess.length > 5) {
      console.log(`\n... and ${toProcess.length - 5} more records`)
    }
    return
  }

  // Transform and insert records
  console.log('\nImporting records...')
  let imported = 0
  let skipped = 0
  let errors = 0

  // Process in batches of 100
  const batchSize = 100
  for (let i = 0; i < toProcess.length; i += batchSize) {
    const batch = toProcess.slice(i, i + batchSize)
    const transformedBatch = batch.map((record, idx) =>
      transformRecord(record, offset + i + idx, phenomenonTypeId)
    )

    const { data, error } = await supabase
      .from('reports')
      .upsert(transformedBatch, { onConflict: 'slug', ignoreDuplicates: true })
      .select('id')

    if (error) {
      console.error(`Batch error at ${i}: ${error.message}`)
      errors += batch.length

      // Try individual inserts for this batch
      for (let j = 0; j < transformedBatch.length; j++) {
        const { error: singleError } = await supabase
          .from('reports')
          .upsert(transformedBatch[j], { onConflict: 'slug', ignoreDuplicates: true })

        if (singleError) {
          if (singleError.code === '23505') { // Duplicate
            skipped++
          } else {
            console.error(`  Error on record ${i + j}: ${singleError.message}`)
          }
        } else {
          imported++
        }
      }
    } else {
      imported += data?.length || 0
    }

    // Progress update
    const progress = Math.min(i + batchSize, toProcess.length)
    process.stdout.write(`\rProgress: ${progress}/${toProcess.length} (${Math.round(progress/toProcess.length*100)}%)`)
  }

  console.log('\n')
  console.log('='.repeat(60))
  console.log('Import Complete!')
  console.log('='.repeat(60))
  console.log(`Imported: ${imported}`)
  console.log(`Skipped (duplicates): ${skipped}`)
  console.log(`Errors: ${errors}`)
}

// Run the import
importNUFORC().catch(err => {
  console.error('Import failed:', err)
  process.exit(1)
})
