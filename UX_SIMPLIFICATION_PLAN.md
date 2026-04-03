# Paradocs — UX Simplification & Social Layer Plan

**Date:** April 1, 2026
**Author:** PM Session (Chase + Claude)
**Status:** Discussion Draft

---

## The Problem

Paradocs currently has 30+ routes, a 12-item mobile overflow menu, and a 10-page dashboard hierarchy. A new user on mobile (80% of traffic) encounters two separate navigation systems, a junk-drawer "More" sheet, and no clear path from browsing to contributing. Adding a social/community layer on top of this existing complexity would break the product.

The fix isn't to bolt on more features — it's to collapse the architecture so radically that the social layer feels like a natural extension of what's already there, not a new section to discover.

---

## The Simplified Architecture

### Design Principle: Four Verbs

Every screen in the app maps to one of four user actions:

1. **Browse** — consume content (reports, hypotheses, patterns)
2. **Explore** — search spatially, categorically, or by keyword
3. **Build** — save, organize, analyze, hypothesize
4. **Connect** — publish, corroborate, compare, discuss

### Mobile Bottom Nav: 4 Tabs (No FAB)

```
┌──────────────────────────────────────────┐
│   Feed      Explore      Lab      Profile │
│    🔥         🧭         🔭        👤     │
└──────────────────────────────────────────┘
```

| Tab | Icon | What it is | What it absorbs |
|-----|------|------------|-----------------|
| **Feed** | Flame | The primary experience. Swipeable cards — reports AND community hypotheses interleaved | `/discover`, homepage scroll, `/insights` pattern alerts |
| **Explore** | Compass | Map + Search + Category Browse. Three modes, one page | `/explore`, `/map`, `/search`, `/phenomena`, `/analytics` |
| **Lab** | Telescope | Everything personal. Your saves, case files, constellation, AI-suggested hypotheses — one page, tabbed sections. Submit report option lives here too. | All 10 `/dashboard/*` routes + `/submit` |
| **Profile** | Avatar | Your public researcher profile + settings + subscription | `/dashboard/settings`, `/dashboard/subscription`, `/researcher/[username]` |

**Why no FAB / dedicated submit button:** Paradocs is fundamentally an aggregator — the content engine is the ingestion pipeline (NUFORC, BFRO, Reddit, NDERF, etc.), not user submissions. With millions of ingested reports, user-submitted reports are a supplement to the core dataset, not the flywheel that drives it. This is the opposite of TikTok/Instagram where user creation IS the content. A persistent FAB wastes prime thumb-zone real estate on a low-frequency action that doesn't drive the core product. Report submission is contextually triggered from report pages ("Have you seen something similar?") and available inside the Lab. This can be reintroduced if user submission volume grows to justify it.

**Lab icon:** Flask (research lab) or Telescope ("looking for what others can't see") — either works. Flask is more conventional and immediately recognizable. Telescope is more distinctive and on-brand for paranormal research. Decision can be made during implementation.

**Note on hypotheses:** Users do NOT create hypotheses from scratch. The AI generates hypothesis candidates from patterns it detects in a user's saves, case files, and constellation. These appear as suggestion cards in the Lab. Users review, refine, and choose to publish — or dismiss. This ensures quality, reduces friction, and makes the "aha moment" feel like a discovery rather than homework. See "AI-Suggested Hypotheses" section below for full detail.

**What disappears entirely:**
- The "More" bottom sheet (everything in it now lives in a tab)
- The dashboard sidebar navigation (Lab is one page)
- Standalone `/analytics` and `/insights` pages (AI surfaces these inline)
- `/dashboard/digests` (becomes notification/inbox, not a page)
- The [+] FAB (report submission moves to contextual CTAs + Lab)

---

## Tab-by-Tab Design

### 1. FEED (The Product)

This is where 80% of user time is spent. One full-screen swipeable feed with two filter modes at the top:

```
┌──────────────────────────┐
│  [For You]  [Community]  │  ← toggle, not separate pages
├──────────────────────────┤
│                          │
│   ┌──────────────────┐   │
│   │  REPORT CARD     │   │
│   │  UFO sighting,   │   │
│   │  Phoenix, AZ     │   │
│   │  ▸ 12 saves      │   │
│   └──────────────────┘   │
│                          │
│   swipe ↑ next           │
│   swipe → save           │
│   swipe ← dismiss        │
│   swipe ↓ rabbit hole    │
│                          │
│   ┌──────────────────────┐
│   │ 🧬 COMMUNITY HYPO   │  ← new card type, mixed into "For You"
│   │                      │
│   │ "Water proximity     │
│   │  correlates with     │
│   │  cryptid encounters" │
│   │                      │
│   │  by @susie_ohio      │
│   │  14 corroborations   │
│   │  ▸ See evidence      │
│   └──────────────────────┘
│                          │
│   ┌──────────────────────┐
│   │ 📊 PATTERN ALERT     │  ← replaces standalone /insights
│   │                      │
│   │  Paradocs detected   │
│   │  a temporal cluster  │
│   │  in your saved       │
│   │  reports             │
│   │  ▸ View in your Lab  │
│   └──────────────────────┘
│                          │
└──────────────────────────┘
```

