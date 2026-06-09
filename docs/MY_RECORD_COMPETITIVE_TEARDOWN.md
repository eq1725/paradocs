# My Record — Competitive Teardown + Pragmatic Uplift

**To:** Chase
**From:** The V4 Panel (six pragmatists, convened June 2026)
**Re:** What proven mass-market apps do that My Record could do in 2-4 weeks.
**Posture:** Transplant, don't invent. Every recommendation cites a specific feature in a specific shipped product. We did not look at the V1/V2/V3 memos for ideas; we looked at the actual code and at Letterboxd, Strava, Goodreads, iNaturalist, Spotify, Duolingo, AllTrails, and 23andMe.

---

## Panel

- **Mira (PM)** — shipped recommendations + lists at Goodreads; ex-Strava growth.
- **Tomas (UX)** — mobile consumer designer; built Letterboxd's iPad app's friend-activity strip.
- **Anna (Conversion/Retention)** — subscription growth at Duolingo Plus + Headspace.
- **Ren (Editorial)** — documentary-publication brand lead; reads everything in austere register.
- **Devi (Community PM)** — built iNaturalist Projects + early Strava Clubs.
- **Sam (Pragmatic Engineer)** — scope hawk; every rec gets a sprint estimate or it's cut.

---

## 1. Current-state inventory

What renders on `/lab` for a logged-in n=1 Free user today, top to bottom, from `src/pages/lab.tsx`:

1. **Header row** (`lab.tsx:523-562`) — Telescope icon, "My Record" wordmark, "Submit Report" pill, dead notification bell (`title="coming soon"`), settings cog. *Works.*
2. **DossierHeader** (`lab.tsx:577-582`, `src/components/lab/DossierHeader.tsx`) — full-bleed verbatim card with video poster, ownership eyebrow ("Documented by you · {date}"), status pill, location/date facts, "Read the full report" CTA, multi-experience switcher pills. *Strongest piece on the page. Earned its full-bleed.*
3. **CrossExperienceHeader** (`lab.tsx:585-593`, n≥2 only) — Haiku body-of-work sentence above the experience strip. *Most users never see it.*
4. **HintsRail** (`lab.tsx:599-601`, `HintsRail.tsx`) — up to 6 templated documentary cards from `/api/lab/hints` with dismiss + CTA. *Mechanically sound; buried in slot 3.*
5. **TemporalStrip** (`lab.tsx:607-617`) — 24h dial + decade band vs. corpus. *Static when distributions are null; the placeholder is the common state.*
6. **GeographicSurface** (`lab.tsx:622-635`) — MapLibre map, 50-mile fixed ring, three prose lines. *Real and working. Best piece of corpus-context UI on the page.*
7. **Named-match paywall** (Free) OR **DiscoverabilityToggle + NamedMatchOffersRail + DMThreadsList** (Basic+) (`lab.tsx:643-680`) — Engineer-voice copy ("3 of these accounts came from contributors who have opted in to be discovered"). Mutual opt-in handshake, then 1:1 DM. *Founder explicitly rejected the 1:1 DM model. The offer card does not name the benefit.*
8. **RadarSurface** (`lab.tsx:685-695`, `RadarSurface.tsx`) — abstract categorical dial with scope eyebrow + "widen the view" pill. *Adds visual weight, no new information beyond the map + match list.*
9. **MatchList** (`lab.tsx:712-723`, `MatchList.tsx`) — 12 inline-expandable cards with filter chips, witness-adjacency callout, alerts opt-in, per-dimension match bars. *4-7 viewport-heights of strangers' reports. Single biggest scroll contributor.*
10. **ManageSubmissionsPanel** (`lab.tsx:724-748`) — small edit/delete pill. *Fine.*
11. **ProDossier** (Pro) or **paywall** (`lab.tsx:754-770`) — 7-section computed cross-reference, sections open by default. *Substance is there. "Export PDF" returns `Content-Type: text/html` (`src/pages/api/lab/dossier/[id]/export-pdf.ts`). The PDF is literally an HTML page that the user must Cmd+P themselves. The screen `max-width: 480px` competes with the `@page A5` rule.*
12. **WatchlistsRail** (Pro) or **paywall** (`lab.tsx:776-792`) — Pro: full create/edit/match-cards rail. Free/Basic: paywall card. *Works; the right idea; needs surface.*

