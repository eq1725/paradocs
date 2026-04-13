// NDERF (Near-Death Experience Research Foundation) Adapter
// Fetches near-death experience reports from nderf.org
//
// NOTE: This adapter requires external web access to nderf.org
// The site structure is based on the NDERF archives which organize
// experiences by category (exceptional, probable NDE, etc.)

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';
import { tokenizeEmotions, EmotionToken } from '../emotion-vocab';

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
// Fields use: <span class="m105">Label:</span> Value  (short-answer)
//          or <span class="m105">Label?</span> Value  (yes/no question)
// The trailing punctuation (colon or question mark) is INSIDE the span tag.
function extractField(html: string, fieldLabel: string): string | null {
  // Strip any trailing punctuation the caller supplied; we match it ourselves.
  const cleanLabel = fieldLabel.replace(/[?:]+\s*$/, '');
  const escaped = cleanLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Allow optional trailing ? or : inside the span, then an optional one outside too.
  // Use [\s\S]+? not .+? because NDERF HTML uses CRLF line endings and `.` does not
  // match \r or \n in JavaScript regex (without the /s flag).
  const pattern = new RegExp(
    '<span[^>]*class="m105"[^>]*>' + escaped + '[?:]?\\s*</span>\\s*[?:]?\\s*([\\s\\S]+?)(?:<br|<span)',
    'i'
  );
  const match = html.match(pattern);
  if (match) {
    return cleanText(match[1]).trim();
  }
  return null;
}

// Try a list of labels in order; return the first that matches.
function extractFieldAny(html: string, labels: string[]): string | null {
  for (const l of labels) {
    const v = extractField(html, l);
    if (v) return v;
  }
  return null;
}

// NDERF uses a multi-choice format, not simple yes/no. Answers are full descriptive
// strings (e.g. "I lost awareness of my body", "A light clearly of mystical origin").
// Only explicit negatives ("No", "I did not...", "I had no...") are "no"; anything
// else descriptive is treated as an affirmative indicator. "Uncertain"/"Unsure"
// return null so we don't fabricate a signal.
function interpretNDERFAnswer(raw: string): 'yes' | 'no' | null {
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;
  if (lower.startsWith('uncertain') || lower.startsWith('unsure') || lower.startsWith('unknown') || lower.startsWith('n/a')) {
    return null;
  }
  if (lower.startsWith('no ') || lower === 'no' || lower.startsWith('no,') || lower.startsWith('no.')) {
    return 'no';
  }
  if (lower.startsWith('i did not') || lower.startsWith("i didn't") || lower.startsWith('i had no')) {
    return 'no';
  }
  if (lower.startsWith('yes')) return 'yes';
  // Descriptive multi-choice answers (e.g. "I lost awareness of my body") only
  // appear when the experiencer selected an affirmative option in NDERF's form.
  if (lower.length > 3) return 'yes';
  return null;
}

function extractYesNoAny(html: string, labels: string[]): 'yes' | 'no' | null {
  const raw = extractFieldAny(html, labels);
  if (!raw) return null;
  return interpretNDERFAnswer(raw);
}

// Build a structured Case Profile from NDERF questionnaire fields.
// These are short, factual yes/no and short-string answers that can be rendered
// as chips on a feed card. Only include fields we actually extracted — no fabrication.
interface NDERFCaseProfile {
  ndeType?: string;
  trigger?: string;          // "Drowning", "Cardiac arrest", etc.
  ageAtNDE?: string;
  gender?: string;
  consciousnessPeak?: string; // "During the experience" / "At time of cardiac arrest"
  tunnel?: 'yes' | 'no';
  light?: 'yes' | 'no';
  outOfBody?: 'yes' | 'no';
  lifeReview?: 'yes' | 'no';
  metBeings?: 'yes' | 'no';
  boundary?: 'yes' | 'no';
  alteredTime?: 'yes' | 'no';
  // Emotions stored as a tokenized list against a controlled vocabulary
  // (see emotion-vocab.ts). We never store the experiencer's verbatim
  // answer — only matched emotion tokens. An older string form may exist
  // in historical data; readers must accept either shape.
  emotions?: EmotionToken[];
  aftereffectsChangedLife?: 'yes' | 'no';
}

