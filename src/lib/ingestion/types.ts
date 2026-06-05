// Types for the automated ingestion pipeline

export interface DataSource {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  url: string | null;
  adapter_type: string | null;
  scrape_config: Record<string, any>;
  scrape_frequency: string;
  category: string | null;
  legal_status: string;
  is_active: boolean;
  last_synced_at: string | null;
  total_records: number | null;
  error_count: number;
  success_count: number;
  last_error: string | null;
  next_scrape_at: string | null;
  created_at: string;
}

export interface IngestionJob {
  id: string;
  source_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  records_found: number;
  records_inserted: number;
  records_updated: number;
  records_skipped: number;
  error_message: string | null;
  created_at: string;
}

// Media item extracted from source
export interface ScrapedMediaItem {
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  caption?: string;
  isPrimary?: boolean;
}

export interface ScrapedReport {
  title: string;
  summary: string;
  description: string;
  category: string | null;
  location_name?: string;
  country?: string;
  state_province?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  /** V11.17.83 — true when latitude/longitude came from a centroid
   * fallback (e.g. state-centroid table) rather than a real geocode.
   * Propagates from report-enricher → engine → DB row.
   */
  coords_synthetic?: boolean;
  event_date?: string;
  credibility?: 'low' | 'medium' | 'high' | 'verified';
  source_type: string;
  original_report_id: string;
  tags?: string[];
  // New fields for quality system
  source_label?: string;      // Display label (e.g., "r/Paranormal", "BFRO Database")
  source_url: string;         // REQUIRED — index model needs attribution link
  original_title?: string;    // Original title before improvement
  quality_score?: number;     // 0-100 quality score
  quality_breakdown?: {       // Detailed score breakdown
    lengthScore: number;
    detailScore: number;
    coherenceScore: number;
    sourceScore: number;
  };
  // Media extracted from the source
  media?: ScrapedMediaItem[];
  // Event date precision for On This Date feature
  event_date_precision?: 'exact' | 'month' | 'year' | 'decade' | 'estimated' | 'unknown';
  // V10.8.B — extractDate audit fields. Set by adapters that call
  // the unified extractDate utility (V10.8.A). Adapters that still
  // use legacy per-source parsers leave these undefined; engine.ts
  // passes through whatever the adapter provides.
  event_date_extracted_from?: 'structured' | 'prose-monthname' | 'prose-numeric' | 'prose-relative' | 'prose-year' | 'haiku' | 'none';
  // V10.8.B — publication date of the source (news articles, blog
  // posts, podcast episodes). Distinct from event_date. The news
  // adapter previously stored pub_date in event_date with
  // precision='exact'; after V10.8.B that gets stored here and
  // event_date is reserved for the actual event date (extractDate
  // result on the article body).
  source_published_at?: string;
  // Location precision — how accurate the coordinates are, if we have any.
  //   exact   = adapter supplied a GPS-accurate pair (BFRO, NUFORC some cases)
  //   city    = geocoded from "City, State"
  //   region  = geocoded from state/province centroid only (inherently fuzzy)
  //   country = geocoded from a bare country mention (very fuzzy)
  // Null when we have no coordinates at all.
  // V11.17.5 — 'region' replaces 'state' to match the DB CHECK constraint
  // (reports_location_precision_check) and the TS type in start.tsx.
  // 'state' is rejected at DB write time.
  location_precision?: 'exact' | 'city' | 'region' | 'country';
  // Structured observation fields (populated from source metadata)
  witness_count?: number;
  event_time?: string;
  has_official_report?: boolean;
  has_photo_video?: boolean;
  // Adapter-specific metadata
  metadata?: Record<string, any>;
}

export interface AdapterResult {
  success: boolean;
  reports: ScrapedReport[];
  error?: string;
  nextPageUrl?: string;
}

export interface SourceAdapter {
  name: string;
  scrape(config: Record<string, any>, limit?: number): Promise<AdapterResult>;
}
