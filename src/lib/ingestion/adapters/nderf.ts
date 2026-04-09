// NDERF (Near-Death Experience Research Foundation) Adapter
// Fetches near-death experience reports from nderf.org
//
// NOTE: This adapter requires external web access to nderf.org
// The site structure is based on the NDERF archives which organize
// experiences by category (exceptional, probable NDE, etc.)

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';

// Rate limiting helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// NDE experience types on NDERF
const NDE_TYPES: Record<string, string> = {
  exceptional: 'Exceptional NDE',
  probable: 'Probable NDE',
  questionable: 'Questionable NDE',
  sde: 'Shared Death Experience',
  obe: 'Out of Body Experience',
  ste: 'Spiritually Transformative Experience',
  fearde: 'Fear-Death Experience',
  other: 'Other Spiritually Transformative Experience'
};

// Extract NDE characteristics from content
function extractCharacteristics(content: string): string[] {
  const characteristics: string[] = [];
  const lowerContent = content.toLowerCase();

  // Common NDE elements
  if (lowerContent.includes('tunnel') || lowerContent.includes('darkness')) {
    characteristics.push('tunnel-experience');
  }
  if (lowerContent.includes('light') && (lowerContent.includes('bright') || lowerContent.includes('white'))) {
    characteristics.push('being-of-light');
  }
  if (lowerContent.includes('deceased') || lowerContent.includes('relatives') || lowerContent.includes('family member')) {
    characteristics.push('deceased-relatives');
  }
  if (lowerContent.includes('life review') || lowerContent.includes('my life flash') || lowerContent.includes('saw my life')) {
    characteristics.push('life-review');
  }
  if (lowerContent.includes('out of body') || lowerContent.includes('above my body') || lowerContent.includes('looking down')) {
    characteristics.push('out-of-body');
  }
  if (lowerContent.includes('peaceful') || lowerContent.includes('calm') || lowerContent.includes('serenity')) {
    characteristics.push('peace-calm');
  }
  if (lowerContent.includes('love') && (lowerContent.includes('unconditional') || lowerContent.includes('overwhelming'))) {
    characteristics.push('unconditional-love');
  }
  if (lowerContent.includes('boundary') || lowerContent.includes('border') || lowerContent.includes('point of no return')) {
    characteristics.push('boundary-experience');
  }
  if (lowerContent.includes('sent back') || lowerContent.includes('told to return') || lowerContent.includes('not my time')) {
    characteristics.push('sent-back');
  }
  if (lowerContent.includes('hospital') || lowerContent.includes('surgery') || lowerContent.includes('cardiac arrest')) {
    characteristics.push('medical-setting');
  }
  if (lowerContent.includes('drown') || lowerContent.includes('water')) {
    characteristics.push('drowning');
  }
  if (lowerContent.includes('car') && (lowerContent.includes('accident') || lowerContent.includes('crash'))) {
    characteristics.push('accident');
  }

  return characteristics;
}

// Determine credibility based on detail level
function determineCredibility(content: string, ndeType: string): 'low' | 'medium' | 'high' {
  let score = 0;

  // Length-based scoring
  if (content.length > 500) score += 1;
  if (content.length > 1500) score += 1;
  if (content.length > 3000) score += 1;

  // Type-based scoring
  if (ndeType === 'exceptional') score += 2;
  else if (ndeType === 'probable') score += 1;

  // Detail indicators
  if (content.includes('date') || /\d{4}/.test(content)) score += 1;
  if (content.includes('hospital') || content.includes('doctor')) score += 1;

  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

// Generate tags from content
function generateTags(content: string, ndeType: string): string[] {
  const tags: string[] = ['nde', 'near-death-experience', 'nderf'];

  // Add NDE type as tag
  tags.push(ndeType.toLowerCase().replace(/\s+/g, '-'));

  // Add characteristics as tags
  const characteristics = extractCharacteristics(content);
  tags.push(...characteristics);

  // Add emotional tone tags
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes('terrifying') || lowerContent.includes('frightening') || lowerContent.includes('scary')) {
    tags.push('distressing-nde');
  }
  if (lowerContent.includes('beautiful') || lowerContent.includes('wonderful') || lowerContent.includes('amazing')) {
    tags.push('positive-nde');
  }

  return Array.from(new Set(tags));
}

