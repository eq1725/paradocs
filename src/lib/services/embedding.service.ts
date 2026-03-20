/**
 * Embedding Service — Vector embedding pipeline for RAG
 *
 * Handles: chunking text, generating embeddings via OpenAI,
 * storing in pgvector, and managing the embedding sync state.
 *
 * Session 15: AI Experience & Intelligence
 */

import { createServerClient } from '../supabase'
import crypto from 'crypto'

// OpenAI embedding model config
var EMBEDDING_MODEL = 'text-embedding-3-small'
var EMBEDDING_DIMENSION = 1536
var MAX_CHUNK_TOKENS = 800 // Target chunk size in tokens (approx)
var OVERLAP_TOKENS = 100   // Overlap between chunks
var BATCH_SIZE = 20        // Max embeddings per API call

// Rough token estimation: ~4 chars per token for English
var CHARS_PER_TOKEN = 4

export interface ChunkMetadata {
  source_table: 'report' | 'phenomenon'
  source_id: string
  title?: string
  category?: string
  date?: string
  location?: string
  credibility?: string
  slug?: string
  [key: string]: any
}

interface TextChunk {
  text: string
  index: number
  token_count: number
}

/**
 * Split text into overlapping chunks of roughly MAX_CHUNK_TOKENS tokens.
 * Splits on paragraph boundaries when possible, falls back to sentence boundaries.
 */
export function chunkText(text: string, maxTokens?: number): TextChunk[] {
  var limit = maxTokens || MAX_CHUNK_TOKENS
  var maxChars = limit * CHARS_PER_TOKEN
  var overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN

  if (!text || text.trim().length === 0) return []

  // If text is short enough, return as single chunk
  var estimatedTokens = Math.ceil(text.length / CHARS_PER_TOKEN)
  if (estimatedTokens <= limit) {
    return [{ text: text.trim(), index: 0, token_count: estimatedTokens }]
  }

  // Split into paragraphs first
  var paragraphs = text.split(/\n\n+/).filter(function(p) { return p.trim().length > 0 })
  var chunks: TextChunk[] = []
  var currentChunk = ''
  var chunkIndex = 0

  for (var i = 0; i < paragraphs.length; i++) {
    var para = paragraphs[i].trim()

    // If adding this paragraph exceeds limit, finalize current chunk
    if (currentChunk.length > 0 && (currentChunk.length + para.length + 2) > maxChars) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
        token_count: Math.ceil(currentChunk.trim().length / CHARS_PER_TOKEN)
      })
      chunkIndex++

      // Start new chunk with overlap from end of previous
      if (overlapChars > 0 && currentChunk.length > overlapChars) {
        currentChunk = currentChunk.slice(-overlapChars) + '\n\n' + para
      } else {
        currentChunk = para
      }
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + para : para
    }

    // Handle single paragraphs that exceed maxChars
    if (currentChunk.length > maxChars * 1.5) {
      // Split by sentences
      var sentences = currentChunk.match(/[^.!?]+[.!?]+/g) || [currentChunk]
      var sentenceChunk = ''
      for (var s = 0; s < sentences.length; s++) {
        if (sentenceChunk.length > 0 && (sentenceChunk.length + sentences[s].length) > maxChars) {
          chunks.push({
            text: sentenceChunk.trim(),
            index: chunkIndex,
            token_count: Math.ceil(sentenceChunk.trim().length / CHARS_PER_TOKEN)
          })
          chunkIndex++
          sentenceChunk = sentences[s]
        } else {
          sentenceChunk = sentenceChunk + sentences[s]
        }
      }
      currentChunk = sentenceChunk
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      token_count: Math.ceil(currentChunk.trim().length / CHARS_PER_TOKEN)
    })
  }

  return chunks
}

/**
 * Generate embeddings for an array of texts using OpenAI API.
 * Batches requests to stay within API limits.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  var apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for generating embeddings')
  }

  var allEmbeddings: number[][] = []

  // Process in batches
  for (var i = 0; i < texts.length; i += BATCH_SIZE) {
    var batch = texts.slice(i, i + BATCH_SIZE)
    var resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSION
      })
    })

    if (!resp.ok) {
      var errText = await resp.text()
      throw new Error('OpenAI embedding API error ' + resp.status + ': ' + errText)
    }

    var data = await resp.json()
    // Sort by index to maintain order
    var sorted = data.data.sort(function(a: any, b: any) { return a.index - b.index })
    for (var j = 0; j < sorted.length; j++) {
      allEmbeddings.push(sorted[j].embedding)
    }

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < texts.length) {
      await new Promise(function(resolve) { setTimeout(resolve, 200) })
    }
  }

  return allEmbeddings
}

/**
 * Generate a single embedding for a query string.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  var results = await generateEmbeddings([query])
  return results[0]
}

/**
 * Compute a content hash for change detection.
 */
