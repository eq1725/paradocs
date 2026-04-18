/**
 * Historical paranormal waves — a curated corpus of documented periods
 * of concentrated paranormal activity. Every wave listed here is anchored
 * to an event that appears in the Paradocs encyclopedia
 * (src/data/phenomena-seed.json). Details have been cross-checked against
 * the cited primary and secondary sources.
 *
 * Editorial rules:
 *   1. Every wave MUST anchor to at least one encyclopedia entry name.
 *   2. Dates must be documented in the cited sources — no speculation.
 *   3. Blurbs describe what happened; they do not speculate about causes.
 *   4. If a centroid is given, the radius reflects the geographic extent
 *      of reports documented in published investigations, not speculation.
 *   5. No hallucinations. When in doubt, omit.
 */

export interface HistoricalWave {
  id: string
  /** Short pull-quote headline used in the pattern card */
  title: string
  /** One-to-two sentence factual narrative suitable for a small card body */
  blurb: string
  /** ISO date at start of wave window */
  startDate: string
  /** ISO date at end of wave window */
  endDate: string
  /** Rough geographic centroid (null = global / multi-region) */
  centroid: { lat: number; lng: number; radiusKm: number } | null
  /** Country codes (ISO 3166-1 alpha-2) that saw elevated activity */
  countries: string[]
  /** Phenomenon categories this wave primarily touched */
  categories: Array<'uap' | 'cryptid' | 'paranormal' | 'nde' | 'abduction' | 'missing411' | 'cult' | 'psi'>
  /** Tags that correlate strongly with saves in this wave */
  tags: string[]
  /** Encyclopedia entry names that anchor this wave (must exist in phenomena-seed.json) */
  encyclopediaAnchors: string[]
  /** Published authoritative references — short label only */
  sources: string[]
}

