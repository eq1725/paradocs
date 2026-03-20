-- Migration: Vector Embeddings for RAG Pipeline
-- Date: 2026-03-20
-- Session: AI Experience & Intelligence (Session 15)
--
-- This migration sets up pgvector for semantic search across reports and phenomena.
-- It creates the vector_chunks table that stores embedded text chunks with metadata.

-- Enable pgvector extension (Supabase has this available)
CREATE EXTENSION IF NOT EXISTS vector;

-- Main vector chunks table
CREATE TABLE IF NOT EXISTS vector_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL CHECK (source_table IN ('report', 'phenomenon')),
  source_id UUID NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-3-small dimension
  metadata JSONB NOT NULL DEFAULT '{}',
  token_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, chunk_index)
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_vector_chunks_source ON vector_chunks(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_metadata ON vector_chunks USING GIN (metadata);

-- HNSW index for fast approximate nearest neighbor search
-- Using cosine distance (most common for text embeddings)
CREATE INDEX IF NOT EXISTS idx_vector_chunks_embedding ON vector_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Content hash tracking table to know when to re-embed
CREATE TABLE IF NOT EXISTS embedding_sync (
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  content_hash TEXT NOT NULL,
  last_embedded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  chunk_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_table, source_id)
);

-- AI featured patterns cache (for homepage preview)
CREATE TABLE IF NOT EXISTS ai_featured_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  supporting_data JSONB NOT NULL DEFAULT '{}',
  report_ids UUID[] NOT NULL DEFAULT '{}',
  relevance_score FLOAT NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_ai_featured_patterns_active ON ai_featured_patterns(is_active, relevance_score DESC);

-- RLS policies
ALTER TABLE vector_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_featured_patterns ENABLE ROW LEVEL SECURITY;

-- vector_chunks: readable by all (search needs to work for everyone)
CREATE POLICY "vector_chunks_select" ON vector_chunks FOR SELECT USING (true);
-- Only service role can insert/update/delete
CREATE POLICY "vector_chunks_service" ON vector_chunks FOR ALL USING (auth.role() = 'service_role');

-- embedding_sync: service role only
CREATE POLICY "embedding_sync_service" ON embedding_sync FOR ALL USING (auth.role() = 'service_role');

-- ai_featured_patterns: readable by all, writable by service role
CREATE POLICY "ai_featured_patterns_select" ON ai_featured_patterns FOR SELECT USING (true);
CREATE POLICY "ai_featured_patterns_service" ON ai_featured_patterns FOR ALL USING (auth.role() = 'service_role');

-- Function to search vector chunks by cosine similarity
CREATE OR REPLACE FUNCTION search_vectors(
  query_embedding vector(1536),
  match_count INTEGER DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.5,
  filter_source_table TEXT DEFAULT NULL,
  filter_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source_table TEXT,
  source_id UUID,
  chunk_index INTEGER,
  chunk_text TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vc.id,
    vc.source_table,
    vc.source_id,
    vc.chunk_index,
    vc.chunk_text,
    vc.metadata,
    1 - (vc.embedding <=> query_embedding) AS similarity
  FROM vector_chunks vc
  WHERE
    vc.embedding IS NOT NULL
    AND (filter_source_table IS NULL OR vc.source_table = filter_source_table)
    AND (filter_metadata IS NULL OR vc.metadata @> filter_metadata)
    AND 1 - (vc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY vc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
