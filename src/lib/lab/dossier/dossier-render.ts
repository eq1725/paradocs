// V11.17.71 - Pro Dossier
//
// Server-side renderers for the Dossier social-share card (PNG, 1080
// ×1350) and the PDF book. Both render from the same DossierSections
// payload so any compute change reflects in both artifacts.
//
// Tech choices:
//   - Share card: hand-rolled SVG. We have `sharp` in the stack
//     (package.json), which can rasterize SVG → PNG losslessly. No
//     puppeteer / @vercel/og dependency added — keeps the cold-start
//     budget reasonable.
//   - PDF: hand-rolled HTML returned with a print stylesheet. Browser
//     "Save as PDF" is the user's first save path; the route ALSO
//     advertises printable-HTML so the user can right-click → print
//     to PDF deterministically. A true server-rendered PDF (via
//     puppeteer-core + @sparticuz/chromium) is a follow-up — those
//     packages need to be added and the function timeout needs to
//     accommodate ~15-30s renders. The HTML path ships now and is
//     legibly Pro-grade.

import type { DossierSections } from './dossier-types'

/* -------------------------------------------------------------------- */
/* Share card — SVG / PNG                                               */
/* -------------------------------------------------------------------- */

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 1080×1350 Instagram-portrait composition. Anonymized by default —
 * shows phen-family, year, region (state-level only), top stat, plus
 * Paradocs wordmark.
 */
export function renderShareCardSvg(sections: DossierSections): string {
  var meta = sections.meta
  var year = meta.experience_year !== null ? String(meta.experience_year) : '—'
  var region = meta.experience_location_label.split(',').slice(-1)[0]?.trim() || 'unrecorded region'
  var family = humanizeFamily(meta.phen_family)
  var rarity = sections.rarity_percentile.percentile
  var rarityText = sections.rarity_percentile.data_sparse
    ? 'Cross-reference dossier · ' + sections.closest_reports.pool_size + ' Archive matches in pool'
    : 'This account scored in the ' + rarity + 'th percentile for unusual descriptor combinations in the ' + family + ' corpus.'
  var closestN = sections.closest_reports.reports.length
  var geoN = sections.geographic_neighbors.total_count
  var temporalN = sections.temporal_neighbors.decade_count

  var brandPurple = '#9000F0'

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">',
    '<defs>',
    '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="#0a0a14"/>',
    '<stop offset="100%" stop-color="#1a0a2e"/>',
    '</linearGradient>',
    '<linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">',
    '<stop offset="0%" stop-color="' + brandPurple + '" stop-opacity="0.6"/>',
    '<stop offset="100%" stop-color="' + brandPurple + '" stop-opacity="0"/>',
    '</linearGradient>',
    '</defs>',
    '<rect width="1080" height="1350" fill="url(#bg)"/>',
    // Trouvelot aurora-inspired accent arc — subtle, brand-purple.
    '<path d="M 0 200 Q 540 50 1080 200 Z" fill="url(#accent)" opacity="0.4"/>',
    // Header eyebrow
    '<text x="540" y="180" text-anchor="middle" fill="' + brandPurple + '" font-family="serif" font-size="22" letter-spacing="6" font-weight="600">FROM THE PARADOCS ARCHIVE</text>',
    // Title block
    '<text x="540" y="290" text-anchor="middle" fill="#ffffff" font-family="serif" font-size="58" font-weight="700">' + esc(family) + '</text>',
    '<text x="540" y="350" text-anchor="middle" fill="#bcb0d8" font-family="serif" font-size="32">' + esc(region) + ' · ' + esc(year) + '</text>',
    // Divider
    '<line x1="340" y1="420" x2="740" y2="420" stroke="' + brandPurple + '" stroke-width="1.5"/>',
    // Big stat
    '<text x="540" y="540" text-anchor="middle" fill="#ffffff" font-family="serif" font-size="180" font-weight="700">' + (sections.rarity_percentile.data_sparse ? '—' : rarity + 'th') + '</text>',
    '<text x="540" y="600" text-anchor="middle" fill="#bcb0d8" font-family="serif" font-size="22" letter-spacing="3">PERCENTILE</text>',
    // Body line
    wrapSvgText(rarityText, 540, 720, 800, 26, '#e8e0f8'),
    // Three small stat callouts
    '<text x="280" y="950" text-anchor="middle" fill="#ffffff" font-family="serif" font-size="56" font-weight="700">' + closestN + '</text>',
    '<text x="280" y="990" text-anchor="middle" fill="#9080b0" font-family="serif" font-size="16" letter-spacing="2">CLOSEST</text>',
    '<text x="540" y="950" text-anchor="middle" fill="#ffffff" font-family="serif" font-size="56" font-weight="700">' + geoN + '</text>',
    '<text x="540" y="990" text-anchor="middle" fill="#9080b0" font-family="serif" font-size="16" letter-spacing="2">NEARBY</text>',
    '<text x="800" y="950" text-anchor="middle" fill="#ffffff" font-family="serif" font-size="56" font-weight="700">' + temporalN + '</text>',
    '<text x="800" y="990" text-anchor="middle" fill="#9080b0" font-family="serif" font-size="16" letter-spacing="2">IN-DECADE</text>',
    // Footer line
    '<line x1="340" y1="1180" x2="740" y2="1180" stroke="' + brandPurple + '" stroke-width="1.5"/>',
    '<text x="540" y="1240" text-anchor="middle" fill="#ffffff" font-family="serif" font-size="38" font-weight="700" letter-spacing="3">PARADOCS</text>',
    '<text x="540" y="1280" text-anchor="middle" fill="#9080b0" font-family="serif" font-size="18" letter-spacing="4">THE ARCHIVE OF EXPERIENCE</text>',
    '</svg>',
  ].join('\n')
}