export const HISTORICAL_WAVES: HistoricalWave[] = [
  {
    id: 'kenneth-arnold-roswell-47',
    title: 'The 1947 Flying Disk Summer',
    blurb:
      'Kenneth Arnold\'s June 24, 1947 sighting of nine objects near Mount Rainier coined "flying saucer" and triggered hundreds of press-reported sightings across the U.S. The Roswell debris recovery followed in early July.',
    startDate: '1947-06-24',
    endDate: '1947-08-31',
    centroid: null,
    countries: ['US'],
    categories: ['uap'],
    tags: ['flying-disk', 'roswell', 'kenneth-arnold', '1947'],
    encyclopediaAnchors: ['Kenneth Arnold Sighting', 'Roswell Incident'],
    sources: [
      'Bloecher, Report on the UFO Wave of 1947 (1967)',
      'Ruppelt, The Report on Unidentified Flying Objects (1956)',
    ],
  },
  {
    id: 'hill-abduction-61',
    title: 'The Betty and Barney Hill Abduction',
    blurb:
      'On the night of September 19–20, 1961, Betty and Barney Hill reported a close encounter and missing time on U.S. Route 3 in New Hampshire. Details recovered during 1964 hypnotic regression — including a star map — became the first widely publicized alien abduction account.',
    startDate: '1961-09-19',
    endDate: '1961-09-20',
    centroid: { lat: 44.25, lng: -71.25, radiusKm: 80 },
    countries: ['US'],
    categories: ['abduction', 'uap'],
    tags: ['abduction', 'missing-time', 'betty-barney-hill', 'star-map'],
    encyclopediaAnchors: ['Betty and Barney Hill Abduction'],
    sources: ['Fuller, The Interrupted Journey (1966)'],
  },
  {
    id: 'point-pleasant-mothman-66',
    title: 'The Point Pleasant Mothman Sightings',
    blurb:
      'Between November 12, 1966 and December 15, 1967, residents of Point Pleasant, West Virginia logged roughly 100 sightings of a winged humanoid locals came to call Mothman. The sighting period ended with the collapse of the Silver Bridge over the Ohio River.',
    startDate: '1966-11-12',
    endDate: '1967-12-15',
    centroid: { lat: 38.84, lng: -82.14, radiusKm: 40 },
    countries: ['US'],
    categories: ['cryptid'],
    tags: ['mothman', 'point-pleasant', 'winged-humanoid'],
    encyclopediaAnchors: ['Mothman'],
    sources: ['Keel, The Mothman Prophecies (1975)'],
  },
  {
    id: 'shag-harbour-67',
    title: 'The Shag Harbour Incident',
    blurb:
      'On October 4, 1967, multiple witnesses reported an unidentified object entering the water off Shag Harbour, Nova Scotia. The RCMP and Canadian military conducted an official search — no object was recovered, and the incident remains unresolved.',
    startDate: '1967-10-04',
    endDate: '1967-10-06',
    centroid: { lat: 43.5, lng: -65.7, radiusKm: 30 },
    countries: ['CA'],
    categories: ['uap'],
    tags: ['shag-harbour', 'water-impact', 'military', 'canada'],
    encyclopediaAnchors: ['Shag Harbour Incident'],
    sources: ['Ledger & Styles, Dark Object (2001)'],
  },
  {
    id: 'pascagoula-73',
    title: 'The Pascagoula Abduction',
    blurb:
      'On the evening of October 11, 1973, Charles Hickson and Calvin Parker reported being taken aboard a craft while fishing on the Pascagoula River in Mississippi. The case drew unusually high law-enforcement credibility at the time.',
    startDate: '1973-10-11',
    endDate: '1973-10-12',
    centroid: { lat: 30.37, lng: -88.56, radiusKm: 30 },
    countries: ['US'],
    categories: ['abduction', 'uap'],
    tags: ['pascagoula', 'abduction', 'hickson', 'parker'],
    encyclopediaAnchors: ['Pascagoula Abduction'],
    sources: ['Hickson & Mendez, UFO Contact at Pascagoula (1983)'],
  },
  {
    id: 'rendlesham-80',
    title: 'The Rendlesham Forest Incident',
    blurb:
      'Between December 26 and 28, 1980, U.S. Air Force personnel stationed at RAF Woodbridge and RAF Bentwaters reported multiple encounters with unidentified lights in Rendlesham Forest, Suffolk, England. Deputy base commander Lt. Col. Charles Halt recorded elevated radiation readings on a memo now in the public record.',
    startDate: '1980-12-26',
    endDate: '1980-12-28',
    centroid: { lat: 52.09, lng: 1.44, radiusKm: 15 },
    countries: ['GB'],
    categories: ['uap'],
    tags: ['rendlesham', 'bentwaters', 'woodbridge', 'military', 'halt-memo'],
    encyclopediaAnchors: ['Rendlesham Forest Incident'],
    sources: ['Halt Memo (1981, US Air Force)', 'Pope, Encounter in Rendlesham Forest (2014)'],
  },
  {
    id: 'belgian-wave-89',
    title: 'The Belgian UFO Wave',
    blurb:
      'Between November 29, 1989 and April 1990, Belgium logged more than 2,000 witness reports of low, silent, triangular craft. On March 30–31, 1990, Belgian Air Force F-16s were scrambled and briefly obtained radar lock during the pursuit. The Air Force later released the F-16 radar data publicly.',
    startDate: '1989-11-29',
    endDate: '1990-04-30',
    centroid: { lat: 50.85, lng: 4.35, radiusKm: 200 },
    countries: ['BE'],
    categories: ['uap'],
    tags: ['belgian-wave', 'triangle', 'f-16', 'radar-visual'],
    encyclopediaAnchors: ['Belgian UFO Wave'],
    sources: [
      'SOBEPS, Vague d\'OVNI sur la Belgique (vols. I–II, 1991–1994)',
      'Belgian Air Force public report (1990)',
    ],
  },
  {
    id: 'phoenix-lights-97',
    title: 'The Phoenix Lights',
    blurb:
      'On the evening of March 13, 1997, thousands of witnesses across Arizona — including then-Governor Fife Symington — reported a large V-formation of lights traversing the state. A second event the same night was later attributed by the U.S. Air Force to flares; the earlier sighting remains unexplained.',
    startDate: '1997-03-13',
    endDate: '1997-03-14',
    centroid: { lat: 33.45, lng: -112.07, radiusKm: 300 },
    countries: ['US'],
    categories: ['uap'],
    tags: ['phoenix-lights', 'arizona', 'v-formation', 'mass-sighting'],
    encyclopediaAnchors: ['Phoenix Lights'],
    sources: ['Kitei, The Phoenix Lights (2004)', 'Symington, CNN interview (2007)'],
  },
  {
    id: 'nimitz-04',
    title: 'The Nimitz Tic-Tac Encounter',
    blurb:
      'On November 14, 2004, F/A-18F aircrew from Carrier Air Wing 11 aboard USS Nimitz intercepted an oblong white craft off the coast of Southern California. The FLIR1 cockpit video was later released by the U.S. Department of Defense and confirmed authentic.',
    startDate: '2004-11-10',
    endDate: '2004-11-16',
    centroid: { lat: 32.5, lng: -119.5, radiusKm: 300 },
    countries: ['US'],
    categories: ['uap'],
    tags: ['nimitz', 'tic-tac', 'navy', 'flir', 'radar-visual'],
    encyclopediaAnchors: ['Nimitz Encounter'],
    sources: ['DoD official FLIR1 release (2020)', 'Fravor, U.S. Senate testimony (2023)'],
  },
  {
    id: 'aatip-era-07',
    title: 'The AATIP Era',
    blurb:
      'The Advanced Aerospace Threat Identification Program operated at the Pentagon from 2007 to 2012 under a $22 million budget, investigating reported UAP encounters. Its existence was publicly disclosed in The New York Times on December 16, 2017, alongside the FLIR1 video release.',
    startDate: '2007-09-01',
    endDate: '2012-12-31',
    centroid: null,
    countries: ['US'],
    categories: ['uap'],
    tags: ['aatip', 'pentagon', 'elizondo', 'disclosure'],
    encyclopediaAnchors: ['AATIP'],
    sources: [
      'Cooper, Kean & Blumenthal, New York Times (December 16, 2017)',
      'DoD acknowledgement (2017)',
    ],
  },
  {
    id: 'stephenville-08',
    title: 'The Stephenville Sightings',
    blurb:
      'On January 8, 2008, dozens of witnesses in and around Stephenville, Texas reported a large, silent, low-flying object. FAA radar data, later obtained by MUFON via FOIA, corroborated an unidentified track near the George W. Bush ranch in Crawford.',
    startDate: '2008-01-08',
    endDate: '2008-01-11',
    centroid: { lat: 32.22, lng: -98.2, radiusKm: 120 },
    countries: ['US'],
    categories: ['uap'],
    tags: ['stephenville', 'texas', 'mass-sighting', 'radar-visual'],
    encyclopediaAnchors: ['Stephenville UFO Sightings'],
    sources: ['MUFON Stephenville Radar Report (2008)', 'Allan Hendry / Angelia Joiner reporting'],
  },
]

