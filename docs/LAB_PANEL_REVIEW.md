# Lab Panel Review — From Research Workspace to Personal Archive

**To:** Chase
**From:** The Lab Panel (7 voices, convened June 2026)
**Re:** What's wrong with Lab today, and the MVP path to the Ancestry-style experience
**Length:** ~2,200 words

---

## TL;DR

- **The Lab is a research workstation. It needs to be a personal archive.** Every name on the current surface — "Your Story / Library / Explore," but also Cases, Saves, Constellation, Signal, Fingerprint, RADAR — is a researcher's noun. None of them tell a 38-year-old in Lumberton, NC who saw a triangle in 1998 what to do, why she's here, or what she's building.
- **The Ancestry comparison is right and underused.** Ancestry's mechanic is "one name + one photo → a tree with hints raining in." Paradocs has the database to do the same trick — 136k reports, embeddings, geographic clustering, AI categorization — but the user's *own* artifact (their submitted experience) is buried under four layers of dashboard chrome. The Lab does not feel like *hers*.
- **The single biggest lever is collapsing "Your Story" into a living document, not a tab.** The user's submitted experience(s) should be the spine of the entire Lab — a personal case file that the rest of the app (Library saves, Explore questions, AI insights) attaches *to*, not parallel surfaces *next to*.
- **The MVP delta is three moves:** (1) rename Lab into "My Archive," (2) make the user's own experience the persistent header context across all tabs, (3) put one "What's new in your archive" line at the top of every visit — the connection the AI just found, the new nearby report, the matching phenomenon page.
- **The paywall justifies itself if and only if the personal artifact compounds.** Today Lab is paywalled but a user who pays gets… a saves folder and a chatbot. Tomorrow Lab should be paywalled because *the archive of their experience grows richer the longer they subscribe* — new matches, AI re-analysis as the corpus grows, year-in-review reveals, peer connections.

---

## Current state — what we observed

The Lab today sits at `/lab` and offers three tabs (`story`, `library`, `explore`). This is already the *result* of consolidation — comments in `src/pages/lab.tsx` document at least four prior iterations (RADAR + SIGNAL, then 5 tabs, then 4 tabs, then 3 with `LEGACY_TAB_REDIRECT` rewiring `constellation → story`, `signal → story`, `cases → library`, `map → library`, `ask → explore`). The history is visible in the code, and so is the cognitive cost.

**Your Story** combines two formerly-distinct surfaces: the user's submitted experiences rendered as a RADAR visualization (`LabConstellationTab`), and an AI-derived "Signal" panel (`YourSignalTab`) that shows four band cards — Fingerprint, Cluster, Context (Sonnet-derived, paywalled past the first submission), Peer Questions. Plus a `SinceLastVisitLine` delta chip, a Spotify-Wrapped-style `SignatureGrowthCard`, a seasonal Year-in-Review banner, and a `NotificationsAndSharingAccordion`. On a phone this is roughly 1,400px of stacked content for a user with one submitted report. The Story tab works, but it is a *dashboard about* the user's experience, not the experience itself foregrounded.

**Library** is the saves surface — every report the user has bookmarked from the catalogue, plus URL pastes (Reddit, YouTube, etc.) saved as `constellation_artifacts`. The schema (`20260311_research_hub_constellation_v2.sql`) is genuinely powerful: artifacts have verdicts (`compelling | inconclusive | skeptical | needs_info`), tags, AI insights, user-drawn connections, and named "case files" (collections). But the UX surface — view toggle (Library / Collections), category filter pills, AI patterns lane, Letterboxd-style timeline view, search, sort, six view modes — is a research tool. The schema names *call them artifacts*. That word does not appear in the user's mental model.

**Explore** is `AskTheUnknown` (a Sonnet-backed chatbot) plus personalized starter prompts plus a browse-by-phenomenon grid. The starter prompts are good — they pull from the user's most recent submission and produce sentences like "What else looks like my 1998 Lumberton triangle?" — but the chat input is the page's headline, which already drew panel concern in PR-6-c+d notes ("Ask-as-destination has no 'mine' anchor, fails the 65yo who doesn't know what to type").

