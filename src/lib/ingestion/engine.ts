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
import { generateAndSaveFeedHook } from '../services/feed-hook.service';
import { generateAndSaveParadocsAnalysis } from '../services/paradocs-analysis.service';
import { generateCompellingTitle } from '../services/compelling-title.service';
import { embedReport } from '../services/embedding.service';
import { enrichReport } from './enrichment/report-enricher';
import { checkForDuplicate, DedupCandidate } from './dedup';
import { processMediaItem } from './media-storage';
import { getMediaPolicy } from './media-policy';

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
  return !upsertError;
}

// Pattern-match a single report to phenomena (lightweight, no AI)
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

    if (!error) linked++;
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
  phenomenaLinked: number;        // Reports linked to phenomena
  error?: string;
  duration: number;
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
    var rejectedDetails: Array<{ title: string; reason: string; descLength: number }> = [];

    for (const report of result.reports) {
      try {
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
            pendingReview++;
            console.log('[Ingestion] Kept pending: "' + report.title.substring(0, 40) + '..." (' + reeval.reason + ')');
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
            finalTitle = compelling.title;
            if (compelling.title !== report.title) originalTitle = report.title;
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

          // Build insert data with optional structured fields
          const insertData: Record<string, any> = {
              title: finalTitle,
              slug: slug,
              summary: report.summary,
              description: report.description,
              category: report.category,
              location_name: report.location_name,
              country: report.country || 'United States',
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
              view_count: 0
          };
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

          const { data: insertedReport, error: insertError } = await supabase
            .from('reports')
            .insert(insertData)
            .select('id')
            .single();

          if (!insertError && insertedReport) {
            inserted++;
            if (titleResult.wasImproved) {
              console.log(`[Ingestion] Title improved: "${originalTitle?.substring(0, 30)}..." -> "${finalTitle.substring(0, 30)}..."`);
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
              // Paradocs Analysis — produces hook, analysis, pull_quote, credibility_signal
              // Also writes feed_hook. Service has built-in retries with backoff.
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

              // Brief pause before embedding
              await new Promise(function(resolve) { setTimeout(resolve, 500); });

              // Vector embedding for semantic search
              try {
                await embedReport(insertedReport.id);
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

    console.log(`[Ingestion] Complete: found=${result.reports.length}, inserted=${inserted}, updated=${updated}, rejected=${rejected}, pending=${pendingReview}, skipped=${skipped}, phenomenaLinked=${phenomenaLinked}`);

    // Log successful completion
    await logActivity(supabase, sourceId, job.id, 'success', `Ingestion completed`, {
      found: result.reports.length,
      inserted,
      updated,
      rejected,
      pendingReview,
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
