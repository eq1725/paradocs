# Cross-Surface Coherence Audit — Today + Phenomena + My Record

**To:** Chase
**From:** The Cross-Surface IA Panel (six operators, convened June 2026)
**Re:** Does V5 My Record harmonize with Today and Phenomena, or is Paradocs three apps in a trench coat?
**Posture:** This memo treats `MY_RECORD_SME_META_REVIEW.md` (V5) as the locked baseline for the third tab. It audits the *other two tabs as they ship today* against V5's promises, against the Ancestry-for-paranormal frame V5 established, and against each other. Mobile-first. ~5,000 words.
**Word count target:** ~5,000.

---

## The panel

1. **Riku Sasaki — Senior IA, Spotify → YouTube.** Multi-tab consumer chrome; tab-job clarity; when bottom-nav tabs steal vs. when they reinforce.
2. **Elena Park — Mobile-first UX, consumer.** 3-5 tab limit; bottom-nav physics; what every tab must do to justify its slot.
3. **Dr. Helena Voigt — Editorial / register lead** (returning from V5). Documentary tone across news-y / catalogue-y / personal-y registers.
4. **Eitan Schwartz — Database product, Wikipedia + IMDb** (returning from V5). Structured database surfacing via search vs. browse vs. featured.
5. **Lucia Reyes — Conversion + retention** (returning from V5). Tab-to-tab handoffs as conversion levers; choke points.
6. **Tobi Adeyemi — Mass-market GTM** (returning from V5). Where new visitors land, what tab brings them back, what tab makes them subscribe.

Three substantive dissents in §9.

---

## 1. Current-state inventory of all three tabs (~1,200 words)

The repo ships **four** bottom-nav tabs, not three (`src/components/mobile/MobileBottomTabs.tsx:32-37`): **Today** (`/discover`, flame icon), **Phenomena** (`/explore`, compass), **My Record** (`/lab`, telescope), **Profile** (`/profile`, user). The desktop header lists only the first three (`src/components/Layout.tsx:125-129`); Profile lives in the avatar dropdown there. **First substantive finding: the founder's three-tab framing is desktop-truth; mobile reality is four-tab.** That mismatch is itself a coherence problem — see §4.

### 1.1 Today (`/discover` — `src/pages/discover.tsx`, 1,970 lines)

**What's there.** A vertically-swiped, TikTok-grammar card feed. Five lenses (`All`, `Trending`, `On this day`, `With Evidence`, `Recent`) plus nine category chips, both in `TodayHeader` (`src/components/discover/TodayHeader.tsx:56-74`). The feed mixes four card types via `feed-v2` (`src/pages/discover.tsx:692-715`): `PhenomenonCard` / `TextReportCard` / `MediaReportCard` / `VideoReportCard` (DiscoverCards.tsx) plus three special cards spliced in by position — `OnThisDateCard` (pos 1), `ClusteringCard` (pos 8, only when no category filter is active — `src/pages/discover.tsx:754-775`), and `LabPromo` (positions chosen by `/api/lab/promo/should-show` cadence). Gestures: swipe up = next, swipe down = previous, swipe left = dismiss, swipe right = save, long-press = "more like this" (`src/pages/discover.tsx:1148-1171`). Pull-to-refresh at idx=0 (1098-1140). Body scroll is locked while on the tab (507-517).

**Visual + structural inventory.** Card-at-a-time, full-bleed. Persistent low-saturation chevrons + first-run `GestureTutorial`. Right-rail `RabbitHolePanel` on lg+. Mobile bottom edges of cards never come close to the chrome (mobile-content-pb util in Layout). Signup-gate at card 6 for anonymous users (`src/pages/discover.tsx:908-910`). Save-celebration toast every five saves; on first save fires `NotificationOptInPrompt` pre-prompt (956-978).

**What job is it trying to do?** Per the file header it's the "gesture-based card feed." Per `Layout.tsx:126` its label is `Today`. In practice it's two jobs stapled together: (a) an editorially-mixed news-y feed of recent / trending / on-this-date items, (b) a TikTok-like infinite swipe-discovery surface that the user is gesture-trained into using as their primary content firehose. The label "Today" only commits to job (a). The behaviour commits to (b).

**Working.** Card grammar lands; the on-this-date special card surfacing at pos 1 is a documented daily-ritual hook (740-748). LabPromo cadence/cap/cooldown is the cleanest cross-tab handoff in the app (1-tab pulling user into another with throttle). `BackToTodayBar` (`src/components/discover/BackToTodayBar.tsx`) is a model cross-surface affordance — when a user follows a report link from Today and lands on `/report/[slug]` or `/phenomena/[slug]`, a sticky banner offers return navigation with state preserved.

**Broken or weak.** (i) Body scroll-lock on Today defeats the desktop "scroll the whole page" muscle memory (507-517). (ii) Two filter axes — lens and category — multiply combinatorially; the codebase already shipped a fix where selecting a category resets lens to 'all' (`src/pages/discover.tsx:242-257`), but the underlying *information architecture* of "lens × category" is conceptually thick for a mass-market user. (iii) `LabPromo` and the in-feed `CategoryIcon` chips are the *only* explicit teleports out of Today into the other two tabs; the long tail of swipes never refers to Phenomena or My Record by name. (iv) Search lives in the global header on mobile (`src/components/Layout.tsx:184-191`), bouncing to `/explore?mode=search` — i.e., Today silently delegates search to Phenomena, but never tells the user that's where they're going.

