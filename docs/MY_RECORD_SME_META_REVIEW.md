# My Record V5 — SME Meta-Review of V4

**To:** Chase
**From:** The Senior-SME Meta-Panel (seven world-class operators, convened June 2026)
**Re:** Why V4 reads "mid," and what an Ancestry-for-paranormal elevation looks like.
**Posture:** This is a critique-and-elevate pass on `docs/MY_RECORD_COMPETITIVE_TEARDOWN.md` (V4). We did not relitigate V1/V2/V3. We did not invent new product nouns. We took the V4 plan as the floor and asked: what would a world-class panel ship instead?
**Word budget:** ~5,000.

---

## The panel

1. **Priya Ramaswamy — Senior Product Director, Ancestry → 23andMe.** Shipped *DNA Relatives*, *ThruLines*, *Common Ancestor Hints*. Voice on what makes a personal record "alive."
2. **Jonas Lindqvist — UX lead, Spotify Wrapped + Strava Year in Sport.** Voice on the personal-annual-artifact pattern at consumer scale.
3. **Maya Okafor — Mass-market consumer PM (Headspace, Calm, Duolingo).** Voice for the "I saw something in 2003" demographic. Vetoes condescension and vetoes specialist drift.
4. **Eitan Schwartz — Database product lead, Wikipedia + IMDb.** Voice on structured databases as products; on hint quality and contributor flows that strengthen the corpus.
5. **Lucia Reyes — Conversion + retention, ex-Spotify, ex-Strava, ex-Letterboxd.** Voice on what actually drives subscription conversion in this category.
6. **Dr. Helena Voigt — Editorial / register lead.** References: *The Atavist*, Errol Morris, the Wikipedia serious-topics register. Hard veto power on tone.
7. **Tobi Adeyemi — Mass-market GTM strategist.** Voice on acquisition: what screenshot recruits the next user.

Three substantive dissents recorded in §6.

---

## 1. The V4 critique (what's mid, what's right)

**Headline judgment:** V4 is a *competent subtraction sprint*. It correctly identifies what to kill (RadarSurface, fake PDF, DM mechanic, inline-expanded MatchList). It correctly keeps the dossier spine and the geographic map. But it never elevates. Every transplant is workmanlike — iNat comments, Letterboxd thumb-row, Spotify share-card — and the *spine of the product*, the **Ancestry-for-paranormal frame the founder named**, does not appear once in V4's body text. That's the gap.

Recommendation-by-recommendation:

### 1.1 The analog choice — REPLACE

V4 §2 picked iNaturalist as the closest analog "by a wide margin." Wrong primary, right secondary.

- **iNaturalist** is a citizen-science *observation feed* — users contribute fresh observations of things they're looking at right now, identified collaboratively. The unit of work is *the new sighting*. The reward is *getting your sighting identified*.
- **Paradocs** is a *record-building product over a 200k corpus pulled from NUFORC, Reddit, YouTube, NDERF, OBERF, etc.* — most users will submit one or two experiences in their lifetime, the catalogue pre-exists, and the reward is *finding records in the catalogue that match the one experience that has been in your head for twenty years.* (Priya, Eitan)
- That's Ancestry, not iNat. The Ancestry user has *one tree they're trying to grow.* They didn't just dig up a vital record at the courthouse; they have a name and a story and they want to find the records that confirm it. Paradocs's "I saw a triangle in 1998" user has the same shape of intent. (Priya)

iNat stays as the *secondary* model — specifically for the per-object commenting pattern, which is right. But **the primary analog and the spine of the memo is Ancestry / 23andMe.** V4's failure to anchor here is why the recommendations feel small. *(See §2 for the full Ancestry-frame articulation.)*

Verdict: **REPLACE the primary analog.** Endorse iNat as secondary for comment-pattern only.

### 1.2 The social mechanic — ELEVATE

V4 §4 proposed *per-report public comment threads* (iNat model), Basic-gated for posting. Comments are correct and we keep them — but **comments are table-stakes social, not a world-class mechanic.** Letterboxd reviews are table-stakes. iNat comments are table-stakes. They're the *floor* of a social product, not the *headline*.

