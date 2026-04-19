/**
 * PhenomenonIcon — renders the best available icon for a phenomenon type.
 *
 * Resolution order:
 *   1. SVG file from `/icons/phenomena/{slug}.svg` (full-color, commercial packs)
 *   2. Emoji fallback from the `icon` field in the database
 *   3. CategoryIcon SVG for the parent category
 *
 * The SVG files are full-color illustrations from the icon packs (Halloween/Vivid,
 * Esoteric Outline, Fortune Teller, etc.). They render as `<img>` tags so they
 * keep their original colors. For monochrome/currentColor behavior, use CategoryIcon.
 *
 * Usage:
 *   <PhenomenonIcon slug="bigfoot" fallbackEmoji="🦶" category="cryptids" size={32} />
 *   <PhenomenonIcon slug="ghost" size={48} />
 */

import React, { useState } from 'react'
import { PhenomenonCategory } from '@/lib/database.types'
import { CategoryIcon } from '@/components/ui/CategoryIcon'

/**
 * Master set of phenomenon slugs that have SVG files in /icons/phenomena/.
 * Used for O(1) lookup instead of runtime 404 checks.
 */
const AVAILABLE_SVGS = new Set([
  'alchemy',
  'angel',
  'astrology',
  'banshee',
  'bigfoot',
  'brainstorm',
  'centaur',
  'chimera',
  'crystal-ball',
  'cursed-object',
  'cyclops',
  'deja-vu',
  'demon',
  'demonic-possession',
  'djinn',
  'dna',
  'doppelganger',
  'dracula',
  'dragon',
  'dream',
  'dream-catcher',
  'extraterrestrial',
  'fairy',
  'gargoyle',
  'ghost',
  'goddesses',
  'gods',
  'golem',
  'grim-reaper',
  'gryphon',
  'hydra',
  'kraken',
  'lake-monster',
  'magic-circle',
  'medusa',
  'mermaid',
  'minotaur',
  'moon-phase',
  'necromancer',
  'obe',
  'ouija',
  'palmistry',
  'pegasus',
  'phoenix',
  'poltergeist',
  'psychic',
  'runes',
  'seer',
  'shaman',
  'shapeshifter',
  'substance-experience',
  'sun-moon',
  'talisman',
  'tarot',
  'telekinesis',
  'time-traveler',
  'vampire',
  'voodoo',
  'wandering-ghost',
  'werewolf',
  'witch',
  'wizard',
  'yeti',
  'zombie',
])

/**
 * Maps common DB phenomenon slugs to their SVG filename when they differ.
 * DB slugs use underscores and longer names; SVG filenames are kebab-case shorthand.
 */