function computeContentHash(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex')
}

/**
 * Build the embeddable text for a report.
 * Combines title, description, location, category, and other metadata
 * into a rich text representation suitable for embedding.
 */
function buildReportText(report: any): string {
  var parts: string[] = []

  if (report.title) parts.push('Title: ' + report.title)
  if (report.category) parts.push('Category: ' + report.category)
  if (report.location) parts.push('Location: ' + report.location)
  if (report.event_date) parts.push('Date: ' + report.event_date)
  if (report.phenomenon_type) parts.push('Phenomenon Type: ' + report.phenomenon_type)
  if (report.credibility) parts.push('Credibility: ' + report.credibility)
  if (report.summary) parts.push('Summary: ' + report.summary)
  if (report.description) parts.push('\n' + report.description)

  return parts.join('\n')
}

/**
 * Build the embeddable text for a phenomenon encyclopedia entry.
 */
function buildPhenomenonText(phenomenon: any): string {
  var parts: string[] = []

  if (phenomenon.name) parts.push('Name: ' + phenomenon.name)
  if (phenomenon.category) parts.push('Category: ' + phenomenon.category)
  if (phenomenon.subcategory) parts.push('Subcategory: ' + phenomenon.subcategory)
  if (phenomenon.ai_summary) parts.push('Summary: ' + phenomenon.ai_summary)
  if (phenomenon.ai_description) parts.push('\n' + phenomenon.ai_description)
  if (phenomenon.ai_characteristics) parts.push('\nCharacteristics: ' + phenomenon.ai_characteristics)
  if (phenomenon.ai_theories) parts.push('\nTheories: ' + phenomenon.ai_theories)
  if (phenomenon.ai_history) parts.push('\nHistory: ' + phenomenon.ai_history)
  if (phenomenon.primary_regions) {
    var regions = Array.isArray(phenomenon.primary_regions) ? phenomenon.primary_regions.join(', ') : phenomenon.primary_regions
    parts.push('Primary Regions: ' + regions)
  }

  return parts.join('\n')
}

/**
 * Embed a single report: chunk it, generate embeddings, store in pgvector.
 * Skips if content hasn't changed (hash-based).
 */
export async function embedReport(reportId: string, force?: boolean): Promise<{ chunks: number; skipped: boolean }> {
  var supabase = createServerClient()

  // Fetch report
  var { data: report, error: fetchError } = await supabase
    .from('reports')
    .select('id, title, description, summary, category, location, event_date, phenomenon_type, credibility, slug, case_group')
    .eq('id', reportId)
    .single()

  if (fetchError || !report) {
    throw new Error('Report not found: ' + reportId)
  }

  var text = buildReportText(report)
  var contentHash = computeContentHash(text)

  // Check if already embedded with same content
  if (!force) {
    var { data: syncRecord } = await supabase
      .from('embedding_sync')
      .select('content_hash')
      .eq('source_table', 'report')
      .eq('source_id', reportId)
      .single()

    if (syncRecord && syncRecord.content_hash === contentHash) {
      return { chunks: 0, skipped: true }
    }
  }

  // Chunk the text
  var chunks = chunkText(text)
  if (chunks.length === 0) {
    return { chunks: 0, skipped: true }
  }

  // Generate embeddings
  var chunkTexts = chunks.map(function(c) { return c.text })
  var embeddings = await generateEmbeddings(chunkTexts)

  // Build metadata
  var metadata: ChunkMetadata = {
    source_table: 'report',
    source_id: report.id,
    title: report.title || undefined,
    category: report.category || undefined,
    date: report.event_date || undefined,
    location: report.location || undefined,
    credibility: report.credibility || undefined,
    slug: report.slug || undefined
  }
  if (report.case_group) {
    (metadata as any).case_group = report.case_group
  }

  // Delete old chunks for this source
  await supabase
    .from('vector_chunks')
    .delete()
    .eq('source_table', 'report')
    .eq('source_id', reportId)

  // Insert new chunks
  var insertRows = chunks.map(function(chunk, idx) {
    return {
      source_table: 'report' as const,
      source_id: reportId,
      chunk_index: chunk.index,
      chunk_text: chunk.text,
      embedding: '[' + embeddings[idx].join(',') + ']',
      metadata: metadata,
      token_count: chunk.token_count
    }
  })

  // Insert in batches of 50
  for (var b = 0; b < insertRows.length; b += 50) {
    var batch = insertRows.slice(b, b + 50)
    var { error: insertError } = await supabase.from('vector_chunks').insert(batch)
    if (insertError) {
      console.error('Error inserting vector chunks:', insertError)
      throw new Error('Failed to insert vector chunks: ' + insertError.message)
    }
  }

  // Update sync record
  await supabase.from('embedding_sync').upsert({
    source_table: 'report',
    source_id: reportId,
    content_hash: contentHash,
    chunk_count: chunks.length,
    last_embedded_at: new Date().toISOString()
  })

  return { chunks: chunks.length, skipped: false }
}

