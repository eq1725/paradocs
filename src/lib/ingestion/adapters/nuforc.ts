// NUFORC (National UFO Reporting Center) Adapter
// Fetches UFO sighting reports from nuforc.org

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
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
  'DC': 'District of Columbia', 'PR': 'Puerto Rico'
};

const COUNTRY_MAP: Record<string, string> = {
  'USA': 'United States',
  'US': 'United States',
  'CA': 'Canada',
  'CAN': 'Canada',
  'UK': 'United Kingdom',
  'GB': 'United Kingdom',
  'AU': 'Australia',
  'MX': 'Mexico',
  'DE': 'Germany',
  'FR': 'France',
};

// UFO shape to tags mapping
const SHAPE_TAGS: Record<string, string[]> = {
  'light': ['lights', 'luminous'],
  'circle': ['circular', 'round'],
  'triangle': ['triangular', 'three-sided'],
  'fireball': ['bright', 'fire', 'meteor-like'],
  'sphere': ['spherical', 'ball'],
  'oval': ['elliptical', 'egg-shaped'],
  'disk': ['disc', 'saucer', 'classic-ufo'],
  'cigar': ['cylindrical', 'elongated'],
  'rectangle': ['rectangular', 'box-shaped'],
  'chevron': ['v-shaped', 'boomerang'],
  'formation': ['multiple', 'group'],
  'changing': ['morphing', 'shapeshifting'],
  'diamond': ['rhombus', 'kite-shaped'],
  'cylinder': ['tube', 'cigar-shaped'],
  'teardrop': ['pear-shaped'],
  'cone': ['conical'],
};

function parseDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;

  try {
    // Handle various NUFORC date formats
    // Format: "MM/DD/YY" or "MM/DD/YYYY" or "YYYY-MM-DD"
    const cleaned = dateStr.trim();

    if (cleaned.includes('-') && cleaned.length === 10) {
      // Already ISO format
      return cleaned;
    }

    const parts = cleaned.split('/');
    if (parts.length === 3) {
      let year = parseInt(parts[2]);
      const month = parseInt(parts[0]);
      const day = parseInt(parts[1]);

      if (isNaN(year) || isNaN(month) || isNaN(day)) return undefined;

      if (year < 100) {
        year = year > 50 ? 1900 + year : 2000 + year;
      }

      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  } catch (e) {
    console.error('[NUFORC] Date parse error:', dateStr, e);
  }
  return undefined;
}

