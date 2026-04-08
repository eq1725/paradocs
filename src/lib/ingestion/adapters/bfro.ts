// BFRO (Bigfoot Field Researchers Organization) Adapter
// Fetches Bigfoot sighting reports from bfro.net

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

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

  return Array.from(new Set(tags));
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
  let location = '';
  if (county && state) {
    location = `${county} County, ${state}`;
  } else if (state) {
    location = state;
  } else if (county) {
    location = `${county} County`;
  }
  const yearStr = year ? ` (${year})` : '';
  const locationStr = location ? ` in ${location}` : '';
  return `Bigfoot Sighting${locationStr}${yearStr} - Report #${reportNumber}`.substring(0, 200);
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

// Detect whether BFRO report page has actual report images for THIS report.
// We do NOT scrape or store BFRO images — we link to the source instead.
// This matches NUFORC behavior: set has_photo_video flag + MediaMentionBanner.
// BFRO stores report images as /gdb/reportimages/{reportNumber}{letter}.jpg
// We check for this report's specific images to avoid false positives from
// sidebar thumbnails or cross-linked images from other reports.
function hasReportImages(html: string, reportNumber: string): boolean {
  var pattern = new RegExp('\\/gdb\\/reportimages\\/' + reportNumber + '[a-zA-Z]', 'i');
  return pattern.test(html);
}