/**
 * Embed a single phenomenon encyclopedia entry.
 */
export async function embedPhenomenon(phenomenonId: string, force?: boolean): Promise<{ chunks: number; skipped: boolean }> {
  var supabase = createServerClient()

  var { data: phenomenon, error: fetchError } = await supabase
    .from('phenomena')
    .select('id, name, category, subcategory, ai_summary, ai_description, ai_characteristics, ai_theories, ai_history, primary_regions, slug')
    .eq('id', phenomenonId)
    .single()

  if (fetchError || !phenomenon) {
    throw new Error('Phenomenon not found: ' + phenomenonId)
  }

  var text = buildPhenomenonText(phenomenon)
  var contentHash = computeContentHash(text)

  if (!force) {
    var { data: syncRecord } = await supabase
      .from('embedding_sync')
      .select('content_hash')
      .eq('source_table', 'phenomenon')
      .eq('source_id', phenomenonId)
      .single()

    if (syncRecord && syncRecord.content_hash === contentHash) {
      return { chunks: 0, skipped: true }
    }
  }

  var chunks = chunkText(text)
  if (chunks.length === 0) {
    return { chunks: 0, skipped: true }
  }

  var chunkTexts = chunks.map(function(c) { return c.text })
  var embeddings = await generateEmbeddings(chunkTexts)

  var metadata: ChunkMetadata = {
    source_table: 'phenomenon',
    source_id: phenomenon.id,
    title: phenomenon.name || undefined,
    category: phenomenon.category || undefined,
    slug: phenomenon.slug || undefined
  }

  await supabase
    .from('vector_chunks')
    .delete()
    .eq('source_table', 'phenomenon')
    .eq('source_id', phenomenonId)

  var insertRows = chunks.map(function(chunk, idx) {
    return {
      source_table: 'phenomenon' as const,
      source_id: phenomenonId,
      chunk_index: chunk.index,
      chunk_text: chunk.text,
      embedding: '[' + embeddings[idx].join(',') + ']',
      metadata: metadata,
      token_count: chunk.token_count
    }
  })

  for (var b = 0; b < insertRows.length; b += 50) {
    var batch = insertRows.slice(b, b + 50)
    var { error: insertError } = await supabase.from('vector_chunks').insert(batch)
    if (insertError) {
      throw new Error('Failed to insert vector chunks: ' + insertError.message)
    }
  }

  await supabase.from('embedding_sync').upsert({
    source_table: 'phenomenon',
    source_id: phenomenonId,
    content_hash: contentHash,
    chunk_count: chunks.length,
    last_embedded_at: new Date().toISOString()
  })

  return { chunks: chunks.length, skipped: false }
}

/**
 * Bulk embed all reports. Processes in series to avoid rate limits.
 * Returns stats on what was embedded.
 */
