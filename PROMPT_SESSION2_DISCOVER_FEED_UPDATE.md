# Session Prompt: Session 2 — Discover Feed (Algorithmic Feed + Depth Gating + New Card Types)

**Session:** Paradocs - Explore & Discovery
**Scope:** Behavioral signal collection, V1 scored ranking, cold start onboarding, session depth optimization, new card types (Clustering, On This Date), depth gating, subscription upsell
**Priority:** CRITICAL LAUNCH PATH — the algorithmic feed is the growth engine
**Handoff doc:** `HANDOFF_EXPLORE.md` (update existing)
**Date:** March 24, 2026 — revised to incorporate Discover Feed Engineering Brief

---

## The Strategic Context

> The difference between reaching 7,000 users and 100,000 users is not marketing — it's whether the Discover feed becomes genuinely algorithmic and addictive. The feed must *create* paranormal enthusiasts, not just serve existing ones. Every week without behavioral data collection is training data permanently lost.

**North star metric: Session Depth** — the average number of cases a user views in a single session. A user who views 1 card and leaves is a bounce. A user who views 7 cases and hits the gate is a near-certain conversion. Every algorithmic decision should be evaluated against: *did this increase average session depth?*

---

## Context — Read These First

- `PROJECT_STATUS.md` (root) — Read **Content & Legal Posture**, **Launch Path**, **Conversion Strategy**, and **Algorithmic Feed Strategy** sections.
- `HANDOFF_EXPLORE.md` — your previous sessions' work. Phase 2 (mixed content feed) + Phase 2.5 (2D horizontal swipe-through) deployed.
- `src/pages/discover.tsx` (~662 lines) — current Discover feed page with 2D swipe-through
- `src/pages/api/discover/feed-v2.ts` — Mixed content feed API (phenomena + reports, seeded shuffle, tiered interleave)
- `src/components/discover/DiscoverCards.tsx` — Three card templates: PhenomenonCard, TextReportCard, MediaReportCard
- `src/pages/api/discover/related-cards.ts` — Related cards for horizontal swipe (the "rabbit hole" mechanic)
- `src/lib/services/personalization.service.ts` — Existing personalization engine
- `src/lib/hooks/usePersonalization.ts` — Existing personalization hook

**What's new since your last session:**
- Session 10 is adding `paradocs_narrative`, `paradocs_assessment`, `event_date_precision`, `source_url` to all reports at ingestion
- Index-with-attribution model: feed cards show `feed_hook` + metadata + source attribution (never raw description)
- Depth gating finalized: 2-3 free case views/day, basic search free / AI search gated, Ask the Unknown 1 free/week
- **NEW: Algorithmic feed strategy** — behavioral signal collection, V1 scored ranking, cold start onboarding, session context weighting

---

## Work Sequence

### Part 1: Behavioral Signal Collection (MUST SHIP AT LAUNCH)

This is the foundation everything else builds on. Every card impression, dwell event, tap, save, and share must be recorded from day one. Without this data, the feed stays random forever and personalization is impossible.

#### 1a. Events Table

Create `supabase/migrations/20260324_feed_events.sql`:

```sql
CREATE TABLE IF NOT EXISTS feed_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text NOT NULL,             -- Client-generated session ID (persists until tab close)
  card_id text NOT NULL,                -- Report ID or phenomenon ID
  card_type text NOT NULL,              -- 'phenomenon', 'report', 'cluster', 'on_this_date', 'promo'
  phenomenon_category text,             -- Category of the content
  event_type text NOT NULL,             -- 'impression', 'dwell', 'tap', 'save', 'share', 'scroll_depth', 'swipe_related'
  duration_ms integer,                  -- For dwell events: how long user paused on card
  scroll_depth_pct integer,             -- For scroll_depth events: 0-100
  metadata jsonb,                       -- Flexible: { source_type, credibility, position_in_feed, etc. }
  created_at timestamptz DEFAULT now()
);

-- Indexes for analytics queries
CREATE INDEX idx_feed_events_user_session ON feed_events (user_id, session_id, created_at DESC);
CREATE INDEX idx_feed_events_card ON feed_events (card_id, event_type, created_at DESC);
CREATE INDEX idx_feed_events_category_type ON feed_events (phenomenon_category, event_type, created_at DESC);
CREATE INDEX idx_feed_events_created ON feed_events (created_at DESC);

-- Partition hint: at scale (10M+ events), partition by created_at month
-- For now, simple table with indexes is fine

-- RLS: users can insert their own events, only admins can read
ALTER TABLE feed_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own events" ON feed_events
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Admins can read all events" ON feed_events
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
```

