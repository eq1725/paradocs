// Wikipedia Paranormal Lists Adapter
// Fetches structured data from Wikipedia lists of paranormal sightings/events

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Wikipedia API response types
interface WikipediaQueryResult {
  query?: {
    pages: Record<string, {
      pageid: number;
      title: string;
      extract?: string;
      revisions?: Array<{ '*': string }>;
    }>;
  };
}

// Known Wikipedia list pages for paranormal topics
const WIKI_LISTS: Record<string, { title: string; category: string }> = {
  'List_of_reported_UFO_sightings': { title: 'UFO Sightings', category: 'ufos_aliens' },
  'List_of_UFO_sightings': { title: 'UFO Sightings', category: 'ufos_aliens' },
  'List_of_reportedly_haunted_locations_in_the_United_States': { title: 'Haunted US Locations', category: 'ghosts_hauntings' },
  'List_of_reportedly_haunted_locations_in_the_United_Kingdom': { title: 'Haunted UK Locations', category: 'ghosts_hauntings' },
  'List_of_cryptids': { title: 'Cryptids', category: 'cryptids' },
  'List_of_Bigfoot_organizations': { title: 'Bigfoot Research', category: 'cryptids' },
  'Loch_Ness_Monster': { title: 'Loch Ness Monster', category: 'cryptids' },
  'Mothman': { title: 'Mothman Sightings', category: 'cryptids' },
  'Chupacabra': { title: 'Chupacabra', category: 'cryptids' }
};

// Parse a Wikipedia table row into a report
function parseTableRow(row: string, category: string, pageTitle: string, index: number): ScrapedReport | null {
  // Extract cells from the row
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const cells: string[] = [];
  let match;

  while ((match = cellPattern.exec(row)) !== null) {
    const cellContent = match[1]
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\[\d+\]/g, '') // Remove citation brackets
      .trim();
    cells.push(cellContent);
  }

  if (cells.length < 2) return null;

  // Try to identify date, location, and description from cells
  let dateStr: string | undefined;
  let location: string | undefined;
  let description: string = '';
  let title: string = '';

  for (const cell of cells) {
    // Check if cell looks like a date
    if (!dateStr && /\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)/i.test(cell)) {
      dateStr = cell;
    }
    // Check if cell looks like a location
    else if (!location && /[A-Z][a-z]+(?:,\s*[A-Z][a-z]+)?/.test(cell) && cell.length < 100) {
      location = cell;
    }
    // Otherwise, add to description
    else if (cell.length > 20) {
      if (!title && cell.length < 150) {
        title = cell;
      }
      description += cell + ' ';
    }
  }

  // Skip if no meaningful content
  if (!description && !title) return null;

  description = description.trim();
  if (!title) {
    title = description.substring(0, 60);
    if (title.length < description.length) title += '...';
  }

  // Parse date
  let eventDate: string | undefined;
  if (dateStr) {
    // Try to extract year
    const yearMatch = dateStr.match(/\d{4}/);
    if (yearMatch) {
      eventDate = `${yearMatch[0]}-01-01`;
    }
  }

  // Extract country/state from location
  let country: string | undefined;
  let stateProvince: string | undefined;

  if (location) {
    if (location.includes('United States') || location.includes('USA') || location.includes('U.S.')) {
      country = 'United States';
      const stateMatch = location.match(/([A-Z][a-z]+)(?:,\s*(?:United States|USA|U\.S\.))/);
      if (stateMatch) stateProvince = stateMatch[1];
    } else if (location.includes('United Kingdom') || location.includes('UK') || location.includes('England') || location.includes('Scotland')) {
      country = 'United Kingdom';
    } else if (location.includes('Canada')) {
      country = 'Canada';
    }
  }

  const reportId = `wiki-${pageTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${index}`;

  return {
    title: title.length > 150 ? title.substring(0, 147) + '...' : title,
    summary: description.length > 200 ? description.substring(0, 197) + '...' : description,
    description,
    category,
    location_name: location,
    country,
    state_province: stateProvince,
    event_date: eventDate,
    credibility: 'medium', // Wikipedia is generally reliable
    source_type: 'wikipedia',
    original_report_id: reportId,
    tags: ['wikipedia', 'historical', category.replace(/_/g, '-')]
  };
}

