#!/usr/bin/env tsx
/**
 * Priority-Category Classifier Re-pass (V11.17.19)
 *
 * V11.17.19 — --phenomena <slug1,slug2,...> flag for targeted sweeps.
 *   Builds a synthetic TARGETS subset with only the requested phens,
 *   then runs the standard processCategory loop. Lets us classify
 *   newly-added phenomena without re-spending on already-rejected
 *   candidates in the same category. Use when you've added a new phen
 *   or want to re-run a single phen with a tuned prompt.
 *
 * V11.17.18 — TARGETS audit fixes from V11.17.17 sweep postmortem:
 *   - witchcraft-practice → witchcraft (only real slug bug)
 *   - Expanded religion_mythology beyond exorcism (added demonic-possession,
 *     archangel-michael, djinn/jinn)
 *   - Re-bucketed tarot-reading from esoteric_practices → psychic_phenomena
 *     (matches actual DB category; was producing misleading log totals)
 *   - Re-bucketed sleep-paralysis + mandela-effect comment marker
 *     (slugs unchanged; DB category is psychological_experiences but TARGETS
 *     keeps perception_sensory grouping for thematic priority bucket)
 *
 * V11.17.17 — Bounded-parallel batch submission (default 8 in flight) +
 * incremental per-batch apply. Drops sequential 1900-candidate wall time
 * from ~95min to ~12min. Override concurrency with --parallel-batches N
 * (use 1 for legacy sequential behavior).
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
 *   # Force legacy sequential (1 batch in flight) for debugging
 *   tsx scripts/reclassify-priority-categories.ts --all --limit 1000 --parallel-batches 1
 *
 *   # Aggressive parallelism (only if your Anthropic workspace tolerates it)
 *   tsx scripts/reclassify-priority-categories.ts --all --limit 5000 --parallel-batches 16
 *
 *   # Targeted sweep on specific phenomena (V11.17.19) — avoids re-rejecting
 *   # already-classified candidates from other phens in the same category.
 *   tsx scripts/reclassify-priority-categories.ts \
 *     --phenomena witchcraft,demonic-possession,archangel-michael,djinn,tarot-reading \
 *     --limit 5000
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
    // V11.17.18 — re-bucketed from esoteric_practices. Actual DB category
    // is psychic_phenomena. The TARGETS bucket name now matches the
    // phenomenon's home category so log totals make sense.
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
    // V11.17.18 — added 3 more religion_mythology targets. Previously this
    // category had only exorcism; postmortem flagged the rest of the
    // category as unprocessed despite being a Chase priority.
    {
      slug: 'demonic-possession',
      name: 'Demonic Possession',
      keywords: ['demonic possession', 'possessed by a demon', 'demon possessed me', 'i was possessed', 'demonic entity took control'],
      evidenceRules: [
        'The narrator (or a person the narrator witnessed firsthand) experienced loss of bodily control attributed to a demonic or evil entity',
        'Often describes voice changes, involuntary movement, unfamiliar language, or extreme behavior',
        'NOT general mention of "feeling possessed by anger" or metaphorical possession',
        'NOT just witnessing an exorcism (those go to exorcism)',
      ],
      description: 'First-hand or close-witness experience of demonic possession with concrete behavioral phenomena',
    },
    {
      slug: 'archangel-michael',
      name: 'Archangel Michael',
      keywords: ['archangel michael', 'saint michael', 'st. michael the archangel', 'michael the archangel'],
      evidenceRules: [
        'The narrator describes an encounter, vision, or felt presence of Archangel Michael specifically',
        'May include protection request, sword/armor imagery, or named identification',
        'NOT generic angel encounters (those would go to angelic-encounter if it existed)',
      ],
      description: 'Encounter, vision, or felt presence identified specifically as Archangel Michael',
    },
    {
      slug: 'djinn',
      name: 'Djinn',
      keywords: ['djinn', 'jinn', 'i saw a genie', 'djinn possession', 'jinn attack', 'jinn entity'],
      evidenceRules: [
        'The narrator describes an encounter with or experience attributed to a djinn / jinn (Middle-Eastern / Islamic supernatural entity)',
        'Often references specific djinn behaviors (shapeshifting, fire/smoke association, contracts, household haunting)',
        'NOT general "genie in a lamp" pop-culture references',
      ],
      description: 'Encounter or experience attributed to djinn / jinn entities from Islamic / Middle-Eastern tradition',
    },
  ],

  // V11.17.39 (#107) — psychological_experiences was absent from TARGETS
  // entirely, so 273 reports in this category got skipped by every
  // re-classification sweep. Audit of 50-report sample showed three
  // gaps:
  //
  //   1. ~42% are genuine NDE/OBE/STE content (NDERF+OBERF source)
  //      that the existing slugs (near-death-experience, distressing-nde,
  //      sudden-obe, spiritually-transformative-experience) already
  //      cover — they were just never run through the classifier.
  //   2. ~46% are Reddit reports describing synchronicity / manifestation
  //      / vanishing-object phenomena that DIDN'T have phenomenon slugs
  //      until the 20260527 migration added them.
  //   3. ~12% are mis-tagged (UFO/ghost reports filed as psychological).
  //      Those move to the right categories via scripts/recategorize-
  //      mistagged-psychological.ts; not the classifier's problem.
  //
  // Note: the script's findCandidates() pre-filters on
  // source_type='reddit', so this TARGETS entry only processes Reddit
  // psychological_experiences reports. NDERF/OBERF rows route through
  // the orchestrator's Stage D classifier (separate code path).
  psychological_experiences: [
    {
      slug: 'synchronicity',
      name: 'Synchronicity',
      keywords: ['synchronicity', 'meaningful coincidence', 'just as i was thinking', 'right when i', 'no way that was a coincidence', 'the universe sent', 'cosmic timing', 'thought of them and they', 'sign from'],
      evidenceRules: [
        'The narrator describes a specific event that coincides with an inner state (thought, desire, dream) in a way they find meaningful',
        'The two events are connected by timing or content, not causally',
        'NOT generic "weird coincidence" without internal-state anchor',
      ],
      description: 'Meaningful coincidence between an inner state and an external event, experienced as a sign or affirmation',
    },
    {
      slug: 'manifestation-experience',
      name: 'Manifestation Experience',
      keywords: ['i manifested', 'manifestation worked', 'thought it into existence', 'visualized it and', 'asked the universe', 'law of attraction worked', 'spoke it into reality'],
      evidenceRules: [
        'The narrator describes a specific intention, desire, or thought followed by a corresponding physical event',
        'The narrator interprets the sequence as causal (intention → outcome) rather than coincidence',
        'NOT general self-improvement or goal-setting narratives',
      ],
      description: 'A specific intention or thought reported as preceding a corresponding physical event in a way that defies coincidence',
    },
    {
      slug: 'vanishing-object',
      name: 'Vanishing or Appearing Object',
      keywords: ['object vanished', 'object disappeared', 'it wasnt there and then it was', 'appeared out of nowhere', 'reappeared after months', 'apport', 'returned to me', 'lost and then found in impossible'],
      evidenceRules: [
        'A physical object disappeared from one place AND/OR appeared in another without intermediate handling',
        'The narrator can rule out normal explanations (misplacement, other people moving it)',
        'NOT general "I forgot where I put it" narratives',
      ],
      description: 'A physical object that disappears, appears, or returns in a way that defies conventional explanation',
    },
    {
      slug: 'near-death-experience',
      name: 'Near-Death Experience',
      keywords: ['near death experience', 'nde', 'i died and came back', 'tunnel of light', 'life review', 'met deceased loved ones', 'clinically dead', 'flatlined', 'crossed over'],
      evidenceRules: [
        'The narrator was in a medically life-threatening situation (cardiac arrest, severe trauma, surgical complication)',
        'Reports anomalous perceptions during the crisis (tunnel, light, OBE, life review, deceased meeting, peace, return point)',
        'NOT a non-medical OBE (those go to out-of-body-experience or sudden-obe)',
      ],
      description: 'Anomalous experience during a medically critical event, often including tunnel/light/OBE/life-review elements',
    },
    {
      slug: 'sudden-obe',
      name: 'Sudden Out-of-Body Experience',
      keywords: ['suddenly out of body', 'floated out of my body', 'looking down at myself', 'saw myself from above', 'spontaneous obe', 'unexpectedly left my body'],
      evidenceRules: [
        'The narrator unintentionally found themselves observing from outside their body',
        'NOT triggered by a medical crisis (those go to near-death-experience)',
        'NOT a deliberate astral projection practice (those go to astral-projection)',
      ],
      description: 'Spontaneous, non-medical, non-deliberate out-of-body experience',
    },
    {
      slug: 'spiritually-transformative-experience',
      name: 'Spiritually Transformative Experience',
      keywords: ['spiritually transformative', 'changed my life forever', 'spiritual awakening', 'felt one with everything', 'unity experience', 'cosmic consciousness'],
      evidenceRules: [
        'The narrator describes a discrete experience that produced lasting changes in worldview, beliefs, or values',
        'Often involves felt unity, dissolution of self, encounter with the sacred',
        'NOT a gradual change over time — must be a discrete experience',
      ],
      description: 'A discrete experience that produced lasting changes in worldview, often involving felt unity or encounter with the sacred',
    },
    {
      slug: 'deja-vu',
      name: 'Deja Vu Phenomenon',
      keywords: ['deja vu', 'lived this before', 'i have been here before', 'already seen this exact', 'replay of a moment'],
      evidenceRules: [
        'The narrator describes a specific experience of having lived a moment before in unusual specificity (beyond brief familiarity)',
        'Often a prolonged or intense episode, not a fleeting one',
        'NOT generic "this feels familiar"',
      ],
      description: 'Strong experience of having lived a specific moment before, with unusual specificity or duration',
    },
    {
      slug: 'time-slip',
      name: 'Time Slip',
      keywords: ['time slip', 'time skipped', 'lost time', 'missing time', 'felt like i was in another era', 'walked into another time', 'time stood still'],
      evidenceRules: [
        'The narrator describes a discrete episode where their experience of time deviated from clock time (acceleration, gap, era-shift)',
        'Often accompanied by environmental cues that fit a different era',
        'NOT general "time flew" feelings',
      ],
      description: 'Discrete experience where personal time-perception deviated from external time, sometimes including era-shift environmental cues',
    },
    {
      slug: 'anomalous-memory',
      name: 'Anomalous Memory',
      keywords: ['anomalous memory', 'memory of something that never happened', 'remember something different', 'shared false memory', 'mandela effect of one person'],
      evidenceRules: [
        'The narrator has a clear specific memory that conflicts with established fact or other witnesses',
        'NOT a general "I might have misremembered" — must be specific + confident',
        'NOT Mandela Effect (group-level shared discrepancy — goes to mandela-effect)',
      ],
      description: 'Specific personal memory that conflicts with established fact or other witnesses',
    },
    {
      slug: 'tulpamancy',
      name: 'Tulpamancy',
      keywords: ['tulpa', 'tulpamancy', 'tulpamancer', 'created an imaginary companion', 'host and tulpa', 'imposition'],
      evidenceRules: [
        'The narrator describes intentionally creating a sentient mental companion (tulpa) through practice',
        'Often references specific techniques (forcing, narration, imposition) or community vocabulary',
        'NOT general imaginary friends or DID',
      ],
      description: 'Deliberate creation of a sentient mental companion (tulpa) through focused practice',
    },
  ],

  esoteric_practices: [
    {
      slug: 'ouija-board',
      name: 'Ouija Board',
      // V11.17.39 — expanded keyword list (#71 fix). Previously only
      // ['ouija', 'spirit board', 'planchette', 'talking board'] which
      // missed many real reports that say "ouija board" (specific phrase)
      // or describe planchette movement without using the brand name.
      // Audit verified pre-filter searches description column only, so
      // adding more synonyms improves recall meaningfully.
      keywords: ['ouija', 'ouija board', 'spirit board', 'spirit-board', 'planchette', 'planchette moved', 'talking board', 'witchboard', 'witch board', 'glass divination', 'glass moved on its own'],
      evidenceRules: [
        'The narrator used a Ouija board or spirit board to attempt communication',
        'Often describes specific phenomena occurring during use (planchette movement, responses)',
        'NOT just hearing about Ouija boards in general',
      ],
      description: 'Use of a Ouija board or spirit board for attempted contact, with experienced phenomena',
    },
    // V11.17.18 — slug fix: 'witchcraft-practice' was missing from DB.
    // Actual slug is 'witchcraft'. Previously this entry was silently
    // skipped at candidate-finding, costing $0 but missing all potential
    // surfacing from witchcraft-keyword reports.
    {
      slug: 'witchcraft',
      name: 'Witchcraft',
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
  parallelBatches: number;  // V11.17.17 — concurrent Anthropic batches in flight (1 = sequential = legacy)
  phenomena: string[] | null;  // V11.17.19 — narrow sweep to specific phenomenon slugs (comma-separated)
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  function flag(name: string, def: string | null = null): string | null {
    const idx = argv.indexOf(name);
    return idx < 0 ? def : argv[idx + 1];
  }
  const phenomenaRaw = flag('--phenomena');
  return {
    category: flag('--category'),
    all: argv.indexOf('--all') >= 0,
    limit: parseInt(flag('--limit', '500') || '500'),
    dryRun: argv.indexOf('--dry-run') >= 0,
    batchSize: parseInt(flag('--batch-size', '100') || '100'),
    parallelBatches: parseInt(flag('--parallel-batches', '8') || '8'),
    phenomena: phenomenaRaw ? phenomenaRaw.split(',').map(s => s.trim()).filter(Boolean) : null,
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
      // V11.17.39 — search BOTH title and description (#71 fix).
      // Previously only `description` was filtered, so reports that
      // mentioned the phenomenon in the title with a sparse body got
      // dropped from the candidate pool. With Reddit reports especially,
      // titles often carry the strongest signal.
      const kwPattern = '%' + keyword + '%';
      const { data: matches } = await supabase
        .from('reports')
        .select('id, slug, title, description')
        .eq('source_type', 'reddit')
        .eq('status', 'approved')
        .or('description.ilike.' + kwPattern + ',title.ilike.' + kwPattern)
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
  parallelBatches: number,
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

  // V11.17.17 — bounded-parallel batch submission + incremental apply.
  //
  // OLD behavior (parallelBatches=1): submit → poll → apply → submit next.
  //   At 5min/batch × 19 batches = ~95min for a 1900-candidate category.
  //
  // NEW behavior (parallelBatches=8 default): up to 8 batches in flight,
  //   each pipeline = submit → poll → apply (incremental). When one closes
  //   we immediately submit the next chunk. Total wall time approaches
  //   N/parallelBatches × per-batch latency (5min × 19/8 ≈ 12min).
  //
  // Anthropic Batch API tolerates many concurrent batches per workspace;
  // 8 is a conservative default. Override with --parallel-batches.
  //
  // Drain-safe: applyResults is the same per-batch path used by the old
  // serial loop. Junction inserts are idempotent (upsert ignoreDuplicates).

  const chunks: Candidate[][] = [];
  for (let i = 0; i < candidates.length; i += batchSize) {
    chunks.push(candidates.slice(i, i + batchSize));
  }
  const totalChunks = chunks.length;
  console.log('\nProcessing ' + totalChunks + ' batches with up to ' + parallelBatches + ' in flight...');

  let totalLinked = 0, totalRejected = 0, totalErrors = 0;
  const phenIds = new Set<string>();
  let nextChunkIdx = 0;
  let completedCount = 0;

  // Each in-flight pipeline: submit → poll → apply → resolve.
  async function pipelineOne(chunkIdx: number, chunk: Candidate[]): Promise<void> {
    const label = '[batch ' + (chunkIdx + 1) + '/' + totalChunks + ']';
    console.log(label + ' submitting ' + chunk.length + ' candidates...');
    const batchId = await submitBatch(chunk);
    console.log(label + ' submitted: ' + batchId);
    const results = await pollBatch(batchId);
    console.log(label + ' got ' + results.length + ' results, applying...');
    const stats = await applyResults(supabase, results, chunk);
    totalLinked += stats.linked;
    totalRejected += stats.rejected;
    totalErrors += stats.errors;
    for (const pid of stats.phenIds) phenIds.add(pid);
    completedCount++;
    console.log(label + ' done: linked=' + stats.linked + ' rejected=' + stats.rejected + ' errors=' + stats.errors +
      ' | running totals: linked=' + totalLinked + ' rejected=' + totalRejected + ' (' + completedCount + '/' + totalChunks + ' batches)');
  }

  // Bounded-concurrency pool: maintain up to N in-flight promises.
  // When any resolves, submit the next chunk until candidates exhausted.
  const inFlight = new Set<Promise<void>>();
  while (nextChunkIdx < totalChunks || inFlight.size > 0) {
    while (inFlight.size < parallelBatches && nextChunkIdx < totalChunks) {
      const idx = nextChunkIdx++;
      const p = pipelineOne(idx, chunks[idx]).catch((err) => {
        console.error('[batch ' + (idx + 1) + '] FAILED: ' + (err?.message || err));
        totalErrors += chunks[idx].length;
      }).finally(() => { inFlight.delete(p); });
      inFlight.add(p);
    }
    if (inFlight.size > 0) await Promise.race(inFlight);
  }

  console.log('\nCategory ' + category + ' totals:');
  console.log('  linked:   ' + totalLinked);
  console.log('  rejected: ' + totalRejected + ' (match=no or confidence<0.7)');
  console.log('  errors:   ' + totalErrors);

  console.log('\nRecomputing report_count for ' + phenIds.size + ' affected phenomena...');
  await recomputePhenomenaCounts(supabase, phenIds);
  console.log('Done.');
}

async function main() {
  const args = parseArgs();
  if (!args.category && !args.all && !args.phenomena) {
    console.error('Must specify --category <name>, --all, or --phenomena <slug1,slug2,...>');
    console.error('Categories: ' + Object.keys(TARGETS).join(', '));
    process.exit(1);
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // V11.17.19 — --phenomena slug-filter: build a synthetic TARGETS subset
  // containing only the requested phenomena (grouped by their natural cat).
  // The script's processCategory loop runs unchanged against this subset;
  // when the bucket has only one phen, perPhenLimit = totalLimit (no math
  // weirdness). Lets us target newly-added phens without paying to re-reject
  // already-classified ones in the same category.
  if (args.phenomena) {
    const requested = new Set(args.phenomena);
    const matched: Record<string, PhenomenonTarget[]> = {};
    const seenSlugs: Set<string> = new Set();
    for (const [cat, phens] of Object.entries(TARGETS)) {
      for (const p of phens) {
        if (requested.has(p.slug)) {
          if (!matched[cat]) matched[cat] = [];
          matched[cat].push(p);
          seenSlugs.add(p.slug);
        }
      }
    }
    const missing = args.phenomena.filter(s => !seenSlugs.has(s));
    if (missing.length > 0) {
      console.warn('WARN: --phenomena slugs not found in TARGETS: ' + missing.join(', '));
    }
    if (seenSlugs.size === 0) {
      console.error('No requested phenomena matched any TARGETS entry. Available slugs:');
      for (const phens of Object.values(TARGETS)) for (const p of phens) console.error('  ' + p.slug);
      process.exit(1);
    }
    // Replace global TARGETS with the filtered subset so processCategory
    // (which references TARGETS by category key) sees only requested phens.
    for (const k of Object.keys(TARGETS)) delete (TARGETS as any)[k];
    for (const [k, v] of Object.entries(matched)) (TARGETS as any)[k] = v;
    console.log('Run config: --phenomena filter active — ' + seenSlugs.size + ' phens across ' + Object.keys(matched).length + ' cats');
  }

  const cats = args.phenomena ? Object.keys(TARGETS) : (args.all ? Object.keys(TARGETS) : [args.category!]);
  console.log('Run config: cats=' + cats.join(',') + ' limit=' + args.limit +
    ' batchSize=' + args.batchSize + ' parallelBatches=' + args.parallelBatches +
    (args.dryRun ? ' (dry-run)' : ''));
  for (const cat of cats) {
    await processCategory(supabase, cat, args.limit, args.dryRun, args.batchSize, args.parallelBatches);
  }

  console.log('\n=== All done ===');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
