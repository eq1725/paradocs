# HANDOFF - AI Experience & Intelligence (Session 15)

**Date:** March 20, 2026
**Session:** AI Experience & Intelligence (Session 15)
**Status:** DEPLOYED AND LIVE. RAG pipeline operational. Semantic search confirmed working. Embeddings: ~900 reports fully embedded, ~1,150/4,792 phenomena embedded (remainder rate-limited, re-run needed). All 7 API endpoints live on beta.discoverparadocs.com.

---

## What Was Built

### Architecture Overview

The AI intelligence layer follows a RAG (Retrieval-Augmented Generation) architecture:

```
User Query -> Embed Query (OpenAI) -> Vector Search (pgvector) -> Retrieve Chunks -> Inject into LLM Context (Claude) -> Grounded Response with Citations
```

**AI Providers:**
- **OpenAI** (`text-embedding-3-small`): Vector embeddings (1536 dimensions). Used for all embedding generation and query embedding.
- **Anthropic Claude** (Haiku 4.5 primary, Haiku 3.5/3 fallback): Chat responses, pattern narratives, report analysis. Existing pattern from codebase.
- **OpenAI GPT-4o-mini**: Fallback for chat if all Claude models fail.

**Vector Storage:** pgvector extension in Supabase (keeps everything in one DB). HNSW index for fast approximate nearest neighbor search using cosine distance.

---

### P0: Vector Embedding Pipeline

**New files:**
- `supabase/migrations/20260320_vector_embeddings.sql` — Database migration
- `src/lib/services/embedding.service.ts` — Core embedding service
- `src/pages/api/admin/ai/embed.ts` — Admin endpoint for triggering embeds

**Database tables created:**

| Table | Purpose |
|-------|---------|
| `vector_chunks` | Stores embedded text chunks with pgvector embeddings (1536d) |
| `embedding_sync` | Tracks content hashes for incremental re-embedding |
| `ai_featured_patterns` | Caches featured pattern discoveries for homepage |

**Database function:**
- `search_vectors()` — RPC function for cosine similarity search with metadata filtering

**Embedding service capabilities:**
- `chunkText()` — Splits text into overlapping 800-token chunks at paragraph/sentence boundaries
- `generateEmbeddings()` — Batched OpenAI embedding generation (20 per batch, 200ms delay)
- `embedReport()` — Embeds a single report (hash-based skip if unchanged)
- `embedPhenomenon()` — Embeds a single encyclopedia entry
- `embedAllReports()` — Bulk embed all approved reports
- `embedAllPhenomena()` — Bulk embed all phenomena
- `semanticSearch()` — Embed a query and search vector store
- `getEmbeddingStats()` — Monitoring endpoint

**Admin endpoint (`POST /api/admin/ai/embed`):**

```js
// Embed single report
{ action: 'report', id: 'uuid' }

// Embed all reports (incremental)
{ action: 'all_reports' }

// Force re-embed all reports
{ action: 'all_reports', force: true }

// Full reindex (reports + phenomena)
{ action: 'full_reindex' }

// Get stats
{ action: 'stats' }
```

**How embedding works for each record:**
1. Fetch record from DB
2. Build rich text representation (title + category + location + date + description)
3. Compute MD5 content hash
4. Skip if hash matches last embed (unless forced)
5. Chunk text into overlapping ~800-token pieces
6. Generate embeddings via OpenAI
7. Delete old chunks, insert new ones
8. Update sync record

**Scales to 5M+ reports:** Same pipeline, just re-run `all_reports` with limit/offset pagination. Hash-based skipping means incremental updates are fast.

---

### P1: Semantic Search API

**New file:** `src/pages/api/ai/search.ts`

**Endpoint:** `POST /api/ai/search`

```json
{
  "query": "triangular craft near military bases",
  "options": {
    "matchCount": 10,
    "threshold": 0.45,
    "sourceTable": "report",
    "category": "ufos_aliens"
  }
}
```

**Response:**
```json
{
  "query": "triangular craft near military bases",
  "results": [
    {
      "source_table": "report",
      "source_id": "uuid",
      "best_similarity": 0.82,
      "chunks": [
        { "chunk_text": "...", "similarity": 0.82, "chunk_index": 0 }
      ],
      "metadata": {
        "title": "Rendlesham Forest Incident",
        "slug": "rendlesham-forest-showcase",
        "category": "ufos_aliens",
        "location": "Suffolk, England"
      }
    }
  ],
  "total_chunks": 15,
  "total_sources": 8
}
```

