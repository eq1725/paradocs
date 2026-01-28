/**
 * Generate UFO Sighting Data
 *
 * This script generates realistic UFO sighting reports based on
 * patterns from NUFORC data for testing and demonstration.
 *
 * Usage: node scripts/generate-ufo-data.js [--count=500]
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

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

// Simple Supabase REST client using fetch
async function supabaseQuery(table, method, options = {}) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`)

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation'
  }

  if (options.select) {
    url.searchParams.set('select', options.select)
  }

  if (options.filters) {
    for (const [key, value] of Object.entries(options.filters)) {
      url.searchParams.set(key, value)
    }
  }

  const fetchOptions = {
    method,
    headers,
  }

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body)
  }

  const response = await fetch(url.toString(), fetchOptions)

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Supabase error: ${response.status} - ${text}`)
  }

  return response.json()
}

// Common UFO shapes with their relative frequency
const UFO_SHAPES = [
  { shape: 'light', weight: 25 },
  { shape: 'circle', weight: 15 },
  { shape: 'triangle', weight: 12 },
  { shape: 'sphere', weight: 10 },
  { shape: 'fireball', weight: 8 },
  { shape: 'unknown', weight: 7 },
  { shape: 'oval', weight: 5 },
  { shape: 'disk', weight: 5 },
  { shape: 'cigar', weight: 4 },
  { shape: 'formation', weight: 3 },
  { shape: 'rectangle', weight: 2 },
  { shape: 'chevron', weight: 2 },
  { shape: 'diamond', weight: 1 },
  { shape: 'cylinder', weight: 1 },
]

// US cities with high UFO report rates (based on NUFORC data)
const UFO_HOTSPOTS = [
  { city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.0740 },
  { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
  { city: 'San Diego', state: 'CA', lat: 32.7157, lng: -117.1611 },
  { city: 'Houston', state: 'TX', lat: 29.7604, lng: -95.3698 },
  { city: 'Las Vegas', state: 'NV', lat: 36.1699, lng: -115.1398 },
  { city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
  { city: 'Portland', state: 'OR', lat: 45.5051, lng: -122.6750 },
  { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
  { city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 },
  { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
  { city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
  { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.0060 },
  { city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
  { city: 'Albuquerque', state: 'NM', lat: 35.0844, lng: -106.6504 },
  { city: 'Tucson', state: 'AZ', lat: 32.2226, lng: -110.9747 },
  { city: 'Tampa', state: 'FL', lat: 27.9506, lng: -82.4572 },
  { city: 'Orlando', state: 'FL', lat: 28.5383, lng: -81.3792 },
  { city: 'Atlanta', state: 'GA', lat: 33.7490, lng: -84.3880 },
  { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.7970 },
  { city: 'Sacramento', state: 'CA', lat: 38.5816, lng: -121.4944 },
  { city: 'San Jose', state: 'CA', lat: 37.3382, lng: -121.8863 },
  { city: 'Indianapolis', state: 'IN', lat: 39.7684, lng: -86.1581 },
  { city: 'Columbus', state: 'OH', lat: 39.9612, lng: -82.9988 },
  { city: 'Charlotte', state: 'NC', lat: 35.2271, lng: -80.8431 },
  { city: 'Nashville', state: 'TN', lat: 36.1627, lng: -86.7816 },
  { city: 'Salt Lake City', state: 'UT', lat: 40.7608, lng: -111.8910 },
  { city: 'Reno', state: 'NV', lat: 39.5296, lng: -119.8138 },
  { city: 'Roswell', state: 'NM', lat: 33.3943, lng: -104.5230 },
  { city: 'Sedona', state: 'AZ', lat: 34.8697, lng: -111.7610 },
  { city: 'Eugene', state: 'OR', lat: 44.0521, lng: -123.0868 },
]

// Additional smaller towns for variety
const SMALL_TOWNS = [
  { city: 'Marfa', state: 'TX', lat: 30.3087, lng: -104.0214 },
  { city: 'Rachel', state: 'NV', lat: 37.6453, lng: -115.7458 },
  { city: 'Groom Lake', state: 'NV', lat: 37.2350, lng: -115.8111 },
  { city: 'Gulf Breeze', state: 'FL', lat: 30.3571, lng: -87.1639 },
  { city: 'Stephenville', state: 'TX', lat: 32.2207, lng: -98.2023 },
  { city: 'Pine Bush', state: 'NY', lat: 41.6084, lng: -74.2985 },
  { city: 'Dulce', state: 'NM', lat: 36.9336, lng: -106.9989 },
  { city: 'Skinwalker Ranch', state: 'UT', lat: 40.2588, lng: -109.8880 },
]

// State name mapping
const STATE_NAMES = {
  'AZ': 'Arizona', 'CA': 'California', 'TX': 'Texas', 'NV': 'Nevada',
  'WA': 'Washington', 'OR': 'Oregon', 'CO': 'Colorado', 'IL': 'Illinois',
  'FL': 'Florida', 'NY': 'New York', 'NM': 'New Mexico', 'GA': 'Georgia',
  'IN': 'Indiana', 'OH': 'Ohio', 'NC': 'North Carolina', 'TN': 'Tennessee',
  'UT': 'Utah'
}

// Description templates
const DESCRIPTION_TEMPLATES = {
  light: [
    "I was outside around {time} when I noticed a bright {color} light in the {direction} sky. It was moving {movement} and appeared to be at high altitude. The light was much brighter than any star or planet. I watched it for about {duration} before it {ending}.",
    "While driving on {road} near {city}, I observed what appeared to be a brilliant light hovering in the sky. It was {color} in color and pulsated rhythmically. After approximately {duration}, the light shot off at incredible speed toward the {direction}.",
    "My family and I witnessed multiple lights in formation over our neighborhood. There were {count} lights total, arranged in a {pattern} pattern. They moved silently across the sky, maintaining perfect formation. We observed them for {duration} until they faded from view.",
  ],
  triangle: [
    "A massive triangular craft passed directly overhead, blocking out the stars. It had {color} lights at each corner and moved completely silently. The size was enormous - I estimate at least {size} feet across. It traveled slowly toward the {direction} for about {duration}.",
    "I observed a dark triangular object with three {color} lights hovering near the {landmark}. It made no sound whatsoever. After hovering for {duration}, it accelerated rapidly and disappeared within seconds.",
    "What I can only describe as a black triangle flew over my location at low altitude. The craft was clearly defined against the night sky and had a light at each vertex. I felt a strange vibration as it passed overhead.",
  ],
  sphere: [
    "A glowing {color} sphere descended from the clouds and hovered approximately {height} feet above the ground. It had a metallic appearance and seemed to pulse with energy. After {duration} of observation, it shot straight up and vanished.",
    "I witnessed a perfectly spherical object moving against the wind at high speed. It appeared to be {color} and left no trail. The sphere made several rapid direction changes that would be impossible for conventional aircraft.",
    "Multiple spherical objects emerged from a larger craft and began moving independently. They appeared to be scanning the area, moving in grid patterns. This continued for {duration} before they returned to the larger object.",
  ],
  disk: [
    "A classic disc-shaped object appeared in the sky around {time}. It was metallic in appearance with a dome on top. The craft rotated slowly while hovering. I could see {color} lights around its perimeter.",
    "What appeared to be a flying saucer descended to about {height} feet. It had a distinct disc shape with a raised center section. The craft made a low humming sound before rapidly ascending and disappearing.",
    "I observed a disc-shaped UFO performing impossible maneuvers over the {area}. It would hover, then instantly move to another position. No aircraft I know of can move like that.",
  ],
  fireball: [
    "A brilliant {color} fireball streaked across the sky, but unlike a meteor, it stopped mid-flight and hovered. It remained stationary for about {duration} before continuing in a different direction.",
    "I witnessed what I initially thought was a meteor, but it changed direction multiple times. The {color} light was intensely bright and left a glowing trail that faded slowly.",
    "Multiple fireballs appeared simultaneously and moved in formation. They were {color} in color and moved too slowly to be meteors. After {duration}, they extinguished simultaneously.",
  ],
  cigar: [
    "A large cigar-shaped object moved slowly across the sky. It appeared to be {color} and had several {light_color} lights along its length. The craft made no sound and was visible for {duration}.",
    "I observed an elongated cylindrical craft hovering over the {area}. It was enormous - easily {size} feet long. After several minutes, smaller objects appeared to exit from one end.",
    "What looked like a flying cigar passed overhead at moderate speed. It was metallic and reflected sunlight. No wings or propulsion were visible.",
  ],
  formation: [
    "A group of {count} lights flew in perfect {pattern} formation. They maintained exact spacing and moved as one unit. The formation made several turns in unison before heading {direction}.",
    "I witnessed approximately {count} objects flying in formation. They appeared to be intelligently controlled as they maneuvered together. Some objects occasionally broke formation then rejoined.",
    "Multiple UFOs in a V-formation flew silently overhead. I counted {count} individual lights. They were visible for {duration} before disappearing behind the mountains.",
  ],
  unknown: [
    "I observed something in the sky that I cannot identify. It was {color} and moved in ways that defied conventional explanation. The object was visible for {duration}.",
    "Something strange flew over my property last night. I can't describe the shape clearly, but it had {color} lights and made no sound. It didn't look like any aircraft I've ever seen.",
    "My security camera captured an unidentified object around {time}. Upon review, I could see something moving erratically across the sky. The motion was unlike any aircraft or drone.",
  ],
}

// Colors, directions, and other vocabulary
const COLORS = ['white', 'orange', 'red', 'blue', 'green', 'yellow', 'amber', 'multicolored', 'pulsating white', 'brilliant white']
const DIRECTIONS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest']
const MOVEMENTS = ['steadily', 'erratically', 'in a zigzag pattern', 'smoothly', 'with sudden stops and starts']
const ENDINGS = ['simply vanished', 'shot off at incredible speed', 'faded away gradually', 'descended behind the horizon', 'blinked out']
const PATTERNS = ['triangular', 'V-shaped', 'linear', 'diamond', 'circular']
const LANDMARKS = ['mountains', 'lake', 'airport', 'military base', 'downtown area', 'highway', 'forest']
const ROADS = ['Highway 50', 'Interstate 10', 'Route 66', 'Highway 395', 'the main highway']

// Helper functions
function weightedRandom(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  let random = Math.random() * total
  for (const item of items) {
    if (random < item.weight) return item.shape
    random -= item.weight
  }
  return items[0].shape
}

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)]
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomDate(startYear, endYear) {
  const start = new Date(startYear, 0, 1)
  const end = new Date(endYear, 11, 31)
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
  return date.toISOString().split('T')[0]
}

function randomTime() {
  // UFO sightings peak between 8pm and 11pm
  const hour = Math.random() < 0.6 ? randomInt(20, 23) : randomInt(0, 19)
  const minute = randomInt(0, 59)
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`
}

function generateDescription(shape, location) {
  const templates = DESCRIPTION_TEMPLATES[shape] || DESCRIPTION_TEMPLATES['unknown']
  let description = randomItem(templates)

  // Replace placeholders
  description = description
    .replace(/{color}/g, randomItem(COLORS))
    .replace(/{light_color}/g, randomItem(COLORS))
    .replace(/{direction}/g, randomItem(DIRECTIONS))
    .replace(/{movement}/g, randomItem(MOVEMENTS))
    .replace(/{ending}/g, randomItem(ENDINGS))
    .replace(/{duration}/g, `${randomInt(1, 30)} minutes`)
    .replace(/{time}/g, `${randomInt(7, 11)}:${randomInt(0, 59).toString().padStart(2, '0')} PM`)
    .replace(/{count}/g, randomInt(3, 12))
    .replace(/{pattern}/g, randomItem(PATTERNS))
    .replace(/{size}/g, randomInt(50, 500))
    .replace(/{height}/g, randomInt(100, 3000))
    .replace(/{landmark}/g, randomItem(LANDMARKS))
    .replace(/{road}/g, randomItem(ROADS))
    .replace(/{city}/g, location.city)
    .replace(/{area}/g, `${location.city} area`)

  return description
}

function generateSlug(title, index) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80)
  return `${base}-nuforc-${index}`
}

function assessCredibility() {
  const rand = Math.random()
  if (rand < 0.1) return 'high'
  if (rand < 0.4) return 'medium'
  if (rand < 0.8) return 'low'
  return 'unverified'
}

async function generateData() {
  const count = parseInt(args.count) || 500

  console.log('='.repeat(60))
  console.log('UFO Sighting Data Generator')
  console.log('='.repeat(60))
  console.log(`Generating ${count} UFO sighting reports...`)

  // Get phenomenon type ID
  let phenomenonTypeId = null
  try {
    const data = await supabaseQuery('phenomenon_types', 'GET', {
      select: 'id',
      filters: { 'slug': 'eq.ufo-sighting' }
    })
    phenomenonTypeId = data[0]?.id || null
  } catch (err) {
    console.log('Could not fetch phenomenon type:', err.message)
  }
  console.log(`Phenomenon Type ID: ${phenomenonTypeId || 'Not found'}`)

  const allLocations = [...UFO_HOTSPOTS, ...UFO_HOTSPOTS, ...SMALL_TOWNS] // Weight toward hotspots
  const reports = []

  for (let i = 0; i < count; i++) {
    const shape = weightedRandom(UFO_SHAPES)
    const location = randomItem(allLocations)
    const shapeTitle = shape.charAt(0).toUpperCase() + shape.slice(1)

    // Add some coordinate variation
    const latVariation = (Math.random() - 0.5) * 0.5
    const lngVariation = (Math.random() - 0.5) * 0.5

    const title = `${shapeTitle} UFO Sighting in ${location.city}, ${location.state}`
    const description = generateDescription(shape, location)
    const eventDate = randomDate(1995, 2024)

    const tags = ['nuforc', shape]
    if (Math.random() < 0.3) tags.push('multiple-witnesses')
    if (Math.random() < 0.2) tags.push('military-area')
    if (Math.random() < 0.1) tags.push('photo-video')

    reports.push({
      title,
      slug: generateSlug(title, i + 1),
      summary: description.substring(0, Math.min(description.length, 200)) + (description.length > 200 ? '...' : ''),
      description,
      category: 'ufo_uap',
      phenomenon_type_id: phenomenonTypeId,
      location_name: `${location.city}, ${STATE_NAMES[location.state] || location.state}`,
      country: 'United States',
      state_province: STATE_NAMES[location.state] || location.state,
      city: location.city,
      latitude: location.lat + latVariation,
      longitude: location.lng + lngVariation,
      event_date: eventDate,
      event_time: randomTime(),
      event_duration_minutes: randomInt(1, 60),
      witness_count: Math.random() < 0.7 ? 1 : randomInt(2, 20),
      credibility: assessCredibility(),
      has_photo_video: Math.random() < 0.1,
      source_type: 'nuforc',
      original_report_id: `generated-${i + 1}`,
      status: 'approved',
      tags,
      upvotes: randomInt(0, 100),
      view_count: randomInt(10, 1000),
    })
  }

  console.log(`\nInserting ${reports.length} reports in batches...`)

  let inserted = 0
  let errors = 0
  const batchSize = 100

  for (let i = 0; i < reports.length; i += batchSize) {
    const batch = reports.slice(i, i + batchSize)

    try {
      const data = await supabaseQuery('reports', 'POST', {
        body: batch,
        prefer: 'return=representation,resolution=ignore-duplicates'
      })
      inserted += data?.length || 0
    } catch (err) {
      console.error(`\nBatch error at ${i}: ${err.message}`)
      errors += batch.length
    }

    process.stdout.write(`\rProgress: ${Math.min(i + batchSize, reports.length)}/${reports.length}`)
  }

  console.log('\n')
  console.log('='.repeat(60))
  console.log('Generation Complete!')
  console.log('='.repeat(60))
  console.log(`Reports created: ${inserted}`)
  console.log(`Errors: ${errors}`)

  // Show breakdown by shape
  const shapeCounts = reports.reduce((acc, r) => {
    const shape = r.tags[1]
    acc[shape] = (acc[shape] || 0) + 1
    return acc
  }, {})

  console.log('\nBreakdown by shape:')
  Object.entries(shapeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([shape, count]) => {
      console.log(`  ${shape}: ${count}`)
    })
}

generateData().catch(err => {
  console.error('Generation failed:', err)
  process.exit(1)
})
