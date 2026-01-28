/**
 * Predefined Avatar System
 *
 * Paranormal-themed avatar options for user profiles.
 * Users can choose from these or upload their own.
 */

export interface PredefinedAvatar {
  id: string
  name: string
  emoji: string
  category: 'aliens' | 'cryptids' | 'ghosts' | 'phenomena' | 'investigators'
}

export const PREDEFINED_AVATARS: PredefinedAvatar[] = [
  // Aliens & UFOs
  { id: 'alien-classic', name: 'Classic Grey', emoji: '👽', category: 'aliens' },
  { id: 'alien-green', name: 'Little Green', emoji: '🛸', category: 'aliens' },
  { id: 'alien-robot', name: 'Space Robot', emoji: '🤖', category: 'aliens' },
  { id: 'alien-star', name: 'Star Traveler', emoji: '⭐', category: 'aliens' },
  { id: 'alien-saturn', name: 'Saturn Dweller', emoji: '🪐', category: 'aliens' },
  { id: 'alien-rocket', name: 'Rocket Rider', emoji: '🚀', category: 'aliens' },

  // Cryptids
  { id: 'cryptid-bigfoot', name: 'Sasquatch', emoji: '🦶', category: 'cryptids' },
  { id: 'cryptid-nessie', name: 'Loch Ness', emoji: '🦕', category: 'cryptids' },
  { id: 'cryptid-moth', name: 'Mothman', emoji: '🦋', category: 'cryptids' },
  { id: 'cryptid-wolf', name: 'Werewolf', emoji: '🐺', category: 'cryptids' },
  { id: 'cryptid-bat', name: 'Chupacabra', emoji: '🦇', category: 'cryptids' },
  { id: 'cryptid-serpent', name: 'Sea Serpent', emoji: '🐉', category: 'cryptids' },

  // Ghosts & Spirits
  { id: 'ghost-classic', name: 'Classic Ghost', emoji: '👻', category: 'ghosts' },
  { id: 'ghost-skull', name: 'Spirit Skull', emoji: '💀', category: 'ghosts' },
  { id: 'ghost-pumpkin', name: 'Jack O\'Lantern', emoji: '🎃', category: 'ghosts' },
  { id: 'ghost-candle', name: 'Will-o-Wisp', emoji: '🕯️', category: 'ghosts' },
  { id: 'ghost-crystal', name: 'Crystal Spirit', emoji: '🔮', category: 'ghosts' },
  { id: 'ghost-moon', name: 'Moon Specter', emoji: '🌙', category: 'ghosts' },

  // Phenomena
  { id: 'phenom-eye', name: 'All-Seeing Eye', emoji: '👁️', category: 'phenomena' },
  { id: 'phenom-portal', name: 'Portal Keeper', emoji: '🌀', category: 'phenomena' },
  { id: 'phenom-lightning', name: 'Ball Lightning', emoji: '⚡', category: 'phenomena' },
  { id: 'phenom-comet', name: 'Comet Chaser', emoji: '☄️', category: 'phenomena' },
  { id: 'phenom-galaxy', name: 'Galaxy Mind', emoji: '🌌', category: 'phenomena' },
  { id: 'phenom-aurora', name: 'Aurora Watcher', emoji: '✨', category: 'phenomena' },

  // Investigators
  { id: 'invest-detective', name: 'Truth Seeker', emoji: '🔍', category: 'investigators' },
  { id: 'invest-scientist', name: 'Paranormal Scientist', emoji: '🔬', category: 'investigators' },
  { id: 'invest-camera', name: 'Evidence Hunter', emoji: '📸', category: 'investigators' },
  { id: 'invest-book', name: 'Lore Keeper', emoji: '📚', category: 'investigators' },
  { id: 'invest-compass', name: 'Field Researcher', emoji: '🧭', category: 'investigators' },
  { id: 'invest-flashlight', name: 'Night Explorer', emoji: '🔦', category: 'investigators' },
]

export const AVATAR_CATEGORIES = [
  { id: 'aliens', name: 'Aliens & UFOs', icon: '👽' },
  { id: 'cryptids', name: 'Cryptids', icon: '🦶' },
  { id: 'ghosts', name: 'Ghosts & Spirits', icon: '👻' },
  { id: 'phenomena', name: 'Phenomena', icon: '🌀' },
  { id: 'investigators', name: 'Investigators', icon: '🔍' },
] as const

export type AvatarCategory = typeof AVATAR_CATEGORIES[number]['id']

/**
 * Get avatar by ID
 */
export function getAvatarById(id: string): PredefinedAvatar | undefined {
  return PREDEFINED_AVATARS.find(a => a.id === id)
}

/**
 * Get avatars by category
 */
export function getAvatarsByCategory(category: AvatarCategory): PredefinedAvatar[] {
  return PREDEFINED_AVATARS.filter(a => a.category === category)
}

/**
 * Check if an avatar URL is a predefined avatar
 */
export function isPredefinedAvatar(url: string | null): boolean {
  if (!url) return false
  return url.startsWith('emoji:')
}

/**
 * Get emoji from avatar URL (for predefined avatars)
 */
export function getAvatarEmoji(url: string | null): string | null {
  if (!url || !isPredefinedAvatar(url)) return null
  const id = url.replace('emoji:', '')
  const avatar = getAvatarById(id)
  return avatar?.emoji || null
}

/**
 * Create avatar URL from predefined avatar ID
 */
export function createAvatarUrl(avatarId: string): string {
  return `emoji:${avatarId}`
}

/**
 * Get display info for any avatar (predefined or custom)
 */
export function getAvatarDisplay(avatarUrl: string | null, fallbackLetter: string): {
  type: 'emoji' | 'image' | 'letter'
  value: string
} {
  if (!avatarUrl) {
    return { type: 'letter', value: fallbackLetter.toUpperCase() }
  }

  if (isPredefinedAvatar(avatarUrl)) {
    const emoji = getAvatarEmoji(avatarUrl)
    if (emoji) {
      return { type: 'emoji', value: emoji }
    }
    return { type: 'letter', value: fallbackLetter.toUpperCase() }
  }

  // Custom uploaded image
  return { type: 'image', value: avatarUrl }
}
