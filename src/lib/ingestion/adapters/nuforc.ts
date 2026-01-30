// NUFORC (National UFO Reporting Center) Adapter
// Fetches UFO sighting reports from nuforc.org (new WordPress-based site)

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
  'orb': ['spherical', 'ball', 'glowing'],
  'star': ['point-light', 'stellar'],
  'flash': ['bright', 'momentary'],
  'unknown': [],
  'other': [],
};

function parseDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  try {
    // Handle NUFORC date format: "2026-01-25 21:29" or "01/25/2026"
    const cleaned = dateStr.trim().split(' ')[0]; // Take just the date part

    if (cleaned.includes('-') && cleaned.length >= 10) {
      return cleaned.substring(0, 10);
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
    console.error('[NUFORC] Date parse error:', dateStr);
  }
  return undefined;
}

function determineCredibility(summary: string, shape: string, hasMedia: boolean): 'low' | 'medium' | 'high' {
  let score = 0;
  if (summary.length > 100) score += 1;
  if (summary.length > 300) score += 1;
  if (shape && shape !== 'unknown' && shape !== 'other') score += 1;
  if (hasMedia) score += 2;
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function extractTags(shape: string, summary: string): string[] {
  const tags: string[] = ['ufo', 'nuforc'];
  const shapeLower = shape?.toLowerCase() || '';
  if (SHAPE_TAGS[shapeLower]) {
    tags.push(shapeLower, ...SHAPE_TAGS[shapeLower]);
  }

  const descLower = summary.toLowerCase();
  if (descLower.includes('night') || descLower.includes('dark')) tags.push('night');
  if (descLower.includes('bright') || descLower.includes('glow')) tags.push('bright');
  if (descLower.includes('hover')) tags.push('hovering');
  if (descLower.includes('silent') || descLower.includes('no sound')) tags.push('silent');
  if (descLower.includes('fast') || descLower.includes('speed')) tags.push('fast');
  if (descLower.includes('we saw') || descLower.includes('my wife') || descLower.includes('my husband')) tags.push('multiple-witnesses');

  return [...new Set(tags)];
}

function cleanText(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch with browser-like headers
async function fetchWithHeaders(url: string, retries: number = 3): Promise<string | null> {
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
    } catch (e) {
      console.error(`[NUFORC] Fetch error (attempt ${i + 1}):`, url);
    }
    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return null;
}

// Parse the main index page to get available months
async function parseMainIndex(html: string): Promise<Array<{ monthId: string; count: number }>> {
  const months: Array<{ monthId: string; count: number }> = [];

  // Actual HTML structure from nuforc.org:
  // <tr><td><u><a href="/subndx/?id=e202601">2026/01</a></u></td><td>227</td></tr>

  // Simple and reliable: extract all links to month pages
  const linkPattern = /href="\/subndx\/\?id=e(\d{6})"[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/td>\s*<td[^>]*>\s*(\d+)/gi;

  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const monthId = match[1];
    const count = parseInt(match[2]) || 100;
    if (!months.find(m => m.monthId === monthId)) {
      months.push({ monthId, count });
    }
  }

  // Fallback: Just extract month IDs if count extraction failed
  if (months.length === 0) {
    const simplePattern = /href="\/subndx\/\?id=e(\d{6})"/gi;
    while ((match = simplePattern.exec(html)) !== null) {
      const monthId = match[1];
      if (!months.find(m => m.monthId === monthId)) {
        months.push({ monthId, count: 100 });
      }
    }
  }

  return months;
}

// Parse a month's report listing page
interface ReportMetadata {
  id: string;
  occurred: string;
  city: string;
  state: string;
  country: string;
  shape: string;
  summary: string;
  reported: string;
  hasMedia: boolean;
  explanation: string;
}

async function parseMonthPage(html: string): Promise<ReportMetadata[]> {
  const reports: ReportMetadata[] = [];

  // Debug: Log HTML size and look for key markers
  console.log(`[NUFORC] HTML size: ${html.length} bytes`);
  const hasSightingLink = html.includes('/sighting/?id=');
  console.log(`[NUFORC] Contains sighting link: ${hasSightingLink}`);
  console.log(`[NUFORC] Contains table: ${html.includes('<table')}`);
  console.log(`[NUFORC] Contains wpDataTable: ${html.includes('wpDataTable')}`);

  // If sighting link exists, show a sample of the HTML around it
  if (hasSightingLink) {
    const idx = html.indexOf('/sighting/?id=');
    const sample = html.substring(Math.max(0, idx - 50), Math.min(html.length, idx + 100));
    console.log(`[NUFORC] Sample around sighting link: ${sample.replace(/[\n\r]+/g, ' ').substring(0, 200)}`);
  }

  // First approach: Find all sighting links directly and extract surrounding row data
  // The site uses SINGLE QUOTES in href attributes: href='/sighting/?id=194984'
  let sightingIds: string[] = [];

  // Pattern 1: Single quotes (actual format used by NUFORC)
  const pattern1 = /href='\/sighting\/\?id=(\d+)'/gi;
  let match;
  while ((match = pattern1.exec(html)) !== null) {
    sightingIds.push(match[1]);
  }
  console.log(`[NUFORC] Pattern 1 (single quotes): ${sightingIds.length} matches`);

  // Pattern 2: Double quotes (fallback)
  if (sightingIds.length === 0) {
    const pattern2 = /href="\/sighting\/\?id=(\d+)"/gi;
    while ((match = pattern2.exec(html)) !== null) {
      sightingIds.push(match[1]);
    }
    console.log(`[NUFORC] Pattern 2 (double quotes): ${sightingIds.length} matches`);
  }

  // Pattern 3: Either quote type with character class
  if (sightingIds.length === 0) {
    const pattern3 = /href=['"]\/sighting\/\?id=(\d+)['"]/gi;
    while ((match = pattern3.exec(html)) !== null) {
      sightingIds.push(match[1]);
    }
    console.log(`[NUFORC] Pattern 3 (either quote): ${sightingIds.length} matches`);
  }

  console.log(`[NUFORC] Total sighting IDs found: ${sightingIds.length}`);

  // If we have sighting IDs, find table rows containing them
  if (sightingIds.length > 0) {
    // Try to find each sighting's row data
    for (const id of sightingIds) {
      // Find the table row containing this sighting ID (handles both single and double quotes)
      const rowPattern = new RegExp(`<tr[^>]*>[\\s\\S]*?href=['"]\\/sighting\\/\\?id=${id}['"][\\s\\S]*?<\\/tr>`, 'i');
      const rowMatch = html.match(rowPattern);

      if (rowMatch) {
        const rowHtml = rowMatch[0];

        // Extract all td cells
        const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells: string[] = [];
        let cellMatch;
        while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
          cells.push(cleanText(cellMatch[1].replace(/<[^>]+>/g, '')));
        }

        // We expect: Link, Occurred, City, State, Country, Shape, Summary, Reported, Media, Explanation
        if (cells.length >= 7) {
          reports.push({
            id: id,
            occurred: cells[1] || '',
            city: cells[2] || '',
            state: cells[3] || '',
            country: cells[4] || 'USA',
            shape: cells[5] || 'unknown',
            summary: cells[6] || '',
            reported: cells[7] || '',
            hasMedia: (cells[8] || '').toLowerCase() === 'y' || (cells[8] || '').toLowerCase() === 'yes',
            explanation: cells[9] || ''
          });
        }
      }
    }

    if (reports.length > 0) {
      console.log(`[NUFORC] Direct ID extraction found ${reports.length} reports`);
      return reports;
    }
  }

  // Second approach: Class-based cell extraction (for browser-rendered HTML)
  const rowPattern = /<tr[^>]*class="(?:odd|even)"[^>]*>([\s\S]*?)<\/tr>/gi;

  while ((match = rowPattern.exec(html)) !== null) {
    const rowHtml = match[1];
    const idMatch = rowHtml.match(/href=['"]\/sighting\/\?id=(\d+)['"]/i);
    if (!idMatch) continue;

    const extractCell = (className: string): string => {
      const pattern = new RegExp(`<td[^>]*class="[^"]*column-${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
      const cellMatch = rowHtml.match(pattern);
      if (cellMatch) {
        return cleanText(cellMatch[1].replace(/<[^>]+>/g, ''));
      }
      return '';
    };

    const occurred = extractCell('occurred');
    const city = extractCell('city');
    const state = extractCell('state');
    const country = extractCell('country') || 'USA';
    const shape = extractCell('shape') || 'unknown';
    const summary = extractCell('summary');
    const reported = extractCell('reported');
    const hasImage = extractCell('hasimage');
    const explanation = extractCell('explanation');

    if (occurred || summary) {
      reports.push({
        id: idMatch[1],
        occurred,
        city,
        state,
        country,
        shape,
        summary,
        reported,
        hasMedia: hasImage.toLowerCase() === 'y' || hasImage.toLowerCase() === 'yes',
        explanation
      });
    }
  }

  if (reports.length > 0) {
    console.log(`[NUFORC] Class-based parsing found ${reports.length} reports`);
    return reports;
  }

  // Third approach: Generic row parsing
  console.log('[NUFORC] Class-based parsing found 0 rows, trying generic parsing...');

  const genericRowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  while ((match = genericRowPattern.exec(html)) !== null) {
    const rowHtml = match[0];

    // Skip header rows (contain <th>)
    if (rowHtml.includes('<th')) continue;

    const idMatch = rowHtml.match(/href=['"][^'"]*\/sighting\/\?id=(\d+)['"]/i);
    if (!idMatch) continue;

    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      cells.push(cleanText(cellMatch[1].replace(/<[^>]+>/g, '')));
    }

    if (cells.length >= 7) {
      reports.push({
        id: idMatch[1],
        occurred: cells[1] || '',
        city: cells[2] || '',
        state: cells[3] || '',
        country: cells[4] || 'USA',
        shape: cells[5] || 'unknown',
        summary: cells[6] || '',
        reported: cells[7] || '',
        hasMedia: (cells[8] || '').toLowerCase() === 'y',
        explanation: cells[9] || ''
      });
    }
  }

  return reports;
}

// Fetch and parse individual report page for full details
async function fetchReportDetails(id: string): Promise<{
  description: string;
  duration: string;
  observers: number;
  color: string;
  location: string;
} | null> {
  const url = `https://nuforc.org/sighting/?id=${id}`;
  const html = await fetchWithHeaders(url, 2);
  if (!html) return null;

  // Extract fields from the report page
  const extractField = (label: string): string => {
    const pattern = new RegExp(`<strong>${label}:?</strong>\\s*([^<]+)`, 'i');
    const match = html.match(pattern);
    return match ? cleanText(match[1]) : '';
  };

  // Extract description - it's in paragraph tags after the metadata
  const descMatch = html.match(/<\/p>\s*<p[^>]*>([\s\S]*?)<p[^>]*><em>Posted/i) ||
                    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

  let description = '';
  if (descMatch) {
    description = cleanText(descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  }

  return {
    description,
    duration: extractField('Duration'),
    observers: parseInt(extractField('No of observers')) || 1,
    color: extractField('Color'),
    location: extractField('Location')
  };
}

export const nuforcAdapter: SourceAdapter = {
  name: 'nuforc',

  async scrape(config: Record<string, any>, limit: number = 100): Promise<AdapterResult> {
    const reports: ScrapedReport[] = [];
    const rateLimitMs = config.rate_limit_ms || 100; // Faster rate limit for bulk scraping
    const fetchFullDetails = config.fetch_full_details === true; // Default to FALSE for speed
    const maxMonths = config.max_months || 6; // Fewer months by default to avoid timeout

    try {
      console.log(`[NUFORC] Starting scrape. Limit: ${limit}, Max months: ${maxMonths}`);

      // Fetch the main index page
      const indexUrl = 'https://nuforc.org/ndx/?id=event';
      const indexHtml = await fetchWithHeaders(indexUrl);

      if (!indexHtml) {
        return {
          success: false,
          reports: [],
          error: 'Failed to fetch NUFORC index page'
        };
      }

      // Parse available months
      const months = await parseMainIndex(indexHtml);
      console.log(`[NUFORC] Found ${months.length} months in index`);

      if (months.length === 0) {
        // Fallback: Try known recent months
        const now = new Date();
        for (let i = 0; i < maxMonths; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthId = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
          months.push({ monthId, count: 100 });
        }
        console.log(`[NUFORC] Using fallback months: ${months.map(m => m.monthId).join(', ')}`);
      }

      // Process months until we have enough reports
      const monthsToProcess = months.slice(0, maxMonths);

      for (const month of monthsToProcess) {
        if (reports.length >= limit) break;

        const monthUrl = `https://nuforc.org/subndx/?id=e${month.monthId}`;
        console.log(`[NUFORC] Fetching month ${month.monthId}...`);

        const monthHtml = await fetchWithHeaders(monthUrl);
        if (!monthHtml) {
          console.log(`[NUFORC] Failed to fetch month ${month.monthId}`);
          continue;
        }

        const monthReports = await parseMonthPage(monthHtml);
        console.log(`[NUFORC] Found ${monthReports.length} reports in month ${month.monthId}`);

        for (const meta of monthReports) {
          if (reports.length >= limit) break;

          try {
            let description = meta.summary;
            let duration = '';

            // Optionally fetch full report details
            if (fetchFullDetails && description.length < 200) {
              await new Promise(resolve => setTimeout(resolve, rateLimitMs));
              const details = await fetchReportDetails(meta.id);
              if (details) {
                description = details.description || meta.summary;
                duration = details.duration;
              }
            }

            const state = STATE_MAP[meta.state] || meta.state;
            const eventDate = parseDate(meta.occurred);
            const locationName = meta.city ? `${meta.city}, ${state}` : state;

            const report: ScrapedReport = {
              title: `${meta.shape || 'UFO'} Sighting in ${locationName}${eventDate ? ` (${eventDate})` : ''}`.substring(0, 200),
              summary: meta.summary.length > 400 ? meta.summary.substring(0, 397) + '...' : meta.summary,
              description: description,
              category: 'ufos_aliens',
              location_name: locationName,
              country: meta.country === 'USA' ? 'United States' : meta.country,
              state_province: state,
              city: meta.city,
              event_date: eventDate,
              credibility: determineCredibility(description, meta.shape, meta.hasMedia),
              source_type: 'nuforc',
              original_report_id: `nuforc-${meta.id}`,
              tags: extractTags(meta.shape, description)
            };

            reports.push(report);

            if (reports.length % 50 === 0) {
              console.log(`[NUFORC] Processed ${reports.length} reports...`);
            }

          } catch (e) {
            console.error(`[NUFORC] Error processing report ${meta.id}:`, e);
          }
        }

        // Minimal rate limiting between months (server is robust)
        await new Promise(resolve => setTimeout(resolve, 100));
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
        reports: reports,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};

export default nuforcAdapter;