#### 1b. Event Collection Hook

Create `src/lib/hooks/useFeedEvents.ts`:

```typescript
interface FeedEvent {
  card_id: string;
  card_type: string;
  phenomenon_category: string;
  event_type: 'impression' | 'dwell' | 'tap' | 'save' | 'share' | 'scroll_depth' | 'swipe_related';
  duration_ms?: number;
  scroll_depth_pct?: number;
  metadata?: Record<string, any>;
}

// Returns:
// - trackImpression(cardId, cardType, category) — fire on IntersectionObserver enter
// - trackDwell(cardId, cardType, category, durationMs) — fire on IntersectionObserver exit (time delta)
// - trackTap(cardId, cardType, category) — fire on card tap/click
// - trackSave(cardId, cardType, category) — fire on bookmark action
// - trackShare(cardId, cardType, category) — fire on share action
// - trackScrollDepth(cardId, pct) — fire on report page scroll milestones (25%, 50%, 75%, 100%)
// - trackSwipeRelated(cardId, cardType, category) — fire on horizontal swipe to related card
// - getSessionId() — client-generated, persists in sessionStorage
```

**Implementation details:**
- Generate `session_id` on first feed load, store in `sessionStorage` (persists until tab close, fresh on new visit)
- **Batch writes:** Don't fire individual API calls per event. Collect events in a buffer, flush every 5 seconds or on page unload (`visibilitychange` / `beforeunload`). Use `navigator.sendBeacon()` for unload events to guarantee delivery.
- **Anonymous users:** Still collect events with `user_id = null`. The session_id lets us analyze anonymous behavioral patterns.
- **Dwell time:** Use IntersectionObserver — start timer when card enters viewport (50%+ visible), stop when it exits. Only record if dwell > 500ms (filter scroll-throughs).
- **Impression dedup:** Only fire one impression per card per session (track in a `Set`).

#### 1c. Batch Event API

Create `src/pages/api/events/feed.ts`:

```typescript
// POST — accepts array of events, inserts in batch
// Accepts both authenticated (user_id from session) and anonymous (user_id null) requests
// Rate limit: 100 events per request, 1 request per 3 seconds per session_id
```

#### 1d. Wire Events Into Existing Components

Integrate the event hooks into the existing feed:

- **`discover.tsx`**: Track impressions and dwell on each card (IntersectionObserver already exists for lazy loading — piggyback on it)
- **`DiscoverCards.tsx`**: Track tap on card click handlers
- **`report/[slug].tsx`**: Track scroll_depth at 25/50/75/100% milestones (coordinate with Session 6b)
- **Bookmark/Save actions**: Track save events wherever bookmark UI exists
- **Share actions**: Track share events
- **Horizontal swipe**: Track swipe_related when user swipes to related cards in Phase 2.5

---

### Part 2: V1 Scored Ranking (MUST SHIP AT LAUNCH)

Replace the current seeded random shuffle with a parameterized scored ranking query. V1 can be a SQL query — no ML needed. The requirement is that the scoring formula is parameterized and logged so weights can be tuned as behavioral data accumulates.

#### 2a. Scoring Formula

Each card in the feed gets a score. Higher score = higher position.

```
score = (base_engagement * W_engagement)
      + (recency_boost * W_recency)
      + (user_affinity * W_affinity)
      + (diversity_penalty * W_diversity)
      + (random_explore * W_explore)
```

**Components:**

1. **base_engagement** (0-100): Global engagement rate for this card's category + card type. Computed from `feed_events` table aggregates. Cold start: all categories start at 50 (neutral), then adjust as data accumulates.

2. **recency_boost** (0-50): Reports added in last 7 days get a boost. Decay: `50 * EXP(-0.1 * days_since_created)`. Ensures fresh content surfaces.

3. **user_affinity** (0-100): How much this user likes this category. Initially from onboarding topic picks (Part 3). Over time, computed from user's tap + dwell history: `(taps_in_category / total_taps) * 100`, weighted average with dwell time.