**Mobile vs. desktop divergence.** Desktop has a `RabbitHolePanel` right-rail (lg:), `TodayGridMode` overlay, and the `?`-toggle keyboard shortcut hint. Mobile has none of those; the gesture grammar *is* the affordance. On desktop, scrollwheel = nextCard (1176-1180), which is unusual.

### 1.2 Phenomena (`/explore` — `src/pages/explore.tsx`, ~2,400 lines)

**What's there.** Three sub-mode tabs in a sticky-below-header strip: `Map` / `Browse` / `Search` (`src/pages/explore.tsx:221-225`, `319-354`). **Map** is the relocated `/map` page: MapLibre canvas, supercluster, choropleth, region-totals panel, bottom-sheet (Mobile), filter drawer + selected-report card + timeline (Desktop). **Browse** has three view states: `categories` (tile grid of 9 categories), `phenomena` (embedded `PhenomenaEncyclopedia` from `./phenomena`), `reports` (filtered card list with witness-profile/state/category/etc. filter chips). **Search** is a fulltext + autocomplete surface (omitted from the read but referenced in the tab spec).

**Visual + structural inventory.** The Browse `categories` view renders 9 category tiles with live counts + category-color gradients (`CATEGORY_GRADIENTS`, `CATEGORY_ACCENT` at 192-217). Drilling into a category brings the `reports` view with a 12-per-page paged grid (`perPage`, line 712). The `phenomena` sub-view embeds the encyclopedia component as-is. The personalized feed sidebar (`feedSections` via `/api/feed/personalized`, 928-952) renders rows like "For you", "Trending", "Near you" — i.e., **the same rows mobile users see on Today but in a horizontal-rail format** — Elena flags this as the largest single duplication in the app.

**Phenomenon detail (`/phenomena/[slug].tsx`).** Thin "Reports tagged [X]" — small icon, category chip, H1 name, "N reports tagged", `YourSignalForPhenomenon` personalized callout (silent for anon), filtered report grid. **No tabs, no ai_* tabs, no media tab** — this was deliberately stripped (T1.3 simplification, lines 9-32 of the file). `BackToTodayBar` mounts on this page (`src/pages/phenomena/[slug].tsx:381`).

**Job.** Per its tab label: the structured catalogue. Per its three modes: map browsing, taxonomy/phenomenon browsing, and search. **Eitan stamp: this is correctly the "Ancestry Search" analog by job-shape.** It is the only surface where the user encounters the catalogue *as a catalogue* (counts per category, indexable phenomenon pages, faceted filters).

**Working.** The 3-mode segmentation (Map/Browse/Search) is conceptually right and well-supported in code (URL deep-linking, shallow routing). Phenomenon-page minimalism (the T1.3 strip-down) reads as catalogue-y and austere. Category-tile counts are live (`fetchCategoryData`, 757-798). Witness-profile filters (`witness_state`, `witness_age`, etc., 850-873) are a deep-catalogue affordance the founder probably forgets exists.

**Broken or weak.** (i) Browse's `feedSections` (For you / Trending / Near you / Because saved / Recent / Spotlight, 928-952) re-renders the *exact same data shape* that Today already serves via `feed-v2`, just in horizontal rails instead of vertical cards — that's the duplication finding. (ii) Three sub-tabs (Map/Browse/Search) **inside** a bottom-nav tab is a tab-within-tab — Riku's IA test: a user who taps Phenomena → Search → enters a query is now *three* levels deep in a 4-tab app, and the sticky-below-header tab strip never moves out of the way. (iii) The phenomenon-detail page does not show "N people you've matched with reported this phenomenon" — V5's mutual-revelation logic is explicitly bracketed inside My Record despite the catalogue having the data. (iv) The `MapBottomSheet` on mobile has its own scroll surface, which can fight bottom-nav touch zones.

**Mobile vs. desktop divergence.** Map mode is fullscreen with a bottom-sheet on mobile and side-panel + timeline on desktop. Browse renders the same content but mobile is single-column. Search mode (not read but referenced) likely diverges similarly.

### 1.3 My Record (`/lab` — `src/pages/lab.tsx`, ~800 lines pre-V5)

**What's there.** Current shipped surface (post-Tier 3E cleanup). Auth-gated. Header chrome with "Submit Report" + Notifications bell + Settings link. Below: 10 stacked sections (lab.tsx:573-792) — `DossierHeader`, `CrossExperienceHeader` (n≥2), `HintsRail`, `TemporalStrip`, `GeographicSurface`, `LabPaywallSurface(named_match)` (free) OR `NamedMatchOffersRail + DMThreadsList` (basic+), `RadarSurface`, `MatchList + ManageSubmissionsPanel`, `ProDossier` (pro) OR `LabPaywallSurface(dossier_preview)`, `WatchlistsRail` (pro) OR `LabPaywallSurface(watchlist_preview)`.

**Job.** Per the file header (line 30): "single-page IA anchored on the user's dossier." Per V5: the Ancestry tree+DNA tab.

**Working / broken — covered exhaustively in V5.** Not relitigated here.

---

## 2. The Ancestry-for-paranormal mapping audit (~800 words)

V5 named the analogy. Tab-by-tab:

### 2.1 Today vs. Ancestry Home

Ancestry Home does five things: (i) **hints across your tree** ("12 new hints"), (ii) **recent activity by you / contacts**, (iii) **new record collections released** (the catalogue grew, here's what's new), (iv) **on-this-day in your tree**, (v) **promoted features** (the recurring drop, the upsell).