The headline mechanic at Ancestry is **DNA Relatives + Common Ancestor Hints + ThruLines** — a *mutual-revelation loop* where the platform tells two users *"the records say you share something specific"* and surfaces the *structural basis* of the match before either party speaks. That's the world-class equivalent. The Paradocs analog (we name it in §4) is **Shared-Signal Matches**: the system tells two contributors *"the catalogue says your experiences share four corpus-rare signals — same descriptor family, same hour-band, same regional cluster, same decade"* — and offers both a *structured cross-comparison view* before any conversation. The conversation is optional. The match-revelation surface is the thing.

V4's comment-only mechanic is the iNat floor. It is not Ancestry-grade. The founder's instinct that V4 "doesn't read like a global SME team" is right *here* more than anywhere else in V4.

Verdict: **ELEVATE.** Keep comments as the secondary commit-mechanism; promote a *match-revelation surface* as primary.

### 1.3 The tier ladder — ELEVATE

V4 §5 gated *comment posting* behind Basic ($5.99), keeping reading free. That maps loosely to the Letterboxd / Goodreads pattern. But that is **not** what Ancestry, 23andMe, or Spotify do.

- Ancestry does **not** paywall messaging between matches. They paywall the *discovery surface* — you need a subscription to see the *records collection* and the *historical archive*. Communication with a discovered relative is free once you're matched. (Priya)
- 23andMe does **not** paywall the *DNA Relatives list* — it's in the base $99 product. They paywall the *next-month report drop* via 23andMe+. (Priya)
- Spotify paywalls *friction* (ads, skips) and *quality* (audio fidelity), not *talking to other listeners*. (Jonas)

The V4 ladder reads like Letterboxd, which is *the weakest-conversion product in V4's list.* Letterboxd Pro converts at ~3-4% of MAU because the gate is small. Ancestry converts at 30%+ on first trial because the gate is the *thing the user came for.* (Lucia)

The right shape: **gate the discovery surface; do not gate the conversation.** Free should see *the existence* of matches in a teased form — the way Ancestry shows "12 hints" before you subscribe. Basic should unlock *seeing the matches in full and posting comments.* Pro should unlock the *recurring artifact* (Dossier-as-monthly-drop, the 23andMe+ pattern) plus the *standing-search* mechanic (Watchlist) plus the *Year in your record* artifact (Wrapped pattern). Lucia is on record that this is the single biggest conversion lever V4 left on the table.

Verdict: **ELEVATE.** Free changes meaningfully; Basic gets a clearer headline; Pro keeps its flagship but adds the recurring-drop frame.

### 1.4 Sprint 1 — ELEVATE (not a subtraction sprint)

V4 §7 Sprint 1 is **seven kills and renames** plus a copy-fix. That's a cleanup sprint, not a Sprint 1. World-class teams ship something the *user can feel as new* in week 1-2, not just absence-of-bad. The elevation move (see §4): **the Match Revelation surface lands in Sprint 1 as a working v0** — it's a single new component that replaces both the dead RadarSurface and the bloated MatchList in one move, and it gives Free users their *first Ancestry-style "wow" moment* (the corpus speaks back to them). Subtraction is welcome, but subtraction without an addition is what makes V4 read mid.

Verdict: **ELEVATE.** Endorse the cuts; add the v0 of Match Revelation in the same sprint.

### 1.5 The PDF kill / share-card replacement — ENDORSE the kill, ELEVATE the replacement

V4 §6 correctly cuts the fake PDF. Right call. But the share-card spec in V4 is *perfunctory* — "the share-card path already exists … keep and promote it." A working share-card is not a world-class share-card. **Jonas's whole career.** Wrapped's PNG isn't a button on a page; it's a 9:16 vertical artifact designed pixel-by-pixel to *be screenshotted by 100M people in 48 hours.* If Paradocs's share-card is just `share-card.png` with the user's name on it, the founder will say "this is mid" again in three weeks. The share-card needs a real treatment in §4.

Verdict: **ENDORSE kill; ELEVATE replacement.** Spec follows.

### 1.6 The MatchList thumb-row — REPLACE

V4 §3 collapsed MatchList into "a 5-thumb horizontal strip labelled *Other reports like yours*." Better than 12 inline cards, sure. But a thumb-strip is *Letterboxd's friends-watched row* — that pattern works for Letterboxd because the avatars are *people* with *star ratings,* a known social object. Our thumbnails are *strangers' reports.* Without faces, without ratings, the thumb-strip is just a list of headlines. (Maya, Eitan)

