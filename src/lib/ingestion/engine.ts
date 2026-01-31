// Ingestion Engine - orchestrates the scraping pipeline

import { createClient } from '@supabase/supabase-js';
import { DataSource, IngestionJob, ScrapedReport } from './types';
import { getAdapter } from './adapters';
import {
  assessQuality,
  getStatusFromScore,
  improveTitle,
  getSourceLabel,
  isObviouslyLowQuality,
} from './filters';

// Initialize Supabase client with service role for server-side operations
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
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
  error?: string;
  duration: number;
}

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

    // Run the scraper
    const result = await adapter.scrape(source.scrape_config || {}, limit);

    if (!result.success) {
      throw new Error(result.error || 'Scrape failed');
    }

    // Process and insert the reports with quality filtering
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let rejected = 0;
    let pendingReview = 0;

    for (const report of result.reports) {
      try {
        // Quick rejection for obviously low quality content
        if (isObviouslyLowQuality(report.title, report.description)) {
          console.log(`[Ingestion] Quick reject: "${report.title.substring(0, 40)}..." (obviously low quality)`);
          rejected++;
          continue;
        }

        // Full quality assessment
        const qualityResult = assessQuality(report, report.metadata);

        if (!qualityResult.passed) {
          console.log(`[Ingestion] Filtered: "${report.title.substring(0, 40)}..." (${qualityResult.reason})`);
          rejected++;
          continue;
        }

        // Get quality score and determine status
        const qualityScore = qualityResult.qualityScore!;
        const status = getStatusFromScore(qualityScore.total);

        // Reject very low quality
        if (status === 'rejected') {
          console.log(`[Ingestion] Low score reject: "${report.title.substring(0, 40)}..." (score: ${qualityScore.total})`);
          rejected++;
          continue;
        }

        // Track pending review
        if (status === 'pending_review') {
          pendingReview++;
        }

        // Improve title if needed
        const titleResult = improveTitle(
          report.title,
          report.description,
          report.category,
          report.location_name
        );

        const finalTitle = titleResult.title;
        const originalTitle = titleResult.wasImproved ? titleResult.originalTitle : undefined;

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
          // Update existing report
          const { error: updateError } = await supabase
            .from('reports')
            .update({
              title: finalTitle,
              summary: report.summary,
              description: report.description,
              location_name: report.location_name,
              event_date: report.event_date,
              credibility: report.credibility,
              tags: report.tags,
              source_label: sourceLabel,
              original_title: originalTitle,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (!updateError) {
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Insert new report with quality-based status
          const slug = generateSlug(finalTitle, report.original_report_id, report.source_type);

          const { error: insertError } = await supabase
            .from('reports')
            .insert({
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
            });

          if (!insertError) {
            inserted++;
            if (titleResult.wasImproved) {
              console.log(`[Ingestion] Title improved: "${originalTitle?.substring(0, 30)}..." -> "${finalTitle.substring(0, 30)}..."`);
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

    console.log(`[Ingestion] Complete: found=${result.reports.length}, inserted=${inserted}, updated=${updated}, rejected=${rejected}, pending=${pendingReview}, skipped=${skipped}`);

    return {
      success: true,
      jobId: job.id,
      recordsFound: result.reports.length,
      recordsInserted: inserted,
      recordsUpdated: updated,
      recordsSkipped: skipped,
      recordsRejected: rejected,
      recordsPendingReview: pendingReview,
      duration: Date.now() - startTime
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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