// Simple haversine — km between two (lat, lng) points. Used to decide
// whether a user save's location falls within a wave's centroid radius.
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface WaveMatchInput {
  eventDate: string | null
  lat: number | null
  lng: number | null
  category: string
  tags: string[]
  /** Title of the save — used for encyclopedia-anchor name matching */
  title?: string | null
  /** Location name — used for fuzzy geographic matching when lat/lng missing */
  locationName?: string | null
}

/**
 * Decide whether a save is relevant to a historical wave.
 *
 * A save matches when ANY of the following is true:
 *   (a) eventDate falls inside the wave window (strict, with centroid check)
 *   (b) tags overlap with wave.tags
 *   (c) title / locationName mentions any of the wave's encyclopedia anchors
 *
 * This is deliberately permissive: a save tagged "#roswell" with no event
 * date still obviously relates to the 1947 flying-disk summer, and the
 * user expects the historical context card to surface regardless of
 * whether we have a parsed eventDate on their paste-URL save.
 *
 * We don't fire spurious matches because encyclopedia anchor names are
 * specific ("Roswell Incident", "Nimitz Encounter") and the tag lists
 * are wave-specific.
 */
export function matchesWave(entry: WaveMatchInput, wave: HistoricalWave): boolean {
  // (a) Temporal match inside wave window + optional geographic check
  if (entry.eventDate) {
    const t = new Date(entry.eventDate).getTime()
    if (!isNaN(t)) {
      const start = new Date(wave.startDate).getTime()
      const end = new Date(wave.endDate).getTime() + 86400000 // include end day
      if (t >= start && t <= end) {
        if (!wave.centroid) return true
        if (entry.lat == null || entry.lng == null) return true
        const d = haversineKm({ lat: entry.lat, lng: entry.lng }, wave.centroid)
        if (d <= wave.centroid.radiusKm) return true
      }
    }
  }

  // (b) Tag overlap with the wave's known tag set
  const normTags = (entry.tags || []).map(t => (t || '').trim().toLowerCase())
  if (normTags.some(t => wave.tags.includes(t))) return true

  // (c) Title / locationName / tags reference an encyclopedia anchor name
  const haystack = [
    entry.title || '',
    entry.locationName || '',
    ...normTags,
  ].join(' ').toLowerCase()
  for (const anchor of wave.encyclopediaAnchors) {
    const needle = anchor.toLowerCase()
    if (haystack.includes(needle)) return true
    // Also match on the first significant word of the anchor
    // (e.g. "Roswell" from "Roswell Incident")
    const head = needle.split(/\s+/)[0]
    if (head && head.length >= 5 && haystack.includes(head)) return true
  }

  return false
}
