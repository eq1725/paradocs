# Session Prompt: Session 10 — Data Ingestion & Pipeline (REVISED)

**Session:** Paradocs - Data Ingestion & Pipeline
**Scope:** Data cleanup, Paradocs Analysis generation, source adapter finalization, mass ingestion run, post-ingestion verification
**Priority:** CRITICAL LAUNCH PATH — this session produces the content that makes the product viable
**Handoff doc:** `HANDOFF_INGESTION.md` (update existing)
**Revision date:** March 23, 2026 — updated for index-with-attribution model + Paradocs Analysis

---

## Context — Read These First

- `PROJECT_STATUS.md` (root) — overall coordination. Read the **Content & Legal Posture** section carefully. The product operates as an **index with attribution**, not a republisher.
- `HANDOFF_INGESTION.md` (root) — your previous session's work. Feed hook service, 4 new adapters (Reddit v2, YouTube, News, Erowid), engine integration.
- `src/lib/ingestion/engine.ts` (~430 lines) — the existing ingestion engine. Feed hook + embedding already integrated post-insert.
- `src/lib/ingestion/types.ts` — ScrapedReport interface, DataSource, IngestionJob types
- `src/lib/ingestion/adapters/` — 12 adapters: NUFORC, BFRO, Reddit, Reddit v2, NDERF, IANDS, Ghosts of America, Shadowlands, Wikipedia, YouTube, News, Erowid
- `src/lib/ingestion/filters/` — quality-filter.ts, quality-scorer.ts, title-improver.ts
- `src/lib/services/feed-hook.service.ts` — Feed hook generation (Claude Haiku). Already built.
- `src/lib/services/report-insights.service.ts` — Existing AI analysis service (Claude Sonnet, on-demand). Reference for analysis patterns — but we're replacing this approach with pre-generated Haiku analysis.
- `src/lib/services/embedding.service.ts` — Embedding service (OpenAI text-embedding-3-small, 1536d)
- `src/pages/api/admin/ingest.ts` — admin trigger endpoint
- `src/pages/phenomena/[slug].tsx` — Contains the "Paradocs Analysis" box styling you should match for the report page (Session 6b handles display, but your fields must support it)

**Current state:** The pipeline is built and tested. Engine handles: source adapter → scrape → quality filter → dedup → title improvement (AI) → slug generation → phenomena linking → feed_hook generation → embedding → insert/update. Feed hook service and 4 new adapters built by previous session. ~900 test reports + ~2M Reddit dev data exist and must be DELETED.

---

## CRITICAL: Index-With-Attribution Model

**This fundamentally changes what the pipeline outputs.** Every report the pipeline produces must conform to:

1. **Metadata card** — title, category, location, date, credibility, `feed_hook` (AI-generated editorial hook), source attribution label + URL
2. **Paradocs Analysis** — `paradocs_narrative` (2-4 paragraph original contextual analysis) + `paradocs_assessment` (JSON: credibility score, mundane explanations, content type)
3. **Vector embedding** — for semantic search and AI features
4. **Raw description stored but NEVER displayed** — the `description` field stays in DB for AI processing only. It is never rendered to users anywhere in the application.
5. **Source URL required** — every adapter must output a `source_url` linking back to the original content. This is legally required.

---

## Work Sequence (Priority Order)

### Step 1: Data Cleanup — CLEAN SLATE

Before building anything new, delete ALL test data. We start fresh.

**1a. Delete ~2M hidden Reddit dev data**

```sql
-- Count first
SELECT status, count(*) FROM reports WHERE source_type = 'reddit' GROUP BY status;

-- Delete associated data (foreign keys)
DELETE FROM report_phenomena WHERE report_id IN (
  SELECT id FROM reports WHERE source_type = 'reddit' AND status != 'approved'
);
DELETE FROM report_media WHERE report_id IN (
  SELECT id FROM reports WHERE source_type = 'reddit' AND status != 'approved'
);
DELETE FROM vector_chunks WHERE source_id IN (
  SELECT id FROM reports WHERE source_type = 'reddit' AND status != 'approved'
) AND source_table = 'report';

-- Delete the reports
DELETE FROM reports WHERE source_type = 'reddit' AND status != 'approved';
```

**1b. Delete ~900 test reports (EXCEPT 20 curated)**

