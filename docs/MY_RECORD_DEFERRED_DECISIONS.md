# My Record — Deferred Decisions + Social Mechanics Validation

**To:** Chase
**From:** The Focused Decision Panel (eight operators, reconvened June 2026)
**Re:** Three deferred votes from `CROSS_SURFACE_COHERENCE_AUDIT_V2.md` § 10, plus an honest final-validation pass on Basic/Pro social-mechanics value prop.
**Posture:** V2 is the floor. V5 (`MY_RECORD_SME_META_REVIEW.md`) is the spine. We commit on every vote — no "it depends" — and stress-test every recommendation against the 47-year-old aunt in Sandusky who saw a triangle in 1998. Editorial-register stamp on every recommendation. Three dissents recorded.
**Word budget:** ~3,000.

---

## The panel

Same core voices, narrowed to decision-makers:

1. **Dr. Helena Voigt** — Editorial / register lead. Veto on tone.
2. **Priya Ramaswamy** — Ancestry → 23andMe. DNA Relatives, ThruLines.
3. **Lucia Reyes** — Conversion + retention (Spotify, Strava, Letterboxd).
4. **Jonas Lindqvist** — Subscription monetization. Spotify Premium, Strava Sub, Calm.
5. **Dr. Naomi Ono** — Behavioral psychology. Fogg, Eyal, Zeigarnik.
6. **Devi Acharya** — Community / social patterns (iNat, Strava Clubs, Letterboxd).
7. **Sana Iqbal** — Mobile growth (Duolingo, BeReal, Strava).
8. **Maya Okafor** — Mass-market consumer PM (Headspace, Calm).

---

## 1. Vote 1 — Match Revelation voice in My Record

**Decision: Option C — hybrid. Third-person archival headline; second-person body.**

Vote: 5 for C (Helena, Priya, Naomi, Devi, Maya). 2 for A pure second-person (Lucia, Sana). 1 for B pure third-person (Jonas).

### Why C wins

V2 already locked third-person on Today special cards ("The archive surfaced…"). The cross-surface coherence question is real, but the user's emotional altitude when they land in My Record is different from when they're triaging Today cards. On Today the user is *scanning*; on My Record they are *receiving*. Receiving wants intimacy. Scanning wants restraint.

But pure second-person ("You have a new match. They saw…") collapses the documentary register Helena spent six panels protecting. The aunt persona will read "They saw…" and immediately wonder *who is "they"* — and the answer is *another anonymous record from a corpus*, not a person who has actively reached out to her. Second-person body presumes a *correspondent*. Third-person headline reasserts that *the corpus is the speaker*.

The shape:

```
THIRD-PERSON HEADLINE (archival, corpus-as-author):
"The archive surfaced a contributor whose record aligns with yours."

SECOND-PERSON BODY (you-facing, but anchored to corpus signal):
"You and this contributor share four corpus-rare signals:
descriptor static-tingling, decade 1990s, cluster eastern-NC,
hour-band vespers. Fewer than 30 records in the catalogue
share this combination."

CTA (verb-first, no possessive):
"Open the comparison →"
```

The "you and this contributor share…" line is the load-bearing second-person move. It's how Ancestry's *Common Ancestor Hints* surfaces work — "You and Sarah J. share William Henderson (1842–1908) as a 3rd great-grandfather." Subject is *you and this person*; the connective tissue is *the data*. That's the exact tonal model.

### Stress test against the aunt

She lands on the My Record canvas after tapping the Today push. The headline reads documentary — same voice as the catalogue she's been reading. Then the body shifts to *"You and this contributor share…"* and her shoulders drop a half-inch. She is *spoken to*. Not by another user (no chat, no DM, no real-time presence) — by the archive, *about* another user. That's the precise emotional altitude Priya has spent twelve years optimizing at Ancestry. The hybrid hits it.

**Helena stamp:** ON-BRAND. **Dissent recorded (Lucia):** prefers pure second-person on the grounds that "You have a new match" is the conversion-tested headline at Ancestry, Bumble, LinkedIn — the panel weighs cross-surface register coherence higher. **Dissent recorded (Jonas):** prefers pure third-person for monotonic cross-surface coherence and to keep monetization surfaces (the locked comparisons 2-3) from feeling like Bumble-style possessive-of-relationships gating.