4. **diversity_penalty** (-50 to 0): If the last N cards shown were the same category, penalize the next card of that category. Prevents monotonous feeds. Rule: no more than 3 consecutive cards of the same primary category.

5. **random_explore** (0-30): Small random factor to ensure exploration / serendipity. Prevents the feed from becoming a filter bubble. This is the explore side of the exploit-explore tradeoff.

**Weight configuration:** Store weights in a config table or environment variables so they can be tuned without code changes:

```sql
CREATE TABLE IF NOT EXISTS feed_config (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO feed_config (key, value) VALUES
  ('ranking_weights', '{"engagement": 1.0, "recency": 0.8, "affinity": 1.2, "diversity": 1.0, "explore": 0.3}'),
  ('max_consecutive_same_category', '3'),
  ('recency_boost_days', '7'),
  ('cold_start_base_score', '50');
```

#### 2b. Ranked Feed API

Modify `src/pages/api/discover/feed-v2.ts`:

Replace the seeded shuffle with:

1. Fetch candidate pool (larger than needed — e.g., 100 candidates for 20 results)
2. Score each candidate using the formula
3. Apply diversity constraint (no 3+ consecutive same category)
4. Return top N sorted by score
5. **Log the ranking** — for each feed request, store which cards were served at which positions with which scores. This is essential for tuning.

```typescript
// Pseudocode for ranked feed
var candidates = await fetchCandidatePool(100); // Mix of phenomena + reports
var userAffinity = await getUserAffinity(userId); // From onboarding + behavioral data
var weights = await getFeedConfig('ranking_weights');

var scored = candidates.map(function(card) {
  return {
    card: card,
    score: computeScore(card, userAffinity, weights, recentlyShown)
  };
});

scored.sort(function(a, b) { return b.score - a.score; });
var ranked = applyDiversityConstraint(scored, weights.max_consecutive);
return ranked.slice(0, pageSize);
```

**Important:** For new users with no behavioral data, `user_affinity` comes entirely from onboarding topic picks (Part 3). For anonymous users with no picks, fall back to global engagement rates (pure `base_engagement + recency + explore`).

#### 2c. Engagement Aggregation

Create a materialized view or cron job that computes category-level engagement rates from the events table:

```sql
-- Category engagement rates (refresh hourly or on-demand)
CREATE MATERIALIZED VIEW IF NOT EXISTS category_engagement AS
SELECT
  phenomenon_category,
  count(*) FILTER (WHERE event_type = 'tap') as taps,
  count(*) FILTER (WHERE event_type = 'impression') as impressions,
  CASE WHEN count(*) FILTER (WHERE event_type = 'impression') > 0
    THEN count(*) FILTER (WHERE event_type = 'tap')::numeric /
         count(*) FILTER (WHERE event_type = 'impression')
    ELSE 0 END as tap_rate,
  avg(duration_ms) FILTER (WHERE event_type = 'dwell' AND duration_ms > 500) as avg_dwell_ms,
  count(*) FILTER (WHERE event_type = 'save') as saves,
  count(*) FILTER (WHERE event_type = 'share') as shares
FROM feed_events
WHERE created_at > now() - interval '30 days'
GROUP BY phenomenon_category;

-- Refresh periodically
-- REFRESH MATERIALIZED VIEW CONCURRENTLY category_engagement;
```

Create a cron endpoint `src/pages/api/cron/refresh-engagement.ts` that refreshes this view hourly.

---

### Part 3: Cold Start Onboarding (MUST SHIP AT LAUNCH)

When a new user visits for the first time (no session history, no account, no onboarding completed), their first session gets a curated "best of" set. After they sign up or interact enough, prompt them to pick topics.

#### 3a. Onboarding Topic Selector

Create `src/components/discover/TopicOnboarding.tsx`:

A full-screen or modal overlay shown on first Discover visit (check localStorage for `onboarding_completed`):

