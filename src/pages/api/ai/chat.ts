import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Rate limits per tier (requests per day)
var TIER_LIMITS: Record<string, number> = {
  free: 5,
  basic: 25,
  pro: 100,
  enterprise: 1000
}

var SYSTEM_PROMPT = 'You are the ParaDocs AI Research Assistant \u2014 a knowledgeable, curious, and balanced paranormal researcher. You have access to the world\'s largest database of paranormal phenomena with over 258,000 reports spanning UFO sightings, cryptid encounters, ghost reports, psychic phenomena, and more.\n\nYour personality:\n- Intellectually curious and open-minded, but grounded in critical thinking\n- You treat every report with respect while noting when evidence is limited\n- You reference real historical cases, research, and data from the ParaDocs database\n- You are conversational and engaging, not dry or academic\n- When discussing specific phenomena, mention report counts and notable sightings from our database\n- You can discuss theories (both skeptical and believer perspectives) fairly\n- You never dismiss experiences outright \u2014 you contextualize them\n\nWhen given context about a specific phenomenon or report, focus your response on that topic. When asked general questions, draw from your broad knowledge of paranormal research.\n\nKeep responses concise (2-4 paragraphs max) unless asked for detail. Use a warm, engaging tone \u2014 like a knowledgeable friend who happens to be a paranormal researcher.'

async function checkRateLimit(userId: string | null, supabase: any): Promise<{ allowed: boolean; tier: string; used: number; limit: number }> {
  var tier = 'free'
  var limit = TIER_LIMITS.free

  if (userId) {
    // Check user subscription tier
    var { data: sub } = await supabase
      .from('user_subscriptions')
      .select('tier')
      .eq('user_id', userId)
      .single()
    if (sub && sub.tier) {
      tier = sub.tier
      limit = TIER_LIMITS[tier] || TIER_LIMITS.free
    }
  }

  // Count today's usage
  var today = new Date()
  today.setHours(0, 0, 0, 0)
  var identifier = userId || 'anon'

  var { count } = await supabase
    .from('ai_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_identifier', identifier)
    .gte('created_at', today.toISOString())

  var used = count || 0
  return { allowed: used < limit, tier: tier, used: used, limit: limit }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var { message, context, history } = req.body

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' })
  }

  // Truncate message to prevent abuse
  var safeMessage = message.substring(0, 2000)

  var supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Auth check
  var authHeader = req.headers.authorization
  var userId: string | null = null

  if (authHeader) {
    var { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    userId = user?.id || null
  }

  // Rate limiting
  var rateCheck = await checkRateLimit(userId, supabase)
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: 'Daily AI limit reached',
      tier: rateCheck.tier,
      used: rateCheck.used,
      limit: rateCheck.limit,
      message: rateCheck.tier === 'free'
        ? 'Free accounts get ' + rateCheck.limit + ' AI queries per day. Upgrade to Pro for ' + TIER_LIMITS.pro + ' daily queries.'
        : 'You have used all ' + rateCheck.limit + ' AI queries for today. Limits reset at midnight.'
    })
  }

  // Build context-aware messages
  var messages: Array<{ role: string; content: string }> = []

  if (context) {
    var contextMsg = ''
    if (context.type === 'phenomenon') {
      contextMsg = 'The user is currently viewing the phenomenon page for "' + context.name + '". Category: ' + context.category + '. Description: ' + (context.description ? context.description.substring(0, 500) : 'N/A') + '. Report count: ' + (context.reportCount || 'unknown') + '.'
    } else if (context.type === 'report') {
      contextMsg = 'The user is currently reading a report titled "' + context.title + '". Location: ' + (context.location || 'unknown') + '. Summary: ' + (context.summary ? context.summary.substring(0, 500) : 'N/A') + '. Phenomenon: ' + (context.phenomenon || 'unknown') + '.'
    }
    if (contextMsg) {
      messages.push({ role: 'user', content: '[Context: ' + contextMsg + ']' })
      messages.push({ role: 'assistant', content: 'I can see what you are looking at. What would you like to know?' })
    }
  }

  // Add conversation history (last 6 messages max)
  if (history && Array.isArray(history)) {
    var recentHistory = history.slice(-6)
    for (var i = 0; i < recentHistory.length; i++) {
      messages.push({ role: recentHistory[i].role, content: recentHistory[i].content })
    }
  }

  messages.push({ role: 'user', content: safeMessage })

  try {
    var anthropicKey = process.env.ANTHROPIC_API_KEY
    var openaiKey = process.env.OPENAI_API_KEY
    var reply = ''
    var model = ''

    if (anthropicKey) {
      // Try multiple model IDs in case one is deprecated
      var modelIds = ['claude-haiku-4-5-20251001', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307']
      var anthropicSuccess = false

      for (var m = 0; m < modelIds.length; m++) {
        try {
          var response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: modelIds[m],
              max_tokens: 1024,
              system: SYSTEM_PROMPT,
              messages: messages.map(function(msg) { return { role: msg.role as 'user' | 'assistant', content: msg.content } })
            })
          })

          if (response.ok) {
            var data = await response.json()
            reply = data.content && data.content[0] ? data.content[0].text : 'I apologize, but I was unable to generate a response.'
            model = 'claude (' + modelIds[m] + ')'
            anthropicSuccess = true
            break
          } else {
            var errBody = await response.text()
            console.error('Anthropic model ' + modelIds[m] + ' failed: ' + response.status + ' ' + errBody)
          }
        } catch (modelErr) {
          console.error('Anthropic model ' + modelIds[m] + ' error:', modelErr)
        }
      }

      if (anthropicSuccess) {
        // Log usage
        await supabase.from('ai_usage').insert({
          user_identifier: userId || 'anon-' + (req.headers['x-forwarded-for'] || 'unknown'),
          model: model,
          tokens_used: reply.length,
          tier: rateCheck.tier
        }).catch(function() {})

        return res.status(200).json({ reply: reply, model: model, usage: { used: rateCheck.used + 1, limit: rateCheck.limit } })
      }
    }

    // OpenAI fallback
    if (openaiKey) {
      var oaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + openaiKey
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

      if (oaiResponse.ok) {
        var oaiData = await oaiResponse.json()
        reply = oaiData.choices && oaiData.choices[0] ? oaiData.choices[0].message.content : 'I apologize, but I was unable to generate a response.'
        model = 'openai'

        await supabase.from('ai_usage').insert({
          user_identifier: userId || 'anon-' + (req.headers['x-forwarded-for'] || 'unknown'),
          model: model,
          tokens_used: reply.length,
          tier: rateCheck.tier
        }).catch(function() {})

        return res.status(200).json({ reply: reply, model: model, usage: { used: rateCheck.used + 1, limit: rateCheck.limit } })
      } else {
        var oaiErr = await oaiResponse.text()
        console.error('OpenAI fallback failed: ' + oaiResponse.status + ' ' + oaiErr)
      }
    }

    console.error('All AI providers failed. Anthropic key present: ' + !!anthropicKey + ', OpenAI key present: ' + !!openaiKey)
    return res.status(503).json({ error: 'AI service temporarily unavailable. Please try again in a moment.' })

  } catch (error) {
    console.error('AI chat error:', error)
    return res.status(500).json({ error: 'An error occurred processing your request.' })
  }
}
