// NUFORC (National UFO Reporting Center) Adapter
// Fetches UFO sighting reports from nuforc.org (new WordPress-based site)

import { SourceAdapter, AdapterResult, ScrapedReport, ScrapedMediaItem } from '../types';

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

// Extract wpDataTable AJAX configuration from the page HTML
function findWpDataTableConfig(html: string): { tableId: string; ajaxUrl: string } | null {
  // Look for wpDataTables initialization in script blocks
  // Common patterns: wpdatatables_init_XXX, wpDataTablesGlobalData, data-wpdatatable_id

  // Pattern 1: data-wpdatatable_id attribute on table element
  var tableIdMatch = html.match(/data-wpdatatable_id=['"](\d+)['"]/i);

  // Pattern 2: wdt_var.table_id in script
  if (!tableIdMatch) {
    tableIdMatch = html.match(/table_id\s*[:=]\s*['"]?(\d+)['"]?/i);
  }

  // Pattern 3: wpDataTable ID in initialization script
  if (!tableIdMatch) {
    tableIdMatch = html.match(/wpdatatables\[['"]?(\d+)['"]?\]/i);
  }

  if (!tableIdMatch) return null;

  var tableId = tableIdMatch[1];

  // Find the AJAX URL — usually wp-admin/admin-ajax.php or similar
  var ajaxUrlMatch = html.match(/["'](https?:\/\/[^"']*admin-ajax\.php)["']/i);
  if (!ajaxUrlMatch) {
    // Default WordPress AJAX endpoint
    var siteUrlMatch = html.match(/(https?:\/\/nuforc\.org)/i);
    var siteUrl = siteUrlMatch ? siteUrlMatch[1] : 'https://nuforc.org';
    return { tableId: tableId, ajaxUrl: siteUrl + '/wp-admin/admin-ajax.php' };
  }

  return { tableId: tableId, ajaxUrl: ajaxUrlMatch[1] };
}

// Fetch wpDataTable data via AJAX endpoint (server-side processing)
async function fetchWpDataTableData(config: { tableId: string; ajaxUrl: string }, monthUrl: string): Promise<ReportMetadata[]> {
  var reports: ReportMetadata[] = [];

  try {
    // wpDataTables uses DataTables server-side processing
    // The AJAX endpoint expects POST with DataTables parameters
    var params = new URLSearchParams();
    params.append('action', 'get_wdtable');
    params.append('table_id', config.tableId);
    params.append('draw', '1');
    params.append('start', '0');
    params.append('length', '500'); // Get up to 500 rows per request
    params.append('wdtNonce', ''); // May need nonce — try without first

    console.log('[NUFORC] Attempting wpDataTable AJAX fetch: ' + config.ajaxUrl + ' (table_id: ' + config.tableId + ')');

    var response = await fetch(config.ajaxUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': monthUrl,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: params.toString()
    });

    if (!response.ok) {
      console.log('[NUFORC] AJAX fetch failed: HTTP ' + response.status);
      return reports;
    }

    var json = await response.json() as any;

    // DataTables response format: { data: [[cell1, cell2, ...], ...] } or { data: [{col: val}, ...] }
    if (!json.data || !Array.isArray(json.data)) {
      console.log('[NUFORC] AJAX response has no data array');
      return reports;
    }

    console.log('[NUFORC] AJAX returned ' + json.data.length + ' rows');

    for (var row of json.data) {
      try {
        var rowData: string[];

        // Handle both array and object formats
        if (Array.isArray(row)) {
          rowData = row.map(function(cell: any) { return cleanText(String(cell || '').replace(/<[^>]+>/g, '')); });
        } else {
          // Object format — extract values in column order
          rowData = Object.values(row).map(function(cell: any) { return cleanText(String(cell || '').replace(/<[^>]+>/g, '')); });
        }

        // Extract sighting ID from the first cell (which contains the link)
        var rawFirstCell = Array.isArray(row) ? String(row[0] || '') : String(Object.values(row)[0] || '');
        var idMatch = rawFirstCell.match(/\/sighting\/\?id=(\d+)/);
        if (!idMatch) continue;

        // Column order: Link, Occurred, City, State, Country, Shape, Summary, Reported, HasMedia, Explanation
        if (rowData.length >= 7) {
          reports.push({
            id: idMatch[1],
            occurred: rowData[1] || '',
            city: rowData[2] || '',
            state: rowData[3] || '',
            country: rowData[4] || 'USA',
            shape: rowData[5] || 'unknown',
            summary: rowData[6] || '',
            reported: rowData[7] || '',
            hasMedia: (rowData[8] || '').toLowerCase() === 'y' || (rowData[8] || '').toLowerCase() === 'yes',
            explanation: rowData[9] || ''
          });
        }
      } catch (e) {
        // Skip malformed rows
      }
    }

    console.log('[NUFORC] AJAX parsing produced ' + reports.length + ' reports');
  } catch (e) {
    console.log('[NUFORC] AJAX fetch error: ' + (e instanceof Error ? e.message : String(e)));
  }

  return reports;
}

async function parseMonthPage(html: string, monthUrl: string): Promise<ReportMetadata[]> {
  var reports: ReportMetadata[] = [];

  // Debug: Log HTML size and look for key markers
  console.log('[NUFORC] HTML size: ' + html.length + ' bytes');
  var hasSightingLink = html.includes('/sighting/?id=');
  var hasWpDataTable = html.includes('wpDataTable') || html.includes('wpdatatables');
  console.log('[NUFORC] Contains sighting link: ' + hasSightingLink);
  console.log('[NUFORC] Contains wpDataTable: ' + hasWpDataTable);

  // ===== APPROACH 0: wpDataTable AJAX (most reliable for JS-rendered tables) =====
  if (hasWpDataTable) {
    var tableConfig = findWpDataTableConfig(html);
    if (tableConfig) {
      var ajaxReports = await fetchWpDataTableData(tableConfig, monthUrl);
      if (ajaxReports.length > 0) {
        console.log('[NUFORC] wpDataTable AJAX succeeded: ' + ajaxReports.length + ' reports');
        return ajaxReports;
      }
      console.log('[NUFORC] wpDataTable AJAX returned 0 reports, falling back to HTML parsing');
    } else {
      console.log('[NUFORC] Could not find wpDataTable config in HTML');
    }
  }

  // ===== APPROACH 1: Extract sighting IDs and match to HTML table rows =====
  var sightingIds: string[] = [];
  var match: RegExpExecArray | null;

  // Find all sighting IDs using multiple patterns
  var idPatterns = [
    /href='\/sighting\/\?id=(\d+)'/gi,
    /href="\/sighting\/\?id=(\d+)"/gi,
    /\/sighting\/\?id=(\d+)/gi
  ];

  for (var p = 0; p < idPatterns.length; p++) {
    if (sightingIds.length > 0) break;
    while ((match = idPatterns[p].exec(html)) !== null) {
      if (sightingIds.indexOf(match[1]) === -1) {
        sightingIds.push(match[1]);
      }
    }
    if (sightingIds.length > 0) {
      console.log('[NUFORC] ID pattern ' + (p + 1) + ' found ' + sightingIds.length + ' sighting IDs');
    }
  }

  if (sightingIds.length === 0) {
    console.log('[NUFORC] No sighting IDs found in HTML');
    return reports;
  }

  console.log('[NUFORC] Total unique sighting IDs: ' + sightingIds.length);

  // Try row-by-row extraction: split HTML into table rows first, then match
  // This avoids the regex backtracking issue where all IDs match the same row
  var rowSplitPattern = /<tr[^>]*>/gi;
  var rowStarts: number[] = [];
  while ((match = rowSplitPattern.exec(html)) !== null) {
    rowStarts.push(match.index);
  }

  if (rowStarts.length > 1) {
    // Extract each row as a substring between consecutive <tr> tags
    var rowsFound = 0;
    for (var ri = 0; ri < rowStarts.length; ri++) {
      var rowStart = rowStarts[ri];
      var rowEnd = ri + 1 < rowStarts.length ? rowStarts[ri + 1] : html.length;
      var rowHtml = html.substring(rowStart, rowEnd);

      // Skip header rows
      if (rowHtml.includes('<th')) continue;

      // Check if this row contains a sighting link
      var rowIdMatch = rowHtml.match(/\/sighting\/\?id=(\d+)/);
      if (!rowIdMatch) continue;

      var rowId = rowIdMatch[1];

      // Extract all td cells from this specific row
      var cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      var cells: string[] = [];
      var cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
        cells.push(cleanText(cellMatch[1].replace(/<[^>]+>/g, '')));
      }

      // Column order: Link, Occurred, City, State, Country, Shape, Summary, Reported, Media, Explanation
      if (cells.length >= 7) {
        reports.push({
          id: rowId,
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
        rowsFound++;
      }
    }

    if (reports.length > 0) {
      console.log('[NUFORC] Row-split extraction found ' + reports.length + ' reports');

      // Validate: check if all reports have the same metadata (indicating the old bug)
      if (reports.length > 1) {
        var firstCity = reports[0].city;
        var firstShape = reports[0].shape;
        var allSame = reports.every(function(r) { return r.city === firstCity && r.shape === firstShape; });
        if (allSame) {
          console.log('[NUFORC] WARNING: All reports have identical metadata — likely parsing from non-data HTML');
          console.log('[NUFORC] First report: city=' + firstCity + ' shape=' + firstShape + ' occurred=' + reports[0].occurred);
          // Clear these — they're bad data
          reports = [];
          console.log('[NUFORC] Cleared duplicate-metadata reports, will use fetch_full_details fallback');
        }
      }

      if (reports.length > 0) return reports;
    }
  }

  // ===== APPROACH 2: Class-based cell extraction (DataTables rendered HTML) =====
  var classRowPattern = /<tr[^>]*class="(?:odd|even)"[^>]*>([\s\S]*?)<\/tr>/gi;

  while ((match = classRowPattern.exec(html)) !== null) {
    var classRowHtml = match[1];
    var classIdMatch = classRowHtml.match(/href=['"]\/sighting\/\?id=(\d+)['"]/i);
    if (!classIdMatch) continue;

    var extractCell = function(className: string): string {
      var pattern = new RegExp('<td[^>]*class="[^"]*column-' + className + '[^"]*"[^>]*>([\\s\\S]*?)<\\/td>', 'i');
      var cellMatch = classRowHtml.match(pattern);
      if (cellMatch) {
        return cleanText(cellMatch[1].replace(/<[^>]+>/g, ''));
      }
      return '';
    };

    var occurred = extractCell('occurred');
    var city = extractCell('city');
    var state = extractCell('state');
    var country = extractCell('country') || 'USA';
    var shape = extractCell('shape') || 'unknown';
    var summary = extractCell('summary');
    var reported = extractCell('reported');
    var hasImage = extractCell('hasimage');
    var explanation = extractCell('explanation');

    if (occurred || summary) {
      reports.push({
        id: classIdMatch[1],
        occurred: occurred,
        city: city,
        state: state,
        country: country,
        shape: shape,
        summary: summary,
        reported: reported,
        hasMedia: hasImage.toLowerCase() === 'y' || hasImage.toLowerCase() === 'yes',
        explanation: explanation
      });
    }
  }

  if (reports.length > 0) {
    console.log('[NUFORC] Class-based parsing found ' + reports.length + ' reports');
    return reports;
  }

  // ===== APPROACH 3: IDs only (no row data available — return IDs for fetch_full_details) =====
  // If we have sighting IDs but couldn't extract row data, return minimal metadata
  // so the adapter can use fetch_full_details to get each report individually
  if (sightingIds.length > 0) {
    console.log('[NUFORC] No row data found — returning ' + sightingIds.length + ' IDs for individual fetch');
    for (var si = 0; si < sightingIds.length; si++) {
      reports.push({
        id: sightingIds[si],
        occurred: '',
        city: '',
        state: '',
        country: 'USA',
        shape: 'unknown',
        summary: '',
        reported: '',
        hasMedia: false,
        explanation: ''
      });
    }
  }

  return reports;
}

// Extract media from NUFORC report page
function extractMediaFromPage(html: string): ScrapedMediaItem[] {
  const media: ScrapedMediaItem[] = [];
  const seenUrls = new Set<string>();

  // NUFORC image patterns - they often link to images on various hosts
  const imagePatterns = [
    // Direct image links
    /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^"']*)?)["']/gi,
    // Links to images
    /<a[^>]+href=["']([^"']+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^"']*)?)["']/gi,
    // WordPress media uploads
    /src=["'](https?:\/\/[^"']*\/wp-content\/uploads\/[^"']+)["']/gi,
    // Figure tags with images
    /<figure[^>]*>[\s\S]*?src=["']([^"']+)["']/gi,
  ];

  for (const pattern of imagePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1];

      // Skip icons, logos, and tiny images
      if (url.includes('icon') || url.includes('logo') || url.includes('avatar') ||
          url.includes('sprite') || url.includes('1x1') || url.includes('blank') ||
          url.includes('loading') || url.includes('placeholder')) {
        continue;
      }

      // Skip if already seen
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      media.push({
        type: 'image',
        url: url,
        isPrimary: media.length === 0
      });
    }
  }

  // Also look for YouTube/video embeds
  const videoPatterns = [
    /src=["'](https?:\/\/(?:www\.)?youtube\.com\/embed\/[^"']+)["']/gi,
    /href=["'](https?:\/\/(?:www\.)?youtube\.com\/watch[^"']+)["']/gi,
    /href=["'](https?:\/\/youtu\.be\/[^"']+)["']/gi,
  ];

  for (const pattern of videoPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1];
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      media.push({
        type: 'video',
        url: url,
        isPrimary: media.length === 0
      });
    }
  }

  return media;
}

// Fetch and parse individual report page for full details
async function fetchReportDetails(id: string): Promise<{
  description: string;
  duration: string;
  observers: number;
  color: string;
  location: string;
  shape: string;
  occurred: string;
  city: string;
  state: string;
  country: string;
  media: ScrapedMediaItem[];
} | null> {
  var url = 'https://nuforc.org/sighting/?id=' + id;
  var rawHtml = await fetchWithHeaders(url, 2);
  if (!rawHtml) return null;
  var html: string = rawHtml;

  // Extract fields from the report page metadata
  var extractField = function(label: string): string {
    // Try multiple patterns — NUFORC pages vary in structure
    var patterns = [
      new RegExp('<strong>' + label + ':?</strong>\\s*([^<]+)', 'i'),
      new RegExp(label + '\\s*:\\s*</(?:strong|b|th|td)>\\s*(?:<[^>]+>)?\\s*([^<]+)', 'i'),
      new RegExp('<td[^>]*>' + label + '</td>\\s*<td[^>]*>([^<]+)</td>', 'i')
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = html.match(patterns[i]);
      if (m) return cleanText(m[1]);
    }
    return '';
  };

  // Extract description - it's in paragraph tags after the metadata
  var descMatch = html.match(/<\/p>\s*<p[^>]*>([\s\S]*?)<p[^>]*><em>Posted/i) ||
                  html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                  html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  var description = '';
  if (descMatch) {
    description = cleanText(descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  }

  // Extract structured metadata from the detail page
  var occurred = extractField('Occurred') || extractField('Date') || extractField('Event Date');
  var city = extractField('City');
  var state = extractField('State') || extractField('Province');
  var country = extractField('Country');
  var shape = extractField('Shape') || extractField('Object Shape');
  var location = extractField('Location');

  // Parse city/state from location if not found separately
  if (!city && !state && location) {
    var locParts = location.split(',');
    if (locParts.length >= 2) {
      city = locParts[0].trim();
      state = locParts[1].trim();
    }
  }

  // Extract media from the page
  var media = extractMediaFromPage(html);
  if (media.length > 0) {
    console.log('[NUFORC] Found ' + media.length + ' media items in report ' + id);
  }

  return {
    description: description,
    duration: extractField('Duration'),
    observers: parseInt(extractField('No of observers')) || 1,
    color: extractField('Color'),
    location: location,
    shape: shape,
    occurred: occurred,
    city: city,
    state: state,
    country: country || 'USA',
    media: media
  };
}

export const nuforcAdapter: SourceAdapter = {
  name: 'nuforc',

  async scrape(config: Record<string, any>, limit: number = 100): Promise<AdapterResult> {
    const reports: ScrapedReport[] = [];
    var rateLimitMs = config.rate_limit_ms || 500; // 500ms default — respects NUFORC server
    var fetchFullDetails = config.fetch_full_details === true; // Default to FALSE for speed
    var maxMonths = config.max_months || 6; // Fewer months by default to avoid timeout

    try {
      console.log('[NUFORC] Starting scrape. Limit: ' + limit + ', Max months: ' + maxMonths);

      // Fetch the main index page
      var indexUrl = 'https://nuforc.org/ndx/?id=event';
      var indexHtml = await fetchWithHeaders(indexUrl);

      if (!indexHtml) {
        return {
          success: false,
          reports: [],
          error: 'Failed to fetch NUFORC index page'
        };
      }

      // Parse available months
      var months = await parseMainIndex(indexHtml);
      console.log('[NUFORC] Found ' + months.length + ' months in index');

      if (months.length === 0) {
        // Fallback: Try known recent months
        var now = new Date();
        for (var i = 0; i < maxMonths; i++) {
          var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          var monthId = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
          months.push({ monthId: monthId, count: 100 });
        }
        console.log('[NUFORC] Using fallback months: ' + months.map(function(m) { return m.monthId; }).join(', '));
      }

      // Process months until we have enough reports
      var monthsToProcess = months.slice(0, maxMonths);

      for (var month of monthsToProcess) {
        if (reports.length >= limit) break;

        var monthUrl = 'https://nuforc.org/subndx/?id=e' + month.monthId;
        console.log('[NUFORC] Fetching month ' + month.monthId + '...');

        var monthHtml = await fetchWithHeaders(monthUrl);
        if (!monthHtml) {
          console.log('[NUFORC] Failed to fetch month ' + month.monthId);
          continue;
        }

        var monthReports = await parseMonthPage(monthHtml, monthUrl);
        console.log('[NUFORC] Found ' + monthReports.length + ' reports in month ' + month.monthId);

        // Check if we got IDs without meaningful row data — auto-enable full details
        // A summary must be >50 chars to count as real data (otherwise it's just a shape label like "Disk")
        var hasRowData = monthReports.some(function(r) { return r.summary.length > 50 || r.city.length > 0; });
        var needFullDetails = fetchFullDetails || !hasRowData;
        if (!hasRowData && monthReports.length > 0) {
          console.log('[NUFORC] No usable row data (summaries too short) — auto-enabling fetch_full_details for individual pages');
        }

        for (var meta of monthReports) {
          if (reports.length >= limit) break;

          try {
            var description = meta.summary;
            var duration = '';
            var mediaItems: ScrapedMediaItem[] = [];

            // Fetch full report details when:
            // 1. fetch_full_details is enabled, OR
            // 2. No row data was parsed (wpDataTable AJAX failed), OR
            // 3. Description is too short and might benefit from full page scrape
            if (needFullDetails || (fetchFullDetails && (description.length < 200 || meta.hasMedia))) {
              await new Promise(function(resolve) { setTimeout(resolve, rateLimitMs); });
              var details = await fetchReportDetails(meta.id);
              if (details) {
                description = details.description || meta.summary;
                duration = details.duration;
                mediaItems = details.media;
                // Fill in missing row data from detail page
                if (!meta.city && details.city) meta.city = details.city;
                if (!meta.state && details.state) meta.state = details.state;
                if (!meta.country && details.country) meta.country = details.country;
                if ((!meta.shape || meta.shape === 'unknown') && details.shape) meta.shape = details.shape;
                if (!meta.occurred && details.occurred) meta.occurred = details.occurred;
              }
            }

            var state = STATE_MAP[meta.state] || meta.state;
            var eventDate = parseDate(meta.occurred);
            var locationName = meta.city ? meta.city + ', ' + state : state;

            // Build tags array
            var baseTags = extractTags(meta.shape, description);
            var tags = mediaItems.length > 0 ? baseTags.concat(['has-media']) : baseTags;

            // Determine event_date_precision based on date parsing
            var eventDatePrecision: 'exact' | 'month' | 'year' | 'decade' | 'estimated' | 'unknown' = 'unknown';
            if (eventDate) {
              if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
                eventDatePrecision = 'exact';
              } else if (/^\d{4}-\d{2}/.test(eventDate)) {
                eventDatePrecision = 'month';
              } else if (/^\d{4}/.test(eventDate)) {
                eventDatePrecision = 'year';
              }
            }

            var titleShape = meta.shape || 'UFO';
            var titleDate = eventDate ? ' (' + eventDate + ')' : '';
            var report: ScrapedReport = {
              title: (titleShape + ' Sighting in ' + locationName + titleDate).substring(0, 200),
              summary: meta.summary.length > 400 ? meta.summary.substring(0, 397) + '...' : meta.summary,
              description: description,
              category: 'ufos_aliens',
              location_name: locationName,
              country: meta.country === 'USA' ? 'United States' : meta.country,
              state_province: state,
              city: meta.city,
              event_date: eventDate,
              event_date_precision: eventDatePrecision,
              credibility: determineCredibility(description, meta.shape, meta.hasMedia || mediaItems.length > 0),
              source_type: 'nuforc',
              original_report_id: 'nuforc-' + meta.id,
              tags: tags,
              source_label: 'NUFORC',
              source_url: 'https://nuforc.org/sighting/?id=' + meta.id,
              media: mediaItems.length > 0 ? mediaItems : undefined,
              metadata: {
                shape: meta.shape,
                hasMedia: meta.hasMedia || mediaItems.length > 0,
                duration: duration,
                reportId: meta.id
              }
            };

            reports.push(report);

            if (reports.length % 50 === 0) {
              console.log('[NUFORC] Processed ' + reports.length + ' reports...');
            }

          } catch (e) {
            console.error('[NUFORC] Error processing report ' + meta.id + ':', e);
          }
        }

        // Minimal rate limiting between months (server is robust)
        await new Promise(function(resolve) { setTimeout(resolve, 100); });
      }

      console.log('[NUFORC] Successfully scraped ' + reports.length + ' reports');

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
