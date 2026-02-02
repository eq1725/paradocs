// BFRO (Bigfoot Field Researchers Organization) Adapter
// Fetches Bigfoot sighting reports from bfro.net

import { SourceAdapter, AdapterResult, ScrapedReport, ScrapedMediaItem } from '../types';

// US State mapping
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
  'DC': 'District of Columbia',
  // Canadian provinces
  'AB': 'Alberta', 'BC': 'British Columbia', 'MB': 'Manitoba', 'NB': 'New Brunswick',
  'NL': 'Newfoundland and Labrador', 'NS': 'Nova Scotia', 'NT': 'Northwest Territories',
  'NU': 'Nunavut', 'ON': 'Ontario', 'PE': 'Prince Edward Island', 'QC': 'Quebec',
  'SK': 'Saskatchewan', 'YT': 'Yukon'
};

// BFRO classification mapping
const CLASSIFICATION_MAP: Record<string, { credibility: 'low' | 'medium' | 'high'; description: string }> = {
  'Class A': { credibility: 'high', description: 'Clear sightings in circumstances where misidentification is unlikely' },
  'Class B': { credibility: 'medium', description: 'Incidents where evidence suggests sasquatch activity but no clear visual sighting' },
  'Class C': { credibility: 'low', description: 'Second-hand reports or reports that cannot be adequately verified' }
};

// Keywords for tag extraction
const TAG_KEYWORDS: Record<string, string[]> = {
  'forest': ['forest', 'woods', 'trees', 'timber', 'woodland'],
  'night': ['night', 'dark', 'evening', 'midnight', 'dusk'],
  'day': ['daylight', 'morning', 'afternoon', 'daytime'],
  'footprints': ['footprint', 'track', 'tracks', 'print', 'prints'],
  'vocalizations': ['scream', 'howl', 'vocalization', 'sound', 'noise', 'call', 'whistle'],
  'smell': ['smell', 'odor', 'stench', 'stink', 'musk'],
  'camping': ['camp', 'camping', 'tent', 'campsite', 'campground'],
  'hunting': ['hunt', 'hunting', 'hunter', 'deer', 'elk'],
  'hiking': ['hike', 'hiking', 'trail', 'backpack'],
  'driving': ['drive', 'driving', 'road', 'highway', 'car'],
  'multiple-witnesses': ['we saw', 'we both', 'my wife', 'my husband', 'group', 'friends'],
  'bipedal': ['bipedal', 'two legs', 'upright', 'walked', 'walking'],
  'large': ['large', 'huge', 'massive', 'tall', 'big'],
  'hairy': ['hairy', 'fur', 'hair', 'covered'],
  'ape-like': ['ape', 'gorilla', 'primate', 'simian'],
};

function parseDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;

  try {
    // Handle various date formats from BFRO
    const cleaned = dateStr.trim();

    // Format: "Month Year" (e.g., "August 2023")
    const monthYearMatch = cleaned.match(/^(\w+)\s+(\d{4})$/);
    if (monthYearMatch) {
      const months: Record<string, string> = {
        'January': '01', 'February': '02', 'March': '03', 'April': '04',
        'May': '05', 'June': '06', 'July': '07', 'August': '08',
        'September': '09', 'October': '10', 'November': '11', 'December': '12'
      };
      const month = months[monthYearMatch[1]];
      if (month) {
        return `${monthYearMatch[2]}-${month}-01`;
      }
    }

    // Format: "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return cleaned;
    }

    // Format: "MM/DD/YYYY"
    const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      return `${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
    }

  } catch (e) {
    console.error('[BFRO] Date parse error:', dateStr, e);
  }
  return undefined;
}

function extractTags(description: string, classification: string): string[] {
  const tags: string[] = ['bigfoot', 'sasquatch', 'cryptid', 'bfro'];

  // Add classification tag
  const classLower = classification.toLowerCase();
  if (classLower.includes('class a')) tags.push('class-a', 'clear-sighting');
  if (classLower.includes('class b')) tags.push('class-b', 'evidence-based');
  if (classLower.includes('class c')) tags.push('class-c', 'second-hand');

  // Extract keywords from description
  const descLower = description.toLowerCase();
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some(kw => descLower.includes(kw))) {
      tags.push(tag);
    }
  }

  return [...new Set(tags)];
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function generateTitle(county: string, state: string, year: string, reportNumber: string): string {
  const location = county ? `${county} County, ${state}` : state;
  const yearStr = year ? ` (${year})` : '';
  return `Bigfoot Sighting in ${location}${yearStr} - Report #${reportNumber}`.substring(0, 200);
}

function generateSummary(description: string, classification: string): string {
  // Create a brief summary from the description
  const sentences = description.split(/[.!?]/).filter(s => s.trim().length > 10);
  const firstSentences = sentences.slice(0, 2).join('. ').trim();

  let summary = firstSentences;
  if (summary.length > 400) {
    summary = summary.substring(0, 397) + '...';
  }

  // Add classification info
  if (classification && summary.length < 380) {
    summary += ` [${classification}]`;
  }

  return summary;
}

