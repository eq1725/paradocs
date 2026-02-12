/**
 * Batch Title Backfill API
 *
 * POST /api/admin/backfill-titles
 *
 * Modes:
 *   "restore"  - Revert titles that were overwritten by pattern pass back to original_title
 *   "clean"    - Clean up Reddit titles (fix caps, remove meta, trim) while keeping them unique
 *   "pattern"  - Full pattern-based replacement (use sparingly — creates duplicates)
 *   "ai"       - AI-based extraction for generic titles (costs money)
 *
 * Body params:
 *   batchSize: number (default varies by mode)
 *   offset: number (default: 0)
 *   mode: "restore" | "clean" | "pattern" | "ai" (default: "clean")
 *   dryRun: boolean (default: false)
 *
 * Uses Supabase Bearer token auth.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { improveTitle, analyzeTitleQuality } from '@/lib/ingestion/filters/title-improver';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = 'williamschaseh@gmail.com';

async function getAuthenticatedUser(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Smart Reddit title cleaner.
 * Strips filler phrases, converts questions to statements, fixes formatting,
 * and trims to a headline-length result — all without AI.
 */
function cleanRedditTitle(title: string): { cleaned: string; wasChanged: boolean } {
  let cleaned = title;

  // ── Step 1: Remove Reddit meta brackets ──
  cleaned = cleaned.replace(/\[(?:Serious|Update|OC|Original|Repost|Long|Short|True|Meta|Debunked|Genuine|Real|Discussion|Question|Experience|Story|Advice|Help)\]\s*/gi, '');
  cleaned = cleaned.replace(/\s*\[(?:Serious|Update|OC|Original|Repost|Long|Short|True|Meta|Debunked|Genuine|Real|Discussion|Question|Experience|Story|Advice|Help)\]$/gi, '');

  // ── Step 2: Fix ALL CAPS ──
  if (cleaned.length > 15 && cleaned === cleaned.toUpperCase()) {
    cleaned = cleaned.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  // ── Step 3: Fix all lowercase ──
  if (cleaned.length > 15 && cleaned === cleaned.toLowerCase()) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Restore paranormal acronyms after case fixes
  cleaned = cleaned.replace(/\bUfo(s)?\b/g, 'UFO$1');
  cleaned = cleaned.replace(/\bUap(s)?\b/g, 'UAP$1');
  cleaned = cleaned.replace(/\bEvp(s)?\b/g, 'EVP$1');
  cleaned = cleaned.replace(/\bEmf\b/g, 'EMF');
  cleaned = cleaned.replace(/\bNde(s)?\b/g, 'NDE$1');
  cleaned = cleaned.replace(/\bObe(s)?\b/g, 'OBE$1');
  cleaned = cleaned.replace(/\bMib\b/g, 'MIB');
  cleaned = cleaned.replace(/\bNhi\b/gi, 'NHI');
  cleaned = cleaned.replace(/\bCia\b/gi, 'CIA');
  cleaned = cleaned.replace(/\bFbi\b/gi, 'FBI');

  // ── Step 4: Strip filler openings ──
  // These patterns remove conversational openers while keeping the substance.
  // Order matters — more specific patterns first.
  const fillerPatterns = [
    // "I just wanted to share" / "I wanted to post about"
    /^I\s+(?:just\s+)?(?:want(?:ed)?|need(?:ed)?)\s+to\s+(?:share|post|tell|talk)\s*(?:about|my|this|that|the)?\s*/i,
    // "So basically" / "So last night" / "So I was"
    /^So\s+(?:basically\s+)?(?=\w)/i,
    // "Okay so" / "Ok so" / "Alright so"
    /^(?:Okay|Ok|Alright|Well)\s+(?:so\s+)?/i,
    // "Long story short" / "TLDR"
    /^(?:Long story short|TLDR|TL;DR)[,:]?\s*/i,
    // "Not sure if this belongs here but"
    /^(?:Not sure (?:if|where)|I'm not sure (?:if|where)).*?(?:but|however)\s*/i,
    // "I don't know if anyone else" / "I don't know what I saw but"
    /^I\s+don'?t\s+know\s+(?:if|what|how).*?(?:but|however|,)\s*/i,
    // "This happened to me" / "This happened when"
    /^This\s+(?:happened|occurred)\s+(?:to\s+(?:me|us)\s+)?/i,
    // "I think I" → keep "I"
    /^I\s+(?:think|believe|feel like)\s+/i,
    // "Has anyone else" / "Does anyone else" / "Anyone else"
    /^(?:Has|Does|Did|Can|Could|Would|Do)\s+(?:anyone|anybody|someone)\s+(?:else\s+)?(?:ever\s+)?/i,
    /^Anyone\s+(?:else\s+)?(?:ever\s+)?/i,
    // "DAE" (Does Anyone Else)
    /^DAE\s+/i,
    // "Am I the only one who"
    /^Am\s+I\s+the\s+only\s+one\s+(?:who|that|to)\s*/i,
    // "I'm curious" / "Just curious"
    /^(?:I'?m\s+|Just\s+)?curious[,:]?\s*(?:about\s+|if\s+|whether\s+)?/i,
    // "For those who" / "For anyone who"
    /^For\s+(?:those|anyone|people)\s+(?:who|that)\s+/i,
  ];

  for (const pattern of fillerPatterns) {
    const before = cleaned;
    cleaned = cleaned.replace(pattern, '');
    if (cleaned !== before && cleaned.length > 0) {
      // Capitalize first letter after stripping
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      break; // Only strip one filler pattern
    } else {
      cleaned = before; // Revert if it emptied the string
    }
  }

  // ── Step 5: Strip trailing filler ──
  const trailingPatterns = [
    /\s*[\-–—]\s*(?:anyone else|thoughts\??|help|advice|what do you think|is this normal|am I crazy).*$/i,
    /\s*[,.]?\s+(?:and I'?m (?:still )?(?:freaking|scared|terrified|shaking|confused|baffled|curious)).*$/i,
    /\s*[,.]?\s+(?:what (?:was|is|could|should|do|did) (?:it|this|that|I)).*$/i,
    /\s*[,.]?\s+(?:has this happened to anyone).*$/i,
    /\s*[,.]?\s+(?:I need (?:help|advice|answers|opinions)).*$/i,
    /\s*[,.]?\s+(?:please (?:help|read|share|advise)).*$/i,
  ];

  for (const pattern of trailingPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // ── Step 6: Convert questions to statements ──
  if (cleaned.endsWith('?')) {
    // "Have you ever seen a shadow figure?" → "Shadow Figure Sighting"
    // But only for short questions — long questions often have good content
    cleaned = cleaned.replace(/\?$/, '');

    // Strip question openers
    cleaned = cleaned.replace(/^(?:Have\s+you\s+ever|Has\s+anyone\s+ever|Did\s+(?:anyone|you)\s+(?:ever\s+)?)\s*/i, '');
    cleaned = cleaned.replace(/^(?:What\s+(?:is|are|was|were|do you (?:think|call)))\s+/i, '');
    cleaned = cleaned.replace(/^(?:Why\s+(?:do|does|did|is|are|would))\s+/i, '');
    cleaned = cleaned.replace(/^(?:How\s+(?:do|does|did|can|could|would)\s+(?:you\s+)?(?:explain\s+)?)/i, '');
    cleaned = cleaned.replace(/^(?:Is\s+(?:it|this|that|there)\s+)/i, '');
    cleaned = cleaned.replace(/^(?:Could\s+(?:this|it|that)\s+(?:be|have been)\s+)/i, '');
    cleaned = cleaned.replace(/^(?:Would\s+(?:this|it|that)\s+(?:be|count as)\s+)/i, '');
    // Strip leftover bare verbs after question stripping: "see X" → "X", "hear X" → "X"
    cleaned = cleaned.replace(/^(?:seen?|hear(?:d)?|notice(?:d)?|experience(?:d)?|felt?|encounter(?:ed)?|witness(?:ed)?|spot(?:ted)?)\s+/i, '');
    // Strip "a/an/the/any" articles left at the start
    cleaned = cleaned.replace(/^(?:a|an|the|any|some)\s+/i, '');

    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }

  // ── Step 7: Strip "I saw/heard/experienced" openers ──
  // "I saw a large triangle craft over my house" → "Large Triangle Craft Over My House"
  const narrativeOpeners = [
    /^I\s+(?:just\s+)?(?:saw|seen|spotted|noticed|witnessed|observed|caught)\s+(?:a\s+|an\s+|the\s+|some\s+|what\s+(?:looked|appeared|seemed)\s+(?:like|to be)\s+(?:a\s+|an\s+)?)?/i,
    /^I\s+(?:just\s+)?(?:heard|felt|sensed|experienced|encountered|had)\s+(?:a\s+|an\s+|the\s+|some\s+)?(?:strange\s+|weird\s+|bizarre\s+|unexplained\s+)?/i,
    /^(?:My\s+(?:friend|brother|sister|mom|dad|wife|husband|partner|family|dog|cat)\s+and\s+)?I\s+(?:were|was)\s+/i,
    /^(?:We|Me and my\s+\w+)\s+(?:were|was|saw|heard|noticed|spotted|experienced)\s+/i,
    /^Last\s+(?:night|week|month|year|summer|winter|spring|fall)\s+/i,
    /^(?:A\s+few|A\s+couple(?:\s+of)?|About\s+\d+)\s+(?:days|weeks|months|years|nights)\s+ago\s*,?\s*/i,
    /^(?:When\s+I\s+was\s+(?:a\s+(?:kid|child|teen|teenager)|young|\d+))\s*,?\s*/i,
    /^(?:Growing up|Back in \d{4}|Back when I was)\s*,?\s*/i,
  ];

  for (const pattern of narrativeOpeners) {
    const before = cleaned;
    cleaned = cleaned.replace(pattern, '');
    if (cleaned !== before && cleaned.length > 10) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      break;
    } else {
      cleaned = before;
    }
  }

  // ── Step 8: Smart trim for length ──
  if (cleaned.length > 100) {
    // Try to cut at natural break points
    const breaks = [
      { idx: cleaned.substring(0, 100).lastIndexOf('. '), min: 40 },
      { idx: cleaned.substring(0, 100).lastIndexOf(' - '), min: 40 },
      { idx: cleaned.substring(0, 100).lastIndexOf(' — '), min: 40 },
      { idx: cleaned.substring(0, 100).lastIndexOf(', '), min: 50 },
      { idx: cleaned.substring(0, 100).lastIndexOf(' and '), min: 40 },
      { idx: cleaned.substring(0, 97).lastIndexOf(' '), min: 50 },
    ];

    for (const { idx, min } of breaks) {
      if (idx > min) {
        cleaned = cleaned.substring(0, idx);
        break;
      }
    }

    // Final hard limit
    if (cleaned.length > 100) {
      const lastSpace = cleaned.substring(0, 97).lastIndexOf(' ');
      cleaned = cleaned.substring(0, lastSpace > 50 ? lastSpace : 97) + '...';
    }
  }

  // ── Step 9: Final cleanup ──
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^[,.\-–—:;\s]+/, ''); // Remove leading punctuation
  cleaned = cleaned.replace(/[,;:\-–—]+$/, ''); // Remove trailing punctuation (keep . ! ?)
  cleaned = cleaned.replace(/\.{2,}$/, '...');

  // Ensure first char is capitalized
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Safety: if we've trimmed too aggressively, revert to original
  if (cleaned.length < 10) {
    return { cleaned: title, wasChanged: false };
  }

  return {
    cleaned,
    wasChanged: cleaned !== title
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    batchSize: requestedBatchSize,
    offset = 0,
    mode = 'clean',
    dryRun = false
  } = req.body;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    if (mode === 'restore') {
      return await handleRestoreMode(supabase, requestedBatchSize || 500, offset, dryRun, res);
    } else if (mode === 'clean') {
      return await handleCleanMode(supabase, requestedBatchSize || 500, offset, dryRun, res);
    } else if (mode === 'pattern') {
      return await handlePatternMode(supabase, requestedBatchSize || 500, offset, dryRun, res);
    } else if (mode === 'ai') {
      return await handleAiMode(supabase, requestedBatchSize || 20, offset, dryRun, res);
    } else {
      return res.status(400).json({ error: `Invalid mode: ${mode}` });
    }
  } catch (error) {
    console.error('[Backfill Titles] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * RESTORE MODE: Revert pattern-replaced titles back to original_title
 * For reports where original_title differs from title (meaning we replaced it)
 */
async function handleRestoreMode(
  supabase: any,
  batchSize: number,
  offset: number,
  dryRun: boolean,
  res: NextApiResponse
) {
  // Find reports where title != original_title (meaning pattern pass changed them)
  const { data: reports, error, count } = await supabase
    .from('reports')
    .select('id, title, original_title', { count: 'exact' })
    .in('source_type', ['reddit', 'reddit-comments'])
    .not('original_title', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) throw new Error(`Database query error: ${error.message}`);

  if (!reports || reports.length === 0) {
    return res.status(200).json({
      success: true, done: true, mode: 'restore',
      results: { processed: 0, restored: 0, alreadySame: 0 },
      nextOffset: offset
    });
  }

  let restored = 0;
  let alreadySame = 0;
  const samples: Array<{ current: string; restoredTo: string }> = [];

  for (const report of reports) {
    if (report.title === report.original_title) {
      alreadySame++;
      continue;
    }

    restored++;
    if (samples.length < 5) {
      samples.push({
        current: report.title.substring(0, 80),
        restoredTo: report.original_title.substring(0, 80)
      });
    }

    if (!dryRun) {
      await supabase
        .from('reports')
        .update({ title: report.original_title, original_title: null })
        .eq('id', report.id);
    }
  }

  return res.status(200).json({
    success: true,
    done: reports.length < batchSize,
    mode: 'restore',
    dryRun,
    results: {
      processed: reports.length,
      restored,
      alreadySame,
      samples
    },
    nextOffset: offset + reports.length,
    totalRemaining: count ? count - reports.length : undefined
  });
}

/**
 * CLEAN MODE: Fix formatting on Reddit titles without replacing content
 * Keeps the unique original content but fixes caps, removes meta, trims length
 */
async function handleCleanMode(
  supabase: any,
  batchSize: number,
  offset: number,
  dryRun: boolean,
  res: NextApiResponse
) {
  // Fetch Reddit reports that haven't been cleaned yet (original_title is null)
  const { data: reports, error, count } = await supabase
    .from('reports')
    .select('id, title, description, category, location_name, event_date, source_type', { count: 'exact' })
    .in('source_type', ['reddit', 'reddit-comments'])
    .is('original_title', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) throw new Error(`Database query error: ${error.message}`);

  if (!reports || reports.length === 0) {
    return res.status(200).json({
      success: true, done: true, mode: 'clean',
      results: { processed: 0, cleaned: 0, alreadyGood: 0 },
      nextOffset: offset
    });
  }

  let cleaned = 0;
  let alreadyGood = 0;
  const samples: Array<{ old: string; new: string }> = [];
  const updates: Array<{ id: string; title: string; original_title: string }> = [];

  for (const report of reports) {
    const result = cleanRedditTitle(report.title);

    if (result.wasChanged) {
      cleaned++;
      updates.push({
        id: report.id,
        title: result.cleaned,
        original_title: report.title
      });
      if (samples.length < 5) {
        samples.push({
          old: report.title.substring(0, 80),
          new: result.cleaned.substring(0, 80)
        });
      }
    } else {
      alreadyGood++;
      // Mark as processed
      updates.push({
        id: report.id,
        title: report.title,
        original_title: report.title
      });
    }
  }

  // Bulk update
  if (!dryRun && updates.length > 0) {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      const promises = chunk.map(u =>
        supabase
          .from('reports')
          .update({ title: u.title, original_title: u.original_title })
          .eq('id', u.id)
      );
      await Promise.all(promises);
    }
  }

  return res.status(200).json({
    success: true,
    done: reports.length < batchSize,
    mode: 'clean',
    dryRun,
    results: {
      processed: reports.length,
      cleaned,
      alreadyGood,
      samples
    },
    nextOffset: offset + reports.length,
    totalRemaining: count ? count - reports.length : undefined
  });
}

/**
 * PATTERN MODE: Full pattern-based replacement (creates duplicates — use sparingly)
 */
async function handlePatternMode(
  supabase: any,
  batchSize: number,
  offset: number,
  dryRun: boolean,
  res: NextApiResponse
) {
  const { data: reports, error, count } = await supabase
    .from('reports')
    .select('id, title, description, category, location_name, event_date, source_type, tags', { count: 'exact' })
    .in('source_type', ['reddit', 'reddit-comments'])
    .is('original_title', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) throw new Error(`Database query error: ${error.message}`);

  if (!reports || reports.length === 0) {
    return res.status(200).json({
      success: true, done: true, mode: 'pattern',
      results: { processed: 0, improved: 0, skipped: 0, alreadyGood: 0 },
      nextOffset: offset
    });
  }

  let improved = 0;
  let skipped = 0;
  let alreadyGood = 0;
  const sampleImprovements: Array<{ old: string; new: string }> = [];
  const updates: Array<{ id: string; title: string; original_title: string }> = [];

  for (const report of reports) {
    const issues = analyzeTitleQuality(report.title);
    if (issues.length === 0) {
      alreadyGood++;
      updates.push({ id: report.id, title: report.title, original_title: report.title });
      continue;
    }

    const result = improveTitle(
      report.title,
      report.description || '',
      report.category || 'other',
      report.location_name,
      report.event_date
    );

    if (result.wasImproved) {
      improved++;
      updates.push({ id: report.id, title: result.title, original_title: report.title });
      if (sampleImprovements.length < 5) {
        sampleImprovements.push({ old: report.title.substring(0, 80), new: result.title.substring(0, 80) });
      }
    } else {
      skipped++;
      updates.push({ id: report.id, title: report.title, original_title: report.title });
    }
  }

  if (!dryRun && updates.length > 0) {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(u =>
        supabase.from('reports').update({ title: u.title, original_title: u.original_title }).eq('id', u.id)
      ));
    }
  }

  return res.status(200).json({
    success: true,
    done: reports.length < batchSize,
    mode: 'pattern',
    dryRun,
    results: { processed: reports.length, improved, skipped, alreadyGood, sampleImprovements },
    nextOffset: offset + reports.length,
    totalRemaining: count ? count - reports.length : undefined
  });
}

/**
 * AI MODE: Placeholder for AI-based improvement
 */
async function handleAiMode(
  supabase: any,
  batchSize: number,
  offset: number,
  dryRun: boolean,
  res: NextApiResponse
) {
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, title, description, category, location_name, original_title')
    .in('source_type', ['reddit', 'reddit-comments'])
    .not('original_title', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) throw new Error(`Database query error: ${error.message}`);

  return res.status(200).json({
    success: true,
    done: !reports || reports.length < batchSize,
    mode: 'ai',
    results: {
      processed: reports?.length || 0,
      message: 'AI mode queries identified. Use /api/admin/fix-titles for AI processing.'
    },
    nextOffset: offset + (reports?.length || 0)
  });
}

export const config = {
  maxDuration: 300,
};
