// NUFORC (National UFO Reporting Center) Adapter
// Fetches UFO sighting reports from nuforc.org (new WordPress-based site)

import { SourceAdapter, AdapterResult, ScrapedReport, ScrapedMediaItem } from '../types';
import { extractDate, type DateExtractionSource } from '../utils/extract-date';

// V11.17.13 — NUFORC's own "Explanation" column. When NUFORC themselves
// have investigated a sighting and concluded it was a mundane object,
// they tag it with one of these terms (or marks it as a confirmed hoax).
// We treat any non-empty explanation that matches as a hard reject —
// no point ingesting a UFO report NUFORC has already debunked.
const NUFORC_DEBUNKED_PATTERNS = /\b(hoax|i\.?f\.?o\.?|identified flying object|aircraft|airplane|airline|helicopter|drone|balloon|satellite|space.?x|spacex|starlink|venus|jupiter|mars|iss|international space station|astronomical|planet|stars?|meteor|fireworks|chinese lantern|sky lantern|advertising|searchlight|kite)\b/i;

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
  'square': ['rectangular', 'box-shaped'],
  'egg': ['oval', 'egg-shaped'],
};

// V11.17.13 — Shape → canonical encyclopedia phenomenon slug.
// Set as metadata.experienceTypeSlug so the engine's deterministic
// linker (resolvePhenomenonTypeBySlug + linkReportToCanonicalPhenomenonBySlug)
// fires for NUFORC the same way it does for NDERF/OBERF. Bypasses the
// brittle pattern matcher entirely for the primary type. Coverage: all
// 22 NUFORC shapes mapped to active phenomena that exist in prod.
//
// Mapping rationale: pick the most descriptive specific phenomenon that
// matches the witness's chosen shape word. "Star" and "Flash" both map
// to nocturnal-light (the 3,687-report bucket NUFORC's archive feeds).
// "Circle" maps to disc-ufo (round-from-front classic). "Light" alone
// (no shape) is the most common NUFORC tag and also lands at
// nocturnal-light. "Unknown"/"Other" deliberately unmapped — let the
// engine leave phenomenon_type_id null rather than mis-attribute.
// V11.17.62 — post-merge canonical slugs only. 4 entries were re-pointed
// after V11.17.57 phen-dedup merges flipped these slugs to status='merged':
//   sphere-ufo            → orb-ufo
//   cylindrical-ufo       → cigar-ufo
//   multi-light-formation → light-formation-ufo
//   fireball-ufo          → nocturnal-light  (fireball is the dominant
//                           nocturnal-light sub-pattern; no dedicated
//                           fireball phen exists post-merge)
export const SHAPE_TO_PHENOMENON_SLUG: Record<string, string> = {
  'light': 'nocturnal-light',
  'circle': 'disc-ufo',
  'triangle': 'triangular-ufo',
  'fireball': 'nocturnal-light',
  'sphere': 'orb-ufo',
  'oval': 'egg-ufo',
  'disk': 'disc-ufo',
  'cigar': 'cigar-ufo',
  'rectangle': 'rectangle-ufo',
  'chevron': 'chevron-ufo',
  'formation': 'light-formation-ufo',
  'changing': 'shape-shifting-ufo',
  'diamond': 'diamond-ufo',
  'cylinder': 'cigar-ufo',
  'teardrop': 'teardrop-ufo',
  'cone': 'cone-ufo',
  'orb': 'orb-ufo',
  'star': 'nocturnal-light',
  'flash': 'nocturnal-light',
  'egg': 'egg-ufo',
  'square': 'square-ufo',
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

// V11.17.63 — Cloudflare-resilient fetcher.
//
// Replaces the prior flat 1s × 2 retry (which collapsed under sustained
// Cloudflare 503/403 bursts) with:
//   1. Exponential backoff with ±25% jitter: 5s → 15s → 45s
//   2. Honors server-sent Retry-After header (overrides exponential)
//   3. Module-level circuit-breaker: after 5 consecutive 503/429 across
//      ALL workers, pause every fetcher for 5 min so Cloudflare's IP-
//      reputation cache can decay before we resume hitting it
//   4. User-Agent rotation across 5 plausible browser fingerprints
//   5. Sec-Fetch-* / Upgrade-Insecure-Requests headers to look like a
//      real browser navigation, not a scraper
let cfPauseUntilMs = 0;
let consecutiveBlocks = 0;
const CF_BREAKER_THRESHOLD = 5;
const CF_BREAKER_PAUSE_MS = 5 * 60 * 1000;

var NUFORC_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

function pickUserAgent(): string {
  return NUFORC_USER_AGENTS[Math.floor(Math.random() * NUFORC_USER_AGENTS.length)];
}

async function honorCloudflareBreaker(): Promise<void> {
  const now = Date.now();
  if (cfPauseUntilMs > now) {
    const waitMs = cfPauseUntilMs - now;
    console.log('[NUFORC] Circuit-breaker engaged — pausing ' + Math.round(waitMs / 1000) + 's for Cloudflare to cool down');
    await new Promise(function(r) { setTimeout(r, waitMs); });
  }
}

function computeBackoffMs(attemptIdx: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const n = parseInt(retryAfterHeader);
    if (!isNaN(n) && n > 0 && n < 600) return n * 1000;
  }
  // Exponential 5s, 15s, 45s with ±25% jitter
  const base = 5000 * Math.pow(3, attemptIdx);
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  return Math.max(1000, Math.round(base + jitter));
}

