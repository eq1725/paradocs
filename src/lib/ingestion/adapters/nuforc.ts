// NUFORC (National UFO Reporting Center) Scraper Adapter
// Scrapes UFO sighting reports from nuforc.org

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

// US State abbreviations to full names mapping
const STATE_MAP: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
};

// UFO shape types from NUFORC
const SHAPE_TYPES = [
  'light', 'circle', 'triangle', 'fireball', 'sphere', 'unknown', 'oval', 'disk',
  'other', 'cigar', 'rectangle', 'chevron', 'formation', 'changing', 'flash',
  'cylinder', 'diamond', 'teardrop', 'egg', 'cone', 'cross', 'star'
];

interface NUFORCReport {
  date: string;
  city: string;
  state: string;
  country: string;
  shape: string;
  duration: string;
  summary: string;
  reportLink: string;
  posted: string;
}

function generateSlug(city: string, state: string, shape: string, id: string): string {
  const cleanCity = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cleanState = state.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cleanShape = shape.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${cleanShape}-ufo-sighting-${cleanCity}-${cleanState}-nuforc-${id}`.substring(0, 100);
}

function parseDate(dateStr: string): string | undefined {
  try {
    // NUFORC dates are typically in format "MM/DD/YY" or "MM/DD/YYYY"
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      let year = parseInt(parts[2]);
      if (year < 100) {
        year = year > 50 ? 1900 + year : 2000 + year;
      }
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // Return undefined if parsing fails
  }
  return undefined;
}

function determineCredibility(report: NUFORCReport): 'low' | 'medium' | 'high' {
  // Simple heuristics for credibility
  let score = 0;

  // Longer descriptions tend to be more detailed
  if (report.summary.length > 200) score += 1;
  if (report.summary.length > 500) score += 1;

  // Known shape types are more credible
  if (SHAPE_TYPES.includes(report.shape.toLowerCase())) score += 1;

  // Has location data
  if (report.city && report.state) score += 1;

  // Has duration info
  if (report.duration && report.duration !== 'Unknown') score += 1;

  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

export const nuforcAdapter: SourceAdapter = {
  name: 'nuforc',

  async scrape(config: Record<string, any>, limit: number = 100): Promise<AdapterResult> {
    const reports: ScrapedReport[] = [];

    try {
      // For now, we'll use a simplified approach that works with the NUFORC data
      // In production, this would actually fetch from nuforc.org
      // Due to Vercel's execution limits, we'll process in smaller batches

      const baseUrl = config.base_url || 'https://nuforc.org/subndx/';
      const rateLimitMs = config.rate_limit_ms || 1000;

      // NUFORC organizes reports by state, then by date
      // We'll fetch the index and parse recent reports

      // For the MVP, we'll simulate fetching by using the HuggingFace dataset
      // which has pre-scraped NUFORC data
      const datasetUrl = 'https://huggingface.co/datasets/ufospace/nuforc-reports/resolve/main/data/train-00000-of-00001.parquet';

      // Since we can't directly parse parquet in Vercel Edge functions easily,
      // we'll use the JSON endpoint if available, or fall back to a CSV approach

      // For now, return empty with a message that we need to set up the data pipeline
      console.log('[NUFORC Adapter] Config:', config);
      console.log('[NUFORC Adapter] Would fetch from:', baseUrl);
      console.log('[NUFORC Adapter] Rate limit:', rateLimitMs, 'ms');
      console.log('[NUFORC Adapter] Limit:', limit, 'reports');

      // In the actual implementation, we would:
      // 1. Fetch the state index page
      // 2. For each state, fetch the report list
      // 3. For each report, fetch the full details
      // 4. Parse the HTML and extract structured data
      // 5. Return the scraped reports

      return {
        success: true,
        reports: [],
        error: 'NUFORC adapter is configured but requires external data source connection. Use the HuggingFace dataset import for initial data.'
      };

    } catch (error) {
      return {
        success: false,
        reports: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};

// Helper function to scrape a single NUFORC report page (for future use)
async function scrapeReportPage(url: string): Promise<NUFORCReport | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const html = await response.text();

    // Parse the HTML to extract report details
    // NUFORC pages have a specific structure we can parse
    // This is a simplified example - real implementation would need proper HTML parsing

    return null; // Placeholder
  } catch (error) {
    console.error('[NUFORC] Error scraping report:', url, error);
    return null;
  }
}

export default nuforcAdapter;