The persistence layer (`constellation_artifacts`, `constellation_case_files`, `constellation_connections`, `constellation_ai_insights`, `constellation_theories`) is more than capable. The problem is not data — it is the *story the UI tells about that data*.

---

## Panel commentary

### 1. Consumer Product Strategist

The Lab is organized around the *operator's* mental model — RADAR, SIGNAL, Case Files, Constellation — when it should be organized around the user's question: *what happened to me, and is anyone else like me?* Notion got this right by hiding "blocks" behind "pages." Pinterest hides "objects" behind "boards." Paradocs is still showing the operator's nouns to the consumer.

The three tabs as currently named violate two heuristics. First, *parallel structure*: "Your Story" (mine) sits next to "Library" (the verb-as-noun of saving) and "Explore" (a verb). They aren't peers — Library and Explore are both *in service of* Your Story. Second, *value over function*: "Library" tells me what I can do (store things); it doesn't tell me what I get (a personal archive that recognizes me). Rename to **My Experience** (singular, the spine), **My Archive** (the corpus of related material), **The Field** (the wider catalogue, where Explore-as-discovery happens). Or collapse to a one-tab Lab with a persistent left rail showing the user's experience timeline and the right side hosting whichever lens is active. Recommended moves: (a) **rename the entry point from "Lab" to "My Archive"** — Lab is a researcher's noun, archive is everyone's; (b) **make the user's first submitted experience the page hero everywhere in Lab** — every tab opens with "1998 Lumberton triangle, NC" pinned at the top, so they always know whose archive this is; (c) **kill the empty-state Story tab** — if a user hasn't submitted, the entire Lab should be a single Ancestry-style "Start with one experience" call.

### 2. Behavioral Designer

The engagement loop today is broken at the trigger. A user submits one experience, sees a beautiful reveal, then comes back on Day 7 and sees… roughly the same screen, with a "+0 in your cluster" chip. The `SinceLastVisitLine` is the right idea, executed at the wrong volume — it's one of fourteen elements on the Story tab, sized like the rest. Compare to Strava's "You ran 3.2 miles farther than last week" — *that's the page*, not a chip among chips. The "honest empty state" copy ("Nothing new in your signal yet — the archive grew by 9,000 reports since Thursday, but none matched your cluster. Add another experience and your signal will sharpen.") is brand-correct but motivationally inert; honesty about no-change is fine if there is something else *active to do*.

Three concrete recommendations. First, **promote the delta to the page itself**: on return visits, Lab opens to "Since Tuesday: 3 new triangles in NC. Take a look →" — full bleed, one tap to a curated micro-feed. Today's Signal tab opens to the user's static fingerprint. Second, **build a streak of meaning, not of clicks** — Duolingo's streak works because each day you actually learn a word; here, the equivalent is "this week we found you one new connection," surfaced as a card, with the operator-side guarantee that the AI is always finding *something* (a tag match, a same-decade report, a phenomenon-page they haven't seen) so the card is never empty. Third, **the "Add another experience" CTA needs to be in the user's path on every visit, not just the cold-start screen** — most users have more than one weird thing in their life, but the Lab currently treats submission as a one-time event. A discreet "Add another to your archive" pill below the Story header, always present, would 2-3x submissions per active user.

### 3. Genealogy / Ancestry-style Product UX Expert

What Ancestry does that Paradocs doesn't yet: the moment you add a name, the app shows you a *speculative tree* with leaves indicating "hint available." You don't have to know what to do — the leaves tell you. Each leaf is a small, validated, single-decision action: confirm this is your great-grandfather, reject this match, add this census record. The user is never asked to "research." They are asked, repeatedly, *is this you?*

Paradocs has the engine for the same leaf-pattern — the `constellation_ai_insights` and `constellation_connections` tables, plus the match RPCs already running in `LabConstellationTab.fetchMatches`. What's missing is the *leaf*. After a user submits "1998 triangle in Lumberton," the Lab should offer, one at a time: "This other report from Robeson County in 1997 describes a similar triangle. Is it related?" → confirm / dismiss / save. "This phenomenon page is called *NC Triangles*. Add to your archive?" → yes / no. "Three users in your area have also reported triangles. Want to be notified if a new one comes in?" → yes / no. Each confirmation makes the user's archive more *theirs*, not the operator's.