The ~900 approved test reports are test data and must be deleted. The ONLY reports to preserve are the 20 hand-crafted curated reports (Roswell 14 + Rendlesham 6).

```sql
-- Identify curated reports to KEEP (they have source_type = 'curated' or are in known case clusters)
-- Verify: these are the Roswell and Rendlesham editorial reports
SELECT id, title, source_type FROM reports
WHERE status = 'approved'
AND (source_type = 'curated' OR source_type = 'editorial')
ORDER BY title;

-- Delete ALL other approved test reports and their associated data
-- First identify what we're deleting
SELECT source_type, count(*) FROM reports
WHERE status = 'approved'
AND source_type NOT IN ('curated', 'editorial')
GROUP BY source_type;

-- Delete associated data
DELETE FROM report_phenomena WHERE report_id IN (
  SELECT id FROM reports WHERE status = 'approved'
  AND source_type NOT IN ('curated', 'editorial')
);
DELETE FROM report_media WHERE report_id IN (
  SELECT id FROM reports WHERE status = 'approved'
  AND source_type NOT IN ('curated', 'editorial')
);
DELETE FROM vector_chunks WHERE source_id IN (
  SELECT id FROM reports WHERE status = 'approved'
  AND source_type NOT IN ('curated', 'editorial')
) AND source_table = 'report';
DELETE FROM report_insights WHERE report_id IN (
  SELECT id FROM reports WHERE status = 'approved'
  AND source_type NOT IN ('curated', 'editorial')
);

-- Delete the test reports
DELETE FROM reports
WHERE status = 'approved'
AND source_type NOT IN ('curated', 'editorial');
```

**IMPORTANT:** Triple-check the curated reports (Roswell + Rendlesham) are preserved. Count before and after. The DB should have exactly 20 reports after cleanup (the curated ones).

**1c. Clean up ingestion_logs and data_sources**

Reset error counts, last_synced_at, etc. on data_sources so we start fresh metrics for mass ingestion.

---

### Step 2: Database Migration — New Fields

Create `supabase/migrations/20260323_paradocs_analysis.sql`:

```sql
-- Paradocs Analysis fields (pre-generated at ingestion)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS paradocs_narrative text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS paradocs_assessment jsonb;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS paradocs_analysis_generated_at timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS paradocs_analysis_model text;

-- Event date precision tracking
ALTER TABLE reports ADD COLUMN IF NOT EXISTS event_date_precision text
  CHECK (event_date_precision IN ('exact', 'month', 'year', 'decade', 'estimated', 'unknown'));

-- Source URL audit field (ensure every report links back)
-- source_url may already exist on some reports; ensure the column exists
ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_url text;

-- Index for reports with Paradocs Analysis
CREATE INDEX IF NOT EXISTS idx_reports_paradocs_analysis
ON reports (created_at DESC)
WHERE paradocs_narrative IS NOT NULL AND status = 'approved';

-- Index for event date precision (for On This Date feature)
CREATE INDEX IF NOT EXISTS idx_reports_event_date_precision
ON reports (event_date, event_date_precision)
WHERE event_date IS NOT NULL AND event_date_precision IN ('exact', 'month');

-- Emotional tone (OPTIONAL — for future algorithmic feed ranking)
-- Session 2 will use this for session continuity. Deferrable to 60 days post-launch.
-- If you have capacity, generate at ingestion via Haiku alongside paradocs_assessment.
-- If not, skip — Session 2 can add this later.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS emotional_tone text
  CHECK (emotional_tone IN ('frightening', 'awe_inspiring', 'ambiguous', 'clinical', 'unsettling', 'hopeful'));
```

Also ensure the feed_hook migration from your previous session has been applied:

```sql
ALTER TABLE reports ADD COLUMN IF NOT EXISTS feed_hook text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS feed_hook_generated_at timestamptz;
```

---

### Step 3: Paradocs Analysis Generation Service

This is the most important new work in this session. Create `src/lib/services/paradocs-analysis.service.ts`.

**What it produces per report:**

1. `paradocs_narrative` (text) — 1-4 paragraph original contextual analysis. This is NOT a summary of the report. It's Paradocs's editorial voice providing context, historical parallels, pattern connections, and significance.

