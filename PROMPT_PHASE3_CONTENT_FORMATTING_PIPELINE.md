# Session Prompt: Phase 3 — Content Formatting Pipeline for Ingestion

**Session:** Paradocs - Data Ingestion & Pipeline (Session 10)
**Scope:** Add `feed_hook` field to reports, build AI hook generation into the ingestion pipeline, establish content formatting rules for feed-ready reports
**Priority:** CRITICAL PATH — this MUST be done BEFORE mass ingestion begins. Every report ingested without a feed_hook will need to be re-processed later.
**Depends on:** Nothing — this can run in parallel with Phases 1 and 2

---

## Context

Read these files before starting:
- `PROJECT_STATUS.md` (root) — overall project coordination doc
- `HANDOFF_AI_EXPERIENCE.md` (root) — Session 15's embedding pipeline (similar pattern for AI generation)
- `src/lib/services/embedding.service.ts` — reference for how the embedding pipeline works (batch processing, hash-based skip, rate limiting)
- `src/pages/api/admin/ai/embed.ts` — reference for admin trigger endpoint pattern

**Background:** The Discover feed (Session 2) is being redesigned to show reports as the primary content, displayed in a TikTok-style vertical scroll. Each report card needs a compelling 2-3 sentence "hook" optimized for the feed context — something that creates tension and curiosity, not a dry summary.

The current `reports.summary` field contains factual summaries generated during initial data population. These are fine for detail pages but terrible for feed cards. We need a separate `feed_hook` field that contains AI-generated, engagement-optimized hooks.

**Why this must happen before mass ingestion:** When Session 10 begins mass ingestion of 5M+ reports, every report should get its `feed_hook` generated as part of the ingestion pipeline. Retrofitting 5M reports later is expensive and slow. Building it in now means it happens once, automatically, for every report.

---

## What to Build

### 1. Database Migration: Add `feed_hook` Column

Create `supabase/migrations/20260321_feed_hook.sql`:

```sql
-- Add feed_hook column to reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS feed_hook text;

-- Add index for non-null feed_hooks (for feed queries)
CREATE INDEX IF NOT EXISTS idx_reports_feed_hook_not_null
ON reports (created_at DESC)
WHERE feed_hook IS NOT NULL AND status = 'approved';

-- Add feed_hook_generated_at for tracking
ALTER TABLE reports ADD COLUMN IF NOT EXISTS feed_hook_generated_at timestamptz;
```

### 2. Feed Hook Generation Service

Create `src/lib/services/feed-hook.service.ts`:

**Core function: `generateFeedHook(report)`**

Takes a report's full text content and generates a 2-3 sentence hook optimized for the Discover feed. Uses Claude Haiku (consistent with existing AI provider pattern in the codebase).

**The prompt engineering is critical.** The hook must:
- Create tension or mystery in the first sentence ("In March 1997, thousands of people across Phoenix looked up...")
- Include a specific, concrete detail that makes it feel real (a date, a number of witnesses, a specific location)
- End with an implicit question or unresolved tension that makes the reader want to swipe/tap for more
- Never spoil the full story — it's a trailer, not a summary
- Be 2-3 sentences, roughly 40-80 words
- Use present tense or dramatic past tense for immediacy
- Avoid cliches ("mysterious", "unexplained", "shocking") — use specific, vivid language instead

**System prompt for hook generation:**
```
You are a master storyteller writing hooks for a paranormal investigation feed.
Your job is to take a full report and distill it into 2-3 sentences that create
irresistible curiosity. Think of it as the opening of a documentary trailer.

Rules:
- First sentence: set the scene with a specific detail (date, place, number of witnesses)
- Second sentence: introduce the anomaly or tension
- Third sentence (optional): deepen the mystery or hint at implications
- NEVER use: "mysterious", "unexplained", "shocking", "terrifying", "you won't believe"
- NEVER spoil the resolution or conclusion
- Use present tense for immediacy when possible
- Keep it between 40-80 words
- The reader should feel compelled to tap "Read more"
```

**Input to the prompt:** Concatenate the report's title, summary, description (if available), location, date, category, and credibility. Give the model enough raw material to find the most compelling angle.

**Example outputs (for reference — the AI should generate these, not use them verbatim):**

For a UFO sighting report:
> "On the night of December 26, 1980, two USAF security officers at RAF Woodbridge watched a metallic triangular craft descend into Rendlesham Forest. When they approached on foot, their radios died. The base commander who investigated the next morning found three triangular impressions in the frozen ground — and radiation readings 25 times above background."

For a cryptid report:
> "The fishermen pulled their nets from Lake Champlain at 4 AM, expecting walleye. What surfaced was a carcass they couldn't identify — eight feet long, no eyes, with a skeletal structure that matched no known freshwater species. The local university's biology department refused to examine it."

For a ghost/haunting report:
> "Room 217 of the Stanley Hotel has been vacant since 1911, but the cleaning staff still finds the bed unmade every morning. Three separate security cameras have captured the same thermal anomaly: a human-shaped heat signature sitting at the edge of the bed at exactly 2:47 AM."

### 3. Batch Processing Pipeline

Create `src/pages/api/admin/ai/generate-hooks.ts`:

**Endpoint:** `POST /api/admin/ai/generate-hooks`

```json
// Generate hook for single report
{ "action": "single", "id": "uuid" }

// Generate hooks for all reports missing them
{ "action": "all_missing", "limit": 50, "offset": 0 }

// Force regenerate all hooks
{ "action": "all", "force": true, "limit": 50, "offset": 0 }

// Get stats
{ "action": "stats" }
```