Three recommendations: (a) **build a "Hints" surface** — one card at a time, in the header of My Experience, with confirm/dismiss; never more than 1-2 visible; new ones queue. This is the leaf. (b) **let the user *claim* phenomenon pages** — the Bigfoot encyclopedia article on the catalogue side should, for a logged-in user with a matching submission, render a "this is part of my archive" affordance that pins it into their personal corpus. (c) **the user's archive needs a visible spine, not a RADAR** — a vertical timeline of their experiences + the reports / phenomena they've attached to each. The RADAR is gorgeous and a great hero animation; it is not a workspace. Ancestry shows you a tree. Paradocs should show you a timeline of *your* anomalies and what the database says about each.

### 4. AI Product Designer

The AI in Lab today is technically excellent and tonally over-tagged. "Your Signal," "Your Fingerprint," "Across the Archive," "Patterns Near You" — the labels announce AI-ness. Spotify Wrapped is one of the most-used AI products on earth and never once says the word *AI*. Granola transcribes meetings; it says "summary," not "Claude summary." The pattern is: surface the conclusion, hide the machinery.

Concrete recommendations. First, **drop the meta-labels**: "Your Fingerprint" becomes "What makes your experience unusual"; "Across the Archive" becomes "How yours compares to the rest." The tonal rule is *write what the AI is telling you, not what the AI is*. Second, **the four-card Signal layout is structurally over-articulated**: a user with one submitted experience sees Fingerprint + Cluster + Context + Peer Questions, three of which restate the same underlying data ("here are nearby reports") in different framings. Collapse to one paragraph of synthesized prose at the top of My Experience — "Your 1998 Lumberton triangle is one of 23 triangle sightings in central NC in the late 1990s. Two reports describe the same V-formation. The closest in time was July 14, 1998, eleven miles east." That's three Signal cards rewritten as a single sentence. Then *underneath* offer the breakdown for users who want it. Third, **paywall the connection, not the explanation**: free users see the synthesized paragraph (it's the hook); subscribed users get the linked, citable, deep version with the ability to attach specific reports to their archive. Today the gate is on the Sonnet "Context" card past the first submission — which is invisible to free users until they hit the wall. A free-tier always-on synthesis with a paywalled deep-link is a better funnel.

### 5. Documentary Editorial Voice

The brand discipline on the catalogue side is intact — measured, archival, never sensationalized. The Lab violates this in two places. First, the *labels* — "Your Signal," "Fingerprint," "Constellation," "Radar" — borrow from intelligence-agency and consumer-fitness vocabulary, neither of which is documentary. A documentary archive does not say *radar*. It says *record*, *case*, *file*, *witness*, *account*. Second, the *gamification creep* — the "Spotify Wrapped" Signature Growth card, the streak chip, the seasonal Year-in-Review banner all push the surface toward Strava territory.

The fix isn't to strip these mechanisms — they work — but to *rewrite their copy* into the documentary register. "Your Signature is growing" → "Three new accounts in central NC have been added to the archive this month." "Your Signal" → "Related accounts." "Across the Archive" → "In the wider record." The mechanism is identical; the voice is the brand. One concrete deliverable: a single-page "Lab voice guide" with side-by-side current/proposed labels — Fingerprint → Signature; Signal → Connections; Radar → Map of related accounts; Constellation → Your record; Case Files → Collections (already good). The Lab should read like a museum's online archive, not a Fitbit dashboard.

### 6. Onboarding & Activation Expert

The first five minutes are where the Lab will live or die for the 30% of US adults who've had a paranormal experience but are not enthusiasts. Today's flow: user lands on Lab (paywalled, requires sign-in), sees a sign-in wall, completes auth, hits Story tab which is empty (`LabConstellationTab` returns `null` when `hasSubmission` is false), sees the YourSignalTab empty state which says "Your Signal grows with your story" with a single "Share your first experience" CTA pointing at `/start`. That's three screens (lab → login → empty → /start) before the user does the thing.