**Features:**
- Deduplicates results by source (groups chunks, keeps best similarity)
- Rate-limited by subscription tier (free: 10/day, basic: 50, pro: 200, enterprise: 1000)
- Works alongside `/api/search/fulltext` (does not replace it)
- Graceful degradation if OpenAI key not configured

---

### P2: AI Pattern Detection

**New files:**
- `src/lib/services/ai-pattern-detection.service.ts` — Detection algorithms
- `src/pages/api/ai/patterns.ts` — API endpoint

**Three detection methods:**

1. **Geographic Clustering** (`detectGeographicClusters`)
   - Grid-based spatial clustering (0.5-degree cells, ~35 miles)
   - Finds report concentrations with dominant category
   - Returns center coordinates, radius, date range

2. **Temporal Spikes** (`detectTemporalSpikes`)
   - Monthly report counts with z-score analysis (threshold: 2.0)
   - Detects unusual activity surges in specific periods
   - Returns z-score, average baseline, dominant category

3. **Phenomena Similarity** (`detectPhenomenaSimilarity`)
   - Uses vector embeddings to find reports with similar descriptions
   - Across different times and locations
   - Requires embeddings to be populated

**Endpoint:** `GET /api/ai/patterns` or `POST /api/ai/patterns`

```
GET /api/ai/patterns?category=ufos_aliens
GET /api/ai/patterns?type=geographic_cluster
```

**Response structure:**
```json
{
  "geographic": [...],
  "temporal": [...],
  "similarity": [...],
  "total": 15
}
```

**Pattern narrative generation:** Uses Claude Haiku to generate human-readable 2-3 sentence descriptions of detected patterns, grounded in actual report data.

---

### P3: RAG-powered Conversational AI

**Updated file:** `src/pages/api/ai/chat.ts` (rewritten)

**What changed from the original:**
1. **RAG pipeline added:** Before calling Claude, the endpoint now embeds the user's message, retrieves top-8 relevant chunks from pgvector, and injects them into the system prompt
2. **Anti-hallucination rules:** System prompt now explicitly says "ONLY reference reports and facts from the RETRIEVED CONTEXT" and "If the retrieved context does not contain relevant information, say so honestly"
3. **Source citations:** Prompt instructs Claude to use `[slug:report-slug-here]` format so the UI can create clickable links
4. **Sources returned in response:** `sources` array with slug, title, and source_table for each cited record
5. **`rag_enabled` flag:** Response tells the UI whether RAG context was available
6. **Graceful degradation:** If OpenAI key not set or vector store empty, falls back to general knowledge with transparency note

**The existing AskTheUnknown component** works with this endpoint without modification. The response format is backward-compatible (still has `reply`, `model`, `usage` fields). New fields (`sources`, `rag_enabled`) are additive.

**Request format** (unchanged):
```json
{
  "message": "Tell me about triangular UFOs",
  "context": { "type": "report", "title": "...", "slug": "..." },
  "history": [{ "role": "user", "content": "..." }, ...]
}
```

**Response format** (extended):
```json
{
  "reply": "Based on reports in the Paradocs database...",
  "model": "claude-haiku-4-5-20251001",
  "sources": [
    { "slug": "rendlesham-forest-showcase", "title": "Rendlesham Forest", "source_table": "report" }
  ],
  "rag_enabled": true,
  "usage": { "used": 3, "limit": 5 }
}
```

---

### P4: Integration Endpoints

**Homepage AI Preview:**
- `GET /api/ai/featured-patterns` — Returns 2-3 interesting pattern discoveries
- 5-minute CDN cache, 1-hour stale-while-revalidate
- Backed by `ai_featured_patterns` table (24-hour cache)
- Session 7 Phase 2 can use this to populate the "AI Intelligence Preview" section

**Search Enrichment:**
- `GET /api/ai/related?query=X` — Returns related reports and phenomena for any search query
- Separated into `related_reports` and `related_phenomena` arrays
- Includes similarity percentages and text snippets
- Session 7 Phase 3 can use this for "Related Patterns" on search results