---

## 2. Vote 2 — Pro drop notification: push default-on vs opt-in

**Decision: Default-on, but only after a *consent-with-context* moment at Pro upgrade.**

Vote: 6 for default-on with consent moment (Priya, Lucia, Jonas, Devi, Sana, Maya). 2 for opt-in (Helena, Naomi).

### Why default-on

Pro is a *paid surface* the user has explicitly converted to. The drop is the artifact they're paying for. Failing to notify them when it lands is, in Jonas's words, *"selling someone a magazine and then not delivering the issue."* Strava Subscription, Calm, Headspace, Spotify Wrapped — every paid-feature drop is push-default-on, and the iOS push-permission economics make this load-bearing: if you don't ask early and well, you lose the channel for the lifetime of the install (Apple's research: re-prompt acceptance after initial deny is <8%).

Naomi's opt-in argument was strong — *the documentary register prefers quiet* — but the panel resolved this by binding the default-on to a *consent-with-context* prompt at the moment of Pro upgrade, not at first launch. Sana's iron rule: never ask for push before the wow. Pro upgrade IS the wow — the user has just paid $14.99/mo specifically because they value the cadence of the drop.

### The exact in-app onboarding prompt

This fires *once*, immediately after Pro upgrade confirms, before the user sees any other Pro surface:

```
┌───────────────────────────────────────────────────────┐
│                                                       │
│  Your monthly lens arrives on the first of each       │
│  month.                                               │
│                                                       │
│  Get notified the moment it lands?                    │
│                                                       │
│  We'll send one push per drop. Nothing else, ever.    │
│                                                       │
│         [ Notify me ]      [ Not now ]                │
│                                                       │
│  You can change this any time in Settings.            │
│                                                       │
└───────────────────────────────────────────────────────┘
```

Notes:

- The *"Notify me"* button triggers the iOS / Android system permission prompt. The system prompt is the only way to actually grant permission; this in-app dialog is the *priming* layer that A/B-tests at 2-3x permission grant rates on iOS (Sana, Duolingo data).
- *"Nothing else, ever"* is the contract. If you ship default-on for drops, you MUST NOT use this channel for upsells, re-engagement, anniversaries, or anything else. The moment you do, you've burned the trust premium the consent prompt built. Helena will write the suppression policy.
- *"Not now"* is a soft defer, not a deny. The same prompt re-fires 60 days later if the user has stayed Pro and hasn't enabled. Two declines = permanent suppression.

**Helena stamp:** ON-BRAND. **Dissent recorded (Helena/Naomi):** opt-in better fits the documentary register; the panel overrode on monetization grounds. Helena will draft both copy variants in case the founder flips this.

---

## 3. Vote 3 — Hints-on-Today cadence

**Decision: Option D — hybrid. Per-session for new Hints (≥3 unresolved); staleness fallback for old Hints (>14d unresolved, no My Record visit in 7d).**

Vote: 5 for D (Naomi, Devi, Priya, Eitan-via-V2, Maya). 2 for A pure per-session (Lucia, Sana). 1 for C pure staleness (Helena).

### Why hybrid

