/**
 * Admin API: Fix Generic Titles with AI
 *
 * POST /api/admin/fix-titles
 *
 * Query params:
 *   limit: number of reports to process (default: 20)
 *   category: filter by category (optional)
 *   dryRun: if true, don't update database (default: false)
 *
 * Requires ADMIN_API_KEY header for authentication
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const adminApiKey = process.env.ADMIN_API_KEY || 'admin-secret-key';

// Log API key status on module load (without exposing the actual key)
console.log(`[Fix Titles] ANTHROPIC_API_KEY status: ${anthropicKey ? 'SET (' + anthropicKey.substring(0, 10) + '...)' : 'MISSING'}`);

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

const MODEL = 'claude-sonnet-4-5-20250929';

// Fallback descriptors that indicate a generic title
const FALLBACK_DESCRIPTORS = [
  'Paranormal Experience',
  'UFO Sighting',
  'Creature Sighting',
  'Strange Experience',
  'Consciousness Experience',
  'Psychic Experience',
  'Unexplained Event',
  'Biological Anomaly',
  'Sensory Experience',
  'Spiritual Experience',
  'Esoteric Experience',
  'Multi-Faceted Experience',
  'Cryptid Encounter',
];

// Pattern matches both "Jan 2026" and "Jan 18, 2026" formats
const GENERIC_TITLE_PATTERN = new RegExp(
  `^(${FALLBACK_DESCRIPTORS.join('|')})\\s*-\\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+(\\d{1,2},\\s*)?\\d{4}$`,
  'i'
);

interface TitleElements {
  setting: string | null;
  keyElement: string | null;
  timeContext: string | null;
  uniqueDetail: string | null;
}

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
UNIQUE_DETAIL: [value or null]`;

async function extractTitleElements(description: string): Promise<TitleElements> {
  // Check if Anthropic client is available
  if (!anthropic) {
    console.error('[Fix Titles] ANTHROPIC_API_KEY is not set - cannot extract title elements');
    return { setting: null, keyElement: null, timeContext: null, uniqueDetail: null };
  }

  const truncatedDesc = description.length > 1500
    ? description.substring(0, 1500) + '...'
    : description;

  try {
    console.log(`[Fix Titles] Calling Anthropic API for description (${truncatedDesc.length} chars)...`);

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
    });

    const textBlock = message.content.find(block => block.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : '';

    console.log(`[Fix Titles] AI Response: "${responseText.substring(0, 200)}..."`);

    const elements = parseElementsResponse(responseText);
    console.log(`[Fix Titles] Parsed elements:`, JSON.stringify(elements));

    return elements;
  } catch (error) {
    console.error('[Fix Titles] Error extracting title elements:', error);
    return { setting: null, keyElement: null, timeContext: null, uniqueDetail: null };
  }
}

function parseElementsResponse(response: string): TitleElements {
  const elements: TitleElements = {
    setting: null,
    keyElement: null,
    timeContext: null,
    uniqueDetail: null
  };

  const settingMatch = response.match(/SETTING:\s*(.+)/i);
  const keyElementMatch = response.match(/KEY_ELEMENT:\s*(.+)/i);
  const timeContextMatch = response.match(/TIME_CONTEXT:\s*(.+)/i);
  const uniqueDetailMatch = response.match(/UNIQUE_DETAIL:\s*(.+)/i);

  if (settingMatch) {
    const val = settingMatch[1].trim();
    elements.setting = val.toLowerCase() === 'null' ? null : val;
  }
  if (keyElementMatch) {
    const val = keyElementMatch[1].trim();
    elements.keyElement = val.toLowerCase() === 'null' ? null : val;
  }
  if (timeContextMatch) {
    const val = timeContextMatch[1].trim();
    elements.timeContext = val.toLowerCase() === 'null' ? null : val;
  }
  if (uniqueDetailMatch) {
    const val = uniqueDetailMatch[1].trim();
    elements.uniqueDetail = val.toLowerCase() === 'null' ? null : val;
  }

  return elements;
}

function buildTitleSuffix(elements: TitleElements): string | null {
  const parts: string[] = [];

  if (elements.setting) parts.push(elements.setting);
  if (elements.keyElement && parts.length < 2) parts.push(elements.keyElement);
  if (elements.uniqueDetail && parts.length < 2) parts.push(elements.uniqueDetail);
  if (elements.timeContext && parts.length < 2) parts.push(elements.timeContext);

  const result = parts.length > 0 ? parts.join(', ') : null;
  console.log(`[Fix Titles] buildTitleSuffix: parts=${JSON.stringify(parts)}, result="${result}"`);
  return result;
}

function generateNewTitle(
  oldTitle: string,
  elements: TitleElements,
  locationName: string | null
): string {
  const phenomenonMatch = oldTitle.match(new RegExp(`^(${FALLBACK_DESCRIPTORS.join('|')})`, 'i'));
  const phenomenonType = phenomenonMatch ? phenomenonMatch[1] : 'Paranormal Experience';

  const aiSuffix = buildTitleSuffix(elements);

  if (aiSuffix) {
    const newTitle = `${phenomenonType} - ${aiSuffix}`;
    console.log(`[Fix Titles] generateNewTitle: using AI suffix -> "${newTitle}"`);
    return newTitle;
  }

  if (locationName && locationName.length < 25) {
    const cleanLocation = locationName.replace(/,?\s*(USA|US|United States)$/i, '').trim();
    if (cleanLocation) {
      const newTitle = `${phenomenonType} - ${cleanLocation}`;
      console.log(`[Fix Titles] generateNewTitle: using location fallback -> "${newTitle}"`);
      return newTitle;
    }
  }

  console.log(`[Fix Titles] generateNewTitle: no improvement possible, keeping original`);
  return oldTitle;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const apiKey = req.headers['x-admin-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (apiKey !== adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if Anthropic API key is available
  if (!anthropic) {
    return res.status(500).json({
      error: 'Configuration error',
      message: 'ANTHROPIC_API_KEY is not set in environment variables. Please add it to Vercel project settings.',
      hint: 'Go to Vercel Dashboard > Project Settings > Environment Variables and add ANTHROPIC_API_KEY'
    });
  }

  const limit = parseInt(req.query.limit as string) || 20;
  const category = req.query.category as string | undefined;
  const dryRun = req.query.dryRun === 'true';

  console.log(`[Fix Titles] Starting batch process: limit=${limit}, category=${category || 'all'}, dryRun=${dryRun}`);

  try {
    // Build OR conditions for generic title patterns
    const titlePatterns = FALLBACK_DESCRIPTORS.map(desc =>
      `title.like.${desc} - Jan 2026,title.like.${desc} - Feb 2026,title.like.${desc} - Mar 2026,title.like.${desc} - Apr 2026,title.like.${desc} - May 2026,title.like.${desc} - Jun 2026,title.like.${desc} - Jul 2026,title.like.${desc} - Aug 2026,title.like.${desc} - Sep 2026,title.like.${desc} - Oct 2026,title.like.${desc} - Nov 2026,title.like.${desc} - Dec 2026`
    ).join(',');

    // Find generic titles directly with database filtering
    let query = supabase
      .from('reports')
      .select('id, title, description, category, location_name, created_at')
      .eq('status', 'approved')
      .or(titlePatterns);

    if (category) {
      query = query.eq('category', category);
    }

    const { data: reports, error } = await query.limit(limit);

    if (error) {
      // Fallback: fetch more and filter in JS if OR query fails
      console.log('[Fix Titles] OR query failed, using fallback method');
      const { data: allReports, error: fallbackError } = await supabase
        .from('reports')
        .select('id, title, description, category, location_name, created_at')
        .eq('status', 'approved')
        .limit(limit * 20);

      if (fallbackError) {
        throw new Error(`Database error: ${fallbackError.message}`);
      }

      const filteredReports = (allReports || [])
        .filter(report => GENERIC_TITLE_PATTERN.test(report.title))
        .slice(0, limit);

      console.log(`[Fix Titles] Found ${filteredReports.length} reports with generic titles (fallback)`);

      // Process filteredReports instead
      const results: Array<{
        id: string;
        oldTitle: string;
        newTitle: string;
        changed: boolean;
      }> = [];

      for (const report of filteredReports) {
        try {
          const elements = await extractTitleElements(report.description);
          const newTitle = generateNewTitle(report.title, elements, report.location_name);
          const changed = newTitle !== report.title;

          if (changed && !dryRun) {
            await supabase
              .from('reports')
              .update({ title: newTitle })
              .eq('id', report.id);
          }

          results.push({
            id: report.id,
            oldTitle: report.title,
            newTitle,
            changed
          });

          console.log(`[Fix Titles] ${changed ? 'Updated' : 'Skipped'}: "${report.title.substring(0, 30)}..." -> "${newTitle.substring(0, 30)}..."`);
        } catch (err) {
          console.error(`[Fix Titles] Error processing ${report.id}:`, err);
          results.push({
            id: report.id,
            oldTitle: report.title,
            newTitle: report.title,
            changed: false
          });
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const updated = results.filter(r => r.changed).length;

      return res.status(200).json({
        success: true,
        dryRun,
        processed: results.length,
        updated,
        skipped: results.length - updated,
        results
      });
    }

    console.log(`[Fix Titles] Found ${reports.length} reports with generic titles`);

    const results: Array<{
      id: string;
      oldTitle: string;
      newTitle: string;
      changed: boolean;
    }> = [];

    // Process each report
    for (const report of reports) {
      try {
        const elements = await extractTitleElements(report.description);
        const newTitle = generateNewTitle(report.title, elements, report.location_name);
        const changed = newTitle !== report.title;

        if (changed && !dryRun) {
          await supabase
            .from('reports')
            .update({ title: newTitle })
            .eq('id', report.id);
        }

        results.push({
          id: report.id,
          oldTitle: report.title,
          newTitle,
          changed
        });

        console.log(`[Fix Titles] ${changed ? 'Updated' : 'Skipped'}: "${report.title.substring(0, 30)}..." -> "${newTitle.substring(0, 30)}..."`);
      } catch (err) {
        console.error(`[Fix Titles] Error processing ${report.id}:`, err);
        results.push({
          id: report.id,
          oldTitle: report.title,
          newTitle: report.title,
          changed: false
        });
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const updated = results.filter(r => r.changed).length;

    return res.status(200).json({
      success: true,
      dryRun,
      processed: results.length,
      updated,
      skipped: results.length - updated,
      results
    });
  } catch (error) {
    console.error('[Fix Titles] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
