/**
 * RAG-powered Conversational AI Endpoint
 *
 * POST /api/ai/chat
 *
 * Body:
 *   { message: string, context?: { type, name, category, ... }, history?: Array<{role, content}> }
 *
 * Upgrades from Session 7's basic chat to a RAG pipeline:
 * 1. Embeds the user's query
 * 2. Retrieves top relevant chunks from the vector store
 * 3. Injects retrieved context into the LLM prompt
 * 4. Returns a grounded response with source citations
 *
 * Anti-hallucination: if no relevant chunks found, says so.
 * Source citations: every claim references specific report slugs for UI linking.
 *
 * Session 15: AI Experience & Intelligence
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

var TIER_LIMITS: Record<string, number> = { free: 5, basic: 25, pro: 100, enterprise: 750 }

var BASE_SYSTEM_PROMPT = 'You are the Paradocs AI Research Assistant \u2014 a knowledgeable, curious, and balanced paranormal researcher.\n\n'
  + 'Your personality:\n'
  + '- Intellectually curious and open-minded, but grounded in critical thinking\n'
  + '- You treat every report with respect while noting when evidence is limited\n'
  + '- You are conversational and engaging, not dry or academic\n'
  + '- You can discuss theories (both skeptical and believer perspectives) fairly\n'
  + '- You never dismiss experiences outright \u2014 you contextualize them\n\n'
  + 'CRITICAL RULES:\n'
  + '1. ONLY reference reports and facts from the RETRIEVED CONTEXT below. Do NOT fabricate case names, dates, locations, or details.\n'
  + '2. When citing a specific report, include its slug in brackets like [slug:report-slug-here] so the UI can create links.\n'
  + '3. If the retrieved context does not contain relevant information, say so honestly. Say "I don\'t have specific reports matching that in my database yet" rather than making things up.\n'
  + '4. Keep responses concise (2-4 paragraphs) unless asked for detail.\n'
  + '5. When referencing the database, use real counts from the context, not made-up numbers.\n'
  + '6. Always ground your response in the evidence provided.\n'

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

  // === RAG: Retrieve relevant context from vector store ===
  var retrievedContext = ''
  var sources: Array<{ slug: string; title: string; source_table: string }> = []
  var ragAvailable = false

  try {
    var openaiKey = process.env.OPENAI_API_KEY
    if (openaiKey) {
      // Embed the query
      var embResp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + openaiKey },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: [safeMessage], dimensions: 1536 })
      })

      if (embResp.ok) {
        var embData = await embResp.json()
        var queryEmbedding = embData.data[0].embedding

        // Search vector store
        var { data: chunks, error: searchError } = await supabase.rpc('search_vectors', {
          query_embedding: '[' + queryEmbedding.join(',') + ']',
          match_count: 8,
          similarity_threshold: 0.4,
          filter_source_table: null,
          filter_metadata: null
        })

        if (!searchError && chunks && chunks.length > 0) {
          ragAvailable = true
          var contextParts: string[] = []
          var seenIds: Record<string, boolean> = {}

          for (var ci = 0; ci < chunks.length; ci++) {
            var chunk = chunks[ci]
            var meta = chunk.metadata || {}
            var sourceKey = chunk.source_table + ':' + chunk.source_id

            if (!seenIds[sourceKey]) {
              seenIds[sourceKey] = true
              sources.push({
                slug: meta.slug || '',
                title: meta.title || 'Unknown',
                source_table: chunk.source_table
              })
            }

            var simPct = Math.round(chunk.similarity * 100)
            contextParts.push(
              '[Source: ' + chunk.source_table + ' | '
              + (meta.title || 'Unknown') + ' | '
              + (meta.slug ? 'slug:' + meta.slug : '') + ' | '
              + 'Relevance: ' + simPct + '%]\n'
              + chunk.chunk_text.substring(0, 800)
            )
          }

          retrievedContext = '\n\nRETRIEVED CONTEXT FROM DATABASE (use this to ground your response):\n\n'
            + contextParts.join('\n\n---\n\n')
        }
      }
    }
  } catch (ragError) {
    console.log('RAG retrieval skipped:', ragError)
    // Continue without RAG — degrade gracefully
  }

  // Build system prompt with retrieved context
  var systemPrompt = BASE_SYSTEM_PROMPT
  if (ragAvailable && retrievedContext) {
    systemPrompt += retrievedContext
  } else {
    systemPrompt += '\nNote: The vector search database is not yet populated or the query did not match any stored documents. Answer based on your general knowledge but be transparent about the limitation. Do NOT fabricate specific Paradocs report names or data.\n'
  }

  // Build messages
  var messages: Array<{ role: string; content: string }> = []
  if (context) {
    var contextMsg = ''
    if (context.type === 'phenomenon') {
      contextMsg = 'The user is viewing the phenomenon page for "' + context.name + '". Category: ' + context.category + '. Report count: ' + (context.reportCount || 'unknown') + '.'
    } else if (context.type === 'report') {
      contextMsg = 'The user is reading a report titled "' + context.title + '". Location: ' + (context.location || 'unknown') + '. Phenomenon: ' + (context.phenomenon || 'unknown') + '.'
      if (context.slug) contextMsg += ' Slug: ' + context.slug + '.'
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

    if (anthropicKey) {
      var modelIds = ['claude-haiku-4-5-20251001', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307']
      for (var m = 0; m < modelIds.length; m++) {
        try {
          var apiResp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
              model: modelIds[m], max_tokens: 1024, system: systemPrompt,
              messages: messages.map(function(msg) { return { role: msg.role as 'user' | 'assistant', content: msg.content } })
            })
          })
          if (apiResp.ok) {
            var data = await apiResp.json()
            var reply = (data.content && data.content[0]) ? data.content[0].text : 'Unable to generate response.'
            // Log usage (best-effort)
            try { await supabase.from('ai_usage').insert({ user_identifier: userId || 'anon', model: modelIds[m], tokens_used: reply.length, tier: tier }) } catch(e) {}
            return res.status(200).json({
              reply: reply,
              model: modelIds[m],
              sources: sources,
              rag_enabled: ragAvailable,
              usage: { used: used + 1, limit: limit }
            })
          }
          var errText = await apiResp.text()
          console.error('Anthropic ' + modelIds[m] + ': ' + apiResp.status + ' ' + errText)
        } catch (err) { console.error('Anthropic ' + modelIds[m] + ' error:', err) }
      }
    }

    // OpenAI fallback
    var openaiChatKey = process.env.OPENAI_API_KEY
    if (openaiChatKey) {
      try {
        var oaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + openaiChatKey },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }].concat(messages as any), max_tokens: 1024, temperature: 0.7 })
        })
        if (oaiResp.ok) {
          var oaiData = await oaiResp.json()
          var oaiReply = (oaiData.choices && oaiData.choices[0]) ? oaiData.choices[0].message.content : 'Unable to generate response.'
          try { await supabase.from('ai_usage').insert({ user_identifier: userId || 'anon', model: 'gpt-4o-mini', tokens_used: oaiReply.length, tier: tier }) } catch(e) {}
          return res.status(200).json({
            reply: oaiReply,
            model: 'gpt-4o-mini',
            sources: sources,
            rag_enabled: ragAvailable,
            usage: { used: used + 1, limit: limit }
          })
        }
        console.error('OpenAI failed: ' + oaiResp.status)
      } catch (err) { console.error('OpenAI error:', err) }
    }

    console.error('All AI providers failed. Keys: anthropic=' + !!anthropicKey + ' openai=' + !!openaiChatKey)
    return res.status(503).json({ error: 'AI service temporarily unavailable. Please try again.' })
  } catch (error) {
    console.error('AI chat error:', error)
    return res.status(500).json({ error: 'An error occurred processing your request.' })
  }
}