function getCredibility(classification: string): 'low' | 'medium' | 'high' {
  for (const [key, value] of Object.entries(CLASSIFICATION_MAP)) {
    if (classification.includes(key)) {
      return value.credibility;
    }
  }
  return 'medium';
}

function determineCountry(state: string): string {
  // Canadian provinces
  const canadianProvinces = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland', 'Nova Scotia',
    'Northwest Territories', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'];

  if (canadianProvinces.some(p => state.includes(p))) {
    return 'Canada';
  }
  return 'United States';
}

// Extract media URLs from BFRO report page
function extractMedia(html: string, baseUrl: string): ScrapedMediaItem[] {
  const media: ScrapedMediaItem[] = [];
  const seenUrls = new Set<string>();

  // BFRO image patterns - they host images on their domain
  // Common patterns: /GDB/image.asp?id=, direct .jpg/.gif/.png links
  const imagePatterns = [
    // Direct image links
    /src=["']([^"']*\.(?:jpg|jpeg|png|gif|webp)(?:\?[^"']*)?)["']/gi,
    // BFRO image viewer links
    /href=["']([^"']*image\.asp[^"']*)["']/gi,
    // Images in report content
    /<img[^>]+src=["']([^"']+)["']/gi,
  ];

  for (const pattern of imagePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let url = match[1];

      // Skip tiny icons, spacers, and navigation images
      if (url.includes('spacer') || url.includes('icon') || url.includes('logo') ||
          url.includes('button') || url.includes('nav') || url.includes('bullet') ||
          url.includes('1x1') || url.includes('pixel')) {
        continue;
      }

      // Make relative URLs absolute
      if (url.startsWith('/')) {
        url = `${baseUrl}${url}`;
      } else if (!url.startsWith('http')) {
        url = `${baseUrl}/GDB/${url}`;
      }

      // Skip if already seen or if it's from a different domain (spam/ad)
      if (seenUrls.has(url)) continue;
      if (!url.includes('bfro.net') && !url.includes('localhost')) continue;

      seenUrls.add(url);
      media.push({
        type: 'image',
        url: url,
        isPrimary: media.length === 0
      });
    }
  }

  return media;
}

// Fetch with retry and rate limiting
async function fetchWithRetry(url: string, retries: number = 3, delay: number = 1000): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ParaDocs Research Bot/1.0 (https://discoverparadocs.com; research@discoverparadocs.com)',
          'Accept': 'text/html,application/xhtml+xml',
        }
      });

      if (response.ok) {
        return await response.text();
      }

      if (response.status === 429) {
        await new Promise(resolve => setTimeout(resolve, delay * 2));
      }
    } catch (e) {
      console.error(`[BFRO] Fetch error (attempt ${i + 1}):`, url, e);
    }

    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return null;
}

// Parse BFRO state listing page to get report links
async function parseStateListingPage(html: string): Promise<Array<{ link: string; reportNumber: string }>> {
  const reports: Array<{ link: string; reportNumber: string }> = [];

  // BFRO report links typically look like: show_report.asp?id=XXXXX
  const linkRegex = /href=["']([^"']*show_report\.asp\?id=(\d+)[^"']*)["']/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    reports.push({
      link: match[1],
      reportNumber: match[2]
    });
  }

  return reports;
}

