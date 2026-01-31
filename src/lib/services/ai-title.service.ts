/**
 * AI Title Generation Service
 *
 * Uses Claude to generate unique, descriptive title elements from report descriptions.
 * Extracts setting, key elements, and distinctive features to ensure title uniqueness.
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const MODEL = 'claude-sonnet-4-5-20250929'

export interface TitleElements {
  setting: string | null       // e.g., "Old Farmhouse", "Highway", "Bedroom"
  keyElement: string | null    // e.g., "Footsteps", "Cold Spot", "Strange Light"
  timeContext: string | null   // e.g., "Late Night", "Childhood", "Dawn"
  uniqueDetail: string | null  // Any other distinctive detail
}

/**
 * System prompt for title element extraction
 */
const SYSTEM_PROMPT = `You are a title extraction assistant. Your job is to identify the most distinctive and unique elements from paranormal experience descriptions to create unique titles.

Extract these elements:
1. SETTING: The location type where the experience occurred (e.g., "Old Farmhouse", "Bedroom", "Highway 66", "Grandma's House", "Abandoned Hospital", "Camping Trip")
2. KEY_ELEMENT: The most distinctive phenomenon or detail (e.g., "Footsteps", "Cold Spot", "Glowing Eyes", "Strange Voice", "Moving Shadows")
3. TIME_CONTEXT: When it happened if notable (e.g., "Childhood", "3 AM", "Late Night", "During Storm")
4. UNIQUE_DETAIL: Any other highly distinctive detail that makes this report unique

Guidelines:
- Be specific but concise (2-4 words max per element)
- Prioritize unique, memorable details over generic ones
- If a detail is too common (like "at night"), skip it
- Focus on what makes THIS experience different from others
- Return null for any element that isn't distinctive enough

Format your response EXACTLY like this (no other text):
SETTING: [value or null]
KEY_ELEMENT: [value or null]
TIME_CONTEXT: [value or null]
UNIQUE_DETAIL: [value or null]`

/**
 * Extract distinctive title elements from a description using AI
 */
export async function extractTitleElements(description: string): Promise<TitleElements> {
  // Truncate very long descriptions to save tokens
  const truncatedDesc = description.length > 1500
    ? description.substring(0, 1500) + '...'
    : description

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract distinctive title elements from this paranormal report:\n\n${truncatedDesc}`
        }
      ]
    })

    // Extract text response
    const textBlock = message.content.find(block => block.type === 'text')
    const responseText = textBlock?.type === 'text' ? textBlock.text : ''

    return parseElementsResponse(responseText)
  } catch (error) {
    console.error('Error extracting title elements:', error)
    // Return fallback with null values
    return {
      setting: null,
      keyElement: null,
      timeContext: null,
      uniqueDetail: null
    }
  }
}

/**
 * Parse the AI response into structured elements
 */
function parseElementsResponse(response: string): TitleElements {
  const elements: TitleElements = {
    setting: null,
    keyElement: null,
    timeContext: null,
    uniqueDetail: null
  }

  // Parse each line
  const settingMatch = response.match(/SETTING:\s*(.+)/i)
  const keyElementMatch = response.match(/KEY_ELEMENT:\s*(.+)/i)
  const timeContextMatch = response.match(/TIME_CONTEXT:\s*(.+)/i)
  const uniqueDetailMatch = response.match(/UNIQUE_DETAIL:\s*(.+)/i)

  // Extract values, treating "null" string as actual null
  if (settingMatch) {
    const val = settingMatch[1].trim()
    elements.setting = val.toLowerCase() === 'null' ? null : val
  }
  if (keyElementMatch) {
    const val = keyElementMatch[1].trim()
    elements.keyElement = val.toLowerCase() === 'null' ? null : val
  }
  if (timeContextMatch) {
    const val = timeContextMatch[1].trim()
    elements.timeContext = val.toLowerCase() === 'null' ? null : val
  }
  if (uniqueDetailMatch) {
    const val = uniqueDetailMatch[1].trim()
    elements.uniqueDetail = val.toLowerCase() === 'null' ? null : val
  }

  return elements
}

/**
 * Generate a unique title suffix from AI-extracted elements
 * Returns something like "Old Farmhouse, Footsteps" or "3 AM, Strange Voice"
 */
export function buildTitleSuffix(elements: TitleElements): string | null {
  const parts: string[] = []

  // Priority: setting > keyElement > uniqueDetail > timeContext
  if (elements.setting) {
    parts.push(elements.setting)
  }
  if (elements.keyElement && parts.length < 2) {
    parts.push(elements.keyElement)
  }
  if (elements.uniqueDetail && parts.length < 2) {
    parts.push(elements.uniqueDetail)
  }
  if (elements.timeContext && parts.length < 2) {
    parts.push(elements.timeContext)
  }

  if (parts.length === 0) {
    return null
  }

  // Join with comma for readability
  return parts.join(', ')
}

/**
 * Generate a complete unique title using AI extraction
 * Combines the phenomenon type with AI-extracted distinctive elements
 */
export async function generateAITitle(
  phenomenonType: string,  // e.g., "Paranormal Experience", "UFO Sighting"
  description: string,
  locationName?: string | null,
  eventDate?: Date | string | null
): Promise<string> {
  // First try to extract AI elements
  const elements = await extractTitleElements(description)
  const aiSuffix = buildTitleSuffix(elements)

  // Build the title
  let title = phenomenonType

  if (aiSuffix) {
    // Use AI-extracted elements
    title = `${phenomenonType} - ${aiSuffix}`
  } else if (locationName && locationName.length < 25) {
    // Fallback to location
    const cleanLocation = locationName.replace(/,?\s*(USA|US|United States)$/i, '').trim()
    if (cleanLocation) {
      title = `${phenomenonType} - ${cleanLocation}`
    }
  } else if (eventDate) {
    // Last resort: use date
    const dateStr = formatDateForTitle(eventDate)
    if (dateStr) {
      title = `${phenomenonType} - ${dateStr}`
    }
  }

  return title
}

/**
 * Format a date for title use
 */
function formatDateForTitle(date: Date | string | null | undefined): string | null {
  if (!date) return null

  try {
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return null

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  } catch {
    return null
  }
}

/**
 * Batch process multiple reports for efficiency
 * Groups API calls and processes in parallel
 */
export async function batchExtractTitleElements(
  reports: Array<{ id: string; description: string }>
): Promise<Map<string, TitleElements>> {
  const results = new Map<string, TitleElements>()

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5
  for (let i = 0; i < reports.length; i += batchSize) {
    const batch = reports.slice(i, i + batchSize)

    const promises = batch.map(async (report) => {
      const elements = await extractTitleElements(report.description)
      return { id: report.id, elements }
    })

    const batchResults = await Promise.all(promises)

    for (const { id, elements } of batchResults) {
      results.set(id, elements)
    }

    // Small delay between batches to avoid rate limits
    if (i + batchSize < reports.length) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  return results
}
