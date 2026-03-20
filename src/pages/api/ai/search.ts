/**
 * Semantic Search API
 *
 * POST /api/ai/search
 *
 * Body:
 *   { query: string, options?: { matchCount?: number, threshold?: number, sourceTable?: 'report' | 'phenomenon', category?: string } }
 *
 * Returns semantically similar chunks with metadata, relevance scores,
 * and deduplicated source records.
 *
 * Works alongside (not replacing) /api/search/fulltext for keyword search.
 *
 * Session 15: AI Experience & Intelligence
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { semanticSearch } from '@/lib/services/embedding.service'

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

var TIER_LIMITS: Record<string, number> = { free: 10, basic: 50, pro: 200, enterprise: 1000 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var { query, options } = req.body
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' })
  }

  var safeQuery = query.substring(0, 500).trim()
  if (safeQuery.length < 2) {
    return res.status(400).json({ error: 'Query too short' })
  }

  var supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Auth (optional — affects rate limits)
  var userId: string | null = null
  var tier = 'free'
  try {
    var authHeader = req.headers.authorization
    if (authHeader) {
      var { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      userId = user?.id || null
      if (userId) {
        var { data: sub } = await supabase.from('user_subscriptions').select('tier').eq('user_id', userId).single()
        if (sub && sub.tier) tier = sub.tier
      }
    }
  } catch (e) { /* auth is optional */ }

  // Rate limiting (best-effort)
  var limit = TIER_LIMITS[tier] || TIER_LIMITS.free
  try {
    var today = new Date(); today.setHours(0, 0, 0, 0)
    var identifier = userId || (req.headers['x-forwarded-for'] as string || 'anon')
    var { count } = await supabase.from('ai_usage').select('*', { count: 'exact', head: true })
      .eq('user_identifier', identifier)
      .gte('created_at', today.toISOString())
    var used = count || 0
    if (used >= limit) {
      return res.status(429).json({
        error: 'Daily search limit reached',
        tier: tier, used: used, limit: limit,
        message: tier === 'free'
          ? 'Free accounts get ' + limit + ' AI searches per day. Upgrade for more.'
          : 'You have used all ' + limit + ' AI searches for today.'
      })
    }
  } catch (e) { /* rate limit check is best-effort */ }

  try {
    // Run semantic search
    var matchCount = (options && options.matchCount) || 10
    var threshold = (options && options.threshold) || 0.45
    var sourceTable = options && options.sourceTable
    var category = options && options.category

    var results = await semanticSearch(safeQuery, {
      matchCount: Math.min(matchCount, 20), // Cap at 20
      threshold: threshold,
      sourceTable: sourceTable,
      category: category
    })

    // Deduplicate: group chunks by source_id, keep best similarity
    var sourceMap: Record<string, {
      source_table: string
      source_id: string
      best_similarity: number
      chunks: Array<{ chunk_text: string; similarity: number; chunk_index: number }>
      metadata: any
    }> = {}

    for (var i = 0; i < results.length; i++) {
      var r = results[i]
      var key = r.source_table + ':' + r.source_id
      if (!sourceMap[key]) {
        sourceMap[key] = {
          source_table: r.source_table,
          source_id: r.source_id,
          best_similarity: r.similarity,
          chunks: [],
          metadata: r.metadata
        }
      }
      if (r.similarity > sourceMap[key].best_similarity) {
        sourceMap[key].best_similarity = r.similarity
      }
      sourceMap[key].chunks.push({
        chunk_text: r.chunk_text,
        similarity: r.similarity,
        chunk_index: (r as any).chunk_index || 0
      })
    }

    // Sort by best similarity
    var deduplicated = Object.values(sourceMap).sort(function(a, b) {
      return b.best_similarity - a.best_similarity
    })

    // Log usage (best-effort)
    try {
      await supabase.from('ai_usage').insert({
        user_identifier: userId || 'anon',
        model: 'text-embedding-3-small',
        tokens_used: safeQuery.length,
        tier: tier
      })
    } catch (e) { /* usage logging is best-effort */ }

    return res.status(200).json({
      query: safeQuery,
      results: deduplicated,
      total_chunks: results.length,
      total_sources: deduplicated.length,
      usage: { tier: tier }
    })
  } catch (error: any) {
    console.error('Semantic search error:', error)

    // If embeddings not ready, return helpful message
    if (error.message && error.message.indexOf('OPENAI_API_KEY') >= 0) {
      return res.status(503).json({
        error: 'Semantic search is being configured. Please use keyword search in the meantime.',
        fallback: '/api/search/fulltext'
      })
    }

    return res.status(500).json({ error: 'Search failed. Please try again.' })
  }
}