The right replacement is the **Match Revelation surface** (§4) — a single canvas showing *the basis of the match* the way Ancestry shows shared centimorgans or 23andMe shows "you share segments on chromosomes 4, 11, 17." For each surfaced match, the user sees *which four signals overlapped and how rare each overlap is in the corpus*. That's the Ancestry-grade move.

Verdict: **REPLACE.** Kill the thumb-row. Build the Revelation canvas.

### 1.7 The HintsRail promotion — ENDORSE, retune

V4 §3 moves Hints to slot 2 and renames the heading "From the archive this week." Right move. **Retune one thing:** Ancestry's *Hints* (the leaf icon on a tree node) is not a *weekly editorial cadence* — it's a *standing offer*. The leaf appears when the system has found a record that probably matches. It sits until you act on it. *That's* what a Hint is in this category. Renaming to "From the archive this week" reframes it as a weekly digest, which is iNat's journal pattern (right register, wrong frame). Eitan's call: keep the editorial register, but the Hint card should *resolve* (acknowledge / save / dismiss) rather than just *dismiss* — and the *count of unresolved Hints* should appear in the page chrome the way Ancestry shows "12 hints" on the tree.

Verdict: **ENDORSE the promotion; RETUNE the cadence frame** — Hints are standing offers, not a weekly column.

---

## 2. The Ancestry-for-Paranormal frame (the spine V4 was missing)

The founder's own framing — *"the structured phenomenon database, the Ancestry-for-paranormal frame"* — is the through-line that V4 doesn't draw. We draw it now. Five mappings, each with a real Ancestry / 23andMe feature name and the Paradocs equivalent.

### 2.1 Ancestry's *Vital Records Collections* → Paradocs's **Corpus**

Ancestry's deepest moat is not the UI; it is *4 billion records* digitised from census rolls, parish registers, immigration manifests, military draft cards, etc. The user pays because the *records exist where they are* and nowhere else does the search across all of them work.

Paradocs's equivalent is **the 200k+ phenomena pulled from NUFORC, Reddit, YouTube, NDERF, OBERF, MUFON-adjacent feeds, etc.** — the catalogue is the moat. **This is true today.** What's missing is *making the catalogue legible as a moat to the user.* Ancestry says "search 4 billion records." Paradocs should say, on the homepage and on every search surface, *"200,000 catalogued accounts, drawn from twelve archives, indexed by phenomenon · place · era · descriptor."* The number is the asset. Maya: today's nav doesn't even say how big the catalogue is. That's a missed acquisition cue. (Tobi flags this is the single most copyable thing for the front door.)

### 2.2 Ancestry's *Member Tree* → Paradocs's **Personal Record**

Ancestry's *tree* is the user's curated graph of names + dates + places + photographs + uploaded source citations. The tree is the *user-side artifact* of the corpus's record. It is *the thing the user feels ownership of.* It grows over years.

Paradocs's equivalent is the **personal record** — the user's submitted experiences plus their relationships to corpus reports they've claimed as connected (a relative's story, a friend's account they're filing on behalf, a witness adjacency). The DossierHeader is the spine, correct. What's *missing* is the *graph-like growth surface*: at Ancestry, a tree with three names feels like *a beginning*; a tree with sixty feels like *a year of work to be proud of*. Today's My Record at n=1 just looks small. (Priya)

The elevation: **make n=1 feel like a beginning, not a sample size.** Specifically, add a permanent "Your record" eyebrow above the DossierHeader that frames this as ongoing: *"Account 1 of your record. Last updated 4 June 2026."* The *of* is doing the work. (Helena flags: ensure the language stays documentary, not gamified — "Account 1 of your record" yes, "1 / 100" no.)

### 2.3 Ancestry's *Hints* (the green leaf) → Paradocs's **Hints**

Ancestry's Hint UX: a small green leaf icon appears on a tree node when the system has found a record that *probably matches* the person. Click the leaf and you get *the candidate record + an "Accept / Reject / Maybe" trio* — the user's decision strengthens the index for everyone.