```jsx
// "What draws you in?" — pick 3+ topics
// Show the 7 main categories as large, visually distinct tiles:
// - UFOs & UAPs (icon: radar/aircraft)
// - Cryptids & Creatures (icon: footprint)
// - Ghosts & Hauntings (icon: ghost silhouette)
// - Near-Death Experiences (icon: light/tunnel)
// - Psychic Phenomena (icon: eye/brain)
// - Consciousness & Altered States (icon: spiral)
// - Occultism & High Strangeness (icon: sigil/star)
//
// Each tile: category name, icon, brief tagline, tap to select (toggle)
// Minimum 3 selections required
// "Start exploring" button enabled after 3+ selected
// Store selections in localStorage AND user_preferences table (if authenticated)
```

**Design:** Full-screen dark overlay, large tappable tiles (at least 100px height), purple accent on selected tiles, subtle animation on selection. Mobile-first — tiles stack in a 2-column grid.

**Data flow:**
- Selections stored in localStorage (`onboarding_topics: ["ufos_aliens", "ghosts_hauntings", "consciousness_practices"]`)
- If user is authenticated, also POST to `/api/user/personalization` to persist server-side
- The ranked feed API reads these as the initial `user_affinity` values: selected categories get score 80, unselected get 20

#### 3b. Cold Start "Best Of" Set

For the very first feed load before onboarding is completed, serve a curated high-engagement set:

```typescript
// In feed-v2.ts — cold start path
var isColdStart = !userId && !sessionTopics;
if (isColdStart) {
  // Serve a hand-picked "best of" set: mix of categories, all high-quality
  // Pull from a curated list or top-engagement content
  // This is the user's FIRST impression — it must be compelling
  return serveColdStartFeed();
}
```

The cold start set should be:
- 15-20 cards spanning all 7 categories
- Highest-quality content (best feed_hooks, highest credibility, most dramatic cases)
- Manually curated initially, then driven by top global engagement rates as data accumulates
- Refreshed weekly

---

### Part 4: Session Context & Rabbit Hole Deepening

#### 4a. Session Context Tracking

Track in-session category affinity and use it to weight the next batch of cards:

Create `src/lib/hooks/useSessionContext.ts`:

```typescript
interface SessionContext {
  categoryTaps: Record<string, number>;  // { "ufos_aliens": 3, "ndes": 1 }
  totalTaps: number;
  sessionStartedAt: number;
  lastCategory: string | null;
  sessionDepth: number;  // Total case views this session
}

// Returns:
// - context: SessionContext
// - recordTap(category: string): void
// - getSessionAffinity(): Record<string, number> — normalized 0-100 per category
// - getSessionDepth(): number
```

Store in `sessionStorage`. Reset on new tab/visit.

**Feed integration:** When the feed requests more cards (infinite scroll / pagination), pass the session context to the API:

```typescript
// In feed-v2.ts query params
// ?session_affinity=ufos_aliens:60,ndes:30,ghosts:10
// This boosts the user_affinity component for in-session categories
```

