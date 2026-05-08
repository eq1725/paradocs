/**
 * text-moderation.service — V9.9 P3.
 *
 * Claude Haiku-based text moderation for user-supplied profile
 * content (bio for now; reusable for other free-form fields later).
 *
 * Decision tree mirrors the avatar moderation pipeline:
 *   - 'approved' — clean
 *   - 'pending'  — borderline, needs human review
 *   - 'rejected' — clearly off-policy
 *
 * Returns { decision, reason, categories[] } where categories is the
 * model's flagged labels for audit + admin display.
 *
 * If ANTHROPIC_API_KEY isn't set OR the call fails, fails OPEN
 * (returns approved with reason='moderation_disabled' or
 * 'moderation_error'). Saving content matters more than perfect
 * moderation — operators get auditability via the reason field.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface TextModerationResult {
  decision: 'approved' | 'pending' | 'rejected'
  reason?: string
  categories?: string[]
  raw?: any
}

var MODEL = 'claude-haiku-4-5-20251001'

/**
 * Run a free-form text snippet through Claude Haiku for moderation.
 * Designed to be cheap (~$0.001 per call) and fast (sub-second).
 */
export async function moderateText(
  text: string,
  context: 'bio' | 'comment' | 'other' = 'bio'
): Promise<TextModerationResult> {
  if (!text || !text.trim()) {
    return { decision: 'approved', reason: 'empty' }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { decision: 'approved', reason: 'moderation_disabled' }
  }

  var client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  var contextLabel = context === 'bio' ? 'public profile bio'
    : context === 'comment' ? 'public comment'
    : 'public text content'

  var systemPrompt = [
    'You are a content moderator for a paranormal-research community app.',
    'Users post short ' + contextLabel + ' content.',
    '',
    'Classify the input into exactly one of:',
    '  APPROVED  — safe, on-topic or off-topic but harmless personal expression',
    '  PENDING   — borderline (mild profanity, lightly suggestive language, ',
    '              ambiguous slurs, edgy content that needs human review)',
    '  REJECTED  — clearly off-policy: hate speech, slurs targeting protected ',
    '              classes, harassment of named individuals, sexual content, ',
    '              CSAM-adjacent language, threats of violence, doxxing ',
    '              (full real-world addresses, phone numbers, SSN/IDs), ',
    '              spam/scam pitches, illegal-good marketplace language',
    '',
    'IMPORTANT: paranormal/UFO/cryptid/occult/conspiracy topics are ON-TOPIC and APPROVED.',
    'Strong opinions about phenomena, religion, or politics are APPROVED unless ',
    'they cross into hate speech or threats.',
    '',
    'Respond ONLY with strict JSON:',
    '{"decision": "APPROVED" | "PENDING" | "REJECTED", "reason": "<short reason>", "categories": ["<label>", ...]}',
  ].join('\n')

  try {
    var response = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      temperature: 0,
      system: systemPrompt,
      messages: [
        { role: 'user', content: 'Classify this ' + contextLabel + ':\n\n' + text.trim() },
      ],
    })

    var content = response.content && response.content[0]
    var raw = ''
    if (content && content.type === 'text') raw = content.text || ''

    // Extract JSON from the response (Claude sometimes wraps in code fences).
    var jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[TextModeration] No JSON in response:', raw.slice(0, 200))
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
    console.error('[TextModeration] Error:', err?.message)
    return { decision: 'approved', reason: 'moderation_error' }
  }
}