function wrapSvgText(text: string, x: number, y: number, maxWidth: number, fontSize: number, fill: string): string {
  // Naive word-wrap; SVG doesn't auto-wrap. Approximate 12px per char
  // at fontSize 26.
  var approxCharWidth = fontSize * 0.5
  var maxChars = Math.floor(maxWidth / approxCharWidth)
  var words = text.split(/\s+/)
  var lines: string[] = []
  var current = ''
  for (var i = 0; i < words.length; i++) {
    var w = words[i]
    if ((current + ' ' + w).trim().length > maxChars) {
      lines.push(current.trim())
      current = w
    } else {
      current = (current + ' ' + w).trim()
    }
  }
  if (current) lines.push(current)
  var lineHeight = fontSize * 1.3
  return lines.map(function (ln, idx) {
    return '<text x="' + x + '" y="' + (y + idx * lineHeight) + '" text-anchor="middle" fill="' + fill +
      '" font-family="serif" font-size="' + fontSize + '">' + esc(ln) + '</text>'
  }).join('')
}

/**
 * Rasterize the SVG to PNG via sharp. Returns a Buffer ready for an
 * image/png response. Returns null on rasterization failure; the
 * caller should fall back to the raw SVG.
 */
export async function rasterizeSvgToPng(svg: string): Promise<Buffer | null> {
  try {
    // Lazy-require sharp so the module load doesn't break in edge
    // contexts that don't ship it. sharp is already in package.json.
    var sharp = (await import('sharp')).default
    return await sharp(Buffer.from(svg)).png().toBuffer()
  } catch (e: any) {
    console.warn('[dossier-render] sharp rasterize failed:', e && e.message)
    return null
  }
}

/* -------------------------------------------------------------------- */
/* PDF (HTML print sheet)                                               */
/* -------------------------------------------------------------------- */

/**
 * Render the Dossier as a printable HTML document. The user can print
 * to PDF directly from any browser; the page also includes
 * `@page { size: A5; margin: 18mm; }` so the layout matches the
 * book-like A5 spec from PRO_TIER_VALIDATION_V3 §3.3.
 */