function buildCaseProfile(html: string, ndeTypeLabel: string, trigger: string | undefined): NDERFCaseProfile {
  const profile: NDERFCaseProfile = {};

  if (ndeTypeLabel) profile.ndeType = ndeTypeLabel;
  if (trigger) profile.trigger = trigger;

  // NDERF has no explicit "age" field — skip.

  const gender = extractField(html, 'Gender');
  if (gender && gender.length < 30) profile.gender = gender;

  const consciousness = extractFieldAny(html, [
    'At what time during the experience were you at your highest level of consciousness',
    'How did your highest level of consciousness and alertness during the experience compare to your normal',
  ]);
  if (consciousness && consciousness.length < 200) {
    profile.consciousnessPeak = consciousness.split(/[.;]/)[0].trim().slice(0, 160);
  }

  const tunnel = extractYesNoAny(html, [
    'Did you pass into or through a tunnel',
  ]);
  if (tunnel) profile.tunnel = tunnel;

  // NDERF splits "light" into two questions; consider either a hit.
  const light = extractYesNoAny(html, [
    'Did you see an unearthly light',
    'Did you see or feel surrounded by a brilliant light',
  ]);
  if (light) profile.light = light;

  const oob = extractYesNoAny(html, [
    'Did you feel separated from your body',
  ]);
  if (oob) profile.outOfBody = oob;

  const review = extractYesNoAny(html, [
    'Did scenes from your past come back',
  ]);
  if (review) profile.lifeReview = review;

  const beings = extractYesNoAny(html, [
    'Did you see any beings in your experience',
    'Did you encounter or become aware of any deceased',
  ]);
  if (beings) profile.metBeings = beings;

  // NDERF has two distinct boundary questions; treat either yes as yes.
  const boundary = extractYesNoAny(html, [
    'Did you come to a border or point of no return',
    'Did you reach a boundary or limiting physical structure',
  ]);
  if (boundary) profile.boundary = boundary;

  const timeShift = extractYesNoAny(html, [
    'Did time seem to speed up or slow down',
  ]);
  if (timeShift) profile.alteredTime = timeShift;

  // Emotions: tokenize the questionnaire answer against our controlled
  // vocabulary rather than storing the experiencer's verbatim prose.
  // This turns free-text into structured, categorical data (fair-use
  // safe) and renders cleanly as discrete chips. Cap at 6 tokens for UI.
  const emotionsRaw = extractField(html, 'What emotions did you feel during the experience');
  if (emotionsRaw) {
    const tokens = tokenizeEmotions(emotionsRaw).slice(0, 6);
    if (tokens.length > 0) {
      profile.emotions = tokens;
    }
  }

  // NDERF has no "affected your relationships" yes/no; skip aftereffectsChangedLife for now.

  return profile;
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

  // MM/DD/YYYY or M/D/YYYY (year can be 2 or 4 digits, e.g. "07/27/0023" means 2023)
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1], 10);
    const day = parseInt(mdyMatch[2], 10);
    let year = parseInt(mdyMatch[3], 10);

    // Fix 2-digit or small years: 0023 → 2023, 85 → 1985, etc.
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
      console.log(`[NDERF] Corrected small year: ${mdyMatch[3]} → ${year}`);
    }

    // Both month and day are 0 — year-only precision
    if (month === 0 && day === 0) {
      console.log(`[NDERF] Parsed date: ${year} (year precision, month=00/day=00)`);
      return { date: `${year}-01-01`, precision: 'year' };
    }

    // Month is 0 but day isn't (shouldn't happen, but handle gracefully)
    if (month === 0) {
      console.log(`[NDERF] Parsed date: ${year} (year precision, month=00)`);
      return { date: `${year}-01-01`, precision: 'year' };
    }

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
  dateStr: string | undefined,
  preExtractedTrigger: string | undefined
): string {
  // 1. Get the experience type label
  const typeLabel = NDE_TYPE_LABELS[ndeType] || 'Near-Death Experience';

  // 2. Use the caller-provided trigger (already filtered for "Uncertain"/etc)
  let trigger = preExtractedTrigger || '';

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
  // --- TARGETED CONTENT EXTRACTION ---
  // NDERF pages have a clear structure:
  //   <span class="m108">Experience Description</span> ... narrative ... <span class="m108">Background Information:</span>
  // We extract ONLY the narrative between these markers to avoid nav chrome.

  let narrativeHtml = '';

  // Primary: extract between "Experience Description" and "Background Information"
  const narrativeMatch = html.match(
    /Experience\s*Description<\/span>([\s\S]*?)(?:<span[^>]*class="m108"[^>]*>Background\s*Information|<span[^>]*class="m108"[^>]*>NDE\s*Elements)/i
  );
  if (narrativeMatch) {
    narrativeHtml = narrativeMatch[1];
    console.log(`[NDERF] ${id}: extracted narrative (${narrativeHtml.length} chars raw HTML)`);
  }

  // Fallback: try extracting from first <p> block if targeted extraction fails
  if (!narrativeHtml || cleanText(narrativeHtml).length < 100) {
    console.log(`[NDERF] ${id}: targeted extraction failed, using fallback`);
    const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (pMatches) {
      narrativeHtml = pMatches.join('\n\n');
    }
  }

  // Clean the narrative content
  let content = cleanText(narrativeHtml);

  // Skip if content is too short
  if (content.length < 100) {
    console.log(`[NDERF] Skipping ${id}: content too short (${content.length} chars)`);
    return null;
  }

  // Pages over 40K are almost certainly index/listing pages
  if (content.length > 40000) {
    console.log(`[NDERF] Skipping ${id}: content too long (${content.length} chars) — likely an index page`);
    return null;
  }

  // Cap description at a reasonable length for storage
  if (content.length > 15000) {
    content = content.substring(0, 15000) + '...';
  }

  console.log(`[NDERF] ${id}: clean narrative ${content.length} chars, starts: "${content.substring(0, 80)}..."`);

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

  // --- Extract trigger ONCE (used for both title and case profile) ---
  let triggerEvent: string | undefined;
  const threatField = extractField(html, 'At the time of your experience, was there an associated life-threatening event');
  if (threatField) {
    const afterYes = threatField.replace(/^(Yes|No|Uncertain)\s*/i, '').trim();
    // Reject placeholder values that carry no factual signal
    const lowered = afterYes.toLowerCase();
    const isPlaceholder = !afterYes || lowered === 'uncertain' || lowered === 'unsure' || lowered === 'unknown' || lowered === 'n/a';
    if (!isPlaceholder && afterYes.length > 2 && afterYes.length < 60) {
      triggerEvent = afterYes;
    }
  }

  // --- FIX 4: Generate compelling title (no person names) ---
  const title = generateNDERFTitle(html, content, ndeType, location, eventDate, triggerEvent);

  // --- Build structured Case Profile from questionnaire fields ---
  const ndeTypeLabel = NDE_TYPES[ndeType as keyof typeof NDE_TYPES] || ndeType;
  const caseProfile = buildCaseProfile(html, ndeTypeLabel, triggerEvent);

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
      ndeType: ndeTypeLabel,
      characteristics: extractCharacteristics(content),
      source: 'Near-Death Experience Research Foundation',
      gender: gender || undefined,
      triggerEvent: triggerEvent,
      case_profile: caseProfile
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
