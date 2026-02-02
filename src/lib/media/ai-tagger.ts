// AI-based media tagging service
// Analyzes images and generates descriptive tags for searchability

import Anthropic from '@anthropic-ai/sdk';

export interface MediaTagResult {
  tags: string[];
  description: string;
  confidence: number;
}

// Paranormal-specific tag categories to help guide analysis
const TAG_CATEGORIES = {
  lightPhenomena: ['bright light', 'orb', 'glowing', 'beam', 'flash', 'luminous', 'pulsing light'],
  shapes: ['triangle', 'disc', 'sphere', 'cigar-shaped', 'diamond', 'rectangular', 'irregular'],
  colors: ['red', 'blue', 'green', 'orange', 'white', 'multicolored'],
  timeOfDay: ['night', 'daytime', 'dusk', 'dawn', 'overcast'],
  environment: ['sky', 'forest', 'urban', 'rural', 'water', 'mountains', 'desert', 'indoor'],
  quality: ['clear', 'blurry', 'grainy', 'distant', 'close-up'],
  features: ['multiple objects', 'single object', 'formation', 'trail', 'hovering', 'moving'],
  phenomena: ['ufo', 'apparition', 'shadow figure', 'mist', 'anomaly', 'creature']
};

// Flatten all suggested tags for reference
const ALL_SUGGESTED_TAGS = Object.values(TAG_CATEGORIES).flat();

/**
 * Analyze an image URL and generate descriptive tags
 */
export async function analyzeMediaWithAI(
  imageUrl: string,
  mediaType: 'image' | 'video' | 'audio' = 'image'
): Promise<MediaTagResult> {
  // Only analyze images for now
  if (mediaType !== 'image') {
    return {
      tags: [mediaType],
      description: `${mediaType} content`,
      confidence: 0.5
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[AI Tagger] No ANTHROPIC_API_KEY found, using fallback tags');
    return generateFallbackTags(imageUrl);
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    // Fetch image and convert to base64
    const imageData = await fetchImageAsBase64(imageUrl);
    if (!imageData) {
      console.warn('[AI Tagger] Could not fetch image, using fallback tags');
      return generateFallbackTags(imageUrl);
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageData.mediaType,
                data: imageData.data
              }
            },
            {
              type: 'text',
              text: `Analyze this image which may depict a paranormal phenomenon, UFO sighting, or unexplained event. Generate descriptive tags that would help someone search for similar images.

Focus on:
1. What's visible in the image (lights, shapes, objects, environment)
2. Time of day and setting
3. Any unusual features or anomalies
4. Image quality characteristics

Return your response in this exact JSON format:
{
  "tags": ["tag1", "tag2", "tag3", ...],
  "description": "A brief 1-2 sentence description of what the image shows",
  "confidence": 0.0-1.0
}

Use lowercase tags. Include 5-15 relevant tags. Be objective - describe what you see, not what it might be.
Example tags: bright light, night sky, urban, triangle shape, multiple objects, blurry, distant`
            }
          ]
        }
      ]
    });

    // Parse the response
    const content = response.content[0];
    if (content.type === 'text') {
      try {
        // Extract JSON from response (handle markdown code blocks)
        let jsonText = content.text;
        const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1];
        }

        const result = JSON.parse(jsonText.trim());
        return {
          tags: normalizeTags(result.tags || []),
          description: result.description || '',
          confidence: Math.min(1, Math.max(0, result.confidence || 0.7))
        };
      } catch (parseError) {
        console.error('[AI Tagger] Failed to parse AI response:', parseError);
        return generateFallbackTags(imageUrl);
      }
    }

    return generateFallbackTags(imageUrl);
  } catch (error) {
    console.error('[AI Tagger] AI analysis failed:', error);
    return generateFallbackTags(imageUrl);
  }
}

/**
 * Fetch an image and convert to base64
 */
async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ParaDocs/1.0 (Media Analysis)'
      }
    });

    if (!response.ok) {
      console.warn(`[AI Tagger] Failed to fetch image: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // Map content type to allowed types
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
    if (contentType.includes('png')) mediaType = 'image/png';
    else if (contentType.includes('gif')) mediaType = 'image/gif';
    else if (contentType.includes('webp')) mediaType = 'image/webp';

    return { data: base64, mediaType };
  } catch (error) {
    console.error('[AI Tagger] Error fetching image:', error);
    return null;
  }
}

/**
 * Normalize tags to lowercase and remove duplicates
 */
function normalizeTags(tags: string[]): string[] {
  const normalized = tags
    .map(tag => tag.toLowerCase().trim())
    .filter(tag => tag.length > 1 && tag.length < 50);

  return Array.from(new Set(normalized));
}

/**
 * Generate basic tags from URL patterns when AI is unavailable
 */
function generateFallbackTags(url: string): MediaTagResult {
  const tags: string[] = ['image'];

  // Detect source from URL
  if (url.includes('i.redd.it') || url.includes('reddit')) {
    tags.push('reddit');
  }
  if (url.includes('imgur')) {
    tags.push('imgur');
  }

  return {
    tags,
    description: 'Image awaiting AI analysis',
    confidence: 0.1
  };
}

/**
 * Batch analyze multiple media items
 */
export async function batchAnalyzeMedia(
  mediaItems: Array<{ id: string; url: string; mediaType: 'image' | 'video' | 'audio' }>,
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<Map<string, MediaTagResult>> {
  const { concurrency = 3, delayMs = 1000 } = options;
  const results = new Map<string, MediaTagResult>();

  // Process in batches
  for (let i = 0; i < mediaItems.length; i += concurrency) {
    const batch = mediaItems.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const result = await analyzeMediaWithAI(item.url, item.mediaType);
        return { id: item.id, result };
      })
    );

    for (const { id, result } of batchResults) {
      results.set(id, result);
    }

    // Rate limiting delay between batches
    if (i + concurrency < mediaItems.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Get suggested tags based on existing tags
 */
export function getSuggestedTags(existingTags: string[]): string[] {
  const suggestions: string[] = [];

  for (const [category, categoryTags] of Object.entries(TAG_CATEGORIES)) {
    // If any tag from this category exists, suggest others from same category
    const hasFromCategory = existingTags.some(t => categoryTags.includes(t));
    if (hasFromCategory) {
      for (const tag of categoryTags) {
        if (!existingTags.includes(tag) && !suggestions.includes(tag)) {
          suggestions.push(tag);
        }
      }
    }
  }

  return suggestions.slice(0, 10);
}