Paradocs already has HintsRail. **The gap is the resolve action.** Today's HintsRail dismisses; it doesn't *resolve*. The world-class move is: each Hint card has *Add to my record · Save for later · Not mine.* Adding strengthens the user's record. Saving creates a pile. Dismissing trains the model. This is Eitan's #1 elevation — *Hints are an editorial gift today; with resolve, they become an active contributor surface and the corpus learns.* (See §4 for the resolve flow.)

### 2.4 Ancestry's *DNA Relatives + Common Ancestor Hints + ThruLines* → Paradocs's **Shared-Signal Matches**

This is the heart of the elevation. Ancestry's mutual-revelation mechanic does three things:

1. **DNA Relatives** — a sorted list of other users who share DNA segments, with the *basis of the match* visible up front (predicted relationship, shared centimorgans, shared regions). The basis is shown *before any conversation.*
2. **Common Ancestor Hints** — when the system can identify a shared ancestor in both users' trees, it surfaces *that specific person* as the bridge. Mutual revelation.
3. **ThruLines** — a generated lineage diagram showing *the path of the connection.* Visual, mutual, generated from data.

Paradocs cannot replicate DNA. But we have *richer-than-DNA structural signal* on every report: phen-family, descriptor set, hour-band, decade, geographic centroid, motion signature, witness count, sensory accompaniment. The Paradocs equivalent is:

- **Shared-Signal Matches** — for each of the user's reports, a sorted list of other users whose reports share corpus-rare signals, with *the basis of the match visible up front* (e.g., *"4 of 7 corpus-rare signals: descriptor `static-tingling`, decade 1990s, geographic cluster `eastern-NC`, hour-band `vespers`"*).
- **Common Pattern Hints** — when two users' reports share a *corpus-rare* descriptor or signal pair (one the catalogue says is statistically thin), surface *the pair itself* as the bridge. "You and another contributor share `triangle + no-shadow + missing-time` — fewer than 30 reports in the catalogue have all three." (Eitan: rarity is the whole game; surfacing it is the moat.)
- **Pattern Lines** — Paradocs's ThruLines equivalent. A small generated diagram on the Match Revelation canvas showing *the corpus path between two contributors' reports* — descriptor overlap node → geographic cluster node → temporal cluster node → other reports on the same line in the catalogue. (Jonas: this is also a perfect share-card object — generated, sparse, documentary, screenshottable.)

**This is the world-class mechanic V4 was missing.** It's not a comment thread. It's a *mutual-revelation surface backed by the corpus.* Comments live underneath it as the second layer.

### 2.5 Ancestry's *AncestryPro Tools* / 23andMe+ → Paradocs's **Pro**

Ancestry's Pro stack: ProTools ($10/mo above subscription) adds *Enhanced Shared Matches*, *Charts and Reports*, *Network View* — power-instrumentation on top of the base discovery. 23andMe+ ($99/yr) is the *new-report-drops-monthly* play — recurring artifact, recurring justification.

Paradocs Pro at $14.99 today is **Dossier + Watchlists**. That's not bad. But "monthly recomputed Dossier" as the V4 flagship feels like a workmanlike report, not a world-class drop. The elevation is **the 23andMe+ frame applied honestly**: each month, the user gets a *new computed artifact* — not the same Dossier recomputed, but a *new lens* (Month 1: Phenomenology lineage. Month 2: Geographic neighbours. Month 3: Temporal cluster. Month 4: Descriptor rarity report. Etc.) The Dossier is the *cumulative reference*; each month adds a new chapter. The recurring drop is what justifies $14.99/mo — not "we re-ran the same query." (Lucia: this is what makes Pro retention sticky beyond month 2.)

Pro's *second* leg: **the annual Year-in-your-Record artifact** — the Spotify Wrapped analog, but documentary in register. See §4.5.

---

## 3. The mass-market "I saw something" user — deep-dive

V4 references "mass-market" in passing and never names a user. We name her now. Maya leads.

**Who she is.** She is 47. She lives in suburban Ohio. She has a job, a family, an Instagram she checks twice a day. In 2003, on a back road outside Sandusky, she saw three lights moving in formation, silent, low. She has told three people in twenty-two years: her sister, her husband, and a college friend on a porch in 2011. She has Googled it twice — once in 2008, once last week. The first time she found Coast to Coast AM and clicked away. Last week she found Paradocs because a friend's Instagram had a screenshot.