2. `paradocs_assessment` (JSON) — structured analysis:
```typescript
interface ParadocsAssessment {
  credibility_score: number;  // 0-100
  credibility_reasoning: string;
  credibility_factors: Array<{
    name: string;
    impact: 'positive' | 'negative' | 'neutral';
    description: string;
  }>;
  mundane_explanations: Array<{
    explanation: string;
    likelihood: 'high' | 'medium' | 'low';
    reasoning: string;
  }>;
  content_type: {
    suggested_type: 'experiencer_report' | 'historical_case' | 'news_discussion' | 'research_analysis';
    is_first_hand_account: boolean;
    confidence: 'high' | 'medium' | 'low';
  };
  similar_phenomena: string[];  // Names of related phenomena from our taxonomy
  emotional_tone?: 'frightening' | 'awe_inspiring' | 'ambiguous' | 'clinical' | 'unsettling' | 'hopeful';  // OPTIONAL — for feed ranking session continuity
}
```

**Model: Claude Haiku** (claude-haiku-4-5-20251001 or latest available). NOT Sonnet — cost matters at scale.

**System prompt for narrative generation:**

```
You are an editorial analyst for Paradocs, a comprehensive paranormal phenomena database.
Your job is to write original contextual analysis for individual reports. You are Paradocs's
editorial voice — authoritative, balanced, deeply knowledgeable, and genuinely curious.

Your analysis should:
- Place the report in broader context (historical parallels, geographic patterns, similar accounts)
- Note what makes this particular account notable or typical
- Reference relevant phenomena categories and known patterns
- Maintain intellectual rigor while taking the subject matter seriously
- NEVER reproduce or closely paraphrase the source text
- NEVER start with "This report..." or "The witness describes..."
- Write as if you're a documentary narrator, not a summarizer

Length rules (STRICT — based on source content length):
- Source under 50 words: 1 paragraph (3-5 sentences)
- Source 50-200 words: 2 paragraphs
- Source 200-500 words: 3 paragraphs
- Source 500+ words: 3-4 paragraphs (maximum)
- NEVER exceed the length of the source material

Category tone:
- UFOs/UAPs: Technical, measured. Reference flight characteristics, radar data, official responses.
- Cryptids: Natural history framing. Reference habitat, behavioral patterns, witness credibility indicators.
- Ghosts/Hauntings: Atmospheric, investigative. Reference property history, recurring patterns, environmental factors.
- NDEs/Consciousness: Clinical yet empathetic. Reference common NDE elements, neurological research, cross-cultural parallels.
- Psychic phenomena: Empirical framing. Reference experimental protocols, statistical anomalies, replication.
```

