import { PhenomenonCategory, CredibilityLevel, ContentType } from './database.types'

export const CATEGORY_CONFIG: Record<PhenomenonCategory, {
  label: string
  color: string
  bgColor: string
  icon: string
  description: string
}> = {
  ufos_aliens: {
    label: 'UFOs & Aliens',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    icon: '🛸',
    description: 'Unidentified flying objects, alien encounters, and NHI phenomena'
  },
  cryptids: {
    label: 'Cryptids',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    icon: '🦶',
    description: 'Unknown creatures, mysterious beings, and cryptozoological sightings'
  },
  ghosts_hauntings: {
    label: 'Ghosts & Hauntings',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    icon: '👻',
    description: 'Spirits, apparitions, poltergeists, and haunted locations'
  },
  psychic_phenomena: {
    label: 'Psychic Phenomena',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    icon: '🔮',
    description: 'ESP, telepathy, precognition, and extrasensory perception'
  },
  consciousness_practices: {
    label: 'Consciousness Practices',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    icon: '🧘',
    description: 'Meditation, astral projection, lucid dreaming, and altered states'
  },
  psychological_experiences: {
    label: 'Psychological Experiences',
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    icon: '🧠',
    description: 'Near-death experiences, sleep paralysis, and anomalous psychology'
  },
  biological_factors: {
    label: 'Biological Factors',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    icon: '🧬',
    description: 'Physiological influences on paranormal experiences'
  },
  perception_sensory: {
    label: 'Perception & Sensory',
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
    icon: '👁️',
    description: 'Visual anomalies, auditory phenomena, and sensory mysteries'
  },
  religion_mythology: {
    label: 'Religion & Mythology',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    icon: '⚡',
    description: 'Religious visions, mythological encounters, and spiritual phenomena'
  },
  esoteric_practices: {
    label: 'Esoteric Practices',
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
    icon: '✨',
    description: 'Occult traditions, ritual magic, and esoteric knowledge'
  },
  combination: {
    label: 'Multi-Disciplinary',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
    icon: '🔄',
    description: 'Phenomena spanning multiple categories'
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
