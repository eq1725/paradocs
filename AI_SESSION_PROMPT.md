# AI Experience & Intelligence Session Prompt

Copy everything below the line into a new Claude session.

---

You are the AI Experience & Intelligence session for Paradocs (beta.discoverparadocs.com).

## First Steps
1. Read `PROJECT_STATUS.md` in its entirety — it is the coordination layer across all sessions
2. Read `HANDOFF_SEARCH_NAV.md` — Session 7 (Search & Nav) has an approved plan that DEPENDS on what you build here. Pay special attention to the "Data Context for AI Session" section and the "Approved UX Audit & Revision Plan v4."
3. Read `HANDOFF_DASHBOARD.md` — the Research Hub and Constellation are the primary surfaces for AI analysis
4. Read `HANDOFF_REPORTS.md` — report page structure, how AI insights currently work, anti-hallucination patterns
5. Create `HANDOFF_AI_EXPERIENCE.md` at the end documenting everything you built

## Your Scope
You own: the RAG pipeline, vector embeddings, semantic search, pattern detection, the conversational AI endpoint, and all AI-powered features across the platform.

## The Paradocs Vision: Why This Session Matters

Paradocs has four product pillars. You are building Pillar 2 — the one that makes everything else valuable:

1. **The Massive Database** — 5M+ reports aggregated from across the web (post-mass-ingestion). Your system needs to be ready to embed and search across all of them.
2. **AI Analysis & Emergent Patterns (YOU OWN THIS)** — RAG architecture embedding reports into vector chunks. Semantic search retrieves relevant context. Cross-referencing surfaces emergent patterns (geographic clusters, temporal correlations, phenomena similarities) that no human could find across millions of reports.
3. **The Research Dashboard** — Case files, Constellation graph, AI analysis. Your endpoints power the AI analysis features here.
4. **The Discover Feed** — TikTok-style casual browsing. AI-ranked content ordering is a future enhancement.

The AI intelligence layer is what makes Paradocs fundamentally different from NUFORC (unstructured dump), MUFON (membership-gated community), or any paranormal site that has ever existed. You are building the system that can say: "Give us any query and our AI will find patterns across millions of reports that no human could."

## Current Data State

**IMPORTANT — read carefully:**

- **~900 approved reports in the `reports` table:** These are legacy test data from an earlier ingestion pass. Use them for developing and testing the pipeline. They will be replaced by mass ingestion (5M+). Do NOT treat these as production-quality content.
- **Curated collections:** Roswell (14 reports, case_group `roswell-1947`) and Rendlesham (6 reports, case_group `rendlesham-1980`). These are real editorial content that persists. They represent the quality bar.
- **Encyclopedia (`phenomena` table, 4,792 entries):** Only the Cryptids category copy is mostly finalized. Other categories are still being enriched by Chase. The AI system MUST see encyclopedia updates — this means incremental re-embedding, not one-time batch.
- **At mass ingestion:** 5M+ filtered reports arrive. The pipeline you build today must scale to handle this without architectural changes — just re-embed the new data.

## What You Need to Build

### P0 — Vector Embedding Pipeline
- Embed existing reports + encyclopedia entries into vector chunks (512–1000 tokens each)
- Each chunk must carry metadata: source table (report vs phenomenon), record ID, category, date, credibility score, location
- Storage: pgvector extension in Supabase (preferred — keeps everything in one DB) OR Pinecone if pgvector has limitations
- **Must support:** (a) initial bulk embed of current data, (b) incremental embed on insert/update, (c) manual re-embed admin endpoint, (d) full re-index for mass ingestion events
- Admin endpoint: `POST /api/admin/ai/embed` — trigger embedding for specific records or full re-index

### P1 — Semantic Search API
- `POST /api/ai/search` — takes a natural language query, embeds it, finds top 5–20 most similar chunks
- Return: matched chunks with relevance scores, source metadata, and the original text
- This is the foundation for both the conversational AI and the pattern detection
- Should work alongside (not replace) the existing fulltext search at `/api/search/fulltext`

### P2 — Pattern Detection
- Geographic clustering: "X reports within Y miles describe similar phenomena"
- Temporal correlation: "Spike in [category] reports during [date range] in [region]"
- Phenomena similarity: "Reports from different decades/locations describing the same physical characteristics"
- API: `GET /api/ai/patterns?category=X` or `POST /api/ai/patterns` with query parameters
- These patterns need to be surfaceable on: (a) search results pages, (b) individual report pages, (c) the homepage as a preview, (d) the Research Hub

### P3 — Conversational AI Endpoint (RAG-powered)
- `POST /api/ai/chat` — user submits a question, system embeds the query, retrieves top relevant chunks, injects them into LLM context, returns a grounded response
- Must cite sources: every claim should reference specific report IDs/slugs so the UI can link to them
- Anti-hallucination: if no relevant chunks are found, say so — don't fabricate
- Context window management: system prompt + retrieved chunks + conversation history must fit within token limits
- The existing "Ask the Unknown" floating chat button (`AskTheUnknown` component) can be upgraded to use this endpoint

### P4 — Integration Points (APIs that Session 7 and other sessions will consume)
Session 7 Phase 2 needs these endpoints to surface AI on the homepage and search:

- **Homepage AI preview:** An endpoint that returns 2-3 interesting pattern discoveries for display (e.g., "47 reports describe triangular objects over military bases in the 1980s"). Something like `GET /api/ai/featured-patterns`
- **Search enrichment:** When a user searches, return related patterns alongside fulltext results. Could be a field on the semantic search response or a separate `GET /api/ai/related?query=X` endpoint
- **Report page insights:** Per-report AI analysis (similar reports, pattern membership, anomaly detection). May already partially exist at `/api/report-insights` — check and extend

## Technical Constraints
- Next.js 14 Pages Router (NOT App Router)
- Supabase with RLS (pgvector extension available)
- Vercel deployment (auto-deploy on push to main)
- SWC compatibility: use `var` + string concat (no template literals in JSX), use `function(){}`, unicode escapes for smart quotes
- Code pushes via GitHub API (no git CLI in sandbox)
- OpenAI API key may be needed — check `.env.local` and `.env.example` for existing keys. If none, note it as a blocker.
- Existing AI code: check `src/lib/services/` for any existing AI service files, `src/pages/api/ai/` for existing endpoints, and the `AskTheUnknown` component

## Subscription Tier Context
- Free: Basic search, limited AI (maybe 5 queries/day)
- Core ($5.99): Full search, moderate AI access
- Pro ($14.99): Unlimited AI, pattern detection, Research Hub AI analysis, data export
- Enterprise ($99): API access, multi-seat, bulk analysis

## Cross-Session Coordination Rules
1. If you create new API endpoints, document them in your handoff
2. If you modify the database schema (new tables, columns, indexes), document the SQL migrations
3. Session 7 Phase 2 is BLOCKED on your output — the homepage hero redesign, AI preview section, and search intelligence features all need your APIs
4. Session 5 (Dashboard) may consume your endpoints for Research Hub AI analysis
5. The existing `report-insights.service.ts` uses hash-based caching and DB-grounded Similar Cases — extend this pattern, don't replace it

## On Completion
1. Create `HANDOFF_AI_EXPERIENCE.md` documenting everything you built, API contracts, and what's next
2. Update your section in `PROJECT_STATUS.md`
3. Add entries to the Cross-Feature Notes table
4. Note any SQL migrations that need to be run in Supabase
5. Note any new environment variables needed in Vercel

Start by auditing the existing AI infrastructure (services, endpoints, components). Then propose an architecture before writing code.
