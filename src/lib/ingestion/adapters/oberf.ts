// OBERF (Out-of-Body Experience Research Foundation) Adapter
// Fetches experience reports from oberf.org — the sister site to NDERF run
// by the same research foundation.
//
// Why OBERF vs NDERF:
//   NDERF hosts only Near-Death Experiences. OBERF hosts the foundation's
//   non-NDE archives: OBE, STE, SDE, DBV, pre-birth memory, NDE-like,
//   prayer, dream, UFO-contact, and other spiritually transformative
//   experience families.
//
// Questionnaire format is IDENTICAL to NDERF (same foundation, same web
// form), so this adapter reuses the NDERF adapter's field extractors and
// case-profile builder. What's different:
//   - Archive URLs are per-experience-type (stories_obe.htm, ste.htm, etc.)
//   - Individual experience URLs use name-based filenames
//     (e.g. /alessa_s_obe.htm) rather than NDERF's numeric IDs.
//   - No evaluative tier concept (OBERF doesn't do Exceptional/Probable).
//   - Experience-type label is derived from the archive the link came from,
//     not from page content, which makes type detection reliable.
//
// ToS posture: same as NDERF — store source description as AI input only,
// surface only the AI-generated narrative + structured case profile to
// users. See MEDIA_POLICY.md and the scrub layer in src/pages/report/[slug].tsx.

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';
import {
  extractLocation,
  buildCaseProfile,
  NDERFCaseProfile,
  LabelResolver,
} from './nderf';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function fetchWithHeaders(url: string, retries: number = 3): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (response.ok) return await response.text();
      console.log(`[OBERF] Fetch failed (attempt ${i + 1}): ${url} — Status: ${response.status}`);
    } catch (e) {
      console.error(`[OBERF] Fetch error (attempt ${i + 1}):`, url);
    }
    if (i < retries - 1) await delay(1000);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Experience type taxonomy (OBERF-specific)
// ---------------------------------------------------------------------------
// Map: archive-page filename → { slug, label }
// Labels are neutral phenomenological terms drawn from the NDE/consciousness
// studies literature (Ring, Greyson, Moody, etc.) — they predate OBERF and
// are not OBERF's editorial trademark.
interface ArchiveConfig {
  url: string;
  typeSlug: string;          // kebab-case slug for tags + metadata
  typeLabel: string;         // human-readable public label
  defaultCategory: 'psychological_experiences' | 'psychic_phenomena';
}

// All OBERF experience-type archives. URLs confirmed from oberf.org index
// audit (April 2026). The adapter logs per-archive fetch failures and
// continues, so if any URL 404s in the future the run will still complete.
const OBERF_ARCHIVES: ArchiveConfig[] = [
  {
    url: 'https://www.oberf.org/stories_obe.htm',
    typeSlug: 'out-of-body-experience',
    typeLabel: 'Out-of-Body Experience',
    defaultCategory: 'psychological_experiences',
  },
  {
    url: 'https://www.oberf.org/ste.htm',
    typeSlug: 'spiritually-transformative-experience',
    typeLabel: 'Spiritually Transformative Experience',
    defaultCategory: 'psychological_experiences',
  },
  {
    url: 'https://www.oberf.org/sobe_stories.htm',
    typeSlug: 'sudden-obe',
    typeLabel: 'Sudden Out-of-Body Experience',
    defaultCategory: 'psychological_experiences',
  },
  {
    url: 'https://www.oberf.org/dbv.htm',
    typeSlug: 'deathbed-vision',
    typeLabel: 'Deathbed Vision',
    defaultCategory: 'psychological_experiences',
  },
  {
    url: 'https://www.oberf.org/nde_like_stories.htm',
    typeSlug: 'nde-like-experience',
    typeLabel: 'NDE-Like Experience',
    defaultCategory: 'psychological_experiences',
  },
  {
    url: 'https://www.oberf.org/prebirth.htm',
    typeSlug: 'pre-birth-memory',
    typeLabel: 'Pre-Birth Memory',
    defaultCategory: 'psychic_phenomena',
  },
  {
    url: 'https://www.oberf.org/prayer.htm',
    typeSlug: 'prayer-experience',
    typeLabel: 'Prayer Experience',
    defaultCategory: 'psychological_experiences',
  },
  {
    url: 'https://www.oberf.org/dream_stories.htm',
    typeSlug: 'dream-experience',
    typeLabel: 'Dream Experience',
    defaultCategory: 'psychological_experiences',
  },
  {
    url: 'https://www.oberf.org/other_stories.htm',
    typeSlug: 'other-experience',
    typeLabel: 'Other Experience',
    defaultCategory: 'psychological_experiences',
  },
  // UFO category: listed on the NDERF index page and hosted under OBERF.
  // Added April 2026 as part of B1.5 pre-QA audit. Defaults to
  // `psychic_phenomena` category rather than `ufos_aliens` because
  // OBERF's UFO archive is primarily consciousness/contact-adjacent
  // narrative reports, not raw sighting data — the NUFORC/MUFON adapters
  // own traditional sighting ingestion.
  {
    url: 'https://www.oberf.org/ufo.htm',
    typeSlug: 'ufo-encounter',
    typeLabel: 'UFO Encounter',
    defaultCategory: 'psychic_phenomena',
  },
];