Three fixes. First, **let unauthenticated users start submitting from `/lab` directly** — collect the experience first, ask for an email at the moment of saving it. This is the Ancestry pattern: enter one name on the homepage, then sign up to see what we found. Today Paradocs reverses the order. Second, **the cold-start needs to *show what they're about to get*** — instead of an empty Story tab, render a "preview" Lab populated with one anonymized sample user's archive (1998 NC triangle, three related reports, two phenomena tags, one peer connection) and a one-line "this could be your archive in 30 seconds." Third, **demographic-segment the entry**: the 65-year-old who saw something in 1971 needs different copy than the 24-year-old who had a sleep paralysis episode last week. A two-question gate at the start — "What did you experience? / Roughly when?" — routes both into the same submission form but lets the AI pre-populate the right phenomenon category and the right matching corpus from the moment they hit submit.

### 7. Subscription Business Model Strategist

The paywall today is structurally weak. The Lab is gated, but the *value* of subscribing is "you can do more research" — a workshop metaphor that only enthusiasts pay for. The Ancestry funnel is different: free users get the seductive partial reveal (we found 12 hints!), the paywall sits between them and the *details*. Subscription justifies itself because the hints keep coming.

Tier this explicitly. **Free** gets: one submitted experience, the synthesized paragraph of AI matches, a numerical promise ("we found 14 related accounts, 3 within 50 miles"), and the ability to read three of them. **Subscribed** ($5.99/mo) gets: unlimited submissions, the full list of matches with citations and links, the ability to claim phenomenon pages into their archive, the "Hints" feed (one new connection per visit, guaranteed), peer-connection opt-in (other users who matched can be revealed), year-in-review, push/email digests. This maps cleanly onto the existing schema (`tier_design_v2.sql` already tracks this) but the *funnel surface* — the visible value increment when you upgrade — needs to be a single screen the user sees after their first reveal, showing "11 more accounts we can't show you yet" with the upgrade CTA. Today the `LockedAICard` is a quiet placeholder on the second submission; it should be a structural conversion surface tied to the first reveal moment.

---

## Recommended MVP redesign

### Reimagined IA

