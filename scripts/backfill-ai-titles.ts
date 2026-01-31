/**
 * Backfill AI-Enhanced Titles
 *
 * This script finds all reports with generic fallback titles
 * and updates them with AI-extracted unique elements.
 *
 * Usage: npx tsx scripts/backfill-ai-titles.ts
 *
 * Options:
 *   --dry-run    Preview changes without updating database
 *   --limit=N    Process only N reports (default: all)
 *   --category=X Process only reports in category X
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anthropicKey = process.env.ANTHROPIC_API_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

if (!anthropicKey) {
  console.error('Missing ANTHROPIC_API_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const anthropic = new Anthropic({ apiKey: anthropicKey });

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

// Pattern to match generic titles with date suffix (both "Jan 2026" and "Jan 18, 2026")
const GENERIC_TITLE_PATTERN = new RegExp(
  `^(${FALLBACK_DESCRIPTORS.join('|')})\\s*-\\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+(\\d{1,2},\\s*)?\\d{4}$`,
  'i'
);

interface Report {
  id: string;
  title: string;
  description: string;
  category: string;
  location_name: string | null;
  created_at: string;
}

interface TitleElements {
  setting: string | null;
  keyElement: string | null;
  timeContext: string | null;
  uniqueDetail: string | null;
}

const SYSTEM_PROMPT = `You are a title extraction assistant helping create unique titles for paranormal experience reports.

IMPORTANT: Your goal is to find AT LEAST ONE distinctive element from each description. We need to replace generic date-based titles with something more descriptive.

Extract these elements (find at least 1-2):
1. SETTING: Where it happened - any location detail helps (e.g., "Bedroom", "Kitchen", "Woods", "Car", "Apartment", "Hospital", "School", "Home")
2. KEY_ELEMENT: The main phenomenon or experience (e.g., "Shadow Figure", "Strange Noise", "Cold Feeling", "Moving Object", "Voice", "Light", "Presence")
3. TIME_CONTEXT: When it happened (e.g., "Childhood", "Night", "Morning", "2019", "Age 12")
4. UNIQUE_DETAIL: Any specific detail (e.g., "Dog Reacted", "Multiple Witnesses", "Recurring", "Sleep Paralysis")

Guidelines:
- Be concise (1-4 words max per element)
- Extract SOMETHING rather than returning all nulls - any detail is better than a date
- Even simple details like "Bedroom" or "Shadow" help create unique titles
- Only return null if that specific category truly has no relevant information

Format your response EXACTLY like this (no other text):
SETTING: [value or null]
KEY_ELEMENT: [value or null]
TIME_CONTEXT: [value or null]
UNIQUE_DETAIL: [value or null]`;

async function extractTitleElements(description: string): Promise<TitleElements> {
  const truncatedDesc = description.length > 1500
    ? description.substring(0, 1500) + '...'
    : description;

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
    });

    const textBlock = message.content.find(block => block.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : '';

    return parseElementsResponse(responseText);
  } catch (error) {
    console.error('Error extracting title elements:', error);
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

  return parts.length > 0 ? parts.join(', ') : null;
}

function generateNewTitle(
  oldTitle: string,
  elements: TitleElements,
  locationName: string | null
): string {
  // Extract the phenomenon type from the old title
  const phenomenonMatch = oldTitle.match(new RegExp(`^(${FALLBACK_DESCRIPTORS.join('|')})`, 'i'));
  const phenomenonType = phenomenonMatch ? phenomenonMatch[1] : 'Paranormal Experience';

  const aiSuffix = buildTitleSuffix(elements);

  if (aiSuffix) {
    return `${phenomenonType} - ${aiSuffix}`;
  }

  // Fallback to location if available
  if (locationName && locationName.length < 25) {
    const cleanLocation = locationName.replace(/,?\s*(USA|US|United States)$/i, '').trim();
    if (cleanLocation) {
      return `${phenomenonType} - ${cleanLocation}`;
    }
  }

  // Keep original if no improvement possible
  return oldTitle;
}

async function findGenericTitles(limit?: number, category?: string): Promise<Report[]> {
  let query = supabase
    .from('reports')
    .select('id, title, description, category, location_name, created_at')
    .eq('status', 'approved');

  if (category) {
    query = query.eq('category', category);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching reports:', error);
    return [];
  }

  // Filter to only generic titles
  return (data || []).filter(report => GENERIC_TITLE_PATTERN.test(report.title));
}

async function updateReportTitle(id: string, newTitle: string): Promise<boolean> {
  const { error } = await supabase
    .from('reports')
    .update({ title: newTitle })
    .eq('id', id);

  if (error) {
    console.error(`Error updating report ${id}:`, error);
    return false;
  }

  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const categoryArg = args.find(a => a.startsWith('--category='));

  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;
  const category = categoryArg ? categoryArg.split('=')[1] : undefined;

  console.log('='.repeat(60));
  console.log('AI Title Backfill Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (updating database)'}`);
  if (limit) console.log(`Limit: ${limit} reports`);
  if (category) console.log(`Category: ${category}`);
  console.log('');

  // Find generic titles
  console.log('Finding reports with generic titles...');
  const reports = await findGenericTitles(limit, category);
  console.log(`Found ${reports.length} reports with generic titles`);
  console.log('');

  if (reports.length === 0) {
    console.log('No reports to process. Exiting.');
    return;
  }

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches
  const batchSize = 5;
  for (let i = 0; i < reports.length; i += batchSize) {
    const batch = reports.slice(i, i + batchSize);

    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(reports.length / batchSize)}...`);

    for (const report of batch) {
      processed++;

      try {
        // Extract elements using AI
        const elements = await extractTitleElements(report.description);
        const newTitle = generateNewTitle(report.title, elements, report.location_name);

        if (newTitle !== report.title) {
          console.log(`  [${processed}/${reports.length}] "${report.title.substring(0, 40)}..."`);
          console.log(`       -> "${newTitle}"`);

          if (!dryRun) {
            const success = await updateReportTitle(report.id, newTitle);
            if (success) {
              updated++;
            } else {
              errors++;
            }
          } else {
            updated++;
          }
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`  Error processing report ${report.id}:`, error);
        errors++;
      }
    }

    // Delay between batches to avoid rate limits
    if (i + batchSize < reports.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Summary:');
  console.log(`  Processed: ${processed}`);
  console.log(`  Updated:   ${updated}`);
  console.log(`  Skipped:   ${skipped} (no improvement possible)`);
  console.log(`  Errors:    ${errors}`);
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\nThis was a dry run. No changes were made to the database.');
    console.log('Run without --dry-run to apply changes.');
  }
}

main().catch(console.error);
