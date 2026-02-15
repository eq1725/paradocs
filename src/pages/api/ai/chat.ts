import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

var TIER_LIMITS: Record<string, number> = { free: 5, basic: 25, pro: 100, enterprise: 1000 }

var SYSTEM_PROMPT = 'You are the ParaDocs AI Research Assistant \u2014 a knowledgeable, curious, and balanced paranormal researcher. You have access to the world\'s largest database of paranormal phenomena with over 258,000 reports spanning UFO sightings, cryptid encounters, ghost reports, psychic phenomena, and more.\n\nYour personality:\n- Intellectually curious and open-minded, but grounded in critical thinking\n- You treat every report with respect while noting when evidence is limited\n- You reference real historical cases, research, and data from the ParaDocs database\n- You are conversational and engaging, not dry or academic\n- When discussing specific phenomena, mention report counts and notable sightings from our database\n- You can discuss theories (both skeptical and believer perspectives) fairly\n- You never dismiss experiences outright \u2014 you contextualize them\n\nKeep responses concise (2-4 paragraphs max) unless asked for detail. Use a warm, engaging tone.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  var { message, context, history } = req.body
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Message is required' })

  var safeMessage = message.substring(0, 2000)
  var supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Auth
  var userId: string | null = null
  try {
    var authHeader = req.headers.authorization
    if (authHeader) {
      var { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      userId = user?.id || null
    }
  } catch (e) { /* auth check is optional */ }

  // Rate limiting (best-effort, never blocks on failure)
  var tier = 'free'
  var used = 0
  var limit = TIER_LIMITS.free
  try {
    if (userId) {
      var { data: sub } = await supabase.from('user_subscriptions').select('tier').eq('user_id', userId).single()
      if (sub && sub.tier) { tier = sub.tier; limit = TIER_LIMITS[tier] || TIER_LIMITS.free }
    }
    var today = new Date(); today.setHours(0, 0, 0, 0)
    var identifier = userId || 'anon'
    var { count } = await supabase.from('ai_usage').select('*', { count: 'exact', head: true }).eq('user_identifier', identifier).gte('created_at', today.toISOString())
    used = count || 0
    if (used >= limit) {
      return res.status(429).json({
        error: 'Daily AI limit reached',
        tier: tier, used: used, limit: limit,
        message: tier === 'free' ? 'Free accounts get ' + limit + ' AI queries per day. Upgrade to Pro for more.' : 'You have used all ' + limit + ' queries for today.'
      })
    }
  } catch (e) { console.log('Rate limit check skipped:', e) }

  // Build messages
  var messages: Array<{ role: string; content: string }> = []
  if (context) {
    var contextMsg = ''
    if (context.type === 'phenomenon') {
      contextMsg = 'The user is viewing the phenomenon page for "' + context.name + '". Category: ' + context.category + '. Report count: ' + (context.reportCount || 'unknown') + '.'
    } else if (context.type === 'report') {
      contextMsg = 'The user is reading a report titled "' + context.title + '". Location: ' + (context.location || 'unknown') + '. Phenomenon: ' + (context.phenomenon || 'unknown') + '.'
    }
    if (contextMsg) {
      messages.push({ role: 'user', content: '[Context: ' + contextMsg + ']' })
      messages.push({ role: 'assistant', content: 'I can see what you are looking at. What would you like to know?' })
    }
  }
  if (history && Array.isArray(history)) {
    var recent = history.slice(-6)
    for (var i = 0; i < recent.length; i++) { messages.push({ role: recent[i].role, content: recent[i].content }) }
  }
  messages.push({ role: 'user', content: safeMessage })

  // Call AI provider
  try {
    var anthropicKey = process.env.ANTHROPIC_API_KEY
    var openaiKey = process.env.OPENAI_API_KEY

    if (anthropicKey) {
      var modelIds = ['claude-haiku-4-5-20251001', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307']
      for (var m = 0; m < modelIds.length; m++) {
        try {
          var apiResp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model: modelIds[m], max_tokens: 1024, system: SYSTEM_PROMPT,
              messages: messages.map(function(msg) { return { role: msg.role as 'user' | 'assistant', content: msg.content } })
            })
          })
          if (apiResp.ok) {
            var data = await apiResp.json()
            var reply = (data.content && data.content[0]) ? data.content[0].text : 'Unable to generate response.'
            // Log usage (best-effort)
            try { await supabase.from('ai_usage').insert({ user_identifier: userId || 'anon', model: modelIds[m], tokens_used: reply.length, tier: tier }) } catch(e) {}
            return res.status(200).json({ reply: reply, model: modelIds[m], usage: { used: used + 1, limit: limit } })
          }
          var errText = await apiResp.text()
          console.error('Anthropic ' + modelIds[m] + ': ' + apiResp.status + ' ' + errText)
        } catch (err) { console.error('Anthropic ' + modelIds[m] + ' error:', err) }
      }
    }

    if (openaiKey) {
      try {
        var oaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + openaiKey },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages], max_tokens: 1024, temperature: 0.7 })
        })
        if (oaiResp.ok) {
          var oaiData = await oaiResp.json()
          var oaiReply = (oaiData.choices && oaiData.choices[0]) ? oaiData.choices[0].message.content : 'Unable to generate response.'
          try { await supabase.from('ai_usage').insert({ user_identifier: userId || 'anon', model: 'gpt-4o-mini', tokens_used: oaiReply.length, tier: tier }) } catch(e) {}
          return res.status(200).json({ reply: oaiReply, model: 'gpt-4o-mini', usage: { used: used + 1, limit: limit } })
        }
        console.error('OpenAI failed: ' + oaiResp.status)
      } catch (err) { console.error('OpenAI error:', err) }
    }

    console.error('All AI providers failed. Keys: anthropic=' + !!anthropicKey + ' openai=' + !!openaiKey)
    return res.status(503).json({ error: 'AI service temporarily unavailable. Please try again.' })
  } catch (error) {
    console.error('AI chat error:', error)
    return res.status(500).json({ error: 'An error occurred processing your request.' })
  }
}