// Parse individual BFRO report page
async function parseReportPage(html: string, reportNumber: string, baseUrl: string): Promise<ScrapedReport | null> {
  try {
    // BFRO reports have a structured format with specific sections
    // Extract report details from the page

    // Report number and classification
    const classMatch = html.match(/Class[:\s]*(A|B|C)/i);
    const classification = classMatch ? `Class ${classMatch[1].toUpperCase()}` : 'Unknown';

    // Location details
    const countyMatch = html.match(/County:\s*([^<\n]+)/i);
    const county = countyMatch ? cleanText(countyMatch[1]) : '';

    const stateMatch = html.match(/State:\s*([^<\n]+)/i) || html.match(/Province:\s*([^<\n]+)/i);
    const stateRaw = stateMatch ? cleanText(stateMatch[1]) : '';
    const state = STATE_MAP[stateRaw] || stateRaw;

    // Date
    const dateMatch = html.match(/Date:\s*([^<\n]+)/i) || html.match(/Year:\s*(\d{4})/i);
    const dateStr = dateMatch ? cleanText(dateMatch[1]) : '';
    const eventDate = parseDate(dateStr);
    const year = eventDate ? eventDate.substring(0, 4) : (dateStr.match(/\d{4}/)?.[0] || '');

    // Description - look for the main report text
    // BFRO typically has sections like "OBSERVED:", "DESCRIPTION:", "OTHER WITNESSES:", etc.
    const observedMatch = html.match(/OBSERVED:?\s*([\s\S]*?)(?=(?:OTHER WITNESSES|ALSO NOTICED|TIME AND CONDITIONS|ENVIRONMENT|FOLLOW-UP|<\/td>|<\/div>|$))/i);
    const descriptionMatch = html.match(/DESCRIPTION[^:]*:?\s*([\s\S]*?)(?=(?:OTHER|ALSO|TIME|ENVIRONMENT|FOLLOW|<\/td>|<\/div>|$))/i);

    let description = '';
    if (observedMatch) {
      description = cleanText(observedMatch[1]);
    } else if (descriptionMatch) {
      description = cleanText(descriptionMatch[1]);
    }

    // Fallback: try to get the main content area
    if (!description || description.length < 50) {
      const contentMatch = html.match(/<td[^>]*class="[^"]*report[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
      if (contentMatch) {
        description = cleanText(contentMatch[1]);
      }
    }

    if (!description || description.length < 30) {
      console.log(`[BFRO] Skipping report ${reportNumber} - insufficient content`);
      return null;
    }

    // Truncate very long descriptions
    if (description.length > 5000) {
      description = description.substring(0, 5000) + '...';
    }

    const country = determineCountry(state);

    // Extract media from the report page
    const mediaItems = extractMedia(html, baseUrl);
    if (mediaItems.length > 0) {
      console.log(`[BFRO] Found ${mediaItems.length} media items in report #${reportNumber}`);
    }

    return {
      title: generateTitle(county, state, year, reportNumber),
      summary: generateSummary(description, classification),
      description: description,
      category: 'cryptids',
      location_name: county ? `${county} County, ${state}` : state,
      country: country,
      state_province: state,
      city: county ? `${county} County` : undefined,
      event_date: eventDate,
      credibility: getCredibility(classification),
      source_type: 'bfro',
      original_report_id: `bfro-${reportNumber}`,
      tags: mediaItems.length > 0 ? [...extractTags(description, classification), 'has-media'] : extractTags(description, classification),
      // New quality system fields
      source_label: 'BFRO Database',
      source_url: `${baseUrl}/GDB/show_report.asp?id=${reportNumber}`,
      // Media extracted from the report
      media: mediaItems.length > 0 ? mediaItems : undefined,
      metadata: {
        bfroClass: classification,
        reportNumber
      }
    };

  } catch (e) {
    console.error('[BFRO] Error parsing report:', reportNumber, e);
    return null;
  }
}

export const bfroAdapter: SourceAdapter = {
  name: 'bfro',

  async scrape(config: Record<string, any>, limit: number = 50): Promise<AdapterResult> {
    const reports: ScrapedReport[] = [];

    try {
      const baseUrl = config.base_url || 'https://www.bfro.net';
      const rateLimitMs = config.rate_limit_ms || 500;

      // BFRO organizes reports by state/province
      // We'll fetch from the recent reports or a specific state
      const recentReportsPath = config.recent_path || '/GDB/state_listing.asp?state=wa'; // Default to Washington (high activity)

      console.log(`[BFRO] Starting scrape. Base URL: ${baseUrl}, Limit: ${limit}`);

      // Get a list of states/provinces to scrape (prioritize high-activity states)
      const priorityStates = config.states || ['wa', 'or', 'ca', 'oh', 'fl', 'tx', 'pa', 'ny', 'mi', 'il'];
      const allReportLinks: Array<{ link: string; reportNumber: string }> = [];

      // Fetch report listings from multiple states until we have enough
      for (const stateCode of priorityStates) {
        if (allReportLinks.length >= limit) break;

        const listingUrl = `${baseUrl}/GDB/state_listing.asp?state=${stateCode}`;
        console.log(`[BFRO] Fetching state listing: ${stateCode}`);

        const listingHtml = await fetchWithRetry(listingUrl);

        if (listingHtml) {
          const stateReports = await parseStateListingPage(listingHtml);
          allReportLinks.push(...stateReports);
          console.log(`[BFRO] Found ${stateReports.length} reports in ${stateCode.toUpperCase()}`);
        }

        // Rate limiting between state fetches
        await new Promise(resolve => setTimeout(resolve, rateLimitMs));
      }

      console.log(`[BFRO] Total report links found: ${allReportLinks.length}`);

      // Deduplicate by report number
      const uniqueReports = Array.from(
        new Map(allReportLinks.map(r => [r.reportNumber, r])).values()
      );

      // Limit and process reports
      const toProcess = uniqueReports.slice(0, limit);

      for (const { link, reportNumber } of toProcess) {
        try {
          // Construct full URL
          const reportUrl = link.startsWith('http')
            ? link
            : `${baseUrl}/GDB/${link}`;

          const reportHtml = await fetchWithRetry(reportUrl);

          if (reportHtml) {
            const report = await parseReportPage(reportHtml, reportNumber, baseUrl);
            if (report) {
              reports.push(report);
              console.log(`[BFRO] Parsed report #${reportNumber}: ${report.title}`);
            }
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, rateLimitMs));

        } catch (e) {
          console.error('[BFRO] Error processing report:', reportNumber, e);
        }
      }

      console.log(`[BFRO] Successfully scraped ${reports.length} reports`);

      return {
        success: true,
        reports: reports
      };

    } catch (error) {
      console.error('[BFRO] Scrape error:', error);
      return {
        success: false,
        reports: reports,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};

export default bfroAdapter;