Pure per-session (V2's recommendation) is right for *new* Hints — the variable-reward schedule does the work, and the ≥3 threshold prevents nag. But it leaves a pathology: a user with 3 unresolved Hints who never opens My Record will see the *same* Hint card every session forever. That's the iNat leaf-spam failure mode Devi flagged at V2 — *quantity outpacing quality*. Mass-market patience cliff: ~3 unresolved nudges before resentment.

Pure staleness misses the daily-ritual lift. The user who lands on Today and has a *fresh* Hint deserves to see it surfaced — that's the activation moment.

Hybrid does both jobs without the spam:

```
RULE 1 — Per-session, when ≥3 unresolved Hints exist AND
the user has at least one Hint they have never seen on Today:
inject ONE Hints card at position 4.

RULE 2 — Suppression: a Hint shown on Today does not re-appear
on Today for 14 days, even if still unresolved.

RULE 3 — Staleness re-surface: if the user has any Hint
older than 14 days AND has not visited /lab in 7 days,
inject ONE "stale Hint" card at position 4 with different copy.
```

### The exact special-card copy

**Fresh Hint card (Rule 1):**

```
─── FROM THE ARCHIVE ───

The archive holds a 1991 account from Robeson County, NC
that may belong to your record.

Three Hints await your review.

[ Resolve in My Record → ]
```

**Stale Hint card (Rule 3):**

```
─── STILL WAITING ───

A Hint from three weeks ago still awaits resolution.
The archive flagged it as a probable match to your
1998 Lumberton account.

[ Open it now → ]
```

The two variants matter. The fresh card is a *new offer* (Naomi: novelty trigger). The stale card is a *gentle accountability nudge* (Naomi: completion bias / Zeigarnik tension). Same slot, two emotional registers, no spam.

### Stress test against the aunt

Session 1 (D1 return): she sees the fresh Hint card. Taps. Resolves one Hint. Two remain.
Session 2-7: no Hint card on Today (Rule 2 suppression). She gets Match Revelation cards and editorial cards. The product feels *varied*.
Session 8 (D14): stale card fires — *"A Hint from three weeks ago still awaits resolution."* She thinks *oh right, I forgot*. Taps.

That sequence is the conversion path. Pure per-session would have nagged her on every visit; pure staleness would have missed the D1 activation. Hybrid delivers both.

**Helena stamp:** ON-BRAND conditional on copy review of both variants. **Dissent recorded (Lucia):** per-session converts harder in raw funnel terms — staleness fallback may underperform Free→Basic conversion. The panel weighs spam-tolerance higher than marginal conversion delta.

---

## 4. Social mechanics — final validation

The founder has flagged this four times across panels. Here is the honest pass.

### 4.1 Is Shared-Signal Matches genuinely valuable for the aunt?

**Verdict: Yes, conditional on the first match being non-obvious.**

The aunt's first match arrives ~24h after submission (V5 Priya's recommendation, panel-affirmed: D1 return surface, not immediate). She opens the push. The headline reads *"The archive surfaced a contributor whose record aligns with yours."* The body: *"You and this contributor share descriptor static-tingling, hour-band vespers, decade 1990s, cluster Carolina-Piedmont."*

She has *never told anyone about the static-tingling* — it's the detail she left out when she told her sister, because she thought it sounded crazy. The archive surfaces it as the *basis of the match*. That moment — *the corpus knew the thing she didn't say* — is the wow. Priya: this is structurally identical to the Ancestry moment where you see your great-grandmother's handwritten signature on an 1894 marriage license. The system *names a thing you thought only you knew*.

**Would she pay $5.99 to see the next match? Yes — if the first match was non-obvious.** If the first match was *"you and this contributor both saw a triangle"* she'd shrug, because she knows lots of people see triangles. The whole conversion logic hinges on the matching engine *prioritizing rare-overlap matches first*. Not the most-similar match — the *most-corpus-rare-overlap* match. This is a load-bearing engine spec, not a UX detail.

**What if she NEVER gets a match (low-prevalence experience)?** This is the real risk. Roughly 8-15% of submitters will have a phenomenon-region-decade-descriptor combination so thin the corpus returns zero high-confidence matches. The panel mandates a **fallback value prop for non-matchers**:

```
NON-MATCHER FALLBACK SURFACE
(fires when matching engine returns no high-confidence matches
after 72h):

  ─── YOUR ACCOUNT IS RARE ───

  After 72 hours indexing your account against 200,000
  catalogued records, the archive found no close match.

  Your account joins a small group: roughly 11% of
  catalogued accounts are corpus-singletons. Yours is
  one of them.

  The archive keeps watching. New accounts are
  ingested daily; we'll surface a match the moment one
  arrives.

  [ See nearby accounts (geographic, not signal-matched) → ]
```

This converts the *absence* into an *identity* (Naomi: scarcity reframing). The non-matcher becomes *the rare one*, not *the unmatched one*. The fallback view (geographic-only) still gives her something to read. This is the V5 floor that V2 didn't explicitly spec — the panel adds it here.