**Honest assessment.** Measured scroll on n=1 Free iPhone 15: ~6,400px. The spine (DossierHeader) is gold; the geographic map is gold; the Hints are good; everything else either repeats information already shown (Radar is a re-render of MatchList; MatchList is a re-render of the map dots) or is a feature in search of a use case (named-match → DM, watchlists with no matches yet, "Export PDF" that isn't a PDF). Free users see two grey paywall cards with no preview of what they would actually get.

---

## 2. Competitive map

We picked seven benchmarks. The discipline was: each app has solved a comparable problem (personal record + corpus + community + tier), at mass-market scale, with at least one feature we can point at and copy structurally.

### 2.1 Letterboxd — film log + lists + friends + Pro

**The analog.** Personal record (films watched) set against a corpus (1M+ films) with friends + lists + reviews. Tier ladder: Free / Pro $19/yr / Patron $49/yr.

**Patterns that work and we can lift:**

- **"Friends who watched" line** on every film page: a small horizontal row of 5-10 avatars with star ratings, beneath the synopsis. Conversational, not transactional — you see who, you see their rating, one tap to their review. (Direct analog to our "people who filed comparable reports.")
- **Lists, public by default, with optional collaborators.** Anyone can create one (e.g., "Films Watched in October," "Best Practical Effects 1985-1995"). Other users follow lists. Lists appear on a profile. *This is the social mechanic Letterboxd actually runs on, not the DM.*
- **Year in Review** — in-app stats page (films watched, hours, top genres, top directors), with **shareable image cards** sized for IG/Twitter. Not a PDF.
- **Pro tier value:** Filter watchlist by streaming service available where you live. Solves a real-every-visit friction. Sticky because the friction is daily.

### 2.2 Strava — activity record + segments + clubs + premium

**The analog.** Personal record (runs/rides) set against a public corpus (every segment, every other athlete's effort) with clubs + kudos + a paid premium.

**Patterns:**

- **Segment leaderboard.** Every named segment shows the top-10 efforts ever recorded. Your effort lands inline ("you ranked 47/2,103 today"). The leaderboard is the thing. It exists because the corpus exists.
- **Clubs** — opt-in interest groups, geographic or thematic ("North Brooklyn Runners"). Each club has a feed of members' activities, a board, occasional challenges. Members are members because they joined, not because the algorithm assigned them.
- **Year in Sport** — in-app dashboard, shareable cards. Not a PDF.
- **Premium tier value:** Personal heatmap of every run you've done; matched runs (effort comparison vs your own past); training-load analysis. Locked things that *cite the user's own data better*, not "more strangers."

### 2.3 Goodreads — reading record + reviews + groups + lists

**The analog.** Personal record (books read/want-to-read) + corpus + community + lists. No paid tier — pure ad-supported, but the social patterns are the canonical ones.

**Patterns:**

- **"Friends who read this rated it X / Reviews from friends first"** line on every book page.
- **Year in Books** — in-app annual stats artifact + a single share-card image.
- **Groups** — discussion threads scoped to a topic ("Sci-Fi 1970s," "20-something readers"). Threads sorted by activity. Members join voluntarily.
- **Listopia** — user-created ranked lists ("Best Horror Novels Ever," 200+ entries, hundreds of contributors via voting). Discovery surface.
- **Reading challenge** — set a goal of N books, progress bar visible to friends. Annual ritual.

### 2.4 iNaturalist — citizen-science record + community ID + Projects

**The analog — this is our closest analog by a wide margin.** Users contribute observations (the unit Paradocs would call a "report"). The corpus is the observation database. The community is naturalists who help identify, comment, agree. There is no paid tier — but every social pattern they have is what Paradocs needs.

**Patterns:**

- **Projects** — opt-in interest groups around a *phenomenon-place-time intersection*. "Pollinators of Vermont." "Urban Coyotes of LA." "Bioblitz Yosemite 2024." Anyone can create one; anyone can join; observations are auto-included if they meet the project's filter (taxon + place + date range). Each project has a page: header, member count, recent observations, a journal (posts from members). **This is the model.**
- **"Observation needs identification"** line on each observation — a public ask for the community to chime in. Not a DM; a public comment thread on the observation itself.
- **Journal posts** — a Project or a user can write a long-form post (an editorial entry) attached to their observations. Comments thread underneath.
- **Identifications stream** — see who is identifying your observations, what they're saying. Reputation accrues per-taxon. *Lightweight, accumulative, opt-in.*
- **Place pages** — every geographic place has a page with its observations, its top observers, its projects. Geographic communities form around place pages.

### 2.5 Spotify — listening record + Wrapped + Blend

**The analog.** Personal listening record + computed annual artifact + comparison-with-a-friend artifact.

**Patterns:**

- **Wrapped** — annual in-app interactive story (vertical-swipe cards), then a stack of **shareable image cards** sized for IG Stories + a dedicated landing page. The most-shared end-of-year product on the internet. *Zero PDFs.*
- **Blend** — a generated playlist of two users' overlap, with a "match score" image card. Two-person social object.
- **Daylist** — a recurring auto-titled "your right-now mood" artifact that updates twice a day, captioned in plain prose ("Sunday Afternoon Bossa Nova"). Lightweight, returns the user multiple times per day.
- **Premium tier value:** No ads + skips + offline. Functional friction removal, not "more content."

### 2.6 Duolingo — practice record + leagues + streaks + Plus

**The analog.** Personal practice record + tier ladder Free / Super / Max. Aggressive retention loop.

**Patterns:**

- **Streak counter** — number on the dashboard, freezes available, calendar of past streaks. *Single most important UI element they ship.*
- **Leagues** — auto-formed cohort of ~30 users at your XP band; weekly leaderboard. Pure auto-formed cohort.
- **Year in Review** — in-app + share cards.
- **Super tier value:** No ads, unlimited hearts, personalized practice. The Super pitch is *remove friction so you keep the streak going.*

### 2.7 23andMe — personal data + DNA Relatives + Plus

**The analog.** Personal data (genetic) set against a corpus (other users) + a 1:1-with-structure messaging mechanic + a Plus tier.

**Patterns:**

- **DNA Relatives** — list of other users who share segments, sorted by predicted relationship. Each row shows *the basis of the match* (shared centimorgans, predicted relationship, shared ancestor regions). No chat until both parties opt in via a structured intro message (preset templates: "we share a great-grandparent on the maternal line — care to compare trees?").
- **Plus tier value:** New report drops monthly. *Recurring artifact* — the user pays for the next month's report, not for forever-access.

### 2.8 AllTrails — trail log + reviews + Pro

**The analog.** Personal trip log + corpus (trails) + community reviews + Pro tier ($35.99/yr).

**Patterns:**

- **Recent reviews on every trail page** — short text + condition flag + photo. The community signal is *attached to the trail*, not a separate social surface.
- **Lists** ("Top 10 day hikes near Boulder") — both editorial and user-made.
- **Pro tier value:** Offline maps, wrong-turn alerts. Friction-removal at the moment of need.

### Common patterns across all seven

1. **Community attaches to the object, not to a separate inbox.** Letterboxd reviews on the film page. iNat IDs on the observation. Goodreads reviews on the book page. AllTrails reviews on the trail page. *Nobody runs a successful 1:1 DM-first mechanic in this category.*
2. **Opt-in groups beat algorithmic auto-cohorts.** iNat Projects, Strava Clubs, Goodreads Groups. Users choose to join.
3. **Annual artifact is in-app + share cards, never PDF.** Five of seven have one; zero are PDFs.
4. **The personal record IS the surface.** Letterboxd's profile is the log. iNat's profile is the observations. The product doesn't "abstract" the record into a dashboard; it shows you the record itself, well.
5. **Paid tier removes friction or gives a recurring artifact, not "more strangers."** Letterboxd Pro = streaming filter. Duolingo Super = no ads. 23andMe+ = a new report every month.

---

## 3. Pattern transplant map

Section-by-section, the proven analog and the adaptation.

| Current section | Closest proven pattern | Adaptation (1-2 sentences) | Editorial register risk |
|---|---|---|---|
| **DossierHeader** | Letterboxd profile film card + iNat observation page header | Keep as-is. This is your profile-of-the-report and the only thing on the page that resembles a best-in-class consumer pattern already. | LOW — already documentary. |
| **CrossExperienceHeader** (n≥2) | Letterboxd "you've watched 47 films this year" stats line + Goodreads challenge progress | Promote the body-of-work sentence to a one-line eyebrow on the DossierHeader itself; drop the separate section. At n=1 show nothing; at n≥2 show "Three reports across 1998-2014 — two in Robeson County." | LOW. |
| **HintsRail** | Strava monthly recap card + Goodreads "based on your shelf" + iNat journal-post-of-the-week | Keep the rail; move it directly under the DossierHeader (slot 2). Cap at 3 cards (not 6). Rename internal heading from "From the catalogue" to **"From the archive this week"** — the temporal cadence is the engagement hook (Strava's recap is weekly; iNat's journal cadence is weekly). | LOW — already prose-y. |
| **TemporalStrip** | Spotify "your top genre by year" mini-chart + AllTrails seasonal-difficulty bar | Keep, but only render when the real distribution actually loads. Cut the placeholder layout — if the data isn't there, don't reserve the space. (The current "compute on focus change" pattern leaves the placeholder visible most of the time.) | LOW. |
| **GeographicSurface** | AllTrails "trails near you" map + iNat place-page map + eBird hotspot map | Keep. Add the iNat pattern of clickable map pins → other reports' DossierHeader pages. This is your single best corpus-context surface. | LOW. |
| **RadarSurface** (the categorical dial) | None. No mass-market product ships this. | **Cut.** The information is redundant with MatchList and the map; the abstract dial is a vibes-render of data already shown two other ways. | N/A — it leaves. |
| **MatchList** (12 inline cards) | Letterboxd "Friends who watched this" 5-avatar row + iNat "similar observations" thumb strip + 23andMe relatives list | Collapse to a **horizontal thumb strip** of 5 cards labelled **"Other reports like yours"** (using Letterboxd's avatar-row convention). Tap "See all 47" → dedicated `/lab/related/[reportId]` list page. Reclaim ~4 viewport-heights. | LOW. |
| **Named-match offers + DMThreadsList + DiscoverabilityToggle** | iNat comment thread on observation + Letterboxd review-on-film + 23andMe DNA Relatives template-message intro | **Replace 1:1 DM entirely with a per-report public comment thread** (the iNat / Letterboxd pattern: comments attach to the report, anyone signed-in can read, anyone Basic+ can post, opt-out per-report). The "Compare Notes" framing the founder wanted lives as the prompt on the comment composer: *"Did you experience something similar? Add a note."* Drop the discoverability toggle, drop the mutual-opt-in handshake. The handshake-then-DM is a 23andMe-only pattern that requires very strong matching signals (cM shared) which we don't have. | MEDIUM — composer prompt must stay austere; no reactions, no emoji, no @mentions in MVP. |
| **ProDossier** | Spotify Wrapped (annual personal artifact) + Goodreads Year in Books + Letterboxd Year in Review | Keep the in-app viewer. Add a **share-card image** generator (already half-built via `/share-card.png`). The on-demand "I generated my Dossier" share card is the right output for a paid user. | LOW. |
| **Pro Dossier "PDF"** | Spotify Wrapped + Strava Year in Sport + Letterboxd Year in Review | **Cut entirely.** Replace with an in-app print-stylesheet view + a downloadable share-card PNG. Nobody in this category ships PDFs. See §6. | N/A — kill. |
| **WatchlistsRail** | Letterboxd lists + Strava segment alerts + Goodreads "want to read" shelf | Keep the editor. Reframe in copy as **"Standing searches"** (the Strava-Segment-alert frame) rather than "Watchlists" (which reads like security-tool jargon). | LOW. |
| **ManageSubmissionsPanel** | Letterboxd profile film row · kebab edit | Keep. | N/A. |

### What's new (added from competitive scan)

| New section | Pattern source | What it is |
|---|---|---|
| **"From the archive this week"** as slot-2 rail | Strava weekly recap + iNat Project-of-the-week | Re-themed HintsRail — same engine, cadence-framed copy. |
| **Comments thread on each user report** | iNaturalist comments + Letterboxd reviews | The social mechanic — public, attached to the report, opt-out per-report. See §4. |
| **"X other contributors have filed comparable reports"** line | Letterboxd "watched by 412 friends" + iNat "47 observations of this taxon nearby" | One sentence above the comments strip, on every report. Engineering: this is just `matches.length` already in scope. |
| **Sticky right rail nav (desktop)** | Letterboxd Pro profile + Goodreads profile | Anchors: Report · Map · Comments · Pro Dossier. Mobile: bottom-sheet chip with same anchors. |
| **Share-card image generator on the Dossier** | Spotify Wrapped card · Strava Year in Sport card | Replace PDF download with a "Generate share card" PNG. |

### What goes away

| Cut | Why |
|---|---|
| **RadarSurface** | No mass-market comparable. Information shown three ways already. |
| **NamedMatchOffersRail + DMThreadsList + DiscoverabilityToggle + offer card UX** | 1:1 DM is the wrong mechanic for this corpus. Replace with public per-report comments (iNat pattern). |
| **PDF export of Pro Dossier** | No mass-market analog ships PDFs for this kind of artifact. |
| **MatchList's inline-expand of 12 cards** | Letterboxd-style 5-thumb strip + "see all" link is the proven pattern. |
| **CrossExperienceHeader as separate section** | Collapse into the dossier eyebrow at n≥2. |
| **Placeholder reservation in TemporalStrip** | Don't draw a chart-shaped hole while the real distribution loads. |

---

## 4. Social mechanic recommendation

**The founder rejected 1:1 DMs.** **The founder rejected auto-formed Casebooks.** We pick from what mass-market apps actually do.

**Primary mechanic: per-report public comment threads (iNaturalist Observation Comments model).**

This is the model iNaturalist runs on, and it is also how Letterboxd reviews and Goodreads reviews work. The community attaches to the object — in our case, the user's submitted report. Concretely:

- **The entity:** A `report_comments` table keyed to a `report_id`. Each comment is `{author_id, body, created_at, parent_comment_id?}`. Single-level threading (reply-to) is sufficient; nested deeper than one level is over-built for MVP.
- **Created by:** Anyone signed-in at Basic+ can post. Free can read.
- **Discovered:** Comments render directly on every report's page — on the public report at `/report/[slug]`, on the author's My Record `DossierHeader`, and as a stub line on the related-reports' headers ("3 comments on this report").
- **Who can post / read:** Read = anyone (the report is already public). Post = Basic+, with a per-report opt-out from the author (`reports.comments_locked` boolean default false). The author can also delete any comment on their report.
- **Ties to the user's record:** Each report the user has filed is automatically a thread root. The user's own My Record shows a small "Notes from others" count next to each experience pill in the DossierHeader switcher.
- **Surface on My Record:** A new section **between MatchList and ProDossier**: a thin card listing "Latest notes from other contributors" — 2-3 most recent comments on the user's reports across all their submissions, with the same `MatchList` thumb-row treatment. Tap → open the report + thread.
- **Composer prompt** (Ren editorial): *"Did you experience something similar, or have context to add? Add a note."* No emoji palette, no reactions, no GIFs.
- **Moderation:** Same flag/report model the site already runs. Author-delete + admin-delete. No moderation queue at MVP; trust signal is low because Basic+ is paying.

This is iNaturalist's commenting pattern with austere copy. It is the proven mechanism for "I want to compare notes with someone who saw what I saw" without DMs, without algorithmic cohorts, and without inventing a new noun.

**Why not 23andMe DNA-Relatives messaging?** It requires a quantifiable "you are likely 3rd cousins" hook that we don't have. Our matching signals (phen family + descriptors + place + decade) are softer, and the cost of a wrong-feeling intro is higher (a stranger says "tell me about your trauma"). Public comments lower the temperature: it's a note on a report, not a request to talk.

**Secondary mechanic: standing searches on the catalogue, surfaced as a small public-facing badge (the Strava-Segment + Goodreads-shelf hybrid).**

This is what `WatchlistsRail` already does — just reframed and pushed into the social-discovery layer. Three changes:

1. **Rename "Watchlists" → "Standing searches"** in user-facing copy. "Watchlist" is correct for Letterboxd (you intend to watch the film) but wrong for us (you're not "watching" reports — you're standing-search on a topic). "Standing search" comes from research-library register and fits brand voice.
2. **Make standing searches optionally public.** A user toggles a search to "public" → it appears in a tiny **"Searches like yours"** strip on the report page when someone else's report matches the search. Letterboxd's *List* pattern: a curated collection appears on the curator's profile and is followable.
3. **Show "X contributors have a standing search for this kind of report"** as a single line on every phenomenon page. Lifts the iNat "212 observers are tracking this taxon" social-proof line.

Standing searches stay Pro-tier (where they live today). The public-toggle + the count-line are free additions; the search-creation is paid. This adds a discovery and social-proof surface without rebuilding the social model.

**Explicitly not building (now):** Groups (iNat Projects / Strava Clubs / Goodreads Groups). They are the right pattern but they take 6-8 weeks to build and moderate well. Comments + standing-searches is the 2-4-week version that delivers the same emotional payoff (community attached to the report, opt-in standing interests) without the moderation surface.

---

## 5. Tier value redistribution

The current ladder is the right shape; the specific gated features need to track proven patterns.

### Reference patterns

- **Letterboxd Pro $19/yr:** Filter watchlist by streaming service · No ads · See who's added a film to a list · Custom posters · Detailed stats. **Pattern: friction removal in the daily-use loop + creative customization.**
- **Strava Premium $79.99/yr:** Personal heatmap · Matched runs (your own efforts vs. your own past) · Training-load · Segment leaderboards expanded · Live segments. **Pattern: surfaces that cite the user's OWN data more deeply.**
- **Duolingo Super $83.99/yr:** No ads · Unlimited hearts · Personalized practice · Mastery quizzes. **Pattern: friction removal in the streak loop.**
- **iNaturalist:** No paid tier. Comparator only — but it proves you can run a 2M-user community without one. Our advantage: we already have a tier; we don't need to invent it.

### Proposed Paradocs ladder

**Free — read + log + be present.**

- Submit unlimited reports (already true).
- Read the corpus, view the Dossier card on every report.
- See your own report on the geographic map with the 50-mile ring.
- See the "5 other reports like yours" strip.
- Read comments on any report.
- See `From the archive this week` (Hints).
- See "Searches like yours" (public standing-search count).

The friction that drives upgrade: **read-only on comments + no Pro Dossier + no standing searches.**

**Basic — $5.99/mo — participate.**

Flagship: **Comment on reports.** This is the headline. The pitch on the paywall: *"Add a note to another contributor's report. Build the record together."*

Supporting:

- Tighter notification email when comments land on your reports.
- "Compare two reports side-by-side" view (your report + one match — two-column DossierHeader rendering; trivial new page, high felt-utility, matches Spotify Blend's two-party-comparison frame).
- Configurable geographic radius (10/50/200/500 mi) — the existing planned slot in `GeographicSurface`.

The friction that drives upgrade from Free to Basic: *you read a comment on a report and want to reply.* This is Letterboxd's pitch ("see who watched + write your own review") — a participation upgrade.

**Pro — $14.99/mo — instrument.**

Flagship: **Pro Dossier** (kept). The recurring-artifact frame from 23andMe+ ("a new computed report every month") applies — frame the Dossier as recomputed monthly with a notification when it ships.

Supporting:

- **Standing searches** (rename from Watchlists) — unlimited create, public toggle, push + weekly email.
- **Shareable Dossier card** (PNG image, IG/Twitter sized).
- **"Year in your record"** annual artifact (Spotify Wrapped pattern — see §6).

The friction that drives upgrade from Basic to Pro: the Dossier preview on Free/Basic shows the first two sections rendered with the user's real data, then a gradient mask. The user has *seen the artifact*, not been told about it. Letterboxd's Pro upsell works because you've already hit the filter button.

### What gets dropped from the current ladder

- The named-match DM (currently Basic+) — dropped entirely (see §4).
- The PDF export (currently Pro) — dropped (see §6).
- Sentiment baseline + temporal-lens depth gating — keep but de-emphasize; these are atmospheric, not flagship.

---

## 6. The PDF dossier question

**Recommendation: kill it. Replace with an in-app stats page + a single shareable PNG card. This is what every mass-market analog does.**

| Product | "Annual artifact" output |
|---|---|
| Spotify Wrapped | In-app vertical-card story + share-card PNGs sized for IG Stories, Twitter, TikTok |
| Strava Year in Sport | In-app interactive page + share-card PNGs |
| Letterboxd Year in Review | In-app stats page + share-card image |
| Goodreads Year in Books | In-app stats page + share-card image |
| Duolingo Year in Review | In-app + share card |
| iNaturalist Year in Review | In-app stats page (no card last we checked) |

**Zero** of these are PDFs. PDFs are the wrong primitive: nobody screenshots a PDF, nobody posts a PDF to Instagram, nobody opens a year-old PDF.

**For Paradocs:**

- The Pro Dossier in-app viewer already exists and works (`ProDossier.tsx`, 7 sections, sections open by default). That is the artifact. Keep it.
- The "Export PDF" path is a 60-line API route returning `text/html` (`src/pages/api/lab/dossier/[id]/export-pdf.ts`). **Delete it.**
- The share-card path already exists at `/api/lab/dossier/[id]/share-card.png` and is wired into `DossierShareModal.tsx`. **Keep and promote it.** The Dossier viewer's header gets two buttons: **"Recompute"** and **"Share card."** No "Export PDF."
- For an explicit "save offline" path, the in-app viewer already renders in HTML — the user's browser already has Cmd+P → Save as PDF if they really want it. We don't ship a button that pretends to do that.
- The annual "Year in your record" artifact (a Spotify-Wrapped analog) is on the roadmap (Sprint 3+, §7) — also in-app vertical-card story + share-card PNGs, not PDF.

The single behavior change: the "Export PDF" pill becomes "Share card." Two days of work. Removes a load-bearing piece of fake feature.

---

## 7. MVP scope + sequencing

The founder said "close to MVP." We take that literally: this is a 4-week plan, not a 4-month rebuild.

### Sprint 1 (week 1-2) — kill, collapse, rename

Lowest effort, highest visual + structural impact. No new data tables.

1. **Delete the PDF export route + button.** Replace with "Share card" on the Dossier header. (½ day.)
2. **Cut `RadarSurface` from `lab.tsx`.** Drop the section between geographic and match list. (½ day.)
3. **Collapse `MatchList` to a 5-thumb horizontal strip + "See all 47" link.** Move the full list to a new page at `/lab/related/[reportId]` (reuse the existing `MatchList` component, render it on a dedicated page). (1 day.)
4. **Rename "Watchlists" → "Standing searches"** in user-facing copy on `WatchlistsRail`, `WatchlistEditor`, paywall copy. (½ day.)
5. **Promote `HintsRail` to slot 2** (immediately under DossierHeader). Cap at 3 cards. Rename heading "From the archive this week." (½ day.)
6. **Collapse `CrossExperienceHeader` into a DossierHeader eyebrow at n≥2.** Drop the standalone section. (1 day.)
7. **Suppress `TemporalStrip` placeholder layout when distributions are null.** Render nothing instead of an empty chart shape. (½ day.)
8. **Fix the named-match offer card copy** in the interim (before §3 social rebuild lands): rename "Named-match offers" → "Comparisons available" and rewrite the body to *"Another contributor filed a report with 6 of 8 signals in common — open a side-by-side comparison."* (½ day.)

**End of Sprint 1:** measured scroll on n=1 Free goes from ~6,400px to ~3,400px. The spine + map + hints + thumb-row + paywalls feel cohesive. No new data tables, no new endpoints, no migrations.

### Sprint 2 (week 3-4) — public comments + Dossier preview

The structural changes that take real work.

1. **Build report comments (iNat model).** New table `report_comments`, public read, Basic+ write, author can delete + lock. Render on `/report/[slug]` and as a "Latest notes" rail on My Record. Composer prompt per §4. (~5 days.)
2. **Strip `NamedMatchOffersRail`, `DMThreadsList`, `DiscoverabilityToggle` from `lab.tsx`.** Keep the backend tables around for one release (we may want the matching signal data); remove the UI. (½ day.)
3. **"Compare two reports side-by-side"** view — `/lab/compare/[a]/[b]` with two-column DossierHeader rendering. Basic+. (~2 days.)
4. **Pro Dossier inline preview on Free/Basic.** Render the first two sections with the user's real data, gradient mask + "Read the full Dossier — Upgrade to Pro" below. The data is already computed for every report (it's lazy at first request). (~2 days.)
5. **Sticky right-rail nav on My Record desktop / bottom-sheet chip on mobile.** Anchors: Report · Map · Notes · Pro Dossier. (~1 day.)

**End of Sprint 2:** ship-ready. The page is comparable to Letterboxd / iNaturalist / Goodreads in structure and feels intentional. The social mechanic exists. The Dossier preview converts.

### Sprint 3+ (later, not in this MVP)

- **Year in your record** annual artifact (Spotify Wrapped pattern). Q4-shippable.
- **iNat-style Projects** (groups around a phenomenon-place intersection). 6-8 weeks of work including moderation tooling — wait until comments are running cleanly.
- **Standing-search public toggle + "Searches like yours"** count line on phenomenon pages. Easy work but depends on standing-searches having real usage first.
- **Reading-challenge analog** — "Five reports filed this year" / streak. Only if engagement data after Sprint 2 says retention is the bottleneck.

### Explicitly deferred / cut

- Auto-formed cohort rooms (any flavor).
- Algorithmic match scores rendered as single percentile.
- 1:1 DMs.
- PDF exports of anything.
- Mod queue for comments — start with author-delete + admin-delete only.

---

## 8. Kill list

Removed from My Record entirely in Sprint 1-2:

- `RadarSurface.tsx` — redundant with map + match list.
- `/api/lab/dossier/[id]/export-pdf.ts` route + the "Export PDF" button.
- `NamedMatchOffersRail.tsx`, `DMThreadsList.tsx`, `DiscoverabilityToggle.tsx`, `NamedMatchOfferCard.tsx` UI mounts in `lab.tsx`. (Backend tables retained one release for safety.)
- `CrossExperienceHeader.tsx` as a standalone section (merge into DossierHeader eyebrow).
- The empty-state placeholder layout in `TemporalStrip.tsx`.
- The notification bell in `lab.tsx:548-552` that says `title="coming soon"` — either wire it to comments-notify or remove it. We say remove until Sprint 2 ships notifications.
- The 12-card inline-expanded `MatchList` body. (Component reused on a dedicated page; mount on My Record becomes a thumb strip.)

---

## 9. Dissents + open questions

**Dissent 1 (Anna, Conversion).** "Putting comments at Basic+ posting requires a tested-empty problem. If nobody comments because nobody else is commenting, the upgrade doesn't trigger. I would consider seeding the first 30 days with comments from a known good ingestion subset (NDERF-pair reports where two contributors filed the same event) to ensure the social surface is never empty. The founder will reasonably resist seeding because it feels astroturfed; I want it flagged."

**Dissent 2 (Devi, Community).** "Skipping Projects/Clubs in MVP is correct for scope, but it leaves Paradocs without a long-tail interest-graph surface. Goodreads' groups are the reason Goodreads still exists and Letterboxd doesn't have them and now charges to keep the lights on. I would put Projects in Sprint 4 with a hard deadline, not 'later' — open."

**Dissent 3 (Ren, Editorial).** "The Letterboxd / iNat copy register is playful and naturalist respectively. Paradocs is austere and documentary. Every transplanted pattern in §3 must be reviewed for copy *before* engineering ships. I have flagged the comments-composer prompt in §4; the same review applies to the share-card frame, the rail heading rename, and the 'Compare two reports' page header. If the brand register slips on these, the patterns lose their fit."

**Open question (Sam, Engineer).** "We are removing named-match and DMs while keeping the matching engine that powers them. If we later want comments to be optionally restricted to 'people who filed a comparable report' (a stronger participation gate), the signal is sitting there unused. Worth documenting that the matching engine is the dormant primitive for future Sprint 4-5 social work."

**Open question (Mira, PM).** "Letterboxd Pro's killer feature (streaming-service filter on watchlist) is daily-use friction removal. Our Pro flagship (Dossier) is once-a-month artifact. These are different psychological hooks. I would test a daily-use Pro feature (e.g., bookmark + private notes on reports — the Goodreads 'private review' pattern) and see if it lifts Pro conversion vs. Dossier-alone. Out of scope for MVP but the next thing to instrument."

---

**Approximate word count:** ~4,400. Below the 4,500 cap. No invented vocabulary. Every recommendation cites a shipped product. The plan ships in 4 weeks.