const SLUG_TO_SVG: Record<string, string> = {
  // Cryptids
  'sasquatch': 'bigfoot',
  'bigfoot-sasquatch': 'bigfoot',
  'loch-ness-monster': 'lake-monster',
  'loch_ness_monster': 'lake-monster',
  'lake-monsters': 'lake-monster',
  'sea-serpent': 'kraken',
  'sea-monsters': 'kraken',
  'griffin': 'gryphon',
  'griffon': 'gryphon',
  'abominable-snowman': 'yeti',

  // Ghosts & Hauntings
  'ghosts': 'ghost',
  'apparitions': 'ghost',
  'apparition': 'ghost',
  'poltergeists': 'poltergeist',
  'haunting': 'ghost',
  'hauntings': 'ghost',
  'shadow-people': 'wandering-ghost',
  'shadow-person': 'wandering-ghost',
  'residual-haunting': 'wandering-ghost',
  'spirit': 'ghost',
  'spirits': 'ghost',
  'death': 'grim-reaper',
  'afterlife': 'grim-reaper',

  // UFOs & Aliens
  'ufo': 'extraterrestrial',
  'ufos': 'extraterrestrial',
  'alien-encounter': 'extraterrestrial',
  'alien-encounters': 'extraterrestrial',
  'alien-abduction': 'extraterrestrial',
  'alien-abductions': 'extraterrestrial',
  'close-encounter': 'extraterrestrial',
  'close-encounters': 'extraterrestrial',
  'nhi': 'extraterrestrial',
  'non-human-intelligence': 'extraterrestrial',
  'uap': 'extraterrestrial',
  'ufo-sighting': 'extraterrestrial',
  'ufo-sightings': 'extraterrestrial',
  'time-travel': 'time-traveler',
  'time-slip': 'time-traveler',
  'time-slips': 'time-traveler',

  // Psychic Phenomena
  'crystal-gazing': 'crystal-ball',
  'scrying': 'crystal-ball',
  'clairvoyance': 'crystal-ball',
  'precognition': 'crystal-ball',
  'psychic-reading': 'psychic',
  'psychic-readings': 'psychic',
  'psychic-ability': 'psychic',
  'psychic-abilities': 'psychic',
  'esp': 'psychic',
  'telepathy': 'psychic',
  'remote-viewing': 'psychic',
  'palm-reading': 'palmistry',
  'fortune-telling': 'crystal-ball',
  'divination': 'tarot',
  'tarot-reading': 'tarot',
  'tarot-readings': 'tarot',
  'telekinesis-psychokinesis': 'telekinesis',
  'psychokinesis': 'telekinesis',

  // Consciousness Practices
  'astral-projection': 'obe',
  'out-of-body-experience': 'obe',
  'out-of-body-experiences': 'obe',
  'out-of-body': 'obe',
  'lucid-dreaming': 'dream',
  'lucid-dreams': 'dream',
  'dreams': 'dream',
  'dreaming': 'dream',
  'dream-interpretation': 'dream',
  'dream-walking': 'dream',
  'meditation': 'obe',
  'shamanism': 'shaman',
  'shamanic-journey': 'shaman',
  'shamanic': 'shaman',

  // Psychological Experiences
  'near-death-experience': 'obe',
  'near-death-experiences': 'obe',
  'nde': 'obe',
  'deja-vu-experience': 'deja-vu',
  'deja_vu': 'deja-vu',
  'sleep-paralysis': 'demon',
  'shared-death-experience': 'obe',
  'dissociation': 'doppelganger',

  // Biological Factors
  'dna-anomalies': 'dna',
  'genetics': 'dna',
  'brain-anomalies': 'brainstorm',
  'neuroscience': 'brainstorm',
  'psychedelic-experiences': 'substance-experience',
  'psychedelics': 'substance-experience',
  'drug-experiences': 'substance-experience',
  'altered-states': 'substance-experience',
  'entheogens': 'substance-experience',

  // Perception & Sensory
  'auras': 'psychic',
  'synesthesia': 'psychic',
  'orbs': 'crystal-ball',

  // Religion & Mythology
  'angels': 'angel',
  'archangels': 'angel',
  'guardian-angel': 'angel',
  'demons': 'demon',
  'demonic': 'demon',
  'demonic-encounters': 'demon',
  'exorcism': 'demonic-possession',
  'possession': 'demonic-possession',
  'spirit-possession': 'demonic-possession',
  'vampires': 'vampire',
  'vampire-folklore': 'vampire',
  'werewolves': 'werewolf',
  'lycanthropy': 'werewolf',
  'werewolf-sightings': 'werewolf',
  'dragons': 'dragon',
  'mermaids': 'mermaid',
  'merfolk': 'mermaid',
  'selkies': 'mermaid',
  'fairies': 'fairy',
  'fae': 'fairy',
  'fairy-encounters': 'fairy',
  'changeling': 'fairy',
  'changelings': 'fairy',
  'zombies': 'zombie',
  'undead': 'zombie',
  'revenant': 'zombie',
  'phoenix-mythology': 'phoenix',
  'thunderbird': 'phoenix',
  'pegasus-mythology': 'pegasus',
  'winged-horse': 'pegasus',
  'minotaur-mythology': 'minotaur',
  'centaurs': 'centaur',
  'golem-mythology': 'golem',
  'gargoyles': 'gargoyle',
  'djinn-jinn': 'djinn',
  'jinn': 'djinn',
  'genie': 'djinn',
  'genies': 'djinn',
  'gods-deities': 'gods',
  'deities': 'gods',
  'goddess': 'goddesses',
  'medusa-mythology': 'medusa',
  'gorgon': 'medusa',

  // Esoteric Practices
  'witchcraft': 'witch',
  'wicca': 'witch',
  'sorcery': 'wizard',
  'wizardry': 'wizard',
  'magic': 'wizard',
  'magick': 'magic-circle',
  'ritual-magic': 'magic-circle',
  'ceremonial-magic': 'magic-circle',
  'necromancy': 'necromancer',
  'voodoo-hoodoo': 'voodoo',
  'hoodoo': 'voodoo',
  'vodou': 'voodoo',
  'ouija-board': 'ouija',
  'spirit-board': 'ouija',
  'seance': 'ouija',
  'rune-reading': 'runes',
  'rune-casting': 'runes',
  'talisman-amulet': 'talisman',
  'amulet': 'talisman',
  'amulets': 'talisman',
  'talismans': 'talisman',
  'protection-charm': 'talisman',
  'cursed-objects': 'cursed-object',
  'hex': 'cursed-object',
  'curse': 'cursed-object',
  'curses': 'cursed-object',
  'moon-phases': 'moon-phase',
  'lunar-cycle': 'moon-phase',
  'astrology-zodiac': 'astrology',
  'zodiac': 'astrology',
  'horoscope': 'astrology',
  'alchemy-transmutation': 'alchemy',
  'philosophers-stone': 'alchemy',
  'dream-catchers': 'dream-catcher',
  'shapeshifting': 'shapeshifter',
  'skinwalker': 'shapeshifter',
  'skinwalkers': 'shapeshifter',
  'therianthropy': 'shapeshifter',

  // Combination / cross-disciplinary
  'chimera-mythology': 'chimera',
  'hybrid-creature': 'chimera',
  'hybrid-creatures': 'chimera',
  'hydra-mythology': 'hydra',
  'multi-headed': 'hydra',
  'cyclops-mythology': 'cyclops',
  'seer-prophet': 'seer',
  'prophet': 'seer',
  'oracle': 'seer',
  'prophecy': 'seer',
  'prophecies': 'seer',
}

