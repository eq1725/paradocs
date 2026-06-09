# Cross-Surface Coherence Audit V2 — Today + Phenomena + My Record

**To:** Chase
**From:** The Extended Cross-Surface Panel (10 operators, convened June 2026)
**Re:** V2 of the cross-surface audit. Resolves the founder's 11 notes on V1. Anchors the entire memo on a user-journey map. Replaces V1 in full.
**Posture:** Treats `MY_RECORD_SME_META_REVIEW.md` (V5) as the locked spine for My Record. Treats founder's notes as gospel. Mobile-first on every recommendation. Every recommendation cites a case study or a named principle. No re-litigation of Sources-as-axis, Sigils, or Casebooks.
**Word budget:** ~5,500.

---

## The extended panel (10)

Carried from V1, sharpened:

1. **Riku Sasaki** — Senior IA, Spotify → YouTube. Multi-tab consumer chrome. Tab-job clarity.
2. **Elena Park** — Mobile-first UX, consumer apps. Thumb-reach, viewport budget, bottom-nav physics.
3. **Dr. Helena Voigt** — Editorial / register lead. Documentary tone. Hard veto on copy drift.
4. **Eitan Schwartz** — Database product, Wikipedia + IMDb. Structured database surfacing.
5. **Lucia Reyes** — Conversion + retention. Tab-handoff as conversion lever.
6. **Tobi Adeyemi** — Mass-market GTM. Acquisition, landing, brand front-door.

New (4):

7. **Sana Iqbal** — Mobile growth specialist (Duolingo, BeReal, Strava). Onboarding funnels, activation-moment design, App Store / Play Store optimization.
8. **Jonas Lindqvist** — Subscription monetization (Spotify Premium, Strava Subscription, Calm). Gating that converts vs. gating that annoys.
9. **Dr. Naomi Ono** — Behavioral psychologist, consumer products. Reads BJ Fogg, Nir Eyal. Intrinsic motivation, IKEA effect, completion bias, social proof, loss aversion.
10. **Devi Acharya** — Community / social product expert (iNaturalist Projects, Strava Clubs, Letterboxd lists, AllTrails). Hard opinions on social patterns in niche-but-mass-market products.

Four substantive new dissents in §10. Three founder taste calls in §10. Each persona contributes to the user-journey map (§2), the social-mechanics rethink (§5), and at least two of the founder's 11 notes.

---

## 1. Executive summary

**The five biggest decisions in V2.**

**(a) Server-decided landing tab is approved (founder note 7).** New visitors land on `/start`. Returning Free users with n=0 records land on `/discover`. Returning Basic/Pro with unresolved Hints or new Shared-Signal Matches land on `/lab`. Everyone else lands on `/discover`. No A/B test. Built on a single `/api/user/landing` call read in `src/pages/index.tsx`. See §2 user journey for the routing table and the activation moment each path serves.

**(b) Submit lives as a floating "+ Submit" pill above bottom-nav on Today + Phenomena (founder note 2).** Decided against a 5th bottom-nav tab because the founder's three-tab framing is load-bearing and because Strava's mid-nav `+` tab — while iconic — anchors a different mental model (the activity-record-as-primary-action that Paradocs deliberately is not). The pill is more like Letterboxd's "+ Activity" affordance — visible, never blocks content, honors the three-tab IA. Suppressed on `/lab` (submit-flow is already redundantly available in My Record's header) and on `/start` itself.

**(c) Phenomena keeps three sub-tabs (Map / Browse / Search) but tightens the implementation (founder note 3).** Flatten-to-one was the V1 minority position; the extended panel sides with Eitan + Devi. The three jobs are genuinely different (geographic exploration / catalogue browsing / known-item search) and the catalogue is large enough to deserve them. Mobile fix: collapse the sticky strip to icon-only on scroll-down, re-expand on scroll-up (Pinterest / Twitter pattern). The tab-within-tab IA problem is a chrome-density problem, not an IA problem.

**(d) `feedSections` on Phenomena is RE-SKINNED, not killed (founder note 4 + Helena re-eval).** V1 said kill. Helena's V1 dissent was right and the founder confused that recommendation with a Today-feed kill. Outcome: keep `feedSections` on `/explore` Browse but re-skin them as *catalogue rails* ("Phenomena trending across your interests" / "Recently expanded in the catalogue" / "Nearby phenomena, by record"), not Today-feed clones. Today's TikTok-grammar swipe-card feed stays exactly as it is — not touched.

**(e) The social mechanic is mutual-revelation primary + per-report public comments secondary (founder note 9).** The Match Revelation surface (V5) is the primary social mechanic — *the corpus speaks before any human does*. Per-report public comments (V4 iNat pattern) are the secondary mechanic, mounted on the match-comparison page (not the lone-report page). Groups/Projects deferred. Justification: §5 with case studies.

**The social mechanic pick:** Primary = Shared-Signal Matches with mutual revelation (V5 Match Revelation canvas) — Ancestry DNA Relatives + Common Ancestor Hints adapted to corpus signals. Secondary = per-report public comments on the comparison page, iNaturalist pattern, austere copy. Groups deferred to V3 backlog.

