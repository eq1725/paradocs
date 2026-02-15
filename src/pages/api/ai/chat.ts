import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const SYSTEM_PROMPT = `You are the ParaDocs AI Research Assistant — a knowledgeable, curious, and balanced paranormal researcher. You have access to the world's largest database of paranormal phenomena with over 258,000 reports spanning UFO sightings, cryptid encounters, ghost reports, psychic phenomena, and more.

Your personality:
- Intellectually curious and open-minded, but grounded in critical thinking
- You treat every report with respect while noting when evidence is limited
- You reference real historical cases, research, and data from the ParaDocs database
- You're conversational and engaging, not dry or academic
- When discussing specific phenomena, mention report counts and notable sightings from our database
- You can discuss theories (both skeptical and believer perspectives) fairly
- You never dismiss experiences outright — you contextualize them

When given context about a specific phenomenon or report, focus your response on that topic. When asked general questions, draw from your broad knowledge of paranormal research.

Keep responses concise (2-4 paragraphs max) unless asked for detail. Use a warm, engaging tone — like a knowledgeable friend who happens to be a paranormal researcher.`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { message, context, history } = req.body

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' })
  }

  // Rate limiting check via Supabase
  const authHeader = req.headers.authorization
  let userId: string | null = null
  
  if (authHeader) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    userId = user?.id || null
  }

  // Build context-aware messages
  const messages: Array<{ role: string; content: string }> = []
  
  // Add context if provided (phenomenon or report info)
  if (context) {
    let contextMsg = ''
    if (context.type === 'phenomenon') {
      contextMsg = `The user is currently viewing the phenomenon page for "${context.name}". Category: ${context.category}. Description: ${context.description?.substring(0, 500) || 'N/A'}. Report count: ${context.reportCount || 'unknown'}.`
    } else if (context.type === 'report') {
      contextMsg = `The user is currently reading a report titled "${context.title}". Location: ${context.location || 'unknown'}. Summary: ${context.summary?.substring(0, 500) || 'N/A'}. Phenomenon: ${context.phenomenon || 'unknown'}.`
    }
    if (contextMsg) {
      messages.push({ role: 'user', content: `[Context: ${contextMsg}]` })
      messages.push({ role: 'assistant', content: 'I can see you\'re looking at that — I\'d be happy to help you learn more. What would you like to know?' })
    }
  }

  // Add conversation history (last 6 messages max)
  if (history && Array.isArray(history)) {
    const recentHistory = history.slice(-6)
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content })
    }
  }

  // Add the current message
  messages.push({ role: 'user', content: message })

  try {
    // Try Anthropic first, fall back to OpenAI
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    const openaiKey = process.env.OPENAI_API_KEY

    if (anthropicKey) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        })
      })

      if (response.ok) {
        const data = await response.json()
        const reply = data.content?.[0]?.text || 'I apologize, but I was unable to generate a response.'
        return res.status(200).json({ reply, model: 'claude' })
      }
    }

    if (openaiKey) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages
          ],
          max_tokens: 1024,
          temperature: 0.7
        })
      })

      if (response.ok) {
        const data = await response.json()
        const reply = data.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response.'
        return res.status(200).json({ reply, model: 'openai' })
      }
    }

    return res.status(503).json({ error: 'AI service unavailable. Please try again later.' })

  } catch (error) {
    console.error('AI chat error:', error)
    return res.status(500).json({ error: 'An error occurred processing your request.' })
  }
}