export async function embedAllReports(options?: { force?: boolean; limit?: number; offset?: number }): Promise<{
  total: number; embedded: number; skipped: number; errors: string[]
}> {
  var supabase = createServerClient()
  var force = options?.force || false

  var query = supabase
    .from('reports')
    .select('id')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })

  if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 100) - 1)
  else if (options?.limit) query = query.limit(options.limit)

  var { data: reports, error } = await query

  if (error || !reports) {
    return { total: 0, embedded: 0, skipped: 0, errors: ['Failed to fetch reports: ' + (error?.message || 'unknown')] }
  }

  var stats = { total: reports.length, embedded: 0, skipped: 0, errors: [] as string[] }

  for (var i = 0; i < reports.length; i++) {
    try {
      var result = await embedReport(reports[i].id, force)
      if (result.skipped) stats.skipped++
      else stats.embedded++
    } catch (e: any) {
      stats.errors.push('Report ' + reports[i].id + ': ' + e.message)
    }

    // Pause every 10 reports to avoid rate limiting
    if (i > 0 && i % 10 === 0) {
      await new Promise(function(resolve) { setTimeout(resolve, 1000) })
    }
  }

  return stats
}

/**
 * Bulk embed all phenomena. Processes in series to avoid rate limits.
 */
export async function embedAllPhenomena(options?: { force?: boolean; limit?: number; offset?: number }): Promise<{
  total: number; embedded: number; skipped: number; errors: string[]
}> {
  var supabase = createServerClient()
  var force = options?.force || false

  var query = supabase
    .from('phenomena')
    .select('id')
    .order('created_at', { ascending: true })

  if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 100) - 1)
  else if (options?.limit) query = query.limit(options.limit)

  var { data: phenomena, error } = await query

  if (error || !phenomena) {
    return { total: 0, embedded: 0, skipped: 0, errors: ['Failed to fetch phenomena: ' + (error?.message || 'unknown')] }
  }

  var stats = { total: phenomena.length, embedded: 0, skipped: 0, errors: [] as string[] }

  for (var i = 0; i < phenomena.length; i++) {
    try {
      var result = await embedPhenomenon(phenomena[i].id, force)
      if (result.skipped) stats.skipped++
      else stats.embedded++
    } catch (e: any) {
      stats.errors.push('Phenomenon ' + phenomena[i].id + ': ' + e.message)
    }

    if (i > 0 && i % 10 === 0) {
      await new Promise(function(resolve) { setTimeout(resolve, 1000) })
    }
  }

  return stats
}

/**
 * Semantic vector search. Embeds the query, then searches pgvector.
 */
export async function semanticSearch(query: string, options?: {
  matchCount?: number
  threshold?: number
  sourceTable?: 'report' | 'phenomenon'
  category?: string
}): Promise<Array<{
  id: string
  source_table: string
  source_id: string
  chunk_text: string
  metadata: any
  similarity: number
}>> {
  var supabase = createServerClient()

  var queryEmbedding = await generateQueryEmbedding(query)

  var matchCount = options?.matchCount || 10
  var threshold = options?.threshold || 0.5
  var filterMetadata = options?.category ? JSON.stringify({ category: options.category }) : null

  var { data, error } = await supabase.rpc('search_vectors', {
    query_embedding: '[' + queryEmbedding.join(',') + ']',
    match_count: matchCount,
    similarity_threshold: threshold,
    filter_source_table: options?.sourceTable || null,
    filter_metadata: filterMetadata
  })

  if (error) {
    console.error('Semantic search error:', error)
    throw new Error('Semantic search failed: ' + error.message)
  }

  return data || []
}

/**
 * Get embedding stats for monitoring.
 */
export async function getEmbeddingStats(): Promise<{
  total_chunks: number
  report_chunks: number
  phenomenon_chunks: number
  synced_reports: number
  synced_phenomena: number
}> {
  var supabase = createServerClient()

  var { count: totalChunks } = await supabase.from('vector_chunks').select('*', { count: 'exact', head: true })
  var { count: reportChunks } = await supabase.from('vector_chunks').select('*', { count: 'exact', head: true }).eq('source_table', 'report')
  var { count: phenChunks } = await supabase.from('vector_chunks').select('*', { count: 'exact', head: true }).eq('source_table', 'phenomenon')
  var { count: syncReports } = await supabase.from('embedding_sync').select('*', { count: 'exact', head: true }).eq('source_table', 'report')
  var { count: syncPhen } = await supabase.from('embedding_sync').select('*', { count: 'exact', head: true }).eq('source_table', 'phenomenon')

  return {
    total_chunks: totalChunks || 0,
    report_chunks: reportChunks || 0,
    phenomenon_chunks: phenChunks || 0,
    synced_reports: syncReports || 0,
    synced_phenomena: syncPhen || 0
  }
}