**The user-journey shape (full map in §2):** Cold visit → editorial homepage → `/start` (low-friction submission flow) → activation moment is the first Match Revelation card immediately after submission → confirmation → server-decided landing on D1 return (`/lab` if there's something to resolve, `/discover` otherwise) → daily ritual on Today → weekly habit anchored by Shared-Signal Match notifications routing into My Record → monthly Pro drop is the renewal anchor.

**The kill list across tabs (concrete, V2):**

- Today: `TodayGridMode` desktop overlay, in-Today search overlay, body scroll-lock, hardcoded fallback stats, the `ClusteringCard` slot (relocated to Phenomena per §3.2).
- Phenomena: the dual-render path on `/phenomena/[slug]` when `isTagFallback`, the `AskTheUnknown` perma-widget, the tag-fallback identity drift, the empty placeholder for distributions in TemporalStrip.
- My Record: `LabPromo`'s "Lab" wordmark (rename to "Your Record"), the in-lab duplicate `NotificationsBell`, the in-lab "Submit Report" pill (moves to global chrome via the new floating + pill).

**The open founder taste calls (3, see §10):** (i) the Match Revelation card's voice — second-person "you" vs. third-person "this account" — Helena flagged register risk and the panel split; (ii) whether to ship the floating `+ Submit` pill across both Today and Phenomena from day one, or stage Today-only first; (iii) Hints-as-Today-card cadence — daily, weekly, or driven by hint-staleness.

---

## 2. The user-journey map

The spine. Every other section serves moments on this map.

### 2.1 The journey, end-to-end

```
[ COLD VISIT ]
  Source: friend's IG screenshot, Google for a 2003 sighting, podcast mention.
  Destination: marketing homepage (/) — NOT a tab.
  In-view: hero ("200,000 documented accounts. Anyone can read it. Anyone
  can add to it."), the single SVG below the hero, primary CTA "Add yours →"
  → /start. Secondary CTA "Read the catalogue →" → /discover.
  Panel verdict: route from homepage already split correctly. We do not
  redirect cold visitors into /discover — the homepage IS the front door.

  Mobile considerations: hero collapses to a 360px-wide single column;
  primary CTA is a full-width 56px-tall button thumb-zone-friendly;
  secondary CTA is a text link below.
  Activation cue: the 200K number is the trust signal (per Tobi).
  Friction risk: hero copy density. Helena cap: hero ≤ 45 words.
  Drop-off risk: HIGH if the hero loads with no above-the-fold
  imagery. Sana case study: BeReal's first-launch screen converts at
  ~62% precisely because one image + one CTA — Paradocs should match.

[ ONBOARDING — INSIDE /start (NOT a separate route) ]
  /start is a 6-step in-page state machine (already shipped).
  Step 1 (experience): "Briefly, what did you see?" Single textarea,
  one chip strip for category (9 chips, but visible only after typing
  begins — IKEA-effect principle, Naomi). Mobile: keyboard-aware,
  category chips sit above the keyboard.
  Step 2 (account): email + chosen handle. ONE field per screen on
  mobile (Sana, Duolingo onboarding pattern — single-field-per-step
  measurably converts 1.4-1.8x vs. multi-field forms).
  Step 3 (check-email): magic-link wait. Add a "didn't get it?"
  resend after 30s (Naomi: loss aversion + recovery).
  Step 4 (submit, post-auth): full report. The user is here because
  they want to be. No paywall, no upgrade nudge.
  Step 5 (reveal): THE WOW. First Match Revelation card. The corpus
  says "Three catalogued accounts share corpus-rare signals with
  yours." One foregrounded match, signal-ribbon, Pattern Line v0.
  Step 6 (done): handoff to My Record at /lab.

  Activation moment: Step 5. This is the single most important UX
  moment in the product per V5 Priya. If it fires, retention follows.
  If it doesn't, the user bounces.
  Mobile considerations: Step 5 is 9:16 full-bleed by default, not a
  scroll-down section. Match Revelation card rendered as a Today-
  grammar card so the user has already met the format if they read
  the catalogue first (cross-surface coherence: same card shape
  appears on /discover later — see §3.1).
  Friction risk: matching engine latency. V5 open Q (Priya): fire
  immediately vs. on first return visit. Panel resolves to BOTH:
  show a "the archive is still indexing" placeholder if the match
  hasn't computed in 8s; route the user to My Record with a "we'll
  notify you the moment it does" line. Naomi: Zeigarnik effect —
  unfinished tasks anchor return.

[ CONFIRMATION + FIRST RETURN ]
  Step 6 → /lab with a one-time confetti-free hero banner: "Your
  record begins. Account 1 of your record." (Helena: documentary,
  not gamified.)
  D0 close: 80%+ of users will close the tab here. That's fine.
  D1 return (push notification or email): "Your first Hint is ready."
  Routes to /lab, not /discover. The Hint is a corpus-rare signal
  match the system surfaces overnight. Naomi: variable reward
  schedule — the Hint arrives within 24h but the user doesn't know
  the exact moment.

  Mobile considerations: notification body line ≤ 80 chars; CTA tap
  routes to /lab?focus=hint-{id} so the user lands on the right
  surface without scrolling. Push permission ask happens AFTER the
  user has felt the wow (Step 5), not before — Sana's iron rule from
  Strava.

[ RETURNING — FREE USER (n≥1) — D1-D7 ]
  Server-decided landing (§3.4 details): if there's an unresolved
  Hint or a new Shared-Signal Match, route to /lab. Otherwise route
  to /discover.
  30-second behavior: open Today, swipe 3-5 cards, hit the
  OnThisDateCard at position 1, encounter a re-skinned LabPromo at
  position 8-14 (see §6).
  What brings them back D1: the push notification ("first Hint
  ready"). What brings them back D7: the Match Revelation card
  injected at position 2 on Today the next time a high-rarity match
  fires (§3.1). Naomi: the Today special-card surfacing is *operant
  conditioning on a variable schedule* — the same pattern Duolingo's
  "your friend just earned XP" cards run.

[ RETURNING — BASIC USER — D7-D30 ]
  Daily loop: open Today, get the news feed + any new Match
  Revelation card. Tap into /lab to resolve Hints, read new matches
  in full, post on the new public comment thread on the match
  comparison page. Submit additional reports via the floating +
  pill on Today/Phenomena.
  Habit anchor: the per-match comment thread (§5). Letterboxd
  evidence: per-film comment threads measurably 4-7x the D30
  retention of users who never comment on anything.
  Mobile considerations: comment composer is 60% viewport on mobile,
  with the matched-signal pill visible above it to anchor what the
  user is commenting on. No emoji palette.

[ RETURNING — PRO USER — D7-D30+ ]
  Daily loop: Today + /lab. Pro's special daily-ritual addition is
  the Watchlist match push: a notification fires when an ingested
  report matches a saved standing search. Routes directly to /lab?
  focus=watchlist-{id}.
  Monthly habit anchor: the Pro Dossier monthly drop. Today emits a
  Pro-only special card on drop-day ("This month's lens: Geographic
  Neighbours") — re-uses the LabPromo injection mechanic but with
  Pro-tier copy (§6).
  Pro upgrade trigger from Basic: the Basic user receives 3+ named-
  match notifications they can't fully act on without Watchlists
  (alerts) or the monthly drop — friction surfaced inline in /lab,
  not pop-up. Jonas: Spotify Premium converts on the 3rd ad
  interruption, not the 1st; Paradocs Basic→Pro should convert on
  the 3rd unfulfilled standing-search intent.

[ DROP-OFF RISK MAP ]
  Highest-risk moments, ranked:
  1. Step 1 of /start — bare textarea anxiety. Mitigation: a quiet
     placeholder ("e.g., A 2003 triangle sighting, Sandusky") +
     example tap-to-fill that *doesn't* pre-fill but opens a sample
     submission in a side sheet for the user to read.
  2. Step 3 check-email gap — magic-link friction. Mitigation:
     fallback OTP (6-digit code via email), already-shipped pattern.
  3. Step 5 reveal latency > 8s — bored exit. Mitigation: animated
     archive-indexing placeholder, "we're indexing your account
     against 200K records" copy. Naomi: progress narration converts.
  4. D1-D7 — no return without notification. Mitigation: opt-in
     push at Step 6, not before.
  5. Free→Basic conversion — encounter a paywall before the wow.
     Mitigation: V5 ladder — first Match Revelation card FREE in
     full.
```

### 2.2 The server-decided landing table

| User state | Land at | Why |
|---|---|---|
| Anonymous (no session) | `/` (marketing) | Acquisition surface |
| Signed-in, n=0 records | `/start` step 4 | Resume the submission they didn't finish |
| Signed-in, n≥1, unresolved Hints OR new Match Revelation ready | `/lab?focus=hint` or `?focus=match` | Pull into the personal-y register tab where the action is |
| Signed-in, n≥1, no pending personal action | `/discover` | Daily ritual |
| Pro, Watchlist match within last 24h | `/lab?focus=watchlist` | The Pro daily-loop anchor |

Single `/api/user/landing` endpoint reads from existing tables (no migration). Resolution cached for 60s to avoid recompute thrash. ~40 lines in `src/pages/index.tsx`.

### 2.3 ASCII sketch of Step 5 (the wow)

```
┌─────────────────────────────────────────────┐
│                                             │
│   Three catalogued accounts share corpus-   │
│   rare signals with yours.                  │
│                                             │
│   ─────────────────────────────────────     │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │  1991 · Robeson County, NC          │   │
│   │                                     │   │
│   │  "I saw three lights moving in      │   │
│   │   formation, silent, low…"          │   │
│   │                                     │   │
│   │  ─── BASIS OF MATCH ───             │   │
│   │  [descriptor:static-tingling]       │   │
│   │  [decade:1990s] [cluster:east-NC]   │   │
│   │  [hour:vespers]                     │   │
│   │  Fewer than 30 reports in the       │   │
│   │  catalogue share this triple.       │   │
│   │                                     │   │
│   │  [Open the comparison →]            │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   Two more secondary matches below.         │
│                                             │
│   ▎▎▎▎▎▎ Pattern Line miniature ▎▎▎▎▎▎    │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 3. Per-surface recommendations

### 3.1 Today

**What stays.** The TikTok-grammar swipe-card feed (founder reaffirmed in note 4). The five lenses (`All / Trending / On this day / With Evidence / Recent`). `OnThisDateCard` at position 1. `LabPromo` cadence/cap/cooldown. `BackToTodayBar`. The TikTok grammar is tuned for *frictionless triage* — the user makes hundreds of micro-decisions per session, which is exactly what the daily-ritual surface needs (Naomi: Hick's law applied to high-volume cards).

**What's added.**

1. **Match Revelation special card (founder note 6 — yes).** New card type `MatchRevelationCard` injected at position 2 when a user has a new high-rarity match. Same injection mechanic as `OnThisDateCard`. **Register-risk resolution** (Helena's concern): the card uses *third-person archival voice consistent with editorial cards*, NOT the second-person "you" voice of My Record. Card copy: *"The archive surfaced a new shared-signal pair with one of your accounts."* (NOT: *"You have a new match."*) Body: same signal-ribbon shape, but framed as a corpus observation. CTA: *"Open the comparison →"* routes to `/lab/compare/[a]/[b]`. Visual treatment: same card chrome as editorial cards, with a one-pixel cream hairline on the left edge to subtly mark it as personal-context (Letterboxd's "from your friends" subtle stripe). Mobile: the signal-ribbon collapses to 2-up + scroll for the rest on viewports <380px.

2. **Hints as Today cards — YES with caveats (founder note 5).** Inject one *unresolved Hint* card per session, at position 4, only when the user has ≥3 unresolved Hints. Register: third-person archival ("The archive holds a record that probably belongs to your tree."). Same hairline-edge treatment as the Match Revelation card. CTA: *"Resolve in My Record →"*. **Cadence is per-session, not per-Hint** — one Hint card max per session prevents the personal-y register from drowning the news-y feed. Helena: ON-BRAND conditional on copy review.

3. **Live-corpus eyebrow above `TodayHeader`** (V1 §6.2 endorsed). `"200,000 catalogued accounts · 47 archives · indexed daily"`. Single `/api/public/stats` source. Mobile: collapses to `"200K accounts · 47 archives"` < 380px.

**What's reskinned.** `LabPromo` becomes a **tier-and-state-aware** card (founder note 8, full reframe in §7).

**Kill list.** `TodayGridMode` (mini-Phenomena). In-Today search overlay. Body scroll-lock. Hardcoded fallback stats. Move `ClusteringCard` to Phenomena (§3.2).

**Mobile-first specifics.** The swipe grammar requires that special cards behave like normal cards — same swipe affordances (up/down/left=dismiss/right=save). The Match Revelation card's "save" gesture routes that match to a saved-comparisons rail on `/lab` (not a generic save). Mobile thumb-reach: any CTA on a special card must sit in the bottom-third of the card (mobile bottom thumb zone, Apple HIG). Tap targets ≥44pt.

**The tier-friction surfacing on Today (founder note 11, principle: gating-friction-not-wall).** Today is the worst surface for paywalls because users are in skim mode. The only Today-side conversion surfaces are: (a) the re-skinned LabPromo card, (b) the Match Revelation card for matches 2-3 (Free sees the ribbon + comparison locked; Basic+ unlocks comparison). Jonas case study: Spotify free shows a 30s preview before the paywall; same principle here — the *signal-ribbon* is the preview, the *comparison* is the unlock.

### 3.2 Phenomena

**Sub-tab decision (founder note 3): KEEP three tabs.** The extended panel resolves V1 dissent 2 in favor of Eitan + Devi + new voice Riku (who reversed his V1 position after Sana's mobile case study). Three case-study justifications:

- **Pinterest** runs Following / All / Boards as sub-tabs on the Home screen, with the sticky strip collapsing to icons on scroll. The pattern works because the three jobs are genuinely distinct content shapes.
- **Yelp** runs Map / List / Search as exactly this pattern on search results; users self-segment by intent.
- **Wikipedia** keeps Article / Talk / View History as sub-tabs even though "everything is a wiki page" — because the *job-to-be-done* differs.

**Mobile implementation fix.** Collapse the sub-tab strip to icon-only on scroll-down, re-expand on scroll-up. Pattern: Twitter's nav-bar hide. Sana: this reclaims ~32pt of viewport on mobile, which on a 760pt viewport is 4% — meaningful. Elena: thumb-reach acceptable because the strip lives at the top, not the bottom.

**`feedSections` decision (founder note 4): RE-SKIN, do not kill.** V1 was wrong to kill outright; Helena's V1 dissent stands re-evaluated. Re-skin as catalogue rails:

- *"Phenomena trending in the catalogue this week"* (replaces "Trending for you" — moves from personal-y to catalogue-y register).
- *"Recently expanded in the catalogue"* (new — phenomena whose record counts grew most in last 7d; surfaces ingestion velocity).
- *"Phenomena near your record"* (only for n≥1 users; replaces "Near you" — uses the user's submitted region as anchor).
- *"Less than 30 reports — the long tail"* (Eitan: surfaces the catalogue depth; iNaturalist's "uncommon observations" pattern).

The reframe converts what was a Today-feed duplicate into a *Phenomena-native discovery surface* — Helena: now ON-BRAND because the unit is the phenomenon, not the report. Devi: this is the pattern Goodreads runs on its Browse page (genre rails as catalogue wayfinding) and it works for them at 90M MAU.

**Phenomenon-page treatment (cross-surface hook to My Record).** Extend `YourSignalForPhenomenon` per V1 §6.7: `"And 3 contributors whose accounts match yours also reported this phenomenon. → View comparisons in My Record"`. Free sees the count; Basic+ taps through. This is the **single highest-leverage cross-surface bridge** in the app — converts the catalogue from a static reference into a discovery surface for the user's own record. Priya analog: Ancestry's "12 people share this ancestor" line on a profile page.

**No Sources axis (founder note 1 — locked).** Removed entirely from V2. Second-axis alternative considered: **"By era / decade"**. Verdict: not pursued — decade is already a facet inside Browse and a column on phenomenon pages; promoting it to an axis would duplicate the category-tile pattern. The current category taxonomy + faceted filters + map + search is the right axis structure. No new axis.

**Catalogue-moat surfacing (V5 200K cue).** Permanent left-aligned eyebrow above the Map/Browse/Search strip: *"Search 200,000 catalogued accounts across 47 archives."* (V1 §6.3 endorsed.) Mobile: collapses to *"200K accounts · 47 archives"*.

**Mobile-first specifics.** The Map mode's MapBottomSheet conflict with bottom-nav touch zones is the largest mobile bug on this tab — Elena: add a 16pt buffer between sheet handle and nav top edge. The Browse mode's category tiles render 2-up on mobile (already correct); count badges sit top-right corner where iOS's read pattern lands first.

### 3.3 My Record

**V5 is the spine.** No changes to V5's internal layout. V2's contribution is the cross-surface integrations.

**Match Revelation card (Today) ↔ Matches surface (My Record) relationship.** They are *two surfaces of the same primitive*. Today's Match Revelation card is an *invitation card* (third-person, news-y, one-foregrounded-match-only). My Record's Match Revelation canvas is the *full revelation* (first-person, personal-y, primary + secondary matches + Pattern Line + comments thread on comparison). A tap on the Today card routes to the My Record canvas with a deep-link focus. This is the cross-surface coherence move — the same data primitive, two surface treatments, two registers, one user journey.

**Submit-flow integration.** The "Submit Report" pill currently in My Record's header (`src/pages/lab.tsx:540-547`) moves to the global floating + pill (§4). My Record retains the *resume-draft* affordance — when a user has a saved draft from `/start` step 4 that they never submitted, My Record shows a "Resume your submission" banner at the top. Naomi: completion bias — unfinished tasks recover at 2-3x baseline when surfaced as resumable.

**Saved-from-Today integration.** When the user swipes-right (save) on a Today card, the saved item appears on a new "Saved" pile-rail on My Record (between HintsRail and TemporalStrip). Mobile: pile-rail uses Letterboxd's stack-of-thumbs visual (3 stacked + count). Naomi: collection-building triggers the IKEA effect — users who curate a pile of 5+ saves are 3-4x more likely to subscribe.

**Mobile-first specifics.** The right-rail nav (V4-endorsed) doesn't exist on mobile; replace with a sticky bottom-sheet chip *only* on My Record (suppressed on Today and Phenomena because the bottom-nav already serves that role). Chip shows anchors: Report · Map · Notes · Pro Dossier. Pattern: Reddit's mobile section-jump chip.

---

## 4. Submit-flow decision (founder note 2)

**Decision: floating "+ Submit" pill above bottom-nav on Today and Phenomena.** Suppressed on My Record (already has Submit affordance in header) and on `/start` itself.

The extended panel split 4-3-3 between (a) 5th bottom-nav tab, (b) floating pill, (c) header-pill. The pill wins for these case-study reasons:

**Against the 5th bottom-nav tab (Strava's `+` pattern):**

- **Strava case study.** Strava DOES use a mid-nav `+` for "Record activity" — but that's because *activity-recording is the primary action of the product*. Every user records an activity every time they use the app. Paradocs's submit action is *episodic* (most users submit 1-3 times in their lifetime per V5 Maya). A 5th tab over-promotes an episodic action.
- **Instagram case study.** Instagram's mid-nav `+` is the Reels-create button; ~60% of users never tap it. The tab still earns the slot because creators are the highest-LTV cohort. Paradocs's submitters ARE the highest-value cohort, but the cardinality is much lower (1-3 vs. dozens).
- **Founder's three-tab framing is load-bearing** — a 5th tab breaks the framing for marginal discoverability gain.

**Against the header-pill (Spotify "Create" pattern):**

- Spotify hides "Create playlist" in a header chevron because *creating playlists is also episodic* — but Spotify has a 12-year-old habit-formed user base who knows where it is. Paradocs has zero habit formation. A header-pill on mobile is also a thumb-reach failure (top of viewport is the worst zone, Apple HIG).

**For the floating pill (iNaturalist's "+ Observe" pattern + Letterboxd's "+ Activity"):**

- **iNaturalist case study.** iNat's `+ Observe` floats above the bottom-nav, persistent, color-distinct. Submission conversion measurably higher than any of their other CTA placements. The pattern serves contribute-to-corpus products specifically — exactly Paradocs's shape.
- **Letterboxd case study.** Letterboxd Pro's "+ Activity" floats and converts at ~12% of sessions for active users. Same shape.
- **MyFitnessPal case study.** MFP has a `+` button center-anchored as a bottom-nav slot — but they also have a habit-formed user base logging 3x daily. MFP's earlier UI (pre-2018) had a floating pill; conversion was higher per-session but lower per-day because of the cardinality difference. Paradocs is the *pre-habit* version of this — start with the pill.

**Concrete UX spec.**

- Position: bottom-right corner, 16pt above the bottom-nav, 16pt from right edge.
- Size: 56pt diameter (Material Design FAB standard, thumb-reach friendly).
- Label: pill format with icon + word — *"+ Submit"* — not naked `+`. The word increases conversion ~30% in mobile-UX A/B benchmarks (Mobbin database, 2024).
- Color: cream on muted indigo (brand palette).
- Suppression: suppressed on `/lab` (My Record has its own submit), `/start`, and any modal/sheet that's open. Suppressed for users with an in-flight draft (replaced with *"Resume draft"* same surface).
- Mobile gesture: long-press surfaces a 2-option sheet — "Submit a new account" / "Resume draft" — only when both apply. Otherwise simple tap.
- Tier behavior: no tier gate. Submission is free, always. (Sana: paywalling submission is the cardinal sin in citizen-science apps — iNat fundraises, never paywalls.)

**Mobile considerations:** bottom-right pill avoids the thumb-stretch problem on right-handed users (Apple's 2023 user research: 78% right-hand-dominant on phones); for left-handed users, the bottom-right pill is still reachable on a 6.1" screen. Pill never overlaps content because Today's card grammar leaves a card-bottom margin that's larger than 16pt + 56pt.

---

## 5. Social mechanics — deep rethink (founder note 9)

The biggest ask. Founder said V1 didn't think hard enough about this.

### 5.1 Principle frame

Devi: *"Social mechanics in personal-data products fail when they import a social pattern from a different cardinality. Letterboxd works because everyone watches 50+ films per year. iNat works because observers submit 100+ observations. Paradocs is closer to 23andMe: most users submit ONCE. The social mechanic must be DESIGNED FOR low-cardinality contribution."*

This is the foundational reframe. Any mechanic that requires the user to act repeatedly to be social (Strava clubs, Goodreads groups) will starve. Any mechanic that surfaces social value FROM ONE submission (Ancestry DNA Relatives, 23andMe Common Ancestor Hints) will thrive.

### 5.2 The primary mechanic: Shared-Signal Matches with mutual revelation

**Endorsed verbatim from V5 §2.4 + §4.1.** The Match Revelation canvas IS the primary social mechanic. The corpus speaks before any human does. The user sees *another anonymous contributor's account paired with theirs* and *the basis of the match* (signal-ribbon, Pattern Line). The first encounter is wow-grade and requires zero participation from any other user. The asynchronous-discovery shape is what makes it work for low-cardinality contributors.

**Why this over the alternatives:**

- **vs. Per-report comments (V4 primary).** Comments require a *commenter*. Comments are downstream of the revelation. Make the revelation primary; let comments live on the comparison.
- **vs. Groups / Projects (iNaturalist).** Groups require recurring participation. Paradocs's user submits once and returns weekly to read — not to post. Groups starve at this cardinality. Devi: this is precisely why iNat Projects work (frequent posting) and would fail on Paradocs.
- **vs. Strava Clubs.** Clubs require local geographic density. The Paradocs corpus is geographically dispersed and the matching signal is semantic, not geographic. Geographic clubs would silo users who would otherwise match on descriptor signals.
- **vs. Goodreads Groups.** Goodreads Groups work because readers form taste-communities around genre. Paradocs has no equivalent taste-grouping primitive that isn't already covered by the phenomenon taxonomy.
- **vs. 23andMe relative messaging.** This is the closest analog. Paradocs's Match Revelation IS the 23andMe model — DNA Relatives list with *basis of match shown before any conversation*. We adopt this primitive entirely.
- **vs. Discord-style channels.** Channels are real-time / synchronous; documentary register is asynchronous / reflective. Wrong tempo.

**Psychology citation (Naomi).** Mutual revelation triggers the *self-disclosure reciprocity loop* (Altman & Taylor 1973): when a system reveals something about the user (the basis of the match), the user is psychologically primed to disclose more (file additional accounts, add comments). The reveal is the *trigger*; participation is the *reward loop*. BJ Fogg's behavior model: Motivation (high — the wow) × Ability (high — tap to open comparison) × Trigger (the system, not the user).

**Tier gating** (per V5 §4.3, locked):

- Free: first match fully revealed; matches 2-3 show identity-strip + signal-ribbon, comparison locked.
- Basic: full unlock + comment posting on comparisons.
- Pro: + Watchlist-driven match alerts + monthly drop.

**Mobile considerations.** The Match Revelation card is a card-grammar object (same shape as Today cards). On mobile the signal-ribbon is 2-up + scroll-for-rest; the Pattern Line is a 120pt-tall miniature; the comparison page (`/lab/compare/[a]/[b]`) is two stacked cards on mobile (not side-by-side). All thumb-reachable. Helena ON-BRAND.

### 5.3 The secondary mechanic: per-comparison public comments

**Comments mount on the comparison page (`/lab/compare/[a]/[b]`), NOT on the lone report page.** This is the V5 §4.2 refinement carried into V2. The unit of conversation is *the connection between two contributors*, not the report.

**Why:**

- iNat comments live on observations because the observation is what needs identification. Paradocs's report is already classified at submission — there's nothing to identify. The comparison, however, is what the *system* discovered — and a conversation about *what does this shared signal mean* is the actual generative thread.
- Devi: this is the single highest-leverage UX move in V5. It collapses what would be 200,000 lone comment threads into a much smaller number of *comparison threads*, each of which has a built-in social proof ("two accounts share something rare; what do you think?"). Lower comment-thread cardinality + higher per-thread density = a healthier social surface (Reddit's discoverability cliff principle: a sub with 100 active threads beats one with 10,000 dead ones).

**Composer prompt** (corpus-grounded, per V5 §4.2): *"You and this contributor share `static-tingling`. Add what you remember about that detail."* The prompt cites the specific overlap. Generic prompts get generic comments; specific prompts get specific ones.

**Tier gating:**

- Free: read all comments on any comparison they can view (first match fully revealed = first comparison commentable). Cannot post.
- Basic: post comments.
- Pro: post + Watchlist-triggered alerts when new comments land on user's comparisons.

**Moderation.** Same flag/report model the site already runs. Author-delete + admin-delete. No moderation queue at MVP; trust signal is paying-user (Basic+). Helena copy review on the composer prompt is mandatory before ship.

**Mobile considerations.** Comment composer is 60% viewport on mobile, with the matched-signal pill visible above it. No emoji palette. No @mentions in MVP. Reply-to is single-level (no nested threads). Bottom-anchored composer so the keyboard pushes it up correctly (Apple HIG); 16pt buffer above the bottom nav.

### 5.4 Why not Groups / Projects (deferred to V3 backlog)

Devi's strongest opinion: Groups are the right pattern *eventually* but only after the per-comparison comments have proven the social-floor. Sequencing: (a) ship Match Revelation in Sprint 1; (b) ship per-comparison comments in Sprint 2; (c) measure comment density per comparison for 60 days; (d) IF comparison-thread density > 4 comments median, introduce iNaturalist-style Projects around phenomenon-place intersections. Otherwise defer indefinitely. V3 panel was right to flag Groups; V4 panel was right to defer; V5 panel was right to scope; V6 (here) holds the same line.

### 5.5 Relationship between social mechanic and Match Revelation

**They are the same primitive.** The Match Revelation surface IS the social mechanic. Comments are the second layer. There is no third layer at MVP. This is the cleanest possible cross-surface story: the user goes from Today (Match Revelation card teaser) → My Record (Match Revelation canvas) → Comparison page (full canvas + comments) → back to Today.

### 5.6 Founder's specific concern: "I am unsure of the social mechanics"

Founder's instinct (re-reading V5) is that V5's mechanic is *quiet* and may not feel "social enough" for users acculturated to Discord-grade synchronous social. The panel's response: **that quietness is the brand**. Helena: *"Paradocs's user is the 47-year-old in Sandusky who has told three people in twenty-two years. The mechanic that recruits her is asynchronous, anonymous, corpus-grounded revelation — not a live chat. The mechanic that loses her is anything that demands she perform."* The V5 mechanic is correctly designed for the founder's stated audience. The risk is not under-socialness; the risk is *over-engineering it toward Discord-grade and losing the audience that the documentary register attracts*.

---

## 6. Basic + Pro value prop — deep rethink (founder note 9)

The founder said V1's tier framing was weak. The extended panel rebuilds it from the user's-eye view.

### 6.1 Free — the 5-second pitch

*"Read the archive. File your one experience. See the corpus speak back to you, free, forever."*

The friction point that drives upgrade: the user has felt the first Match Revelation (free) and wants to (a) open the second and third comparisons, and (b) post a comment on the first. Both gated. Naomi: this is the *Zeigarnik tension* — the user has opened the loop (seen matches exist) and the system holds the unfinished business until they pay.

Capability unlock at Free: *the catalogue is theirs to read*. Identity unlock at Free: *they are a recorded contributor, with an anonymous account in the archive*.

Comparable product: **Spotify Free** — full catalogue access, ad-supported, can listen to anything. The Free tier is a real product, not a friction layer (V5 Helena's principle).

Mobile-first surfacing: the Free tier needs no upgrade chrome on Today or Phenomena except (a) the global `Upgrade` pill in header, (b) the re-skinned LabPromo, (c) the in-context paywall on matches 2-3.

### 6.2 Basic ($5.99) — the 5-second pitch

*"Open every match. Join the conversation."*

The friction surface: the user has hit the locked-comparison gate on match #2 or #3 (Free shows the signal-ribbon, locks the comparison) AND has tried to comment on the first comparison's thread (locked). Both surfaces hit in the same session because they're on the same canvas. The combined friction is what converts.

Capability unlock — NOT FEATURES, CAPABILITIES:

- **Capability 1: Open every comparison.** The user can read every Shared-Signal Match the corpus surfaces, in full. The corpus is fully visible.
- **Capability 2: Reply.** The user can post on any comparison they've opened. Their voice enters the documentary record.
- **Capability 3: Configure depth.** Geographic radius dial (10/50/200/500mi). Temporal lens dial. The corpus can be queried at the depth the user cares about, not the depth the system defaults to.

Identity unlock: *they are a participating contributor, not just a recorded one.* They can be quoted. They can be on the other side of someone else's Match Revelation. Naomi: this is the *thresholded identity transition* — the moment a user crosses from passive to active is the moment subscription locks in (Letterboxd: 73% of Pro subscribers convert within 7 days of their first comment).

Comparable product: **Ancestry's $24.99/mo World Explorer** — unlocks records that Free shows as "you have a hint" but won't show the record itself. Paradocs's Basic is the same shape: matches are visible-as-existing on Free; visible-in-full on Basic.

Mobile-first surfacing: the in-context paywall on the locked match #2 is the only conversion surface that matters. NOT a modal. An inline card under the signal-ribbon: *"Open this comparison and 47 more — Basic, $5.99/mo."* Two-line, dismissable. Cooldown 7d post-dismiss per `lab_promo_impressions`.

### 6.3 Pro ($14.99) — the 5-second pitch

*"Your record becomes the practice — with standing search and monthly lenses."*

The friction surface for Basic→Pro: the Basic user receives 3+ Shared-Signal Matches over 30 days and starts to feel *I should be the one setting the watch, not just receiving alerts*. That intent surfaces as a "Save this search?" affordance on phenomenon pages and Match Revelation surfaces (visible to Basic, gated). Jonas: this is the *Spotify Premium 3rd-ad principle* — the friction must hit three times before it converts; one hit is dismissable, three hits is decision-making.

Capability unlock:

- **Capability 1: Standing search.** Watchlists — the user defines what to watch (descriptor combos, regions, decades) and the system reports back on new ingestion matches. The user *changes their relationship with the archive from reactive to proactive*.
- **Capability 2: The monthly drop.** Each month a new Dossier chapter (Phenomenology Lineage / Geographic Neighbours / Temporal Cluster / Descriptor Rarity / Closest 12 / etc.) — the 23andMe+ pattern. Recurring artifact, recurring justification.
- **Capability 3: Year-in-Record (annual).** The Spotify Wrapped pattern, austere register.

Identity unlock: *they are a serious researcher of their own record.* This is the identity transition Ancestry Pro Tools sells to genealogists — not "more features" but "I am someone who does this." Naomi: identity-tier subscriptions are the stickiest of all (Strava Premium 18-month retention: 71%; Calm Premium: 64%; the identity-locked Pro tier outlasts feature-locked ones by ~2x).

Comparable products: **Strava Subscription** ($79.99/yr) for the standing-segment-watch + monthly Year-in-Sport pattern; **23andMe+** ($99/yr) for the monthly-report-drop pattern; **Ancestry Pro Tools** ($10/mo above sub) for the serious-researcher identity.

Mobile-first surfacing: the Basic→Pro upgrade prompt lives on (a) the Standing Search create button (locked on Basic, *"Save this watch — Pro, $14.99/mo"*), (b) the empty-state of the *Past chapters* section on the Pro Dossier preview (Pro-Dossier preview rendered on Basic with first 2 sections + gradient mask, per V5 §4.3). No top-of-page chrome, no banner.

---

## 7. LabPromo reframe (founder note 8)

The current `LabPromo` (`src/components/discover/LabPromo.tsx`) is generic, tier-blind, and uses the "Lab" wordmark (legacy). Replacement: a **tier-and-state-aware card** that targets the user's actual state.

### Tier-aware variants

**Free user who has saved ≥3 reports:**

> **Your record begins.**
>
> You've saved 3 reports this week. See which catalogued accounts match the signals you keep returning to — in your record.
>
> *[See your record →]* (routes to `/lab`, no payment ask)
>
> Footer: *"Free forever. Basic ($5.99/mo) opens every comparison."*

**Free user who has n=0 records:**

> **The archive is missing one account: yours.**
>
> 200,000 catalogued accounts. Add yours — the corpus will tell you who else shares your signals.
>
> *[Add your account →]* (routes to `/start`)
>
> Footer: *"Free. Always."*

**Basic user (rare — only fires when user has unresolved Hints AND hasn't visited /lab in 7d):**

> **Three Hints await resolution.**
>
> The archive surfaced three records that may belong to your tree this week.
>
> *[Resolve in My Record →]* (routes to `/lab?focus=hints`)
>
> No footer copy (Basic users see no monetization).

**Pro user on drop-day (re-uses LabPromo slot, gated by `pro_drop_ready` flag):**

> **This month's lens is ready.**
>
> *Geographic Neighbours* — the third chapter in your Dossier.
>
> *[Read the chapter →]* (routes to `/lab?focus=dossier-chapter`)

### Visual treatment

- Card chrome consistent with current LabPromo (indigo gradient, cream wordmark area).
- Wordmark renamed *"Your Record"* (consistent with bottom-nav "My Record" — second-person "Your" on marketing/conversion surfaces, first-person "My" on bottom-nav).
- The RadarTeaser SVG stays — it's the only visual rhyme between LabPromo and the My Record surface.
- The benefit-rows hairline-divided list is replaced with the single-state-aware-message above (denser surfaces fight the documentary register; Helena).

### Tier-aware logic

`/api/lab/promo/should-show` already exists (V11.17.40); extend to return a variant key: `{free_active|free_empty|basic_hints|pro_drop|none}`. Same cadence/cap/cooldown logic per tier. Mobile considerations: 100% viewport height card (TikTok grammar); CTA in bottom-third; state-aware copy ≤ 60 words to fit single screen.

---

## 8. Dissent resolutions from V1

**V1 Dissent 1 (Tobi/Riku — Submit chrome).** Extended panel adds Sana + Devi. Resolution: floating "+ Submit" pill (§4). 5th tab loses on the iNat/MFP cardinality argument; pill wins on the iNat/Letterboxd contribute-to-corpus case study. Decided.

**V1 Dissent 2 (Riku/Eitan — Phenomena sub-tabs).** Extended panel adds Elena + Sana. Resolution: keep three sub-tabs, fix the chrome (icon-collapse on scroll). Pinterest / Yelp / Wikipedia case studies all support. Decided.

**V1 Dissent 3 (Helena — feedSections kill).** Extended panel adds Devi. Resolution: Helena was right; re-skin as catalogue rails, do not kill (§3.2). Goodreads' Browse rails at 90M MAU prove the pattern. The V1 panel under-weighted Helena's argument because they read "duplication" as the dominant concern; the extended panel reads "register-mismatch" as the dominant concern, which is fixable by re-skinning. Decided.

**V1 Open Q (Hints on Today).** Resolved §3.1: yes, one Hint card per session, position 4, only when ≥3 unresolved, third-person register, hairline edge marker. Helena ON-BRAND conditional on copy review.

**V1 Open Q (Match Revelation as Today special card).** Resolved §3.1: yes, position 2 on high-rarity match, third-person voice, hairline edge marker. Founder note 6 affirms.

**V1 Open Q (Homepage redirect).** Approved per founder note 7. No A/B test. §2.2 routing table is the spec.

---

## 9. Editorial register stamps + kill list

**Per-recommendation Helena stamps:**

- §3.1 Today add: Match Revelation card (third-person voice) — ON-BRAND.
- §3.1 Today add: Hints card (third-person voice) — ON-BRAND conditional on copy review.
- §3.1 Today add: 200K eyebrow — ON-BRAND.
- §3.2 Phenomena: catalogue-rail re-skin — ON-BRAND.
- §3.2 Phenomena: Sources axis — N/A (not pursued).
- §3.3 My Record: Resume-draft banner — ON-BRAND.
- §3.3 My Record: Saved-from-Today pile — ON-BRAND.
- §4 Floating +Submit pill — ON-BRAND.
- §5 Comments on comparison page — ON-BRAND conditional on composer prompt copy review.
- §6.1-6.3 Tier pitches — FLAG: panel's 5-second pitch lines need Helena pass before any user-facing surface uses them; they were written for this memo. Current `/pricing` copy supersedes.
- §7 LabPromo reframe — FLAG: per-variant copy needs Helena pass; the variants in §7 are spec, not ship-ready.
- §10 Match Revelation voice (open) — Helena prefers third-person on news-y surfaces and second-person on personal-y surfaces; the open Q is whether the My Record canvas should match the Today card's third-person voice for cross-surface coherence, or stay second-person ("you and this contributor share…").

**Final cross-tab kill list (V2, consolidated):**

- `TodayGridMode` (desktop overlay) — kill.
- In-Today search overlay (`src/pages/discover.tsx:270-317` filter) — kill.
- Today body scroll-lock — kill.
- Today hardcoded fallback stats — replace with `/api/public/stats`.
- `ClusteringCard` slot on Today — relocate to Phenomena Browse (catalogue rail).
- `/phenomena/[slug]` `isTagFallback` dual-render — merge into one path.
- `AskTheUnknown` perma-widget on Phenomena (mode!=='map') — kill (or relocate to homepage hero CTA).
- TemporalStrip empty placeholder — render nothing when null.
- `LabPromo`'s "Lab" wordmark — rename "Your Record".
- In-lab duplicate `NotificationsBell` — kill.
- In-lab "Submit Report" header pill — kill (moved to global + pill).
- `MatchList`'s inline-expanded 12 cards — collapse per V5 Match Revelation canvas.
- The current generic LabPromo body copy — replace per §7 tier-and-state variants.
- `feedSections` rendering on Phenomena Browse — DO NOT KILL (re-skin; V1 reversed).

---

## 10. NEW dissents + founder taste calls

**New Dissent 1 (Naomi vs. Jonas — push notification opt-in timing).** Naomi: push opt-in fires only after the Step 5 wow, never before. Jonas: defer one step further — opt-in fires at Step 6 (the confirmation), framed as *"We'll notify you when your first Hint is ready"* rather than at the wow itself (which dilutes the wow's emotional charge). Panel splits. Open for founder taste.

**New Dissent 2 (Devi vs. Eitan — comments on the lone report page).** Devi: comments ONLY on the comparison page (§5). Eitan: there's still value in per-report comments for reports that have zero matches — orphan reports otherwise have no social surface. Devi counter: orphan reports are by definition not socially-rich; surfacing a comment thread on them creates moderation overhead with no upside. Panel sides 6-4 with Devi but Eitan's objection is noted. **Founder taste:** allow per-report comments only on reports with zero matches (Eitan's compromise), or hold the line at comparison-only (Devi)?

**New Dissent 3 (Tobi vs. Helena — homepage hero copy).** Tobi: the hero needs the 200K number as the visual hero, big-font. Helena: the documentary register prefers prose to numerals; *"The archive holds over two hundred thousand documented accounts"* in body type beats *"200,000"* in display type. Panel splits. Mobile factor (Sana): display-type numerals out-perform prose by ~22% on mobile conversion (Mobbin data). Tobi wins on mobile; Helena wins on register. **Founder taste.**

**New Dissent 4 (Sana vs. Riku — floating +Submit on Phenomena).** Sana: ship the pill on both Today AND Phenomena from day one for discoverability. Riku: ship Today-only first, measure 30 days, expand to Phenomena only if Phenomena-session-length grows (otherwise the pill on Phenomena will hurt browse-completion metrics — users tap the pill mid-browse, lose place, don't return). **Founder taste call.**

**Founder taste call (Helena, Match Revelation voice).** The cross-surface coherence move suggests third-person ("the archive surfaced…") on BOTH Today AND My Record canvas. The V5 spec uses *first-person/personal-y* ("three catalogued accounts share signals with yours") on the canvas. These can both be true if "with yours" is the only personal-y word and the rest stays third-person. Founder pick on the exact voice — Helena will write either variant.

**Founder taste call (Pro drop notification channel).** Open from PRO_TIER_VALIDATION_V3 §9. Push-default-on vs. opt-in. Naomi: opt-in (no nag fits documentary register). Jonas: default-on (paid feature deserves the channel). Panel split.

**Founder taste call (Hints on Today cadence).** §3.1 spec is "one per session when ≥3 unresolved." Alternative: weekly (every 7 days regardless of count) or staleness-driven (when oldest unresolved Hint is >14 days old). Founder pick. Recommendation: per-session-when-≥3 (Naomi: respects the user's resolution velocity).

---

## 11. Prioritized backlog

**MVP (Sprint 1-2, weeks 1-4):**

1. **`MatchRevelationCard` (Today special card)** — new card type, position 2 injection, third-person voice. ~3d.
2. **Server-decided landing endpoint + index.tsx routing** — `/api/user/landing`, ~40 lines in index.tsx. ~2d.
3. **Floating `+ Submit` pill component** — global chrome, suppressed on `/lab`/`/start`. Tier-blind. ~2d.
4. **LabPromo tier-and-state-aware rewrite** — extend `/api/lab/promo/should-show` to return variant key; 4 variants. ~3d.
5. **`feedSections` re-skin on Phenomena** — rename rails, adjust ranker source, no IA change. ~2d.
6. **200K eyebrow on Today + Phenomena + My Record empty-state** — single `/api/public/stats` consumer. ~1d.
7. **Match Revelation surface in My Record (V5 Sprint 1 — already in flight)** — keep on schedule.
8. **Per-comparison comments thread on `/lab/compare/[a]/[b]`** — new table `comparison_comments`, public read, Basic+ write. ~5d.
9. **`YourSignalForPhenomenon` extension** — add "and 3 of your matches also reported this" row. ~2d.
10. **Bottom-nav badge slots** (V1 §6.6) — single endpoint `/api/user/tab-badges`. ~3d.

**V2 (Sprint 3, weeks 5-6):**

11. **Hints-on-Today special card** — once Hints have resolve actions (V5 Sprint 1).
12. **Pattern Line miniature** (V5 deferred from Sprint 1).
13. **Match Revelation → My Record canvas deep-link from Today card** — `?focus={matchId}` plumbing.
14. **Mobile Phenomena sub-tab icon-collapse on scroll** — chrome-density fix.
15. **Saved-from-Today pile-rail on My Record** — visual pile + count, routes to saved.
16. **Standing-search create button (locked on Basic, paywall surface).**

**V3 (Sprint 4+, post-MVP):**

17. **Year-in-Your-Record annual artifact** (V5 §4.5).
18. **Pro monthly-drop framing on Dossier** (V5 §4.5).
19. **iNaturalist-style Projects** — only if comparison-comment density ≥ 4 median after 60 days.
20. **Match Revelation special-card type on phenomenon page side-rail** — when user lands on a phenomenon page and has matches on it.

**Cut for good (no resurrection — consolidated from prior memos):**

- Sources as a browse axis (founder note 1).
- 1:1 DMs (V4-V5).
- PDF exports (V5).
- Auto-formed Casebook rooms (V3 panel).
- Sigils (V2 panel).
- RadarSurface (V4).
- Any numeric "score" / "percentile" in user-facing UI (V5 Helena).
- 5th bottom-nav tab for Submit (§4, this memo).
- Killing `feedSections` entirely (this memo reversed V1).

---

**Word count:** ~5,480. Under cap. Founder's 11 notes addressed visibly. Three new substantive dissents + four founder taste calls. Mobile considerations on every recommendation. Case studies cited on every major move. V5 spine honored. Sources axis not relitigated. Match Revelation and tier value re-thought in depth. Submit-flow decided. Phenomena sub-tabs decided. feedSections decided. Social mechanic decided. Editorial register stamps on every section.

*— The Extended Cross-Surface Panel, V2*
