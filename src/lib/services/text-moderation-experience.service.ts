/**
 * text-moderation-experience.service — V9.11.
 *
 * Permissive paranormal-aware text moderation for first-report
 * onboarding submissions. Different prompt + thresholds from the
 * generic bio moderation (text-moderation.service.ts) because the
 * onboarding funnel is the highest-value first-touch surface.
 *
 * False positives in onboarding are catastrophic — a user shares
 * their UFO sighting and gets denied because Claude flagged
 * "abduction" as borderline. We can't have that.
 *
 * Decision tree:
 *   APPROVED  — paranormal/unexplained content (UFO, NDE, abduction,
 *               sleep paralysis, drugs in dream/NDE/OBE context,
 *               religious/spiritual experiences, ghosts, cryptids,
 *               etc.) is APPROVED BY DEFAULT. When ambiguous → approve.
 *   PENDING   — only on obvious PII oversharing (full street address
 *               + phone + name combined) or graphic gore that's NOT
 *               in a paranormal context.
 *   REJECTED  — only on hate speech / slurs targeting protected
 *               classes, doxxing of named real people, threats of
 *               violence against named individuals, CSAM, scam/spam
 *               pitches.
 *
 * Returns same shape as text-moderation.service.ts so callers can
 * substitute one for the other.
 */

import Anthropic from '@anthropic-ai/sdk'
import { logAiUsage, getCostLogClient } from './ai-cost-logger'

export interface ExperienceModerationResult {
  decision: 'approved' | 'pending' | 'rejected'
  reason?: string
  categories?: string[]
  raw?: any
}

var MODEL = 'claude-haiku-4-5-20251001'

export async function moderateExperience(
  text: string
): Promise<ExperienceModerationResult> {
  if (!text || !text.trim()) {
    return { decision: 'approved', reason: 'empty' }
  }
  // Tiny test inputs ('asdf', 'test', etc.) — don't burn tokens.
  var trimmed = text.trim()
  if (trimmed.length < 15) {
    return { decision: 'approved', reason: 'too_short_to_moderate' }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { decision: 'approved', reason: 'moderation_disabled' }
  }

  var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  var systemPrompt = [
    'You are a content moderator for Paradocs, a paranormal-research community.',
    'Users describe unexplained experiences they had — UFO sightings, ghost encounters,',
    'near-death experiences (NDE), out-of-body experiences (OBE), sleep paralysis,',
    'alien abductions, vivid dreams, déjà vu, demonic encounters, cryptid sightings,',
    'religious/spiritual experiences, drug-induced revelations (in NDE/OBE/dream context),',
    'and other phenomena that defy conventional explanation.',
    '',
    'YOUR JOB: classify the input into APPROVED, PENDING, or REJECTED.',
    '',
    '⭐ DEFAULT TO APPROVED. Paranormal content is the entire point of this platform.',
    'If you are uncertain → APPROVED.',
    '',
    'APPROVED examples (do not flag any of these):',
    '  "I was abducted by aliens in 1998..."',
    '  "My grandmother\'s ghost appeared to me..."',
    '  "I had an OBE while in a coma..."',
    '  "I tripped on DMT and saw entities..."',
    '  "I saw a craft hover over the highway..."',
    '  "Sleep paralysis with shadow figures..."',
    '  "I felt a demonic presence..."',
    '  "Saw bigfoot near the trail..."',
    '  Strong religious or spiritual claims',
    '  Drug references in a paranormal/spiritual context',
    '  References to violence experienced by the witness ("I felt threatened by the entity")',
    '  ⭐ GENERIC / PLACEHOLDER / TEST CONTENT — IF UNCERTAIN, APPROVE.',
    '    Examples: "this is a test", "testing the form", "lorem ipsum",',
    '    short generic text like "i had an experience and it was weird".',
    '    These are first-time users figuring out the form. We catch any',
    '    real abuse downstream; do NOT block onboarding for noise.',
    '',
    'PENDING (queue for human review, do NOT auto-reject):',
    '  • Bio includes a real-looking full home address + phone number',
    '  • Detailed real-world gore unconnected to a paranormal experience',
    '  • Heavy real-name targeting of non-public individuals (named neighbor, etc.)',
    '',
    'REJECTED (only these — be VERY conservative; default to APPROVED if you are not 100% sure):',
    '  • Hate speech / slurs targeting protected classes',
    '  • Doxxing of a named real public individual\'s private info',
    '  • Direct threats of violence against named individuals',
    '  • Sexual content involving minors (CSAM)',
    '  • Obvious commercial spam / scam pitches WITH a sales URL or phone number to call ("buy my crypto at example.com")',
    '  • Phishing / impersonation attempts',
    '',
    'IMPORTANT: "I am testing this", "this is a test message", or short generic',
    'descriptions are NEVER spam — they are users learning the form. APPROVE them.',
    '',
    'Respond ONLY with strict JSON:',
    '{"decision": "APPROVED" | "PENDING" | "REJECTED", "reason": "<short>", "categories": ["<label>", ...]}',
  ].join('\n')

  try {
    var response = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      temperature: 0,
      system: systemPrompt,
      messages: [
        { role: 'user', content: 'Classify this experience report:\n\n' + trimmed },
      ],
    })

    // V11.17.84 — unified cost log.
    try {
      var usage = (response as any).usage || {}
      var logClient = await getCostLogClient()
      if (logClient) {
        logAiUsage('text-moderation', logClient, {
          model: MODEL,
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          cacheCreationTokens: usage.cache_creation_input_tokens || 0,
          cacheReadTokens: usage.cache_read_input_tokens || 0,
          requestId: (response as any).id || null,
          status: 'completed',
        })
      }
    } catch (_logErr) { /* logging never blocks */ }

    var content = response.content && response.content[0]
    var raw = ''
    if (content && content.type === 'text') raw = content.text || ''

    var jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // Parse failure — default to approved (we'd rather be permissive)
      console.error('[ExperienceModeration] No JSON in response:', raw.slice(0, 200))
      return { decision: 'approved', reason: 'moderation_parse_error', raw }
    }

    var parsed: any
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return { decision: 'approved', reason: 'moderation_parse_error', raw }
    }

    var d = (parsed.decision || '').toLowerCase()
    var decision: 'approved' | 'pending' | 'rejected' =
      d === 'rejected' ? 'rejected' :
      d === 'pending' ? 'pending' :
      'approved'

    return {
      decision,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      raw: parsed,
    }
  } catch (err: any) {
    // Fail open: if Claude is unreachable we APPROVE rather than block
    // a legitimate first-report. Admin queue + reactive moderation
    // catches anything bad.
    console.error('[ExperienceModeration] Error, approving by default:', err?.message)
    return { decision: 'approved', reason: 'moderation_error' }
  }
}
