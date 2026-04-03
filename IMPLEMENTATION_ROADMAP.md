# Paradocs — Implementation Roadmap to Closed Beta (v2)

**Date:** April 1, 2026 (updated April 1, 2026 — v2.1)
**Timeline:** 4 weeks (Target: April 30, 2026)
**Team:** Chase + Claude sessions (2-3 sessions/day)
**Prerequisite docs:** `UX_SIMPLIFICATION_PLAN.md` (design vision), `PROJECT_STATUS.md` (full context)

---

## Guiding Principles

1. **Consolidate before you build.** The 30-route app becomes a 4-tab app before any new feature ships.
2. **Content volume is the product.** 100K+ reports with AI hooks makes the Feed addictive. Everything else is secondary.
3. **Every feature must answer: does this create a daily habit, a viral share, or deeper investment?** If none, cut it.
4. **Mobile-first, always.** 80% of users are on phones. 375px is the primary viewport.
5. **Session discipline.** Every Claude session reads the roadmap, updates PROJECT_STATUS.md, and leaves a handoff doc.

---

## The Sprint: 4 Weeks to Beta

```
     WEEK 1                WEEK 2                WEEK 3                WEEK 4
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ RESTRUCTURE      │ │ FEED + FEATURES  │ │ MONETIZE +       │ │ NATIVE + LAUNCH  │
│ + SCALE          │ │                  │ │ ENGAGE           │ │                  │
│                  │ │ Days 8-10: Feed  │ │ Days 15-17:      │ │ Days 22-23:      │
│ Days 1-3: UX    │ │  evolution +     │ │  Payments +      │ │  Native app      │
│  consolidation   │ │  new features    │ │  gating          │ │ Day 24:          │
│ Days 4-5:       │ │ Days 11-12:      │ │ Days 18-19:      │ │  Onboarding +    │
│  Ingestion      │ │  Engagement +    │ │  Social layer    │ │  reward system   │
│ Days 6-7:       │ │  psychology      │ │ Days 20-21:      │ │ Days 25-27: QA   │
│  Report page    │ │ Day 13-14:       │ │  Polish +        │ │ Days 28-30:      │
│  redesign       │ │  Audio test +    │ │  skeptic mode    │ │  LAUNCH          │
│                  │ │  share cards     │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## WEEK 1: Restructure + Scale (Days 1-7)

### Days 1-2: UX Consolidation (3-4 sessions)

**Session A1: Lab + Nav + Profile** (the big consolidation)

Build the new `/lab` page — single tabbed view replacing 10 dashboard routes:
- 4 horizontal tabs: **Saves** | **Cases** | **Map** | **Notes**
- Saves tab: grid of saved reports, filter by category. Inline AI insight cards (absorbs `/dashboard/insights`)
- Cases tab: case files + submitted reports (absorbs `/dashboard/research-hub` + `/dashboard/reports`)
- Map tab: constellation mind-map (absorbs `/dashboard/constellation`)
- Notes tab: journal entries with inline create/edit (absorbs `/dashboard/journal/*`)
- Gear icon → settings bottom sheet (absorbs `/dashboard/settings`)
- Notification bell → digests/alerts (absorbs `/dashboard/digests`)
- New `/profile` page: public researcher identity + subscription management (absorbs `/dashboard/subscription` + `/researcher/[username]`)

Rewrite `MobileBottomTabs.tsx` to new 4-tab structure (NO FAB):
```
Feed (flame) | Explore (compass) | Lab (telescope) | Profile (avatar)
```
Report submission accessible from: (1) contextual CTA on report pages, (2) option inside Lab.

Kill the "More" bottom sheet entirely. Update desktop header nav to match.

301 redirects: all `/dashboard/*` → `/lab`, `/discover` → `/feed`

**Session A2: Explore Consolidation**

Merge `/explore`, `/map`, `/search`, `/phenomena` into one page with 3 mode tabs:
```
[Map] [Browse] [Search]
```
- Map mode: existing MapLibre GL map, relocated
- Browse mode: category tiles → subcategory → report list (merges `/explore` + `/phenomena`)
- Search mode: keyword + AI search (relocates `/search`)
- URL params preserved: `/explore?mode=map&lat=33` etc.
- Redirects: `/map` → `/explore?mode=map`, `/search` → `/explore?mode=search`

### Days 3-4: Ingestion at Scale (2-3 sessions, runs in parallel with Day 5+)

**Session B1: Adapter Hardening**

Priority adapters by volume:
1. NUFORC (~150K UFO reports) — verify date parsing, location extraction, category mapping
2. Reddit-v2 (r/UFOs, r/paranormal, r/HighStrangeness, r/Experiencers, r/NDE, r/Ghosts) — subreddit-to-category mapping, crosspost dedup, quality filtering
3. BFRO (~5K bigfoot) — geographic extraction, date handling
4. NDERF/IANDS (NDE reports) — narrative extraction
5. Erowid — category mapping, content filtering

Per adapter: dry-run 50 reports, inspect output, fix issues, verify dedup and quality filters.

**Session B2: Mass Ingestion Execution**

Run all working adapters. Target: 100K+ approved reports.
- Batch feed hook generation (Claude Haiku) — non-blocking
- Batch Paradocs Analysis generation — non-blocking
- **Audio narration:** DEFERRED pending experiment results (see Session C2). Do NOT batch-generate until quality is validated.
- Batch vector embedding — non-blocking
- Sample-check every 10K batch: title quality, category accuracy, hook quality

### Days 5-7: Feed Evolution + New Features (4-5 sessions)

**Session C1: Feed Enhancements — Community Toggle + Hypothesis DB**

- Add "For You" / "Community" toggle at top of Feed page
- Community tab: placeholder for beta ("Be one of the first researchers to contribute")
- New DB migration — hypothesis tables:
  - `hypotheses` (id, user_id, title, reasoning, status, ai_generated, source_pattern, evidence_report_ids, created_at, published_at)
  - `hypothesis_evidence` (id, hypothesis_id, report_id, user_id, evidence_type, note, created_at)
  - `hypothesis_interactions` (id, hypothesis_id, user_id, interaction_type, linked_hypothesis_id, created_at)
  - `hypothesis_votes` (id, hypothesis_id, user_id, vote [agree/disagree], created_at)
- RLS policies on all new tables
- New card component: `HypothesisCard.tsx`

**Session C2: Audio Narration — EXPERIMENT (not full launch)**

Audio is a test-first feature. This session generates test samples, not production infrastructure:
- Generate 10-15 test narrations across categories (UFO, NDE, cryptid, ghost, alien abduction)
- Test both "onyx" (deep, authoritative) and "nova" (warm, engaging) voices
- Evaluate: Does the CONTENT sound good spoken aloud? Are feed hooks compelling as audio?
- If YES → build full audio infrastructure in Week 3 (player UI, Play Feed mode, persistent mini-player)
- If NO → identify what text generation prompts need to change before investing in full build
- UI: design Listen button into report layouts (inactive until quality validated)
- Budget: < $5 for test generation

**Session C3: Real-Time Event Detection + Daily Briefing**

Real-time flap detection:
- New API: `POST /api/cron/detect-flaps` — runs hourly
- Logic: for each region + category, compare report count in last 48h vs. 30-day baseline. If >200% above baseline, flag as active flap.
- New DB table: `active_events` (id, region, category, report_count, baseline_count, percentage_above, started_at, ended_at)
- Feed banner: "LIVE — 7 new UAP reports in New Jersey in the last 48 hours" at top of Feed when active event exists in user's region (or globally if significant enough)

Daily Briefing:
- New API: `POST /api/cron/daily-briefing` — runs at 8 AM user's timezone (or single global run)
- Generates personalized briefing card per user:
  - New reports near them (geo proximity)
  - Updates on hypotheses they've interacted with
  - Today's most compelling report (highest engagement score)
  - Active flaps
- Stored in `user_briefings` table, surfaced as pinned card at top of Feed each morning
- Push notification (when native app ships): "Your Paradocs morning briefing is ready"

**Session C4: "You're Not Alone" Matching + Nearest Report Onboarding**

"You're Not Alone" — triggered on save or submit:
- Query: reports within 50 miles + same category + vector similarity > 0.8
- Surface as toast notification: "12 similar experiences reported within 50 miles"
- Tap → filtered view of those reports (no user identities unless opted in)
- Store match data for hypothesis suggestion engine (user's saves cluster with nearby reports)

Nearest Report onboarding:
- After category selection in cold start, geolocate user (browser geolocation API)
- Query: nearest report to user's coordinates
- Display: "The closest reported sighting to you: a 2019 UAP encounter 3.2 miles from your location"
- This is the emotional hook that converts "interesting app" to "this is happening in MY neighborhood"

**Session C5: Research DNA + Milestone-Triggered Share Cards**

Research DNA visualization:
- Generated when user has 20+ saves
- Component: `ResearchDNA.tsx` — visual breakdown of user's interests
  - Category distribution (radar chart or pie)
  - Geographic focus (mini map with their save locations)
  - Top phenomena explored
  - Unique stat: "You've explored reports spanning 47 years and 12 states"
- Shareable as image (canvas → PNG export) or as link to public profile
- Accessible from Profile tab

Share cards — TWO MODES:

**Mode 1: Milestone-triggered (proactive, celebratory):**
- Milestone event system: `user_milestones` table tracks achievements
- Triggers: 10+ agrees, pattern candidate, Research DNA ready, Community Discovery, flap in region
- Auto-surfaced at moment of maximum emotional investment

**Mode 2: On-demand evidence cards (reactive — "PROVE IT"):**
- "Share with Evidence" button on every published hypothesis user has contributed to
- Generates credibility artifact: hypothesis title + evidence count + corroboration % + direct link
- Designed for dropping into Reddit threads, Twitter replies, comment sections as proof
- The link is the conversion funnel — skeptic clicks → sees structured evidence → becomes user

Both modes:
- OG meta tags + custom `/api/og/hypothesis/[id]` image generator for rich link previews
- Share sheet with pre-written text (editable)
- Proactive cards = celebration tone; reactive cards = research citation tone

**Session C6: Reward Behaviors + Celebration System**

Implement the Research Momentum Framework across all interaction points:

Celebration moments (haptic + visual):
- First save: subtle confetti + "Your research has begun" toast + light haptic
- 10th save: "The AI is now analyzing your collection" + Lab tab glow indicator + medium haptic
- First AI insight: prominent card with discovery framing + success haptic
- First published hypothesis: card animates into Community feed in real-time + success haptic
- 10 corroborations: notification with count + researcher names + success haptic
- Pattern Candidate: "Your hypothesis is being reviewed" + anticipation animation
- Community Discovery: full-screen celebration — "You helped discover something"

Progress indicators:
- Lab shows progress toward next milestone: "Save 4 more reports for AI pattern detection"
- Hypothesis shows corroboration progress: "3 more corroborations to Pattern Candidate"
- Zeigarnik hooks in notifications: "Your hypothesis is 73% of the way to Pattern Candidate"
- Endowed progress: after onboarding category selection, show "We found 47 reports matching your interests — you're already started"

Hick's Law audit:
- Verify every screen has ONE primary action
- Report card: tap (one action, not three buttons)
- Hypothesis suggestion: 2 choices max (Refine & Publish / Dismiss)
- Feed filter: binary toggle only (For You / Community)

Fitts's Law audit:
- All CTAs minimum 44pt tall, in thumb zone
- Sticky action bars at bottom of report pages
- Tab bar targets: full width/4, minimum 80px wide, 49pt tall
- "Refine & Publish" = full-width button at bottom of suggestion card

Apple HIG compliance pass:
- SF Symbols for all icons
- Dynamic Type support
- Safe area respect on all screens
- System presentation styles for sheets/modals
- Haptic patterns: light (save, vote), medium (publish, corroborate), success (milestone)

---

## WEEK 2: Monetize + Engage (Days 8-14)

### Days 8-10: Payments + Gating (3 sessions)

**Session D1: Stripe Integration**

BLOCKED on: STRIPE_SECRET_KEY env var. Chase must create Stripe account first.

- Create Stripe products/prices for Core ($5.99/mo) and Pro ($14.99/mo)
- `POST /api/stripe/create-checkout` — creates Stripe Checkout Session
- `POST /api/stripe/webhook` — handles subscription lifecycle events
- On success: update `user_subscriptions` table
- Billing portal: link to Stripe Customer Portal
- UI in Profile tab: current tier, usage meter, upgrade/downgrade

**Session D2: Depth Gating**

Make gates real and contextual:
- Report detail: 2-3 free/day → contextual gate referencing the specific report
- Save: 5 free items → "Upgrade to save unlimited + get AI insights on your collection"
- AI search: keyword free, semantic gated at Core
- Ask the Unknown: 1 free/week
- Lab features: Saves free (up to limit), Cases Core+, Map/Constellation Pro+, AI suggestions Core+
- Gate copy is DYNAMIC — references what user is looking at

**Session D3: Agree/Disagree Voting + Weekly Discovery**

Lightweight participation:
- On each HypothesisCard: agree/disagree buttons (single tap, not a modal)
- Vote tallies shown: "73% of researchers agree"
- Votes feed into AI pattern confidence scoring
- Users who vote are more likely to get hypothesis suggestions (they're engaged)

Weekly Discovery editorial:
- New API: `POST /api/cron/weekly-discovery` — runs Sunday evening
- Selects the most interesting community finding of the week (highest corroborations, most votes, biggest flap)
- Generates editorial summary via Claude Haiku
- Pushes as notification + email + pinned feed card on Monday morning
- "This week on Paradocs: The community discovered that NDE reports spike during periods of high solar activity. 200+ reports analyzed."

### Days 11-12: Social Layer Foundation (2 sessions)

**Session E1: AI Hypothesis Suggestion Engine**

- Cron job: `POST /api/cron/suggest-hypotheses` — runs daily
- For users with 10+ saves:
  1. Fetch save metadata (category, location, date, phenomenon_type)
  2. Pattern detection (V1 heuristic):
     - Temporal clustering: >3 saves in same month/season
     - Geographic clustering: save locations within 100km radius
     - Category correlation: 3+ saves across categories sharing attributes
     - Semantic clustering: tight vector embedding clusters
  3. If pattern found: generate hypothesis via Claude Haiku (title + reasoning + linked reports)
  4. Insert as status='suggested' in `hypotheses` table
  5. Surface in Lab Saves tab as Hypothesis Suggestion Card
- "Refine & Publish" flow: user edits AI draft → publish → enters Community feed

**Session E2: Corroborate / Challenge / Extend**

On published hypothesis cards in Feed:
- **Corroborate** (up arrow): "I have evidence supporting this" → select reports from your saves → links as supporting evidence
- **Challenge** (down arrow): "I have contradicting evidence" → same flow, links as counter-evidence
- **Extend** (arrow right): "I have a related theory" → opens hypothesis refinement with parent linked

Cross-user matching:
- When a user's AI-suggested hypothesis is similar to an existing published one: "Your pattern matches @researcher_jane's hypothesis. Want to corroborate with your evidence?"
- Vector similarity between hypothesis embeddings > 0.85

### Days 13-14: Polish + Skeptic Mode (2 sessions)

**Session F1: Skeptic Mode Platform-Wide**

- Toggle in Profile settings: "Skeptic Mode"
- When enabled across the app:
  - Report detail: mundane explanations and credibility score shown prominently (already generated in Paradocs Analysis)
  - Hypothesis cards: show "Alternative explanations" section
  - Feed hooks: credibility indicator visible on every card
  - Analytics: baseline comparisons shown by default
- Already partially built: `SkepticMode` component exists on pattern detail pages. Extend pattern.

**Session F2: Citation Generation + Feed Polish**

One-click citations:
- Button on report detail page and hypothesis detail page: "Cite This"
- Generates APA, Chicago, plain-text formats
- Copies to clipboard with one tap
- Format: `[Author/Source]. (Year). [Title]. Paradocs. Retrieved from https://beta.discoverparadocs.com/report/[slug]`

Feed polish:
- Verify card rendering at all screen sizes
- Swipe gesture performance audit
- Image lazy-loading
- Feed hook quality audit (sample 50 reports, flag weak hooks for regeneration)
- Audio playback testing across devices

---

## WEEK 3: Native + Launch (Days 15-21)

### Days 15-16: Native App (2-3 sessions)

**Session G1: Capacitor Setup**

- Install: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`
- Configure `capacitor.config.ts` pointing to Next.js output
- iOS + Android project scaffolding
- Plugins: push-notifications, share, browser, haptics, splash-screen, status-bar
- Deep linking: `paradocs://report/[slug]`, `paradocs://hypothesis/[id]`
- App icon (1024x1024), splash screen (branded)

BLOCKED on: Apple Developer Account ($99/year) for iOS TestFlight.

**Session G2: Push Notifications**

- Daily briefing notification (8 AM)
- "You're Not Alone" proximity notification (on save)
- Hypothesis suggestion notification ("We found a pattern in your saves")
- Corroboration notification ("Someone corroborated your hypothesis")
- Flap alert notification ("UFO reports near you are 340% above baseline")
- Weekly Discovery notification (Monday morning)
- Backend: `POST /api/notifications/send` using Capacitor Push + web push for PWA fallback

### Days 17-19: Onboarding + QA (2-3 sessions)

**Session H1: Onboarding Flow**

Cold start:
1. "What draws you in?" — pick 3+ category tiles (full-screen, beautiful)
2. Optional: allow location access ("See reports near you")
3. If location granted: "The closest sighting to you: [report title], [distance] away" — emotional hook
4. First Feed experience seeded with selected categories
5. After first save: celebration moment + "Save 9 more and our AI will start finding patterns"
6. Lab empty state: welcoming, shows progress toward AI suggestions

**Session H2-H3: Full Flow QA**

Test matrix (mobile-first):
- [ ] Cold start → category pick → nearest report → Feed browsing → save → account creation
- [ ] Free user: hit every gate (report views, saves, AI search, Ask the Unknown)
- [ ] Checkout: Stripe flow → webhook → tier upgrade → gates unlock
- [ ] Lab: all 4 tabs, AI insight cards, hypothesis suggestion → refine → publish
- [ ] Feed: For You mode, Community mode, audio play, swipe gestures, flap banner
- [ ] Explore: Map/Browse/Search mode switching
- [ ] Share: report share card, hypothesis share card, Research DNA share
- [ ] Skeptic Mode: toggle on/off, verify all pages respond
- [ ] Push notifications: daily briefing, proximity, hypothesis
- [ ] Performance: Feed < 2s load, no jank on swipe, images lazy-load
- [ ] Audio: play individual, play feed mode, persistence across tabs

### Days 20-21: Beta Launch

**Session I1: Beta Infrastructure**

- Beta invite codes: `beta_invites` table (code, max_uses, used_count, expires_at)
- Signup flow requires invite code during beta period
- Admin: generate codes, track usage, monitor DAU
- Analytics additions: session depth, save rate, conversion rate, hypothesis publish rate, audio play rate
- Error monitoring: 500s, broken flows

**LAUNCH:**
- Generate first batch of invite codes
- Distribute to closed beta list (from `/beta-access` signups)
- Monitor first 48 hours: error rates, completion rates, conversion funnel

---

## Collective Progress Bar (Ships Week 1 of Beta)

Once beta users are active and hypotheses are flowing:
- Visible at top of Community mode in Feed
- "3 confirmed patterns this month. 12 hypotheses approaching threshold. 847 more corroborations needed."
- Recomputed hourly from hypothesis + interaction counts
- This is the gamification that doesn't feel like gamification — collective scientific progress

---

## Feature → Retention Mapping

| Feature | Retention Trigger | Timeframe |
|---------|-------------------|-----------|
| **Nearest Report onboarding** | "This is happening near me" emotional hook | Day 0 (first minute) |
| **Feed with audio** | Addictive content consumption, new usage contexts | Day 1+ |
| **Daily Briefing** | Reason to open app every morning | Day 1, Day 3, Day 7+ |
| **Save → "You're Not Alone"** | Emotional validation, local connection | Day 1-3 |
| **Depth gates** | Urgency to subscribe | Day 2-5 |
| **AI hypothesis suggestion** | Discovery moment — "I didn't notice that pattern" | Day 7-14 (after 10+ saves) |
| **Publish hypothesis** | Social investment, identity as researcher | Day 14+ |
| **Agree/disagree voting** | Low-friction participation for everyone | Day 1+ |
| **Research DNA** | Shareable identity, viral loop | Day 14+ (after 20+ saves) |
| **Weekly Discovery** | Re-engage lapsed users | Weekly |
| **Flap alerts** | "It's happening NOW" urgency | Sporadic, high-impact |
| **Skeptic Mode** | Credibility for the 66% skeptical audience | Persistent |
| **Citations** | Professional utility, infrastructure stickiness | Ongoing |
| **Corroborate/challenge** | Deep social investment, collective mission | Day 14+ |

---

## Tier Gating (Revised for New Features)

| Feature | Free | Core ($5.99) | Pro ($14.99) | Enterprise ($99) |
|---------|------|-------------|-------------|-----------------|
| Feed browsing | Unlimited | Unlimited | Unlimited | Unlimited |
| Audio narration | 5 plays/day | Unlimited | Unlimited | Unlimited |
| Report detail view | 3/day | Unlimited | Unlimited | Unlimited |
| Save reports | 10 max | Unlimited | Unlimited | Unlimited |
| AI search | Keyword only | Semantic | Semantic + filters | Full API |
| Ask the Unknown | 1/week | 10/week | Unlimited | Unlimited |
| Hypothesis voting | Unlimited | Unlimited | Unlimited | Unlimited |
| AI hypothesis suggestions | Preview (blurred) | Full access | Full access | Full access |
| Publish hypotheses | No | Yes | Yes | Yes |
| Corroborate/challenge | No | Yes | Yes | Yes |
| Case files / Research Hub | No | Basic (3 files) | Unlimited | Unlimited |
| Constellation | No | View only | Full edit | Full edit |
| Research DNA | Basic | Full + shareable | Full + shareable | Full + shareable |
| Daily Briefing | Generic | Personalized | Personalized | Personalized |
| Weekly Discovery | Yes | Yes | Yes | Yes |
| Skeptic Mode | Yes | Yes | Yes | Yes |
| Citations | No | Yes | Yes | Yes |
| Data export | No | No | Yes | Bulk |
| API access | No | No | 1K calls/mo | 10K calls/mo |
| Field equipment data | No | No | Yes | Yes |
| Team members | No | No | No | Up to 10 |

---

## Blockers (Chase Action Items)

| Blocker | Impact | Priority |
|---------|--------|----------|
| **Create Stripe account + add STRIPE_SECRET_KEY to Vercel** | Payments completely blocked | Do before Day 8 |
| **Verify ANTHROPIC_API_KEY on Vercel** | AI generation at scale blocked | Do before Day 3 |
| **Verify OPENAI_API_KEY on Vercel** | Embeddings + audio narration blocked | Do before Day 3 |
| **Apple Developer Program ($99/year)** | iOS TestFlight blocked | Do before Day 15 |
| **Approve ~$200 for ingestion AI costs** | Mass ingestion blocked | Do before Day 3 |

---

## Audio Narration: Technical Spec

**Provider:** OpenAI TTS-1-HD
**Voice:** "onyx" (deep, authoritative) or "nova" (warm, engaging) — test both, pick one as the "Paradocs voice"
**Cost:** $15/M characters. Average hook + analysis = ~500 chars = $0.0075/report. 100K reports = ~$75 total.
**Generation:** During ingestion batch, after hook + analysis are generated. Non-blocking.
**Storage:** MP3 files in Supabase Storage bucket `audio-narrations/`, keyed by report slug.
**Playback:** HTML5 `<audio>` element. React context (`AudioPlayerContext`) manages playback state across tabs.
**Play Feed mode:** Queue system — current card's audio plays, on completion auto-advance to next card + play.
**Fallback:** If no pre-generated audio, generate on-demand via `/api/tts/generate?slug=[slug]` (1-2s latency).

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| April 1 | Hypotheses are AI-suggested, not user-created | Quality floor + zero friction + discovery moment |
| April 1 | Community mode woven into Feed, not separate page | Reduce complexity, interleave not segregate |
| April 1 | 4-tab bottom nav (Feed/Explore/Lab/Profile) | 30+ routes → 13 routes, every feature in 2 taps |
| April 1 | Stripe web checkout (not IAP) for beta | Avoid Apple 30% cut during beta |
| April 1 | OpenAI TTS-1-HD for narration (not browser TTS) | Quality matches brand positioning. ~$75 for 100K reports. |
| April 1 | Agree/disagree as lightweight participation | 80% of users won't publish hypotheses but can still contribute signal |
| April 1 | Nearest report as first onboarding moment | Emotional gut-punch that localizes the experience |
| April 1 | Daily Briefing as primary retention mechanism | Every successful consumer app needs a daily habit trigger |
| April 1 | Research DNA as viral mechanic | Spotify Wrapped for paranormal — shareable identity artifact |
| April 1 | 3-week sprint, not 6 | Chase + Claude at 2-3 sessions/day can move fast |
| April 1 | Remove [+] FAB, go to true 4-tab nav | Report submission is low-frequency; wastes thumb-zone real estate. Contextual CTAs + Lab option sufficient. |
| April 1 | Lab icon = telescope, not flask | Telescope = "looking for what others can't see" — on-brand for paranormal research |
| April 1 | Audio narration = experiment first | Content quality risk — test 10-15 samples before platform-wide build |
| April 1 | Share cards = milestone-triggered | Nobody shares boring stats; share cards surface at compelling moments only |
| April 1 | Apple HIG compliance across all screens | Professional quality, accessibility, platform-native feel |
| April 1 | Research Momentum Framework | Hick's Law, Fitts's Law, Hook Model, Zeigarnik Effect, celebration moments — systematic psychological design |
| April 1 | 4-week sprint (April 30 target) | Extra week for QA, reward system polish, audio experiment |

---

## Session Kickoff Template

Every implementation session should start with this prompt:

```
You are continuing work on Paradocs (beta.discoverparadocs.com).
Read these files first:
1. PROJECT_STATUS.md — full coordination context
2. IMPLEMENTATION_ROADMAP.md — sprint plan (find your session)
3. UX_SIMPLIFICATION_PLAN.md — design vision

Your task this session: [SPECIFIC SESSION ID + DESCRIPTION]

SWC compatibility: files integrating with existing SWC-constrained code
must use var, function(){}, and string concat. New standalone files can
use modern syntax.

When done: update PROJECT_STATUS.md with what you completed and any
cross-session impacts.
```
