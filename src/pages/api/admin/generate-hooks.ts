/**
 * Admin API: Generate Feed Hooks with AI
 *
 * POST /api/admin/generate-hooks
 *
 * Generates compelling 1-2 sentence engagement hooks for reports that lack
 * a feed_hook. These hooks are stored in the feed_hook column and used by
 * the homepage preview cards and Discover feed to pull in readers.
 *
 * Query params:
 *   limit: number of reports to process (default: 50)
 *   category: filter by category (optional)
 *   dryRun: if true, don't update database (default: false)
 *   overwrite: if true, regenerate even if feed_hook exists (default: false)
 *
 * Requires ADMIN_API_KEY header for authentication.
 *
 * Example:
 *   curl -X POST "https://beta.discoverparadocs.com/api/admin/generate-hooks?limit=50" \
 *     -H "x-admin-api-key: YOUR_KEY"
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const adminApiKey = process.env.ADMIN_API_KEY || 'admin-secret-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

const MODEL = 'claude-sonnet-4-5-20250929';

const SYSTEM_PROMPT = `You are an expert engagement copywriter for Paradocs, the world's largest paranormal database. Your job is to write a single compelling hook sentence (15-40 words) that makes readers desperate to click and read the full report.

RULES:
1. Write ONE sentence only. No quotes, no attribution, no "Read more" — just the hook.
2. Lead with the most vivid, specific, or startling detail from the report.
3. Use active voice, present tense where possible ("A triangular craft descends..." not "A triangular craft descended...").
4. Include a specific sensory detail: what was seen, heard, felt, smelled.
5. Create an information gap — hint at something extraordinary without giving it all away.
6. Never use generic phrases like "strange experience" or "unexplained event" — be SPECIFIC.
7. If the report has a strong location, weave it in naturally.
8. Match the tone to the category: UFO reports should feel investigative, ghost reports atmospheric, cryptid reports primal/instinctive.

EXAMPLES OF GREAT HOOKS:
- "Three commercial pilots independently report a mile-wide triangular craft hovering silently over Lake Michigan, each describing the same pulsing amber lights."
- "The footprints in the fresh snow led to the center of the field and simply stopped — no tracks leading away, no disturbance in the powder."
- "Every night at 3:17 AM, the temperature in the upstairs hallway drops exactly 22 degrees, and the motion-activated camera captures the same shadow moving left to right."
- "A retired Navy sonar operator recognizes the sound immediately: the same low-frequency pulse that made his entire crew nauseous during a 1987 Pacific patrol."

EXAMPLES OF BAD HOOKS (never write these):
- "This is a strange report about something unexplained." (generic)
- "The witness claims to have seen something unusual in the sky." (vague)
- "Read about this incredible encounter." (CTA, not a hook)
- "In this report, the experiencer describes their sighting." (meta-description)`;

async function generateHook(title: string, summary: string, category: string, locationName: string | null): Promise<string | null> {
  if (!anthropic) return null;

  const truncatedSummary = summary.length > 2000
    ? summary.substring(0, 2000) + '...'
    : summary;

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generate one compelling hook sentence for this ${category.replace('_', ' ')} report:\n\nTitle: ${title}\nLocation: ${locationName || 'Unknown'}\n\nSummary:\n${truncatedSummary}`
        }
      ]
    });

    const textBlock = message.content.find(block => block.type === 'text');
    const hook = textBlock?.type === 'text' ? textBlock.text.trim() : null;

    if (!hook) return null;

    // Clean up: remove surrounding quotes if the AI added them
    let cleaned = hook;
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith('\u201C') && cleaned.endsWith('\u201D'))) {
      cleaned = cleaned.slice(1, -1);
    }

    // Validate: reject hooks that are too short, too long, or generic
    if (cleaned.length < 30 || cleaned.length > 300) return null;
    if (cleaned.toLowerCase().includes('read about') ||
        cleaned.toLowerCase().includes('in this report') ||
        cleaned.toLowerCase().includes('the witness claims')) return null;

    return cleaned;
  } catch (error) {
    console.error('[Generate Hooks] AI error:', error);
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-admin-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (apiKey !== adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!anthropic) {
    return res.status(500).json({
      error: 'Configuration error',
      message: 'ANTHROPIC_API_KEY is not set. Add it to Vercel project settings.'
    });
  }

  const limit = parseInt(req.query.limit as string) || 50;
  const category = req.query.category as string | undefined;
  const dryRun = req.query.dryRun === 'true';
  const overwrite = req.query.overwrite === 'true';

  console.log(`[Generate Hooks] Starting: limit=${limit}, category=${category || 'all'}, dryRun=${dryRun}, overwrite=${overwrite}`);

  try {
    // First, ensure feed_hook column exists
    // (Supabase will error if it doesn't — we catch and report)
    let query = supabase
      .from('reports')
      .select('id, title, summary, category, location_name')
      .eq('status', 'approved')
      .not('summary', 'is', null);

    if (!overwrite) {
      // Only process reports without a hook
      query = query.or('feed_hook.is.null,feed_hook.eq.');
    }

    if (category) {
      query = query.eq('category', category);
    }

    // Prioritize reports with longer summaries (more material to work with)
    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data: reports, error } = await query;

    if (error) {
      // If feed_hook column doesn't exist, tell the user
      if (error.message && error.message.includes('feed_hook')) {
        return res.status(400).json({
          error: 'Column missing',
          message: 'The feed_hook column does not exist in the reports table. Run this SQL in your Supabase SQL editor:\n\nALTER TABLE reports ADD COLUMN feed_hook TEXT DEFAULT NULL;',
          sqlCommand: 'ALTER TABLE reports ADD COLUMN feed_hook TEXT DEFAULT NULL;'
        });
      }
      throw new Error('Database error: ' + error.message);
    }

    console.log(`[Generate Hooks] Found ${(reports || []).length} reports to process`);

    const results: Array<{
      id: string;
      title: string;
      hook: string | null;
      generated: boolean;
    }> = [];

    // Process in batches of 5 to respect rate limits
    const batchSize = 5;
    const reportList = reports || [];

    for (let i = 0; i < reportList.length; i += batchSize) {
      const batch = reportList.slice(i, i + batchSize);

      const promises = batch.map(async function(report) {
        const hook = await generateHook(
          report.title,
          report.summary || '',
          report.category,
          report.location_name
        );

        if (hook && !dryRun) {
          await supabase
            .from('reports')
            .update({ feed_hook: hook })
            .eq('id', report.id);
        }

        return {
          id: report.id,
          title: report.title,
          hook: hook,
          generated: !!hook
        };
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);

      console.log(`[Generate Hooks] Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(reportList.length / batchSize)}`);

      // Rate limit pause between batches
      if (i + batchSize < reportList.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    const generated = results.filter(r => r.generated).length;

    return res.status(200).json({
      success: true,
      dryRun,
      processed: results.length,
      generated,
      failed: results.length - generated,
      results
    });
  } catch (error) {
    console.error('[Generate Hooks] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
