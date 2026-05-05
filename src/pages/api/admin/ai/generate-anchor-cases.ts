/**
 * API Route: /api/admin/ai/generate-anchor-cases
 *
 * V8 Tier 1 — generates cold-open anchor cases for phenomena.
 *
 * Replaces the encyclopedia-style feed_hook lead with a documentary-
 * trailer cold open. Per TODAY_CARD_UX_PANEL_REVIEW.md, every phenomenon
 * card needs:
 *   - anchor_case_hook (2-3 sentences, year + place + anonymized
 *     witness role + specific action + twist)
 *   - anchor_when (chip label)
 *   - anchor_where (chip label)
 *   - anchor_witness (chip label, anonymized)
 *   - unresolved_tension (one-line contested point)
 *
 * PRIVACY CONSTRAINT (critical):
 *   Names from BFRO / NUFORC / NDERF / OBERF and other private archives
 *   are NEVER used. The prompt strictly anonymizes — uses witness role
 *   or count instead. Names of public figures on theatrical releases /
 *   court filings (Patterson-Gimlin, Travis Walton) are permitted only
 *   when supplied via editorial override.
 *
 * Actions:
 *   - stats         — coverage stats
 *   - single        — one phenomenon by id
 *   - batch_missing — phenomena without anchor_case_hook (default)
 *   - force_all     — overwrite every phenomenon's anchor fields
 *
 * Mirrors the V6 generate-phenomena-hooks pattern for consistency.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
var ANTHROPIC_FALLBACK = 'claude-3-5-haiku-20241022'

var SYSTEM_PROMPT_PHENOMENA = 'You write cold-open anchor cases for a paranormal investigation index. '
  + 'Each card opens like a documentary trailer — specific year, specific place, anonymized witness, '
  + 'specific action, then a twist. Think Unsolved Mysteries opening, not Wikipedia stub.\n\n'
  + 'SCOPE — this index covers a wide range. The phenomenon you receive may be:\n'
  + '  (a) A WITNESSED EVENT — UFO sighting, cryptid encounter, ghost case, NDE testimony. '
  + 'Anchor on the most striking documented incident.\n'
  + '  (b) A CONTEMPLATIVE PRACTICE — Buddhist meditation, Sufi dhikr, Shinto ritual, indigenous '
  + 'ceremony. Anchor on the founding teacher / lineage / first textual reference / region of '
  + 'origin and a specific physiological or cultural effect.\n'
  + '  (c) AN ESOTERIC TRADITION — Tarot, Hermetic Qabalah, Yazidi practice, Golden Dawn ritual. '
  + 'Anchor on the manuscript / school / first practitioner of record / the oldest extant lineage.\n'
  + '  (d) A RESEARCH FRAMEWORK / DEVICE / DATABASE — psi research labs, EMF meters, ganzfeld '
  + 'protocols, the PEAR archive. Anchor on the founding researcher / institution / year / first '
  + 'major published finding or contested result.\n'
  + '  (e) A FOLKLORIC ENTITY — La Sayona, Apotamkin, the Metoh-kangmi. Anchor on the cultural '
  + 'origin (people / region / earliest documented account) and the most striking encounter '
  + 'pattern from the surviving record.\n'
  + 'Even when the phenomenon is conceptual rather than event-based, you MUST produce all 5 '
  + 'fields anchored on its history. Do NOT decline. The user has decided this entry belongs in '
  + 'the index — your job is to write a hook for it. If the input genuinely has zero anchorable '
  + 'history (no founding date, no region, no first practitioner, no first study), use the '
  + 'CATEGORY-level frame: "Across X cultures since Y century" + the most consistent reported '
  + 'effect.\n\n'
  + 'PRIVACY (CRITICAL): NEVER use experiencer names from BFRO, NUFORC, NDERF, OBERF, Reddit, '
  + 'Erowid, Ghost archives, or any other private user-submitted archive — even if a name appears '
  + 'in the source data. Anonymize using witness role or count: "a vacationing surgeon", "two '
  + 'riders", "a forest ranger and her partner", "47 witnesses across 3 decades", "a flight crew '
  + 'of 4". Names of historical figures, founding teachers, scientists, and academic researchers '
  + 'who appear in published books, peer-reviewed papers, or major theatrical/documentary '
  + 'releases ARE permitted (e.g. Hubel & Wiesel, William James, Padmasambhava, Aleister '
  + 'Crowley, J.B. Rhine, Roger Patterson). Default for modern witnesses = anonymize.\n\n'
  + 'OUTPUT FORMAT — exactly 5 fields, each on its own line, with delimiter prefix:\n'
  + 'WHEN: <short label, 2-6 words. e.g. "October 1934", "Since 1950s", "1947", "1995-2024">\n'
  + 'WHERE: <short label, 2-6 words. e.g. "Loch Ness, Scotland", "Phoenix, AZ", "Pacific NW">\n'
  + 'WITNESS: <anonymized role/count, 2-6 words. e.g. "A vacationing surgeon", "Two riders", '
  + '"47 witnesses">\n'
  + 'HOOK: <2-3 sentences, 35-65 words total. Leads with year + place + anonymized witness + '
  + 'specific action. Ends with the twist or strongest evidence. Self-contained — a reader who '
  + 'has never heard of this phenomenon must understand what it is from the hook alone.>\n'
  + 'TENSION: <one sentence, 12-25 words. The unresolved claim, contested point, or single '
  + 'striking data point that opens a curiosity gap. Honest skeptical framing welcomed.>\n\n'
  + 'RULES:\n'
  + '- Every line starts with the field label and a colon.\n'
  + '- HOOK must lead with the year — start with "[Month Year]." or "[Year]." literally.\n'
  + '- Present tense in the framing, past tense in the case description.\n'
  + '- BANNED words: mysterious, unexplained, shocking, terrifying, eerie, chilling, haunting, '
  + 'bizarre, strange, peculiar, weird, otherworldly, supernatural (as adjective).\n'
  + '- BANNED patterns: rhetorical questions, "This phenomenon...", "Known as...", "What if...", '
  + '"Could it be...". No editorial gushing. No spoilers. No meta-commentary.\n'
  + '- If the source data is too thin to anchor a specific case, generate a category-level hook '
  + 'using the FIRST documented year/place/witness-role/event in the corpus.\n\n'
  + 'EXAMPLES OF GOOD ANCHOR CASES:\n\n'
  + 'Loch Ness Monster:\n'
  + 'WHEN: April 1934\n'
  + 'WHERE: Loch Ness, Scotland\n'
  + 'WITNESS: A vacationing physician\n'
  + 'HOOK: April 1934. Loch Ness, Scotland. A vacationing physician published a photograph of a '
  + 'long-necked silhouette breaking the loch surface — the image that would define cryptid '
  + 'photography for 60 years. The same photograph was confessed as a hoax on the photographer’s '
  + 'stepson’s deathbed in 1994.\n'
  + 'TENSION: The 1994 confession explains one image. It does not explain the 1,200+ sightings '
  + 'logged before it or the 800+ since.\n\n'
  + 'Bigfoot:\n'
  + 'WHEN: October 1967\n'
  + 'WHERE: Bluff Creek, Northern California\n'
  + 'WITNESS: Two horseback riders\n'
  + 'HOOK: October 1967. Bluff Creek, Northern California. Two horseback riders captured 59 '
  + 'seconds of 16mm footage of a 7-foot bipedal figure crossing a sandbar. The film has been '
  + 'analyzed by primatologists, biomechanics experts, and Hollywood costume designers for 58 '
  + 'years.\n'
  + 'TENSION: No replication of the gait pattern by any known costume has matched the original '
  + 'film’s biomechanics.\n\n'
  + 'Angels:\n'
  + 'WHEN: 2,000 BCE - present\n'
  + 'WHERE: Cross-cultural\n'
  + 'WITNESS: 5 modern documented encounters\n'
  + 'HOOK: 2000 BCE. Mesopotamian cuneiform tablets describe winged intermediaries between gods '
  + 'and humans — a pattern that persists into modern hospital chaplaincy reports of bedside '
  + 'visitations. Five contemporary cases in the archive include a 2007 Phoenix motorist who '
  + 'passed three independent polygraph examinations.\n'
  + 'TENSION: Independent investigators have closed five modern cases without reaching a natural '
  + 'or supernatural conclusion.\n\n'
  + 'Return ONLY the 5-line structured output. No preamble, no explanation, no quotes around values.'

// V9.0 — Report-specific prompt. Reports are SINGLE EVENTS, not category-
// level patterns. The hook should be specific to one date, one place, one
// witness role, one event — never aggregate across cases. Privacy rule
// holds: anonymize witness names from BFRO/NUFORC/NDERF/OBERF/Reddit/etc.
var SYSTEM_PROMPT_REPORTS = 'You write cold-open anchor cases for a SINGLE eyewitness report or editorial article '
  + 'on a paranormal investigation index. Each card opens like a documentary trailer — specific date, '
  + 'specific place, anonymized witness role, specific action, then the most striking detail or '
  + 'unresolved element.\n\n'
  + 'PRIVACY (CRITICAL): NEVER use experiencer names from BFRO, NUFORC, NDERF, OBERF, Reddit, '
  + 'Erowid, Ghost archives, or any other private user-submitted archive — even if a name appears '
  + 'in the source narrative or metadata. Anonymize using witness role or count: "a driver", '
  + '"two campers", "a flight crew of 4", "a couple driving home", "a hiker and her dog". '
  + 'Names ONLY permitted when the input includes a "permitted_name" field (which it never does '
  + 'by default). Default = anonymize.\n\n'
  + 'OUTPUT FORMAT — exactly 5 fields, each on its own line, with delimiter prefix:\n'
  + 'WHEN: <2-6 words. Use the most precise date the report supplies. e.g. "Aug 14, 2019", '
  + '"Summer 2019", "October 1967", "March 2014">\n'
  + 'WHERE: <2-6 words. City + region or city + country. e.g. "Squamish, BC", "Phoenix, AZ", '
  + '"Pacific NW", "Cleveland Clinic, Ohio">\n'
  + 'WITNESS: <2-5 words, anonymized role/count. e.g. "A driver", "Two campers", "A flight crew '
  + 'of 4", "51 separate witnesses">\n'
  + 'HOOK: <2-3 sentences, 35-65 words. Leads with date + place + anonymized witness role + '
  + 'specific action from the report narrative. Ends with the most striking detail or contested '
  + 'element. Self-contained — a reader who knows nothing about this report must understand the '
  + 'event from the hook alone.>\n'
  + 'TENSION: <one sentence, 12-25 words. The unresolved claim, contested point, missing piece, '
  + 'or anomalous detail not yet explained. If the report has no clear tension element, write '
  + '"(none)" — do NOT manufacture tension.>\n\n'
  + 'RULES:\n'
  + '- Every line starts with the field label and a colon.\n'
  + '- HOOK leads with the date — start with "[Month Year]." or "[Year]." literally.\n'
  + '- Past tense for the case description; present tense in tension framing.\n'
  + '- BANNED words: mysterious, unexplained, shocking, terrifying, eerie, chilling, haunting, '
  + 'bizarre, strange, peculiar, weird, otherworldly, supernatural (as adjective).\n'
  + '- Do NOT generalize ("often reported", "many witnesses describe") — this is ONE report. '
  + 'Stay specific to this case.\n'
  + '- If the source narrative is too thin to extract a specific anchor, fall back on the title + '
  + 'metadata — but never fabricate details.\n\n'
  + 'EXAMPLES OF GOOD REPORT ANCHOR CASES:\n\n'
  + 'BFRO bigfoot encounter:\n'
  + 'WHEN: August 19, 2019\n'
  + 'WHERE: Squamish, BC\n'
  + 'WITNESS: A driver\n'
  + 'HOOK: August 19, 2019. Highway 99 north of Squamish, British Columbia. A driver returning '
  + 'from a hiking weekend reported a 7-foot bipedal figure crossing the road at dusk and '
  + 'vanishing into dense forest. Pulling over, the driver found three deep impressions in soft '
  + 'shoulder soil and photographed them at the scene.\n'
  + 'TENSION: The impressions measured 16 inches long, but no usable plaster cast was obtained '
  + 'before rain disturbed the site.\n\n'
  + 'NDERF near-death account:\n'
  + 'WHEN: March 2014\n'
  + 'WHERE: Cleveland Clinic, Ohio\n'
  + 'WITNESS: A cardiac surgery patient\n'
  + 'HOOK: March 2014. Cleveland Clinic, Ohio. A patient in emergency cardiac surgery later '
  + 'reported observing the procedure from above the operating table for roughly 11 minutes '
  + 'during clinical death, accurately describing the surgical conversation. Both attending '
  + 'surgeons confirmed the dialogue in subsequent interviews.\n'
  + 'TENSION: The patient’s flat EEG during the observation period spans the longest documented '
  + 'case of detailed verifiable awareness during isoelectric brain activity.\n\n'
  + 'NUFORC UFO sighting:\n'
  + 'WHEN: January 8, 2008\n'
  + 'WHERE: Stephenville, TX\n'
  + 'WITNESS: 51 separate witnesses\n'
  + 'HOOK: January 8, 2008. Stephenville, Texas. Fifty-one separate witnesses across three counties '
  + 'reported a silent low-flying object the size of a football field with no visible support '
  + 'structure, accompanied by F-16s pursuing at high speed. FAA radar logs later corroborated '
  + 'unidentified contacts traveling at 1,900 mph.\n'
  + 'TENSION: The complete radar logs for the period have never been released to independent '
  + 'investigators.\n\n'
  + 'Return ONLY the 5-line structured output. No preamble, no explanation, no quotes around values.'

function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey)
}

function buildPhenomenonPrompt(phenomenon: any): string {
  var parts: string[] = []

  if (phenomenon.name) parts.push('Name: ' + phenomenon.name)
  if (phenomenon.category) parts.push('Category: ' + phenomenon.category)
  if (phenomenon.aliases && phenomenon.aliases.length > 0) {
    parts.push('Also known as: ' + phenomenon.aliases.join(', '))
  }
  if (phenomenon.primary_regions && phenomenon.primary_regions.length > 0) {
    parts.push('Primary regions: ' + phenomenon.primary_regions.join(', '))
  }
  if (phenomenon.first_reported_date) {
    parts.push('First reported: ' + phenomenon.first_reported_date)
  }
  if (phenomenon.report_count) {
    parts.push('Report count in archive: ' + phenomenon.report_count)
  }
  if (phenomenon.ai_quick_facts) {
    try {
      var qf = typeof phenomenon.ai_quick_facts === 'string'
        ? JSON.parse(phenomenon.ai_quick_facts)
        : phenomenon.ai_quick_facts
      Object.keys(qf).forEach(function (key) {
        if (qf[key] && key !== 'danger_level') parts.push(key + ': ' + qf[key])
      })
    } catch (e) {}
  }
  if (phenomenon.ai_summary) {
    parts.push('\nCurrent summary: ' + phenomenon.ai_summary)
  }
  if (phenomenon.ai_description) {
    var desc = phenomenon.ai_description.length > 2000
      ? phenomenon.ai_description.substring(0, 2000) + '...'
      : phenomenon.ai_description
    parts.push('\nFull description:\n' + desc)
  }
  if (phenomenon.feed_hook) {
    parts.push('\nPrior V6 feed hook (for tone reference, do not copy): ' + phenomenon.feed_hook)
  }

  return parts.join('\n')
}

// V9.0 — Build prompt for a SINGLE report (eyewitness account or editorial).
// Different from phenomenon: this is one event, one date, one place, one
// witness role. The Claude prompt should produce a specific anchor, not
// aggregate across cases.
function buildReportPrompt(report: any): string {
  var parts: string[] = []

  if (report.title) parts.push('Title: ' + report.title)
  if (report.category) parts.push('Category: ' + report.category)
  if (report.source_type) parts.push('Source type: ' + report.source_type)
  if (report.source_label) parts.push('Source: ' + report.source_label)

  if (report.event_date) {
    var precision = report.event_date_precision || 'day'
    parts.push('Event date: ' + report.event_date + ' (precision: ' + precision + ')')
  }

  // Location
  var locationBits: string[] = []
  if (report.city) locationBits.push(report.city)
  if (report.state_province) locationBits.push(report.state_province)
  if (report.country) locationBits.push(report.country)
  if (report.location_name) locationBits.push(report.location_name)
  if (locationBits.length > 0) parts.push('Location: ' + locationBits.join(', '))

  if (report.has_physical_evidence) parts.push('Has physical evidence: yes')
  if (report.has_photo_video) parts.push('Has photo/video evidence: yes')
  if (report.credibility) parts.push('Credibility: ' + report.credibility)

  if (report.summary) {
    var sum = report.summary.length > 1500
      ? report.summary.substring(0, 1500) + '...'
      : report.summary
    parts.push('\nSummary:\n' + sum)
  }
  if (report.paradocs_narrative) {
    var nar = report.paradocs_narrative.length > 1500
      ? report.paradocs_narrative.substring(0, 1500) + '...'
      : report.paradocs_narrative
    parts.push('\nParadocs editorial analysis:\n' + nar)
  }
  if (report.feed_hook) {
    parts.push('\nPrior feed hook (tone reference, do not copy): ' + report.feed_hook)
  }

  return parts.join('\n')
}

interface ParsedAnchor {
  anchor_when: string | null
  anchor_where: string | null
  anchor_witness: string | null
  anchor_case_hook: string | null
  unresolved_tension: string | null
}

function parseAnchorOutput(text: string): ParsedAnchor {
  var result: ParsedAnchor = {
    anchor_when: null,
    anchor_where: null,
    anchor_witness: null,
    anchor_case_hook: null,
    unresolved_tension: null,
  }
  if (!text) return result

  var lines = text.split('\n')
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (!line) continue
    var colonIdx = line.indexOf(':')
    if (colonIdx < 0) continue
    var key = line.substring(0, colonIdx).trim().toUpperCase()
    var value = line.substring(colonIdx + 1).trim()
    if (!value) continue
    // Strip surrounding quotes if model added them
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'")) {
      var lastChar = value[value.length - 1]
      if (lastChar === value[0]) value = value.substring(1, value.length - 1)
    }
    if (key === 'WHEN') result.anchor_when = value
    else if (key === 'WHERE') result.anchor_where = value
    else if (key === 'WITNESS') result.anchor_witness = value
    else if (key === 'HOOK') result.anchor_case_hook = value
    else if (key === 'TENSION') result.unresolved_tension = value
  }
  return result
}

async function callClaude(userPrompt: string, type: 'phenomena' | 'reports'): Promise<string | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[AnchorCase] No ANTHROPIC_API_KEY found')
    return null
  }

  var systemPrompt = type === 'reports' ? SYSTEM_PROMPT_REPORTS : SYSTEM_PROMPT_PHENOMENA
  var models = [ANTHROPIC_MODEL, ANTHROPIC_FALLBACK]

  for (var i = 0; i < models.length; i++) {
    try {
      var response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: models[i],
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (response.ok) {
        var data = await response.json()
        var text = data.content && data.content[0] ? data.content[0].text : null
        return text ? text.trim() : null
      }

      if (response.status === 404 && i < models.length - 1) {
        continue
      }

      console.error('[AnchorCase] API error:', response.status)
      return null
    } catch (err) {
      console.error('[AnchorCase] Request failed:', err)
      if (i < models.length - 1) continue
      return null
    }
  }

  return null
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check — same pattern as generate-phenomena-hooks
  var adminKey = req.headers['x-admin-key']
  if (adminKey !== process.env.ADMIN_API_KEY) {
    var authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    var userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    var { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  var supabase = getSupabaseAdmin()
  var action = (req.query && (req.query.action as string)) ||
               (req.body && req.body.action) ||
               'batch_missing'

  // V9.0 — type=phenomena (default) or type=reports. Switches the
  // queried table, the prompt, and the order field.
  var rawType = (req.query && (req.query.type as string)) ||
                (req.body && req.body.type) ||
                'phenomena'
  var type: 'phenomena' | 'reports' = rawType === 'reports' ? 'reports' : 'phenomena'
  var tableName = type === 'reports' ? 'reports' : 'phenomena'
  // Reports order by event_date DESC (most recent first) so the most
  // engaging cases get hooks first; phenomena order by report_count.
  var orderField = type === 'reports' ? 'event_date' : 'report_count'
  var nameField = type === 'reports' ? 'title' : 'name'
  var selectFields = type === 'reports'
    ? 'id, title, slug, category, source_type, source_label, event_date, event_date_precision, city, state_province, country, location_name, has_physical_evidence, has_photo_video, credibility, summary, paradocs_narrative, feed_hook'
    : 'id, name, slug, category, icon, ai_summary, ai_description, ai_quick_facts, primary_regions, first_reported_date, report_count, aliases, feed_hook'

  // ---- Stats ----
  if (action === 'stats') {
    var { count: total } = await supabase
      .from(tableName)
      .select('id', { count: 'exact', head: true })

    var { count: withHook } = await supabase
      .from(tableName)
      .select('id', { count: 'exact', head: true })
      .not('anchor_case_hook', 'is', null)

    return res.status(200).json({
      type: type,
      total: total || 0,
      with_anchor_hook: withHook || 0,
      missing: (total || 0) - (withHook || 0),
      coverage: total ? Math.round(((withHook || 0) / total) * 100) + '%' : '0%',
    })
  }

  // ---- Single ----
  if (action === 'single') {
    var rowId = req.body.id
    if (!rowId) {
      return res.status(400).json({ error: 'Missing id' })
    }

    var { data: row } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', rowId)
      .single()

    if (!row) {
      return res.status(404).json({ error: type + ' not found' })
    }

    var prompt = type === 'reports' ? buildReportPrompt(row) : buildPhenomenonPrompt(row)
    var rawOutput = await callClaude(prompt, type)
    if (!rawOutput) return res.status(500).json({ error: 'Failed to generate anchor case' })

    var parsed = parseAnchorOutput(rawOutput)
    if (!parsed.anchor_case_hook) {
      return res.status(500).json({ error: 'Could not parse hook from output', raw: rawOutput })
    }

    // Strip "(none)" tension marker — model uses it when no real tension exists
    var tensionToSave = parsed.unresolved_tension && parsed.unresolved_tension.toLowerCase() !== '(none)'
      ? parsed.unresolved_tension
      : null

    await supabase
      .from(tableName)
      .update({
        anchor_case_hook: parsed.anchor_case_hook,
        anchor_when: parsed.anchor_when,
        anchor_where: parsed.anchor_where,
        anchor_witness: parsed.anchor_witness,
        unresolved_tension: tensionToSave,
      })
      .eq('id', rowId)

    return res.status(200).json({
      id: rowId,
      name: (row as any)[nameField],
      parsed: parsed,
      raw: rawOutput,
    })
  }

  // ---- Batch missing OR force_all ----
  var batchSize = parseInt((req.query.limit as string) || '0', 10) ||
                  (req.body && req.body.batch_size) || 25
  var offset = parseInt((req.query.offset as string) || '0', 10) ||
               (req.body && req.body.offset) || 0
  var delay = (req.body && req.body.delay_ms) || 500

  var query = supabase
    .from(tableName)
    .select(selectFields)
    .order(orderField, { ascending: false, nullsFirst: false })
    .range(offset, offset + batchSize - 1)

  if (action !== 'force_all') {
    query = query.is('anchor_case_hook', null)
  }

  var { data: missing } = await query

  if (!missing || missing.length === 0) {
    return res.status(200).json({ message: 'All ' + type + ' have anchor cases', generated: 0 })
  }

  var results: { id: string; name: string; success: boolean; parsed?: ParsedAnchor; raw?: string }[] = []

  for (var j = 0; j < missing.length; j++) {
    var p = missing[j] as any
    var userPrompt = type === 'reports' ? buildReportPrompt(p) : buildPhenomenonPrompt(p)
    var rawAnchorOutput = await callClaude(userPrompt, type)
    var parsedAnchor: ParsedAnchor = rawAnchorOutput
      ? parseAnchorOutput(rawAnchorOutput)
      : { anchor_when: null, anchor_where: null, anchor_witness: null, anchor_case_hook: null, unresolved_tension: null }

    if (parsedAnchor.anchor_case_hook) {
      // Strip "(none)" tension marker
      var tensionForBatch = parsedAnchor.unresolved_tension && parsedAnchor.unresolved_tension.toLowerCase() !== '(none)'
        ? parsedAnchor.unresolved_tension
        : null

      await supabase
        .from(tableName)
        .update({
          anchor_case_hook: parsedAnchor.anchor_case_hook,
          anchor_when: parsedAnchor.anchor_when,
          anchor_where: parsedAnchor.anchor_where,
          anchor_witness: parsedAnchor.anchor_witness,
          unresolved_tension: tensionForBatch,
        })
        .eq('id', p.id)

      results.push({ id: p.id, name: p[nameField], success: true, parsed: parsedAnchor })
    } else {
      // Refusal sentinel — Claude returned prose instead of structured
      // output. Write a sentinel so the IS NULL filter no longer matches
      // this row, unblocking the batch loop. Card render falls back to
      // feed_hook when it sees a sentinel value (anchor_case_hook starting
      // with '__').
      await supabase
        .from(tableName)
        .update({
          anchor_case_hook: '__NEEDS_REVIEW__',
          unresolved_tension: rawAnchorOutput
            ? rawAnchorOutput.substring(0, 500)
            : 'Empty Claude response',
        })
        .eq('id', p.id)

      results.push({ id: p.id, name: p[nameField], success: false, raw: rawAnchorOutput || undefined })
    }

    if (j < missing.length - 1 && delay > 0) {
      await new Promise(function (resolve) { setTimeout(resolve, delay) })
    }
  }

  var successCount = results.filter(function (r) { return r.success }).length

  return res.status(200).json({
    type: type,
    generated: successCount,
    failed: results.length - successCount,
    total_processed: results.length,
    results: results,
  })
}
