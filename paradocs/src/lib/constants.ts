import { PhenomenonCategory, CredibilityLevel } from './database.types'

export const CATEGORY_CONFIG: Record<PhenomenonCategory, {
  label: string
  color: string
  bgColor: string
  icon: string
  description: string
}> = {
  ufo_uap: {
    label: 'UFO / UAP',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    icon: '🛸',
    description: 'Unidentified flying objects and aerial phenomena'
  },
  cryptid: {
    label: 'Cryptids',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    icon: '🦶',
    description: 'Unknown creatures and beings'
  },
  ghost_haunting: {
    label: 'Ghosts & Hauntings',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    icon: '👻',
    description: 'Spirits, apparitions, and haunted locations'
  },
  unexplained_event: {
    label: 'Unexplained Events',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    icon: '❓',
    description: 'Strange phenomena and mysterious occurrences'
  },
  psychic_paranormal: {
    label: 'Psychic / Paranormal',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    icon: '🔮',
    description: 'ESP, telepathy, and supernatural abilities'
  },
  mystery_location: {
    label: 'Mystery Locations',
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
    icon: '📍',
    description: 'Anomalous places and paranormal hotspots'
  },
  other: {
    label: 'Other',
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
    icon: '🌀',
    description: 'Other paranormal phenomena'
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
    label: 'Low',
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    description: 'Lacks supporting evidence'
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
    description: 'Some supporting details'
  },
  high: {
    label: 'High',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    description: 'Well-documented with evidence'
  },
  confirmed: {
    label: 'Confirmed',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    description: 'Multiple sources confirm'
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