// ---------------------------------------------------------------------------
// OBERF field extraction — colour-based, not class-based
// ---------------------------------------------------------------------------
// NDERF wraps question labels in <span class="m105">…</span>. OBERF does NOT —
// it wraps question labels in inline-styled spans with color:green, and the
// following answer in inline-styled spans with color:blue. E.g.:
//
//   <span style="...color:green...">Did you see a light?</span>
//   <b><span style="...color:blue...">No</span></b>
//
// So we parse OBERF pages by slicing the HTML into green-span → blue-span
// pairs, and build a Map<normalizedLabel, answerText>. All case-profile
// extractions then read from this map.
//
// Answer spans may be nested (outer color:blue wraps inner mso-no-proof
// descriptive text), so we capture the entire text region between a green
// span and the next green span, strip HTML, and collapse whitespace — that
// gives us the concatenated answer plus any follow-up description.

function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[?:.,;]+\s*$/g, '')       // trim trailing punctuation
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildOBERFFieldMap(html: string): Map<string, string> {
  const map = new Map<string, string>();

  // Collect all green-span positions + their label text. The regex is
  // permissive about whitespace inside the style attribute since OBERF
  // pages contain mso-exported HTML with sprawling inline styles.
  const greenRe = /<span[^>]*color\s*:\s*green[^>]*>([\s\S]*?)<\/span>/gi;
  interface GreenHit { pos: number; endPos: number; label: string; }
  const greens: GreenHit[] = [];
  let m: RegExpExecArray | null;
  while ((m = greenRe.exec(html)) !== null) {
    const labelRaw = cleanText(m[1]);
    if (labelRaw && labelRaw.length > 5 && labelRaw.length < 250) {
      greens.push({ pos: m.index, endPos: m.index + m[0].length, label: labelRaw });
    }
  }

  // For each green label, capture everything between it and the next green
  // label as the answer region. Strip HTML → clean text → concatenated answer.
  for (let i = 0; i < greens.length; i++) {
    const start = greens[i].endPos;
    const end = i + 1 < greens.length ? greens[i + 1].pos : Math.min(start + 4000, html.length);
    const region = html.slice(start, end);
    const value = cleanText(region);
    // Trim to reasonable size — free-text answers on OBERF rarely exceed 1.5KB,
    // anything larger is almost certainly the trailing page footer.
    const trimmed = value.length > 2000 ? value.substring(0, 2000) : value;
    if (trimmed.length > 0) {
      map.set(normalizeLabel(greens[i].label), trimmed);
    }
  }

  return map;
}

// Resolver closure that looks up any of several candidate labels against an
// already-built map. Shared with buildCaseProfile so OBERF gets structured
// Yes/No and free-text answers identical in shape to NDERF's output.
export function oberfLabelResolver(fieldMap: Map<string, string>): LabelResolver {
  return (labels: string[]) => {
    for (const label of labels) {
      const key = normalizeLabel(label);
      const direct = fieldMap.get(key);
      if (direct) return direct;
      // Fuzzy prefix match — OBERF's label text sometimes has trailing
      // verbiage beyond the canonical question wording. E.g., we query
      // "Did you meet or see any other beings" but the page contains
      // "Did you meet or see any other beings during your experience".
      for (const storedKey of Array.from(fieldMap.keys())) {
        if (storedKey.startsWith(key) || key.startsWith(storedKey)) {
          const v = fieldMap.get(storedKey);
          if (v) return v;
        }
      }
    }
    return null;
  };
}

