/**
 * POST /api/constellation/artifacts/auto-tag
 *
 * Given an extracted artifact's title + description + source_platform + URL,
 * asks Claude to suggest 3-5 relevant tags and a one-sentence summary. Used
 * by PasteUrlModal to enrich the save flow after OG extraction completes.
 *
 * Design intent: the tags it suggests should be *paranormal-domain* tags
 * (ufo, cryptid, nde, remote-viewing, etc.) — not generic content tags
 * ("video", "news"). Prompting explicitly shapes this.
 *
 * Safety:
 *   - Auth required (bearer token). Not a public endpoint.
 *   - Timeout-bounded Claude call so the UX doesn't hang.
 *   - Graceful no-op if no ANTHROPIC_API_KEY is configured — returns
 *     empty suggestions so the client can fall back to the existing
 *     keyword-based tag inference.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

export interface AutoTagResult {
  /** Lowercase, hyphen-separated tag slugs, 3-5 entries */
  tags: string[]
  /** One-sentence neutral summary of the source (≤ 160 chars) */
  summary: string | null
  /** True if Claude was actually consulted (vs. fell back to empty) */
  enriched: boolean
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const body = (req.body || {}) as {
    title?: string; description?: string; source_platform?: string; url?: string
  }
  const title = (body.title || '').trim().slice(0, 400)
  const description = (body.description || '').trim().slice(0, 1200)
  const platform = (body.source_platform || '').trim().slice(0, 120)
  const url = (body.url || '').trim().slice(0, 500)

  if (!title && !description) {
    return res.status(400).json({ error: 'title or description required' })
  }

  // Graceful degradation: if Claude isn't configured, return empty tags.
  // Caller (PasteUrlModal) will fall back to the existing keyword inference.
  if (!ANTHROPIC_API_KEY) {
    return res.status(200).json({ tags: [], summary: null, enriched: false } as AutoTagResult)
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const prompt = [
    'You are helping a paranormal researcher tag a new piece of evidence they just saved.',
    '',
    'Analyze this source and return:',
    '  - 3 to 5 highly relevant tags. Prefer *paranormal-domain* tags (e.g. ufo, uap, bigfoot, nde, remote-viewing, sleep-paralysis, poltergeist, skinwalker, mothman, mufon, roswell) over generic content tags (e.g. video, news).',
    '  - A single neutral one-sentence summary of what the source is about (≤ 160 characters).',
    '',
    'Tag rules:',
    '  - Lowercase, hyphen-separated (e.g. "remote-viewing", not "Remote Viewing")',
    '  - No leading # symbol',
    '  - Specific is better than generic: "triangle-ufo" beats "ufo"',
    '  - If the source is clearly NOT paranormal-relevant, return an empty array and a neutral summary.',
    '',
    'Output strict JSON only, no prose: {"tags": [...], "summary": "..."}',
    '',
    '--- SOURCE ---',
    'Title: ' + (title || '(missing)'),
    platform ? 'Platform: ' + platform : '',
    url ? 'URL: ' + url : '',
    description ? 'Description: ' + description : '',
  ].filter(Boolean).join('\n')

  try {
    // Short timeout so the paste flow doesn't hang. If Claude is slow, we
    // fail open — the client just uses its existing keyword-based tags.
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 6000)
    let response
    try {
      response = await client.messages.create({
        // Use Haiku — cheap, fast, sufficient for this level of classification.
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }, { signal: controller.signal })
    } finally {
      clearTimeout(t)
    }

    const text = response.content
      .filter(b => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    // Extract the JSON object — Claude may wrap it in prose despite our instruction.
    const match = text.match(/\{[\s\S]*?\}/)
    if (!match) {
      return res.status(200).json({ tags: [], summary: null, enriched: false } as AutoTagResult)
    }

    let parsed: { tags?: string[]; summary?: string } = {}
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return res.status(200).json({ tags: [], summary: null, enriched: false } as AutoTagResult)
    }

    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter(t => typeof t === 'string' && t.length > 0)
          .map(t => t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-'))
          .filter((t, i, arr) => arr.indexOf(t) === i)
          .slice(0, 5)
      : []

    const summary = typeof parsed.summary === 'string'
      ? parsed.summary.trim().slice(0, 200) || null
      : null

    return res.status(200).json({ tags, summary, enriched: true } as AutoTagResult)
  } catch (err: any) {
    // Never error the client — just fall back silently.
    console.error('[auto-tag] claude call failed:', err?.message || err)
    return res.status(200).json({ tags: [], summary: null, enriched: false } as AutoTagResult)
  }
}