// Fetch with retry and rate limiting
async function fetchWithRetry(url: string, retries: number = 3, delay: number = 1000): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Paradocs Research Bot/1.0 (https://discoverparadocs.com; research@discoverparadocs.com)',
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

    // ── Helper: extract a labeled field from BFRO HTML ──
    // BFRO uses varying HTML structures across report eras:
    //   Plain text:  "County: Jackson"
    //   HTML spans:  <span class="field">County:</span> <span>Jackson</span>
    //   HTML tables: <td>County</td><td>Jackson</td>
    //   Bold labels: <b>County:</b> Jackson
    // This helper strips tags and tries all patterns.
    const extractField = (fieldNames: string[]): string => {
      for (const name of fieldNames) {
        const patterns = [
          // Plain text: "County: Value" or "County / Parish: Value"
          new RegExp(name + '\\s*(?:\\/\\s*\\w+)?\\s*:?\\s*</(?:span|b|strong|font|td|th)>\\s*(?:<(?:span|td|th|font)[^>]*>\\s*)?([^<\\n]+)', 'i'),
          // Label outside tag: "County: Value"
          new RegExp(name + '\\s*(?:\\/\\s*\\w+)?\\s*:\\s*([^<\\n]+)', 'i'),
          // Table pattern: <td>County</td><td>Value</td>
          new RegExp(name + '\\s*</td>\\s*<td[^>]*>\\s*([^<\\n]+)', 'i'),
          // Bold label: <b>County</b>: Value
          new RegExp('<b[^>]*>' + name + '[^<]*</b>\\s*:?\\s*([^<\\n]+)', 'i'),
        ];
        for (const p of patterns) {
          const m = html.match(p);
          if (m && m[1] && m[1].trim().length > 0 && m[1].trim().length < 100) {
            return cleanText(m[1]);
          }
        }
      }
      return '';
    };

    // Location details
    let county = extractField(['County', 'Parish']);
    let stateRaw = extractField(['State', 'State/Province', 'Province']);
    const state = STATE_MAP[stateRaw] || stateRaw;

    // If state is still empty, try the page title
    let fallbackState = state;
    if (!fallbackState) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)/i);
      if (titleMatch) {
        const stateInTitle = titleMatch[1].match(/(?:in|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        if (stateInTitle) fallbackState = stateInTitle[1];
      }
    }

    // If state is STILL empty, try the URL of the state listing page that linked here
    // BFRO URLs like state_listing.asp?state=wa encode the state
    if (!fallbackState) {
      // Try to find the state in the page breadcrumbs or navigation links
      const breadcrumbMatch = html.match(/state_listing\.asp\?state=(\w{2})/i);
      if (breadcrumbMatch) {
        const stateCode = breadcrumbMatch[1].toUpperCase();
        fallbackState = STATE_MAP[stateCode] || '';
      }
    }

    // Date — try multiple field names used across BFRO report eras
    let dateStr = extractField(['Date', 'Date of encounter', 'Date of observation',
      'Date occurred', 'Date Occurred', 'Submitted', 'Date submitted',
      'YEAR', 'Year', 'MONTH', 'Month', 'Season']);
    if (!dateStr) {
      // Try standalone Year field patterns
      const yearMatch = html.match(/Year:\s*(\d{4})/i)
        || html.match(/>Year<\/\w+>\s*(?:<\w+[^>]*>)?\s*(\d{4})/i)
        || html.match(/>(\d{4})<\/(?:span|td)/i);
      if (yearMatch) dateStr = yearMatch[1] || yearMatch[2];
    }
    // BFRO page titles sometimes contain the date: "Report 78322 (August 2023)"
    if (!dateStr) {
      const titleDateMatch = html.match(/<title[^>]*>[^<]*\((\w+\s+\d{4})\)/i);
      if (titleDateMatch) dateStr = titleDateMatch[1];
    }
    // Last resort: find any 4-digit year in the structured data section (between County/State and OBSERVED)
    if (!dateStr) {
      const structuredSection = html.match(/(?:County|State|Province)[\s\S]{0,500}?OBSERVED/i);
      if (structuredSection) {
        const yearInSection = structuredSection[0].match(/\b(19\d{2}|20[0-2]\d)\b/);
        if (yearInSection) dateStr = yearInSection[1];
      }
    }
    const eventDate = parseDate(dateStr);
    const year = eventDate ? eventDate.substring(0, 4) : (dateStr.match(/\d{4}/)?.[0] || '');

    // ── Extract ALL structured sections from the BFRO report page ──
    // BFRO pages have labeled sections: OBSERVED, ALSO NOTICED, OTHER WITNESSES,
    // OTHER STORIES, TIME AND CONDITIONS, ENVIRONMENT, FOLLOW-UP INVESTIGATION, etc.

    const extractSection = (sectionName: string): string => {
      // Try multiple patterns since BFRO formatting varies across report eras
      const patterns = [
        new RegExp(sectionName + ':?\\s*([\\s\\S]*?)(?=(?:OBSERVED|ALSO NOTICED|OTHER WITNESSES|OTHER STORIES|TIME AND CONDITIONS|ENVIRONMENT|FOLLOW-UP|A REPORT BY|<\\/td>|<\\/div>))', 'i'),
        new RegExp('<b>' + sectionName + '[^<]*<\\/b>\\s*:?\\s*([\\s\\S]*?)(?=<b>|<\\/td>|<\\/div>)', 'i'),
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m && m[1]) {
          const cleaned = cleanText(m[1]);
          if (cleaned.length > 5) return cleaned;
        }
      }
      return '';
    };

    // Primary narrative
    let description = extractSection('OBSERVED') || extractSection('DESCRIPTION');

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

    // Additional structured sections
    const alsoNoticed = extractSection('ALSO NOTICED');
    const otherWitnesses = extractSection('OTHER WITNESSES');
    const otherStories = extractSection('OTHER STORIES');
    const timeAndConditions = extractSection('TIME AND CONDITIONS');
    const environment = extractSection('ENVIRONMENT');

    // Follow-up / investigator report (may use different labels)
    const followUp = extractSection('FOLLOW-UP') || extractSection('FOLLOW UP')
      || extractSection('A REPORT BY');

    // Nearest town and road — use same robust extractField helper
    let nearestTown = extractField(['Nearest town', 'Nearest city']);
    let nearestRoad = extractField(['Nearest road', 'Nearest highway']);

    // Parse witness count from OTHER WITNESSES section
    let witnessCount: number | undefined;
    if (otherWitnesses) {
      // Look for explicit numbers: "2 other witnesses", "my wife and I" (=2), "group of 5", etc.
      const numMatch = otherWitnesses.match(/(\d+)\s*(?:other\s*)?(?:witness|people|person|friend|companion)/i);
      if (numMatch) {
        witnessCount = parseInt(numMatch[1], 10) + 1; // +1 for the reporting witness
      } else if (/\b(my\s+(?:wife|husband|partner|friend|brother|sister|son|daughter)\s+and\s+I|wife|husband)\b/i.test(otherWitnesses)) {
        witnessCount = 2;
      } else if (/\bnone\b/i.test(otherWitnesses)) {
        witnessCount = 1;
      }
    }

    // Parse time from TIME AND CONDITIONS section
    let eventTime: string | undefined;
    if (timeAndConditions) {
      // Look for time patterns: "9:30 PM", "approximately 2am", "about midnight", "dusk"
      const timeMatch = timeAndConditions.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.)?)/);
      if (timeMatch) {
        eventTime = timeMatch[1].trim();
      } else {
        const vagueTime = timeAndConditions.match(/\b(dawn|sunrise|morning|midday|noon|afternoon|dusk|sunset|evening|night|midnight)\b/i);
        if (vagueTime) eventTime = vagueTime[1].toLowerCase();
      }
    }

    // Append ALSO NOTICED to description for richer analysis context
    if (alsoNoticed && alsoNoticed.length > 10) {
      description = description + '\n\n' + alsoNoticed;
      if (description.length > 5000) {
        description = description.substring(0, 5000) + '...';
      }
    }

    const country = determineCountry(state);

    // Detect if report has photos (we don't scrape them — link to source instead)
    const hasMedia = hasReportImages(html, reportNumber);
    if (hasMedia) {
      console.log(`[BFRO] Report #${reportNumber} has photos on source page`);
    }

    // Determine event_date_precision based on date parsing
    let eventDatePrecision: 'exact' | 'month' | 'year' | 'decade' | 'estimated' | 'unknown' = 'unknown';
    if (eventDate) {
      // Check if we have a full date (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
        eventDatePrecision = 'exact';
      } else if (/^\d{4}-\d{2}/.test(eventDate)) {
        eventDatePrecision = 'month';
      } else if (/^\d{4}/.test(eventDate)) {
        eventDatePrecision = 'year';
      }
    }

    const locationState = state || fallbackState;

    // Use nearest town for city field if available (more specific than county)
    const cityValue = nearestTown || (county ? `${county} County` : undefined);

    // Build richer location_name with nearest town when available
    let locationName: string | undefined;
    if (nearestTown && county && locationState) {
      locationName = `Near ${nearestTown}, ${county} County, ${locationState}`;
    } else if (county && locationState) {
      locationName = `${county} County, ${locationState}`;
    } else {
      locationName = locationState || undefined;
    }

    // Build comprehensive tags including environment data
    let allTags = extractTags(description, classification);
    if (hasMedia) allTags.push('has-media');
    if (followUp) allTags.push('investigated');
    if (environment) {
      // Extract terrain tags from environment section
      const envLower = environment.toLowerCase();
      if (/\b(mountain|ridge|elevation)\b/.test(envLower)) allTags.push('mountainous');
      if (/\b(swamp|marsh|bog|wetland)\b/.test(envLower)) allTags.push('swamp');
      if (/\b(river|creek|stream|lake|pond)\b/.test(envLower)) allTags.push('near-water');
      if (/\b(rural|remote|isolated)\b/.test(envLower)) allTags.push('remote');
      if (/\b(residential|suburban|neighborhood)\b/.test(envLower)) allTags.push('residential');
    }
    allTags = Array.from(new Set(allTags));

    return {
      title: generateTitle(county, locationState, year, reportNumber),
      summary: generateSummary(description, classification),
      description: description,
      category: 'cryptids',
      location_name: locationName,
      country: country,
      state_province: locationState || undefined,
      city: cityValue,
      event_date: eventDate,
      event_time: eventTime,
      event_date_precision: eventDatePrecision,
      credibility: getCredibility(classification),
      witness_count: witnessCount,
      has_official_report: !!followUp, // BFRO follow-up = investigated
      source_type: 'bfro',
      original_report_id: `bfro-${reportNumber}`,
      tags: allTags,
      // New quality system fields
      source_label: 'BFRO Database',
      source_url: `${baseUrl}/GDB/show_report.asp?id=${reportNumber}`,
      // No media stored — we link to source page instead (same as NUFORC approach)
      has_photo_video: hasMedia,
      metadata: {
        bfroClass: classification,
        reportNumber,
        nearestTown: nearestTown || undefined,
        nearestRoad: nearestRoad || undefined,
        otherWitnesses: otherWitnesses || undefined,
        otherStories: otherStories || undefined,
        timeAndConditions: timeAndConditions || undefined,
        environment: environment || undefined,
        followUpInvestigation: followUp || undefined,
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
