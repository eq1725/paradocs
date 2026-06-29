// ADCRF (After-Death Communication Research Foundation) Adapter
// Fetches experience reports from adcrf.org — the sister site to NDERF run
// by the same research foundation.
//
// Why ADCRF vs NDERF:
//   NDERF hosts only Near-Death Experiences. ADCRF hosts the foundation's
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
//   - No evaluative tier concept (ADCRF doesn't do Exceptional/Probable).
//   - Experience-type label is derived from the archive the link came from,
//     not from page content, which makes type detection reliable.
//
// ToS posture: same as NDERF — store source description as AI input only,
// surface only the AI-generated narrative + structured case profile to
// users. See MEDIA_POLICY.md and the scrub layer in src/pages/report/[slug].tsx.

import { SourceAdapter, AdapterResult, ScrapedReport } from '../types';
import {
  extractLocation,
  extractLocationSmart,
  buildCaseProfile,
  NDERFCaseProfile,
  LabelResolver,
} from './nderf';
import { extractDate } from '../utils/extract-date';

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

// Strip the ADCRF/NDERF page-header chrome that can leak into `content`
// when the primary narrative regex fails and the <p>-join fallback fires.
// On those pages the rendered text starts with some variant of:
//   "<Name/Title prefix> Home Page Share Experience New Experiences
//    Experience description:"
// The exact prefix varies by page template:
//   "Margaret B Experience Home Page Share Experience New Experiences ..."
//   "Ramata J OBE Home Page Share Experience New Experiences ..."
//   "Paul R Prayer Home Page Share Experience New Experiences ..."
//   "Rebecca Experience Home Page Share Experience New Experiences ..."
//   "Violette G Experiences Home Page Share Experience New Experiences ..."
//   "b Alessa S Experience Home Page Share Experience ..." (stray bold-tag char)
// The INVARIANT across every template is the terminal phrase
//   "Home Page Share Experience New Experiences Experience description"
// followed by an optional colon. We anchor on that invariant and strip
// up to 120 chars of preceding header text. The 120-char cap ensures we
// never accidentally clip a real narrative opener.
//
// Exported for the backfill script so historical rows can be cleaned.
export function stripADCRFHeaderChrome(content: string): string {
  if (!content) return content;
  const headerRe = /^[^\n]{0,120}Home\s+Page\s+Share\s+Experience\s+New\s+Experiences\s+Experience\s+description:?\s*/i;
  const cleaned = content.replace(headerRe, '').trim();
  return cleaned || content;
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
      console.log(`[ADCRF] Fetch failed (attempt ${i + 1}): ${url} — Status: ${response.status}`);
    } catch (e) {
      console.error(`[ADCRF] Fetch error (attempt ${i + 1}):`, url);
    }
    if (i < retries - 1) await delay(1000);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Experience type taxonomy (ADCRF-specific)
// ---------------------------------------------------------------------------
// Map: archive-page filename → { slug, label }
// Labels are neutral phenomenological terms drawn from the NDE/consciousness
// studies literature (Ring, Greyson, Moody, etc.) — they predate ADCRF and
// are not ADCRF's editorial trademark.
interface ArchiveConfig {
  url: string;
  typeSlug: string;          // kebab-case slug for tags + metadata
  typeLabel: string;         // human-readable public label
  defaultCategory: 'psychological_experiences' | 'psychic_phenomena';
}

// All ADCRF experience-type archives. URLs confirmed from adcrf.org index
// audit (April 2026). The adapter logs per-archive fetch failures and
// continues, so if any URL 404s in the future the run will still complete.
const ADCRF_ARCHIVES: ArchiveConfig[] = [
  // V11.17.15 — ADCRF is overwhelmingly After-Death Communication (87% of
  // 1,815 indexed pages). Single canonical source: indexcontents.htm.
  // The _adc / _adcs suffixes capture the ADCRF-native experiences;
  // cross-references to other Dr. Long sites (_obe, _ste, etc.) are
  // intentionally skipped — those will be picked up by their own
  // adapter (OBERF / NDERF).
  {
    url: 'https://www.adcrf.org/indexcontents.htm',
    typeSlug: 'after-death-communication',
    typeLabel: 'After-Death Communication',
    defaultCategory: 'psychic_phenomena',
  },
  // Shared Death Experience: 3 _sde links exist. Folded into the
  // shared-death-experience phenomenon type.
  {
    url: 'https://www.adcrf.org/indexcontents.htm',
    typeSlug: 'shared-death-experience',
    typeLabel: 'Shared Death Experience',
    defaultCategory: 'psychic_phenomena',
  },
];