interface PhenomenonIconProps {
  /** Phenomenon slug from DB (e.g. "bigfoot", "ghost", "astral-projection") */
  slug?: string | null
  /** Emoji fallback from the DB icon field */
  fallbackEmoji?: string | null
  /** Parent category for final fallback */
  category?: PhenomenonCategory | string | null
  /** Icon size in pixels (square). Default: 24 */
  size?: number
  className?: string
  /** For accessibility */
  title?: string
}

/**
 * Resolves a phenomenon slug to its SVG filename.
 * Checks the direct set first, then the alias map.
 */
function resolveSvgSlug(slug: string): string | null {
  // Normalize: lowercase, replace underscores with hyphens
  const normalized = slug.toLowerCase().replace(/_/g, '-')

  // Direct match
  if (AVAILABLE_SVGS.has(normalized)) return normalized

  // Alias lookup
  if (SLUG_TO_SVG[normalized]) return SLUG_TO_SVG[normalized]

  // Try without trailing 's' (plural → singular)
  const singular = normalized.replace(/-?s$/, '')
  if (AVAILABLE_SVGS.has(singular)) return singular

  return null
}

export function PhenomenonIcon({
  slug,
  fallbackEmoji,
  category,
  size = 24,
  className = '',
  title,
}: PhenomenonIconProps) {
  const [imgError, setImgError] = useState(false)

  // Try to resolve to SVG
  const svgSlug = slug ? resolveSvgSlug(slug) : null

  if (svgSlug && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/icons/phenomena/${svgSlug}.svg`}
        alt={title || slug || ''}
        width={size}
        height={size}
        className={className}
        style={{ display: 'inline-block', verticalAlign: 'middle' }}
        onError={() => setImgError(true)}
        loading="lazy"
      />
    )
  }

  // Fallback: emoji from DB
  if (fallbackEmoji) {
    return (
      <span
        className={className}
        style={{ fontSize: size * 0.8, lineHeight: 1, display: 'inline-block', width: size, height: size, textAlign: 'center' }}
        role={title ? 'img' : undefined}
        aria-label={title}
        aria-hidden={!title}
      >
        {fallbackEmoji}
      </span>
    )
  }

  // Final fallback: CategoryIcon
  if (category) {
    return (
      <CategoryIcon
        category={category as PhenomenonCategory}
        size={size}
        className={className}
        title={title}
      />
    )
  }

  // Nothing available
  return null
}

export default PhenomenonIcon
