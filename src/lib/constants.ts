import { PhenomenonCategory, CredibilityLevel, ContentType } from './database.types'

/**
 * Category configuration. The `icon` field is an emoji fallback for text-only
 * contexts (emails, data-seed). For UI rendering, use `<CategoryIcon>` from
 * `@/components/ui/CategoryIcon` which renders the proper SVG icon.
 */
export const CATEGORY_CONFIG: Record<PhenomenonCategory, {
  label: string
  color: string
  bgColor: string
  icon: string
  description: string
}> = {
  ufos_aliens: {
    label: 'UFOs & Aliens',
    color: 'text-green-400',
    bgColor: 'bg-green-400/15',
    icon: '🛸',
    description: 'UAP sightings, close encounters, abductions, and unidentified submerged objects.'
  },
  cryptids: {
    label: 'Cryptids',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/15',
    icon: '🦶',
    description: 'Encounters with creatures that don\'t fit any known species.'
  },
  ghosts_hauntings: {
    label: 'Ghosts & Hauntings',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/15',
    icon: '👻',
    description: 'Apparitions, poltergeist activity, EVP recordings, and haunted locations.'
  },
  psychic_phenomena: {
    label: 'Psychic Phenomena',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/15',
    icon: '🔮',
    description: 'Telepathy, precognition, channeling, synchronicity, and after-death communication.'
  },
  consciousness_practices: {
    label: 'Consciousness Practices',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-400/15',
    icon: '🧘',
    description: 'Astral projection, lucid dreaming, kundalini awakening, and meditation visions.'
  },
  psychological_experiences: {
    label: 'Psychological Experiences',
    color: 'text-pink-400',
    bgColor: 'bg-pink-400/15',
    icon: '🧠',
    description: 'Near-death experiences, shared death experiences, deathbed visions, and OBEs.'
  },
  biological_factors: {
    label: 'Biological Factors',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400/15',
    icon: '🧬',
    description: 'Unexplained healings, radiation marks, implants, and physical effects tied to encounters.'
  },
  perception_sensory: {
    label: 'Perception & Sensory',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-400/15',
    icon: '👁️',
    description: 'Shadow figures, phantom sounds, and sensory experiences without clear origin.'
  },
  religion_mythology: {
    label: 'Religion & Mythology',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/15',
    icon: '⚡',
    description: 'Visions, miracles, and encounters documented through spiritual traditions.'
  },
  esoteric_practices: {
    label: 'Esoteric Practices',
    color: 'text-violet-400',
    bgColor: 'bg-violet-400/15',
    icon: '✨',
    description: 'Occult traditions, ritual practices, and reported experiences beyond material explanation.'
  },
  combination: {
    label: 'Multi-Disciplinary',
    color: 'text-gray-400',
    bgColor: 'bg-gray-400/15',
    icon: '🔄',
    description: 'Cases that span multiple categories and resist simple classification.'
  }
}

export const CREDIBILITY_CONFIG: Record<CredibilityLevel, {
  label: string
  color: string
  bgColor: string
  description: string
}> = {
  unverified: {
    label: 'Unverified',
    color: 'text-gray-400',
    bgColor: 'bg-gray-400/10',
    description: 'Not yet reviewed'
  },
  low: {
    label: 'Low Credibility',
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    description: 'Limited verifiable details or corroborating evidence'
  },
  medium: {
    label: 'Medium Credibility',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
    description: 'Contains specific details but lacks independent corroboration'
  },
  high: {
    label: 'High Credibility',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    description: 'Well-documented with multiple verifiable details'
  },
  confirmed: {
    label: 'Confirmed',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    description: 'Multiple sources confirm'
  }
}

// Content type configuration - distinguishes actual experiencer reports from other content
export const CONTENT_TYPE_CONFIG: Record<ContentType, {
  label: string
  shortLabel: string
  color: string
  bgColor: string
  borderColor: string
  icon: string
  description: string
  isPrimary: boolean  // Is this the primary content type we want (experiencer reports)?
}> = {
  experiencer_report: {
    label: 'Experiencer Report',
    shortLabel: 'Experiencer',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500/30',
    icon: '👁️',
    description: 'First-hand witness account of a paranormal encounter',
    isPrimary: true
  },
  historical_case: {
    label: 'Historical Case',
    shortLabel: 'Historical',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/30',
    icon: '📜',
    description: 'Documented historical case from archives or research',
    isPrimary: true
  },
  news_discussion: {
    label: 'News & Discussion',
    shortLabel: 'Discussion',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
    borderColor: 'border-gray-500/30',
    icon: '📰',
    description: 'News articles, community discussions, or commentary',
    isPrimary: false
  },
  research_analysis: {
    label: 'Research & Analysis',
    shortLabel: 'Research',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/30',
    icon: '🔬',
    description: 'Academic research, analysis, or investigative reports',
    isPrimary: true
  }
}

export const COUNTRIES = [
  'United States', 'Canada', 'United Kingdom', 'Australia',
  'Germany', 'France', 'Brazil', 'Mexico', 'Japan', 'China',
  'India', 'Russia', 'Italy', 'Spain', 'Netherlands',
  'Sweden', 'Norway', 'Argentina', 'Chile', 'New Zealand',
  'South Africa', 'Other'
]

export const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
  'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
  'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
  'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
]

export const CA_PROVINCES = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
  'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia',
  'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'
]

export const UK_REGIONS = [
  'England', 'Scotland', 'Wales', 'Northern Ireland'
]

export const AU_STATES = [
  'Australian Capital Territory', 'New South Wales', 'Northern Territory',
  'Queensland', 'South Australia', 'Tasmania', 'Victoria', 'Western Australia'
]

// Get region list based on country
export function getRegionsForCountry(country: string): { list: string[], label: string } {
  switch (country) {
    case 'United States': return { list: US_STATES, label: 'State' }
    case 'Canada': return { list: CA_PROVINCES, label: 'Province' }
    case 'United Kingdom': return { list: UK_REGIONS, label: 'Region' }
    case 'Australia': return { list: AU_STATES, label: 'State/Territory' }
    default: return { list: [], label: 'State/Province/Region' }
  }
}