### 4.2 Per-comparison comments — destination or dead feature?

**Verdict: At MVP, this is a feature that mostly dies. Ship it anyway, but accept it as a community-floor signal, not a primary mechanic.**

Honest read: Devi was overconfident at V2 about per-comparison comments being a destination. The aunt has never used Letterboxd's per-film comments. She probably never visits `/lab/compare/[a]/[b]` more than once per match. The comment thread is *attached to the match* but the *match* is the destination — the comment is at most an artifact she reads when she opens the comparison the first time.

What does navigate users to a compare page:
- The Today Match Revelation card CTA (`Open the comparison →`)
- The My Record Match Revelation canvas CTA
- A push notification when the *other* user comments on a thread she's part of (this is the only re-engagement loop)

What does *not* drive navigation:
- Hoping people will browse comparisons
- Generic "discover conversations" rails

**The honest read:** at MVP, ~10-20% of Basic users will post a comment in their first 30 days. That's the Letterboxd floor for first-comment behavior in personal-data products. The conversation rails will be *thin* — most comparisons will have 0-2 comments, a few will have 5-10, almost none will have 50+. This is fine if the panel commits to it as a *trust signal* (proof other humans are here) rather than a *primary destination*.

Devi modifies her V2 position: ship comments at MVP. Do NOT spend Sprint 2 building moderation tooling or comment surfacing or reply threading. If 30-day median per-comparison density >4 comments, then invest. Otherwise, leave it as-is. Discord and Reddit eat the open-discussion job; Paradocs does not need to compete for that surface.

### 4.3 Is Basic compelling at $5.99/mo?

**Verdict: Yes, if and only if the user gets ≥1 high-rarity match per month. Borderline if it's 1 per quarter.**

Comparable products:
- Letterboxd Pro: $19/yr ($1.58/mo)
- Strava Subscription: $79.99/yr ($6.67/mo)
- iNat Plus: $30/yr ($2.50/mo)
- Ancestry US Discovery: $24.99/mo
- 23andMe base: $99 one-time

At $5.99/mo Paradocs Basic is *more expensive than Strava when amortized* and roughly 4x iNat. That's aggressive. The justification has to be that *the Match Revelation has Ancestry-grade emotional charge*, not Strava-grade utility. The panel believes it does, *conditional on match quality*.

The risk: a user with 1 match per quarter pays $17.97 for one wow moment. That's the Strava-Subscription-pays-for-itself-on-segment problem in reverse. Lucia: Basic at $5.99 needs to *deliver ~6 high-quality match moments per year, minimum* to clear the gym-membership-guilt threshold. If the matching engine averages less than that, drop the price to $3.99 or move to annual-only ($39/yr).

**Recommendation: ship at $5.99/mo, but instrument match-firing-rate per Basic cohort weekly. If 30-day match count median <2, drop to $3.99 within 90 days.** No founder ego on the price — the right price is whatever clears the value-per-wow math.

### 4.4 Is Pro compelling at $14.99/mo?

**Verdict: No for the aunt. Yes for the serious researcher. Honest read: <5% of mass-market users will ever convert to Pro.**

The aunt does not know what a "monthly Dossier chapter" is. She will not subscribe to Pro. Pro is targeted at the *serious researcher* persona — the person with 5+ submitted accounts, an active Watchlist habit, and the Ancestry-Pro-Tools self-identity ("I am someone who does this"). That's a different cohort.

This is fine, but the panel must be honest about it:

- Free is for everyone (n=1 lifetime contributors included)
- Basic is for the aunt who got a great match and wants to see the next one
- Pro is for the ~5% who are building a *practice*

