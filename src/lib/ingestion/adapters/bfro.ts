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

  var MONTHS: Record<string, string> = {
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12'
  };

  try {
    var cleaned = dateStr.trim();

    // Format: "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return cleaned;
    }

    // Format: "MM/DD/YYYY"
    var slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      return slashMatch[3] + '-' + slashMatch[1].padStart(2, '0') + '-' + slashMatch[2].padStart(2, '0');
    }

    // Format: "Month DD, YYYY" or "Month DD YYYY" (e.g., "July 21, 2023")
    var fullDateMatch = cleaned.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (fullDateMatch) {
      var m = MONTHS[fullDateMatch[1].toLowerCase()];
      if (m) {
        return fullDateMatch[3] + '-' + m + '-' + fullDateMatch[2].padStart(2, '0');
      }
    }

    // Format: "DD Month YYYY" (e.g., "21 July 2023")
    var dmyMatch = cleaned.match(/^(\d{1,2})\s+(\w+),?\s+(\d{4})$/);
    if (dmyMatch) {
      var m2 = MONTHS[dmyMatch[2].toLowerCase()];
      if (m2) {
        return dmyMatch[3] + '-' + m2 + '-' + dmyMatch[1].padStart(2, '0');
      }
    }

    // Format: "Month Year" (e.g., "August 2023")
    var monthYearMatch = cleaned.match(/^(\w+)\s+(\d{4})$/);
    if (monthYearMatch) {
      var m3 = MONTHS[monthYearMatch[1].toLowerCase()];
      if (m3) {
        return monthYearMatch[2] + '-' + m3 + '-01';
      }
    }

    // Format: bare year "2023"
    var bareYear = cleaned.match(/^(\d{4})$/);
    if (bareYear) {
      return bareYear[1] + '-01-01';
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
    // Smart quotes and special chars — BFRO pages often use Windows-1252 encoding
    // which produces replacement chars (U+FFFD) or mojibake when decoded as UTF-8
    .replace(/\uFFFD/g, "'")           // Replacement character → apostrophe (most common case)
    .replace(/[\u2018\u2019\u201A]/g, "'")  // Smart single quotes → ASCII apostrophe
    .replace(/[\u201C\u201D\u201E]/g, '"')  // Smart double quotes → ASCII double quote
    .replace(/\u2013/g, '-')           // En dash → hyphen
    .replace(/\u2014/g, '--')          // Em dash → double hyphen
    .replace(/\u2026/g, '...')         // Ellipsis → three dots
    .replace(/\s+/g, ' ')
    .trim();
}