**Report Similar Reports:**
- `GET /api/ai/report-similar?slug=X` or `?id=UUID` — Vector-similarity based report matching
- Extends existing report-insights similar cases with actual semantic matching
- Returns similarity percentages, snippets, and full metadata
- Can be used by report detail page to enhance "Similar Reports" section

---

## Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260320_vector_embeddings.sql` | **NEW** | pgvector tables, indexes, RPC function |
| `src/lib/services/embedding.service.ts` | **NEW** | Core embedding pipeline (chunk, embed, store, search) |
| `src/lib/services/ai-pattern-detection.service.ts` | **NEW** | Geographic, temporal, similarity pattern detection |
| `src/pages/api/admin/ai/embed.ts` | **NEW** | Admin embedding trigger endpoint |
| `src/pages/api/ai/search.ts` | **NEW** | Semantic search API |
| `src/pages/api/ai/patterns.ts` | **NEW** | Pattern detection API |
| `src/pages/api/ai/featured-patterns.ts` | **NEW** | Homepage AI preview patterns |
| `src/pages/api/ai/related.ts` | **NEW** | Search enrichment (related patterns/context) |
| `src/pages/api/ai/report-similar.ts` | **NEW** | Per-report vector similarity matching |
| `src/pages/api/ai/chat.ts` | **REWRITTEN** | RAG-powered chat with source citations |
| `src/components/AskTheUnknown.tsx` | **MODIFIED** | Citation parsing (`[slug:x]` → links), Sources footer for RAG responses |
| `.env.example` | **MODIFIED** | Added ANTHROPIC_API_KEY, updated OPENAI_API_KEY docs |

---

## Deployment Steps — ALL COMPLETED (March 20, 2026)

### 1. Database Migration — DONE
Executed `20260320_vector_embeddings.sql` in Supabase SQL editor. pgvector extension enabled, all tables/indexes/RPC/RLS created.

### 2. Environment Variables — DONE
`OPENAI_API_KEY` was already set in Vercel. `ANTHROPIC_API_KEY` also present.