// Clean text from HTML artifacts
function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch page with browser-like headers
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
      console.log(`[NDERF] Fetch failed (attempt ${i + 1}): ${url} - Status: ${response.status}`);
    } catch (e) {
      console.error(`[NDERF] Fetch error (attempt ${i + 1}):`, url);
    }
    if (i < retries - 1) {
      await delay(1000);
    }
  }
  return null;
}

// Parse the NDERF archive index page
async function parseArchiveIndex(html: string): Promise<Array<{ id: string; name: string; url: string }>> {
  const experiences: Array<{ id: string; name: string; url: string }> = [];

  // NDERF uses various link patterns across different archive pages:
  //   /Experiences/1_name_nde.htm
  //   /NDERF/NDE_Experiences/1_name_nde.htm
  //   Relative links like 1_name_nde.htm
  const linkPatterns = [
    /<a[^>]+href=["']([^"']*\/Experiences\/([^"']+)\.htm[l]?)["'][^>]*>([^<]+)/gi,
    /<a[^>]+href=["']([^"']*\/NDE_Experiences\/([^"']+)\.htm[l]?)["'][^>]*>([^<]+)/gi,
    /<a[^>]+href=["']([^"']*\/NDE_Archives\/([^"']+)\.htm[l]?)["'][^>]*>([^<]+)/gi,
    // Generic: any .htm link containing _nde or _NDE
    /<a[^>]+href=["']([^"']*?([\w]+_(?:nde|NDE|obe|sde)[^"']*?)\.htm[l]?)["'][^>]*>([^<]+)/gi,
  ];

  for (const linkPattern of linkPatterns) {
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const rawUrl = match[1];
      const url = rawUrl.startsWith('http') ? rawUrl : `https://www.nderf.org${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
      const id = match[2];
      const name = cleanText(match[3]);

      // Skip nav/menu links and archive index pages (not individual experiences)
      if (!name || name.length < 3 || name.toLowerCase().includes('home') || name.toLowerCase().includes('back')) {
        continue;
      }
      // Skip archive/index page IDs — these are listing pages, not experiences
      const idLower = id.toLowerCase();
      if (idLower.includes('nderf_ndes') || idLower.includes('archives') ||
          idLower === 'exceptional' || idLower === 'probable_nde' ||
          idLower.includes('index') || idLower.includes('main')) {
        continue;
      }
      // Individual NDERF experiences typically start with a number (e.g., "1sara_j_nde_13516")
      // or contain _nde, _obe, _sde, _adc in the ID
      const looksLikeExperience = /^\d/.test(id) || /_(?:nde|obe|sde|adc|ste)/i.test(id);
      if (!looksLikeExperience) {
        continue;
      }

      if (id && !experiences.find(e => e.id === id)) {
        experiences.push({ id, name, url });
      }
    }
  }

  return experiences;
}

// Extract a structured field value from NDERF questionnaire HTML
// Fields use: <span class="m105">Label:</span> Value
function extractField(html: string, fieldLabel: string): string | null {
  // Build regex: <span class="m105">fieldLabel:</span> VALUE
  // Value ends at next <br> or <span
  const escaped = fieldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    '<span[^>]*class="m105"[^>]*>' + escaped + ':?</span>\\s*(.+?)(?:<br|<span)',
    'i'
  );
  const match = html.match(pattern);
  if (match) {
    return cleanText(match[1]).trim();
  }
  return null;
}

// Extract Date of NDE from NDERF page
// Formats seen: "2/4/2014", "05/00/2010" (00=unknown day), "1930", etc.
function extractNDEDate(html: string): { date: string | undefined; precision: 'exact' | 'month' | 'year' | 'unknown' } {
  const raw = extractField(html, 'Date of NDE');
  if (!raw) {
    console.log(`[NDERF] No "Date of NDE" field found`);
    return { date: undefined, precision: 'unknown' };
  }
  console.log(`[NDERF] Raw Date of NDE: "${raw}"`);

  // MM/DD/YYYY or M/D/YYYY
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1], 10);
    const day = parseInt(mdyMatch[2], 10);
    const year = parseInt(mdyMatch[3], 10);

    if (day === 0) {
      // Unknown day — month precision
      const monthStr = String(month).padStart(2, '0');
      console.log(`[NDERF] Parsed date: ${year}-${monthStr} (month precision, day=00)`);
      return { date: `${year}-${monthStr}-01`, precision: 'month' };
    }

    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    console.log(`[NDERF] Parsed date: ${year}-${monthStr}-${dayStr} (exact)`);
    return { date: `${year}-${monthStr}-${dayStr}`, precision: 'exact' };
  }

  // Just a year: "1930", "2010"
  const yearMatch = raw.match(/^(\d{4})$/);
  if (yearMatch) {
    console.log(`[NDERF] Parsed date: ${yearMatch[1]} (year precision)`);
    return { date: `${yearMatch[1]}-01-01`, precision: 'year' };
  }

  // Month/Year only: "05/2010"
  const myMatch = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (myMatch) {
    const monthStr = String(parseInt(myMatch[1], 10)).padStart(2, '0');
    console.log(`[NDERF] Parsed date: ${myMatch[2]}-${monthStr} (month precision)`);
    return { date: `${myMatch[2]}-${monthStr}-01`, precision: 'month' };
  }

  console.log(`[NDERF] Could not parse date: "${raw}"`);
  return { date: undefined, precision: 'unknown' };
}

// US state name-to-abbreviation map for location extraction
const US_STATES: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY'
};

// Extract location from NDERF narrative text
// NDERF has no structured location field — we must extract from the narrative
function extractLocation(content: string, html: string): { location_name?: string; country?: string; state_province?: string; city?: string } {
  const text = content;

  // Try common patterns in NDE narratives:
  // "in [City], [State]" or "in [City], [State/Province], [Country]"
  // "at [Hospital Name] in [City]"
  // "near [Place]"
  // "off [Place]" (e.g. "off Vancouver Island")

  // Pattern 1: "in [City], [Full State Name]" (US)
  for (const [stateName, stateAbbr] of Object.entries(US_STATES)) {
    const statePattern = new RegExp(
      '(?:in|near|at|from)\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*),\\s*' + stateName,
      'i'
    );
    const match = text.match(statePattern);
    if (match) {
      const city = match[1];
      console.log(`[NDERF] Location from narrative: ${city}, ${stateName}`);
      return {
        location_name: `${city}, ${stateName}`,
        country: 'United States',
        state_province: stateName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        city: city
      };
    }
  }

  // Pattern 2: "[City], [two-letter state abbreviation]"
  const stateAbbrMatch = text.match(/(?:in|near|at|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/);
  if (stateAbbrMatch) {
    const city = stateAbbrMatch[1];
    const abbr = stateAbbrMatch[2];
    // Verify it's a real state abbreviation
    const fullState = Object.entries(US_STATES).find(([_, v]) => v === abbr);
    if (fullState) {
      const stateName = fullState[0].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      console.log(`[NDERF] Location from state abbr: ${city}, ${stateName}`);
      return {
        location_name: `${city}, ${stateName}`,
        country: 'United States',
        state_province: stateName,
        city: city
      };
    }
  }

  // Pattern 3: Known countries/regions (e.g. "in British Columbia", "in England", "off Vancouver Island")
  const regionPatterns = [
    { pattern: /(?:in|near|off|from)\s+([\w\s]+?),\s*(British Columbia|Alberta|Ontario|Quebec|Manitoba|Saskatchewan|Nova Scotia|Newfoundland)/i, country: 'Canada' },
    { pattern: /(?:in|near|off|from)\s+([\w\s]+?),\s*(England|Scotland|Wales|Northern Ireland)/i, country: 'United Kingdom' },
    { pattern: /(?:in|near|off|from)\s+([\w\s]+?),\s*(Australia|New Zealand|Germany|France|India|Mexico|Brazil|Japan|South Africa)/i, country: null },
  ];

  for (const { pattern, country } of regionPatterns) {
    const match = text.match(pattern);
    if (match) {
      const place = match[1].trim();
      const region = match[2];
      const resolvedCountry = country || region;
      console.log(`[NDERF] Location from region: ${place}, ${region}`);
      return {
        location_name: `${place}, ${region}`,
        country: resolvedCountry,
        state_province: country ? region : undefined,
        city: place
      };
    }
  }

  // Pattern 4: Just a country mention — "I was in [Country] when"
  const countryMatch = text.match(/(?:I was in|happened in|occurred in|living in)\s+(United States|Canada|United Kingdom|England|Australia|Germany|France|India|Mexico|Brazil|Japan|South Africa|Ireland|New Zealand|Italy|Spain|Netherlands|Sweden|Norway|Israel|Philippines|Thailand|China|South Korea)/i);
  if (countryMatch) {
    console.log(`[NDERF] Location from country mention: ${countryMatch[1]}`);
    return {
      location_name: countryMatch[1],
      country: countryMatch[1]
    };
  }

  console.log(`[NDERF] No location extracted from narrative`);
  return {};
}

// NDE type labels for titles (visitor-friendly)
const NDE_TYPE_LABELS: Record<string, string> = {
  'exceptional': 'Near-Death Experience',
  'probable': 'Near-Death Experience',
  'questionable': 'Near-Death Experience',
  'sde': 'Shared Death Experience',
  'obe': 'Out-of-Body Experience',
  'fearde': 'Fear-Death Experience',
  'ste': 'Spiritually Transformative Experience',
  'other': 'Spiritually Transformative Experience'
};

// Generate a compelling, factual title from NDERF content
// No person names. Uses: trigger event + location + year
function generateNDERFTitle(
  html: string,
  content: string,
  ndeType: string,
  location: { location_name?: string; country?: string },
  dateStr: string | undefined
): string {
  // 1. Get the experience type label
  const typeLabel = NDE_TYPE_LABELS[ndeType] || 'Near-Death Experience';

  // 2. Extract the trigger/cause from the questionnaire
  let trigger = '';
  const threatField = extractField(html, 'At the time of your experience, was there an associated life-threatening event');
  if (threatField) {
    // The answer is like "Yes<br>Drowning" — extract after Yes/No
    const afterYes = threatField.replace(/^(Yes|No)\s*/i, '').trim();
    if (afterYes && afterYes.length > 2 && afterYes.length < 60) {
      trigger = afterYes;
    }
  }

  // 3. If no trigger from questionnaire, try to detect from narrative
  if (!trigger) {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('cardiac arrest') || lowerContent.includes('heart attack')) trigger = 'Cardiac Arrest';
    else if (lowerContent.includes('drowning') || lowerContent.includes('drowned')) trigger = 'Drowning';
    else if (lowerContent.includes('car accident') || lowerContent.includes('car crash')) trigger = 'Car Accident';
    else if (lowerContent.includes('surgery') || lowerContent.includes('operation')) trigger = 'Surgery';
    else if (lowerContent.includes('overdose')) trigger = 'Overdose';
    else if (lowerContent.includes('childbirth') || lowerContent.includes('giving birth')) trigger = 'Childbirth';
    else if (lowerContent.includes('anaphylaxis') || lowerContent.includes('allergic')) trigger = 'Allergic Reaction';
    else if (lowerContent.includes('suicide') || lowerContent.includes('took my own')) trigger = 'Suicide Attempt';
    else if (lowerContent.includes('breathing session') || lowerContent.includes('breathwork')) trigger = 'Breathwork Session';
    else if (lowerContent.includes('meditation')) trigger = 'Meditation';
    else if (lowerContent.includes('coma')) trigger = 'Coma';
    else if (lowerContent.includes('seizure') || lowerContent.includes('epilep')) trigger = 'Seizure';
    else if (lowerContent.includes('stroke')) trigger = 'Stroke';
    else if (lowerContent.includes('motorcycle')) trigger = 'Motorcycle Accident';
    else if (lowerContent.includes('fell') || lowerContent.includes('falling')) trigger = 'Fall';
    else if (lowerContent.includes('electrocuted') || lowerContent.includes('electric shock')) trigger = 'Electrocution';
    else if (lowerContent.includes('gunshot') || lowerContent.includes('shot')) trigger = 'Gunshot';
    else if (lowerContent.includes('stabbed') || lowerContent.includes('stabbing')) trigger = 'Stabbing';
    else if (lowerContent.includes('pneumonia')) trigger = 'Pneumonia';
    else if (lowerContent.includes('sepsis') || lowerContent.includes('infection')) trigger = 'Infection';
    else if (lowerContent.includes('bleeding') || lowerContent.includes('hemorrhage')) trigger = 'Hemorrhage';
    else if (lowerContent.includes('anesthesia')) trigger = 'Anesthesia';
  }

  // 4. Build the title
  let titleParts: string[] = [typeLabel];

  if (trigger) {
    titleParts.push('During ' + trigger);
  }

  // Add location if available
  if (location.location_name) {
    titleParts.push(location.location_name);
  }

  // Add year if available
  if (dateStr) {
    const yearMatch = dateStr.match(/^(\d{4})/);
    if (yearMatch) {
      titleParts.push('(' + yearMatch[1] + ')');
    }
  }

  // Join: "Near-Death Experience During Drowning, Vancouver Island (2010)"
  // Use comma separation after the first "During X" part
  let title = titleParts[0];
  if (titleParts.length > 1) {
    // "NDE During Drowning" or just "NDE" if no trigger
    if (titleParts[1].startsWith('During ')) {
      title += ' ' + titleParts[1];
      // Append remaining parts with commas
      for (let i = 2; i < titleParts.length; i++) {
        if (titleParts[i].startsWith('(')) {
          title += ' ' + titleParts[i];
        } else {
          title += ', ' + titleParts[i];
        }
      }
    } else {
      // No trigger, just location and year
      for (let i = 1; i < titleParts.length; i++) {
        if (titleParts[i].startsWith('(')) {
          title += ' ' + titleParts[i];
        } else {
          title += ', ' + titleParts[i];
        }
      }
    }
  }

  console.log(`[NDERF] Generated title: "${title}"`);
  return title.substring(0, 200);
}

// Parse an individual experience page
function parseExperiencePage(html: string, id: string, name: string): ScrapedReport | null {
  // Extract the main content (usually in a specific div or article)
  let content = '';

  // Try different content extraction patterns
  const contentPatterns = [
    /<div[^>]*class="[^"]*experience[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<p[^>]*>([\s\S]*?)<\/p>/gi,
  ];

  for (const pattern of contentPatterns) {
    const matches = html.match(pattern);
    if (matches) {
      content = Array.isArray(matches) ? matches.join('\n\n') : matches[1];
      if (content.length > 200) break;
    }
  }

  // Clean the content
  content = cleanText(content);

  // Skip if content is too short
  if (content.length < 100) {
    console.log(`[NDERF] Skipping ${id}: content too short (${content.length} chars)`);
    return null;
  }

  // NDERF experience pages include questionnaire answers, sidebar HTML, etc.
  // Real experiences can be 5K-15K chars after HTML stripping.
  // Pages over 40K are almost certainly index/listing pages.
  if (content.length > 40000) {
    console.log(`[NDERF] Skipping ${id}: content too long (${content.length} chars) — likely an index page`);
    return null;
  }

  // Cap description at a reasonable length for storage
  if (content.length > 15000) {
    content = content.substring(0, 15000) + '...';
  }

  // Determine NDE type from page content or URL
  let ndeType = 'exceptional';
  const lowerHtml = html.toLowerCase();
  const idLower = id.toLowerCase();
  if (lowerHtml.includes('probable nde') || idLower.includes('probable')) ndeType = 'probable';
  else if (lowerHtml.includes('shared death') || idLower.includes('sde')) ndeType = 'sde';
  else if (lowerHtml.includes('out of body') || idLower.includes('obe')) ndeType = 'obe';
  else if (idLower.includes('ste')) ndeType = 'ste';
  else if (lowerHtml.includes('fear-death') || idLower.includes('fearde')) ndeType = 'fearde';

  // --- FIX 1: Extract date from "Date of NDE" questionnaire field ---
  const { date: eventDate, precision: datePrecision } = extractNDEDate(html);

  // --- FIX 2: Extract gender ---
  const gender = extractField(html, 'Gender');
  console.log(`[NDERF] ${id}: gender=${gender || 'unknown'}, date=${eventDate || 'none'}, precision=${datePrecision}`);

  // --- FIX 3: Extract location from narrative ---
  const location = extractLocation(content, html);
  if (location.location_name) {
    console.log(`[NDERF] ${id}: location="${location.location_name}"`);
  }

  // --- FIX 4: Generate compelling title (no person names) ---
  const title = generateNDERFTitle(html, content, ndeType, location, eventDate);

  // Create summary
  const summary = content.length > 300 ? content.substring(0, 297) + '...' : content;

  // Generate tags
  const tags = generateTags(content, ndeType);

  // Add gender tag
  if (gender) {
    tags.push('experiencer-' + gender.toLowerCase());
  }

  return {
    title,
    summary,
    description: content,
    category: 'psychological_experiences',
    location_name: location.location_name,
    country: location.country,
    state_province: location.state_province,
    city: location.city,
    event_date: eventDate,
    event_date_precision: datePrecision,
    credibility: determineCredibility(content, ndeType),
    source_type: 'nderf',
    original_report_id: `nderf-${id}`,
    tags: Array.from(new Set(tags)),
    source_label: 'NDERF',
    source_url: `https://www.nderf.org/Experiences/${id}.htm`,
    metadata: {
      ndeType: NDE_TYPES[ndeType as keyof typeof NDE_TYPES] || ndeType,
      characteristics: extractCharacteristics(content),
      source: 'Near-Death Experience Research Foundation',
      gender: gender || undefined,
      triggerEvent: extractField(html, 'At the time of your experience, was there an associated life-threatening event') || undefined
    }
  };
}