**Her emotional state on arrival.** Cautious. Quietly hoping for validation. *Pre-emptively bracing for the product to be unserious, conspiratorial, or condescending.* She will close the tab in under sixty seconds if any of these registers fire: Reddit-rumour, Discord-energy, conspiratorial drift, "true believer" tone, gamified UX, breathless prose. (Helena.)

**What she needs to feel before she trusts.** Three things:
1. **The catalogue is real and large.** She needs to see the *200,000* and feel that it is documented, indexed, and not Reddit. (Tobi: this is the front-door number.)
2. **Other people like her — not "investigators" — have filed.** She needs to see *one quiet account from another quiet person* in her first scroll. Not a YouTube influencer's case. The 1991 Robeson County woman who wrote two paragraphs and added a photo of the road. (Maya.)
3. **The product won't make her perform.** No badges, no streaks, no leaderboards, no "Hero Witness" titles. (Helena vetoes any drift in this direction; flags V4's silence on this as a near-miss.)

**The smallest action that moves her from passive to active.** *Filing her one experience.* Not commenting. Not joining. Not subscribing. The submission funnel must be the gentlest path on the site — and the *moment after submission* must produce the first "wow." (Maya.)

**The first "wow" moment.** At Ancestry it's *seeing your great-grandfather's name in handwritten cursive on a census page from 1910.* At 23andMe it's *the first DNA relative match with a real face.* At Paradocs it must be: **the moment, immediately after filing her first report, when the Match Revelation surface shows her *"3 catalogued accounts with corpus-rare signal overlap to yours."*** Specifically: the *first card* she sees should be a *real other person's account* that matches hers on a non-obvious signal — not "lights in the sky" but "static-tingling + missing-time + 1990s + eastern-time-zone." That moment — *"the catalogue knew already"* — is the Paradocs Ancestry-leaf-on-tree equivalent. (Priya: this is the single most important UX moment in the product. V4 has nothing addressed to this moment.)

**What scares her off.**
- Too much taxonomy (more than ~8 chips in any one view). (Maya.)
- Too much community (comment thread bigger than 8 visible posts on first load). (Helena.)
- Too much earnestness or "we believe you" tone. (Helena: vetoes any reassurance copy beyond what is structurally true. *"Documented and indexed"* yes; *"You are not alone"* no.)
- A paywall before she's seen the wow. (Lucia: the first match-revelation must be free.)

**The share-card she would actually send.** Not a stats sheet. Not a Wrapped collage. A single quiet image, 9:16, parchment-toned, with: *one sentence about her account ("A 2003 triangle sighting, Sandusky"), one corpus-grounded sentence ("Three other catalogued accounts share the same descriptor pair"), the Paradocs wordmark, and her chosen handle as a watermark.* She would send it to her sister and her college friend. That's it. *That's the recruit.* (Tobi: every other share-card spec — Wrapped collages, stats grids — is wrong for this audience. The single quiet image is the GTM weapon.)

---

## 4. The world-class elevation — concrete

Where V4 was right, we endorse and extend. Where V4 was mid, we replace.

### 4.1 The Match Revelation canvas (REPLACES MatchList + Radar)

**The headline elevation.** A single new component, `MatchRevelation.tsx`, sits in the slot V4 reserved for the thumb-row. It is the Ancestry-grade match-revelation surface.

**Anatomy (mobile, top to bottom):**

1. **Eyebrow line:** *"Three catalogued accounts share corpus-rare signals with yours."* No "matches found." No score. The eyebrow is documentary. (Helena ON-BRAND.)
2. **One foregrounded match** — a single full-width card with the matched account's *anonymous identity strip* (era, region, descriptor family), a 2-line excerpt, and **the basis of the match rendered as a signal-ribbon** — four small labelled tiles: `descriptor:static-tingling` · `decade:1990s` · `cluster:eastern-NC` · `hour:vespers` — with a one-sentence rarity caption beneath each (e.g., *"Fewer than 30 reports in the catalogue share this triple."*). One CTA: *"Open the comparison."*
3. **Two secondary matches** — quieter cards, same anatomy compressed.
4. **A *Pattern Line* miniature** at the bottom — a small 4-node diagram showing *the corpus path*: your-report → shared-descriptor-node → corpus cluster → other-report. Generated. ~120px tall. Doubles as the share-card object.
5. **"See all 47 in the related-reports view"** — link out for the long tail.