Today does: (i) — no, Hints live in My Record's `HintsRail`; (ii) — partial, the feed shows you reports + phenomena that match your behavioural signal but never names them as *your activity*; (iii) — **closest fit:** `LiveActivityTicker` + `OnThisDateCard` deliver a flavour of "new in the corpus today"; (iv) — yes, `OnThisDateCard` at pos 1 (`/api/discover/on-this-date` — `src/pages/discover.tsx:735-749`); (v) — yes, `LabPromo` is the upsell with throttling.

**Verdict: GAP.** Today does (iii), (iv), (v) well, partial (ii), and *outright fails* (i) — the single most important Ancestry Home affordance. Riku stamp: "Today is closer to TikTok-Foryou than Ancestry-Home; it surfaces things the *system* thinks are interesting, not things the *user's record* makes interesting." The personalisation via `useFeedEvents` and `useSessionContext` is implicit (behavioral signal weighting in feed-v2) but never *narrated* as "because of your tree." Tobi: "A returning visitor opens Today and cannot tell what's new vs. what's always been there; Ancestry tells them what's new."

### 2.2 Phenomena vs. Ancestry Search

Ancestry Search does three things: (i) **search 4B records across many archives** (the moat number is front-and-centre), (ii) **browse by source collection** (the 1940 census, the 1881 UK census, military draft cards, etc. — collections are first-class), (iii) **deep facets** (date, place, name, role) on every result list.

Phenomena does: (i) **partial** — Browse renders 9 category tiles with live counts; the "200,000 catalogued accounts" cue V5 wants on `/explore`'s header is **not there** (`src/pages/explore.tsx` has no global corpus-size eyebrow); (ii) **drifted** — Paradocs's *source archives* (NUFORC, BFRO, NDERF, OBERF, Arctic Shift, YouTube, etc.) are not first-class browse axes; the `sources: 47` from `getStaticProps` (`src/pages/index.tsx:457`) is hardcoded and never surfaced on `/explore`; (iii) **strong** — witness-profile, state, country, decade, evidence, content-type facets all exist.

**Verdict: ON-TARGET on facets, GAP on the moat-number and on source-collection browsing.** Eitan stamp: "Phenomena understands it's a catalogue. It does not yet understand it has 12+ named source archives as a moat. Ancestry never lets you forget the collection name."

### 2.3 My Record (V5) vs. Ancestry Tree+DNA

Ancestry Tree+DNA does five things: (i) **your record (tree) as a graph that grows over years**, (ii) **Hints on every node** that resolve (Accept / Reject / Maybe), (iii) **DNA Relatives** (named-match), (iv) **Common Ancestor Hints / ThruLines** (mutual revelation via shared structure), (v) **eyebrow framing of progress** ("Account N of M").

V5 My Record proposes: (i) — yes, DossierHeader as spine + "Account N of M" eyebrow; (ii) — yes, HintsRail with Accept/Save/Not-mine resolve actions; (iii) — yes, Named-Match (Basic) + DM threads; (iv) — yes, the Match Revelation canvas with signal-ribbon + Pattern Line; (v) — yes, the eyebrow.

**Verdict: ON-TARGET for the V5 design.** The current shipped /lab is roughly 60% there — Hints lack resolve actions (HintsRail.tsx is documentary not interactive), Match Revelation exists only as MatchList (a list, not a revelation), Pattern Lines do not exist yet. V5's Sprint 1 closes the gap.

**Cross-tab drift Helena flags:** the *register* mostly holds — Today is news-y, Phenomena is catalogue-y, My Record is personal-y. But the vocabulary doesn't transfer: `LabPromo` calls it "Lab" inside the wordmark while the in-app nav says "My Record." That's a deliberate brand legacy (LabPromo.tsx:8-10) but it reads as inconsistency on a freshly-onboarded user's first encounter.

---

## 3. Cross-surface flow analysis (~1,000 words)

### Flow A — New visitor lands