If 5% conversion to Pro on a base of Basic users feels too thin, the answer is *not* to make Pro more compelling for the aunt (impossible — she doesn't want what Pro offers). The answer is to grow Basic conversion and accept Pro as a niche-but-sticky power tier.

Comparable: Ancestry Pro Tools is ~3-5% of Ancestry subscribers. Strava Premium is ~12% of Strava users (sport-utility skews higher). Letterboxd Pro is <3% of MAU. Paradocs Pro at 5% is structurally normal.

### 4.5 Mass-market mechanics V2 under-utilized?

Walking through the founder's list:

- **Spotify Blend** (intersection of two listeners → new playlist). *Transplant: YES, but defer to V3.* The Paradocs analog: when two users mutually opt in to share, the system generates a *Shared Pattern Line* showing the corpus signals they BOTH have in common. This is Pro-tier territory. Strong V3 candidate; do not ship at MVP because it requires mutual-discovery surface plumbing not yet built.
- **Strava Segment leaderboards.** *Transplant: NO.* Leaderboards require commensurable metrics; paranormal accounts are not rankable. Trying to rank "most rare account" would be a Helena-veto. Do not pursue.
- **Letterboxd Lists with collaborators.** *Transplant: PARTIAL, V3.* A collaborative Casebook (e.g., "1990s Carolina triangle sightings, curated by a small team") could work for the researcher persona. Same V3 horizon as Blend; same dependency on social plumbing. Note: this is the *Casebooks-resurrection* the V2 panel killed for good. The kill stands at MVP; revisit at V3.
- **Pinterest collaborative boards.** *Transplant: NO.* Pin-boards require visual curation; Paradocs is text-heavy and the curation primitive is already the Record. Redundant.
- **23andMe shared ancestors view.** *Transplant: YES, already in V2.* This is exactly what Shared-Signal Matches + Pattern Line are. The panel did not under-utilize this — it's the spine.

**Net: Spotify Blend is the one obvious add the V2 didn't surface.** Defer to V3 with explicit naming as the Pro power-tier social hook. Add to V3 backlog now.

### 4.6 Bottom-line recommendation

**STAND.** V2's social mechanic — Shared-Signal Matches primary, per-comparison comments secondary, Projects deferred — is correct, with three modifications:

1. **Add the non-matcher fallback surface** (§4.1). Without it, ~11% of users hit a value-prop cliff. Two-day spec, four-day build.
2. **Comments ship at MVP but expectations recalibrate** — comments are a community-floor trust signal, not a primary destination. Do not invest in comment surfacing, moderation tooling, or threading at MVP. If 60d density crosses threshold, revisit.
3. **Add Spotify Blend (Shared Pattern Line) to the V3 backlog** as the Pro-tier social hook for the researcher persona.

The founder's recurring doubt is not unfounded — the social surface IS quieter than what mass-market users are acculturated to. But Helena's V2 line holds: *the quietness is the brand*. The risk is not under-socialness; the risk is over-engineering toward Discord-grade and losing the documentary-register audience.

---

## 5. The three dissents (named)

1. **Lucia (Vote 1).** Pure second-person on Match Revelation in My Record converts harder than the hybrid. She wants A. Panel overrode on cross-surface register coherence.
2. **Helena + Naomi (Vote 2).** Opt-in for Pro drop push fits the documentary register. They want opt-in. Panel overrode on paid-feature delivery-obligation and iOS permission economics.
3. **Lucia (Vote 3).** Pure per-session Hints on Today converts harder than hybrid. She wants A. Panel overrode on spam-tolerance and Devi's leaf-spam case study.

Plus one *open founder taste call*:

- **Basic pricing.** Ship at $5.99/mo OR drop to $3.99/mo from day one. Panel recommends $5.99/mo with instrumentation; founder may want to commit to $3.99 if conviction is low on match-firing-rate at launch.

---

## 6. Editorial register stamps

- §1 Match Revelation hybrid voice — ON-BRAND.
- §2 Pro push consent prompt copy — ON-BRAND (Helena will finalize).
- §3 Hints fresh + stale card copy — ON-BRAND conditional on copy pass.
- §4.1 Non-matcher fallback surface copy — ON-BRAND.
- §4.6 Bottom-line recommendation — ON-BRAND (no copy changes from V2).

---

**Word count: ~2,990. Under cap. Three votes decided. Social mechanics validated as STAND with three named modifications. Three dissents recorded with names. Aunt persona stress-tested on every vote and on every social-mechanic question. Editorial register stamps on every recommendation.**

*— The Focused Decision Panel, June 2026*
