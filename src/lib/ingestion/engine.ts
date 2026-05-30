// Ingestion Engine - orchestrates the scraping pipeline

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DataSource, IngestionJob, ScrapedReport } from './types';
import { getAdapter } from './adapters';
import {
  assessQuality,
  getStatusFromScore,
  improveTitleWithAI,
  getSourceLabel,
  isObviouslyLowQuality,
  smartReEvaluate,
} from './filters';
import { stripThirdPersonFraming } from './filters/title-improver';
import { generateAndSaveFeedHook } from '../services/feed-hook.service';
import { generateAndSaveParadocsAnalysis } from '../services/paradocs-analysis.service';
import { generateAndSaveAnswerLine } from '../services/answer-line.service';
import { generateAndSaveWitnessProfile } from '../services/witness-profile.service';
import { generateCompellingTitle } from '../services/compelling-title.service';
// V11.17.52 — centralized post-insert location safety net (Manipur
// incident: Reddit-sourced report with country in the title shipped
// with NULL location_name because the Reddit adapter doesn't run
// NLP extraction). Service is best-effort + non-blocking.
import { extractAndGeocodeLocation } from '../services/location-extraction.service';
import { generateAndSaveConsolidatedAI, isConsolidatedAIEnabled } from '../services/consolidated-ai.service';
import { embedReport } from '../services/embedding.service';
import { enrichReport } from './enrichment/report-enricher';
import { checkForDuplicate, DedupCandidate } from './dedup';
import { processMediaItem } from './media-storage';
import { getMediaPolicy } from './media-policy';
import {
  validateReportBeforeInsert,
  ValidationFlag,
} from './utils/validate-report';
import { redactReportPii } from './utils/redact-pii';
import {
  normalizeLocation,
  geocodeWithFallback,
  makeSupabaseGeocodeCache,
} from './utils/normalize-location';
import { escalateDateWithHaiku } from './utils/escalate-date-haiku';

// Phenomenon pattern matching for auto-identification during ingestion
interface PhenomenonPattern {
  id: string;
  name: string;
  category: string;
  patterns: string[];
}

let cachedPhenomena: PhenomenonPattern[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// V11.17.13 — withTimeout wrapper for best-effort post-insert calls.
// Some Haiku/network calls have hung indefinitely in smoke runs (the
// witness-profile, anchor-case, and push-copy paths). A hung call must
// never block ingestion. This races the promise against a setTimeout
// and rejects on whichever wins, so the caller's try/catch can log +
// skip just like any other failure mode.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>(function (_, reject) {
      setTimeout(function () { reject(new Error('Timed out after ' + ms + 'ms: ' + label)); }, ms);
    }),
  ]);
}

// Get phenomena patterns with caching
async function getPhenomenaPatterns(supabase: SupabaseClient): Promise<PhenomenonPattern[]> {
  if (cachedPhenomena && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedPhenomena;
  }

  const { data: phenomena } = await supabase
    .from('phenomena')
    .select('id, name, aliases, category')
    .eq('status', 'active');

  cachedPhenomena = (phenomena || []).map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    patterns: [
      p.name.toLowerCase(),
      ...(p.aliases || []).map((a: string) => a.toLowerCase())
    ].filter(Boolean)
  }));
  cacheTimestamp = Date.now();

  return cachedPhenomena;
}

// Escape regex special characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Check if report category aligns with phenomenon category
function isCategoryMatch(reportCategory: string, phenomenonCategory: string): boolean {
  const mapping: Record<string, string[]> = {
    'cryptids': ['cryptid', 'creature', 'monster'],
    'ufos_aliens': ['ufo', 'uap', 'alien', 'extraterrestrial'],
    'ghosts_hauntings': ['ghost', 'haunting', 'spirit', 'paranormal'],
    'psychic_phenomena': ['psychic', 'esp', 'telepathy', 'paranormal'],
    'psychological_experiences': ['unexplained', 'strange', 'mysterious'],
  };

  const phenomenonKeys = mapping[phenomenonCategory] || [];
  const reportCategoryLower = (reportCategory || '').toLowerCase();

  return phenomenonKeys.some(key => reportCategoryLower.includes(key)) ||
         reportCategoryLower.includes(phenomenonCategory);
}

// Resolve reports.phenomenon_type_id deterministically from the adapter's
// declared experienceTypeSlug (set by NDERF + OBERF adapters via
// metadata.experienceTypeSlug). This is belt-and-suspenders alongside the
// pattern matcher below: the matcher only fires if the narrative happens
// to contain the encyclopedia entry's name or aliases, and sparse/narrative-
// less rows would otherwise stay unclassified. This function runs first;
// the pattern matcher can still create additional report_phenomena links.
//
// Returns the resolved phenomenon_type_id, or null if the slug is absent or
// not registered in phenomenon_types (e.g. migration not yet applied).
async function resolvePhenomenonTypeBySlug(
  supabase: SupabaseClient,
  slug: string | undefined | null,
): Promise<string | null> {
  if (!slug || typeof slug !== 'string') return null;
  const { data, error } = await supabase
    .from('phenomenon_types')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

// Link a freshly inserted report to its canonical encyclopedia entry based on
// experienceTypeSlug, so "related reports" on the encyclopedia page resolves
// immediately — without waiting for the name/alias pattern matcher to fire.
// Idempotent via the (report_id, phenomenon_id) unique constraint.
async function linkReportToCanonicalPhenomenonBySlug(
  supabase: SupabaseClient,
  reportId: string,
  slug: string | undefined | null,
): Promise<boolean> {
  if (!slug) return false;
  const { data: phen, error } = await supabase
    .from('phenomena')
    .select('id')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !phen) return false;
  const { error: upsertError } = await supabase
    .from('report_phenomena')
    .upsert(
      {
        report_id: reportId,
        phenomenon_id: phen.id,
        confidence: 0.95, // high — came from adapter's explicit type assignment
        tagged_by: 'auto',
      },
      { onConflict: 'report_id,phenomenon_id', ignoreDuplicates: true },
    );
  if (upsertError) return false;

  // T1.6 — lazy image auto-sourcing on first report-tag. Fire-and-
  // forget: if this is the phenomenon's first tagged report and it
  // has no image yet, mark it for the next image-search cron pass.
  // Non-blocking — never let image enrichment fail an ingestion.
  enqueueImageSearchIfNeeded(supabase, phen.id).catch(function (err) {
    console.log('[Ingestion] enqueueImageSearchIfNeeded error (non-fatal):', err);
  });

  return true;
}

// T1.6 — mark a phenomenon as needing an image search if it currently
// has no primary image AND no prior search status. Uses
// profile_review_status='pending_search' as a queue marker; the
// existing auto-search-profile-images endpoint already selects
// phenomena with `primary_image_url IS NULL`, so 'pending_search' rows
// are processed by the same job. On a successful search, the endpoint
// overwrites the status with 'unreviewed' for admin approval in
// /admin/media-review.
//
// Follow-up infrastructure (tracked separately): a periodic cron entry
// that calls auto-search-profile-images via CRON_SECRET auth so this
// queue actually drains without manual admin action. Until that lands,
// this helper still produces useful state (admin can see queued items
// in /admin/media-review filtered by status) and the engine-side
// contract is correct.
async function enqueueImageSearchIfNeeded(
  supabase: SupabaseClient,
  phenomenonId: string,
): Promise<void> {
  try {
    const { data: phen, error } = await supabase
      .from('phenomena')
      .select('id, name, primary_image_url, profile_review_status')
      .eq('id', phenomenonId)
      .maybeSingle();
    if (error || !phen) return;

    // Already has an image, OR already searched (unreviewed/approved/
    // denied/pending_search): nothing to do.
    if (phen.primary_image_url) return;
    if (phen.profile_review_status) return;

    // Race-safe marker: only update if status is still null.
    await supabase
      .from('phenomena')
      .update({
        profile_review_status: 'pending_search',
        updated_at: new Date().toISOString(),
      })
      .eq('id', phenomenonId)
      .is('profile_review_status', null);

    console.log('[Ingestion] enqueued image search for phenomenon:', phen.name);
  } catch (err) {
    // Non-fatal — image enrichment is not core ingestion
    console.log('[Ingestion] enqueueImageSearchIfNeeded failed:', err);
  }
}

