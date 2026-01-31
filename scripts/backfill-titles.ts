#!/usr/bin/env npx ts-node

/**
 * Title Backfill Script
 *
 * Improves titles for existing reports that have low-quality titles
 * (titles that are just the first line of the description)
 *
 * Run with: npx ts-node scripts/backfill-titles.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Category-specific phenomenon descriptors
const PHENOMENON_DESCRIPTORS: Record<string, string[]> = {
  'ufos_aliens': ['UFO Sighting', 'UAP Encounter', 'Strange Lights', 'Aerial Object'],
  'ghosts_hauntings': ['Paranormal Encounter', 'Apparition Sighting', 'Haunting Experience', 'Spirit Contact'],
  'cryptids': ['Creature Sighting', 'Cryptid Encounter', 'Unknown Animal', 'Unexplained Creature'],
  'psychological_experiences': ['Strange Experience', 'Unexplained Event', 'Reality Anomaly'],
  'consciousness_practices': ['Consciousness Experience', 'Astral Experience', 'OBE Encounter'],
  'psychic_phenomena': ['Psychic Experience', 'Precognitive Event', 'Intuitive Encounter'],
  'perception_sensory': ['Sensory Anomaly', 'Perception Experience', 'Unexplained Sensation'],
  'biological_factors': ['Biological Anomaly', 'Physical Experience', 'Body Phenomenon'],
  'religion_mythology': ['Spiritual Experience', 'Mythological Encounter', 'Religious Vision'],
  'esoteric_practices': ['Esoteric Experience', 'Occult Encounter', 'Mystical Event'],
  'multi_disciplinary': ['Paranormal Experience', 'Multi-Phenomenon Event', 'Complex Encounter'],
}

function extractKeyDetails(description: string, category: string): {
  phenomenon?: string
  keyFeature?: string
  location?: string
  timeContext?: string
} {
  const lowerDesc = description.toLowerCase()
  const details: ReturnType<typeof extractKeyDetails> = {}

  // Extract phenomenon type based on category and content
  if (category?.includes('cryptid') || category?.includes('bigfoot')) {
    if (/\b(tall|large|massive|huge)\b/.test(lowerDesc) && /\b(figure|creature|being)\b/.test(lowerDesc)) {
      details.phenomenon = 'Large Creature Sighting'
    } else if (/\b(hairy|furry|ape-like|bigfoot|sasquatch)\b/.test(lowerDesc)) {
      details.phenomenon = 'Bigfoot Encounter'
    } else if (/\b(yowie)\b/.test(lowerDesc)) {
      details.phenomenon = 'Yowie Sighting'
    } else {
      details.phenomenon = 'Creature Sighting'
    }
  } else if (category?.includes('ufo') || category?.includes('alien')) {
    if (/\b(triangle|triangular|v-shaped)\b/.test(lowerDesc)) {
      details.phenomenon = 'Triangular Craft Sighting'
    } else if (/\b(disc|saucer|flying saucer)\b/.test(lowerDesc)) {
      details.phenomenon = 'Disc-Shaped UFO'
    } else if (/\b(orb|sphere|ball of light)\b/.test(lowerDesc)) {
      details.phenomenon = 'Luminous Orb Sighting'
    } else if (/\b(lights?|glow|bright)\b/.test(lowerDesc)) {
      details.phenomenon = 'Strange Lights in Sky'
    } else {
      details.phenomenon = 'UFO Sighting'
    }
  } else if (category?.includes('ghost') || category?.includes('haunt')) {
    if (/\b(shadow|dark figure|black figure|shadow person)\b/.test(lowerDesc)) {
      details.phenomenon = 'Shadow Figure Encounter'
    } else if (/\b(apparition|transparent|see-through|ghost)\b/.test(lowerDesc)) {
      details.phenomenon = 'Ghostly Apparition'
    } else if (/\b(voice|whisper|heard|sound)\b/.test(lowerDesc) && /\b(no one|nobody|alone)\b/.test(lowerDesc)) {
      details.phenomenon = 'Disembodied Voice'
    } else if (/\b(poltergeist|moved|thrown|knocked)\b/.test(lowerDesc)) {
      details.phenomenon = 'Poltergeist Activity'
    } else {
      details.phenomenon = 'Paranormal Encounter'
    }
  } else if (category?.includes('consciousness') || category?.includes('psychological')) {
    if (/\b(out of body|obe|astral|floating above)\b/.test(lowerDesc)) {
      details.phenomenon = 'Out-of-Body Experience'
    } else if (/\b(nde|near death|died|heart stopped)\b/.test(lowerDesc)) {
      details.phenomenon = 'Near-Death Experience'
    } else if (/\b(glitch|reality|matrix|simulation)\b/.test(lowerDesc)) {
      details.phenomenon = 'Reality Glitch'
    } else if (/\b(missing time|lost time|time slip)\b/.test(lowerDesc)) {
      details.phenomenon = 'Missing Time Experience'
    } else if (/\b(deja vu|memory|remember)\b/.test(lowerDesc)) {
      details.phenomenon = 'Memory Anomaly'
    } else {
      details.phenomenon = 'Strange Experience'
    }
  } else {
    const categoryKey = category?.replace(/_/g, '_') || 'multi_disciplinary'
    const descriptors = PHENOMENON_DESCRIPTORS[categoryKey] || PHENOMENON_DESCRIPTORS['multi_disciplinary']
    details.phenomenon = descriptors?.[0] || 'Paranormal Experience'
  }

  // Extract key feature
  const featurePatterns = [
    { pattern: /\b(multiple witnesses|we all saw|everyone saw|group)\b/i, feature: 'with Multiple Witnesses' },
    { pattern: /\b(photograph|photo|video|filmed|recorded|camera)\b/i, feature: 'with Documentation' },
    { pattern: /\b(physical evidence|footprints?|marks?|proof)\b/i, feature: 'with Physical Evidence' },
    { pattern: /\b(chased|followed|pursued|ran)\b/i, feature: 'with Pursuit' },
    { pattern: /\b(paralyzed|couldn't move|frozen|sleep paralysis)\b/i, feature: 'with Paralysis' },
    { pattern: /\b(recurring|multiple times|happened again|keeps happening)\b/i, feature: 'Recurring' },
    { pattern: /\b(childhood|as a kid|as a child|when i was young|when i was little)\b/i, feature: 'from Childhood' },
  ]

  for (const { pattern, feature } of featurePatterns) {
    if (pattern.test(description)) {
      details.keyFeature = feature
      break
    }
  }

  // Extract location from description
  const locationPatterns = [
    /(?:in|at|near|outside|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,?\s+(?:[A-Z]{2}|[A-Z][a-z]+))/,
    /([A-Z][a-z]+,\s+[A-Z]{2})/,  // "Phoenix, AZ" format
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,?\s+(?:Australia|Canada|UK|USA|US))/i,
  ]

  for (const pattern of locationPatterns) {
    const match = description.match(pattern)
    if (match) {
      details.location = match[1].trim()
      break
    }
  }

  // Extract time context
  const timePatterns = [
    { pattern: /\b(at night|nighttime|after dark|late at night)\b/i, time: 'at Night' },
    { pattern: /\b(early morning|dawn|sunrise)\b/i, time: 'at Dawn' },
    { pattern: /\b(evening|dusk|sunset)\b/i, time: 'at Dusk' },
    { pattern: /\b(midnight|around midnight)\b/i, time: 'at Midnight' },
    { pattern: /\b(afternoon)\b/i, time: 'in the Afternoon' },
  ]

  for (const { pattern, time } of timePatterns) {
    if (pattern.test(description)) {
      details.timeContext = time
      break
    }
  }

  return details
}

function generateImprovedTitle(description: string, category: string, existingLocation?: string): string {
  const details = extractKeyDetails(description, category)

  const components: string[] = []

  // Start with phenomenon
  if (details.phenomenon) {
    components.push(details.phenomenon)
  }

  // Add key feature if present
  if (details.keyFeature) {
    components.push(details.keyFeature)
  }

  // Add location
  const location = existingLocation || details.location

  // Build the title
  let title: string

  if (components.length > 0 && location) {
    title = `${components.join(' ')} - ${location}`
  } else if (components.length > 0) {
    // Add time context if no location
    if (details.timeContext && components.length < 2) {
      title = `${components.join(' ')} ${details.timeContext}`
    } else {
      title = components.join(' ')
    }
  } else {
    // Fallback: extract meaningful first sentence
    const firstSentence = description.match(/^[^.!?\n]+[.!?]?/)
    if (firstSentence && firstSentence[0].length >= 20 && firstSentence[0].length <= 80) {
      title = firstSentence[0].replace(/[.!?]$/, '').trim()
    } else {
      title = 'Paranormal Experience Report'
    }
  }

  // Clean up and capitalize properly
  title = title
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word, i) => {
      const smallWords = ['a', 'an', 'the', 'in', 'on', 'at', 'by', 'for', 'of', 'to', 'with', 'from']
      if (i > 0 && smallWords.includes(word.toLowerCase()) && word !== word.toUpperCase()) {
        return word.toLowerCase()
      }
      if (word.length > 0) {
        return word.charAt(0).toUpperCase() + word.slice(1)
      }
      return word
    })
    .join(' ')

  // Truncate if too long
  if (title.length > 80) {
    title = title.substring(0, 77) + '...'
  }

  return title
}

function needsTitleImprovement(title: string, description: string): boolean {
  if (!title || !description) return false

  const normalizedTitle = title.trim().toLowerCase()
  const normalizedDesc = description.trim().toLowerCase()

  // Check if title is just the first line/sentence of description
  if (normalizedDesc.startsWith(normalizedTitle)) {
    return true
  }

  // Check if title is very short
  if (title.length < 20) {
    return true
  }

  // Check if title ends with "..." suggesting truncation
  if (title.endsWith('...') && title.length < 50) {
    return true
  }

  // Check if title is all lowercase
  if (title === title.toLowerCase() && title.length > 10) {
    return true
  }

  // Check if title looks like a comment/reply
  const commentPatterns = [
    /^(i think|i believe|in my opinion|imo|tbh|honestly)/i,
    /^(you (should|could|might|don't|can't))/i,
    /^(what if|why (do|don't|would|is))/i,
    /^(there (is|are|was|were) (a|some|many))/i,
    /^(it (is|was|could be|might be))/i,
  ]

  for (const pattern of commentPatterns) {
    if (pattern.test(title)) {
      return true
    }
  }

  return false
}

async function main() {
  console.log('Starting title backfill...\n')

  // Get all reports that might need title improvement
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, title, description, category, location_name, source_type')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching reports:', error)
    process.exit(1)
  }

  console.log(`Found ${reports.length} reports to analyze\n`)

  let improved = 0
  let skipped = 0
  const updates: { id: string; title: string; original_title: string }[] = []

  for (const report of reports) {
    if (!report.description || !report.title) {
      skipped++
      continue
    }

    if (needsTitleImprovement(report.title, report.description)) {
      const newTitle = generateImprovedTitle(
        report.description,
        report.category || 'multi_disciplinary',
        report.location_name
      )

      // Only update if the new title is actually different and better
      if (newTitle !== report.title && newTitle.length >= 15) {
        updates.push({
          id: report.id,
          title: newTitle,
          original_title: report.title
        })
        improved++

        console.log(`[${improved}] Improving title:`)
        console.log(`  Old: "${report.title.substring(0, 60)}${report.title.length > 60 ? '...' : ''}"`)
        console.log(`  New: "${newTitle}"`)
        console.log()
      } else {
        skipped++
      }
    } else {
      skipped++
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Reports analyzed: ${reports.length}`)
  console.log(`Titles to improve: ${improved}`)
  console.log(`Skipped (already good): ${skipped}`)

  if (updates.length === 0) {
    console.log('\nNo updates needed!')
    return
  }

  console.log(`\nApplying ${updates.length} updates...`)

  // Apply updates in batches
  const batchSize = 50
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)

    for (const update of batch) {
      const { error: updateError } = await supabase
        .from('reports')
        .update({
          title: update.title,
          original_title: update.original_title  // Store original for reference
        })
        .eq('id', update.id)

      if (updateError) {
        console.error(`Error updating ${update.id}:`, updateError)
      }
    }

    console.log(`  Updated ${Math.min(i + batchSize, updates.length)}/${updates.length}`)
  }

  console.log('\n✓ Title backfill complete!')
}

main().catch(console.error)
