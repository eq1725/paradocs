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