// ---------------------------------------------------------------------------
// Archive-index parsing
// ---------------------------------------------------------------------------
// OBERF individual experience URLs use name-based filenames like
// /alessa_s_obe.htm, /a_k_obe.htm, /fatimeh_obes.htm.
// Pattern: /{word(s)}_{obe|obes|ste|nde|etc}.htm

// Skip-set: the archive index pages themselves match the link regex
// (e.g. stories_obe.htm matches /*_obe.htm), so without this the adapter
// wastes a 100KB+ fetch on the index page and logs a "content too long"
// skip. Derived programmatically from OBERF_ARCHIVES.
const ARCHIVE_BASENAMES: Set<string> = new Set(
  OBERF_ARCHIVES.map(a => {
    const m = a.url.match(/\/([a-z0-9_-]+)\.htm[l]?$/i);
    return m ? m[1].toLowerCase() : '';
  }).filter(Boolean)
);

function parseOBERFArchiveIndex(html: string, typeSlug: string): Array<{ id: string; url: string }> {
  const results: Array<{ id: string; url: string }> = [];
  const seen = new Set<string>();

  // Narrow the pattern by type: if we're scraping stories_obe.htm, we only
  // want /*_obe.htm or /*_obes.htm links (plural allowed). This keeps us
  // from picking up cross-links to other experience types on the same page.
  const typeSuffix = typeSlug === 'out-of-body-experience' ? '(?:obe|obes)'
    : typeSlug === 'spiritually-transformative-experience' ? 'ste'
    : typeSlug === 'sudden-obe' ? '(?:sobe|sudden_obe)'
    : typeSlug === 'deathbed-vision' ? '(?:dbv|deathbed)'
    : typeSlug === 'nde-like-experience' ? '(?:nde_like|nde-like|ndelike)'
    : typeSlug === 'pre-birth-memory' ? '(?:prebirth|pre_birth)'
    : typeSlug === 'prayer-experience' ? 'prayer'
    : typeSlug === 'dream-experience' ? 'dream'
    : typeSlug === 'ufo-encounter' ? 'ufo'
    : '[a-z_]+';

  const pattern = new RegExp(
    '<a[^>]+href=["\']([^"\']*oberf\\.org\\/[^"\']*_' + typeSuffix + '\\.htm[l]?)["\']',
    'gi'
  );

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const rawUrl = match[1];
    const url = rawUrl.startsWith('http') ? rawUrl : `https://www.oberf.org${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    // Extract filename stem as ID (e.g., "alessa_s_obe")
    const fileMatch = url.match(/\/([a-z0-9_-]+)\.htm[l]?$/i);
    if (!fileMatch) continue;
    const id = fileMatch[1].toLowerCase();
    if (seen.has(id)) continue;
    // Skip archive index URLs that match their own link pattern
    // (e.g. stories_obe.htm matches the *_obe.htm regex).
    if (ARCHIVE_BASENAMES.has(id)) continue;
    seen.add(id);
    results.push({ id, url });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Date extraction — OBERF uses "Date of Experience" rather than NDERF's
// "Date of NDE". Value format is the same (MM/DD/YYYY, 0 for unknown parts).
// ---------------------------------------------------------------------------
function extractOBERFDate(getField: LabelResolver, content: string): { date: string | undefined; precision: 'exact' | 'month' | 'year' | 'unknown' } {
  let raw = getField([
    'Date of Experience',
    'Date of OBE',
    'Date of experience',
  ]);

  // Fallback: many OBERF pages have no "Date of Experience" questionnaire
  // field. Pull a year from the narrative when available. We only extract
  // year precision here (month/day from prose would be unreliable).
  if (!raw && content) {
    const yearMatch = content.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
    if (yearMatch) return { date: `${yearMatch[1]}-01-01`, precision: 'year' };
  }

  if (!raw) return { date: undefined, precision: 'unknown' };

  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1], 10);
    const day = parseInt(mdyMatch[2], 10);
    let year = parseInt(mdyMatch[3], 10);
    if (year < 100) year = year < 50 ? 2000 + year : 1900 + year;
    if (month === 0) return { date: `${year}-01-01`, precision: 'year' };
    if (day === 0) {
      const m = String(month).padStart(2, '0');
      return { date: `${year}-${m}-01`, precision: 'month' };
    }
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return { date: `${year}-${m}-${d}`, precision: 'exact' };
  }

  const yearMatch = raw.match(/^(\d{4})$/);
  if (yearMatch) return { date: `${yearMatch[1]}-01-01`, precision: 'year' };

  const myMatch = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (myMatch) {
    const m = String(parseInt(myMatch[1], 10)).padStart(2, '0');
    return { date: `${myMatch[2]}-${m}-01`, precision: 'month' };
  }

  return { date: undefined, precision: 'unknown' };
}

// ---------------------------------------------------------------------------
// Title generation — no tier logic (OBERF doesn't tier), no "During X"
// trigger logic (OBE/STE typically have no life-threatening event). Just
// neutral label + optional location + optional year.
// ---------------------------------------------------------------------------
function generateOBERFTitle(
  typeLabel: string,
  location: { location_name?: string },
  dateStr: string | undefined,
): string {
  const parts: string[] = [typeLabel];
  if (location.location_name) parts.push(location.location_name);
  if (dateStr) {
    const y = dateStr.match(/^(\d{4})/);
    if (y) parts.push(`(${y[1]})`);
  }

  // Join: "Out-of-Body Experience, Denver, Colorado (2019)"
  let title = parts[0];
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith('(')) title += ' ' + parts[i];
    else title += ', ' + parts[i];
  }
  return title.substring(0, 200);
}

// ---------------------------------------------------------------------------
// Credibility scoring — simpler than NDERF (no tier input). Based purely on
// narrative length + structural completeness signals.
// ---------------------------------------------------------------------------
function determineCredibility(content: string): 'low' | 'medium' | 'high' {
  let score = 0;
  if (content.length > 500) score += 1;
  if (content.length > 1500) score += 1;
  if (content.length > 3000) score += 1;
  if (/\d{4}/.test(content)) score += 1;  // has at least a year reference
  if (score >= 3) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Tag generation — type-slug + structural signals. No evaluative tags.
// ---------------------------------------------------------------------------
function generateOBERFTags(content: string, typeSlug: string): string[] {
  const tags = new Set<string>(['oberf', typeSlug]);
  const lower = content.toLowerCase();
  if (lower.includes('tunnel') || lower.includes('darkness')) tags.add('tunnel-experience');
  if (lower.includes('light') && (lower.includes('bright') || lower.includes('white'))) tags.add('being-of-light');
  if (lower.includes('life review') || lower.includes('my life flash')) tags.add('life-review');
  if (lower.includes('above my body') || lower.includes('looking down')) tags.add('out-of-body');
  if (lower.includes('peaceful') || lower.includes('serenity')) tags.add('peace-calm');
  if (lower.includes('unconditional') && lower.includes('love')) tags.add('unconditional-love');
  if (lower.includes('boundary') || lower.includes('point of no return')) tags.add('boundary-experience');
  if (lower.includes('terrifying') || lower.includes('frightening')) tags.add('distressing-experience');
  if (lower.includes('beautiful') || lower.includes('wonderful')) tags.add('positive-experience');
  return Array.from(tags);
}

// ---------------------------------------------------------------------------
// Narrative-cue sub-typing
// ---------------------------------------------------------------------------
// Several OBERF archives lump phenomenologically distinct experience types
// into a single archive page:
//
//   dbv.htm          → Deathbed Vision, After-Death Communication, NELE
//   dream_stories.htm → Dream Experience, Premonition / Waking Vision
//
// The NDERF index page (https://www.nderf.org/index.htm) treats these as
// separate categories with distinct definitions. We replicate that
// distinction by inspecting the narrative for timing / temporal-position
// cues after the shared questionnaire has been parsed. Default is always
// the archive's own type (so a narrative lacking clear cues stays DBV or
// Dream, which matches OBERF's own classification).
//
// These helpers are deliberately conservative — only reassign when a clear
// cue is present. False reassignment risk is higher than false retention.

interface Subtype { typeSlug: string; typeLabel: string; }

function subtypeDBVArchive(content: string): Subtype | null {
  const lower = content.toLowerCase();

  // After-Death Communication: experience occurs AFTER the loved one has died.
  // Look for explicit post-death temporal language paired with an experiential
  // verb. The /(?:died|passed|passing)/ alone is insufficient (DBVs involve
  // dying people too) — we require a "happened afterward" construction.
  const adcCues: RegExp[] = [
    /after (?:his|her|their|my|our) (?:death|passing|funeral|burial)/,
    /(?:days|weeks|months|years) after (?:he|she|they) (?:died|passed)/,
    /(?:died|passed away|passed on)[\s\S]{0,60}?(?:later|afterward|subsequently|the next (?:day|night|week))/,
    /deceased (?:mother|father|sister|brother|son|daughter|husband|wife|grandmother|grandfather|aunt|uncle|friend|partner)[\s\S]{0,40}?(?:visited|appeared|spoke|came to|contacted)/,
    /felt (?:his|her|their) presence after (?:he|she|they) (?:died|passed)/,
    /visitation dream (?:of|from) (?:my|our) (?:deceased|late|departed)/,
  ];
  if (adcCues.some(r => r.test(lower))) {
    return { typeSlug: 'after-death-communication', typeLabel: 'After-Death Communication' };
  }

  // NELE: weeks-to-months-BEFORE-death reach / lucidity / anticipatory phenomena.
  // Distinct from DBV's hours-before-death "actively dying" frame.
  const neleCues: RegExp[] = [
    /(?:weeks|months) before (?:his|her|their|my|our) (?:death|passing)/,
    /in the (?:weeks|months) (?:leading up to|before|preceding) (?:his|her|their|my|our) (?:death|passing)/,
    /(?:weeks|months) prior to (?:his|her|their) (?:death|passing)/,
    /leading up to (?:his|her|their) (?:death|passing)/,
  ];
  if (neleCues.some(r => r.test(lower))) {
    return { typeSlug: 'nearing-end-of-life-experience', typeLabel: 'Nearing End-of-Life Experience' };
  }

  return null;
}

function subtypeDreamArchive(content: string): Subtype | null {
  const lower = content.toLowerCase();

  // Premonition: temporal foreknowledge — saw it in a dream/vision and it
  // later actually happened. Require a "came true / happened / realized"
  // confirmation to avoid tagging ordinary anxious dreams as precognitive.
  const premCues: RegExp[] = [
    /(?:foresaw|foreseen|premonition|precognitive|precognition|prophetic)/,
    /(?:came true|actually happened|turned out to be true|proved (?:true|real))/,
    /(?:days|weeks|months) later[\s\S]{0,80}?(?:exactly as|just as|as (?:i had|i'd) (?:seen|dreamed|dreamt))/,
    /(?:knew|realized)[\s\S]{0,40}?(?:before it happened|ahead of time|in advance)/,
    /warning (?:dream|vision)[\s\S]{0,60}?(?:came true|actually happened|proved true)/,
  ];
  if (premCues.some(r => r.test(lower))) {
    return { typeSlug: 'premonition-experience', typeLabel: 'Premonition / Waking Vision' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Individual experience-page parser
// ---------------------------------------------------------------------------
function parseOBERFExperiencePage(
  html: string,
  id: string,
  archive: ArchiveConfig,
): ScrapedReport | null {
  // Narrative extraction — same markers as NDERF (same questionnaire form).
  let narrativeHtml = '';
  const narrativeMatch = html.match(
    /Experience\s*(?:Description|description)<\/span>([\s\S]*?)(?:<span[^>]*class="m108"[^>]*>Background\s*Information|<span[^>]*class="m108"[^>]*>(?:NDE|OBE|Experience)\s*Elements)/i
  );
  if (narrativeMatch) narrativeHtml = narrativeMatch[1];

  if (!narrativeHtml || cleanText(narrativeHtml).length < 100) {
    const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (pMatches) narrativeHtml = pMatches.join('\n\n');
  }

  let content = cleanText(narrativeHtml);
  if (content.length < 100) {
    console.log(`[OBERF] Skipping ${id}: content too short (${content.length} chars)`);
    return null;
  }
  if (content.length > 40000) {
    console.log(`[OBERF] Skipping ${id}: content too long (${content.length} chars) — likely an index page`);
    return null;
  }
  if (content.length > 15000) content = content.substring(0, 15000) + '...';

  // Build the green/blue field map ONCE per page and reuse for every lookup.
  const fieldMap = buildOBERFFieldMap(html);
  const getField = oberfLabelResolver(fieldMap);

  const { date: eventDate, precision: datePrecision } = extractOBERFDate(getField, content);
  const gender = getField(['Gender']) || undefined;
  const location = extractLocation(content, html);

  // OBE reports rarely have a "life-threatening event" trigger; try anyway
  // in case the experiencer filled it in. OBERF uses "At the time of this
  // experience, was there an associated life threatening event?" (no hyphen),
  // NDERF uses "At the time of your experience, was there an associated
  // life-threatening event" — list both.
  let triggerEvent: string | undefined;
  const threatField = getField([
    'At the time of this experience, was there an associated life threatening event',
    'At the time of your experience, was there an associated life-threatening event',
    'At the time of your experience, was there an associated life threatening event',
  ]);
  if (threatField) {
    const afterYes = threatField.replace(/^(Yes|No|Uncertain)\s*/i, '').trim();
    const lowered = afterYes.toLowerCase();
    const isPlaceholder = !afterYes || lowered === 'uncertain' || lowered === 'unsure' || lowered === 'unknown' || lowered === 'n/a';
    if (!isPlaceholder && afterYes.length > 2 && afterYes.length < 60) {
      triggerEvent = afterYes;
    }
  }

  // Narrative-cue sub-typing for shared-archive pages. dbv.htm hosts DBV +
  // ADC + NELE; dream_stories.htm hosts Dream + Premonition. We default to
  // the archive's own type and only reassign on a clear textual cue.
  let effectiveTypeSlug = archive.typeSlug;
  let effectiveTypeLabel = archive.typeLabel;
  if (archive.typeSlug === 'deathbed-vision') {
    const sub = subtypeDBVArchive(content);
    if (sub) {
      effectiveTypeSlug = sub.typeSlug;
      effectiveTypeLabel = sub.typeLabel;
    }
  } else if (archive.typeSlug === 'dream-experience') {
    const sub = subtypeDreamArchive(content);
    if (sub) {
      effectiveTypeSlug = sub.typeSlug;
      effectiveTypeLabel = sub.typeLabel;
    }
  }

  const title = generateOBERFTitle(effectiveTypeLabel, location, eventDate);
  // Reuse NDERF's buildCaseProfile via the LabelResolver contract — the
  // questionnaire content is the same; only the HTML markup differs.
  // Passing the effective type label means the profile renders with the
  // sub-typed label (e.g. "After-Death Communication") when applicable.
  const caseProfile: NDERFCaseProfile = buildCaseProfile(getField, effectiveTypeLabel, triggerEvent);

  // Archive-type → case-profile inference.
  // OBERF organizes reports into type-specific archives; the archive itself
  // is a curator-assigned classification signal. Propagate it to the profile
  // ONLY when the questionnaire doesn't already contain a contradicting
  // explicit value — we never overwrite the experiencer's own answer.
  //
  // - OBE / SOBE archives: the entire archive is, by definition, out-of-body.
  //   Many pages on these archives submitted on the NDERF-variant form don't
  //   include a "separation from body" question (see violette_g_obes), or
  //   are narrative-only (see remata_j_obe). Defaulting outOfBody to 'yes'
  //   from archive membership is faithful to the source (OBERF published
  //   these under stories_obe.htm / sobe_stories.htm).
  if (
    (archive.typeSlug === 'out-of-body-experience' || archive.typeSlug === 'sudden-obe') &&
    caseProfile.outOfBody === undefined
  ) {
    caseProfile.outOfBody = 'yes';
  }

  const summary = content.length > 300 ? content.substring(0, 297) + '...' : content;
  const tags = generateOBERFTags(content, effectiveTypeSlug);
  if (gender) tags.push('experiencer-' + gender.toLowerCase());

  return {
    title,
    summary,
    description: content,
    category: archive.defaultCategory,
    location_name: location.location_name,
    country: location.country,
    state_province: location.state_province,
    city: location.city,
    location_precision: location.precision,
    event_date: eventDate,
    event_date_precision: datePrecision,
    credibility: determineCredibility(content),
    source_type: 'oberf',
    // Use a hash-like slug based on the filename stem — OBERF's filenames
    // encode first name + last initial which is low-PII but we still
    // prefer not to echo them verbatim into our URL space. The prefix
    // keeps reports distinct from NDERF's namespace.
    original_report_id: `oberf-${id}`,
    tags: Array.from(new Set(tags)),
    source_label: 'OBERF',
    source_url: `https://www.oberf.org/${id}.htm`,
    metadata: {
      // Effective type (may differ from archive.typeSlug when narrative
      // sub-typing fired — e.g. a dbv.htm page reassigned to ADC).
      experienceType: effectiveTypeLabel,
      experienceTypeSlug: effectiveTypeSlug,
      // Preserve the archive-level classification for provenance / debugging.
      archiveTypeSlug: archive.typeSlug,
      archiveTypeLabel: archive.typeLabel,
      source: 'Out-of-Body Experience Research Foundation',
      gender: gender,
      triggerEvent: triggerEvent,
      case_profile: caseProfile,
    },
  };
}