**"For You" mode** (default): Mixed feed — reports, community hypotheses, pattern alerts, "on this date," clustering cards. Ranked by the same V1 scoring algorithm (engagement + recency + affinity + diversity + explore). Community hypothesis cards injected every 5-8 report cards.

**"Community" mode**: Hypothesis-only feed. User-published hypotheses ranked by corroboration count, evidence quality, recency, novelty. Shows the collective progress bar: "Paradocs has detected 3 cross-user patterns this month. 847 corroborations needed to unlock 12 more."

**Key insight:** Community hypotheses are NOT a separate section users have to find. They appear naturally in the feed users already use. This is how Twitter, TikTok, and Instagram introduce new content types — interleave, don't segregate.

---

### 2. EXPLORE (Spatial + Categorical + Keyword)

One page with three mode tabs at the top:

```
┌──────────────────────────┐
│  [Map]  [Browse]  [Search] │
├──────────────────────────┤
│                          │
│  Map mode: full-screen   │
│  interactive map with    │
│  report markers +        │
│  hypothesis pins         │
│                          │
│  Browse mode: category   │
│  tiles → subcategory     │
│  → filtered report list  │
│  (absorbs /phenomena +   │
│   /explore)              │
│                          │
│  Search mode: keyword +  │
│  AI search (gated)       │
│                          │
└──────────────────────────┘
```

This collapses 5 current routes (`/explore`, `/map`, `/search`, `/phenomena`, `/analytics`) into one page with three modes. The user never leaves the page — they switch modes with a tap.

---

### 3. REPORT SUBMISSION (Contextual, Not Nav-Level)

Report submission is accessed from two places:
1. **Report pages:** "Have you seen something similar?" CTA — emotionally contextual, catches users at peak engagement
2. **Lab:** "Submit a Report" option within the Lab, alongside saves and case files