function determineCredibility(description: string, shape: string, duration: string): 'low' | 'medium' | 'high' {
  let score = 0;

  // Longer, more detailed descriptions
  if (description.length > 200) score += 1;
  if (description.length > 500) score += 1;
  if (description.length > 1000) score += 1;

  // Has specific shape
  if (shape && shape !== 'unknown' && shape !== 'other') score += 1;

  // Has duration info
  if (duration && duration.length > 0 && !duration.toLowerCase().includes('unknown')) score += 1;

  // Contains detailed observations
  const detailIndicators = ['approximately', 'estimate', 'witnessed', 'observed', 'clearly', 'definitely'];
  if (detailIndicators.some(indicator => description.toLowerCase().includes(indicator))) score += 1;

  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

function extractTags(shape: string, description: string): string[] {
  const tags: string[] = ['ufo', 'nuforc'];

  // Add shape-based tags
  const shapeLower = shape?.toLowerCase() || '';
  if (SHAPE_TAGS[shapeLower]) {
    tags.push(shapeLower, ...SHAPE_TAGS[shapeLower]);
  }

  // Extract common keywords from description
  const descLower = description.toLowerCase();
  const keywordMatches: Record<string, string[]> = {
    'night': ['night', 'dark', 'evening', 'midnight'],
    'day': ['daytime', 'morning', 'afternoon', 'daylight'],
    'bright': ['bright', 'brilliant', 'glowing', 'illuminated'],
    'fast': ['fast', 'rapid', 'quick', 'speed'],
    'hovering': ['hover', 'hovering', 'stationary', 'still'],
    'silent': ['silent', 'no sound', 'quiet', 'noiseless'],
    'multiple-witnesses': ['we saw', 'we both', 'my wife', 'my husband', 'several people', 'group of'],
    'military-area': ['military', 'air force', 'army', 'navy', 'base'],
    'aircraft': ['plane', 'aircraft', 'helicopter', 'jet'],
  };

  for (const [tag, keywords] of Object.entries(keywordMatches)) {
    if (keywords.some(kw => descLower.includes(kw))) {
      tags.push(tag);
    }
  }

  return [...new Set(tags)]; // Remove duplicates
}

function cleanDescription(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function generateTitle(city: string, state: string, shape: string, date: string): string {
  const shapeDesc = shape && shape !== 'unknown' ? `${shape} ` : '';
  const location = city ? `${city}, ${state || ''}` : state || 'Unknown Location';
  const dateStr = date ? ` (${date})` : '';
  return `${shapeDesc}UFO Sighting in ${location}${dateStr}`.substring(0, 200);
}

function generateSummary(description: string, shape: string, duration: string): string {
  // Create a brief summary from the description
  const firstSentences = description.split(/[.!?]/).slice(0, 2).join('. ').trim();

  let summary = firstSentences;
  if (summary.length > 400) {
    summary = summary.substring(0, 397) + '...';
  }

  // Add shape and duration if available
  const metadata: string[] = [];
  if (shape && shape !== 'unknown') metadata.push(`Shape: ${shape}`);
  if (duration) metadata.push(`Duration: ${duration}`);

  if (metadata.length > 0 && summary.length < 350) {
    summary += ` [${metadata.join(', ')}]`;
  }

  return summary;
}

// Parse NUFORC HTML report index page
async function parseIndexPage(html: string): Promise<Array<{ link: string; date: string; city: string; state: string; shape: string }>> {
  const reports: Array<{ link: string; date: string; city: string; state: string; shape: string }> = [];

  // NUFORC index pages have table rows with report data
  // Pattern: <TR><TD>date</TD><TD>city</TD><TD>state</TD><TD>country</TD><TD>shape</TD><TD>duration</TD><TD><A HREF="link">summary</A></TD></TR>
  const rowRegex = /<TR[^>]*>[\s\S]*?<\/TR>/gi;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    try {
      const cellRegex = /<TD[^>]*>([\s\S]*?)<\/TD>/gi;
      const cells: string[] = [];
      let match;
      while ((match = cellRegex.exec(row)) !== null) {
        cells.push(match[1].replace(/<[^>]+>/g, '').trim());
      }

      // Extract link
      const linkMatch = row.match(/href=["']([^"']+)["']/i);
      const link = linkMatch ? linkMatch[1] : '';

      if (cells.length >= 5 && link) {
        reports.push({
          link: link,
          date: cells[0] || '',
          city: cells[1] || '',
          state: cells[2] || '',
          shape: cells[4] || ''
        });
      }
    } catch (e) {
      // Skip malformed rows
    }
  }

  return reports;
}

// Parse individual NUFORC report page
async function parseReportPage(html: string, metadata: { link: string; date: string; city: string; state: string; shape: string }): Promise<ScrapedReport | null> {
  try {
    // Extract the main report text
    // NUFORC reports typically have the description in a <TR> with VALIGN="TOP"
    const textMatch = html.match(/<TR[^>]*VALIGN="?TOP"?[^>]*>[\s\S]*?<FONT[^>]*>([\s\S]*?)<\/FONT>/i);
    const description = textMatch ? cleanDescription(textMatch[1]) : '';

    if (!description || description.length < 20) {
      return null; // Skip reports without meaningful content
    }

    // Extract additional metadata from the page
    const postedMatch = html.match(/Posted:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    const durationMatch = html.match(/Duration:\s*([^<\n]+)/i);
    const duration = durationMatch ? durationMatch[1].trim() : '';

    const city = metadata.city;
    const state = STATE_MAP[metadata.state] || metadata.state;
    const shape = metadata.shape.toLowerCase();
    const eventDate = parseDate(metadata.date);

    // Generate report ID from link
    const idMatch = metadata.link.match(/ndxe(\d+)\.html/i) || metadata.link.match(/(\d+)\.html/i);
    const reportId = idMatch ? `nuforc-${idMatch[1]}` : `nuforc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      title: generateTitle(city, state, shape, eventDate || ''),
      summary: generateSummary(description, shape, duration),
      description: description,
      category: 'ufos_aliens',
      location_name: city ? `${city}, ${state}` : state,
      country: 'United States',
      state_province: state,
      city: city,
      event_date: eventDate,
      credibility: determineCredibility(description, shape, duration),
      source_type: 'nuforc',
      original_report_id: reportId,
      tags: extractTags(shape, description)
    };
  } catch (e) {
    console.error('[NUFORC] Error parsing report:', e);
    return null;
  }
}

// Fetch with retry and rate limiting
async function fetchWithRetry(url: string, retries: number = 3, delayMs: number = 1000): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });

      if (response.ok) {
        return await response.text();
      }

      console.log(`[NUFORC] Fetch failed (attempt ${i + 1}): ${url} - Status: ${response.status}`);

      if (response.status === 429) {
        // Rate limited, wait longer
        await new Promise(resolve => setTimeout(resolve, delayMs * 2));
      }
    } catch (e) {
      console.error(`[NUFORC] Fetch error (attempt ${i + 1}):`, url, e instanceof Error ? e.message : 'Unknown');
    }

    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

export const nuforcAdapter: SourceAdapter = {
  name: 'nuforc',

  async scrape(config: Record<string, any>, limit: number = 50): Promise<AdapterResult> {
    const reports: ScrapedReport[] = [];

    try {
      const rateLimitMs = config.rate_limit_ms || 500;

      // Try multiple possible NUFORC URLs (site structure may change)
      const possibleUrls = [
        'https://nuforc.org/webreports/ndxevent.html',
        'https://nuforc.org/ndxevent.html',
        'https://www.nuforc.org/webreports/ndxevent.html',
        'http://www.nuforc.org/webreports/ndxevent.html',
      ];

      console.log(`[NUFORC] Starting scrape. Trying ${possibleUrls.length} URLs, Limit: ${limit}`);

      let indexHtml: string | null = null;
      let successfulUrl = '';

      for (const url of possibleUrls) {
        console.log(`[NUFORC] Trying: ${url}`);
        indexHtml = await fetchWithRetry(url, 2, 500);
        if (indexHtml) {
          successfulUrl = url;
          console.log(`[NUFORC] Success with: ${url}`);
          break;
        }
      }

      if (!indexHtml) {
        return {
          success: false,
          reports: [],
          error: 'Failed to fetch NUFORC index page from any known URL'
        };
      }

      // Extract base URL from successful URL
      const baseUrl = successfulUrl.substring(0, successfulUrl.lastIndexOf('/'));

      // Parse the index to get report links
      const reportMetadata = await parseIndexPage(indexHtml);
      console.log(`[NUFORC] Found ${reportMetadata.length} reports in index`);

      // Limit the number of reports to process
      const toProcess = reportMetadata.slice(0, limit);

      // Fetch and parse each report
      for (const metadata of toProcess) {
        try {
          // Construct full URL
          const reportUrl = metadata.link.startsWith('http')
            ? metadata.link
            : `${baseUrl}/webreports/${metadata.link}`;

          const reportHtml = await fetchWithRetry(reportUrl);

          if (reportHtml) {
            const report = await parseReportPage(reportHtml, metadata);
            if (report) {
              reports.push(report);
              console.log(`[NUFORC] Parsed report: ${report.title}`);
            }
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, rateLimitMs));

        } catch (e) {
          console.error('[NUFORC] Error processing report:', metadata.link, e);
        }
      }

      console.log(`[NUFORC] Successfully scraped ${reports.length} reports`);

      return {
        success: true,
        reports: reports
      };

    } catch (error) {
      console.error('[NUFORC] Scrape error:', error);
      return {
        success: false,
        reports: reports, // Return any reports we managed to get
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};

export default nuforcAdapter;