**Processing rules:**
- Skip reports that already have a `feed_hook` (unless `force: true`)
- Process in batches of 10-20 (Claude Haiku rate limits are generous but respect them)
- 200ms delay between individual generations
- 2-second delay between batches
- Log progress: "Generated hook for report {slug} ({n}/{total})"
- Track `feed_hook_generated_at` timestamp
- Return stats: total reports, hooks generated, hooks remaining, errors

**Auth:** Require admin authentication (same pattern as `/api/admin/ai/embed`).

### 4. Integration with Ingestion Pipeline

When Session 10 builds the mass ingestion pipeline, it needs to call `generateFeedHook()` as part of the per-report processing flow. The expected ingestion sequence for each report should be:

```
1. Parse source data
2. Clean and normalize fields
3. Insert into reports table
4. Generate feed_hook (this service)
5. Generate vector embedding (existing embedding.service.ts)
6. Update embedding_sync record
```

To make this easy for Session 10, export a clean function:

```typescript
// In feed-hook.service.ts
export async function generateAndSaveFeedHook(reportId: string): Promise<string | null>
```

This function:
1. Fetches the report from DB
2. Generates the hook via Claude
3. Saves it to the `feed_hook` column
4. Updates `feed_hook_generated_at`
5. Returns the hook text (or null on failure)

Session 10 just calls this function after inserting each report. No need to understand the prompt engineering — it's encapsulated.

### 5. Backfill Existing ~900 Reports

After the service is built and tested, run the batch endpoint to generate hooks for all existing ~900 approved reports. This gives Phases 1 and 2 immediate content to work with.

**Estimated cost:** ~900 reports x ~200 input tokens + ~100 output tokens per hook = ~270K tokens total. At Claude Haiku pricing (~$0.25/M input, $1.25/M output), this is roughly $0.15-0.20 total. Negligible.

### 6. Content Quality Rules (for the hook generation prompt)

These rules should be embedded in the system prompt and enforced:

**DO:**
- Lead with the most specific, unusual detail
- Use real names, dates, and places when available
- Create a "camera movement" feel — zoom in on a moment
- End on an unresolved note (what happened next? what does it mean?)
- Match the tone to the category (clinical for scientific, atmospheric for hauntings, urgent for sightings)

**DON'T:**
- Start with "This report describes..." or "In this account..."
- Use rhetorical questions ("What really happened that night?")
- Include editorial opinions ("This is one of the most compelling cases...")
- Mention the database or platform ("According to Paradocs...")
- Use more than 80 words

**Category-specific tone guidance (include in prompt):**
- `ufos_aliens`: Technical, aviation-flavored language. Reference altitude, speed, radar, military.
- `cryptids`: Nature documentary tone. Reference habitat, physical measurements, eyewitness credibility.
- `ghosts_hauntings`: Gothic atmosphere. Reference architecture, time of day, sensory details (cold spots, sounds).
- `psychic_phenomena`: Clinical but open-minded. Reference controlled conditions, repeatability, subjects.
- `consciousness_practices`: Experiential, first-person-adjacent. Reference altered states, duration, physiological markers.
- Other categories: Adapt tone to subject matter, always leading with specificity.

---

## Technical Constraints

- **SWC compliance:** Use `var` (not const/let), `function(){}` syntax, string concatenation (not template literals), unicode escapes for special chars.
- **AI Provider pattern:** Use the same Claude model selection pattern as the existing codebase. Check `src/pages/api/ai/chat.ts` for the model fallback chain (Haiku 4.5 primary, Haiku 3.5 fallback, GPT-4o-mini emergency fallback).
- **Environment variable:** Uses existing `ANTHROPIC_API_KEY` — no new keys needed.
- **Error handling:** If Claude fails for a specific report, log the error and continue to the next report. Don't let one failure break the batch.
- **Supabase client:** Use service role key for admin operations (same pattern as embedding service).

**Files to create:**
- `supabase/migrations/20260321_feed_hook.sql` — Database migration
- `src/lib/services/feed-hook.service.ts` — Core hook generation service
- `src/pages/api/admin/ai/generate-hooks.ts` — Admin batch endpoint

---

## Definition of Done

- [ ] `feed_hook` and `feed_hook_generated_at` columns exist on reports table
- [ ] `generateFeedHook()` function produces compelling 2-3 sentence hooks
- [ ] Hooks follow all quality rules (specific details, tension, no cliches, 40-80 words)
- [ ] Batch endpoint can process all reports with proper rate limiting
- [ ] `generateAndSaveFeedHook()` exported for Session 10 ingestion pipeline integration
- [ ] Backfill complete: all ~900 existing approved reports have feed_hooks
- [ ] Stats endpoint shows generation progress
- [ ] Error handling: individual failures don't break batch processing
- [ ] Update `PROJECT_STATUS.md` Session 10 section noting feed_hook pipeline is ready
- [ ] Test 10+ generated hooks manually — they should feel like documentary trailers, not database summaries

---

## Cross-Session Integration

| Consumer | How They Use feed_hook |
|----------|----------------------|
| Phase 1 (Session 7) | DiscoverPreview homepage cards — uses `feed_hook` as card copy if available |
| Phase 2 (Session 2) | Discover feed Text Report cards — `feed_hook` is the primary display text |
| Session 10 (Ingestion) | Calls `generateAndSaveFeedHook()` after inserting each new report |
| Session 15 (Embedding) | `feed_hook` gets included in embedding text for better semantic search |

The `feed_hook` field is the connective tissue between the ingestion pipeline, the AI layer, and the frontend feed. Getting it right here makes everything downstream better.