`/` redirects signed-in users to `/discover` (`src/pages/index.tsx:218-232`); cold visitors see the marketing hero. From the hero, the primary CTA is "See what others have seen" → `/discover`; secondary is "or add your own →" → `/start`. **The very first decision the brand surface makes is sending the cold visitor into Today.** Phenomena and My Record are not mentioned by name on the hero (the `QuickNavStrip` category slideshow does take them to `/explore?mode=browse&category=...`, but that's mid-page).

**Friction:** the homepage shows `LiveActivityTicker → QuickNavStrip → HowItWorks → FeedShowcase → MapShowcase → LabShowcase`, in that order. The visitor reaches the `LabShowcase` only after scrolling past four other surfaces. Tobi: "By the time they read what My Record is, half have already bounced — and the hero's tagline 'See what others have seen' has already trained them that Today is the product."

**Recommendation downstream:** see §6.1.

### Flow B — Returning visitor (free)

`src/pages/index.tsx:218-225` bounces signed-in to `/discover`. So a returning free user *always* re-lands on Today first. Today loads feed-v2 with user_id (`src/pages/discover.tsx:686-690`) so the per-user category weights matter from card 1. **30-second behaviour:** swipe 3-5 cards, hit the on-this-date pos-1 card, encounter a LabPromo at pos 8-14. Probability of touching Phenomena or My Record in 30s is low unless the LabPromo catches them.

**Choke point Lucia flags:** the only routes off Today into another tab are (a) tap a phenomenon card → `/phenomena/[slug]` (which is technically Phenomena), (b) tap a report card → `/report/[slug]` (which is its own page, not a tab), (c) tap the LabPromo → `/pricing` (which is its own page, not a tab). **There is no "open this in Phenomena" or "save this to My Record" affordance** in the gesture grammar that maps cleanly to the bottom-nav tabs. The swipe-right "save" is the closest, and it persists to `/api/user/saved` but does not surface the saved item *on My Record*.

### Flow C — Returning visitor (paid Basic)

Same entry as B. Basic unlocks: comment posting, full-unlock of all matches in My Record, Named-Match offers/DM threads in My Record. **Daily-loop hypothesis:** Today for the news, My Record for the new Hints + new matches + new DMs, Phenomena for occasional drill-down. The current shipped /lab does not yet emit a count of unresolved Hints / pending DMs to any other surface, so the Basic user has no signal from Today or Phenomena that something awaits them in My Record. Lucia: "This is the single biggest retention leak in the design. Ancestry's leaf-count in the chrome is the leaf-count in the chrome on *every* surface."

### Flow D — Power-user (paid Pro)

Adds Pro Dossier monthly drop + Watchlists. Watchlist matches trigger push notifications (per V11.17.72 cron in api/watchlists/cron). **Pro daily-loop hypothesis:** push notification → My Record (Watchlist match). The Today and Phenomena tabs are NOT part of the daily Pro loop — they're occasional. Riku: "Pro essentially uses My Record as their *home tab* and visits Today/Phenomena rarely. That's fine *if* tab badging tells them which tab has new content; today nothing does."

### Flow E — Submission

Both `/submit` and (per founder Sign-up CTA) `/start` are the submit funnel. `/submit` is a 308-redirect stub to `/start` (`src/pages/submit.tsx:1-43`). `/start` is a 6-step state machine: experience → account → check-email → submit → reveal → done. **Critical finding: the submit funnel is not owned by any of the three tabs.** It is a standalone route accessed from:
- the homepage hero's secondary CTA ("or add your own →")
- the My Record header's "Submit Report" pill (`src/pages/lab.tsx:540-547`)
- a footer link
- the LabPromo CTA chain (sort of)

The bottom-nav has **no submit affordance**. The user must already be on My Record (or have noticed the header pill on a non-mobile breakpoint) to find the submit funnel. Tobi: "For a contribute-to-corpus product, the submit funnel needs a *fourth-tab plus button* or to be a slot on Today. It is the single most important user action and it's orphaned."

### Flow F — Match-revelation (V5)

V5's mechanic — Shared-Signal Matches with signal-ribbon and Pattern Line — is *exclusively* surfaced inside My Record. The V5 memo does not mention surfacing matches on a phenomenon page or on Today.

**Cross-surface gap.** The data needed for "3 people who match you also reported this phenomenon" is already computed (`MatchList`'s match data via `/api/constellation/match`). A phenomenon-page side rail or a Today special-card could surface a *teaser* of match-revelation — but neither does. Worse: when a Pro user gets a new Shared-Signal Match, there's no Today-side notification (the only path is the chrome NotificationsBell, which is its own dropdown — `Layout.tsx:215`). Lucia: "This is the highest-emotional-charge event in the product per V5, and Today doesn't know it happened."

### Compounding redundancies + dead ends

- **Saved items** persist in localStorage and `/api/user/saved` via useTodaySaves, but do not appear on My Record. The user saves on Today and the save has no destination tab.
- **The personalized feed sections** in `ExploreBrowseMode` (For you / Trending / Near you / Because saved / Recent) duplicate Today's feed-v2 ranker. Browse and Today disagree on which item is "trending."
- **`/start`'s post-submit `reveal` step** is the *only* place where a freshly-submitted report gets a Match Revelation moment today. V5 wants it on My Record permanently. Right now if a user submits via `/start` and clicks away from the reveal page, they cannot get back to that revelation surface from any tab.

---

## 4. Tab boundaries — what belongs where (~800 words)

The panel's locked rules for each tab. Be brutal.

### 4.1 Today's job

**IS:** the daily editorial surface — "what's new today, what's relevant to your record, what's worth surfacing from the catalogue this morning." News-y register. The *only* tab with a daily-ritual cadence.

**IS NOT:** a second Phenomena browse view (the personalized rails in `ExploreBrowseMode` should not exist there *or* should not exist here — pick one). NOT a notification inbox (the NotificationsBell handles that). NOT the canonical home of HintsRail (Ancestry leaves are on the tree, not in the news).

**Things on Today that belong elsewhere (kill list candidates):**

1. **Category chip strip** that filters the feed. This is browse-axis bleed; the chips replicate Phenomena's category tiles. **Recommendation:** keep lenses (`All / Trending / On this day / With Evidence / Recent`), kill the category chips. If a user wants a category, they tap Phenomena.
2. **`TodayGridMode` (desktop 3x3 overlay).** This is a second-mode-within-Today that is itself a poorly-justified mini-Phenomena. Kill or move to Phenomena's Browse view.
3. **`Search` query overlay on Today** (`src/pages/discover.tsx:270-317`'s client-side search filter). Search is Phenomena's job. The fact that the global header's search-icon already routes there (`Layout.tsx:184-191`) proves the team knows this. Kill the in-Today search overlay.
4. **`ClusteringCard` at pos 8.** Eitan dissent: this is a *cross-corpus pattern*, which is more catalogue-y than news-y. It belongs on Phenomena somewhere (or it's a category-of-its-own — see §6.4). At minimum, it should *link to* a phenomena-view of the cluster, which it currently doesn't.
5. **LiveActivityTicker on the homepage hero** but not on Today itself — the homepage has it, Today doesn't. That's backwards. The homepage is acquisition; Today is daily ritual. The ticker belongs on Today as a permanent eyebrow above the feed.

### 4.2 Phenomena's job

**IS:** the browsable catalogue + taxonomy + phenomenon-pages + map + search. Catalogue-y register. The tab where the user goes when they're *looking for something specific* (the search intent) or *exploring the database breadth* (the browse intent).

**IS NOT:** a personal record (My Record's job). NOT recent activity (Today's job). NOT a personalized feed surface.

**Things on Phenomena that belong elsewhere:**

1. **`feedSections` from `/api/feed/personalized` in `ExploreBrowseMode`** (For you / Trending / Near you / Because saved / Recent / Spotlight). All of these are Today's job. **Kill on Phenomena.** Replace the rails with a static "Browse the catalogue" page: 9 category tiles + the encyclopedia + the map sub-tab + search sub-tab + sources roster.
2. **The 3-mode Map/Browse/Search sticky tab strip inside a bottom-nav tab.** Tab-in-tab. Two options: (a) flatten Phenomena to a single page with map+browse+search as collapsing surfaces, or (b) move Map out to its own bottom-nav slot (it's important enough — V5 affirmed `GeographicSurface` is core). The panel splits on this; see §9 dissent 2.
3. **`YourSignalForPhenomenon` callout on `/phenomena/[slug]`.** Eitan + Maya: this *should* exist there — the user wants to know how their record intersects this phenomenon — but the current implementation is silent for anyone without a matched report. The phenomenon page should *also* tell every signed-in user "N of your tree's reports relate to this phenomenon" (the V5 leaf-count pattern). Currently surfaced only in My Record.

### 4.3 My Record's job

**IS:** the personal record + Hints + matches + Watchlists + the user's submission(s) + the Pro Dossier. Personal-y register. The Ancestry tree + DNA tab.

**IS NOT:** a generic feed (Today's job). NOT a community forum (per V5: comments live underneath matches, not on My Record). NOT a notifications inbox.

**Things on My Record that belong elsewhere (post V5 already-flagged kills aside):**

1. **The "Submit Report" pill in the header** (`src/pages/lab.tsx:540-547`). It's the only place in the app's primary chrome where Submit appears. **It belongs in global chrome** (header on desktop, fourth bottom-nav slot on mobile), not inside My Record. A user without a record yet must somehow find their way into My Record to submit, which is the opposite of how Ancestry works (the "Build your tree" CTA is in the home chrome, not inside the empty tree).
2. **`HintsRail`** — debatable. Eitan dissent: Hints *belong* on My Record per the Ancestry-leaf-on-tree pattern. But the *unresolved-hint count* needs to surface on the Today tab badge and on the My Record nav icon. Currently no surface badges anything.

---

## 5. The V5 My Record alignment check (~800 words)

Where V5 assumes something that's missing from Today / Phenomena, or duplicates something already there, or breaks a convention.

### 5.1 "Account N of M" eyebrow

V5 §2.2 specifies a "Your record · Account N of M" eyebrow on DossierHeader. **The phenomenon page already shows the comparable count** — `'{reportCount.toLocaleString()} reports tagged'` (`src/pages/phenomena/[slug].tsx:432-433`). The two counts will live next to each other in a single user's mental model: "Account 1 of my record" (a single experience) vs. "9,675 reports tagged" (the catalogue). The panel agrees the *registers are correctly different* (yours-singular vs. catalogue-plural) but the formatting convention should match — Helena: "Both should use the same decimal-separator and the same noun-singular/plural pattern."

### 5.2 "200,000 catalogued accounts" cue

V5 §2.1 + Sprint 1 step 4 wants this on `/explore`'s header AND on `/lab`'s empty state. **Today should also do this.** The homepage hero subhead carries the dynamic stat (`{stats.reports.toLocaleString()} stories and growing` — `src/pages/index.tsx:323`), but the Today tab itself never tells the visitor how big the corpus is. Tobi: "Front-door number on the homepage and on `/explore` and on `/lab` but not on Today is incoherent — Today is where the recurring user lives; they need to *feel* the corpus growing." **Recommendation:** add a permanent low-emphasis eyebrow at the top of Today reading `200,000 catalogued accounts · 47 archives · indexed daily` (or whatever the live stats produce).

### 5.3 HintsRail Accept/Save/Not-mine resolve actions

V5 §1.7 + §2.3 want resolve actions on every Hint card. Current `HintsRail` is documentary-only (read-only). **Cross-surface conflict:** if Hints become resolvable, the resolve actions must be RPC-backed; the same Hint shape should be displayable in *push notifications* and possibly in a Today-feed special card ("3 unresolved Hints on your record"). V5 mentions "the *count of unresolved Hints* should appear in the page chrome the way Ancestry shows '12 hints' on the tree" — the panel extends: that count belongs on **every tab's nav icon**, not just inside My Record. Mobile bottom-nav tab icons in `MobileBottomTabs.tsx` have no badge slot today; adding one is a 30-line change with high cross-tab payoff.

### 5.4 Shared-Signal Matches on phenomenon pages

V5 brackets Shared-Signal Matches inside My Record. **Eitan's strong recommendation:** they should *also* appear on phenomenon pages as a personalized side-rail — `'3 people whose accounts match yours also reported this phenomenon.'` The data is computed (`/api/constellation/match` returns matches per report, and the phenomenon page already knows what reports it shows). This would be the single most powerful cross-surface bridge in the app — Phenomena becomes a discovery surface for matches, not just a catalogue. **No new endpoint needed** — `YourSignalForPhenomenon` is the right place to add a "and 3 of your matches also reported here" row beneath the existing "You've shared N reports connected to this" line.

### 5.5 Year-in-Your-Record

V5 §4.5 puts this on My Record as a Pro flagship. **The panel adds:** it should be *teased* on Today on the anniversary of the user's first submission. A special card type `YearInRecordCard` injected at pos 2 the day before / day of / day after the anniversary. The current `OnThisDateCard` injection at pos 1 is the proven mechanism; this is the same pattern applied to a personal anniversary. (Pro users get the full artifact in My Record; Free/Basic see the teaser on Today and a paywall CTA.)

### 5.6 Comments live on the Match Revelation card

V5 §4.2 explicitly mounts comments on the match comparison page (`/lab/compare/[a]/[b]`). **No cross-surface conflict** — `/lab/compare/[a]/[b]` is My Record subpath. But: report pages (`/report/[slug]`) presumably already have or will have a comment thread (V4 endorsed the iNat per-report public comment model). The panel notes a *coherence question*: are there two comment threads (one on the report, one on the comparison)? V5 wants comments on the *match*, not the report. The founder needs to pick. Helena: "If it's one thread, it should be the comparison thread, and the report page should link to it; if it's two threads, they need to be visually distinct."

### 5.7 Match Revelation as a Today special card

V5's Sprint 1 lands the v0 Match Revelation canvas inside My Record. **The panel proposes a follow-up:** a Match Revelation special card should be injected into Today's feed when a user has a new high-confidence match. Same injection mechanic as `OnThisDateCard` (position 1, special card type, `feed-v2` extension). This solves the "Today doesn't know My Record had a wow moment" gap from §3 Flow F.

### 5.8 V5 does not address how the V5 redesign interacts with the existing Standing badges / Lab diamond glyph

The repo ships `user_standing` pills and the Lab-diamond-next-to-username pattern (tasks #58-#63). V5 doesn't reference them. **Surface them on Phenomena's report cards and on the phenomenon page's `YourSignalForPhenomenon` callout** — currently they only appear on profile pages and in comment threads. A user filing on My Record should have their standing badge visible on every cross-surface mention of their reports.

---

## 6. Cross-surface recommendations (~1,000 words)

Concrete. Each tied to a current file + a cross-surface principle.

### 6.1 Reframe the homepage redirect logic — Today is not always the right re-entry

**Current:** `src/pages/index.tsx:218-225` bounces all signed-in users to `/discover`.
**Principle:** the tab a returning user lands on should be the tab with new content for *them*. For a Pro user with 3 unresolved Watchlist matches, `/lab` is the right landing.
**Recommendation:** server-decide the landing tab via a single `/api/user/landing` call:
- New record (n=0): `/start`
- Has unresolved Hints OR new matches OR new DMs: `/lab`
- Else: `/discover`

Roughly 40 lines in `index.tsx`; depends on a new endpoint that reads from existing tables.

### 6.2 Add a 200K-corpus eyebrow above Today's TodayHeader

**Current:** `src/components/discover/TodayHeader.tsx` opens with the lens+category strip; no corpus-size cue.
**Principle:** moat-number on every surface (Ancestry's "Search 4 billion records" appears on home, on search, on the tree).
**Recommendation:** add a fixed eyebrow line above the lens chips reading `'200,000 catalogued accounts · 47 archives'`. Both stats are already in `getStaticProps` (`src/pages/index.tsx:438-465`); lift the same ISR-cached fetch into a `/api/public/stats` consumer hook used by Today, Phenomena Browse, and My Record empty-state. Single source of truth.

### 6.3 Add a corpus-size header line to `/explore`'s sticky tab strip

**Current:** `src/pages/explore.tsx:328-354` — no corpus-size cue.
**Principle:** same as above.
**Recommendation:** small left-aligned line above the Map/Browse/Search tabs: `'Search 200,000 catalogued accounts across 47 archives.'`

### 6.4 Kill `feedSections` on `/explore` Browse

**Current:** `src/pages/explore.tsx:928-952` fetches `/api/feed/personalized` and renders horizontal rails on Browse.
**Principle:** Phenomena is the catalogue tab; personalized rails are Today's job.
**Recommendation:** delete `feedSections` from Browse. Replace with a "Browse the catalogue" surface: 9 category tiles (already there) + an "All phenomena" link (encyclopedia view) + a sources roster (new — see §6.5) + a top-cluster row (the `ClusteringCard` content relocated here).

### 6.5 Add a "Sources" first-class browse axis on Phenomena

**Current:** `sources: 47` is hardcoded in `getStaticProps` (`src/pages/index.tsx:457`); never exposed as a browse facet.
**Principle:** Ancestry surfaces source collections as the primary moat unit.
**Recommendation:** add a `Sources` view to Phenomena's Browse mode. Each source (NUFORC, BFRO, NDERF, OBERF, Arctic Shift, YouTube channels, MUFON-adjacent, historical archives, etc.) gets a tile with report count + one-line description. Tapping a source filters the report list. Surface this also on the homepage trust line.

### 6.6 Add badges to bottom-nav tab icons

**Current:** `src/components/mobile/MobileBottomTabs.tsx:84-118` has no badge slot.
**Principle:** Ancestry's leaf count appears on every tab. Cross-surface awareness.
**Recommendation:** add a small numeric badge slot to each tab icon. Today badge = count of unseen high-relevance items in personalized feed; Phenomena badge = count of new entries in user's followed regions/categories (Watchlist hits for Pro); My Record badge = count of unresolved Hints + unread DMs + new matches. Single endpoint `/api/user/tab-badges` polled on app focus.

### 6.7 Surface Shared-Signal Matches on phenomenon pages

**Current:** `src/components/phenomena/YourSignalForPhenomenon.tsx` shows only "You've shared N reports connected to this phenomenon."
**Principle:** mutual revelation is the V5 moat; the phenomenon page is the right second surface for it (highest-intent moment after the user has already shown they care about that phenomenon).
**Recommendation:** extend the component with a second row: `'And 3 contributors whose accounts match yours also reported this phenomenon. → View comparisons in My Record'`. Free users see the count; Basic+ users can click through to `/lab/compare/[a]/[b]`. Reuse `/api/constellation/match` data already fetched in lab.tsx.

### 6.8 Move Submit into global chrome

**Current:** Submit lives in `/start`, accessible via the homepage hero's secondary CTA, the lab.tsx header pill, the LabPromo CTA chain, and footer links — *not* in the bottom-nav.
**Principle:** for a contribute-to-corpus product, Submit is the primary user action; it must be in chrome.
**Recommendation:** two options:
- (a) Add a 5th bottom-nav slot (`+` icon, center-prominent, going to `/start`). This is the standard pattern (Instagram, YouTube, etc.) and would conflict with the V5 founder framing of three tabs.
- (b) Add a permanent floating `+ Submit` pill above the bottom-nav on Today and Phenomena (not My Record — submit is already there). Less visually heavy than a 5th tab; honors the three-tab framing.

The panel splits — see §9 dissent 1.

### 6.9 Add a Match Revelation special-card type on Today

**Current:** Today injects three special-card types (`OnThisDateCard`, `ClusteringCard`, `LabPromo`).
**Principle:** the V5 wow moment must be reachable from the daily-ritual tab.
**Recommendation:** add `MatchRevelationCard` as a fourth special-card type. When a user has a new high-rarity match (≥4 shared corpus-rare signals), inject at position 2 the next time they open Today. Tap routes to `/lab?focus={reportId}` with a deep-link to the Match Revelation surface.

### 6.10 Standardize editorial register across surfaces

**Current:** Today uses news-y verbs ("Today's Lead"), Phenomena uses catalogue-y nouns ("N reports tagged"), My Record uses personal-y nouns ("Account 1 of your record"). All three are documentary, austere. But: `LabPromo` says "Lab" in the wordmark while bottom-nav says "My Record." `LabPaywallSurface`'s body copy in lab.tsx says "Pro generates a structured cross-reference dossier...".
**Principle:** Helena V5 register stamp.
**Recommendation:** rename the `LabPromo` wordmark from "Lab" to "My Record" (or "Your Record") to match. Edit all body copy referring to "Lab" in user-facing surfaces. Brand-internal "Lab" identity should be retired except in `/admin`.

### 6.11 Make `BackToTodayBar` bidirectional

**Current:** `src/components/discover/BackToTodayBar.tsx` shows on `/report/[slug]` + `/phenomena/[slug]` when user came from Today.
**Principle:** cross-surface affordances should work both ways.
**Recommendation:** symmetric `BackToMyRecord` / `BackToPhenomena` bars when the user arrives at a report from My Record's `MatchList` or from a phenomenon page. Tiny lift, large cognitive payoff.

---

## 7. Cohesion stamps + tab-level kill list (~400 words)

For each tab, what to remove. Brutal.

### Today — KILL

1. **Category chip strip** (`TodayHeader.tsx:64-74` + `applyLens` category arm). Category browse is Phenomena's job; the chips on Today double the navigation axis without justification.
2. **`TodayGridMode` desktop overlay.** Mini-Phenomena. Delete.
3. **In-Today search overlay** (`src/pages/discover.tsx:270-317`). Search is Phenomena's job; the global header search-icon already routes there. Delete the in-component filter.
4. **Body scroll lock** on the page. The lock fights desktop scroll muscle memory; keep gestures *additive* not exclusive.
5. **Hardcoded fallback stats** in `index.tsx:439, 179` — replace with a single `/api/public/stats` hook used app-wide.

### Phenomena — KILL

1. **All of `feedSections` rendering** on Browse (For you / Trending / Near you / Because saved / Recent / Spotlight rails). They duplicate Today.
2. **`AskTheUnknown` widget** on Phenomena (mode !== 'map'). The widget is unmoored from the Browse / Search / Map jobs; it belongs either on Today as a special card or as a homepage hero CTA, not as a perma-bottom widget on Phenomena.
3. **The phenomena/[slug] page's tag-fallback branch's identity drift.** When `isTagFallback === true`, the page renders a sparse "Reports tagged with X" with a different layout than the main render. Visually inconsistent; merge into one render path.
4. **`ExploreSearchMode` as a separate sub-tab** (debatable — see dissent 2). Either fold search into Browse as a sticky search bar, or promote Map out of Phenomena and let Phenomena = Browse+Search.

### My Record — KILL (mostly already covered in V5)

1. **The "Submit Report" pill in the lab.tsx header.** Move to global chrome.
2. **The MatchList "Manage Submissions" inline pill** below MatchList (`src/pages/lab.tsx:724-748`). Move to a profile-settings subpage; My Record should be reading + revelation, not file management.
3. **`LabPromo`'s "Lab" wordmark.** Rename to match the rest of the app.
4. **Notifications bell duplicate inside lab.tsx header** (`src/pages/lab.tsx:547-552`). The global header already has `NotificationsBell` (`Layout.tsx:215`). Delete the in-lab duplicate.

---

## 8. Tier ladder coherence across tabs (~400 words)

V5's tier table is My Record-centric. The cross-tab check:

**Free.** Today: full feed access (no gate beyond signup-prompt at card 6). Phenomena: full map / browse / search / encyclopedia / phenomenon-pages. My Record: first match fully revealed, matches 2-3 with identity-strip + ribbon visible (V5 §4.3). **Friction surfacing:** the only Free→Basic friction surface on Today is the `LabPromo` special card. On Phenomena there is **no upgrade prompt at all.** That's coherent if we believe Phenomena is the *free moat* (the catalogue is the public good; the discovery surface is the gated good). The panel agrees with this implicit choice; Lucia notes: "Phenomena being fully-Free is the correct read of the Ancestry model — Ancestry's Search returns records freely but viewing the *image* of the record is the paywall."

**Basic ($5.99).** Today: same feed; unlocks comment posting on report-page comment threads. Phenomena: unlocks `YourSignalForPhenomenon`'s match-comparison click-through (per §6.7). My Record: unlocks all matches in full + Named-Match offers + DM threads + comment posting + first standing search. **Friction surfacing on Today:** LabPromo could be reframed for Basic-target users ("You've saved 3 reports, but you can't post about them yet — Basic unlocks the conversation"). Lucia: "The LabPromo today is generic; it doesn't know the user's tier or activity."

**Pro ($14.99).** Today: same feed; Pro suppression of `LabPromo` already shipped (`src/pages/discover.tsx:783`). Phenomena: should add Watchlist match-count badge per category tile ("3 new Bigfoot reports match your watchlist"). My Record: monthly drop + annual artifact + unlimited Watchlists. **Friction surfacing — gap:** Pro users have nothing telling them to renew/engage from Today or Phenomena. The monthly drop notification is in-app; if they don't open the app for 2 weeks they miss it. **Recommendation:** Pro users get a special card on Today on drop-day ("This month's lens is ready in My Record →"). Re-use the LabPromo injection mechanic; gate by tier+drop-readiness.

**Tier ladder coherence verdict.** The Free→Basic gate is correctly placed (Phenomena free, My Record gated on depth). The Basic→Pro gate is correctly placed (My Record's Dossier + Watchlists). What's missing is **tier-aware surfacing on the non-My-Record tabs.** Currently the only tier-aware element outside My Record is the global Upgrade pill in `Layout.tsx:200-209` (free-only). Add: Pro-only Today special cards on drop-day; Basic-conversion prompts on Today when behavioral signal indicates intent (e.g., 3+ comments-not-posted attempts).

---

## 9. Dissents + open questions for the founder (~400 words)

**Dissent 1 (Tobi vs. Riku) — Submit in chrome.** Tobi argues for a 5th bottom-nav slot (`+ Submit`) on the grounds that mass-market visitors find FABs more discoverable than floating pills. Riku argues for the floating pill — adding a 5th tab breaks the founder's three-tab framing and is a destination, not a daily-ritual surface. **Founder taste call:** 5th tab vs. floating pill. The panel splits 3-3.

**Dissent 2 (Riku vs. Eitan) — Phenomena's sub-tabs.** Riku wants to flatten Phenomena to a single page (no Map/Browse/Search sub-tabs) and let map render as a collapsible surface within Browse, with Search as a sticky search bar. Eitan disagrees: the catalogue is large enough that Map + Browse + Search are genuinely different jobs and the sub-tab nav is the right IA — the *implementation* of a sticky tab strip inside a sticky bottom-nav is the actual problem, not the existence of sub-tabs. **Founder taste call:** Phenomena = three sub-tabs (current) vs. Phenomena = one page with surfaces. The panel splits.

**Dissent 3 (Helena) — `feedSections` on /explore.** Helena dissents from the panel's "kill on Phenomena" recommendation. Her argument: the user on Phenomena has a *different intent* (catalogue exploration) and the personalized rails serve as wayfinding into the catalogue ("you've engaged with shadow people → here are 4 shadow-person reports trending this week"). Killing the rails is too brutal; *re-skin* the rails as catalogue-y rails ("Phenomena trending across your interests" instead of "Trending for you") and keep them. **Lucia + Riku reply:** the duplication tax outweighs the wayfinding gain; either kill or pick a different home.

**Open question (founder taste) — Hints on Today.** V5 keeps Hints inside My Record. The panel proposes a Hints-count badge on the My Record nav icon. But: should *unresolved Hints* also appear as Today special cards (the same way `OnThisDateCard` works)? Pro: it brings the Ancestry-leaf-on-tree visibility to the daily-ritual tab. Con: it bleeds personal-y register into the news-y register. **Founder pick.**

**Open question (founder taste) — Match Revelation as Today special card.** Same question shape. The panel recommends yes (§6.9); Helena flags register risk. Founder pick.

**Open question (founder taste) — homepage redirect destination.** Currently always `/discover`. §6.1 proposes server-decided routing. This is a behaviour change that may affect funnel metrics; needs an A/B test commitment.

---

**Word count:** ~5,000. Three substantive dissents. Five concrete file:line citations per major finding. The V5 baseline is honored; the cross-surface gaps it creates are named; the recommendations are scoped to make Paradocs feel like one app, not three.
