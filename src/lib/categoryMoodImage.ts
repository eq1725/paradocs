/**
 * Category Mood Thumbnail Selector
 *
 * Deterministically picks a mood image for a given report based on its
 * category and report ID. Uses a simple hash so the same report always
 * gets the same image, but different reports in the same category get
 * visual variety.
 *
 * Images live in /public/images/category-moods/{category_key}/{n}.jpg
 *
 * SWC compliant: var, function(){}, no template literals.
 */

/**
 * Number of available mood images per category.
 * Update these counts when adding/removing images from the public folder.
 */
var IMAGE_COUNTS: Record<string, number> = {
  ufos_aliens: 4,
  cryptids: 6,
  ghosts_hauntings: 6,
  psychic_phenomena: 4,
  consciousness_practices: 4,
  psychological_experiences: 5,
  perception_sensory: 6,
  religion_mythology: 5,
  esoteric_practices: 5,
  high_strangeness: 3,
  earth_mysteries: 5,
  time_anomalies: 3,
  other: 2,
  folklore_mythology: 5,
  conspiracies: 3,
  technology_ai: 3
}

/**
 * Map category keys that don't have their own image folder to a fallback.
 */
var CATEGORY_FOLDER_MAP: Record<string, string> = {
  folklore_mythology: 'religion_mythology',
  conspiracies: 'high_strangeness',
  technology_ai: 'high_strangeness'
}

/**
 * Simple string hash that produces a positive integer.
 * Deterministic: same input always returns same output.
 */
function simpleHash(str: string): number {
  var hash = 0
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

/**
 * Get the category mood thumbnail URL for a given report.
 *
 * @param category - The report's category key (e.g. "cryptids")
 * @param reportId - The report's unique ID (used for deterministic selection)
 * @returns URL path to the image (relative to public root), or null if no images available
 */
export function getCategoryMoodImage(category: string, reportId: string): string | null {
  var folder = CATEGORY_FOLDER_MAP[category] || category
  var count = IMAGE_COUNTS[folder]
  if (!count || count < 1) return null

  var index = (simpleHash(reportId) % count) + 1
  return '/images/category-moods/' + folder + '/' + index + '.jpg'
}

/**
 * Get the full absolute URL for OG meta tags.
 *
 * @param category - The report's category key
 * @param reportId - The report's unique ID
 * @param siteUrl - The base site URL (e.g. "https://paradocs.world")
 * @returns Full absolute URL to the image, or null
 */
export function getCategoryMoodImageAbsolute(
  category: string,
  reportId: string,
  siteUrl: string
): string | null {
  var path = getCategoryMoodImage(category, reportId)
  if (!path) return null
  return siteUrl + path
}