Collapse the three tabs into a single Lab page with a persistent header (the user's experience(s), as pills + add-another) and a body that toggles between three lenses rather than tabs:

- **My Experience** (default) — the user's submitted account(s), with AI-synthesized prose paragraph, a Hints queue (1 card at a time, confirm/dismiss), and a vertical timeline of attached reports / phenomena / peer connections.
- **My Archive** (renamed Library) — everything they've saved or had auto-attached, organized into Collections, time-stamped.
- **The Field** (renamed Explore) — the catalogue-side surfaces filtered through the lens of *their* archive ("here's what's new in the wider record that relates to your stuff").

The names "Lab," "Story," "Library," and "Explore" all go. Lab itself remains the URL (`/lab`) and the subscription product name, but the user-facing label in the nav becomes **"My Archive."**

### Core engagement loop

User submits one experience → product immediately renders a single synthesized paragraph ("Your 1998 Lumberton triangle is one of 23…") → offers one Hint ("This 1997 Robeson County report sounds similar. Is it related?") → user confirms → that report is now in their archive timeline. Repeat one Hint per visit, forever. Every few days, an email/push: "We found one more thing in your archive."

### Free vs. subscription

| | Free | Subscribed ($5.99) |
|---|---|---|
| Submitted experiences | 1 | Unlimited |
| Synthesized AI paragraph | Yes | Yes |
| Hint queue | 3 lifetime | Unlimited, refreshed |
| Match list with citations | First 3, then "11 more →" | Full |
| Claim phenomena to archive | No | Yes |
| Peer connections | Hidden | Opt-in visible |
| Year-in-Review | Teaser | Full |
| Push/email digest | No | Yes |

### Ancestry-style "build your artifact"

Concretely: the user's archive becomes a single scrollable page they can share via a private link, structured as (a) header: their experience(s), (b) attached reports they've confirmed, (c) attached phenomenon pages, (d) attached peer connections, (e) timeline of when each was added. This is the "tree" — the artifact that compounds. Subscription stays sticky because that artifact loses its growth engine if you cancel.

### AI-surfaced connection mechanic

At submission, run the existing match RPC + a one-shot Haiku synthesis ("write 2 sentences locating this experience in the archive"). Render the paragraph immediately. Queue a Hint. After 72 hours, recompute matches against any new ingested reports — if new matches exist, push a Hint. The mechanism is silent; the labels say "we found one more thing," not "the AI re-ran."

---

## Tiered execution plan

**Tier 1 — this week (quick wins, ship in days):**

1. Rewrite labels: "Your Story" → "My Experience," "Library" → "My Archive," "Explore" → "The Field." "Fingerprint" → "Signature." "Signal" → "Connections."
2. Promote the `SinceLastVisitLine` to full-bleed on return visits — when delta > 0, replace the page hero with the delta sentence + a one-tap micro-feed.
3. Add a persistent "1998 Lumberton triangle ▾" pill in the Lab header that follows the user across all three (current) tabs, so context never drops.
4. Add "Add another to your archive" pill below the header on every Lab visit (not just the empty state).
5. Replace four Signal cards with one synthesized prose paragraph at the top; demote the cards to an expandable "see the breakdown" below.

**Tier 2 — this month (structural):**

1. Ship the Hints queue. One card at a time, confirm/dismiss, persisted in `constellation_connections` (the table exists; needs a UI). Driven by the existing match + AI insight pipelines.
2. Collapse to one Lab page with a lens toggle in place of tabs. Keep the URL params (`?tab=`) as deep-link redirects.
3. Build the "archive timeline" view — the user's vertical spine showing their experiences and what's been attached, replacing the RADAR-as-workspace metaphor (keep RADAR as the reveal-animation flourish, not the everyday surface).
4. Restructure the paywall surface: at the first reveal, show "we found 14 matches — here are 3 — see the other 11" with the upgrade CTA inline.
5. Rewrite all Lab copy through the documentary voice guide.

**Tier 3 — next quarter (the flywheel):**

1. Phenomenon "claim" mechanic — logged-in users with a matching submission can pin a phenomenon page into their archive; phenomenon pages themselves render "12 people on Paradocs have a related account."
2. Peer connections, opt-in both ways — when two users' archives match strongly, both get a Hint. Builds the network effect.
3. Periodic re-analysis: when a user's submission was made 6 months ago, re-run the matcher against newly ingested reports; surface new matches as Hints. This is the "your archive keeps growing" promise made operational.
4. Shareable private archive links (Ancestry parallel: the public-facing "tree" with permissions).
5. The "guided experience submission" flow that demographic-segments the cold-start (the 65-year-old vs. 24-year-old branching).

---

## Risks & open questions

1. **Voice migration risk**: renaming "Signal" to "Connections" and "Fingerprint" to "Signature" requires moving live PostHog events, feature-flag keys, and existing email-digest copy. Schedule a single migration sprint and stop adding new instrumentation under the old names from now.
2. **What happens to multi-submission users?** The Ancestry-style single-spine works when there's one experience. Power users have 5+. Decide now: does the spine show "all of them, interleaved on a timeline," or is each its own archive? Recommendation: one combined timeline with sub-cards per experience, but the operator should test this.
3. **Hint supply problem**: if the AI can't find a new connection for the user this week, what does the Hint surface show? An empty Hint surface kills the loop. Solution candidates: (a) fall back to a phenomenon-page recommendation, (b) fall back to a related-region report, (c) fall back to an editorial pick. Don't ship Hints without a never-empty guarantee.
4. **The case-file metaphor**: "Collections" is good, but a meaningful share of users will never create one. Should the operator auto-create one collection per submitted experience and silently grow it? Suggested: yes, with a rename affordance.
5. **Paywall surface placement**: the audit shows three different upgrade entry points (`LockedAICard`, the Lab promo, the `/pricing` page). Pick the post-first-reveal moment as the canonical funnel surface; demote the others to passive footers.

---

*— The Panel*
