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
  category: string;
  location_name?: string;
  country?: string;
  state_province?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  event_date?: string;
  credibility?: 'low' | 'medium' | 'high' | 'verified';
  source_type: string;
  original_report_id: string;
  tags?: string[];
  // New fields for quality system
  source_label?: string;      // Display label (e.g., "r/Paranormal", "BFRO Database")
  source_url?: string;        // Link back to original source
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