// Pattern-match a single report to phenomena (lightweight, no AI)
// B0.3.x — stopword list for the pattern matcher. Any phenomenon name
// or alias matching one of these (case-insensitive) is rejected as a
// pattern because it would fire on common English narrative usage and
// produce false-positive tag links. This protects ingestion quality
// downstream of the SQL-side alias cleanup. The SQL cleanup removes
// these from `phenomena.aliases`, but the matcher also uses `name` as
// a pattern, and we don't want to rename phenomena just to dodge
// matcher behavior. Filter here so the systemic fix is at the right
// layer.
//
// Adding more stopwords: keep lowercase. Anything < 5 characters that
// is a real English word, or any single common noun, is a strong
// candidate.
const MATCHER_STOPWORDS = new Set<string>([
  // Common English words ≤ 4 chars
  'did', 'was', 'has', 'had', 'can', 'may', 'our', 'out', 'all',
  'and', 'are', 'but', 'for', 'his', 'her', 'him', 'one', 'two',
  'now', 'new', 'use', 'see', 'top', 'won', 'win', 'run', 'put',
  'got', 'big', 'box', 'low', 'old', 'any', 'its', 'too',
  // Common single-word nouns/adjectives that narratives use generically
  'light', 'dark', 'sound', 'voice', 'dream', 'vision', 'ghost',
  'spirit', 'soul', 'mind', 'body', 'field', 'focus', 'focusing',
  'breath', 'energy', 'force', 'wave', 'peace', 'love', 'faith',
  'hope', 'fear', 'time', 'space', 'flow', 'fire', 'water', 'earth',
  'wind', 'healing', 'balance', 'awakening', 'awareness', 'presence',
  'consciousness', 'enlightenment', 'transcendence', 'magic', 'witch',
  'meditation', 'prayer', 'intuition', 'silence', 'calm', 'death',
  'life', 'contact', 'reading', 'channel', 'channeling',
  // Multi-word phrases that are still over-broad
  'fragmented consciousness', 'plural identity',
]);

function isMatcherSafePattern(pattern: string | null | undefined): boolean {
  if (!pattern) return false;
  const trimmed = pattern.trim();
  if (trimmed.length === 0) return false;

  // FIRST: stopword check, case-insensitive. This catches "DID" which
  // would otherwise pass the acronym rule below. Any word in the stop
  // list is rejected regardless of casing.
  if (MATCHER_STOPWORDS.has(trimmed.toLowerCase())) return false;

  // SECOND: length-based heuristic for things NOT in the stopword list.
  // 4 chars or fewer is risky territory because of word-boundary
  // collisions with common English. Exception: pure-uppercase acronyms
  // (3+ chars) signal the user typed it AS an acronym — case-insensitive
  // regex will still match lowercase occurrences in narrative, but
  // narratives that contain "NDE" / "OBE" / "ESP" in uppercase are
  // strong signal regardless. Without this exception, we'd reject all
  // the legitimate experiencer-acronym aliases.
  if (trimmed.length <= 4) {
    if (trimmed === trimmed.toUpperCase() && /^[A-Z]+$/.test(trimmed) && trimmed.length >= 3) {
      return true;
    }
    return false;
  }

  return true;
}

async function identifyPhenomenaForReport(
  supabase: SupabaseClient,
  reportId: string,
  title: string,
  summary: string,
  description: string,
  category: string
): Promise<number> {
  const phenomena = await getPhenomenaPatterns(supabase);
  if (phenomena.length === 0) return 0;

  const searchText = [title || '', summary || '', description || ''].join(' ').toLowerCase();
  const matches: { phenomenonId: string; confidence: number }[] = [];

  for (const phenomenon of phenomena) {
    for (const pattern of phenomenon.patterns) {
      // B0.3.x — skip patterns that would cause false positives on
      // common English usage. Without this guard, "Focusing" the
      // phenomenon name fires on any "focusing on my breath" type
      // narrative, "Light Adaptation" fires on any "bright light",
      // and a phenomenon with alias "DID" tags every report where
      // the narrator says "I did X".
      if (!isMatcherSafePattern(pattern)) continue;

      const regex = new RegExp(`\\b${escapeRegex(pattern)}\\b`, 'i');
      if (regex.test(searchText)) {
        let confidence = 0.6;

        if (regex.test((title || '').toLowerCase())) {
          confidence = 0.85;
        } else if (regex.test((summary || '').toLowerCase())) {
          confidence = 0.75;
        }

        if (isCategoryMatch(category, phenomenon.category)) {
          confidence = Math.min(confidence + 0.1, 0.95);
        }

        matches.push({ phenomenonId: phenomenon.id, confidence });
        break;
      }
    }
  }

  // Insert links (ignore duplicates)
  let linked = 0;
  for (const match of matches) {
    const { error } = await supabase
      .from('report_phenomena')
      .upsert({
        report_id: reportId,
        phenomenon_id: match.phenomenonId,
        confidence: match.confidence,
        tagged_by: 'auto',
      }, {
        onConflict: 'report_id,phenomenon_id',
        ignoreDuplicates: true,
      });

    if (!error) {
      linked++;
      // T1.6 — same lazy image search hook as the canonical-slug path.
      // Fire-and-forget; never block ingestion on enrichment.
      enqueueImageSearchIfNeeded(supabase, match.phenomenonId).catch(function (err) {
        console.log('[Ingestion] enqueueImageSearchIfNeeded error (non-fatal):', err);
      });
    }
  }

  // Also set phenomenon_type_id on the report via the linked phenomenon's own type.
  // reports.phenomenon_type_id FK -> phenomenon_types table, so we need to resolve
  // the phenomena entry's phenomenon_type_id rather than using the phenomena ID directly.
  if (matches.length > 0) {
    const best = matches.reduce((a, b) => a.confidence > b.confidence ? a : b);
    if (best.confidence >= 0.6) {
      const { data: phenRecord } = await supabase
        .from('phenomena')
        .select('phenomenon_type_id')
        .eq('id', best.phenomenonId)
        .single();

      if (phenRecord && phenRecord.phenomenon_type_id) {
        await supabase
          .from('reports')
          .update({ phenomenon_type_id: phenRecord.phenomenon_type_id })
          .eq('id', reportId)
          .is('phenomenon_type_id', null); // Don't overwrite manual assignments
      }
    }
  }

  return linked;
}

// Initialize Supabase client with service role for server-side operations
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Logging helper for activity feed
type LogLevel = 'info' | 'warning' | 'error' | 'success';

async function logActivity(
  supabase: SupabaseClient,
  sourceId: string | null,
  jobId: string | null,
  level: LogLevel,
  message: string,
  metadata?: Record<string, unknown>
) {
  try {
    await supabase.from('ingestion_logs').insert({
      source_id: sourceId,
      job_id: jobId,
      level,
      message,
      metadata: metadata || {}
    });
  } catch (error) {
    // Silently fail if logs table doesn't exist yet
    console.log(`[Log] ${level}: ${message}`, metadata || '');
  }
}

export interface IngestionResult {
  success: boolean;
  jobId: string;
  recordsFound: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsRejected: number;        // Failed quality filter
  recordsPendingReview: number;   // Sent to review queue
  recordsQuarantined?: number;    // V10.8.D — failed validateReportBeforeInsert (errors)
  recordsWithWarnings?: number;   // V10.8.D — inserted but emitted ≥1 warning
  phenomenaLinked: number;        // Reports linked to phenomena
  error?: string;
  duration: number;
}

// V10.8.D — write a batch of validation flags to ingestion_audit. One
// row per flag, identical shape across warnings and errors. Best-effort:
// audit-log failure must never block ingestion (we still have the row).
async function recordIngestionAudit(
  supabase: SupabaseClient,
  reportId: string | null,
  adapterName: string,
  flags: ValidationFlag[],
): Promise<void> {
  if (!flags.length) return;
  try {
    const rows = flags.map(f => ({
      report_id: reportId,
      adapter: adapterName,
      severity: f.severity,
      code: f.code,
      message: f.message,
      field: f.field || null,
      payload: f.payload || null,
    }));
    await supabase.from('ingestion_audit').insert(rows);
  } catch (auditError) {
    // Silently swallow — audit-log failure isn't actionable here.
    console.log('[Ingestion] ingestion_audit insert failed (non-fatal):', auditError);
  }
}

// Adapters that set has_photo_video flag + link to source instead of storing media.
// These adapters intentionally return no media array — don't override their flag.
var LINK_ONLY_SOURCES = ['bfro', 'nuforc', 'nderf'];

// Generate a URL-safe slug from title with guaranteed uniqueness
function generateSlug(title: string, originalReportId: string, sourceType: string): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);

  // Create a unique hash from source_type + original_report_id
  // This ensures the same report always gets the same slug
  const uniqueKey = `${sourceType}-${originalReportId}`;
  let hash = 0;
  for (let i = 0; i < uniqueKey.length; i++) {
    const char = uniqueKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const hashStr = Math.abs(hash).toString(36).substring(0, 8);

  return `${baseSlug}-${hashStr}`;
}