### 3. Code Deployed — DONE (3 commits)
- `e06c977` — Session 15: AI Experience & Intelligence (main pipeline + all endpoints)
- `09b3df7` — Fix: correct column names (`location_name`, `phenomenon_type_id`)
- `158443d` — Fix: phenomena embedding (`subcategory` column doesn't exist)

### 4. Initial Embedding — DONE (partial phenomena)
- **Reports: ~900 fully embedded** (all approved reports). Confirmed working.
- **Phenomena: ~1,150 of 4,792 embedded**. Remaining ~3,600 were rate-limited by OpenAI (too many parallel batches). To finish, re-run:
```js
var session = JSON.parse(localStorage.getItem('sb-bhkbctdmwnowfmqpksed-auth-token'));
var token = session.access_token;
// Run in batches of 20 (not 96 parallel) to avoid rate limits:
for (var i = 0; i < 4800; i += 50) {
  setTimeout(function(offset) {
    fetch('/api/admin/ai/embed', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'all_phenomena', limit: 50, offset: offset })
    }).then(function(r) { return r.json() }).then(function(d) { console.log('offset=' + offset, d.stats) });
  }.bind(null, i), i * 100); // Staggered by 5 seconds each
}
```
Already-embedded records are automatically skipped (hash-based), so this is safe to re-run.

### 5. Verified — DONE
Semantic search confirmed working:
- Query: "Roswell crash debris" → returned The Roswell Incident report at 66.5% similarity
- Pattern detection API returning valid (empty) results (patterns will populate as more data is embedded)
```

---

## API Contract Summary

| Endpoint | Method | Auth | Rate Limited | Purpose |
|----------|--------|------|-------------|---------|
| `/api/admin/ai/embed` | POST/GET | Required | No | Admin: trigger embedding |
| `/api/ai/search` | POST | Optional | Yes (tier) | Semantic search |
| `/api/ai/chat` | POST | Optional | Yes (tier) | RAG-powered chat |
| `/api/ai/patterns` | GET/POST | No | No | Pattern detection |
| `/api/ai/featured-patterns` | GET | No | No (CDN cached) | Homepage AI preview |
| `/api/ai/related` | GET | No | No (CDN cached) | Search enrichment |
| `/api/ai/report-similar` | GET | No | No (CDN cached) | Per-report similarity |

---

## Cross-Session Dependencies

| What | Affects | Notes |
|------|---------|-------|
| `/api/ai/featured-patterns` | Session 7 Phase 2 | Homepage "AI Intelligence Preview" section |
| `/api/ai/related?query=X` | Session 7 Phase 3 | "Related Patterns" on search results |
| `/api/ai/chat` sources | Session 7 / AskTheUnknown | UI can now render clickable source links from `[slug:x]` |
| `/api/ai/report-similar` | Session 6a/6b | Enhanced similar reports on report detail pages |
| `/api/ai/patterns` | Session 4 (Insights) | Complements existing pattern detection with vector similarity |
| `/api/ai/search` | Session 5 (Dashboard) | Research Hub AI analysis can use semantic search |
| `vector_chunks` table | Session 10 (Ingestion) | New reports must be embedded after insertion |
| `OPENAI_API_KEY` | Vercel config | **MUST be set for semantic features to work** |

---

## What's Next

### Immediate — COMPLETED
- [x] Run the SQL migration in Supabase
- [x] Set `OPENAI_API_KEY` in Vercel environment variables (was already set)
- [x] Run initial embedding of ~900 reports (all done) + ~1,150 phenomena (partial — re-run needed for remaining ~3,600)
- [x] Deploy to Vercel (3 commits auto-deployed)
- [x] Semantic search verified working ("Roswell crash debris" → 66.5% match)

### Immediate — REMAINING
- [ ] **Finish phenomena embedding:** Re-run with staggered batches to avoid OpenAI rate limits (~3,600 remaining)

### AskTheUnknown Citation Parsing — DONE (March 20, 2026)
- [x] `renderMarkdown()` now parses `[slug:some-slug]` citations into clickable `<a href="/report/some-slug">Report Title</a>` links
- [x] Uses `sources` metadata from the RAG API response to resolve real report titles (falls back to slug-to-title formatting)
- [x] RAG-powered responses display a "Sources:" footer below the message with deduplicated clickable links to cited reports/phenomena
- [x] Phenomena sources link to `/phenomena/slug`, reports link to `/report/slug`
- [x] File modified: `src/components/AskTheUnknown.tsx` — added `ChatSource` interface, `slugToTitle()`, updated `renderMarkdown()` signature, added `renderSourcesFooter()`

### Short-term
- [ ] **Incremental embedding hooks:** Add Supabase database webhooks or post-insert triggers to auto-embed new reports and updated phenomena
- [ ] **Session 7 homepage integration:** Wire `/api/ai/featured-patterns` into the homepage hero redesign
- [ ] **Session 7 search integration:** Wire `/api/ai/related` into the search results page

### Mass ingestion (5M+ reports)
- [ ] **Batch embedding pipeline:** Process in chunks of 500 with offset pagination
- [ ] **Embedding cost estimation:** ~900 reports = ~$0.10. 5M reports = ~$500-600 one-time (at text-embedding-3-small pricing)
- [ ] **Consider dimensionality reduction:** Can use 512d instead of 1536d for 3x cost savings at slight quality loss
- [ ] **HNSW index tuning:** May need to increase `ef_construction` and `m` for 5M+ vectors

### Future enhancements
- [ ] **Streaming chat:** Upgrade to streaming responses for better UX
- [ ] **Conversation memory:** Store conversation history in DB for multi-session context
- [ ] **Skeptic/believer mode:** Toggle in system prompt for different analytical perspectives
- [ ] **Image embeddings:** Use CLIP to embed report images for visual similarity search
- [ ] **Real-time pattern detection:** Trigger pattern re-analysis when new reports are added

---

## SWC Compliance Notes

All code follows the project's SWC constraints:
- Uses `var` (not `const`/`let`)
- Uses `function(){}` syntax for callbacks
- Uses string concatenation (not template literals)
- Uses unicode escapes for smart quotes (`\u2014` for em dash)
- No template literals in JSX

---

## Cost Estimates

| Operation | Provider | Model | Est. Cost |
|-----------|----------|-------|-----------|
| Embed 900 reports | OpenAI | text-embedding-3-small | ~$0.10 |
| Embed 4,792 phenomena | OpenAI | text-embedding-3-small | ~$0.50 |
| Embed 5M reports (future) | OpenAI | text-embedding-3-small | ~$500-600 |
| Chat query (RAG) | OpenAI + Anthropic | embedding + Haiku | ~$0.002/query |
| Pattern narrative | Anthropic | Haiku | ~$0.001/pattern |