The flow itself is streamlined for mobile (5 screens max, per Hick's Law):
1. What happened? (freeform text)
2. Where and when? (location + date picker)
3. Category (auto-suggested based on text, user confirms)
4. Media (optional photo/video upload)
5. Preview → Submit

Hypotheses are NOT created here. They are born in the Lab from AI analysis — see below.

---

### AI-Suggested Hypotheses (The Key Mechanic)

This is the bridge between passive collecting and active contributing. Users never stare at a blank page trying to invent a theory. Instead:

**How it works:**

1. User saves 10+ reports over time (threshold is tunable).
2. The AI periodically analyzes their saves, case files, and constellation for patterns — temporal clusters, geographic correlations, shared attributes, recurring themes.
3. When the AI finds something, it surfaces a **Hypothesis Suggestion Card** in the Lab:

```
┌──────────────────────────────────────┐
│  Pattern detected in your saves      │
│                                      │
│  "5 of your saved cryptid reports    │
│   occurred within 2 miles of a       │
│   body of water, all between         │
│   May and September."                │
│                                      │
│  Based on: [Report] [Report] [...]   │
│                                      │
│  ┌────────────┐  ┌────────────────┐  │
│  │  Refine &  │  │   Dismiss      │  │
│  │  Publish   │  │                │  │
│  └────────────┘  └────────────────┘  │
└──────────────────────────────────────┘
```

4. User taps "Refine & Publish" → sees AI-drafted hypothesis with linked evidence → can edit title, adjust reasoning, add/remove linked reports → publish.
5. Published hypothesis enters the Community feed for others to corroborate, challenge, or extend.

**Why this is better than user-created hypotheses:**

- **Quality floor:** AI ensures every hypothesis has actual evidence behind it, not speculation.
- **Zero friction:** User doesn't write from scratch — they react to a discovery.
- **"Aha" moment:** User LEARNS something about their own collection they hadn't noticed. This creates emotional investment.
- **Natural pacing:** Suggestions appear when user has enough data, not before. No empty states.

**Cross-user suggestions** (paid tiers): "Your water-proximity pattern matches a hypothesis published by @researcher_jane. Want to corroborate with your evidence?" This creates network connections organically.

---

### 4. LAB (Your Personal Research Space)

This is the big consolidation. The current 10-page dashboard hierarchy collapses into ONE page with horizontal-scrolling section tabs:

```
┌──────────────────────────┐
│  My Lab            ⚙️ 🔔 │
├──────────────────────────┤
│ [Saves] [Cases] [Map] [Notes] │  ← swipeable tabs
├──────────────────────────┤
│                          │
│  SAVES tab:              │
│  Your saved reports in   │
│  a grid. Filter by       │
│  category. Tap to view.  │
│                          │
│  AI INSIGHT CARD:        │
│  ┌──────────────────────┐│
│  │ 🧠 We noticed 4 of  ││
│  │ your saves mention   ││
│  │ EMF anomalies near   ││
│  │ water. Explore this? ││
│  │ [View Pattern]       ││  ← this is the conversion hook
│  │ [Publish Hypothesis] ││  ← one tap to share with community
│  └──────────────────────┘│
│                          │
│  CASES tab:              │
│  Your case files +       │
│  artifacts from Research │
│  Hub. Active investiga-  │
│  tions. (Pro+ feature)   │
│                          │
│  MAP tab:                │
│  Your constellation —    │
│  visual mind-map of      │
│  connections between     │
│  your saved/case items.  │
│  AI suggests connections │
│  you confirm or dismiss. │
│                          │
│  NOTES tab:              │
│  Your journal entries.   │
│  Create new. Link to     │
│  reports. Tag and search.│
│                          │
└──────────────────────────┘
```

**What this replaces:**
- `/dashboard` (overview) → Lab landing state (shows stats + AI insight cards inline)
- `/dashboard/saved` → Saves tab
- `/dashboard/research-hub` → Cases tab
- `/dashboard/constellation` → Map tab
- `/dashboard/journal` + `/journal/new` + `/journal/[id]` → Notes tab (with inline create/edit)
- `/dashboard/reports` → Folded into Cases tab (your submitted reports)
- `/dashboard/insights` → AI insights are now INLINE CARDS that appear in your Saves and Map tabs, not a separate page
- `/dashboard/digests` → Becomes notification bell content
- `/dashboard/subscription` → Profile tab
- `/dashboard/settings` → Profile tab

**The critical UX move:** AI insights aren't behind a paywall page you have to navigate to. They appear right where your content is — as cards in your Saves tab, as suggested connections in your Map tab, as prompts in your Notes tab. This makes the value obvious and the "publish hypothesis" action a natural next step.

---

### 5. PROFILE

Your public researcher identity + account management:

```
┌──────────────────────────┐
│  @chase_williams    Edit │
├──────────────────────────┤
│  🏅 Rank: Researcher     │
│  📊 12 hypotheses        │
│  ✦  47 corroborations    │
│  🔥 3 confirmed patterns │
├──────────────────────────┤
│  Published Hypotheses    │
│  ┌──────────────────────┐│
│  │ "NDE reports spike   ││
│  │  near hospital       ││
│  │  clusters in the     ││
│  │  Midwest"            ││
│  │  8 corroborations    ││
│  └──────────────────────┘│
├──────────────────────────┤
│  [Subscription]          │
│  [Settings]              │
│  [Sign Out]              │
└──────────────────────────┘
```

---

## The User Journey (Simplified)

### Stage 1 → ARRIVE
Word of mouth, social share, search. Land on homepage. Scroll. See the Feed preview. Tap in.

### Stage 2 → BROWSE (Feed)
Swipe through report cards. Encounter a community hypothesis card: "14 researchers link water proximity to cryptid sightings — see the evidence." Intrigued. Try to save a report. Prompted: "Create a free account to save."

**Conversion trigger:** Loss aversion. The card they want to save is right there. One tap to sign up (magic link or Google OAuth). No friction.

### Stage 3 → COLLECT (Lab — Saves)
Free user saves 15-20 reports over a week or two. The Lab starts showing AI insight cards inline: "3 of your saved reports mention electromagnetic anomalies near water. Want to explore this pattern?"

**Conversion trigger:** The blurred pattern preview. "Subscribe to see the full analysis and build case files." The insight is personalized — it's about THEIR saves, not generic content.

### Stage 4 → ANALYZE (Lab — Cases + Map)
Paid user builds case files, watches their constellation grow. AI suggests connections they confirm or dismiss. A pattern solidifies. The Lab shows: "Ready to share? Publish this as a hypothesis."

**Conversion trigger:** Social validation. One tap from "I see a pattern" to "the community can see my pattern."

### Stage 5 → CONNECT (Feed — Community)
User publishes hypothesis. It appears in other users' feeds. Gets corroborations. Gets a challenge with counter-evidence (which makes them dig deeper). Their researcher profile grows. They're now invested in the collective mission.

**Retention trigger:** The collective progress bar. "Paradocs has 3 confirmed cross-user patterns this month. Your hypothesis needs 4 more corroborations to reach significance." This turns individual research into a team sport.

### Stage 6 → COMPOUND (The Flywheel)
User's hypothesis connects with 3 others. Paradocs AI runs cross-hypothesis analysis and detects a meta-pattern: multiple independent researchers, different geographic regions, same correlation. Everyone involved gets notified. The platform publishes a "Community Discovery" — a pattern that no individual user could have found alone.

**This is the moat.** The data can be scraped. The AI can be replicated. But the collective intelligence of thousands of researchers, each contributing hypotheses from their own constellations, cannot be rebuilt elsewhere. This is what makes Paradocs a platform, not a tool.

---

## The Social Layer — Mechanics

### Hypothesis Lifecycle

```
DRAFT (in your Lab)
  ↓  user publishes
PUBLISHED (appears in Community feed)
  ↓  other users interact
  ├── CORROBORATED (user links supporting evidence from their own saves)
  ├── CHALLENGED (user links contradicting evidence)
  └── EXTENDED (user publishes a related hypothesis that builds on this one)
  ↓  threshold reached
PATTERN CANDIDATE (AI runs cross-hypothesis analysis)
  ↓  statistical significance
CONFIRMED PATTERN (published as Community Discovery)
```

### Interaction Model (Keep It Simple)

On a community hypothesis card in the Feed, three actions:

- **Corroborate** (↑ icon) — "I have evidence that supports this." Links one or more reports from your saves. One tap + report selection.
- **Challenge** (↓ icon) — "I have evidence that contradicts this." Same flow, links counter-evidence.
- **Extend** (→ icon) — "I have a related theory." Opens hypothesis creation with this one pre-linked.

That's it. Three actions. No comments section, no likes, no threads. This isn't social media — it's collaborative research. The signal is in the EVIDENCE, not the opinions.

### The Collective Progress Bar

Visible at the top of the Community feed mode:

```
┌────────────────────────────────────────┐
│  🧬 Community Research Progress        │
│                                        │
│  3 confirmed patterns this month       │
│  12 hypotheses approaching threshold   │
│  ████████░░░░░░░ 847 more needed       │
│                                        │
│  "Every save, hypothesis, and          │
│   corroboration brings us closer."     │
└────────────────────────────────────────┘
```

This is the gamification that doesn't feel like gamification. It's not points or badges — it's collective scientific progress. Every user action contributes to a shared goal.

---

## Route Consolidation Map

### Before (30+ routes):
```
/                           Homepage
/discover                   Story feed
/explore                    Category feed
/search                     Search
/map                        Map
/phenomena                  Encyclopedia
/phenomena/[slug]           Phenomenon detail
/analytics                  Analytics dashboard
/insights                   Pattern list
/insights/methodology       Methodology docs
/insights/patterns/[id]     Pattern detail
/report/[slug]              Report detail
/story/[id]                 Share preview
/submit                     Submit report
/submit/success             Submit success
/login                      Auth
/auth/callback              OAuth callback
/about                      About
/privacy                    Privacy
/beta-access                Beta signup
/survey                     Survey
/dashboard                  Dashboard overview
/dashboard/saved            Saved reports
/dashboard/constellation    Constellation
/dashboard/research-hub     Research hub
/dashboard/journal          Journal list
/dashboard/journal/new      New journal entry
/dashboard/journal/[id]     Journal entry detail
/dashboard/reports          My reports
/dashboard/insights         AI insights
/dashboard/subscription     Subscription
/dashboard/settings         Settings
/dashboard/digests          Weekly digests
/researcher/[username]      Researcher profile
/admin/*                    Admin (4 pages)
```

### After (core user-facing routes):
```
/                           Homepage (marketing/landing only)
/feed                       THE FEED — For You + Community modes
/explore                    EXPLORE — Map + Browse + Search modes
/report/[slug]              Report detail (full-screen, accessed from feed)
/phenomena/[slug]           Phenomenon detail (accessed from browse)
/hypothesis/[id]            Hypothesis detail (evidence, corroborations)
/lab                        MY LAB — Saves / Cases / Map / Notes + Submit report
/profile                    PROFILE — your identity + settings + subscription
/profile/[username]         Public researcher profile
/login                      Auth
/auth/callback              OAuth callback
/about                      About (footer link)
/privacy                    Privacy (footer link)
/admin/*                    Admin (unchanged, 4 pages)
```

**30+ routes → 14 user-facing routes.** More than half eliminated through consolidation.

---

## Implementation Considerations

### What to build first
1. **Consolidate Lab** — collapse dashboard pages into tabbed single page. This is refactoring, not new features. Do this before adding the social layer.
2. **Consolidate Explore** — merge map/search/browse into mode-switched page.
3. **Add AI hypothesis suggestion engine** — periodic analysis of user saves, surfaces suggestion cards in Lab.
4. **Add hypothesis card type to Feed** — new card component + new `hypotheses` table.
5. **Add refine & publish flow** — from Lab AI suggestion cards (not from FAB).
6. **Add corroborate/challenge/extend actions** — three new event types in feed_events.
7. **Add Community mode to Feed** — filter toggle at top.
8. **Add collective progress bar** — computed from hypothesis + corroboration counts.

### New database tables needed
- `hypotheses` — id, user_id, title, reasoning, status (draft/published/candidate/confirmed), created_at, updated_at
- `hypothesis_evidence` — id, hypothesis_id, report_id, user_id, type (supporting/contradicting), created_at
- `hypothesis_interactions` — id, hypothesis_id, user_id, type (corroborate/challenge/extend), linked_hypothesis_id (for extends), evidence (linked report IDs), created_at

### What does NOT change
- Report detail pages (`/report/[slug]`)
- The ingestion pipeline
- The Paradocs Analysis layer
- The algorithmic feed scoring (just add new card type + new signals)
- Admin pages
- Auth flow

### Gating strategy
- **Free:** Browse feed (reports + hypotheses), save reports, view hypothesis evidence
- **Basic:** Publish hypotheses, corroborate/challenge, AI insight cards in Lab
- **Pro:** Case files, full constellation, cross-hypothesis AI analysis, Research Hub
- **Enterprise:** API access, bulk export, custom AI analysis

---

## The North Star Metric (Revised)

Previous: **Session Depth** (average cases viewed per session)

Proposed: **Research Contributions per Week** — saves + hypotheses published + corroborations given.

Session depth measures consumption. Research contributions measure investment. A user who publishes 2 hypotheses and corroborates 5 others per week is 10x more retained than one who reads 50 reports. Both metrics matter, but contributions predict retention and lifetime value more reliably.

---

## Market Research: Unmet Needs Across Target Demographics

### The Addressable Audience

The paranormal-interested population is far larger than the "true believer" niche suggests. Gallup's May 2025 poll found 48% of U.S. adults believe in psychic/spiritual healing, 39% believe in ghosts, and 34% are "generally open to paranormal" (believing in 3+ phenomena, averaging 5). Chapman University surveys show 57.7% believe places can be haunted, 41.4% believe in ancient alien visitation, and Americans have become 7% more likely to believe in Bigfoot in just two years. This isn't a fringe — it's roughly 100M+ Americans with some level of paranormal interest.

The podcast audience alone is massive: 584M+ global podcast listeners in 2025, with paranormal shows consistently ranking in top categories. The demographic skews 12-54 (66% of 12-34 year-olds and 61% of 35-54 listen monthly), educated, and higher income — exactly the profile that pays for subscriptions.

### What Each Community Is Missing (And What Paradocs Can Be)

**MUFON users** are frustrated by organizational dysfunction (leadership scandals, sexual harassment complaints, far-right political controversies that caused mass resignations), pseudoscientific methodology, and a gatekept, bureaucratic report review process. Researchers have publicly called MUFON "morally unacceptable" to participate in.

**What they need:** A credible, apolitical alternative for UFO/UAP report collection that takes data seriously without the organizational baggage. Paradocs already is this — the ingestion pipeline, Paradocs Analysis layer, and evidence-based presentation position it as the modern MUFON replacement.

**NUFORC users** deal with an outdated, text-heavy interface with limited interactivity, no API access, broken data exports, heavily U.S.-skewed geographic data, and an opaque review process. Developers who've tried to work with NUFORC data describe it as "some of the most badly formatted data" they've encountered, with no replies to outreach.

**What they need:** A clean, searchable, API-accessible database with proper geographic visualization and structured data. The Paradocs map, search, and browse features already solve this. The Explore tab consolidation makes it even stronger.

**BFRO users** report a "very glitchy" app, dead links throughout the website, outdated design, and a website that's "seldom updated." One user described it as "about worthless."

**What they need:** A functioning modern app. Period. Paradocs on mobile with the simplified 4-tab nav would be a generational upgrade for this audience.

**Gaia subscribers** complain about unauthorized billing after cancellation, disappearing content without notice, declining content quality (pivoting to yoga/channeling away from paranormal), a streaming player that "frequently freezes and crashes," and poor value for price.

**What they need:** Gaia is entertainment; Paradocs is research tools. These are different products, but the Gaia audience that cares about investigation and evidence (vs. channeling and spirituality) is a direct acquisition target. The Feed's editorial voice and the AI analysis layer serve the "I want substance, not woo" segment that Gaia is losing.

**Reddit communities** (r/UFOs at 1.2M+, r/paranormal at 1.7M+, r/HighStrangeness at 600K+, r/Experiencers, r/NDE, r/Ghosts) are where the real conversations happen today. Cross-subreddit AMAs, DIY research projects (one user built an actual radar system), and deep theoretical discussions thrive here. But Reddit has no structure — no evidence linking, no pattern detection, no persistence, no research tools.

**What they need:** The discussion and community energy of Reddit plus the structured research tools of a dedicated platform. The Community hypothesis feed with corroborate/challenge/extend is exactly this — Reddit's collaborative energy, but with evidence-linked rigor.

**Experiencer communities** (OPUS, IANDS, various support groups) serve people who've had UFO encounters, NDEs, or other anomalous experiences. The primary need is **validation without judgment** — a safe space to share without being dismissed or pathologized. OPUS has operated since 1994 specifically because mainstream institutions don't serve these people. As stigma decreases, more people are coming forward.

**What they need:** A platform where their experience is treated as data, not delusion. Paradocs's editorial posture ("the data points toward these phenomena being real, but we lead with evidence") is exactly right for this audience. The submit flow is their entry point; the community feed is where they find others with similar experiences.

### Five Gaps Paradocs Should Fill

**1. Experiencer Matching / "You're Not Alone" Feature**
The single most powerful emotional need across every community: "Has anyone else experienced what I experienced?" When a user submits a report or saves reports similar to their own experience, the AI should proactively surface: "12 other reports within 50 miles describe similar phenomena. 3 were reported in the same month." This isn't a hypothesis — it's a comfort feature that drives deep emotional engagement and retention.

Implementation: This fits naturally into the Lab. When a user saves or submits, an AI card appears: "Similar experiences nearby." Tap to see a privacy-safe summary (no user identities unless they've opted in). This is the feature that makes someone think "this platform gets me."

**2. Temporal Alerts / "It's Happening Again"**
Paranormal communities are obsessed with flaps — waves of sightings in a region over a short period. The New Jersey drone sightings of late 2024 drove millions of searches. Paradocs should detect these in real-time and push notifications: "UFO reports in your region are 340% above baseline this week." This drives immediate re-engagement and gives users a reason to open the app even when they're not actively researching.

Implementation: Requires the engagement cron job (already pending) plus a simple anomaly detection layer on the ingestion pipeline. Push notifications via Capacitor for the native app.

**3. Skeptic Mode (Already Partially Built)**
The insights pattern detail page already has a SkepticMode component. This should be elevated to a platform-wide toggle. Skeptics are a MASSIVE audience — the 66% in Gallup's "generally skeptical" category. They won't use a platform that feels credulous. A persistent "Skeptic Mode" that shows mundane explanations, statistical baselines, and alternative hypotheses alongside every report and hypothesis makes Paradocs trustworthy to this group without alienating believers.

Implementation: The Paradocs Analysis layer already generates mundane explanations and credibility scores. Skeptic Mode is a UI toggle that makes these prominent rather than secondary.

**4. Research Credit / Citability**
Academics, podcasters, and content creators need to CITE their sources. Every Paradocs report, hypothesis, and Community Discovery should have a one-click "Cite This" button that generates APA, Chicago, and plain-text citations. This positions Paradocs as infrastructure for the research ecosystem, not just a consumer app. It's also a retention lever for the Pro tier — if your citations link to Paradocs, you need your account.

Implementation: Simple text generation from existing metadata. Add to report detail page and hypothesis detail page.

**5. Integration with Field Equipment Data**
Modern paranormal investigators use EMF meters, thermal cameras, LIDAR, audio recorders, and increasingly, AI-enhanced analysis tools. No platform currently lets you attach structured equipment readings to a report. If Paradocs supports structured data upload (EMF readings, audio spectrograms, thermal images with metadata), it becomes the infrastructure layer for serious investigators — the GitHub of paranormal research.

Implementation: This is a v2/v3 feature, but the data model should accommodate it from the start. A `report_attachments` table with structured metadata fields (equipment_type, reading_value, calibration_data) alongside the media upload.

### What Takes Paradocs to Millions

The features above address expressed needs of existing communities. But to reach millions, Paradocs needs to convert the **casually curious** — the person who watches Ancient Aliens as comfort food, who reads a creepy Reddit thread at midnight, who has a vague interest but no platform loyalty.

For this audience, the key is **frictionless consumption that escalates to participation:**

- The Feed must be as addictive as TikTok's For You page. One card, full screen, swipe up. No decisions required.
- The AI-generated feed hooks must be irresistible. "A family in rural Ohio reported identical beings three nights in a row. None of them had heard of each other." That's a hook that makes someone swipe up.
- The "similar experiences" feature converts a passive reader into an emotionally invested user the moment they think "wait, that happened near me."
- The collective progress bar makes even a casual saver feel like they're contributing to something. "Your saves helped Paradocs detect a new pattern." That's a push notification that brings someone back.

The funnel is: TikTok-style consumption → emotional connection ("this happened near me") → saving → pattern discovery in Lab → hypothesis publication → community engagement → long-term retention.

---

## Audio Narration: Experiment First, Ship Later

**Decision:** Audio narration (Listen Mode) is a tracked experiment, NOT a beta launch feature.

**The risk isn't the voice — it's the script.** OpenAI TTS-1-HD can sound convincingly human. But our feed hooks and Paradocs Analysis text were written to be *read on screen*, not *listened to*. Spoken content needs different sentence structure, pacing cues, and narrative flow. A wall of analytical text that works visually becomes droning audio.

**The plan:**
1. Generate test narrations for 10-15 reports across categories (UFO, NDE, cryptid, ghost) using OpenAI TTS-1-HD with "onyx" and "nova" voices
2. Chase listens and evaluates: Is this compelling? Would someone listen to this while commuting?
3. If yes → tune the AI text generation prompts to produce "listenable" copy (shorter sentences, narrative hooks, spoken-word pacing)
4. If no → identify what needs to change before investing in full-scale generation
5. The UI can have the Listen button designed into layouts from Day 1 — just inactive until quality is validated

**Cost savings:** Skipping bulk TTS generation at launch saves $75-200 until quality is confirmed. The feature activates in Week 3-4 if tests pass, or becomes a post-launch addition.

---

## Share Cards: Two Modes (Proactive + Reactive)

### Mode 1: Milestone-Triggered (Proactive)

**Principle:** Nobody shares "I saved 2 reports." People share "I discovered that cryptid encounters cluster near water — 47 reports support this."

Share cards surface automatically when the user hits a genuinely compelling milestone:

- **First hypothesis gets 10+ agrees:** "My research is getting validated"
- **Constellation connects to a pattern candidate:** "I'm part of a discovery"
- **Research DNA shows something distinctive:** "You've explored reports across 12 states — more than 94% of researchers"
- **Community Discovery includes their hypothesis:** "I helped discover something"
- **Flap detection in their saved region:** "7 new sightings near my saved reports this week"

**The motivation loop:** Keep researching → hit milestone → get a beautiful shareable artifact → share it → bring new users in → those users start researching.

### Mode 2: On-Demand Evidence Cards (Reactive — "PROVE IT")

This is the killer use case: someone challenges a user in a Reddit thread, Twitter reply, or comment section. The user drops a Paradocs share card as evidence. This is reactive, not celebratory — it's a **credibility artifact**.

Every published hypothesis the user has contributed to (authored, corroborated, or extended) has a **"Share with Evidence"** button that generates a rich preview card showing:

- Hypothesis title
- Evidence count (e.g., "Supported by 47 reports")
- Corroboration percentage ("73% of researchers agree")
- A direct link to the full evidence chain on Paradocs (`/hypothesis/[id]`)

**Why this matters for growth:** The person who sees the card and clicks "see the evidence" lands on a hypothesis detail page with structured data backing the claim. They think "where has this platform been?" That click is the top of the conversion funnel — from skeptical outsider to intrigued browser to researcher.

**Design:** The reactive share card is visually distinct from the proactive milestone card. It's designed to look like a research citation, not a celebration. Clean, credible, data-forward. The Paradocs logo is subtle but present. The link is prominent.

**Implementation:**
- Proactive cards: event-driven, pre-rendered at milestone moments, celebratory tone
- Reactive cards: on-demand via "Share with Evidence" button on any published hypothesis, credibility tone
- Both generate OG meta tags + custom `/api/og/hypothesis/[id]` image for rich link previews
- Both include pre-written share text that the user can edit before posting

---

## Apple Human Interface Guidelines: Design Principles

HIG compliance is a design principle applied across every screen, not a one-time audit. Every implementation session references this checklist.

### Navigation & Structure
- Tab bar for top-level navigation (4 tabs, no more)
- Clear visual hierarchy with consistent placement across all screens
- Swipe-to-go-back gesture supported on all pushed views
- Pull-to-refresh on all scrollable content
- Long-press for context menus where appropriate (report cards, hypothesis cards)
- No custom UI patterns where a system pattern exists

### Touch & Interaction
- All touch targets minimum 44x44pt
- Adequate spacing between interactive elements (minimum 8pt between targets)
- Primary actions in thumb zone (bottom 40% of screen)
- Sticky action bars at bottom, never top
- Haptic feedback on meaningful interactions:
  - Light impact: save, agree/disagree
  - Medium impact: publish hypothesis, corroborate
  - Success notification: pattern detected, milestone reached
  - Warning: delete, dismiss hypothesis

### Typography & Accessibility
- Support Dynamic Type — respect user's iOS text size settings
- Minimum body text: 17pt (SF Pro Text)
- Headings follow SF Pro Display weight hierarchy
- Color contrast ratios meet WCAG AA minimum (4.5:1 for body text)
- All images have meaningful alt text

### Layout & Safe Areas
- Respect safe areas on all device sizes (notch, Dynamic Island, home indicator)
- Content extends edge-to-edge behind status bar and tab bar with proper insets
- No content cut off on any iPhone screen size (SE through Pro Max)
- Landscape support not required for beta — lock to portrait

### Platform Conventions
- Use SF Symbols for all icons (consistent with iOS visual language)
- Sheets and modals use system presentation styles (page sheet, form sheet)
- Alerts and confirmation dialogs use system UIAlertController patterns
- Loading states use system activity indicators or skeleton screens — no custom spinners

---

## Research Momentum Framework: Psychological Design Patterns

This framework governs every interaction design decision. The goal: make users feel that every action moves them forward, that progress is visible, and that the next step is always clear and achievable.

### Hick's Law (Fewer Choices = Faster Decisions)

Route consolidation (30+ → 13) addresses macro-level choice overload. Apply at micro level:
- **Every screen has ONE primary action.** Report card in Feed: tap to read (not tap AND swipe AND three buttons). Hypothesis suggestion in Lab: "Refine & Publish" or "Dismiss" — two choices.
- **Report submission is 5 screens maximum.** Hard rule. Each screen asks one question.
- **Feed filter is a binary toggle** (For You / Community), not a multi-option filter bar.
- **Lab tabs are 4 maximum.** Saves, Cases, Map, Notes. No "More" overflow.

### Fitts's Law (Target Size × Distance)

- **Primary actions in thumb zone** (bottom 40% of screen on a 6.1" display = bottom ~340px).
- **Sticky action bar on reports:** Save + Listen + Share — always visible, always reachable.
- **Tab bar targets:** Each tab icon occupies full width/4, minimum 80px wide, 49pt tall.
- **CTA buttons:** "Refine & Publish" = full-width button, minimum 50pt tall, at bottom of suggestion card.
- **Corroborate/Challenge/Extend:** Three equally-spaced action buttons spanning full card width.

### The Hook Model (Trigger → Action → Variable Reward → Investment)

Each level of engagement follows Nir Eyal's four-phase loop:

**Browsing Loop:**
- Trigger: Push notification (Daily Briefing) or social share link
- Action: Open Feed, start swiping
- Variable Reward: Unpredictable content mix (reports, hypotheses, pattern alerts, "on this date")
- Investment: Save a report (creates data for future AI analysis)

**Research Loop:**
- Trigger: AI insight card appears in Lab ("3 of your saves mention EMF near water")
- Action: Tap to explore pattern
- Variable Reward: Discovery moment — user LEARNS something about their own collection
- Investment: Publish hypothesis (creates social content + public commitment)

**Social Loop:**
- Trigger: Notification ("Your hypothesis got 5 new corroborations")
- Action: Check hypothesis, read corroborating evidence
- Variable Reward: Social validation + new evidence they hadn't seen
- Investment: Corroborate others' hypotheses (deepens network ties + reciprocity)

### Progress Loops (Achievable, Visible, Escalating)

**Micro-loops (minutes):**
- Save a report → constellation grows by one node → visual progress
- Agree/disagree on hypothesis → percentage shifts → feel contribution
- Completion: < 5 seconds per action

**Medium-loops (days):**
- Save 5 reports in a category → AI surfaces pattern insight → "discovery moment"
- Publish first hypothesis → get first corroboration notification → social validation
- Completion: 3-7 days of casual use

**Macro-loops (weeks):**
- Hypothesis reaches pattern candidate threshold → anticipation notification
- Research DNA updates weekly → see research identity evolve
- Community Discovery published → "You helped discover something" → peak emotional moment
- Completion: 2-4 weeks

### Zeigarnik Effect (Incomplete Tasks Pull You Back)

Show users what's *almost* there:
- "Your hypothesis needs 3 more corroborations to reach Pattern Candidate status"
- "You've explored UFO reports in 4 states — researchers who cover 6+ find 2x more patterns"
- "2 of your saves are connected to a trending hypothesis — tap to see"
- Blurred pattern preview for free users: the insight exists, they can almost see it

### Endowed Progress Effect (Start Users Ahead)

Don't start from zero:
- After category selection in onboarding, immediately show: "We found 47 reports matching your interests"
- First save triggers: "You've started your research — 4 more saves and the AI can start detecting patterns"
- Show a pre-populated constellation with their selected categories as seed nodes

### Celebration Moments (Emotional Payoff)

Every milestone gets an appropriate celebration scaled to its significance:

| Milestone | Celebration | Emotional Register |
|-----------|-------------|-------------------|
| First save | Subtle confetti + "Your research has begun" | Warm, encouraging |
| 10th save | "The AI is now analyzing your collection" + Lab glow | Anticipation |
| First AI insight | Prominent card with discovery framing | Curiosity, surprise |
| First published hypothesis | Hypothesis card animates into Community feed in real-time | Pride, ownership |
| 10 corroborations | Notification with specific count + researcher names | Social validation |
| Pattern Candidate | "Your hypothesis is being reviewed for Community Discovery" | Anticipation, importance |
| Community Discovery | Full-screen moment — "You helped discover something" | Peak experience |

**Implementation note:** Celebrations use iOS haptic patterns (success, medium impact) paired with subtle visual animations. No over-the-top gamification aesthetics — this is science, not a slot machine. The tone is "research journal achievement" not "mobile game reward."

### IKEA Effect (Value What You Build)

Users value things they helped create more than things handed to them:
- Hypothesis suggestions are AI-drafted but USER-refined. The editing step creates ownership.
- Constellation connections are AI-suggested but USER-confirmed. The confirm/dismiss choice creates investment.
- The "publish" action is a deliberate choice, not an automatic post. Publishing feels like a declaration.

---

## Summary

The social layer isn't a new section bolted onto a complex app. It's the connective tissue that makes a simpler app more valuable:

- Feed gets a new card type (hypothesis) and a Community mode toggle
- Lab gets inline AI suggestion cards that surface patterns in user saves and lead naturally to "refine & publish," plus report submission access
- No FAB — report submission is contextual (report page CTAs + Lab), not nav-level
- Profile gains a reputation dimension (hypotheses, corroborations, confirmed patterns)
- Audio narration is an experiment-first approach — test 10-15 reports before platform-wide rollout
- Share cards trigger at milestones, not arbitrarily — motivating users to reach shareable moments
- Apple HIG compliance across every screen
- Research Momentum Framework governs all interaction design (Hick's, Fitts's, Hook Model, Zeigarnik, celebrations)
- Five new features address specific unmet needs across MUFON, NUFORC, BFRO, Gaia, Reddit, and experiencer communities

Four tabs. Four verbs. One user journey from browse → collect → analyze → connect. The social layer makes each stage flow into the next instead of dead-ending at "I built my case files."