export function renderDossierPrintHtml(sections: DossierSections, opts?: { ownerLabel?: string }): string {
  var meta = sections.meta
  var year = meta.experience_year !== null ? String(meta.experience_year) : 'unknown year'
  var ownerLabel = opts?.ownerLabel || ''
  var brandPurple = '#9000F0'

  // Section render helpers — each returns one A5 page worth of HTML.
  function section(title: string, body: string, opts?: { sparse?: boolean; caption?: string }): string {
    return [
      '<section class="page">',
      '<h2>' + esc(title) + '</h2>',
      opts?.caption ? '<p class="caption">' + esc(opts.caption) + '</p>' : '',
      opts?.sparse
        ? '<p class="data-sparse">Data sparse — section rendered without a numeric claim per the Dossier integrity rule.</p>'
        : body,
      '</section>',
    ].join('\n')
  }

  // --- Section 1 ---
  var closest = sections.closest_reports
  var closestBody = closest.reports.length === 0
    ? '<p>No closest matches surfaced.</p>'
    : '<ol class="closest">' + closest.reports.map(function (r) {
        return [
          '<li>',
          '<div class="title">' + esc(r.title) + (r.year !== null ? ' <span class="year">(' + r.year + ')</span>' : '') + '</div>',
          '<div class="loc">' + esc(r.location_label) + ' · sub-pattern: ' + esc(r.sub_pattern_tag) + '</div>',
          '<div class="snippet">' + esc(r.snippet) + '</div>',
          '<div class="cite">composite ' + r.composite_score + ' / 100 · descriptor ' + r.signals.descriptor_overlap +
            ' · geo ' + r.signals.geo_proximity + ' · temporal ' + r.signals.temporal_proximity + ' · [report:' + esc(r.id) + ']</div>',
          '</li>',
        ].join('')
      }).join('') + '</ol>'

  // --- Section 2 ---
  var lineage = sections.phen_lineage
  var lineageBody = lineage.inheritances.length === 0
    ? '<p>No sub-pattern inheritances at the 50% signal threshold.</p>'
    : '<ul class="lineage">' + lineage.inheritances.map(function (l) {
        return '<li><strong>' + esc(l.label) + '</strong> — ' + l.matched_signals + ' of ' + l.total_signals +
          ' signals match (' + Math.round(l.confidence * 100) + '%). Cites: ' + l.signal_cites.map(esc).join(', ') +
          '. [sub-pattern:' + esc(l.sub_pattern_id) + ']</li>'
      }).join('') + '</ul>'

  // --- Section 3 ---
  var geo = sections.geographic_neighbors
  var geoBody = geo.total_count === 0
    ? '<p>No Archive reports within ' + geo.radius_mi + ' miles.</p>'
    : '<p>' + geo.total_count + ' reports within ' + geo.radius_mi + ' miles, grouped by sub-pattern:</p><ul>' +
      geo.buckets.map(function (b) {
        return '<li>' + esc(b.sub_pattern_tag) + ' — ' + b.count + '</li>'
      }).join('') + '</ul>'

  // --- Section 4 ---
  var temp = sections.temporal_neighbors
  var tempBody = '<p>' + temp.decade_count + ' reports in your decade (' + (temp.decade_label || 'unknown') +
    '), ' + temp.month_count + ' in your month (' + (temp.month_label || 'unknown') +
    '), ' + temp.hour_window_count + ' in your hour window (' + (temp.hour_window_label || 'unknown') + ').</p>'

  // --- Section 5 ---
  var desc = sections.descriptor_matches
  var descBody = desc.matches.length === 0
    ? '<p>No major descriptors detected.</p>'
    : '<ul>' + desc.matches.map(function (d) {
        return '<li><strong>' + esc(d.label) + '</strong> — ' + d.pct + '% of relevant reports (' +
          d.numerator + ' / ' + d.denominator + ')</li>'
      }).join('') + '</ul>'

  // --- Section 6 ---
  var rar = sections.rarity_percentile
  var rarBody = '<p class="big-stat">' + rar.percentile + 'th percentile</p>' +
    '<p>Method: ' + esc(rar.method) + ' — corpus size ' + rar.corpus_size + ', ' +
    rar.descriptor_count + ' user descriptors compared.</p>'

  // --- Section 7 ---
  var tm = sections.time_machine
  var tmBody = [
    tm.moon_phase ? '<p>Moon phase: ' + esc(tm.moon_phase.phase) + ' (' + tm.moon_phase.illumination_pct + '% illumination).</p>' : '',
    tm.meteor_shower ? '<p>Active meteor shower: ' + esc(tm.meteor_shower.name) + ' (~' + tm.meteor_shower.rate_per_hour + ' / hr).</p>' : '',
    tm.contemporaneous_reports.length === 0
      ? ''
      : '<p>Other Archive reports within 7 days + 100 mi:</p><ul>' +
        tm.contemporaneous_reports.map(function (r) {
          return '<li>' + esc(r.title) + ' — ' + esc(r.event_date || 'undated') + ' · ' + (r.distance_mi || '?') + ' mi · [report:' + esc(r.id) + ']</li>'
        }).join('') + '</ul>',
    tm.notes.length === 0 ? '' : '<p class="notes"><em>Notes: ' + tm.notes.map(esc).join(' / ') + '</em></p>',
  ].join('')

  return [
    '<!doctype html>',
    '<html><head>',
    '<meta charset="utf-8"/>',
    '<title>Paradocs Dossier — ' + esc(meta.experience_title) + '</title>',
    '<style>',
    '@page { size: A5; margin: 18mm; }',
    'body { font-family: Georgia, "Times New Roman", serif; color: #1a1a2e; line-height: 1.5; max-width: 480px; margin: 24px auto; padding: 0 20px; }',
    'h1 { font-family: "Changa One", "Arial Black", sans-serif; font-size: 32pt; color: ' + brandPurple + '; margin: 0 0 4pt 0; letter-spacing: -0.5pt; }',
    'h2 { font-family: "Changa One", "Arial Black", sans-serif; font-size: 18pt; color: ' + brandPurple + '; margin: 0 0 6pt 0; border-bottom: 1pt solid ' + brandPurple + '; padding-bottom: 4pt; }',
    'h3 { font-family: "Changa One", "Arial Black", sans-serif; font-size: 14pt; }',
    '.eyebrow { letter-spacing: 4pt; font-size: 9pt; color: ' + brandPurple + '; font-weight: 600; }',
    '.page { page-break-after: always; padding: 12pt 0; }',
    '.caption { font-style: italic; font-size: 10pt; color: #555; margin: 0 0 10pt 0; }',
    '.data-sparse { color: #888; font-style: italic; }',
    '.closest { list-style: decimal; padding-left: 18pt; }',
    '.closest li { margin-bottom: 12pt; }',
    '.closest .title { font-weight: 700; }',
    '.closest .year { color: #666; font-weight: 400; }',
    '.closest .loc { font-size: 9pt; color: #555; }',
    '.closest .snippet { font-size: 10pt; margin: 4pt 0; }',
    '.closest .cite, .notes, footer { font-size: 8pt; color: #888; font-family: "Courier New", monospace; }',
    '.big-stat { font-size: 48pt; color: ' + brandPurple + '; text-align: center; margin: 12pt 0; font-weight: 700; }',
    'footer { text-align: center; margin-top: 16pt; padding-top: 8pt; border-top: 1pt solid #ccc; }',
    '.toc { list-style: decimal; padding-left: 18pt; }',
    '.toc li { margin: 4pt 0; font-size: 11pt; }',
    '.colophon { font-size: 9pt; color: #555; font-style: italic; }',
    '</style>',
    '</head><body>',

    // ── Title page ─────────────────────────────────────────
    '<section class="page">',
    '<p class="eyebrow">FROM THE PARADOCS ARCHIVE</p>',
    '<h1>' + esc(meta.experience_title) + '</h1>',
    '<p style="font-size: 12pt; color: #555;">' + esc(meta.experience_location_label) + ' · ' + esc(year) + '</p>',
    ownerLabel ? '<p>Generated for ' + esc(ownerLabel) + '.</p>' : '',
    '<p class="colophon">Dossier computed ' + esc(meta.computed_at_iso.slice(0, 10)) +
      ' from the Paradocs Archive of ' + meta.archive_size_at_compute.toLocaleString() + ' reports.</p>',
    '</section>',

    // ── Table of contents ──────────────────────────────────
    '<section class="page">',
    '<h2>Contents</h2>',
    '<ol class="toc">',
    '<li>Closest reports</li>',
    '<li>Phenomenology lineage</li>',
    '<li>Geographic neighbors</li>',
    '<li>Temporal neighbors</li>',
    '<li>Descriptor matches</li>',
    '<li>Rarity percentile</li>',
    '<li>Time-machine context</li>',
    '</ol>',
    '</section>',

    // ── The seven body sections ────────────────────────────
    section('1. Closest reports', closestBody, { caption: closest.caption, sparse: closest.data_sparse }),
    section('2. Phenomenology lineage', lineageBody, { caption: lineage.caption, sparse: lineage.data_sparse }),
    section('3. Geographic neighbors', geoBody, { caption: geo.caption, sparse: geo.data_sparse }),
    section('4. Temporal neighbors', tempBody, { caption: temp.caption, sparse: temp.data_sparse }),
    section('5. Descriptor matches', descBody, { caption: desc.caption, sparse: desc.data_sparse }),
    section('6. Rarity percentile', rarBody, { caption: rar.caption, sparse: rar.data_sparse }),
    section('7. Time-machine context', tmBody, { caption: tm.caption, sparse: tm.data_sparse }),

    // ── Colophon ───────────────────────────────────────────
    '<footer>',
    'The Paradocs Archive · edition computed ' + esc(meta.computed_at_iso) +
      ' · checksum ' + esc(meta.checksum.substring(0, 12)) + '…',
    '</footer>',
    '</body></html>',
  ].join('\n')
}

/* -------------------------------------------------------------------- */
/* Helpers                                                              */
/* -------------------------------------------------------------------- */

function humanizeFamily(f: string): string {
  switch (f) {
    case 'cryptids': return 'cryptid'
    case 'ufos_aliens': return 'UFO / alien'
    case 'ghosts_hauntings': return 'haunting'
    case 'psychic_phenomena': return 'psychic'
    case 'esoteric_practices': return 'esoteric'
    case 'consciousness_practices': return 'consciousness'
    case 'perception_sensory': return 'perception'
    case 'psychological_experiences': return 'psychological'
    case 'religion_mythology': return 'religion / mythology'
    case 'general': return 'general'
    case 'cross_category': return 'cross-category'
  }
  return String(f).replace(/_/g, ' ')
}