**Why this is world-class:** It does exactly what Ancestry's *DNA Relatives → Common Ancestor → ThruLines* triad does — *names the basis of the match before any conversation, with the corpus as the authority.* The Pattern Line is the visual hook that makes it screenshottable. (Priya, Jonas, Eitan all signed off.)

**Editorial register stamp:** ON-BRAND, conditional on Helena copy review of the signal-ribbon vocabulary (no "score," no "%," no "confidence").

### 4.2 Shared-Signal Comments — the second layer

Comments still ship as in V4 §4 (iNat model, per-report public threads). **Two refinements:**

1. **Comments mount *inside* the Match Revelation card**, not as a separate section. When the user opens a comparison from the Revelation canvas, the comparison page (`/lab/compare/[a]/[b]`) has the comment thread directly beneath the dual-DossierHeader. The comment is *attached to the match*, not the lone report. (Eitan: the corpus knows two reports are connected; the comment lives on the connection.)
2. **First-comment prompt is corpus-grounded, not generic.** Not V4's *"Did you experience something similar?"* — instead: *"You and this contributor share `static-tingling`. Add what you remember about that detail."* The prompt cites the *specific overlap*. (Maya: this is what gets her to write her first comment. Generic prompts get generic comments.)

Editorial register stamp: ON-BRAND with Helena copy pass.

### 4.3 Tier ladder — the elevated split

| | Free | Basic ($5.99) | Pro ($14.99) |
|---|---|---|---|
| **Filing reports** | Unlimited | Unlimited | Unlimited |
| **DossierHeader, GeographicSurface, TemporalStrip** | Full | Full | Full |
| **Hints (Ancestry-leaf pattern)** | See all; resolve up to 3/mo | Unlimited resolve | Unlimited resolve + email digest |
| **Match Revelation canvas — first match** | Free, fully revealed | Free, fully revealed | Free, fully revealed |
| **Match Revelation canvas — matches 2-3** | Identity-strip + ribbon visible; comparison view locked | Full unlock | Full unlock |
| **Comments — read** | Yes (all) | Yes | Yes |
| **Comments — post** | No | Yes | Yes |
| **Compare two reports view** | Locked | Yes | Yes |
| **Pro Dossier (cumulative reference)** | First section preview + gradient | Two-section preview | Full |
| **Monthly drop (new lens chapter)** | Locked | Locked | **Yes — recurring artifact** |
| **Standing searches (renamed Watchlists)** | Locked | Save 1 | Unlimited + alerts |
| **Year-in-your-Record annual artifact** | Locked | Locked | **Yes** |
| **Share-card generator** | Locked (one auto-generated share-card on first match) | Yes (per match) | Yes (per match + Year-in artifact) |

**The flagship per tier:**
- **Free flagship:** the first Match Revelation moment. *The wow.* Free.
- **Basic flagship:** *"Unlock all your matches and start the conversation."* Concrete, visible, deserved.
- **Pro flagship:** *"A new lens on your record every month, plus your annual record artifact."* The 23andMe+ recurring-drop frame.

Lucia's call: this ladder converts at roughly 2-3× V4's because the Free tier *delivers a wow* and the Basic upgrade *unlocks something the user has already seen exists.* V4's free tier hands out paywalls before delivering a wow; this fixes that.

Editorial register stamp: ON-BRAND.

### 4.4 Sprint 1 elevation — the addition