function generateTitle(county: string, state: string, year: string, reportNumber: string, nearestTown?: string): string {
  // Visitor-friendly title: "Bigfoot Encounter Near [Town], [State] ([Year])"
  // BFRO report number and classification are stored in metadata, not shown in title
  var locationParts: string[] = []
  if (nearestTown) {
    // Avoid "Near Town, Town County" when town name matches county
    locationParts.push('Near ' + nearestTown)
    if (county && county.toLowerCase() !== nearestTown.toLowerCase()) {
      locationParts.push(county + ' County')
    }
  } else if (county) {
    locationParts.push(county + ' County')
  }
  if (state) {
    // Avoid "Ohio, Ohio" — don't add state if it matches town or county
    var stateLower = state.toLowerCase()
    var alreadyHasState = locationParts.some(function(p) {
      return p.toLowerCase().indexOf(stateLower) !== -1
    })
    if (!alreadyHasState) {
      locationParts.push(state)
    }
  }

  var locationStr = locationParts.length > 0 ? ' ' + locationParts.join(', ') : ''
  var yearStr = year ? ' (' + year + ')' : ''

  return ('Bigfoot Encounter' + locationStr + yearStr).substring(0, 200)
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
        // BFRO pages may use Windows-1252 encoding — decode with correct charset
        // to avoid mojibake (smart quotes → replacement characters)
        var contentType = response.headers.get('content-type') || '';
        var charsetMatch = contentType.match(/charset=([^\s;]+)/i);
        var charset = charsetMatch ? charsetMatch[1].trim().toLowerCase() : '';
        if (charset && charset !== 'utf-8' && charset !== 'utf8') {
          try {
            var buf = await response.arrayBuffer();
            var decoder = new TextDecoder(charset);
            return decoder.decode(buf);
          } catch (decodeErr) {
            // If TextDecoder doesn't support the charset, fall back to .text()
            console.log('[BFRO] TextDecoder failed for charset ' + charset + ', falling back to text()');
          }
        }
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

    // Date — BFRO pages use separate YEAR, MONTH, DATE fields.
    // Try to combine them first before falling back to single-field extraction.
    let dateStr = '';
    var bfroYear = extractField(['YEAR', 'Year']);
    var bfroMonth = extractField(['MONTH', 'Month']);
    // Use only uppercase 'DATE' to avoid matching 'Date of encounter' etc.
    var bfroDay = extractField(['DATE']);
    // If DATE field returned a full date string or month name, it matched the wrong field
    if (bfroDay && !/^\d{1,2}$/.test(bfroDay.trim())) {
      console.log('[BFRO] #' + reportNumber + ' DATE field returned non-numeric: "' + bfroDay + '" — discarding');
      bfroDay = '';
    }
    // Fallback: try to extract day number directly from HTML near MONTH field
    // BFRO pages often have: "MONTH: May</span>...<span>DATE: 14</span>"
    // The generic extractField may miss this due to HTML structure variations
    if (!bfroDay && bfroMonth) {
      var dayPatterns = [
        // "DATE</span>...<span>14" or "DATE:</span>...<span>14"
        /DATE\s*:?\s*<\/[^>]+>\s*(?:<[^>]+>\s*)*(\d{1,2})\b/i,
        // "DATE: 14" plain text after stripping tags
        /\bDATE\s*:\s*(\d{1,2})\b/,
        // Table: "<td>DATE</td><td>14</td>"
        /DATE\s*<\/td>\s*<td[^>]*>\s*(\d{1,2})\s*</i,
      ];
      for (var dpi = 0; dpi < dayPatterns.length; dpi++) {
        var dayMatch = html.match(dayPatterns[dpi]);
        if (dayMatch && dayMatch[1]) {
          var dayNum = parseInt(dayMatch[1], 10);
          if (dayNum >= 1 && dayNum <= 31) {
            bfroDay = dayMatch[1];
            console.log('[BFRO] #' + reportNumber + ' DATE from fallback pattern ' + dpi + ': "' + bfroDay + '"');
            break;
          }
        }
      }
    }
    if (bfroYear && /^\d{4}$/.test(bfroYear.trim())) {
      // We have a year — try to build a full date from separate fields
      if (bfroMonth && bfroDay && /^\d{1,2}$/.test(bfroDay.trim())) {
        // Have all three: "February" + "28" + "2025" → "February 28, 2025"
        dateStr = bfroMonth.trim() + ' ' + bfroDay.trim() + ', ' + bfroYear.trim();
        console.log('[BFRO] #' + reportNumber + ' date from YEAR+MONTH+DATE fields: "' + dateStr + '"');
      } else if (bfroMonth && /^[a-zA-Z]/.test(bfroMonth.trim())) {
        // Have year + month: "February 2025"
        dateStr = bfroMonth.trim() + ' ' + bfroYear.trim();
        console.log('[BFRO] #' + reportNumber + ' date from YEAR+MONTH fields: "' + dateStr + '"');
      } else {
        dateStr = bfroYear.trim();
        console.log('[BFRO] #' + reportNumber + ' date from YEAR field only: "' + dateStr + '"');
      }
    }
    // Fallback: try combined date fields
    if (!dateStr) {
      dateStr = extractField(['Date of encounter', 'Date of observation',
        'Date occurred', 'Date Occurred', 'Submitted', 'Date submitted']) || '';
      if (dateStr) {
        console.log('[BFRO] #' + reportNumber + ' date from extractField (raw): "' + dateStr + '"');
      }
    }
    if (dateStr) {
      // Validate: bare 1-2 digit numbers (just a day like "21") aren't usable dates
      if (/^\d{1,2}$/.test(dateStr.trim())) {
        console.log('[BFRO] #' + reportNumber + ' extractField returned bare day number — discarding');
        dateStr = '';
      }
    }

    if (!dateStr) {
      // Try standalone Year field patterns
      const yearMatch = html.match(/Year:\s*(\d{4})/i)
        || html.match(/>Year<\/\w+>\s*(?:<\w+[^>]*>)?\s*(\d{4})/i)
        || html.match(/>(\d{4})<\/(?:span|td)/i);
      if (yearMatch) {
        dateStr = yearMatch[1] || yearMatch[2];
        console.log('[BFRO] #' + reportNumber + ' date from HTML year pattern: "' + dateStr + '"');
      }
    }
    // BFRO page titles sometimes contain the date: "Report 78322 (August 2023)"
    if (!dateStr) {
      const titleDateMatch = html.match(/<title[^>]*>[^<]*\((\w+\s+\d{4})\)/i);
      if (titleDateMatch) {
        dateStr = titleDateMatch[1];
        console.log('[BFRO] #' + reportNumber + ' date from title: "' + dateStr + '"');
      }
    }
    // Try to find "Submitted on YYYY-MM-DD" or similar submission date patterns
    if (!dateStr) {
      var submitPatterns = [
        /[Ss]ubmitted\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})/,
        /[Ss]ubmitted\s+(?:on\s+)?(\d{1,2}\/\d{1,2}\/\d{4})/,
        /[Ss]ubmitted\s+(?:on\s+)?(\w+\s+\d{1,2},?\s+\d{4})/,
        /[Rr]eported\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})/,
        /[Rr]eport\s+(?:filed|received|dated)\s+(\d{4}-\d{2}-\d{2})/,
      ];
      for (var spi = 0; spi < submitPatterns.length; spi++) {
        var spMatch = html.match(submitPatterns[spi]);
        if (spMatch) {
          dateStr = spMatch[1];
          console.log('[BFRO] #' + reportNumber + ' date from submit pattern: "' + dateStr + '"');
          break;
        }
      }
    }
    // Find any 4-digit year in the structured data section (between County/State and OBSERVED)
    if (!dateStr) {
      const structuredSection = html.match(/(?:County|State|Province)[\s\S]{0,500}?OBSERVED/i);
      if (structuredSection) {
        const yearInSection = structuredSection[0].match(/\b(19\d{2}|20[0-2]\d)\b/);
        if (yearInSection) {
          dateStr = yearInSection[1];
          console.log('[BFRO] #' + reportNumber + ' date from structured section year: "' + dateStr + '"');
        }
      }
    }
    if (!dateStr) {
      console.log('[BFRO] #' + reportNumber + ' no date from HTML fields — will try description after extraction');
    }
    // eventDate and year will be set after description is extracted (see below)
    var eventDate: string | undefined;
    var year = '';

    // ── Extract ALL structured sections from the BFRO report page ──
    // BFRO pages have labeled sections: OBSERVED, ALSO NOTICED, OTHER WITNESSES,
    // OTHER STORIES, TIME AND CONDITIONS, ENVIRONMENT, FOLLOW-UP INVESTIGATION, etc.

    const extractSection = (sectionName: string): string => {
      // Try multiple patterns since BFRO formatting varies across report eras
      const patterns = [
        new RegExp(sectionName + ':?\\s*([\\s\\S]*?)(?=(?:OBSERVED|ALSO NOTICED|OTHER WITNESSES|OTHER STORIES|TIME AND CONDITIONS|ENVIRONMENT|FOLLOW-UP|About BFRO|A REPORT BY|Submit a report|Explanation of the report|<\\/td>|<\\/div>))', 'i'),
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

    // Now try description-based date extraction if HTML fields didn't yield a date
    if (!dateStr && description) {
      // "July 21, 2023" or "July 21 2023" or "21 July 2023"
      var fullDateMatch = description.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i)
        || description.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})\b/i);
      if (fullDateMatch) {
        dateStr = fullDateMatch[0];
        console.log('[BFRO] #' + reportNumber + ' date from description (full date): "' + dateStr + '"');
      }
      // "Month Year" in description: "in July 2023", "during August 2024"
      if (!dateStr) {
        var monthYearDesc = description.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
        if (monthYearDesc) {
          dateStr = monthYearDesc[0];
          console.log('[BFRO] #' + reportNumber + ' date from description (month year): "' + dateStr + '"');
        }
      }
      // "Month DD" without year — common in BFRO ("It was Monday, July 21")
      // Pair with most common 4-digit year found on the page
      if (!dateStr) {
        var monthDayDesc = description.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\b|,)/i);
        if (monthDayDesc) {
          var pageYears = html.match(/\b(20[0-2]\d)\b/g);
          if (pageYears && pageYears.length > 0) {
            var yearCounts: Record<string, number> = {};
            for (var yi = 0; yi < pageYears.length; yi++) {
              yearCounts[pageYears[yi]] = (yearCounts[pageYears[yi]] || 0) + 1;
            }
            var bestYear = Object.entries(yearCounts).sort(function(a, b) { return b[1] - a[1]; })[0][0];
            dateStr = monthDayDesc[1] + ' ' + monthDayDesc[2] + ', ' + bestYear;
            console.log('[BFRO] #' + reportNumber + ' date from description (month day) + page year: "' + dateStr + '"');
          }
        }
      }
      // Just a year in the description: "back in 2019", "this happened in 2022"
      if (!dateStr) {
        var yearDesc = description.match(/\b(19[89]\d|20[0-2]\d)\b/);
        if (yearDesc) {
          dateStr = yearDesc[1];
          console.log('[BFRO] #' + reportNumber + ' date from description (year only): "' + dateStr + '"');
        }
      }
    }
    // Absolute last resort: any year on the page
    if (!dateStr) {
      var anyYear = html.match(/\b(20[0-2]\d)\b/);
      if (anyYear) {
        dateStr = anyYear[1];
        console.log('[BFRO] #' + reportNumber + ' date from any page year: "' + dateStr + '"');
      }
    }
    if (!dateStr) {
      console.log('[BFRO] #' + reportNumber + ' WARNING: No date found anywhere');
    }
    // Now parse the date
    eventDate = parseDate(dateStr);
    year = eventDate ? eventDate.substring(0, 4) : (dateStr ? (dateStr.match(/\d{4}/)?.[0] || '') : '');

    // Additional structured sections
    const alsoNoticed = extractSection('ALSO NOTICED');
    const otherWitnesses = extractSection('OTHER WITNESSES');
    const otherStories = extractSection('OTHER STORIES');
    let timeAndConditions = extractSection('TIME AND CONDITIONS');
    let environment = extractSection('ENVIRONMENT');

    // Truncate metadata fields to reasonable display lengths
    // Environment should be terrain/habitat description, not investigator bios
    if (environment && environment.length > 500) {
      // Try to cut at a sentence boundary
      var cutPoint = environment.lastIndexOf('.', 500);
      if (cutPoint > 200) {
        environment = environment.substring(0, cutPoint + 1);
      } else {
        environment = environment.substring(0, 500).trim() + '...';
      }
    }
    if (timeAndConditions && timeAndConditions.length > 500) {
      var tcCut = timeAndConditions.lastIndexOf('.', 500);
      if (tcCut > 200) {
        timeAndConditions = timeAndConditions.substring(0, tcCut + 1);
      } else {
        timeAndConditions = timeAndConditions.substring(0, 500).trim() + '...';
      }
    }

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
    // Store as 24-hour "HH:MM" so the front-end renderer handles AM/PM display
    var eventTime: string | undefined;
    if (timeAndConditions) {
      // Look for time patterns: "9:30 PM", "approximately 2am", "3:45. Partly sunny."
      var timeMatch = timeAndConditions.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm|a\.m\.|p\.m\.)?/);
      if (timeMatch) {
        var hour = parseInt(timeMatch[1], 10);
        var minute = timeMatch[2];
        var meridiem = (timeMatch[3] || '').replace(/\./g, '').toLowerCase(); // "pm", "am", or ""

        if (!meridiem) {
          // No explicit AM/PM — infer from weather/light context clues in the conditions text
          var tcLower = timeAndConditions.toLowerCase();
          var dayIndicators = /\b(sunny|sun|daylight|clear sky|partly cloudy|overcast|bright|visibility)\b/i.test(tcLower);
          var nightIndicators = /\b(dark|stars|moon|moonlight|pitch black|no visibility)\b/i.test(tcLower);

          if (nightIndicators && !dayIndicators) {
            // Night context: hours 1-6 stay AM, 7-11 become PM (evening)
            if (hour >= 7 && hour <= 11) meridiem = 'pm';
            else meridiem = 'am';
          } else if (dayIndicators) {
            // Day context: hours 1-6 likely PM (afternoon), 7-11 likely AM (morning)
            if (hour >= 1 && hour <= 6) meridiem = 'pm';
            else if (hour >= 7 && hour <= 11) meridiem = 'am';
            // 12 stays as noon (12 PM)
          }
          // If still no meridiem and hour <= 6, default to PM (more sightings in afternoon/evening)
          if (!meridiem && hour >= 1 && hour <= 6) meridiem = 'pm';
        }

        // Convert to 24-hour format
        if (meridiem === 'pm' && hour < 12) hour = hour + 12;
        else if (meridiem === 'am' && hour === 12) hour = 0;

        eventTime = (hour < 10 ? '0' : '') + hour + ':' + minute;
      } else {
        // Check for "2pm", "3am" style without colon
        var simpleMatch = timeAndConditions.match(/\b(\d{1,2})\s*(AM|PM|am|pm|a\.m\.|p\.m\.)\b/);
        if (simpleMatch) {
          var sHour = parseInt(simpleMatch[1], 10);
          var sMeridiem = simpleMatch[2].replace(/\./g, '').toLowerCase();
          if (sMeridiem === 'pm' && sHour < 12) sHour = sHour + 12;
          else if (sMeridiem === 'am' && sHour === 12) sHour = 0;
          eventTime = (sHour < 10 ? '0' : '') + sHour + ':00';
        } else {
          var vagueTime = timeAndConditions.match(/\b(dawn|sunrise|morning|midday|noon|afternoon|dusk|sunset|evening|night|midnight)\b/i);
          if (vagueTime) eventTime = vagueTime[1].toLowerCase();
        }
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

    // Determine event_date_precision based on what we parsed from
    let eventDatePrecision: 'exact' | 'month' | 'year' | 'decade' | 'estimated' | 'unknown' = 'unknown';
    if (eventDate && dateStr) {
      var dsClean = dateStr.trim();
      // If dateStr was just a bare year (e.g., "2023")
      if (/^\d{4}$/.test(dsClean)) {
        eventDatePrecision = 'year';
      }
      // If dateStr was "Month Year" without a day
      else if (/^\w+\s+\d{4}$/.test(dsClean)) {
        eventDatePrecision = 'month';
      }
      // If dateStr has a full date (day+month+year in any format)
      else if (/\d{1,2}/.test(dsClean) && /\d{4}/.test(dsClean) && (/\w{3,}/.test(dsClean) || /\//.test(dsClean) || /-/.test(dsClean))) {
        eventDatePrecision = 'exact';
      }
      // "Month DD" without year — we inferred the year, so it's estimated
      else if (/^\w+\s+\d{1,2}$/.test(dsClean)) {
        eventDatePrecision = 'estimated';
      }
      else {
        eventDatePrecision = 'estimated';
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
      title: generateTitle(county, locationState, year, reportNumber, nearestTown),
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