**Input to the model:** Concatenate: title, summary, description (raw text — this is the only place it's used as AI input), category, location, date, credibility, source_type, any tags. Give the model maximum context.

**The assessment prompt** can be a second call or combined (test both approaches for cost/quality). The assessment is structured JSON, so use a separate focused prompt:

```
Analyze this paranormal report and provide a structured assessment.
Return valid JSON only, no markdown.

{
  "credibility_score": <0-100>,
  "credibility_reasoning": "<1-2 sentences>",
  "credibility_factors": [{"name": "...", "impact": "positive|negative|neutral", "description": "..."}],
  "mundane_explanations": [{"explanation": "...", "likelihood": "high|medium|low", "reasoning": "..."}],
  "content_type": {"suggested_type": "experiencer_report|historical_case|news_discussion|research_analysis", "is_first_hand_account": true|false, "confidence": "high|medium|low"},
  "similar_phenomena": ["phenomenon name 1", "phenomenon name 2"]
}
```

**Cost optimization strategies:**
- Combine narrative + assessment into a SINGLE API call where possible (reduces per-call overhead)
- Use Haiku's lower cost tier (~$0.25 input / $1.25 output per 1M tokens)
- Batch processing: 10-20 per batch with 200ms between calls, 2s between batches
- Skip reports that already have `paradocs_narrative` unless `force: true`
- Target cost: ~$0.75-1.00 per 1,000 reports for both fields combined

**Export functions:**

```typescript
export async function generateParadocsAnalysis(reportId: string): Promise<{
  narrative: string;
  assessment: ParadocsAssessment;
} | null>

export async function generateAndSaveParadocsAnalysis(reportId: string): Promise<boolean>
```

**3b. Batch admin endpoint**

Create `src/pages/api/admin/ai/generate-analysis.ts`:

Actions: `single` (one report by ID), `all_missing` (batch process reports without analysis), `all` (force regen), `stats` (counts).

Rate limiting: 10-20 per batch, 200ms between individual calls, 2s between batches. Track `paradocs_analysis_generated_at` and `paradocs_analysis_model`.

---

### Step 4: Source URL Audit Across All Adapters

**Every adapter MUST set `source_url` on ScrapedReport.** This is legally required for the index-with-attribution model. Audit all 12 adapters:

| Adapter | Expected source_url format | Action needed |
|---------|---------------------------|---------------|
| NUFORC | `https://nuforc.org/webreports/reports/{id}.html` | Verify |
| BFRO | `https://www.bfro.net/GDB/show_report.asp?id={id}` | Verify |
| Reddit v2 | `https://reddit.com/r/{sub}/comments/{id}` | Verify |
| NDERF | `https://www.nderf.org/Experiences/{id}.html` | Verify |
| IANDS | Link to IANDS page | Verify |
| Ghosts of America | Page URL | Verify |
| Shadowlands | Page URL | Verify |
| Wikipedia | `https://en.wikipedia.org/wiki/{article}` | Verify |
| YouTube | `https://youtube.com/watch?v={videoId}` | Verify |
| News | Original article URL | Verify |
| Erowid | `https://erowid.org/experiences/exp.php?ID={id}` | Verify |
| Reddit (legacy) | Reddit permalink | Verify |

For any adapter missing `source_url`, add it. Also ensure each adapter sets `source_label` (display name like "r/Paranormal", "BFRO Database", "NUFORC Sighting #12345").

Also update `ScrapedReport` in `types.ts` to make `source_url` required (not optional):

```typescript
// Change from:
source_url?: string;
// To:
source_url: string;  // REQUIRED — index model needs attribution link
```

---

### Step 5: Event Date Precision

Add `event_date_precision` extraction to each adapter. This enables the On This Date feature (Session 2) to only show reports with reliable dates.

Logic per adapter:
- **NUFORC**: Usually has exact dates → `'exact'`
- **BFRO**: Usually has month/year → `'month'` or `'exact'`
- **Reddit**: Varies — parse from post text. If only "last year" or "when I was a kid" → `'estimated'`. If no date context → `'unknown'`
- **YouTube**: Video upload date ≠ event date. If transcript mentions specific date → extract. Otherwise → `'unknown'`
- **News**: Article date is usually close to event → `'exact'` or `'month'`
- **NDEs (NDERF/IANDS)**: Sometimes has event date → extract if available, otherwise `'unknown'`
- **Wikipedia**: Historical events usually have exact dates → `'exact'`
- **Others**: Best effort extraction

Add to `ScrapedReport` interface:
```typescript
event_date_precision?: 'exact' | 'month' | 'year' | 'decade' | 'estimated' | 'unknown';
```

This doesn't need to be perfect — it's metadata enrichment. Default to `'unknown'` when unclear.

---

### Step 6: Integrate Paradocs Analysis into Ingestion Engine

Modify `src/lib/ingestion/engine.ts` — in the `runIngestion()` function, the post-insert flow should now be:

1. **Feed hook generation** (already integrated)
2. **Paradocs Analysis generation** (NEW — add after feed_hook)
3. **Vector embedding** (already integrated)

```typescript
// After feed_hook generation...

// Generate Paradocs Analysis (narrative + assessment)
try {
  await generateAndSaveParadocsAnalysis(insertedReport.id);
} catch (analysisError) {
  console.log('[Ingestion] Paradocs Analysis generation failed for ' + slug + ', continuing...');
  // Non-fatal — batch backfill catches gaps
}

// Then embedding (already exists)...
```

**IMPORTANT:** Like feed_hook, this is non-blocking. If it fails for a report, log and continue. The batch admin endpoint catches stragglers.

Also add Paradocs Analysis generation to the UPDATE path (when re-ingesting), but only if the report doesn't already have `paradocs_narrative`.

**Pipeline cost summary per report (all AI steps):**
- Title improvement (Haiku): ~$0.10 per 1K
- Feed hook (Haiku): ~$0.15-0.20 per 1K
- Paradocs Analysis — narrative + assessment (Haiku): ~$0.50-0.60 per 1K
- Vector embedding (OpenAI): ~$0.10 per 1K
- **Total: ~$0.85-1.00 per 1K reports, ~$850-1,000 per 1M**

---

### Step 7: Mass Ingestion Run

Once Steps 1-6 are complete, execute mass ingestion. Target: 1M+ reports for closed beta.

**Pre-flight checklist:**
- [ ] DB is clean (only 20 curated reports remain)
- [ ] Migration applied (paradocs_narrative, paradocs_assessment, event_date_precision, source_url columns exist)
- [ ] Feed hook service tested (5+ hooks reviewed for quality)
- [ ] Paradocs Analysis service tested (5+ narratives reviewed — are they original, proportional, NOT summaries?)
- [ ] All adapters have source_url output verified
- [ ] Environment variables set: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `YOUTUBE_API_KEY` (if using YouTube adapter), `NEWS_API_KEY` (if using News adapter)

**Execution plan:**
1. Run each adapter with `limit: 50` — verify quality, check source_url, review Paradocs Analysis output
2. Run each adapter with `limit: 500` — check dedup, phenomena linking, feed_hook + analysis generation
3. Full runs per adapter — no limit
4. Monitor `ingestion_logs` for errors, rejected counts, quality distribution
5. Spot-check 20-30 random reports from each source:
   - Does `source_url` link to the real source? Can you click it?
   - Is `paradocs_narrative` original analysis (NOT a summary or paraphrase)?
   - Is `paradocs_narrative` length-proportional to the source?
   - Is `paradocs_assessment` valid JSON with reasonable credibility scores?
   - Is `feed_hook` compelling and cliche-free?
   - Is the raw `description` stored but distinct from `paradocs_narrative`?

**Expected volume by source:**
- Reddit (Arctic Shift): 500K-1M+
- NUFORC: 150K+
- YouTube: 50K-100K (channel transcripts)
- Ghosts of America: 10K-20K
- BFRO: 5K-10K
- NDERF/IANDS: 5K-10K
- News: 20K-50K
- Erowid: 5K-20K
- Shadowlands: 5K-10K
- Wikipedia: 1K-5K (curated phenomena events)

**Rate limiting and politeness:**
- Respect robots.txt for all sources
- 1-2 second delay between requests to external sites
- Use caching to avoid re-fetching during reruns
- Set appropriate User-Agent headers

---

### Step 8: Post-Ingestion Verification

After mass ingestion completes:

**8a. Stats dashboard query:**
```sql
SELECT
  source_type,
  count(*) as total,
  count(feed_hook) as has_hook,
  count(paradocs_narrative) as has_analysis,
  count(paradocs_assessment) as has_assessment,
  count(source_url) as has_source_url,
  count(event_date) as has_event_date,
  count(CASE WHEN event_date_precision IN ('exact','month') THEN 1 END) as reliable_dates,
  count(CASE WHEN id IN (SELECT source_id FROM vector_chunks WHERE source_table = 'report') THEN 1 END) as embedded
FROM reports
WHERE status = 'approved'
GROUP BY source_type
ORDER BY total DESC;
```

**8b. Coverage targets:**
- Feed hook coverage: 95%+ of approved reports
- Paradocs Analysis coverage: 95%+ of approved reports
- Source URL coverage: 100% (REQUIRED — any gaps must be fixed)
- Embedding coverage: 80%+ (can batch-fill remaining)
- Event date presence: varies by source (NUFORC ~95%, Reddit ~30%)

**8c. Quality audit:**
Sample 10 reports from each source, check:
- Paradocs narrative is original (not a rewrite/summary of source text)
- Narrative length is proportional to source length
- Assessment credibility scores are reasonable (not all 50s or all 90s)
- Source URL actually works (returns 200)
- Feed hook creates curiosity without cliches

**8d. Gap filling:**
Run batch endpoints to fill any gaps:
- `/api/admin/ai/generate-hooks` with `action: all_missing`
- `/api/admin/ai/generate-analysis` with `action: all_missing`
- Embedding batch endpoint for un-embedded reports

---

## Technical Constraints

- **SWC compliance for any frontend-touching code:** Use `var`, `function(){}`, string concat, no template literals in JSX. Backend/API/service code (Node.js server-side) can use modern syntax.
- **AI Provider pattern:** Check `src/pages/api/ai/chat.ts` for the model fallback chain. Follow the same pattern for Paradocs Analysis generation.
- **Environment variables:** Uses existing `ANTHROPIC_API_KEY` (Claude Haiku for hooks + analysis) and `OPENAI_API_KEY` (embeddings). May need `YOUTUBE_API_KEY` and `NEWS_API_KEY` for those adapters.
- **Supabase client:** Use service role key for all admin/ingestion operations (`getSupabaseAdmin()`).
- **Error handling:** Individual report failures must never break the batch. Log and continue. Pipeline must be resumable — dedup by `original_report_id + source_type` handles re-runs.

---

## Files to Create/Modify

**New files:**
- `supabase/migrations/20260323_paradocs_analysis.sql` — DB migration for new fields
- `src/lib/services/paradocs-analysis.service.ts` — Paradocs Analysis generation service (Haiku)
- `src/pages/api/admin/ai/generate-analysis.ts` — Batch analysis generation endpoint

**Modified files:**
- `src/lib/ingestion/engine.ts` — Add Paradocs Analysis call post-insert (after feed_hook, before embedding)
- `src/lib/ingestion/types.ts` — Make `source_url` required, add `event_date_precision`
- `src/lib/ingestion/adapters/*.ts` — Audit/add `source_url` and `event_date_precision` to all 12 adapters
- `HANDOFF_INGESTION.md` — Update with all new work
- `PROJECT_STATUS.md` — Update Session 10 section with progress

**Reference (do NOT modify, but read for patterns):**
- `src/lib/services/report-insights.service.ts` — Existing on-demand analysis (Claude Sonnet). Your Paradocs Analysis service replaces this approach at ingestion time with Haiku. The `report_insights` table and on-demand generation will be deprecated after migration.
- `src/lib/services/feed-hook.service.ts` — Your feed hook service. Follow same patterns for the analysis service.

---

## Definition of Done

- [ ] ~2M hidden Reddit dev data deleted
- [ ] ~900 test reports deleted (20 curated preserved)
- [ ] Database migration applied: `paradocs_narrative`, `paradocs_assessment`, `paradocs_analysis_generated_at`, `paradocs_analysis_model`, `event_date_precision`, `source_url` columns exist
- [ ] Paradocs Analysis service built (Claude Haiku, ~$0.50-0.60 per 1K reports)
- [ ] Paradocs Analysis integrated into ingestion engine (auto-generates on insert)
- [ ] All 12 adapters output `source_url` (verified, clickable links)
- [ ] All 12 adapters output `event_date_precision` where determinable
- [ ] `source_url` is required in ScrapedReport type
- [ ] Mass ingestion run complete: 1M+ approved reports in database
- [ ] Quality audit passed: narratives are original (not summaries), length-proportional, source URLs work
- [ ] Feed hook coverage: 95%+
- [ ] Paradocs Analysis coverage: 95%+
- [ ] Source URL coverage: 100%
- [ ] Embedding coverage: 80%+ (remainder can batch-fill)
- [ ] Batch admin endpoints functional for gap-filling
- [ ] `HANDOFF_INGESTION.md` updated with complete documentation
- [ ] `PROJECT_STATUS.md` Session 10 section updated

---

## Cross-Session Integration

| Session | How Ingestion Affects It |
|---------|------------------------|
| Session 2 (Discover feed) | feed-v2 API uses `feed_hook` for card copy. More reports = better feed. New card types (Clustering, On This Date) depend on volume + `event_date_precision`. |
| Session 6b (Report detail page) | Reads `paradocs_narrative` and `paradocs_assessment` to render the Paradocs Analysis box. Reads `source_url` for attribution link. NEVER renders raw `description`. |
| Session 7 (Homepage) | DiscoverPreview cards use `feed_hook` (already wired). |
| Session 8 (Subscription) | Depth gating depends on having enough content to gate meaningfully. |
| Session 15 (AI/Embedding) | New reports embedded for semantic search + Ask the Unknown. |
| Session 3 (Map) | More geolocated reports = richer map. `event_date_precision` enables temporal filtering. |

The ingestion pipeline is the engine that fills every downstream feature with content. The Paradocs Analysis layer is what makes this an index (original analysis) rather than a republisher (scraped content). Both must be right before mass ingestion runs.
