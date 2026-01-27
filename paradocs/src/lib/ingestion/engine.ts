// Ingestion Engine - orchestrates the scraping pipeline

import { createClient } from '@supabase/supabase-js';
import { DataSource, IngestionJob, ScrapedReport } from './types';
import { getAdapter } from './adapters';

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
    error?: string;
    duration: number;
}

// Generate a URL-safe slug from title
function generateSlug(title: string, sourceId: string): string {
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 80);

  const suffix = sourceId.substring(0, 8);
    return `${baseSlug}-${suffix}`;
}

export async function runIngestion(sourceId: string, limit: number = 100): Promise<IngestionResult> {
    const startTime = Date.now();
    const supabase = getSupabaseAdmin();

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
                error: `Failed to create job: ${jobError?.message}`,
                duration: Date.now() - startTime
        };
  }

  try {
        const { data: source, error: sourceError } = await supabase
          .from('data_sources')
          .select('*')
          .eq('id', sourceId)
          .single();

      if (sourceError || !source) {
              throw new Error(`Source not found: ${sourceError?.message}`);
      }

      if (!source.is_active) {
              throw new Error('Source is not active');
      }

      const adapter = getAdapter(source.adapter_type);
        if (!adapter) {
                throw new Error(`No adapter found for type: ${source.adapter_type}`);
        }

      const result = await adapter.scrape(source.scrape_config || {}, limit);

      if (!result.success) {
              throw new Error(result.error || 'Scrape failed');
      }

      let inserted = 0;
        let updated = 0;
        let skipped = 0;

      for (const report of result.reports) {
              try {
                        const { data: existing } = await supabase
                          .from('reports')
                          .select('id')
                          .eq('original_report_id', report.original_report_id)
                          .eq('source_type', report.source_type)
                          .single();

                if (existing) {
                            const { error: updateError } = await supabase
                              .from('reports')
                              .update({
                                              title: report.title,
                                              summary: report.summary,
                                              description: report.description,
                                              location_name: report.location_name,
                                              event_date: report.event_date,
                                              credibility: report.credibility,
                                              tags: report.tags,
                                              updated_at: new Date().toISOString()
                              })
                              .eq('id', existing.id);

                          if (!updateError) {
                                        updated++;
                          } else {
                                        skipped++;
                          }
                } else {
                            const slug = generateSlug(report.title, report.original_report_id);

                          const { error: insertError } = await supabase
                              .from('reports')
                              .insert({
                                              title: report.title,
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
                                              status: 'approved',
                                              tags: report.tags || [],
                                              upvotes: 0,
                                              view_count: 0
                              });

                          if (!insertError) {
                                        inserted++;
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

      await supabase
          .from('data_sources')
          .update({
                    last_synced_at: new Date().toISOString(),
                    success_count: (source.success_count || 0) + 1,
                    total_records: (source.total_records || 0) + inserted,
                    last_error: null
          })
          .eq('id', sourceId);

      return {
              success: true,
              jobId: job.id,
              recordsFound: result.reports.length,
              recordsInserted: inserted,
              recordsUpdated: updated,
              recordsSkipped: skipped,
              duration: Date.now() - startTime
      };

  } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await supabase
          .from('ingestion_jobs')
          .update({
                    status: 'failed',
                    completed_at: new Date().toISOString(),
                    error_message: errorMessage
          })
          .eq('id', job.id);

      return {
              success: false,
              jobId: job.id,
              recordsFound: 0,
              recordsInserted: 0,
              recordsUpdated: 0,
              recordsSkipped: 0,
              error: errorMessage,
              duration: Date.now() - startTime
      };
  }
}

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

export async function runScheduledIngestion(): Promise<IngestionResult[]> {
    const sources = await getSourcesDueForScraping();
    const results: IngestionResult[] = [];

  for (const source of sources) {
        console.log(`[Ingestion] Running for source: ${source.name}`);
        const result = await runIngestion(source.id);
        results.push(result);

      await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}