async function fetchWithHeaders(url: string, retries: number = 3): Promise<string | null> {
  await honorCloudflareBreaker();
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': pickUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        }
      });
      if (response.ok) {
        consecutiveBlocks = 0;
        return await response.text();
      }
      const status = response.status;
      const isBlock = status === 503 || status === 429 || status === 403;
      if (isBlock) {
        consecutiveBlocks++;
        if (consecutiveBlocks >= CF_BREAKER_THRESHOLD) {
          cfPauseUntilMs = Date.now() + CF_BREAKER_PAUSE_MS;
          console.log('[NUFORC] ' + consecutiveBlocks + ' consecutive blocks — engaging circuit-breaker, pausing ALL workers for ' + (CF_BREAKER_PAUSE_MS / 1000) + 's');
          consecutiveBlocks = 0;
        }
      }
      console.log('[NUFORC] Fetch failed (attempt ' + (i + 1) + '): ' + url + ' - Status: ' + status);
      if (i < retries - 1) {
        const waitMs = computeBackoffMs(i, response.headers.get('retry-after'));
        console.log('[NUFORC] Backoff ' + Math.round(waitMs / 1000) + 's before retry');
        await new Promise(function(r) { setTimeout(r, waitMs); });
        await honorCloudflareBreaker();
      }
    } catch (e: any) {
      console.error('[NUFORC] Fetch error (attempt ' + (i + 1) + '): ' + url + ' - ' + (e?.message || e));
      if (i < retries - 1) {
        await new Promise(function(r) { setTimeout(r, 2000); });
      }
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
//
// V11.17.23 — also extracts the nonce from the hidden input
// `wdtNonceFrontendServerSide_<tableId>`. wpdatatables requires this
// nonce to be POSTed as the body parameter `wdtNonce` (NOT the full
// input name), or the AJAX call silently returns 0 bytes (WP's classic
// nonce-failure mode). The shard-page fetch we already do gives us
// the nonce for free — no extra request needed.
function findWpDataTableConfig(html: string): { tableId: string; ajaxUrl: string; nonce: string | null } | null {
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

  // V11.17.23 — Extract the wpdatatables nonce. Field name in HTML is
  // `wdtNonceFrontendServerSide_<tableId>`; we capture the value to POST
  // as `wdtNonce`. WordPress AJAX silently returns empty 200 OK when
  // nonce check fails.
  var nonce: string | null = null;
  var nonceRe = new RegExp('wdtNonceFrontendServerSide_' + tableId + '[^>]*value=["\']([a-f0-9]{8,})["\']', 'i');
  var nonceMatch = html.match(nonceRe);
  if (nonceMatch) nonce = nonceMatch[1];

  // Find the AJAX URL — usually wp-admin/admin-ajax.php or similar
  var ajaxUrlMatch = html.match(/["'](https?:\/\/[^"']*admin-ajax\.php)["']/i);
  if (!ajaxUrlMatch) {
    // Default WordPress AJAX endpoint
    var siteUrlMatch = html.match(/(https?:\/\/nuforc\.org)/i);
    var siteUrl = siteUrlMatch ? siteUrlMatch[1] : 'https://nuforc.org';
    return { tableId: tableId, ajaxUrl: siteUrl + '/wp-admin/admin-ajax.php', nonce: nonce };
  }

  return { tableId: tableId, ajaxUrl: ajaxUrlMatch[1], nonce: nonce };
}

// Fetch wpDataTable data via AJAX endpoint (server-side processing).
//
// V11.17.23 — Three correctness fixes (vs the original empty-200 version):
//   1. Filter params (`action`, `table_id`, `wdt_var1`, `wdt_var2`)
//      go in the URL query string, NOT the POST body. The wdt_ajax_object
//      JSON embedded in the page proves this: `ajax.url` ends in
//      `?action=get_wdtable&table_id=1&wdt_var1=YearMonth&wdt_var2=<YYYYMM>`
//      and method=POST. WordPress reads these from $_GET regardless of method.
//   2. Nonce field is `wdtNonce` in the POST body. The HTML hidden input
//      is named `wdtNonceFrontendServerSide_<tableId>` but wpdatatables JS
//      remaps it to `wdtNonce` before sending. Without it, WP returns 200
//      with 0 bytes (silent nonce-fail).
//   3. The `wdt_var2` URL param is the YYYYMM string extracted from monthUrl
//      (e.g. /subndx/?id=e202509 → 202509). This is what filters the global
//      160k-row wpDataTable down to the ~345 reports for that specific
//      month. Without it, the AJAX returns the unfiltered 160k.
//
// Net win vs the prior HTML-pagination path: each AJAX call returns the
// FULL ~345 reports for the month (3.5x the 100 that pagination showed)
// AND includes the structured fields we previously scraped per-report
// (date, city, state, country, shape, summary teaser, explanation).
async function fetchWpDataTableData(config: { tableId: string; ajaxUrl: string; nonce: string | null }, monthUrl: string): Promise<ReportMetadata[]> {
  var reports: ReportMetadata[] = [];

  // Extract YYYYMM from the month URL (/subndx/?id=eYYYYMM)
  var monthIdMatch = monthUrl.match(/[?&]id=e?(\d{6})/);
  if (!monthIdMatch) {
    console.log('[NUFORC] AJAX skipped: could not extract YYYYMM from monthUrl=' + monthUrl);
    return reports;
  }
  var yyyymm = monthIdMatch[1];

  if (!config.nonce) {
    console.log('[NUFORC] AJAX skipped: wdtNonce not extracted from page HTML (will fall back to HTML parsing)');
    return reports;
  }

  try {
    // V11.17.23 — Filter params on the URL, DataTables pagination + nonce in body
    var urlWithParams = config.ajaxUrl
      + '?action=get_wdtable'
      + '&table_id=' + encodeURIComponent(config.tableId)
      + '&wdt_var1=YearMonth'
      + '&wdt_var2=' + encodeURIComponent(yyyymm);
    var body = new URLSearchParams();
    body.append('draw', '1');
    body.append('start', '0');
    body.append('length', '500');  // Cap per request; wpdatatables returns whatever is filtered
    body.append('wdtNonce', config.nonce);

    console.log('[NUFORC] Attempting wpDataTable AJAX fetch: ' + config.ajaxUrl + ' (table_id: ' + config.tableId + ', month: ' + yyyymm + ', nonce: ' + config.nonce.substring(0, 4) + '...)');

    var response = await fetch(urlWithParams, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': monthUrl,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: body.toString()
    });

    if (!response.ok) {
      console.log('[NUFORC] AJAX fetch failed: HTTP ' + response.status);
      return reports;
    }

    // V11.17.23 — Empty 200 body = silent nonce-fail. Surface it explicitly.
    var text = await response.text();
    if (!text || text.length === 0) {
      console.log('[NUFORC] AJAX returned 200 OK with empty body (likely nonce-verification failed silently). Falling back.');
      return reports;
    }
    var json: any;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.log('[NUFORC] AJAX response was not valid JSON (got ' + text.length + ' bytes). Falling back.');
      return reports;
    }

    // DataTables response format: { data: [[cell1, cell2, ...], ...] } or { data: [{col: val}, ...] }
    if (!json.data || !Array.isArray(json.data)) {
      console.log('[NUFORC] AJAX response has no data array');
      return reports;
    }

    console.log('[NUFORC] AJAX returned ' + json.data.length + ' rows (recordsFiltered=' + json.recordsFiltered + ', recordsTotal=' + json.recordsTotal + ')');

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
// NOTE: Per media policy, NUFORC images are NOT extracted (link_only policy).
// Hotlinking NUFORC images is risky — their ToS doesn't grant hotlinking rights.
// Instead, the MediaMentionBanner component surfaces a link to the source page
// when the description references images/video. Only YouTube embeds are extracted.
function extractMediaFromPage(html: string): ScrapedMediaItem[] {
  const media: ScrapedMediaItem[] = [];
  const seenUrls = new Set<string>();

  // YouTube/video embeds only — these are fine to embed per our media policy
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
  // Structured NUFORC metadata fields
  estimatedSpeed: string;
  estimatedSize: string;
  directionFromViewer: string;
  angleOfElevation: string;
  closestDistance: string;
  viewedFrom: string;
  characteristics: string;
  eventTime: string;
} | null> {
  var url = 'https://nuforc.org/sighting/?id=' + id;
  var rawHtml = await fetchWithHeaders(url, 2);
  if (!rawHtml) return null;
  var html: string = rawHtml;

  // Extract fields from the report page metadata
  // NUFORC pages use <b>Label:</b> value<br> structure
  var extractField = function(label: string): string {
    // Try multiple patterns — NUFORC pages vary in structure
    var patterns = [
      new RegExp('<b>' + label + ':?</b>\\s*([^<]+)', 'i'),
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

  // Extract description — NUFORC uses <b>Label:</b> value<br> structure, NOT <p> tags
  // The narrative text appears after the last metadata field, separated by <br><br>
  var descMatch = null;

  // Approach 1: Find text after Characteristics (last metadata field) followed by <br><br>
  descMatch = html.match(/<b>Characteristics:<\/b>[^<]*<br>\s*<br>([\s\S]*?)(?:<p[^>]*><em>Posted|<footer|<\/div>\s*<\/div>\s*<\/div>|$)/i);

  // Approach 2: Find the content-area div and extract the narrative after all <b> metadata
  if (!descMatch || !descMatch[1] || cleanText(descMatch[1].replace(/<[^>]+>/g, ' ')).length < 50) {
    // Get the primary content area and find text blocks NOT preceded by <b> tags
    var contentMatch = html.match(/class="content-area[^"]*"[^>]*>([\s\S]*?)(?:<footer|<\/main|<div[^>]*class="[^"]*sidebar)/i);
    if (contentMatch) {
      // Split by <br><br> and find the narrative paragraphs (longer text without <b> tags)
      var sections = contentMatch[1].split(/<br>\s*<br>/i);
      var narrativeParts: string[] = [];
      for (var si = 0; si < sections.length; si++) {
        var sectionText = cleanText(sections[si].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
        // Narrative sections are longer and don't start with a metadata label pattern
        if (sectionText.length > 40 && !sectionText.match(/^(Occurred|Reported|Duration|Location|Shape|Color|Estimated|Viewed|Direction|Angle|Closest|Explanation|Characteristics|No of observers)/i)) {
          narrativeParts.push(sectionText);
        }
      }
      if (narrativeParts.length > 0) {
        descMatch = [null, narrativeParts.join('\n\n')];
      }
    }
  }

  // Approach 3: Legacy patterns for older NUFORC page layouts
  if (!descMatch) {
    descMatch = html.match(/<\/p>\s*<p[^>]*>([\s\S]*?)<p[^>]*><em>Posted/i) ||
                html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  }

  var description = '';
  if (descMatch) {
    var rawDesc = typeof descMatch[1] === 'string' ? descMatch[1] : '';
    description = cleanText(rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
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

  // Extract event time from "Occurred" field (format: "2026-03-01 03:28 Local - Approximate")
  var eventTime = '';
  if (occurred) {
    var timeMatch = occurred.match(/\d{4}-\d{2}-\d{2}\s+(\d{1,2}:\d{2})/);
    if (timeMatch) {
      eventTime = timeMatch[1];
    }
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
    media: media,
    // Structured NUFORC metadata
    estimatedSpeed: extractField('Estimated Speed'),
    estimatedSize: extractField('Estimated Size'),
    directionFromViewer: extractField('Direction from Viewer'),
    angleOfElevation: extractField('Angle of Elevation'),
    closestDistance: extractField('Closest Distance'),
    viewedFrom: extractField('Viewed From'),
    characteristics: extractField('Characteristics'),
    eventTime: eventTime
  };
}

export const nuforcAdapter: SourceAdapter = {
  name: 'nuforc',

  async scrape(config: Record<string, any>, limit: number = 100): Promise<AdapterResult> {
    const reports: ScrapedReport[] = [];
    var rateLimitMs = config.rate_limit_ms || 500; // 500ms default — respects NUFORC server
    var fetchFullDetails = config.fetch_full_details === true; // Default to FALSE for speed
    var maxMonths = config.max_months || 6; // Fewer months by default to avoid timeout
    // V11.17.13 — Per-month shard support for mass-ingest orchestrator.
    // If targetMonths is provided (array of YYYYMM strings), the adapter
    // ONLY scrapes those months and ignores max_months. Used by the mass
    // ingest runner to fan out scraping across many months in parallel
    // without re-fetching the index page for every shard.
    var targetMonths: string[] | undefined = Array.isArray(config.target_months) ? config.target_months : undefined;

    try {
      console.log('[NUFORC] Starting scrape. Limit: ' + limit + ', Max months: ' + maxMonths);

      // V11.17.13 — fast path for orchestrator shards. When targetMonths
      // is provided, skip the index-page fetch entirely and process
      // exactly those months. This avoids hitting the index ~624 times
      // during a full-corpus mass ingest.
      var months: Array<{ monthId: string; count: number }>;
      if (targetMonths && targetMonths.length > 0) {
        months = targetMonths.map(function (mid) { return { monthId: mid, count: 0 }; });
        console.log('[NUFORC] Using ' + months.length + ' target month(s): ' + targetMonths.join(', '));
      } else {
        // Fetch the main index page (orchestrator-less path)
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
        months = await parseMainIndex(indexHtml);
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
      }

      // Process months until we have enough reports.
      // targetMonths bypasses maxMonths limit (orchestrator already picked them).
      var monthsToProcess = targetMonths ? months : months.slice(0, maxMonths);

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

        // V11.17.13 — bumped 150 → 200 to match raised quality-filter
        // minDescLength for NUFORC. Table summaries are typically 50-130
        // chars; if every report in the month is below 200, auto-fetch
        // the detail page to recover the longer narrative.
        var hasUsableDescriptions = monthReports.some(function(r) { return r.summary.length > 200; });
        var needFullDetails = fetchFullDetails || !hasUsableDescriptions;
        if (!hasUsableDescriptions && monthReports.length > 0) {
          console.log('[NUFORC] Descriptions too short (max: ' + Math.max.apply(null, monthReports.map(function(r) { return r.summary.length; })) + ' chars) — auto-enabling fetch_full_details');
        }

        for (var meta of monthReports) {
          if (reports.length >= limit) break;

          try {
            // V11.17.13 — drop reports NUFORC themselves have debunked.
            // If the row's explanation column already names a mundane
            // cause (hoax, IFO, aircraft, balloon, Starlink, Venus, etc),
            // skip before paying the detail-page fetch cost.
            if (meta.explanation && NUFORC_DEBUNKED_PATTERNS.test(meta.explanation)) {
              console.log('[NUFORC] Skipping NUFORC-debunked report ' + meta.id + ' (explanation: ' + meta.explanation + ')');
              continue;
            }

            var description = meta.summary;
            var duration = '';
            var mediaItems: ScrapedMediaItem[] = [];
            var details: Awaited<ReturnType<typeof fetchReportDetails>> = null;

            // Fetch full report details when:
            // 1. fetch_full_details is enabled, OR
            // 2. No row data was parsed (wpDataTable AJAX failed), OR
            // 3. Description is too short and might benefit from full page scrape
            if (needFullDetails || (fetchFullDetails && (description.length < 200 || meta.hasMedia))) {
              await new Promise(function(resolve) { setTimeout(resolve, rateLimitMs); });
              details = await fetchReportDetails(meta.id);
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
            // V10.8.B.2 — delegate date extraction to the unified utility.
            // NUFORC's "Occurred" column format is "YYYY-MM-DD HH:MM" (with
            // optional " Local - Approximate" suffix); we strip the time
            // tail to a date string before handing to extractDate. The
            // structured slot wins when present; we also feed the description
            // as prose so the rare cases with missing "Occurred" still capture
            // narrative-opening dates ("On April 28th 2007 I saw...").
            var nuforcStructured = (meta.occurred || '').trim().split(' ')[0] || null;
            var nuforcExtract = extractDate({ structured: nuforcStructured, prose: description || null });
            var eventDate: string | undefined = nuforcExtract.date || undefined;
            var eventDateSource: DateExtractionSource = nuforcExtract.source;
            var eventDatePrecision: 'exact' | 'month' | 'year' | 'decade' | 'estimated' | 'unknown' = nuforcExtract.precision;
            var locationName = meta.city ? meta.city + ', ' + state : state;

            // Build tags array
            var baseTags = extractTags(meta.shape, description);
            var tags = mediaItems.length > 0 ? baseTags.concat(['has-media']) : baseTags;

            var titleShape = meta.shape || 'UFO';
            var titleDate = eventDate ? ' (' + eventDate + ')' : '';
            // Build NUFORC-specific metadata from detail page fields
            var hasDetails = !!(details && details.description);
            // V11.17.13 — set experienceTypeSlug from shape so the engine's
            // deterministic linker fires (skips brittle pattern matcher).
            var shapeLowerForSlug = (meta.shape || '').toLowerCase().trim();
            var experienceTypeSlug = SHAPE_TO_PHENOMENON_SLUG[shapeLowerForSlug];
            var nuforcMeta: Record<string, any> = {
              shape: meta.shape,
              hasMedia: meta.hasMedia || mediaItems.length > 0,
              duration: duration,
              reportId: meta.id
            };
            if (experienceTypeSlug) {
              nuforcMeta.experienceTypeSlug = experienceTypeSlug;
            }
            // Add structured fields if we fetched the detail page
            if (hasDetails) {
              if (details!.estimatedSpeed) nuforcMeta.estimatedSpeed = details!.estimatedSpeed;
              if (details!.estimatedSize) nuforcMeta.estimatedSize = details!.estimatedSize;
              if (details!.directionFromViewer) nuforcMeta.directionFromViewer = details!.directionFromViewer;
              if (details!.angleOfElevation) nuforcMeta.angleOfElevation = details!.angleOfElevation;
              if (details!.closestDistance) nuforcMeta.closestDistance = details!.closestDistance;
              if (details!.viewedFrom) nuforcMeta.viewedFrom = details!.viewedFrom;
              if (details!.characteristics) nuforcMeta.characteristics = details!.characteristics;
              if (details!.color) nuforcMeta.color = details!.color;
            }

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
              event_date_extracted_from: eventDateSource,
              source_type: 'nuforc',
              original_report_id: 'nuforc-' + meta.id,
              tags: tags,
              source_label: 'NUFORC',
              source_url: 'https://nuforc.org/sighting/?id=' + meta.id,
              media: mediaItems.length > 0 ? mediaItems : undefined,
              // Structured observation fields from NUFORC page
              witness_count: hasDetails ? details!.observers : 1,
              event_time: hasDetails ? details!.eventTime : undefined,
              has_official_report: true,  // All NUFORC submissions are official reports
              has_photo_video: meta.hasMedia || mediaItems.length > 0,
              metadata: nuforcMeta
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