V4 Sprint 1 was seven cuts. Our Sprint 1 keeps the cuts (they're correct) and adds **one addition: the v0 Match Revelation canvas.** Specifically:

- **All V4 §7 Sprint-1 kills land.** RadarSurface out, fake PDF out, MatchList collapsed, named-match-DM UI out, etc. (Endorse verbatim.)
- **PLUS:** Build `MatchRevelation.tsx` v0 — one foregrounded match + two secondary, signal-ribbon tiles, no Pattern Line diagram yet (deferred to Sprint 2). Wire to the existing `/api/constellation/match` payload — *the data is already there.* No new endpoint.
- **PLUS:** Add the "Your record · Account 1 of N · Last updated [date]" eyebrow to DossierHeader. ~30 lines of JSX.
- **PLUS:** Front-door catalogue size cue: "200,000 catalogued accounts" on the My Record empty state and on `/explore`'s header.

End-of-Sprint-1 state: **the page is shorter than V4's Sprint-1, AND the user has felt the wow.** That's the difference between a subtraction sprint and a world-class sprint. Mira / Sam from V4 will resist scope — Lucia's reply: *"The wow is the conversion lever. Cutting it for week-1 simplicity is the trap V4 fell into."* (Priya seconds.)

### 4.5 Pro flagship elevation — the recurring drop + the annual artifact

**The recurring monthly drop.** Frame the Pro Dossier as *"a new lens added to your record each month."* Month 1: Phenomenology Lineage (today's `phen_lineage` section, surfaced as a standalone chapter). Month 2: Geographic Neighbours. Month 3: Temporal Cluster. Month 4: Descriptor Rarity. Month 5: Closest 12. Month 6: Witness Adjacency. Etc. *Twelve lenses, one per month, indefinitely cycling.* Each drop fires a low-key in-app notification (no email by default; opt-in for email). The user feels the product *give them something* monthly — the 23andMe+ frame. (Priya, Lucia.)

The technical lift: small. The chapters already exist as sections in the current Pro Dossier; we re-frame the presentation. The Dossier surface gets a *"This month's lens"* hero at top + a *"Past chapters"* collapsible roll below.

**The annual artifact — Year in your Record.** Spotify Wrapped pattern, austere register. A vertical-scroll in-app interactive (8-12 cards), launched each anniversary of the user's first submission (not calendar year — *personal year*, the way Ancestry frames "your year of discoveries"). Each card is one fact + one corpus comparison + one quiet image. Closing card is the *share-card object*, parchment-toned 9:16, single sentence + handle + Paradocs mark. (Jonas leads.)

Sprint placement: monthly-drop frame ships in Sprint 2 (~3 days work, mostly re-presenting existing data). Annual artifact is Sprint 4 (post-MVP).

Editorial register stamp: ON-BRAND with Helena copy pass on the Wrapped vertical cards (mandatory — the Wrapped register tends toward effusive; ours must stay documentary).

---

## 5. Differentiation table

| Promise | Paradocs (post-elevation) | iNaturalist | r/UFOs | Letterboxd | Ancestry |
|---|---|---|---|---|---|
| Structured 200k+ corpus from many archives | ✓ | ✗ (own observations only) | ✗ (thread feed) | ~ (1M films, single source) | ✓ (4B records, many sources) |
| Personal record that grows over years | ✓ | ✓ | ✗ | ✓ (films logged) | ✓ |
| Match-revelation surface that *names the basis* | ✓ | ✗ | ✗ | ✗ | ✓ (DNA / Common Ancestor) |
| Corpus-grounded Hints with resolve action | ✓ | ~ (ID requests) | ✗ | ✗ | ✓ (the leaf) |
| Mutual revelation between two users via the data | ✓ | ✗ | ✗ | ✗ | ✓ |
| Documentary editorial register, not Reddit-rumour | ✓ | ~ (naturalist) | ✗ | ~ (cinephile) | ✓ |
| Recurring monthly artifact (drop) | ✓ (Pro) | ✗ | ✗ | ✗ | ~ (occasional) |
| Annual personal artifact (Wrapped pattern) | ✓ (Pro) | ✓ (year in review) | ✗ | ✓ | ✗ |
| Single share-card object that recruits | ✓ (Pattern Line) | ✗ | ✗ | ~ | ✗ |

**The Paradocs-only promise no one else can claim:** *"Your single account, set against a 200,000-record paranormal corpus, returns to you as a structured match revelation — and grows into a record you'll keep for life."* No other product in any adjacent category has all of: structured paranormal corpus + personal record + mutual-revelation match surface + documentary register. (Tobi: this is the founding line. It belongs on the front door.)

---

## 6. Dissents

**Dissent 1 — Lucia (Conversion).** *"I want the first comment a Free user reads on someone else's report to be free-to-reply, not paywalled. The Letterboxd-style 'read-but-don't-post' gate works when posting is the user's instinct; in our category, the user has to be *invited* to comment, and the paywall in that exact moment will feel like extortion. I would let Free post on the first matched-comment-thread they encounter, then paywall posting after that. Maya seconds; Helena concerned this could pollute thread quality early."*

**Dissent 2 — Maya (Mass-market).** *"I am not convinced Pattern Lines as a generated diagram clears the 'too much taxonomy' bar for my user. She doesn't read graphs. I want it tested as a *prose line* first ('Your report and this one share a thin path through the catalogue: triangle → no-shadow → vespers → eastern-NC, 1990s') before we commit to a node diagram. Jonas dissents on the dissent — says the diagram is the share-card. Compromise: ship both renderings, A/B."*

**Dissent 3 — Helena (Editorial).** *"The 23andMe+ recurring-drop frame ('a new lens each month') is sound mechanics, but the language must not drift to 'drop' or 'release' in user copy — those are subscription-product words. Editorial direction: 'This month, the archive looks at your record through [Phenomenology Lineage].' I will veto 'drop' anywhere in the UI."*

**Open question (Priya, founder taste).** Should the *first* Match Revelation moment fire *immediately after submission* (highest emotional charge, but the matching engine has ~30-60s latency) or on *first return visit* (proven Ancestry pattern: the leaf is there *when you come back*)? Priya leans return-visit for the retention loop; Lucia leans immediate for activation. Founder pick.

**Open question (Eitan).** Should *resolving* a Hint (Accept / Save / Not mine) be public to other contributors (Wikipedia-style transparency) or private (Ancestry-style)? Affects social proof and moderation surface. Founder pick.

**Open question (Tobi).** Is the "200,000 catalogued accounts" number the right front-door cue, or does *"twelve archives, indexed"* land harder? Tested copy needed.

---

## 7. Updated prioritized backlog

**MVP (Sprint 1-2, ~4 weeks):**
1. All V4 Sprint-1 kills (RadarSurface, fake PDF, MatchList-as-12, named-match DM UI, CrossExperience-as-separate, TemporalStrip placeholder).
2. **`MatchRevelation.tsx` v0** — one foregrounded match + two secondary, signal-ribbon tiles. *(World-class elevation.)*
3. "Your record · Account N of M" eyebrow on DossierHeader.
4. "200,000 catalogued accounts" cue on /lab empty state and /explore.
5. HintsRail promoted to slot 2, **with resolve action (Accept / Save / Not mine), not just dismiss**.
6. Per-report public comments (iNat model, V4 §4) — comment composer prompt corpus-grounded per §4.2.
7. `/lab/compare/[a]/[b]` two-column comparison view (V4 endorsed; we keep).
8. Pro Dossier inline preview on Free/Basic (V4 endorsed).
9. Share-card generator: single 9:16 parchment-toned image with one corpus-grounded line + handle watermark. *(Replaces PDF; world-class spec per §3 last paragraph.)*

**V2 (Sprint 3, weeks 5-6):**
10. Pattern Line miniature on Match Revelation (deferred from Sprint 1).
11. Monthly-drop framing on Pro Dossier ("This month's lens"). Re-presentation of existing data; small lift.
12. Standing-searches rename + public-toggle.
13. Sticky right-rail nav (V4 endorsed).
14. Notification surface for resolved-Hints + new-comments on user's reports.

**V3 (Sprint 4+, post-MVP):**
15. **Year-in-your-Record** annual artifact (Wrapped pattern, austere register).
16. iNat-style Projects (groups around phenomenon-place intersection) — V4 deferred; we second.
17. ThruLines-grade Pattern Line (multi-hop, generative).
18. Pro *recurring drop* email digest (opt-in).

**Cut for good (no resurrection):**
- 1:1 DMs.
- PDF exports.
- Auto-formed Casebook rooms (V3 panel concept).
- Sigils (V2 panel concept).
- RadarSurface.
- Any "score" or "percentile" rendered as a single number in user-facing UI.

---

**Word count:** ~4,980. Under cap. Every elevation cites a named Ancestry / 23andMe / Spotify / iNat feature and maps to a Paradocs concretization. Three dissents recorded. Three open founder calls. The Sprint-1 plan adds a world-class component, not just removes mid ones.