The ranking formula should blend long-term affinity (from onboarding + historical behavior) with session affinity (what they're into RIGHT NOW):

```
effective_affinity = (long_term_affinity * 0.4) + (session_affinity * 0.6)
```

Session affinity is weighted higher because it represents *current* interest. A user who's been deep on NDE cases for 8 minutes should see more NDE content, even if their long-term profile says they prefer UFOs.

#### 4b. "You Might Also Find..." Prompt

After a user reads 80%+ of a report page (tracked via scroll_depth events), surface a related content prompt:

In `report/[slug].tsx` (coordinate with Session 6b):

```jsx
// Show after 80%+ scroll depth
{scrollDepth >= 80 && (
  <div className="fixed bottom-20 left-0 right-0 px-4 z-40 animate-slide-up">
    <div className="bg-gray-900/95 backdrop-blur border border-purple-500/20 rounded-xl p-4 max-w-lg mx-auto">
      <p className="text-sm text-gray-400 mb-2">Continue the thread</p>
      <div className="flex items-center gap-3">
        {/* Next related card preview */}
        <div className="flex-1">
          <p className="text-white font-medium text-sm line-clamp-2">{nextRelated.title}</p>
          <p className="text-gray-400 text-xs mt-1">{nextRelated.category} · {nextRelated.location}</p>
        </div>
        <button className="bg-purple-600 text-white px-4 py-2 rounded-full text-sm whitespace-nowrap">
          Read next
        </button>
      </div>
    </div>
  </div>
)}
```

The "next related" card should come from the same rabbit hole thread: same category, same phenomenon type, same geographic region, or same credibility band. Use the existing `related-cards` API.

---

### Part 5: New Card Types

#### 5a. Clustering Cards

Clustering cards are pure metadata synthesis — 100% original content. They aggregate report statistics into compelling editorial cards.

**Examples:**
- "17 NDE reports this week from the Southeast"
- "3 new Bigfoot sightings within 50 miles of the Pacific Crest Trail"
- "12 UFO reports near military bases in the last 30 days"
- "First reported ghost sighting in downtown Portland in 2 years"

**API endpoint:** Create `src/pages/api/discover/clusters.ts`:

```typescript
interface ClusterCard {
  id: string;
  type: 'geographic_cluster' | 'temporal_burst' | 'category_trend' | 'milestone';
  headline: string;
  subheadline: string;
  category: string;
  report_count: number;
  time_range: string;
  location_summary?: string;
  linked_report_ids: string[];
  generated_at: string;
}
```

**Clustering queries:**

```sql
-- Geographic cluster: reports in same state within last 7 days
SELECT state_province, category, count(*) as cnt
FROM reports
WHERE created_at > now() - interval '7 days'
AND status = 'approved' AND state_province IS NOT NULL
GROUP BY state_province, category
HAVING count(*) >= 3
ORDER BY cnt DESC LIMIT 10;

-- Temporal burst: category with unusual volume (50%+ above monthly average)
SELECT category, count(*) as this_week,
  (SELECT count(*) FROM reports WHERE category = r.category
   AND created_at > now() - interval '30 days') / 4.0 as weekly_avg
FROM reports r
WHERE created_at > now() - interval '7 days' AND status = 'approved'
GROUP BY category
HAVING count(*) > (
  SELECT count(*) FROM reports WHERE category = r.category
  AND created_at > now() - interval '30 days'
) / 4.0 * 1.5;
```

**Card component:** Purple gradient, TrendingUp icon, headline + subheadline + stats. Tapping opens a filtered view showing the cluster's reports.

**Feed position:** Inject 1 clustering card every 8-10 regular cards.

#### 5b. On This Date Cards

Historical events matching today's month/day. **Start with phenomena only** (reliable dates from encyclopedia entries), expand to reports after `event_date_precision` quality is verified.

**API endpoint:** Create `src/pages/api/discover/on-this-date.ts`:

```sql
-- Phenomena with historical dates matching today
SELECT id, name, slug, category, ai_summary, first_reported_date,
  EXTRACT(YEAR FROM first_reported_date) as event_year
FROM phenomena
WHERE EXTRACT(MONTH FROM first_reported_date) = EXTRACT(MONTH FROM CURRENT_DATE)
AND EXTRACT(DAY FROM first_reported_date) = EXTRACT(DAY FROM CURRENT_DATE)
AND first_reported_date IS NOT NULL AND ai_summary IS NOT NULL
ORDER BY first_reported_date ASC;
```

**Card component:** Amber/orange gradient (distinct from purple content cards), Calendar icon, large year callout, title + summary + category badge.

**Feed position:** Show 1 On This Date card near the top (position 2-4) if any matches exist. Skip if no matches.

---

### Part 6: Depth Gating Implementation

The conversion engine. Free users get enough to understand value, then hit contextual gates.

#### 6a. Usage Tracking

Create `src/pages/api/user/usage.ts` and `src/lib/hooks/useGateStatus.ts`:

```typescript
interface GateStatus {
  caseViewsToday: number;
  maxFreeViews: number;         // 2-3
  isViewGated: boolean;
  searchesThisMonth: number;
  askTheUnknownThisWeek: number;
  tier: 'free' | 'core' | 'pro' | 'enterprise';
  sessionDepth: number;         // From session context — feeds gate copy
}
```

**Storage:**
- Authenticated users: server-side in `user_usage` table (daily reset for case views, weekly for Ask, monthly for search)
- Anonymous users: localStorage + cookie (easily bypassed — fine for anonymous, they're the conversion target anyway)

#### 6b. Case View Gate

After 2-3 free case views per day, show a contextual gate instead of report content:

**Key gate copy rules:**
- ALWAYS reference the specific report: "This UFO case from Phoenix, AZ" not "Upgrade to see more"
- Include specific numbers: "{N} phenomena and {M} related reports"
- Pitch the full subscription VALUE: "Unlimited case access, full search, and more"
- Show what's behind the gate (blurred Paradocs Analysis preview)
- **Use session depth in the pitch:** "You've explored {sessionDepth} cases this session — you're clearly curious. Core gives you unlimited access."

```jsx
function CaseViewGate({ report, sessionDepth }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6">
      {/* Blurred preview */}
      <div className="w-full max-w-lg mb-8 relative">
        <div className="filter blur-md pointer-events-none">
          <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-500/20">
            <h3 className="text-lg text-white font-semibold">Paradocs Analysis</h3>
            <div className="mt-3 space-y-2">
              <div className="h-4 bg-white/10 rounded w-full" />
              <div className="h-4 bg-white/10 rounded w-5/6" />
              <div className="h-4 bg-white/10 rounded w-4/6" />
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-white text-center mb-3">
        Keep exploring the unknown
      </h2>
      <p className="text-gray-300 text-center mb-6 max-w-md">
        This {report.category} case from {report.location_name || 'an undisclosed location'}
        connects to {linkedCount} phenomena and {connectionCount} related reports.
        Unlock unlimited access to explore every connection.
      </p>

      <div className="w-full max-w-sm space-y-3">
        <button className="w-full bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-full font-medium">
          Start Core — $5.99/mo
        </button>
        <p className="text-xs text-gray-500 text-center">
          Unlimited case access, full search, and more
        </p>
      </div>

      <button className="mt-6 text-sm text-gray-500 hover:text-gray-400">
        Continue browsing (free reports reset tomorrow)
      </button>
    </div>
  );
}
```

#### 6c. Search Gating

- **Basic keyword search:** Always free
- **AI-powered semantic search:** Gated at Core
- **Advanced filters:** Gated at Core

Show inline upgrade prompt when free user attempts gated search features.

#### 6d. Ask the Unknown Gating

- 1 free query per week for free users
- After limit: subscription upsell that pitches full Core value (not just "pay for AI")
- Show next reset date

#### 6e. Research Hub Promo Cards

Inject a Research Hub promo card every 15-20 cards in the feed. Blurred preview of Research Hub UI with subscription CTA. Static promo, not data-driven.

---

### Part 7: Feed Integration & Composition

Update `src/pages/api/discover/feed-v2.ts` to combine everything:

**Feed composition (target ratios after scoring):**
- ~70% regular content cards (phenomena + reports, ranked by score)
- ~10% clustering cards (data-driven metadata synthesis)
- ~5% On This Date cards (1 near top if available)
- ~5% Research Hub promo cards (conversion)
- ~10% horizontal swipe-through related cards (already built)

**Feed item type expansion:**

```typescript
type FeedItemV2 = {
  type: 'phenomenon' | 'report' | 'cluster' | 'on_this_date' | 'promo';
  score?: number;  // Ranking score for logging/debugging
  // ... existing fields
};
```

---

### Part 8: Metrics Dashboard (Admin)

Create `src/pages/api/admin/feed-metrics.ts`:

Track and expose key metrics for tuning:

```typescript
interface FeedMetrics {
  avg_session_depth: number;           // North star
  avg_session_length_minutes: number;
  tap_through_rate_by_category: Record<string, number>;
  tap_through_rate_by_card_type: Record<string, number>;
  avg_dwell_ms_by_category: Record<string, number>;
  save_rate: number;
  share_rate: number;
  gate_hit_rate: number;               // % of sessions that hit the case view gate
  gate_conversion_rate: number;        // % of gate hits that convert
  return_visit_rate_48h: number;       // % of users who return within 48 hours
  session_depth_at_conversion: number; // Average depth when users hit gate and convert
}
```

This is an admin-only endpoint. Drives tuning decisions — if NDE cases have 3x the dwell time but only get 10% of feed slots, increase their base_engagement weight.

---

## Secondary Metrics to Track From Day One

Beyond the north star (session depth), these must be tracked:

- **Free-to-Core conversion rate by traffic source** — podcast vs. Discover vs. organic search
- **Session depth at conversion gate** — what depth triggers upgrades most reliably?
- **Return visit rate within 48 hours** — are users becoming habitual?
- **Category distribution** — which topics drive the longest sessions? Weight those higher.
- **Card type performance** — do Clustering cards or On This Date cards drive more session depth?

---

## Technical Constraints

- **SWC compliance:** Use `var`, `function(){}`, string concat, no template literals in JSX, unicode escapes. ALL frontend code.
- **CSS snap scroll:** Maintain existing snap-x horizontal swipe behavior. New card types work within the same FeedRow/swipe system.
- **No new heavy dependencies:** Use existing Tailwind, lucide-react. No ML libraries.
- **IntersectionObserver pattern:** Piggyback on existing lazy-load observers for impression + dwell tracking.
- **sendBeacon for event delivery:** Use `navigator.sendBeacon()` on page unload for reliable event delivery. Batch events, flush every 5 seconds.
- **Feed ranking must be fast:** The scored query should return in <200ms. Use materialized views for aggregate data, not real-time aggregation on every request.

---

## Files to Create/Modify

**New files:**
- `supabase/migrations/20260324_feed_events.sql` — Events table + feed_config table
- `src/lib/hooks/useFeedEvents.ts` — Event collection hook (impression, dwell, tap, save, share, scroll_depth)
- `src/lib/hooks/useSessionContext.ts` — Session context tracking (category affinity, session depth)
- `src/lib/hooks/useGateStatus.ts` — Gate status hook (usage counts, tier check)
- `src/pages/api/events/feed.ts` — Batch event ingestion API
- `src/pages/api/user/usage.ts` — Usage tracking for gating
- `src/pages/api/discover/clusters.ts` — Clustering cards API
- `src/pages/api/discover/on-this-date.ts` — On This Date cards API
- `src/pages/api/cron/refresh-engagement.ts` — Hourly engagement materialized view refresh
- `src/pages/api/admin/feed-metrics.ts` — Admin metrics dashboard API
- `src/components/discover/TopicOnboarding.tsx` — Cold start topic selector
- `src/components/discover/ClusteringCard.tsx` — Clustering card component
- `src/components/discover/OnThisDateCard.tsx` — On This Date card component
- `src/components/discover/CaseViewGate.tsx` — Full-page gate screen
- `src/components/discover/ResearchHubPromo.tsx` — Feed promo card
- `src/components/discover/YouMightAlsoFind.tsx` — 80% scroll depth related prompt

**Modified files:**
- `src/pages/api/discover/feed-v2.ts` — Replace seeded shuffle with scored ranking, interleave new card types
- `src/pages/discover.tsx` — Wire event tracking, render new card types, integrate gate check, session context
- `src/components/discover/DiscoverCards.tsx` — Add new card type renderers, wire tap tracking
- `src/pages/report/[slug].tsx` — Case view counter increment, scroll depth tracking, "You might also find" prompt (coordinate with Session 6b)
- `src/components/AskTheUnknown.tsx` — Weekly query limit + upsell
- `src/lib/services/personalization.service.ts` — Integrate onboarding topic picks + behavioral affinity
- `HANDOFF_EXPLORE.md` — Update with all new work
- `PROJECT_STATUS.md` — Update Session 2 section

---

## Definition of Done

**Behavioral Foundation (non-negotiable for launch):**
- [ ] `feed_events` table exists with proper indexes and RLS
- [ ] Event collection hook fires on every impression, dwell, tap, save, share, scroll_depth
- [ ] Events batched and flushed every 5s + on page unload via sendBeacon
- [ ] Anonymous + authenticated events both collected
- [ ] Session ID generated and persisted in sessionStorage

**Scored Ranking (non-negotiable for launch):**
- [ ] Feed-v2 API uses scored ranking instead of seeded random shuffle
- [ ] Scoring formula parameterized (weights in feed_config table, tuneable without code changes)
- [ ] Diversity constraint: no 3+ consecutive same-category cards
- [ ] Cold start fallback: curated "best of" set for first-ever visitors
- [ ] Category engagement materialized view refreshed hourly

**Cold Start Onboarding (non-negotiable for launch):**
- [ ] Topic selector shown on first Discover visit ("What draws you in?" — pick 3+)
- [ ] Selections stored in localStorage + user_preferences (if authenticated)
- [ ] Selections feed into user_affinity for ranked feed

**Session Optimization:**
- [ ] Session context tracks in-session category affinity
- [ ] Feed pagination blends long-term + session affinity (60/40 session-weighted)
- [ ] "You might also find..." prompt surfaces after 80%+ scroll depth on report page

**New Card Types:**
- [ ] Clustering cards appear in feed, driven by metadata queries
- [ ] On This Date cards appear near top when historical matches exist
- [ ] New card types work within existing 2D swipe-through system

**Depth Gating:**
- [ ] Case view gate after 2-3 free views/day with dynamic context-specific copy
- [ ] Search gating: basic free, AI search + advanced filters gated at Core
- [ ] Ask the Unknown: 1 free query/week with subscription upsell
- [ ] All gate copy pitches full subscription value, uses session depth in messaging

**Metrics:**
- [ ] Admin feed-metrics endpoint returns session depth, tap rates, dwell times, gate conversion
- [ ] Session depth tracked as north star metric

**Standards:**
- [ ] SWC compliant (no template literals in JSX)
- [ ] Mobile responsive at 375px
- [ ] `HANDOFF_EXPLORE.md` updated
- [ ] `PROJECT_STATUS.md` Session 2 section updated

---

## Engineering Priority Matrix

| Feature | Launch Requirement | Impact If Missing | Deferrable? |
|---------|-------------------|-------------------|-------------|
| Behavioral events table | Must ship at launch | Algorithm never trains — feed stays random forever | **No** |
| Phenomenon taxonomy tagging | Already done (ingestion) | Cards unrankable | Already shipped |
| Cold start onboarding (pick 3) | Must ship at launch | New user first session random — fails to hook | **No** |
| V1 scored ranking query | Must ship at launch | Feed is random only — no personalization | **No** |
| Rabbit hole related rail | Already done (Phase 2.5) | Sessions stay shallow | Already shipped |
| Session context weighting | Must ship at launch | Feed doesn't adapt to in-session behavior | **No** |
| Depth gating | Must ship at launch | No conversion mechanism | **No** |
| Clustering cards | Post-ingestion | Feed less dynamic — ok at small scale | Yes — after mass ingestion |
| On This Date cards | Can ship now (phenomena) | Feed less engaging — minor | Yes — nice to have |
| Emotional tone tagging | V1 post-launch (60 days) | Session continuity weaker — ok at small scale | **Yes** |
| Per-user ML model | V2 (90 days post-launch) | V1 scored query carries load | **Yes** |
| Real-time feed updates | V2 | Batch hourly fine for first 10K users | **Yes** |

---

## Sequencing Recommendation

1. **Part 1 (events table + collection)** — Build first, wire into existing feed. Zero user-facing change, pure instrumentation.
2. **Part 3 (cold start onboarding)** — Build next. Immediately improves new user experience even without scored ranking.
3. **Part 2 (scored ranking)** — Replace random shuffle with scored feed. Uses onboarding data + cold start data initially. As events accumulate, ranking improves automatically.
4. **Part 6 (depth gating)** — Build gating infrastructure. Works with any amount of content.
5. **Part 4 (session context)** — Layer in session weighting + "You might also find". Deepens sessions.
6. **Part 5 (new card types)** — On This Date works now with phenomena. Clustering needs mass ingestion volume.
7. **Part 7-8 (feed composition + metrics)** — Tie everything together, build admin visibility.

---

## Cross-Session Integration

| Session | Dependency |
|---------|-----------|
| Session 10 (Ingestion) | Provides volume for clustering cards, engagement data, `event_date_precision` for On This Date reports. Mass ingestion must complete before clustering cards are meaningful. |
| Session 6b (Report detail) | Case view gate triggers on report page. Scroll depth tracking fires events. "You might also find" prompt renders on report page. Coordinate ownership. |
| Session 8 (Subscription) | All gate CTAs link to subscription checkout. Use placeholder links until Session 8 ships. Gate status hook needs tier check from auth/subscription state. |
| Session 7 (Homepage) | DiscoverPreview unaffected. Could surface top-engagement cards from metrics. |
| Session 15 (AI) | Ask the Unknown gating in AskTheUnknown component. Coordinate weekly limit check. |
| Session 5 (Dashboard) | Research Hub promos drive traffic to Dashboard. Constellation view teaser on related cases. |