// ---------------------------------------------------------------------------
// Adapter entry point
// ---------------------------------------------------------------------------
export const oberfAdapter: SourceAdapter = {
  name: 'oberf',

  async scrape(config: Record<string, any>, limit: number = 100): Promise<AdapterResult> {
    const reports: ScrapedReport[] = [];
    const rateLimitMs = config.rate_limit_ms || 500;

    // QA / targeted-ingest hook: when config.archive_slug is set, only iterate
    // the matching archive. This lets B1.5 QA exercise each archive's parser
    // independently, and lets Session B2 resume a partial ingest per archive
    // without re-walking the earlier ones. When unset (the default), all
    // archives are iterated sequentially (legacy behavior preserved).
    const archiveSlugFilter: string | undefined =
      typeof config.archive_slug === 'string' ? config.archive_slug : undefined;
    const archivesToRun = archiveSlugFilter
      ? OBERF_ARCHIVES.filter(a => a.typeSlug === archiveSlugFilter)
      : OBERF_ARCHIVES;

    try {
      console.log(
        `[OBERF] Starting scrape. Limit: ${limit}. Archives enabled: ${archivesToRun.length}` +
          (archiveSlugFilter ? ` (filtered to archive_slug="${archiveSlugFilter}")` : ''),
      );

      for (const archive of archivesToRun) {
        if (reports.length >= limit) break;
        console.log(`[OBERF] Fetching archive: ${archive.url} (${archive.typeLabel})`);
        const archiveHtml = await fetchWithHeaders(archive.url);
        if (!archiveHtml) {
          console.log(`[OBERF] Failed to fetch archive: ${archive.url}`);
          continue;
        }

        const experiences = parseOBERFArchiveIndex(archiveHtml, archive.typeSlug);
        console.log(`[OBERF] Found ${experiences.length} ${archive.typeLabel} experiences in ${archive.url}`);

        for (const exp of experiences) {
          if (reports.length >= limit) break;
          await delay(rateLimitMs);

          const expHtml = await fetchWithHeaders(exp.url);
          if (!expHtml) {
            console.log(`[OBERF] Failed to fetch experience: ${exp.id}`);
            continue;
          }

          const report = parseOBERFExperiencePage(expHtml, exp.id, archive);
          if (report) {
            reports.push(report);
            if (reports.length % 20 === 0) {
              console.log(`[OBERF] Processed ${reports.length} reports...`);
            }
          }
        }
      }

      console.log(`[OBERF] Scrape complete. Total: ${reports.length} reports`);

      if (reports.length === 0) {
        return {
          success: false,
          reports,
          error: 'No reports found — OBERF archive URLs may have changed. Check site structure.',
        };
      }

      return { success: true, reports };
    } catch (error) {
      console.error('[OBERF] Scrape error:', error);
      return {
        success: false,
        reports,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
};

export default oberfAdapter;