export async function runIngestion(sourceId: string, limit: number = 100): Promise<IngestionResult> {
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  // Create a job record
  const { data: job, error: jobError } = await supabase
    .from('ingestion_jobs')
    .insert({
      source_id: sourceId,
      status: 'running',
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (jobError || !job) {
    return {
      success: false,
      jobId: '',
      recordsFound: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsRejected: 0,
      recordsPendingReview: 0,
      phenomenaLinked: 0,
      error: `Failed to create job: ${jobError?.message}`,
      duration: Date.now() - startTime
    };
  }

  try {
    // Get the data source configuration
    const { data: source, error: sourceError } = await supabase
      .from('data_sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (sourceError || !source) {
      throw new Error(`Source not found: ${sourceError?.message}`);
    }

    // Check if source is active
    if (!source.is_active) {
      throw new Error('Source is not active');
    }

    // Get the appropriate adapter
    const adapter = getAdapter(source.adapter_type);
    if (!adapter) {
      throw new Error(`No adapter found for type: ${source.adapter_type}`);
    }

    // Log start of ingestion
    await logActivity(supabase, sourceId, job.id, 'info', `Starting ingestion`, {
      adapter: source.adapter_type,
      limit
    });

    // Run the scraper
    const result = await adapter.scrape(source.scrape_config || {}, limit);

    if (!result.success) {
      throw new Error(result.error || 'Scrape failed');
    }

    // Log scrape completion
    await logActivity(supabase, sourceId, job.id, 'info', `Scraped ${result.reports.length} reports`, {
      reportsFound: result.reports.length
    });

    // Process and insert the reports with quality filtering
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let rejected = 0;
    let pendingReview = 0;
    let phenomenaLinked = 0;
    // V10.8.D — quarantine counters. A row is quarantined when
    // validateReportBeforeInsert returns ≥1 error: it still inserts
    // (so /admin/quarantine can triage it) but with status='quarantine'.
    let quarantined = 0;
    let withWarnings = 0;
    var rejectedDetails: Array<{ title: string; reason: string; descLength: number }> = [];

    for (const report of result.reports) {
      try {
        // V11.9 — PII redaction. Runs FIRST in the per-report pipeline
        // so every downstream consumer (quality filter, scorer,
        // enricher, Haiku, Sonnet, DB insert) sees redacted text. A
        // single source of truth — the redacted body — flows through
        // the entire system. Smoke #8 surfaced the leak: a Reddit
        // body contained the witness's childhood address ("1721 Fern
        // Avenue") and it surfaced verbatim on the live report page.
        // Categories scrubbed: US street addresses, phone numbers,
        // emails, SSN-like sequences. Name redaction is handled
        // separately by stripExperiencerNames in paradocs-analysis
        // because it needs source-metadata context.
        var piiResult = redactReportPii(report);
        if (piiResult.redactedCount > 0) {
          console.log(
            '[Ingestion] PII redacted from "' + (report.title || '').substring(0, 40) +
            '...": ' + piiResult.redactedCount + ' instance(s) ' +
            '[' + piiResult.types.join(', ') + '] in fields [' +
            piiResult.fields.join(', ') + ']'
          );
        }

        // Quick rejection for obviously low quality content
        if (isObviouslyLowQuality(report.title, report.description)) {
          console.log(`[Ingestion] Quick reject: "${report.title.substring(0, 40)}..." (obviously low quality)`);
          rejectedDetails.push({ title: report.title, reason: 'obviously low quality', descLength: (report.description || '').length });
          rejected++;
          continue;
        }

        // Enrich report: extract missing dates/locations from text, geocode
        // Runs BEFORE quality scoring so enriched data improves the score
        // NEVER fabricates data — only extracts clearly stated info
        try {
          await enrichReport(report);
        } catch (enrichError) {
          // Enrichment failure should never block ingestion
          console.log('[Ingestion] Enrichment error (non-fatal):', enrichError);
        }

        // V10.8.E — Haiku date escalation. Runs only when the row
        // currently has precision='year' AND the prose contains a
        // recognizable month name. Costs ~$0.001 per qualifying row;
        // the pre-flight gate skips everything that wouldn't benefit
        // so this is a no-op for rows with already-exact dates.
        // Claim-checked output prevents fabrication: every span in
        // the model's response must appear verbatim in the source.
        try {
          if ((report as any).event_date_precision === 'year' && report.description) {
            const escalation = await escalateDateWithHaiku(
              report.description,
              {
                date: (report as any).event_date || null,
                precision: 'year',
                source: ((report as any).event_date_extracted_from as any) || 'prose-year',
              },
            );
            if (escalation.escalated && escalation.result.date) {
              (report as any).event_date = escalation.result.date;
              (report as any).event_date_precision = escalation.result.precision;
              (report as any).event_date_extracted_from = 'haiku';
              console.log(
                '[Ingestion] Haiku date upgrade: "' + report.title.substring(0, 30) + '" → ' +
                escalation.result.date + ' (' + escalation.result.precision + ')',
              );
            }
          }
        } catch (escErr) {
          // Date escalation failure must never block ingestion.
          console.log('[Ingestion] Haiku date escalation failed (non-fatal):', escErr);
        }

        // Full quality assessment (now scores the enriched report)
        const qualityResult = assessQuality(report, report.metadata);

        if (!qualityResult.passed) {
          console.log(`[Ingestion] Filtered: "${report.title.substring(0, 40)}..." (${qualityResult.reason})`);
          rejectedDetails.push({ title: report.title, reason: qualityResult.reason || 'quality filter', descLength: (report.description || '').length });
          rejected++;
          continue;
        }

        // Get quality score and determine status (source-specific thresholds)
        const qualityScore = qualityResult.qualityScore!;
        var status = getStatusFromScore(qualityScore.total, report.source_type);

        // Reject very low quality
        if (status === 'rejected') {
          console.log(`[Ingestion] Low score reject: "${report.title.substring(0, 40)}..." (score: ${qualityScore.total})`);
          rejectedDetails.push({ title: report.title, reason: 'low score: ' + qualityScore.total, descLength: (report.description || '').length });
          rejected++;
          continue;
        }

        // Smart re-evaluation: if pending_review, check if content has real value
        // despite a low score (e.g., short but substantive first-hand account)
        if (status === 'pending_review') {
          var reeval = smartReEvaluate(qualityScore, {
            title: report.title,
            description: report.description,
            source_type: report.source_type,
            location_name: report.location_name,
            event_date: report.event_date,
            category: report.category,
          });
          if (reeval.promote) {
            status = 'approved';
            console.log('[Ingestion] Smart-promoted: "' + report.title.substring(0, 40) + '..." (' + reeval.reason + ')');
          } else {
            // V11.14.7 — No more admin-queue landings from live ingest.
            // If smartReEvaluate (now with date+location boost) didn't
            // promote, the report is borderline-low without supporting
            // signals; drop it rather than parking in the admin queue.
            rejected++;
            rejectedDetails.push({ title: report.title, reason: 'borderline_no_signals: ' + reeval.reason, descLength: (report.description || '').length });
            console.log('[Ingestion] Dropped borderline (no promote signals): "' + report.title.substring(0, 40) + '..." (' + reeval.reason + ')');
            continue;
          }
        }

        // Generate a compelling newspaper-style headline from the actual
        // witness report. Falls back to the legacy pattern-based improver
        // if the LLM call fails or returns an invalid title.
        let finalTitle: string = report.title;
        let originalTitle: string | undefined;
        try {
          const compelling = await generateCompellingTitle({
            phenomenonType: (report as any).phenomenon_type || report.title,
            category: report.category,
            description: report.description,
            summary: (report as any).summary,
            locationName: report.location_name,
            eventDate: report.event_date as any,
          });
          if (compelling.title) {
            // Defense-in-depth: even though the Haiku prompt forbids
            // "Witness Reports X" / "Researcher Struggles With X" style
            // third-person framing, strip any that leaks through.
            finalTitle = stripThirdPersonFraming(compelling.title);
            if (finalTitle !== report.title) originalTitle = report.title;
          } else {
            const titleResult = await improveTitleWithAI(
              report.title,
              report.description,
              report.category,
              report.location_name,
              report.event_date
            );
            finalTitle = titleResult.title;
            originalTitle = titleResult.wasImproved ? titleResult.originalTitle : undefined;
          }
        } catch (e) {
          const titleResult = await improveTitleWithAI(
            report.title,
            report.description,
            report.category,
            report.location_name,
            report.event_date
          );
          finalTitle = titleResult.title;
          originalTitle = titleResult.wasImproved ? titleResult.originalTitle : undefined;
        }

        // Generate source label
        const sourceLabel = report.source_label || getSourceLabel(report.source_type);

        // Check if report already exists
        const { data: existing } = await supabase
          .from('reports')
          .select('id')
          .eq('original_report_id', report.original_report_id)
          .eq('source_type', report.source_type)
          .single();

        if (existing) {
          // Exact source match — update existing report
          const { error: updateError } = await supabase
            .from('reports')
            .update({
              title: finalTitle,
              summary: report.summary,
              description: report.description,
              location_name: report.location_name,
              city: report.city || null,
              state_province: report.state_province || null,
              country: report.country || null,
              latitude: report.latitude || null,
              longitude: report.longitude || null,
              event_date: report.event_date,
              event_time: report.event_time || null,
              event_date_precision: report.event_date_precision || 'unknown',
              // V10.8.B — extractDate audit fields. Pass-through; adapter
              // sets these when it uses the unified extractDate utility.
              event_date_extracted_from: (report as any).event_date_extracted_from || null,
              source_published_at: (report as any).source_published_at || null,
              credibility: report.credibility,
              has_photo_video: report.has_photo_video || false,
              witness_count: report.witness_count || null,
              has_official_report: report.has_official_report || false,
              tags: report.tags,
              source_label: sourceLabel,
              source_url: report.source_url,
              original_title: originalTitle,
              metadata: Object.assign({}, report.metadata || {}, report.location_precision ? { location_precision: report.location_precision } : {}),
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (!updateError) {
            updated++;

            // Generate feed_hook if missing on updated report (non-blocking)
            try {
              const { data: hookCheck } = await supabase
                .from('reports')
                .select('feed_hook, paradocs_narrative')
                .eq('id', existing.id)
                .single();

              if (!hookCheck?.feed_hook) {
                await generateAndSaveFeedHook(existing.id);
              }

              // Generate Paradocs Analysis if missing on updated report
              if (!hookCheck?.paradocs_narrative) {
                await generateAndSaveParadocsAnalysis(existing.id);
              }
            } catch (hookError) {
              console.log('[Ingestion] Hook/Analysis generation failed for updated report, continuing...');
            }

            // Clean stale media for link-only adapters that no longer return media arrays.
            // These adapters (bfro, nuforc) set has_photo_video flag + link to source.
            if (LINK_ONLY_SOURCES.indexOf(report.source_type) !== -1 && (!report.media || report.media.length === 0)) {
              const { count: staleMediaCount } = await supabase
                .from('report_media')
                .select('*', { count: 'exact', head: true })
                .eq('report_id', existing.id);
              if (staleMediaCount && staleMediaCount > 0) {
                await supabase.from('report_media').delete().eq('report_id', existing.id);
                console.log('[Ingestion] Cleaned ' + staleMediaCount + ' stale media rows for link-only source ' + report.source_type);
              }
            }

            // Update media for existing report if it has new media
            if (report.media && report.media.length > 0) {
              // Check if report already has media
              const { count: existingMediaCount } = await supabase
                .from('report_media')
                .select('*', { count: 'exact', head: true })
                .eq('report_id', existing.id);

              // Only add media if report doesn't already have any
              if (!existingMediaCount || existingMediaCount === 0) {
                const seenUrls = new Set<string>();
                let mediaAdded = 0;

                for (const mediaItem of report.media) {
                  // Skip duplicate URLs
                  const normalizedUrl = mediaItem.url.replace(/&amp;/g, '&').toLowerCase();
                  if (seenUrls.has(normalizedUrl)) continue;
                  seenUrls.add(normalizedUrl);

                  // Skip known broken image patterns
                  if (normalizedUrl.includes('deleted') ||
                      normalizedUrl.includes('removed') ||
                      normalizedUrl.includes('if you are looking for an image')) {
                    continue;
                  }

                  // Apply media policy: download+store or link-only
                  var processed = await processMediaItem(
                    mediaItem,
                    report.source_type,
                    existing.id,
                    mediaAdded
                  );

                  await supabase.from('report_media').insert({
                    report_id: existing.id,
                    media_type: mediaItem.type,
                    url: processed.url,
                    thumbnail_url: mediaItem.thumbnailUrl || null,
                    caption: processed.caption || mediaItem.caption || null,
                    is_primary: mediaItem.isPrimary || false
                  });
                  mediaAdded++;
                }
                if (mediaAdded > 0) {
                  console.log(`[Ingestion] Added ${mediaAdded} media items to existing report`);
                }
              }
            }

            // Backfill deterministic taxonomy on re-ingest:
            // If the adapter now attaches experienceTypeSlug (NDERF, OBERF) but
            // an older version of the row lacks phenomenon_type_id or a
            // canonical report_phenomena link, canonicalize it here. This
            // keeps previously-ingested rows in sync with taxonomy migrations
            // and adapter upgrades.
            try {
              const metadataForType = (report.metadata || {}) as Record<string, unknown>;
              const experienceTypeSlug =
                typeof metadataForType.experienceTypeSlug === 'string'
                  ? metadataForType.experienceTypeSlug
                  : undefined;
              if (experienceTypeSlug) {
                const typeId = await resolvePhenomenonTypeBySlug(supabase, experienceTypeSlug);
                if (typeId) {
                  await supabase
                    .from('reports')
                    .update({ phenomenon_type_id: typeId })
                    .eq('id', existing.id)
                    .is('phenomenon_type_id', null);
                }
                await linkReportToCanonicalPhenomenonBySlug(
                  supabase,
                  existing.id,
                  experienceTypeSlug,
                );
              }
            } catch (phenBackfillErr) {
              // Non-fatal — taxonomy backfill failure shouldn't block update
              console.log('[Ingestion] Taxonomy backfill failed for updated report, continuing...');
            }
          } else {
            skipped++;
          }
        } else {
          // --- Cross-post / fuzzy duplicate check ---
          // Catches Reddit cross-posts and near-identical content from different sources.
          // Query recent reports with overlapping location or category to compare against.
          var fuzzyMatch: ReturnType<typeof checkForDuplicate> = null;
          try {
            var dedupQuery = supabase
              .from('reports')
              .select('id, title, location_name, city, state_province, country, latitude, longitude, event_date, source_type, original_report_id, description')
              .neq('original_report_id', report.original_report_id)
              .limit(200);

            // Narrow search: same category reduces false positives
            if (report.category) {
              dedupQuery = dedupQuery.eq('category', report.category);
            }

            var { data: dedupCandidates } = await dedupQuery;

            if (dedupCandidates && dedupCandidates.length > 0) {
              var incomingCandidate: DedupCandidate = {
                id: report.original_report_id || 'new',
                title: finalTitle,
                location_name: report.location_name || null,
                city: report.city || null,
                state_province: report.state_province || null,
                country: report.country || null,
                latitude: report.latitude || null,
                longitude: report.longitude || null,
                event_date: report.event_date || null,
                source_type: report.source_type || null,
                original_report_id: report.original_report_id || null,
                description: report.description
              };

              fuzzyMatch = checkForDuplicate(incomingCandidate, dedupCandidates as DedupCandidate[]);

              if (fuzzyMatch && fuzzyMatch.confidence === 'definite') {
                console.log('[Ingestion] Fuzzy dedup SKIP (definite): "' + finalTitle.substring(0, 40) + '..." matches report ' + fuzzyMatch.reportB + ' (score: ' + fuzzyMatch.overallScore.toFixed(2) + ')');
                skipped++;
                continue;
              }

              if (fuzzyMatch && fuzzyMatch.confidence === 'likely') {
                console.log('[Ingestion] Fuzzy dedup flag (likely): "' + finalTitle.substring(0, 40) + '..." similar to report ' + fuzzyMatch.reportB + ' (score: ' + fuzzyMatch.overallScore.toFixed(2) + ')');
                // Will record the match in duplicate_matches AFTER insert (need both UUIDs)
              }
            }
          } catch (dedupErr) {
            // Fuzzy dedup failure should never block ingestion
            console.log('[Ingestion] Fuzzy dedup error (non-fatal):', dedupErr);
          }

          // Insert new report with quality-based status
          const slug = generateSlug(finalTitle, report.original_report_id, report.source_type);

          // V11.11 — Structural location-quality check. A real place
          // will have AT LEAST one of (city, state_province, country,
          // latitude) populated alongside location_name. If location_name
          // is set but every structured field is null, the location is
          // the output of a naive adapter regex grabbing a capitalized
          // word out of context (smoke #10 surfaced "Mary" from "in
          // Mary's house" and "Bad" from "in Bad or good ways"). Null
          // it out so the report renders with a world-view map rather
          // than a misleading chip with nothing behind it.
          var locName = report.location_name;
          var hasStructuredGeo = !!(report.city || report.state_province || report.country ||
            (typeof report.latitude === 'number' && typeof report.longitude === 'number'));
          if (locName && !hasStructuredGeo) {
            console.log('[Ingestion] Dropping bogus location_name "' + locName + '" (no structured geo): ' + slug);
            locName = null as any;
            report.location_name = null as any;
          }

          // V11.17.8 — Sanitize malformed location_name strings where
          // body/title content leaked in (e.g.,
          // "Museum Barn Confronts Staff Member\n\nI work at a museum
          // about farming in Upstate, NY, United States"). Symptom:
          // length > 80, contains newlines, or sentence-ending punct
          // before the comma tail. We extract just the trailing
          // "City, ST, Country" pattern and use that. If no clean
          // tail can be extracted but city/state are populated, fall
          // back to those.
          if (locName && typeof locName === 'string') {
            var looksMalformed = locName.length > 80 || locName.indexOf('\n') !== -1 || /[.!?]/.test(locName);
            if (looksMalformed) {
              // Try to extract the trailing "City, State, Country" — last
              // 2-3 comma-separated tokens that don't span a sentence.
              var parts = locName.split(',').map(function(p) { return p.trim(); }).filter(Boolean);
              if (parts.length >= 2) {
                // Take the last 3 segments (city|region, state|region, country)
                // or last 2 if only that many.
                var n = Math.min(3, parts.length);
                var tail = parts.slice(-n);
                // Strip body content from the first segment: keep only the
                // rightmost capitalized words (avoiding sentence verbs).
                var first = tail[0].replace(/[.!?]/g, '').trim();
                var words = first.split(/\s+/).slice(-3);
                while (words.length > 0 && /^[a-z]/.test(words[0])) words.shift();
                tail[0] = words.join(' ').trim();
                var cleaned = tail.filter(Boolean).join(', ').trim();
                if (cleaned && cleaned.length > 0 && cleaned.length <= 80 && cleaned !== locName) {
                  console.log('[Ingestion] Sanitized location_name: "' + locName.slice(0, 50).replace(/\n/g, ' / ') + '..." → "' + cleaned + '"');
                  locName = cleaned;
                  report.location_name = cleaned;
                } else if (report.city || report.state_province || report.country) {
                  // Fall back to structured fields if extraction failed.
                  var fallback = [report.city, report.state_province, report.country].filter(Boolean).join(', ');
                  if (fallback) {
                    console.log('[Ingestion] Sanitized location_name (structured fallback): "' + locName.slice(0, 50).replace(/\n/g, ' / ') + '..." → "' + fallback + '"');
                    locName = fallback;
                    report.location_name = fallback;
                  }
                }
              }
            }
          }

          // Build insert data with optional structured fields
          const insertData: Record<string, any> = {
              title: finalTitle,
              slug: slug,
              summary: report.summary,
              description: report.description,
              category: report.category,
              location_name: locName,
              // V11.8 — country stays null when the adapter/enricher couldn't
              // resolve one. Previous `|| 'United States'` silently mislabeled
              // every non-US ingested report (and every report with no
              // location signal at all) as US, polluting the map.
              country: report.country || null,
              state_province: report.state_province,
              city: report.city,
              latitude: report.latitude,
              longitude: report.longitude,
              event_date: report.event_date,
              event_date_precision: report.event_date_precision || 'unknown',
              credibility: report.credibility || 'medium',
              source_type: report.source_type,
              original_report_id: report.original_report_id,
              status: status,  // Quality-based status instead of auto-approve
              tags: report.tags || [],
              source_label: sourceLabel,
              source_url: report.source_url,
              original_title: originalTitle,
              upvotes: 0,
              view_count: 0,
              // B0.2 — every row inserted by the ingestion engine is
              // an indexed external source (NUFORC/BFRO/NDERF/etc.).
              // User-submitted reports go through /api/onboarding/submit,
              // which never calls this code path, so 'ingested' here is
              // unconditionally correct.
              report_type: 'ingested',
          };
          // V10.8.B passes through the extractDate audit fields. The
          // engine sends them on insert (top of new-row branch); the
          // update branch already includes them above.
          if ((report as any).event_date_extracted_from) insertData.event_date_extracted_from = (report as any).event_date_extracted_from;
          if ((report as any).source_published_at) insertData.source_published_at = (report as any).source_published_at;

          // Add structured observation fields if provided by adapter
          if (report.witness_count && report.witness_count > 0) insertData.witness_count = report.witness_count;
          if (report.event_time) insertData.event_time = report.event_time;
          if (report.has_official_report) insertData.has_official_report = true;
          if (report.has_photo_video) insertData.has_photo_video = true;
          // Store adapter metadata as JSON if present. Fold location_precision
          // into metadata here (no dedicated column) so the map can style
          // fuzzy pins differently from city-accurate ones.
          const mergedMeta = Object.assign({}, report.metadata || {});
          if (report.location_precision) mergedMeta.location_precision = report.location_precision;
          if (Object.keys(mergedMeta).length > 0) insertData.metadata = mergedMeta;

          // V10.8.C — normalize the row's location BEFORE validation.
          // Folds country aliases (USA → United States), validates the
          // state/province against the country's known subdivisions
          // (US/CA/UK/AU first-class), and runs the geocoding ladder
          // (exact lat/lng → MapTiler city geocode → state centroid →
          // country centroid → unknown). Synthetic-coords flag is set
          // when the lat/lng came from a centroid fallback. The legacy
          // render-side COUNTRY_CENTROIDS fallback in ReportPageV2 can
          // be removed in a follow-up cleanup commit because every row
          // now has lat/lng filled at the DB level.
          try {
            const normalized = await normalizeLocation(
              {
                city: insertData.city || null,
                state_province: insertData.state_province || null,
                country: insertData.country || null,
                country_code: insertData.country_code || null,
                location_name: insertData.location_name || null,
                latitude: insertData.latitude ?? null,
                longitude: insertData.longitude ?? null,
              },
              {
                // V10.8.C.1 — always run the chained geocoder. It uses
                // MapTiler first (when a key is set) and falls back to
                // Nominatim (free, no key) if MapTiler is missing or
                // returns 403/empty. This makes city geocoding airtight
                // even if the MapTiler key is browser-domain-restricted
                // and rejects server-side calls (the prior bug that left
                // NOLA on the Louisiana state centroid).
                geocoder: 'maptiler',
                geocodeFn: geocodeWithFallback,
                cache: makeSupabaseGeocodeCache(supabase),
              },
            );
            insertData.city = normalized.city;
            insertData.state_province = normalized.state_province;
            insertData.country = normalized.country;
            insertData.country_code = normalized.country_code;
            insertData.location_name = normalized.location_name;
            insertData.latitude = normalized.latitude;
            insertData.longitude = normalized.longitude;
            insertData.coords_synthetic = normalized.coords_synthetic;
            // Keep location_precision in metadata (legacy) AND surface
            // it on the row's metadata for the map renderer. The
            // normalizer's precision enum supersedes any precision
            // value the adapter passed in.
            insertData.metadata = Object.assign({}, insertData.metadata || {}, {
              location_precision: normalized.location_precision,
            });
          } catch (normErr) {
            // Normalization failure must never block ingestion.
            console.log('[Ingestion] normalizeLocation failed (non-fatal):', normErr);
          }

          // V10.8.D — final validation gate before INSERT. Errors flip
          // the row to status='quarantine' (still inserted so it can be
          // triaged); warnings let the row through with its quality-
          // derived status. Every flag is recorded to ingestion_audit
          // after the row's UUID is known.
          const validation = validateReportBeforeInsert(insertData as any);
          const validationFlags: ValidationFlag[] = [...validation.errors, ...validation.warnings];
          if (!validation.ok) {
            insertData.status = 'quarantine';
            quarantined++;
            console.log(
              '[Ingestion] QUARANTINE: "' + finalTitle.substring(0, 40) + '..." — ' +
              validation.errors.map(e => e.code).join(', '),
            );
          } else if (validation.warnings.length > 0) {
            withWarnings++;
          }

          const { data: insertedReport, error: insertError } = await supabase
            .from('reports')
            .insert(insertData)
            .select('id')
            .single();

          // Write audit rows once we have the report UUID (or null if
          // the insert itself failed but flags were collected).
          if (validationFlags.length > 0) {
            await recordIngestionAudit(
              supabase,
              insertedReport ? insertedReport.id : null,
              source.adapter_type || report.source_type || 'unknown',
              validationFlags,
            );
          }

          if (!insertError && insertedReport) {
            inserted++;
            // V10.8.K — was previously `titleResult.wasImproved`, but
            // titleResult is block-scoped to the try/catch above and not
            // visible here, so the line was a latent ReferenceError that
            // got swallowed by the surrounding try. originalTitle is
            // declared at outer scope and is truthy iff the title was
            // improved (set in both the try and catch branches).
            if (originalTitle) {
              console.log(`[Ingestion] Title improved: "${originalTitle.substring(0, 30)}..." -> "${finalTitle.substring(0, 30)}..."`);
            }

            // V11.17.52 — Centralized post-insert location safety net.
            // If the adapter didn't populate location_name, Haiku-extract
            // from title+summary+description and geocode. Catches the
            // gap where adapters (YouTube, Reddit, others) skip NLP
            // location passes. Non-blocking: failures leave the row
            // unchanged (location still null). Cost: ~$0.00006/call.
            if (!insertData.location_name) {
              try {
                const resolved = await extractAndGeocodeLocation({
                  title: insertData.title || null,
                  summary: insertData.summary || null,
                  description: insertData.description || null,
                });
                if (resolved) {
                  await supabase.from('reports').update({
                    location_name: resolved.location_name,
                    city: resolved.city,
                    state_province: resolved.state_province,
                    country: resolved.country,
                    latitude: resolved.latitude,
                    longitude: resolved.longitude,
                    location_precision: resolved.location_precision,
                  }).eq('id', insertedReport.id);
                  console.log('[Ingestion] Backfilled location: "' + resolved.location_name + '" (' + resolved.confidence + ')');
                }
              } catch (locErr: any) {
                console.warn('[Ingestion] Location safety net failed for ' + insertedReport.id + ': ' + (locErr?.message || locErr));
              }
            }

            // Record fuzzy dedup match if one was flagged (now we have both UUIDs)
            if (fuzzyMatch && fuzzyMatch.confidence === 'likely') {
              try {
                await supabase.from('duplicate_matches').insert({
                  report_a_id: fuzzyMatch.reportB,  // existing report UUID
                  report_b_id: insertedReport.id,    // newly inserted report UUID
                  title_similarity: fuzzyMatch.titleSimilarity,
                  location_similarity: fuzzyMatch.locationSimilarity,
                  date_similarity: fuzzyMatch.dateSimilarity,
                  content_similarity: fuzzyMatch.contentSimilarity,
                  overall_score: fuzzyMatch.overallScore,
                  confidence: fuzzyMatch.confidence,
                  details: fuzzyMatch.details
                });
                console.log('[Ingestion] Recorded likely duplicate match for review');
              } catch (dedupRecordErr) {
                // Non-fatal — dedup tracking failure shouldn't block ingestion
              }
            }

            // Auto-identify and link to phenomena (only for approved reports)
            if (status === 'approved') {
              try {
                // 1) Deterministic pass: if the adapter declared an
                //    experienceTypeSlug in metadata (NDERF, OBERF), resolve
                //    reports.phenomenon_type_id directly and link the report
                //    to the matching encyclopedia entry. This bypasses the
                //    narrative-dependent pattern matcher for the NDE family.
                const metadataForType = (report.metadata || {}) as Record<string, unknown>;
                const experienceTypeSlug =
                  typeof metadataForType.experienceTypeSlug === 'string'
                    ? metadataForType.experienceTypeSlug
                    : undefined;
                if (experienceTypeSlug) {
                  const typeId = await resolvePhenomenonTypeBySlug(supabase, experienceTypeSlug);
                  if (typeId) {
                    await supabase
                      .from('reports')
                      .update({ phenomenon_type_id: typeId })
                      .eq('id', insertedReport.id)
                      .is('phenomenon_type_id', null);
                  }
                  const linkedCanonical = await linkReportToCanonicalPhenomenonBySlug(
                    supabase,
                    insertedReport.id,
                    experienceTypeSlug,
                  );
                  if (linkedCanonical) {
                    phenomenaLinked += 1;
                  }
                }

                // 2) Pattern-match pass: still run so reports can pick up
                //    secondary encyclopedia links (e.g. an NDE report that
                //    also mentions "tunnel of light" or "deceased relatives"
                //    as distinct phenomena, once we add those).
                //
                // V11.17.13 — gate OFF for NUFORC. The adapter's shape map
                // is authoritative for NUFORC's primary phenomenon and the
                // sighting genre rarely has meaningful secondary phenomena
                // worth surfacing. Running the pattern matcher across NUFORC
                // at scale would create thousands of false-positive links
                // (e.g. jamais-vu firing on "I've never seen anything like
                // that before"). Other sources continue to use it.
                var skipSecondaryMatcher = report.source_type === 'nuforc';
                if (!skipSecondaryMatcher) {
                  const linked = await identifyPhenomenaForReport(
                    supabase,
                    insertedReport.id,
                    finalTitle,
                    report.summary,
                    report.description,
                    report.category
                  );
                  if (linked > 0) {
                    phenomenaLinked += linked;
                    console.log(`[Ingestion] Linked report to ${linked} phenomena`);
                  }
                }
              } catch (phenError) {
                // Don't fail ingestion if phenomenon linking fails
                console.error('[Ingestion] Phenomenon linking error:', phenError);
              }
            }

            // Insert media for new report (with deduplication)
            if (report.media && report.media.length > 0) {
              let mediaInserted = 0;
              const seenUrls = new Set<string>();

              for (const mediaItem of report.media) {
                // Skip duplicate URLs
                const normalizedUrl = mediaItem.url.replace(/&amp;/g, '&').toLowerCase();
                if (seenUrls.has(normalizedUrl)) {
                  console.log(`[Ingestion] Skipping duplicate URL: ${mediaItem.url.substring(0, 50)}...`);
                  continue;
                }
                seenUrls.add(normalizedUrl);

                // Skip known broken image patterns
                if (normalizedUrl.includes('deleted') ||
                    normalizedUrl.includes('removed') ||
                    normalizedUrl.includes('if you are looking for an image')) {
                  console.log(`[Ingestion] Skipping known broken URL pattern`);
                  continue;
                }

                // Apply media policy: download+store or link-only
                var processed = await processMediaItem(
                  mediaItem,
                  report.source_type,
                  slug,
                  mediaInserted
                );

                const { error: mediaError } = await supabase.from('report_media').insert({
                  report_id: insertedReport.id,
                  media_type: mediaItem.type,
                  url: processed.url,
                  thumbnail_url: mediaItem.thumbnailUrl || null,
                  caption: processed.caption || mediaItem.caption || null,
                  is_primary: mediaItem.isPrimary || false
                });
                if (!mediaError) mediaInserted++;
              }
              if (mediaInserted > 0) {
                console.log(`[Ingestion] Added ${mediaInserted} media items to new report`);
              }
            }

            // Correct has_photo_video flag: only keep it true if actual media was inserted.
            // EXCEPTION: Link-only adapters (bfro, nuforc) intentionally set
            // has_photo_video without returning a media array — they link to source
            // instead of storing images. Trust the adapter flag for those sources.
            if (report.has_photo_video && (!report.media || report.media.length === 0)
                && LINK_ONLY_SOURCES.indexOf(report.source_type) === -1) {
              await supabase
                .from('reports')
                .update({ has_photo_video: false })
                .eq('id', insertedReport.id);
              console.log('[Ingestion] Corrected has_photo_video to false (no actual media) for ' + slug);
            }

            // Generate AI content for approved reports.
            // Paradocs Analysis now generates hook + analysis + assessment in a single call
            // (replaces the separate feed_hook generation).
            if (status === 'approved') {
              // V11.13 — Consolidated AI path. When USE_CONSOLIDATED_AI=true
              // in env, ONE Haiku call generates every AI field
              // (compelling title, hook, feed_hook, pull_quote, analysis,
              // frames, open_questions, similar_phenomena, emotional_tone,
              // suggested_category, discovery_tags, answer_line,
              // witness_profile). Replaces the 5-call multi-service
              // sequence and skips the downstream calls. Multi-call path
              // remains the default; enable consolidated via env to A/B
              // in production without breaking the existing pipeline.
              var useConsolidated = isConsolidatedAIEnabled();
              if (useConsolidated) {
                try {
                  var consolidatedRes = await generateAndSaveConsolidatedAI(insertedReport.id);
                  if (!consolidatedRes.success) {
                    console.log('[Ingestion] Consolidated AI failed for ' + slug + ' (' + (consolidatedRes.error || 'unknown') + ') — falling back to multi-call');
                    // Fallback: run the multi-call path so the row still
                    // gets populated. The demotion gate below handles
                    // anything that still ends up empty.
                    try { await generateAndSaveParadocsAnalysis(insertedReport.id); } catch (_e) {}
                  }
                } catch (consolidatedErr) {
                  console.log('[Ingestion] Consolidated AI exception for ' + slug + ':', consolidatedErr);
                  try { await generateAndSaveParadocsAnalysis(insertedReport.id); } catch (_e) {}
                }
              } else {
                // Original multi-call path. Paradocs Analysis — produces
                // hook, analysis, pull_quote, credibility_signal. Also
                // writes feed_hook. Service has built-in retries with
                // backoff.
                try {
                  var analysisSuccess = await generateAndSaveParadocsAnalysis(insertedReport.id);
                  if (!analysisSuccess) {
                    console.log('[Ingestion] Paradocs Analysis failed for ' + slug + ' after all retries — will need manual backfill');
                    // Fallback: try generating just a feed hook via legacy service
                    try {
                      await generateAndSaveFeedHook(insertedReport.id);
                    } catch (hookError) {
                      console.log('[Ingestion] Fallback feed hook also failed for ' + slug);
                    }
                  }
                } catch (analysisError) {
                  console.log('[Ingestion] Paradocs Analysis exception for ' + slug + ':', analysisError);
                }
              }

              // V11 (Path C — Sonnet-refusal demotion) — re-read the row
              // after Paradocs Analysis. If paradocs_narrative is still null
              // or empty after the retry orchestrator, that's Sonnet
              // signaling it couldn't paraphrase the content as an
              // experience report (theorizing posts, help-requests,
              // self-promotion, link-drops, structured non-narrative
              // formats). Demote the status from 'approved' to
              // 'pending_review' so non-experience content never goes
              // live even if it passed our regex pre-filters and score
              // gate. Admin can decide whether to manually approve or
              // reject from /admin/report-review.
              //
              // V11.8 — Extended the demotion check to also catch null
              // paradocs_assessment.pull_quote. The pull-quote renders as
              // the most prominent visual element above the narrative on
              // the report page; if Sonnet's voice-corrective retry
              // failed to produce a clean third-person pull_quote, the
              // page ships with a missing hero element. Demoting to
              // pending_review means we never publish a report that's
              // visually incomplete. Admin can re-run analysis on the
              // pending queue to retry generation with fresh budget.
              try {
                var { data: postAnalysisRow } = await supabase
                  .from('reports')
                  .select('paradocs_narrative, paradocs_assessment')
                  .eq('id', insertedReport.id)
                  .single();
                var hasNarrative = !!(postAnalysisRow && postAnalysisRow.paradocs_narrative && postAnalysisRow.paradocs_narrative.trim().length > 0);
                var assessment: any = postAnalysisRow ? postAnalysisRow.paradocs_assessment : null;
                var pullQuoteRaw = assessment && typeof assessment === 'object' ? assessment.pull_quote : null;
                var hasPullQuote = !!(pullQuoteRaw && typeof pullQuoteRaw === 'string' && pullQuoteRaw.trim().length > 0);
                // V11.17.41 — Anomaly content gate. Both consolidated-ai
                // and paradocs-analysis services now emit
                // paradocs_assessment.anomalous_content_check from the
                // SAME Haiku call that already runs for every ingested
                // report — zero marginal cost. The Haiku self-audit asks
                // "is this actually a paranormal/anomalous experience,
                // or a mundane life anecdote / opinion piece / platform
                // complaint that just LOOKS like one after rewriting?"
                // When anomalous='no' with confidence >=0.7, demote to
                // pending_review so admin can confirm before the row
                // ever goes live. This replaces the post-hoc audit
                // script (scripts/audit-youtube-anomaly-content.ts) as
                // the primary gate; the script remains available as a
                // back-fill tool for historical rows.
                var acRaw = assessment && typeof assessment === 'object' ? (assessment as any).anomalous_content_check : null;
                var acAnomalous: string | null = null;
                var acConfidence: number = 0;
                var acGenre: string = '';
                if (acRaw && typeof acRaw === 'object') {
                  acAnomalous = typeof acRaw.anomalous === 'string' ? acRaw.anomalous : null;
                  acConfidence = typeof acRaw.confidence === 'number' ? acRaw.confidence : 0;
                  acGenre = typeof acRaw.genre === 'string' ? acRaw.genre : '';
                }
                // V11.17.41 (operator follow-up) — Two-tier anomaly gate:
                //   conf >= 0.9 → status='archived' (skip the admin queue
                //     entirely — Haiku is unambiguous about this not being
                //     anomalous content). Keeps the pending-review queue
                //     lean for the borderline cases that actually need a
                //     human read.
                //   0.7 <= conf < 0.9 → status='pending_review' (admin
                //     decides; the gate is confident enough to pull from
                //     live, but not confident enough to commit to archive)
                //   conf < 0.7 → no demotion (uncertainty respected)
                // Both tiers log distinct reasons so admins can spot-check
                // calibration by grepping the ingestion log for the
                // V11.17.41-auto-archived marker vs V11.17.41-pending.
                var anomalyAutoArchive = acAnomalous === 'no' && acConfidence >= 0.9;
                var anomalyPending = acAnomalous === 'no' && acConfidence >= 0.7 && acConfidence < 0.9;
                var demoteReason: string | null = null;
                var demoteTargetStatus: 'pending_review' | 'archived' = 'pending_review';
                if (!hasNarrative) demoteReason = 'Sonnet narrative refusal';
                else if (!hasPullQuote) demoteReason = 'Sonnet pull_quote empty after voice-corrective retry (V11.8)';
                else if (anomalyAutoArchive) {
                  demoteReason = 'Haiku anomaly gate — auto-archived (V11.17.41) — genre=' + (acGenre || 'unspecified') + ' conf=' + acConfidence.toFixed(2);
                  demoteTargetStatus = 'archived';
                }
                else if (anomalyPending) {
                  demoteReason = 'Haiku anomaly gate — pending (V11.17.41) — genre=' + (acGenre || 'unspecified') + ' conf=' + acConfidence.toFixed(2);
                  demoteTargetStatus = 'pending_review';
                }
                if (demoteReason) {
                  await supabase
                    .from('reports')
                    .update({ status: demoteTargetStatus, updated_at: new Date().toISOString() })
                    .eq('id', insertedReport.id);
                  // V11.17.41 — local status tracker widens to include
                  // 'archived' as a possible outcome alongside the original
                  // 'approved' | 'pending_review' | 'rejected' from
                  // getStatusFromScore. Downstream callers only use this
                  // for counting + logging, so the wider type is safe.
                  status = demoteTargetStatus as any;
                  if (demoteTargetStatus === 'pending_review') pendingReview++;
                  console.log('[Ingestion] Demoted to ' + demoteTargetStatus + ' (' + demoteReason + '): ' + slug);
                }
              } catch (demoteErr) {
                // Demotion check is best-effort. If the re-query fails,
                // leave the report as approved — manual review can clean
                // it up.
                console.log('[Ingestion] Sonnet-refusal demotion check failed (non-fatal) for ' + slug + ':', demoteErr);
              }

              // V11.13 — When the consolidated AI path is active, the
              // answer_line and witness_profile fields were already
              // populated by generateAndSaveConsolidatedAI above. Skip
              // the separate Haiku calls to avoid duplicate work +
              // duplicate cost.
              if (!useConsolidated) {
                // V10.4 Phase 1.6 — answer_line (one-sentence faithful summary)
                // for the new mobile-first report page. Generated through the
                // unified rewrite-pipeline so it goes through anti-fabrication
                // + claim-citation + audit log. Best-effort: failure doesn't
                // block ingestion (UI handles null answer_line gracefully).
                try {
                  await withTimeout(generateAndSaveAnswerLine(insertedReport.id), 30000, 'answer_line ' + slug);
                } catch (answerError) {
                  console.log('[Ingestion] answer_line generation failed for ' + slug + ':', answerError);
                }

                // V10.7.A.1 — witness_profile (structured demographic
                // extraction). Powers the witness-profile pill on the
                // report page + the upcoming /explore filters on age /
                // state-of-consciousness. Best-effort: failure doesn't
                // block ingestion; the UI hides the pill when profile
                // is null. ~$0.001/row (Haiku, ~400 output tokens).
                try {
                  await withTimeout(generateAndSaveWitnessProfile(insertedReport.id), 30000, 'witness_profile ' + slug);
                } catch (witnessError) {
                  console.log('[Ingestion] witness_profile generation failed for ' + slug + ':', witnessError);
                }
              }

              // V9.0 — Anchor case generation. Produces the cold-open
              // hook + WHEN/WHERE/WITNESS chips + unresolved tension that
              // power the V8 visual layout on report cards. Best-effort:
              // a hung Anthropic call must not block ingestion. Calls
              // our own /api/admin/ai/generate-anchor-cases endpoint
              // with type=reports.
              //
              // V8.3 — Push copy generation runs AFTER anchor case
              // because the push-copy prompt anchors on the
              // anchor_case_hook + anchor_when/where/witness fields.
              // Both calls are best-effort — failure of either is logged
              // and ingestion continues.
              try {
                var siteUrl = process.env.NEXT_PUBLIC_SITE_URL
                  || (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : null)
                  || 'http://localhost:3000';
                var adminKey = process.env.ADMIN_API_KEY;
                if (adminKey) {
                  // 1) Anchor case
                  var anchorResp = await withTimeout(fetch(siteUrl + '/api/admin/ai/generate-anchor-cases?type=reports', {
                    method: 'POST',
                    headers: {
                      'x-admin-key': adminKey,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ action: 'single', id: insertedReport.id }),
                  }), 30000, 'anchor-case ' + slug);
                  if (!anchorResp.ok) {
                    console.log('[Ingestion] Anchor-case endpoint returned ' + anchorResp.status + ' for ' + slug);
                  }

                  // 2) Push copy (depends on anchor case being populated)
                  try {
                    var pushResp = await withTimeout(fetch(siteUrl + '/api/admin/ai/generate-push-copy?type=reports', {
                      method: 'POST',
                      headers: {
                        'x-admin-key': adminKey,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ action: 'single', id: insertedReport.id }),
                    }), 30000, 'push-copy ' + slug);
                    if (!pushResp.ok) {
                      console.log('[Ingestion] Push-copy endpoint returned ' + pushResp.status + ' for ' + slug);
                    }
                  } catch (pushError) {
                    console.log('[Ingestion] Push-copy generation exception for ' + slug + ':', pushError);
                  }
                } else {
                  console.log('[Ingestion] ADMIN_API_KEY missing; skipping anchor-case + push-copy for ' + slug);
                }
              } catch (anchorError) {
                console.log('[Ingestion] Anchor-case generation exception for ' + slug + ':', anchorError);
              }

              // Brief pause before embedding
              await new Promise(function(resolve) { setTimeout(resolve, 500); });

              // Vector embedding for semantic search
              try {
                await withTimeout(embedReport(insertedReport.id), 30000, 'embed ' + slug);
              } catch (embedError) {
                console.log('[Ingestion] Embedding failed for ' + slug + ', will catch in batch');
              }

              // Inter-report cooldown
              await new Promise(function(resolve) { setTimeout(resolve, 2000); });
            }
          } else {
            console.error('Insert error:', insertError);
            skipped++;
          }
        }
      } catch (reportError) {
        console.error('Error processing report:', reportError);
        skipped++;
      }
    }

    // Update job as completed
    await supabase
      .from('ingestion_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        records_found: result.reports.length,
        records_inserted: inserted,
        records_updated: updated,
        records_skipped: skipped
      })
      .eq('id', job.id);

    // Update source stats
    await supabase
      .from('data_sources')
      .update({
        last_synced_at: new Date().toISOString(),
        success_count: (source.success_count || 0) + 1,
        total_records: (source.total_records || 0) + inserted,
        last_error: null
      })
      .eq('id', sourceId);

    console.log(`[Ingestion] Complete: found=${result.reports.length}, inserted=${inserted}, updated=${updated}, rejected=${rejected}, pending=${pendingReview}, quarantined=${quarantined}, withWarnings=${withWarnings}, skipped=${skipped}, phenomenaLinked=${phenomenaLinked}`);

    // V10.9.A.1 — refresh the report_region_counts materialized
    // view so the /explore?mode=map "Region Totals" panel reflects
    // the new rows immediately. Non-blocking: if the RPC fails we
    // log + continue (panel will catch up on next ingestion run or
    // nightly cron). Only fires when we actually inserted new
    // synthetic-coord rows — otherwise the view is unchanged.
    if (inserted > 0) {
      try {
        const { error: refreshErr } = await supabase.rpc('refresh_region_counts');
        if (refreshErr) {
          console.log('[Ingestion] refresh_region_counts RPC failed (non-fatal):', refreshErr.message);
        } else {
          console.log('[Ingestion] refresh_region_counts: OK');
        }
      } catch (refreshExc) {
        console.log('[Ingestion] refresh_region_counts exception (non-fatal):', refreshExc);
      }
    }

    // Log successful completion
    await logActivity(supabase, sourceId, job.id, 'success', `Ingestion completed`, {
      found: result.reports.length,
      inserted,
      updated,
      rejected,
      pendingReview,
      quarantined,
      withWarnings,
      skipped,
      durationMs: Date.now() - startTime
    });

    return {
      success: true,
      jobId: job.id,
      recordsFound: result.reports.length,
      recordsInserted: inserted,
      recordsUpdated: updated,
      recordsSkipped: skipped,
      recordsRejected: rejected,
      recordsPendingReview: pendingReview,
      recordsQuarantined: quarantined,
      recordsWithWarnings: withWarnings,
      phenomenaLinked: phenomenaLinked,
      rejectedDetails: rejectedDetails,
      duration: Date.now() - startTime
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log error
    await logActivity(supabase, sourceId, job.id, 'error', `Ingestion failed: ${errorMessage}`, {
      error: errorMessage,
      durationMs: Date.now() - startTime
    });

    // Update job as failed
    await supabase
      .from('ingestion_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errorMessage
      })
      .eq('id', job.id);

    // Update source error count
    await supabase
      .from('data_sources')
      .update({
        error_count: supabase.rpc('increment', { row_id: sourceId, table_name: 'data_sources', column_name: 'error_count' }),
        last_error: errorMessage
      })
      .eq('id', sourceId);

    return {
      success: false,
      jobId: job.id,
      recordsFound: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsRejected: 0,
      recordsPendingReview: 0,
      phenomenaLinked: 0,
      error: errorMessage,
      duration: Date.now() - startTime
    };
  }
}

// Get all active sources that need scraping
export async function getSourcesDueForScraping(): Promise<DataSource[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('data_sources')
    .select('*')
    .eq('is_active', true)
    .not('adapter_type', 'is', null);

  if (error) {
    console.error('Error fetching sources:', error);
    return [];
  }

  return data || [];
}

// Run ingestion for all due sources (parallel processing)
export async function runScheduledIngestion(limit: number = 500): Promise<IngestionResult[]> {
  const sources = await getSourcesDueForScraping();

  console.log(`[Ingestion] Starting parallel ingestion for ${sources.length} sources (limit: ${limit} per source)`);

  // Run all sources in parallel for maximum efficiency
  const promises = sources.map(source => {
    console.log(`[Ingestion] Queuing source: ${source.name}`);
    return runIngestion(source.id, limit).catch(error => ({
      success: false,
      jobId: '',
      recordsFound: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsRejected: 0,
      recordsPendingReview: 0,
      phenomenaLinked: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: 0
    } as IngestionResult));
  });

  const results = await Promise.all(promises);

  console.log(`[Ingestion] Completed all ${results.length} sources`);
  return results;
}

// Run ingestion with controlled concurrency (for rate-limited sources)
export async function runScheduledIngestionBatched(
  concurrency: number = 3
): Promise<IngestionResult[]> {
  const sources = await getSourcesDueForScraping();
  const results: IngestionResult[] = [];

  console.log(`[Ingestion] Starting batched ingestion for ${sources.length} sources (concurrency: ${concurrency})`);

  // Process in batches
  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);
    console.log(`[Ingestion] Processing batch ${Math.floor(i / concurrency) + 1}`);

    const batchPromises = batch.map(source => {
      console.log(`[Ingestion] Running: ${source.name}`);
      return runIngestion(source.id).catch(error => ({
        success: false,
        jobId: '',
        recordsFound: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsRejected: 0,
        recordsPendingReview: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: 0
      } as IngestionResult));
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches
    if (i + concurrency < sources.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`[Ingestion] Completed all ${results.length} sources`);
  return results;
}
