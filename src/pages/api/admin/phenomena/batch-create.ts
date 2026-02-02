/**
 * Batch Create Phenomena API
 *
 * Creates multiple phenomena entries from seed data with AI-generated content.
 * Skips existing phenomena (by name).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';
import { generatePhenomenonContent } from '@/lib/services/phenomena.service';

// Admin email check
const ADMIN_EMAIL = 'williamschaseh@gmail.com';

interface SeedPhenomenon {
  name: string;
  aliases: string[];
  category: string;
  icon: string;
  brief_description: string;
  key_characteristics: string[];
  regions: string[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createServerClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { phenomena, generateContent = true, dryRun = false } = req.body as {
      phenomena: SeedPhenomenon[];
      generateContent?: boolean;
      dryRun?: boolean;
    };

    if (!phenomena || !Array.isArray(phenomena)) {
      return res.status(400).json({ error: 'phenomena array required' });
    }

    console.log(`[BatchCreate] Starting batch create for ${phenomena.length} phenomena (dryRun: ${dryRun})`);

    // Get existing phenomena to avoid duplicates
    const { data: existing } = await supabase
      .from('phenomena')
      .select('name, slug');

    const existingNames = new Set((existing || []).map(p => p.name.toLowerCase()));
    const existingSlugs = new Set((existing || []).map(p => p.slug));

    const results = {
      total: phenomena.length,
      created: 0,
      skipped: 0,
      errors: 0,
      skippedNames: [] as string[],
      createdNames: [] as string[],
      errorDetails: [] as { name: string; error: string }[],
    };

    for (const item of phenomena) {
      // Check for duplicate by name
      if (existingNames.has(item.name.toLowerCase())) {
        results.skipped++;
        results.skippedNames.push(item.name);
        continue;
      }

      // Generate slug
      const slug = item.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Check for duplicate by slug
      if (existingSlugs.has(slug)) {
        results.skipped++;
        results.skippedNames.push(item.name);
        continue;
      }

      if (dryRun) {
        results.created++;
        results.createdNames.push(item.name);
        continue;
      }

      // Create the phenomenon
      const { data: newPhenomenon, error: insertError } = await supabase
        .from('phenomena')
        .insert({
          name: item.name,
          slug,
          aliases: item.aliases || [],
          category: mapCategory(item.category),
          icon: item.icon || '❔',
          ai_summary: item.brief_description,
          primary_regions: item.regions || [],
          status: 'active',
          auto_generated: false,
        })
        .select('id, name')
        .single();

      if (insertError) {
        console.error(`[BatchCreate] Error creating ${item.name}:`, insertError);
        results.errors++;
        results.errorDetails.push({ name: item.name, error: insertError.message });
        continue;
      }

      results.created++;
      results.createdNames.push(item.name);
      existingNames.add(item.name.toLowerCase());
      existingSlugs.add(slug);

      // Generate AI content if requested
      if (generateContent && newPhenomenon) {
        try {
          await generatePhenomenonContent(newPhenomenon.id);
          console.log(`[BatchCreate] Generated content for: ${item.name}`);
        } catch (contentError) {
          console.error(`[BatchCreate] Content generation failed for ${item.name}:`, contentError);
        }

        // Rate limit: wait between AI calls
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[BatchCreate] Complete: ${results.created} created, ${results.skipped} skipped, ${results.errors} errors`);

    return res.status(200).json({
      success: true,
      dryRun,
      results,
    });
  } catch (error) {
    console.error('[BatchCreate] Error:', error);
    return res.status(500).json({
      error: 'Batch creation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Map seed category names to database enum values
 */
function mapCategory(category: string): string {
  const mapping: Record<string, string> = {
    'cryptids': 'cryptid',
    'cryptid': 'cryptid',
    'ufos_aliens': 'ufo_uap',
    'ufo_uap': 'ufo_uap',
    'ufos': 'ufo_uap',
    'aliens': 'ufo_uap',
    'ghosts_hauntings': 'ghost_haunting',
    'ghost_haunting': 'ghost_haunting',
    'ghosts': 'ghost_haunting',
    'hauntings': 'ghost_haunting',
    'psychic_phenomena': 'psychic_paranormal',
    'psychic_paranormal': 'psychic_paranormal',
    'psychic': 'psychic_paranormal',
    'unexplained': 'unexplained_event',
    'unexplained_event': 'unexplained_event',
    'mystery_location': 'mystery_location',
    'other': 'other',
  };

  return mapping[category.toLowerCase()] || 'other';
}

// Increase body size limit for large seed data
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};
