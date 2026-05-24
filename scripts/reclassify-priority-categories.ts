#!/usr/bin/env tsx
/**
 * Priority-Category Classifier Re-pass (V11.17.16)
 *
 * Re-classifies existing approved Reddit reports against the 5 priority
 * categories that are dramatically under-served:
 *   - psychic_phenomena (premonitions, ESP, telepathy, etc.)
 *   - consciousness_practices (meditation, astral projection, lucid dreaming)
 *   - perception_sensory (sleep paralysis, synesthesia, mandela effect)
 *   - religion_mythology (exorcism, divine encounters, visitations)
 *   - esoteric_practices (witchcraft, ouija, tarot, divination, magick)
 *
 * Why this is leverage: the 98k existing Reddit reports almost certainly
 * contain thousands of meditation/psychic/witchcraft/sleep-paralysis
 * experiences, but the AI classifier originally bucketed them into
 * generic `psychological_experiences` or `ghosts_hauntings` without
 * linking to the SPECIFIC priority-category phenomena. This pass
 * surfaces them without any new ingestion.
 *
 * Architecture:
 *   1. Keyword pre-filter — cheap DB query identifies candidates
 *   2. Anthropic Batch API — Haiku evaluates each candidate against
 *      evidence-bearing criteria per phenomenon (50% batch discount)
 *   3. Drain-safe junction creation — only ADDs report_phenomena rows,
 *      never removes existing ones. Recomputes report_count after.
 *
 * ── Usage ───────────────────────────────────────────────────────────
 *
 *   set -a; source .env.local; set +a
 *
 *   # Dry-run scope (count candidates, no AI calls)
 *   tsx scripts/reclassify-priority-categories.ts --category consciousness_practices --dry-run
 *
 *   # Re-classify up to 500 Reddit reports into consciousness_practices
 *   tsx scripts/reclassify-priority-categories.ts --category consciousness_practices --limit 500
 *
 *   # All 5 priority categories, 1000 each
 *   tsx scripts/reclassify-priority-categories.ts --all --limit 1000
 *
 * ── Cost estimate ───────────────────────────────────────────────────
 *
 *   ~$0.0035 per candidate (Haiku batch). 500 candidates = ~$1.75.
 *   Full 5-category run at 1000 each = ~$17.50.
 *
 * ── Safety ──────────────────────────────────────────────────────────
 *
 *   - Reads existing reports, classifies, INSERTS junctions only.
 *   - Never DELETEs report_phenomena.
 *   - Never modifies reports.* fields.
 *   - Idempotent — re-runnable; junction upsert ignores duplicates.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// ─────────────────────────────────────────────────────────────────────
// PRIORITY-CATEGORY PHENOMENON TARGETS
// ─────────────────────────────────────────────────────────────────────
//
// For each priority category, define candidate phenomena and the
// evidence-bearing criteria Haiku uses to decide if a report belongs.
// Keywords drive the pre-filter (DB ilike); criteria drive the AI eval.

interface PhenomenonTarget {
  slug: string;                    // phenomena.slug (must exist)
  name: string;                    // for prompt readability
  keywords: string[];              // ilike patterns for pre-filter
  evidenceRules: string[];         // criteria Haiku must verify
  description: string;             // 1-line description for Haiku
}

const TARGETS: Record<string, PhenomenonTarget[]> = {
  consciousness_practices: [
    {
      slug: 'astral-projection',
      name: 'Astral Projection',
      keywords: ['astral projection', 'astral plane', 'out of body experience', 'oob experience', 'leaving my body', 'silver cord', 'astral travel'],
      evidenceRules: [
        'The narrator describes consciously leaving their physical body and traveling/observing while non-physical',
        'NOT a near-death experience triggered by medical crisis (those go to NDE)',
        'NOT a passive dream where the narrator was asleep',
      ],
      description: 'Intentional or spontaneous out-of-body experience where consciousness travels separately from the physical body',
    },
    {
      slug: 'lucid-dreaming',
      name: 'Lucid Dreaming',
      keywords: ['lucid dream', 'aware i was dreaming', 'reality check', 'wbtb', 'wake back to bed', 'mild technique'],
      evidenceRules: [
        'The narrator was aware they were dreaming while inside the dream',
        'Often describes intentional control over the dream environment',
        'NOT a regular vivid dream (lucid requires the awareness component)',
      ],
      description: 'Dream state where the narrator is aware they are dreaming and may exercise control over dream content',
    },
    {
      slug: 'meditation-experience',
      name: 'Meditation Experience',
      keywords: ['meditation', 'meditating', 'mindfulness practice', 'breathwork', 'pranayama', 'kundalini', 'vipassana', 'samadhi', 'jhana'],
      evidenceRules: [
        'The anomalous experience occurred during or directly following meditation practice',
        'NOT general mention of meditation as background context',
        'Often involves altered perception, energy sensations, visions, or ego dissolution',
      ],
      description: 'Anomalous or transformative experience occurring during meditation or related contemplative practice',
    },
  ],

  perception_sensory: [
    {
      slug: 'sleep-paralysis',
      name: 'Sleep Paralysis',
      keywords: ['sleep paralysis', 'old hag', 'pinned to bed', 'cant move cant speak', 'hat man', 'shadow figure at bed', 'felt presence in bedroom while paralyzed'],
      evidenceRules: [
        'The narrator was unable to move or speak while awake or semi-awake (typically during sleep transition)',
        'Often accompanied by perceived presence, pressure on chest, or visual hallucinations',
        'NOT a regular nightmare (sleep paralysis requires the immobility + waking-awareness combo)',
      ],
      description: 'Episode of awake paralysis during sleep transition, often with sensed presence and hallucinations',
    },
    {
      slug: 'mandela-effect',
      name: 'Mandela Effect',
      keywords: ['mandela effect', 'remember it differently', 'berenstain bears', 'berenstein bears', 'collective false memory'],
      evidenceRules: [
        'The narrator describes a specific memory that conflicts with established/documented fact',
        'Often shared by others (group-level memory discrepancy)',
        'NOT an isolated personal memory mistake — must reference a broader pattern',
      ],
      description: 'Personal memory of an event or detail that conflicts with established record, often shared by others',
    },
  ],

  psychic_phenomena: [
    {
      slug: 'premonition-experience',
      name: 'Premonition / Waking Vision',
      keywords: ['premonition', 'foresaw', 'feeling something bad would happen', 'gut feeling came true', 'knew before it happened', 'precognitive flash', 'waking vision'],
      evidenceRules: [
        'The narrator had a specific impression of a future event BEFORE it happened',
        'The event subsequently occurred matching the impression',
        'NOT generic anxiety or worry that happened to coincide with a later event',
      ],
      description: 'Waking impression or vision of a specific future event that subsequently occurred',
    },
    {
      slug: 'precognitive-dreams',
      name: 'Precognitive Dreams',
      keywords: ['precognitive dream', 'dream came true', 'dreamed about it before it happened', 'prophetic dream'],
      evidenceRules: [
        'The narrator had a dream depicting a specific event before it occurred in waking life',
        'The waking event matched specific details from the dream',
        'NOT vague symbolic dreams loosely interpreted after the fact',
      ],
      description: 'Dream containing specific details of an event that later occurred in waking life',
    },
    {
      slug: 'telepathy',
      name: 'Telepathy',
      keywords: ['telepathy', 'telepathic', 'read my mind', 'heard my thoughts', 'thought transmission', 'mental connection'],
      evidenceRules: [
        'Direct exchange of specific thoughts or information between minds without conventional communication',
        'NOT general intuition about someone else\'s feelings',
        'Often described as receiving specific verbal/visual content not previously known',
      ],
      description: 'Direct mental transmission of specific information between people',
    },
  ],

  religion_mythology: [
    {
      slug: 'exorcism',
      name: 'Exorcism',
      keywords: ['exorcism', 'exorcist', 'expelled the demon', 'cast out the spirit', 'deliverance ministry', 'demonic possession ritual'],
      evidenceRules: [
        'A formal religious or spiritual ritual to expel an entity from a person or place',
        'NOT a general blessing or cleansing — must reference actual exorcism procedure',
      ],
      description: 'Formal religious ritual to expel a perceived entity from person or location',
    },
  ],

  esoteric_practices: [
    {
      slug: 'ouija-board',
      name: 'Ouija Board',
      keywords: ['ouija', 'spirit board', 'planchette', 'talking board'],
      evidenceRules: [
        'The narrator used a Ouija board or spirit board to attempt communication',
        'Often describes specific phenomena occurring during use (planchette movement, responses)',
        'NOT just hearing about Ouija boards in general',
      ],
      description: 'Use of a Ouija board or spirit board for attempted contact, with experienced phenomena',
    },
    {
      slug: 'tarot-reading',
      name: 'Tarot Reading',
      keywords: ['tarot reading', 'tarot card', 'tarot deck', 'tarot spread', 'pulled the death card'],
      evidenceRules: [
        'The narrator received or performed a tarot reading',
        'Often describes specific cards drawn or interpretations that proved meaningful',
        'NOT general references to tarot as a topic',
      ],
      description: 'Tarot reading session with notable interpretation or subsequent confirmation',
    },
    {
      slug: 'witchcraft-practice',
      name: 'Witchcraft Practice',
      keywords: ['witchcraft', 'witch ritual', 'cast a spell', 'spell work', 'sigil', 'magick working', 'banishing ritual', 'wiccan'],
      evidenceRules: [
        'The narrator practiced witchcraft, spellwork, or related ritual magic',
        'Often describes specific intention + ritual + result',
        'NOT generic mention of witches in fiction or history',
      ],
      description: 'Active practice of witchcraft, spellwork, or ritual magic with described outcome',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  category: string | null;
  all: boolean;
  limit: number;
  dryRun: boolean;
  batchSize: number;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  function flag(name: string, def: string | null = null): string | null {
    const idx = argv.indexOf(name);
    return idx < 0 ? def : argv[idx + 1];
  }
  return {
    category: flag('--category'),
    all: argv.indexOf('--all') >= 0,
    limit: parseInt(flag('--limit', '500') || '500'),
    dryRun: argv.indexOf('--dry-run') >= 0,
    batchSize: parseInt(flag('--batch-size', '100') || '100'),
  };
}

// ─────────────────────────────────────────────────────────────────────
// CANDIDATE PRE-FILTER (keyword-based, cheap)
// ─────────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  slug: string;
  title: string;
  description: string;
  matchedPhenomenon: string;
  matchedKeyword: string;
}

async function findCandidates(
  supabase: SupabaseClient,
  category: string,
  totalLimit: number,
): Promise<Candidate[]> {
  const targets = TARGETS[category];
  if (!targets) throw new Error('Unknown category: ' + category);

  // V11.17.16 — distribute the limit fairly across phenomena rather than
  // exhausting it on the first one. perPhen = totalLimit / phenomena count
  // (rounded up so small leftover doesn't get truncated).
  const perPhenLimit = Math.max(1, Math.ceil(totalLimit / targets.length));

  const candidates: Candidate[] = [];
  const seenIds = new Set<string>();

  for (const target of targets) {
    if (candidates.length >= totalLimit) break;
    const { data: phen } = await supabase.from('phenomena').select('id').eq('slug', target.slug).single();
    if (!phen) {
      console.warn('  no phenomena row for slug=' + target.slug + ' — skipping');
      continue;
    }
    let perPhenCount = 0;
    for (const keyword of target.keywords) {
      if (perPhenCount >= perPhenLimit) break;
      if (candidates.length >= totalLimit) break;
      const remaining = perPhenLimit - perPhenCount;
      const { data: matches } = await supabase
        .from('reports')
        .select('id, slug, title, description')
        .eq('source_type', 'reddit')
        .eq('status', 'approved')
        .ilike('description', '%' + keyword + '%')
        .limit(remaining * 3); // over-fetch since some will be already-linked or dups

      if (!matches) continue;

      for (const r of matches) {
        if (perPhenCount >= perPhenLimit) break;
        if (candidates.length >= totalLimit) break;
        if (seenIds.has(r.id)) continue;
        const { data: existing } = await supabase
          .from('report_phenomena')
          .select('report_id')
          .eq('report_id', r.id)
          .eq('phenomenon_id', phen.id)
          .maybeSingle();
        if (existing) continue;

        candidates.push({
          id: r.id,
          slug: r.slug,
          title: r.title,
          description: r.description,
          matchedPhenomenon: target.slug,
          matchedKeyword: keyword,
        });
        seenIds.add(r.id);
        perPhenCount++;
      }
    }
  }
  return candidates;
}

// ─────────────────────────────────────────────────────────────────────
// ANTHROPIC BATCH SUBMISSION
// ─────────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const BATCH_API_URL = 'https://api.anthropic.com/v1/messages/batches';

function buildClassifierPrompt(candidate: Candidate): string {
  const target = Object.values(TARGETS).flat().find(t => t.slug === candidate.matchedPhenomenon)!;
  return `You are classifying first-person paranormal/anomalous experience reports.

The candidate report:
TITLE: ${candidate.title}
DESCRIPTION (first 2000 chars):
${(candidate.description || '').substring(0, 2000)}

The candidate phenomenon: "${target.name}"
Definition: ${target.description}

Evidence criteria the report must satisfy ALL of:
${target.evidenceRules.map(r => '- ' + r).join('\n')}

Question: Does this report substantively describe ${target.name} per the criteria above?

Respond in JSON only:
{
  "match": "yes" | "no",
  "confidence": 0.0-1.0,
  "evidence_quote": "<a verbatim quote from the description that supports the match, or empty string if no match>"
}

Be STRICT. Only say "yes" if the report clearly describes ${target.name} with concrete evidence from the narrative. False positives clutter the encyclopedia.`;
}

interface BatchRequest {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    messages: Array<{ role: string; content: string }>;
  };
}

async function submitBatch(candidates: Candidate[]): Promise<string> {
  // Anthropic Batch API restricts custom_id to /^[a-zA-Z0-9_-]{1,64}$/.
  // UUID alone (36 chars) is valid; we look up the matched phenomenon
  // from the in-memory candidate map at apply-time. Each candidate is
  // tested against exactly one phenomenon (matchedPhenomenon) so the
  // UUID is uniquely-keyed within a batch.
  const requests: BatchRequest[] = candidates.map((c) => ({
    custom_id: c.id,
    params: {
      model: HAIKU_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: buildClassifierPrompt(c) }],
    },
  }));

  const resp = await fetch(BATCH_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error('Anthropic Batch submit failed: ' + resp.status + ' — ' + err);
  }
  const data = await resp.json() as any;
  return data.id;
}

async function pollBatch(batchId: string, maxWaitSec: number = 3600): Promise<any[]> {
  const startMs = Date.now();
  let lastLog = 0;
  while (true) {
    const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
    if (elapsedSec > maxWaitSec) throw new Error('Batch poll timed out after ' + maxWaitSec + 's');
    if (elapsedSec - lastLog >= 30) {
      console.log('  [+' + elapsedSec + 's] polling batch ' + batchId.substring(0, 30) + '...');
      lastLog = elapsedSec;
    }
    const resp = await fetch(BATCH_API_URL + '/' + batchId, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'message-batches-2024-09-24',
      },
    });
    if (!resp.ok) throw new Error('Batch poll failed: ' + resp.status);
    const data = await resp.json() as any;
    if (data.processing_status === 'ended') {
      const resultsUrl = data.results_url;
      const resultsResp = await fetch(resultsUrl, {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'message-batches-2024-09-24',
        },
      });
      const text = await resultsResp.text();
      return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
    }
    await new Promise(r => setTimeout(r, 30_000));
  }
}

// ─────────────────────────────────────────────────────────────────────
// JUNCTION CREATION (drain-safe)
// ─────────────────────────────────────────────────────────────────────

async function applyResults(
  supabase: SupabaseClient,
  results: any[],
  candidates: Candidate[],
): Promise<{ linked: number; rejected: number; errors: number; phenIds: Set<string> }> {
  // Build report_id → matchedPhenomenon lookup from in-memory candidate list
  const idToPhenSlug = new Map<string, string>();
  for (const c of candidates) idToPhenSlug.set(c.id, c.matchedPhenomenon);

  const phenSlugCache = new Map<string, string | null>();
  async function lookupPhen(slug: string): Promise<string | null> {
    if (phenSlugCache.has(slug)) return phenSlugCache.get(slug) ?? null;
    const { data } = await supabase.from('phenomena').select('id').eq('slug', slug).single();
    const id = data?.id || null;
    phenSlugCache.set(slug, id);
    return id;
  }

  let linked = 0, rejected = 0, errors = 0;
  const phenIds = new Set<string>();
  for (const r of results) {
    const reportId = r.custom_id;
    const phenSlug = idToPhenSlug.get(reportId);
    if (!reportId || !phenSlug) { errors++; continue; }
    const body = r.result?.message?.content?.[0]?.text || '';
    let parsed: any;
    try {
      const jsonMatch = body.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no json in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      errors++;
      continue;
    }
    if (parsed.match !== 'yes' || parsed.confidence < 0.7) {
      rejected++;
      continue;
    }
    const phenId = await lookupPhen(phenSlug);
    if (!phenId) { errors++; continue; }

    const { error } = await supabase.from('report_phenomena').upsert(
      {
        report_id: reportId,
        phenomenon_id: phenId,
        confidence: parsed.confidence,
        tagged_by: 'auto',
        is_primary: false, // secondary classification (existing primary stays)
      },
      { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true },
    );
    if (error) { errors++; continue; }
    linked++;
    phenIds.add(phenId);
  }
  return { linked, rejected, errors, phenIds };
}

async function recomputePhenomenaCounts(supabase: SupabaseClient, phenIds: Set<string>): Promise<void> {
  for (const phenId of phenIds) {
    const { data: junctions } = await supabase.from('report_phenomena').select('report_id').eq('phenomenon_id', phenId);
    const ids = (junctions || []).map(j => j.report_id);
    let approved = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { count } = await supabase.from('reports').select('*', { count: 'exact', head: true }).in('id', chunk).eq('status', 'approved');
      approved += count || 0;
    }
    await supabase.from('phenomena').update({ report_count: approved }).eq('id', phenId);
  }
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function processCategory(
  supabase: SupabaseClient,
  category: string,
  limit: number,
  dryRun: boolean,
  batchSize: number,
): Promise<void> {
  console.log('\n=== Category: ' + category + ' ===');
  console.log('Finding candidates (max ' + limit + ')...');
  const candidates = await findCandidates(supabase, category, limit);
  console.log('Found ' + candidates.length + ' candidates.');

  // Per-phenomenon breakdown
  const byPhen: Record<string, number> = {};
  for (const c of candidates) byPhen[c.matchedPhenomenon] = (byPhen[c.matchedPhenomenon] || 0) + 1;
  console.log('Per phenomenon:');
  for (const [p, n] of Object.entries(byPhen)) console.log('  ' + p.padEnd(28) + ' ' + n);

  if (dryRun) {
    console.log('--dry-run; skipping AI classification.');
    return;
  }

  if (candidates.length === 0) {
    console.log('No candidates to classify.');
    return;
  }

  // Submit in batches
  const allResults: any[] = [];
  for (let i = 0; i < candidates.length; i += batchSize) {
    const chunk = candidates.slice(i, i + batchSize);
    console.log('Submitting batch ' + (Math.floor(i / batchSize) + 1) + '/' + Math.ceil(candidates.length / batchSize) + ' (' + chunk.length + ' candidates)...');
    const batchId = await submitBatch(chunk);
    console.log('  batch_id: ' + batchId);
    console.log('  polling for completion (up to 1h)...');
    const results = await pollBatch(batchId);
    console.log('  got ' + results.length + ' results');
    allResults.push(...results);
  }

  // Apply — pass candidate list through so applyResults can look up
  // the matchedPhenomenon for each result by report_id.
  console.log('\nApplying results (drain-safe junction inserts)...');
  const { linked, rejected, errors, phenIds } = await applyResults(supabase, allResults, candidates);
  console.log('  linked:   ' + linked);
  console.log('  rejected: ' + rejected + ' (match=no or confidence<0.7)');
  console.log('  errors:   ' + errors);

  console.log('\nRecomputing report_count for ' + phenIds.size + ' affected phenomena...');
  await recomputePhenomenaCounts(supabase, phenIds);
  console.log('Done.');
}

async function main() {
  const args = parseArgs();
  if (!args.category && !args.all) {
    console.error('Must specify --category <name> or --all');
    console.error('Categories: ' + Object.keys(TARGETS).join(', '));
    process.exit(1);
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const cats = args.all ? Object.keys(TARGETS) : [args.category!];
  for (const cat of cats) {
    await processCategory(supabase, cat, args.limit, args.dryRun, args.batchSize);
  }

  console.log('\n=== All done ===');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