export const nderfAdapter: SourceAdapter = {
  name: 'nderf',

  async scrape(config: Record<string, any>, limit: number = 100): Promise<AdapterResult> {
    const reports: ScrapedReport[] = [];
    const rateLimitMs = config.rate_limit_ms || 500;

    try {
      console.log(`[NDERF] Starting scrape. Limit: ${limit}`);

      // NDERF archive URLs - updated April 2026
      // The site reorganized from /Experiences/ to /Archives/ and /NDERF/
      const archiveUrls = [
        'https://www.nderf.org/Archives/NDERF_NDEs.html',
        'https://www.nderf.org/Archives/exceptional.html',
        'https://www.nderf.org/NDERF/NDE_Archives/archives_main.htm',
        'https://www.nderf.org/Experiences/exceptional.htm',
      ];

      for (const archiveUrl of archiveUrls) {
        if (reports.length >= limit) break;

        console.log(`[NDERF] Fetching archive: ${archiveUrl}`);
        const archiveHtml = await fetchWithHeaders(archiveUrl);

        if (!archiveHtml) {
          console.log(`[NDERF] Failed to fetch archive: ${archiveUrl}`);
          continue;
        }

        // Parse index to get experience links
        const experiences = await parseArchiveIndex(archiveHtml);
        console.log(`[NDERF] Found ${experiences.length} experiences in archive`);

        for (const exp of experiences) {
          if (reports.length >= limit) break;

          await delay(rateLimitMs);

          console.log(`[NDERF] Fetching experience: ${exp.id}`);
          const expHtml = await fetchWithHeaders(exp.url);

          if (!expHtml) {
            console.log(`[NDERF] Failed to fetch experience: ${exp.id}`);
            continue;
          }

          const report = parseExperiencePage(expHtml, exp.id, exp.name);
          if (report) {
            reports.push(report);

            if (reports.length % 20 === 0) {
              console.log(`[NDERF] Processed ${reports.length} reports...`);
            }
          }
        }
      }

      console.log(`[NDERF] Scrape complete. Total: ${reports.length} reports`);

      if (reports.length === 0) {
        return {
          success: false,
          reports: reports,
          error: 'No reports found — NDERF archive URLs may have changed. Check site structure.'
        };
      }

      return {
        success: true,
        reports: reports
      };

    } catch (error) {
      console.error('[NDERF] Scrape error:', error);
      return {
        success: false,
        reports: reports,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};

export default nderfAdapter;