// ---------------------------------------------------------------------------
// ADCRF field extraction — colour-based, not class-based
// ---------------------------------------------------------------------------
// NDERF wraps question labels in <span class="m105">…</span>. ADCRF does NOT —
// it wraps question labels in inline-styled spans with color:green, and the
// following answer in inline-styled spans with color:blue. E.g.:
//
//   <span style="...color:green...">Did you see a light?</span>
//   <b><span style="...color:blue...">No</span></b>
//
// So we parse ADCRF pages by slicing the HTML into green-span → blue-span
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

export function buildADCRFFieldMap(html: string): Map<string, string> {
  const map = new Map<string, string>();

  // Collect all green-span positions + their label text. The regex is
  // permissive about whitespace inside the style attribute since ADCRF
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
    // Trim to reasonable size — free-text answers on ADCRF rarely exceed 1.5KB,
    // anything larger is almost certainly the trailing page footer.
    const trimmed = value.length > 2000 ? value.substring(0, 2000) : value;
    if (trimmed.length > 0) {
      map.set(normalizeLabel(greens[i].label), trimmed);
    }
  }

  return map;
}

// Resolver closure that looks up any of several candidate labels against an
// already-built map. Shared with buildCaseProfile so ADCRF gets structured
// Yes/No and free-text answers identical in shape to NDERF's output.
export function adcrfLabelResolver(fieldMap: Map<string, string>): LabelResolver {
  return (labels: string[]) => {
    for (const label of labels) {
      const key = normalizeLabel(label);
      const direct = fieldMap.get(key);
      if (direct) return direct;
      // Fuzzy prefix match — ADCRF's label text sometimes has trailing
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
// ADCRF individual experience URLs use name-based filenames like
// /alessa_s_obe.htm, /a_k_obe.htm, /fatimeh_obes.htm.
// Pattern: /{word(s)}_{obe|obes|ste|nde|etc}.htm

// Skip-set: the archive index pages themselves match the link regex
// (e.g. stories_obe.htm matches /*_obe.htm), so without this the adapter
// wastes a 100KB+ fetch on the index page and logs a "content too long"
// skip. Derived programmatically from ADCRF_ARCHIVES.
const ARCHIVE_BASENAMES: Set<string> = new Set(
  ADCRF_ARCHIVES.map(a => {
    const m = a.url.match(/\/([a-z0-9_-]+)\.htm[l]?$/i);
    return m ? m[1].toLowerCase() : '';
  }).filter(Boolean)
);

function parseADCRFArchiveIndex(html: string, typeSlug: string): Array<{ id: string; url: string }> {
  const results: Array<{ id: string; url: string }> = [];
  const seen = new Set<string>();

  // Narrow the pattern by type: if we're scraping stories_obe.htm, we only
  // want /*_obe.htm or /*_obes.htm links (plural allowed). This keeps us
  // from picking up cross-links to other experience types on the same page.
  // V11.17.15 — ADCRF native suffixes only. The indexcontents.htm has
  // cross-references to other Dr. Long sites (_obe, _ste, etc.) — those
  // are caught by their own adapter and intentionally skipped here.
  const typeSuffix = typeSlug === 'after-death-communication' ? '(?:adc|adcs)'
    : typeSlug === 'shared-death-experience' ? '(?:sde|sadc)'
    : '[a-z_]+';

  const pattern = new RegExp(
    '<a[^>]+href=["\']([^"\']*adcrf\\.org\\/[^"\']*_' + typeSuffix + '\\.htm[l]?)["\']',
    'gi'
  );

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const rawUrl = match[1];
    const url = rawUrl.startsWith('http') ? rawUrl : `https://www.adcrf.org${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
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
// Date extraction — V10.8.B delegates to the unified extractDate utility.
// ADCRF's structured "Date of Experience" field uses MM/DD/YYYY with 0
// sentinels for unknown parts (e.g. "04/00/2007" = month precision). Prose
// fallback now captures month-name forms like "On April 28th 2007" that
// the previous year-only regex threw away. Returns the extractDate audit
// source so the engine can store it in reports.event_date_extracted_from.
// ---------------------------------------------------------------------------
function extractADCRFDate(
  getField: LabelResolver,
  content: string,
): {
  date: string | undefined;
  precision: 'exact' | 'month' | 'year' | 'unknown';
  source: 'structured' | 'prose-monthname' | 'prose-numeric' | 'prose-year' | 'none';
} {
  const raw = getField([
    'Date of Experience',
    'Date of OBE',
    'Date of experience',
  ]);

  const result = extractDate({
    structured: raw || null,
    prose: content || null,
  });

  return {
    date: result.date || undefined,
    precision: result.precision,
    source: result.source,
  };
}

// ---------------------------------------------------------------------------
// Title generation — no tier logic (ADCRF doesn't tier), no "During X"
// trigger logic (OBE/STE typically have no life-threatening event). Just
// neutral label + optional location + optional year.
// ---------------------------------------------------------------------------
function generateADCRFTitle(
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
// Tag generation — type-slug + structural signals. No evaluative tags.
// ---------------------------------------------------------------------------
function generateADCRFTags(content: string, typeSlug: string): string[] {
  const tags = new Set<string>(['adcrf', typeSlug]);
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
// Several ADCRF archives lump phenomenologically distinct experience types
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
// Dream, which matches ADCRF's own classification).
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
async function parseADCRFExperiencePage(
  html: string,
  id: string,
  archive: ArchiveConfig,
): Promise<ScrapedReport | null> {
  // Narrative extraction — same markers as NDERF (same questionnaire form).
  //
  // Previous terminator was hardcoded to "Background Information" or
  // "NDE/OBE/Experience Elements". Some short-form ADCRF pages (e.g.
  // margaret_b_other.htm) omit both sections entirely, which caused the
  // regex to fail and the fallback <p>-join path to grab the page's
  // header nav ("<Name> Experience | Home Page | Share Experience | ...").
  // The green `.m108` class is used for EVERY questionnaire section header,
  // so any subsequent `<span class="m108">` after "Experience Description"
  // is a valid terminator.
  let narrativeHtml = '';
  const narrativeMatch = html.match(
    /Experience\s*(?:Description|description)<\/span>([\s\S]*?)<span[^>]*class="m108"/i
  );
  if (narrativeMatch) narrativeHtml = narrativeMatch[1];

  if (!narrativeHtml || cleanText(narrativeHtml).length < 100) {
    const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (pMatches) narrativeHtml = pMatches.join('\n\n');
  }

  let content = cleanText(narrativeHtml);
  // Defense-in-depth: strip the ADCRF page header boilerplate if it leaked
  // into `content` via the <p>-join fallback path. The header is always:
  //   "<First> <LastInitial[.]> Experience Home Page Share Experience
  //    New Experiences Experience description:"
  // Anchored to the start, with very tight tolerances so we never strip a
  // legitimate narrative opener.
  content = stripADCRFHeaderChrome(content);
  if (content.length < 100) {
    console.log(`[ADCRF] Skipping ${id}: content too short (${content.length} chars)`);
    return null;
  }
  if (content.length > 40000) {
    console.log(`[ADCRF] Skipping ${id}: content too long (${content.length} chars) — likely an index page`);
    return null;
  }
  if (content.length > 15000) content = content.substring(0, 15000) + '...';

  // Build the green/blue field map ONCE per page and reuse for every lookup.
  const fieldMap = buildADCRFFieldMap(html);
  const getField = adcrfLabelResolver(fieldMap);

  const { date: eventDate, precision: datePrecision, source: dateSource } = extractADCRFDate(getField, content);
  const gender = getField(['Gender']) || undefined;
  // LLM-first event-location extraction so multi-location narratives
  // resolve to where the experience actually happened, not where the
  // experiencer lived. Falls back to regex if Claude is unavailable.
  const location = await extractLocationSmart(content, html, archive.typeLabel);

  // OBE reports rarely have a "life-threatening event" trigger; try anyway
  // in case the experiencer filled it in. ADCRF uses "At the time of this
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

  const title = generateADCRFTitle(effectiveTypeLabel, location, eventDate);
  // Reuse NDERF's buildCaseProfile via the LabelResolver contract — the
  // questionnaire content is the same; only the HTML markup differs.
  // Passing the effective type label means the profile renders with the
  // sub-typed label (e.g. "After-Death Communication") when applicable.
  const caseProfile: NDERFCaseProfile = buildCaseProfile(getField, effectiveTypeLabel, triggerEvent);

  // Archive-type → case-profile inference.
  // ADCRF organizes reports into type-specific archives; the archive itself
  // is a curator-assigned classification signal. Propagate it to the profile
  // ONLY when the questionnaire doesn't already contain a contradicting
  // explicit value — we never overwrite the experiencer's own answer.
  //
  // - OBE / SOBE archives: the entire archive is, by definition, out-of-body.
  //   Many pages on these archives submitted on the NDERF-variant form don't
  //   include a "separation from body" question (see violette_g_obes), or
  //   are narrative-only (see remata_j_obe). Defaulting outOfBody to 'yes'
  //   from archive membership is faithful to the source (ADCRF published
  //   these under stories_obe.htm / sobe_stories.htm).
  if (
    (archive.typeSlug === 'out-of-body-experience' || archive.typeSlug === 'sudden-obe') &&
    caseProfile.outOfBody === undefined
  ) {
    caseProfile.outOfBody = 'yes';
  }

  const summary = content.length > 300 ? content.substring(0, 297) + '...' : content;
  const tags = generateADCRFTags(content, effectiveTypeSlug);
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
    // V10.8.B audit trail — how extractDate arrived at the date above.
    event_date_extracted_from: dateSource,
    source_type: 'adcrf',
    // Use a hash-like slug based on the filename stem — ADCRF's filenames
    // encode first name + last initial which is low-PII but we still
    // prefer not to echo them verbatim into our URL space. The prefix
    // keeps reports distinct from NDERF's namespace.
    original_report_id: `adcrf-${id}`,
    tags: Array.from(new Set(tags)),
    source_label: 'ADCRF',
    source_url: `https://www.adcrf.org/${id}.htm`,
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
export const adcrfAdapter: SourceAdapter = {
  name: 'adcrf',

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
      ? ADCRF_ARCHIVES.filter(a => a.typeSlug === archiveSlugFilter)
      : ADCRF_ARCHIVES;

    try {
      console.log(
        `[ADCRF] Starting scrape. Limit: ${limit}. Archives enabled: ${archivesToRun.length}` +
          (archiveSlugFilter ? ` (filtered to archive_slug="${archiveSlugFilter}")` : ''),
      );

      for (const archive of archivesToRun) {
        if (reports.length >= limit) break;
        console.log(`[ADCRF] Fetching archive: ${archive.url} (${archive.typeLabel})`);
        const archiveHtml = await fetchWithHeaders(archive.url);
        if (!archiveHtml) {
          console.log(`[ADCRF] Failed to fetch archive: ${archive.url}`);
          continue;
        }

        const experiences = parseADCRFArchiveIndex(archiveHtml, archive.typeSlug);
        console.log(`[ADCRF] Found ${experiences.length} ${archive.typeLabel} experiences in ${archive.url}`);

        for (const exp of experiences) {
          if (reports.length >= limit) break;
          await delay(rateLimitMs);

          const expHtml = await fetchWithHeaders(exp.url);
          if (!expHtml) {
            console.log(`[ADCRF] Failed to fetch experience: ${exp.id}`);
            continue;
          }

          const report = await parseADCRFExperiencePage(expHtml, exp.id, archive);
          if (report) {
            reports.push(report);
            if (reports.length % 20 === 0) {
              console.log(`[ADCRF] Processed ${reports.length} reports...`);
            }
          }
        }
      }

      console.log(`[ADCRF] Scrape complete. Total: ${reports.length} reports`);

      if (reports.length === 0) {
        return {
          success: false,
          reports,
          error: 'No reports found — ADCRF archive URLs may have changed. Check site structure.',
        };
      }

      return { success: true, reports };
    } catch (error) {
      console.error('[ADCRF] Scrape error:', error);
      return {
        success: false,
        reports,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
};

export default adcrfAdapter;