// Parse Wikipedia page content for list items
function parseWikiContent(html: string, category: string, pageTitle: string): ScrapedReport[] {
  const reports: ScrapedReport[] = [];
  let index = 0;

  // First, try to parse tables (common for structured lists)
  const tablePattern = /<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tablePattern.exec(html)) !== null) {
    const tableContent = tableMatch[1];

    // Extract rows
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let isHeader = true;

    while ((rowMatch = rowPattern.exec(tableContent)) !== null) {
      // Skip header row
      if (isHeader || rowMatch[1].includes('<th')) {
        isHeader = false;
        continue;
      }

      const report = parseTableRow(rowMatch[1], category, pageTitle, index++);
      if (report) {
        reports.push(report);
      }
    }
  }

  // If no tables, try to parse list items
  if (reports.length === 0) {
    const listPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let listMatch;

    while ((listMatch = listPattern.exec(html)) !== null) {
      const content = listMatch[1]
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\[\d+\]/g, '')
        .trim();

      if (content.length < 50) continue;

      // Try to extract a title and description
      const parts = content.split(/[-–—:]/, 2);
      const title = parts[0]?.trim() || content.substring(0, 60);
      const description = parts[1]?.trim() || content;

      // Skip navigation/meta items
      if (title.toLowerCase().includes('see also') ||
          title.toLowerCase().includes('references') ||
          title.toLowerCase().includes('external links')) {
        continue;
      }

      const reportId = `wiki-${pageTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${index++}`;

      reports.push({
        title: title.length > 150 ? title.substring(0, 147) + '...' : title,
        summary: description.length > 200 ? description.substring(0, 197) + '...' : description,
        description,
        category,
        credibility: 'medium',
        source_type: 'wikipedia',
        original_report_id: reportId,
        tags: ['wikipedia', 'historical', category.replace(/_/g, '-')]
      });
    }
  }

  return reports;
}

// Fetch a Wikipedia page and parse it
async function fetchWikiPage(
  pageTitle: string,
  category: string,
  rateLimitMs: number
): Promise<ScrapedReport[]> {
  try {
    // Use Wikipedia API to get parsed HTML
    const apiUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&format=json&prop=text&origin=*`;

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'ParaDocs/1.0 (educational research; contact@example.com)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`[Wikipedia] Failed to fetch ${pageTitle}: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data.parse?.text?.['*']) {
      console.error(`[Wikipedia] No content found for ${pageTitle}`);
      return [];
    }

    const html = data.parse.text['*'];
    return parseWikiContent(html, category, pageTitle);

  } catch (error) {
    console.error(`[Wikipedia] Error fetching ${pageTitle}:`, error);
    return [];
  }
}

// Main adapter implementation
export const wikipediaAdapter: SourceAdapter = {
  name: 'wikipedia',

  async scrape(config: Record<string, any>, limit: number = 50): Promise<AdapterResult> {
    const rateLimitMs = config.rate_limit_ms || 1000;
    const targetPages = config.pages || Object.keys(WIKI_LISTS);

    const allReports: ScrapedReport[] = [];
    const errors: string[] = [];

    try {
      console.log('[Wikipedia] Starting scrape...');

      for (const pageName of targetPages) {
        if (allReports.length >= limit) break;

        const pageConfig = WIKI_LISTS[pageName];
        if (!pageConfig) {
          errors.push(`Unknown page: ${pageName}`);
          continue;
        }

        console.log(`[Wikipedia] Fetching ${pageName}...`);

        await delay(rateLimitMs);

        const pageReports = await fetchWikiPage(pageName, pageConfig.category, rateLimitMs);
        console.log(`[Wikipedia] Found ${pageReports.length} entries in ${pageName}`);

        // Add reports up to limit
        const remaining = limit - allReports.length;
        allReports.push(...pageReports.slice(0, remaining));
      }

      console.log(`[Wikipedia] Scrape complete. Total reports: ${allReports.length}`);

      return {
        success: allReports.length > 0,
        reports: allReports,
        error: errors.length > 0 ? errors.join('; ') : undefined
      };

    } catch (error) {
      console.error('[Wikipedia] Scrape failed:', error);
      return {
        success: false,
        reports: allReports,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};
