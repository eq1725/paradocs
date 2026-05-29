# Badge / Rank System — Panel Memo

**Date:** May 29, 2026
**Panel:** Maya (Editorial), Jordan (Product/UX), Lena (Design), Sam (Data)
**Surface:** Profile page rank (today) → cross-surface standing system (proposed)
**Current implementation:** `src/pages/profile.tsx:167-171` (placeholder, four-line `if` chain)
**Deliverable:** Approve, push back, or hand to implementer

---

## 1. TL;DR

- Kill "Observer / Investigator / Senior Researcher / Field Agent." The names sound like a 1998 X-Files tie-in CD-ROM, the thresholds are accidental, and the last `if` wins regardless of merit.
- Replace with **two independent axes**, named in Paradocs voice: **Catalogue** (curation depth — saves, time in app, account age) and **Contribution** (reports submitted, comments accepted, journal entries shared). No combined "level." A user can be a careful reader without being a contributor; both are honorable.
- One axis, four steady states per axis. Names are nouns describing *what the person does*, not military ranks: **Reader / Regular / Keeper / Archivist** (Catalogue) and **Witness / Contributor / Correspondent / Steward** (Contribution).
- Visual: a single hairline-bordered text pill in Inter 10 caps, no icon, no fill, no color except a 1px purple left rule when the person is a Lab subscriber. Same restraint language as the cluster card.
- Lab subscription is a **separate mark**, not a tier — it reads as a tiny ◇ glyph in cream-tinted gray next to the name, not as the top rung of an achievement ladder.
- Surface the standing on the profile page in full; show only the highest non-default badge inline in comments; defer everything else (public profiles, leaderboards, unlock-gated content) to v2+.
- Call the system **"Standing."** Not Ranks, not Levels, not Achievements.

---

## 2. What the current placeholder gets wrong (panel consensus)

1. **The `if` chain overwrites.** A user with 100 saves and 10 reports ends up "Field Agent" because that line runs last. Order is accidental, not editorial. The system has no concept of "which axis matters more" because it has no concept of axes at all.
2. **One axis pretending to be progression.** Three of the four ranks are gated by `saved_count`; the fourth is gated by `report_count`. Saving and submitting are different jobs. Conflating them flattens both.
3. **Generic-thriller naming.** "Field Agent," "Senior Researcher" — these belong to a network procedural, not a documentary catalogue. Paradocs doesn't deputize anyone.
4. **No surfacing beyond the profile.** The rank exists in one component, invisible to the user when it would matter most (comments, public attribution, Lab tabs).
5. **No progression UI.** No "next rank at N saves." The user gets a noun with no ladder.
6. **No unlocks.** Rank is decorative. Sam: "If it does nothing, don't ship it. If it does something, define what."
7. **Paid tier ignored.** Lab subscribers are invisible in the rank lane. That's both a missed differentiator (Jordan) and a coherence problem (Lena: two different identity systems can't pretend the other doesn't exist).

---

## 3. Panel debate

### Maya (Editorial)

KEEP: the *idea* that a long-time careful reader looks different from a brand-new account. That's a real distinction worth marking.
DROP: every current name. "Observer" is the only one that survives Paradocs voice and even it's borderline — it sounds like a stance, not a person. "Investigator" / "Senior Researcher" / "Field Agent" are out: thriller cosplay.
CHANGE: the names should be **what the person does in the catalogue**, in plain English nouns. Reader. Keeper. Witness. Contributor. Archivist. Correspondent. These are roles a quiet documentary publication actually has.

> Pushback on Jordan: I hear "engagement loop" and I'm already nervous. The minute we name a tier "Senior Anything" we've imported a leaderboard culture that doesn't belong here. The badge has to be earnable but it cannot be *chased*. If the copy on `/profile/progress` reads "1,247 saves to Archivist," we've lost.

Recommendation: two axes, four nouns each, no superlatives ("Senior," "Master," "Elite," "Pro" — all banned). The top rung in each axis is a working role, not a trophy.

### Jordan (Product/UX)

KEEP: tiered progression. Users do want to know where they stand and what's next — the May 24 retention notes were clear on this. The question is whether the system motivates without manipulating.
DROP: the idea that one rank covers everyone. Sam's right that saves and reports are different jobs; product-wise, they're also different funnels. A user who saves 200 reports is a retention win; a user who submits 10 is a content-supply win. Don't reward them on the same ladder.
CHANGE: surface the progress, not just the state. The profile page should show the current standing **and** the next threshold in quiet copy — "Reader → Regular at 25 saves" — not as a progress bar with a percentage, which is the casino tell.

> Pushback on Maya: "cannot be chased" is editorially right but product-naive. People will chase whatever we name. The job isn't to prevent chasing, it's to make sure the thing being chased is something we're glad they did more of — read carefully, submit honestly, stay around. The names can be quiet; the thresholds still have to bite.

> Pushback on Lena: if the badge is invisible in comments I lose half the value. The whole point of cross-surface standing is that a careful reader's comment carries different weight than a one-day-old account's comment. We need *some* mark inline.

Recommendation: profile shows full standing + next threshold in prose; comments show a small text mark next to the username only when the user has reached the second tier or higher (default Reader/Witness gets nothing — no point marking the floor).

### Lena (Design)

KEEP: the cluster-card restraint vocabulary. Hairline rules, Inter 10 caps for eyebrow text, brand purple as a 1px accent rail and nothing more.
DROP: any concept of a rank "badge" as a graphical object. No shield, no laurel, no chevron, no progress ring, no colored pill, no icon — none of the visual language of a video-game achievement card. The cluster-card panel established this; the rank lane has to fall in line.
CHANGE: render standing as **text**, not iconography. A pill, yes, but it's a 1px-bordered text element in cream-tinted gray. The only color variation is when the user is a Lab subscriber, and even then it's a single 1px purple left rule on the pill — same accent-rail device as the cluster card. Same vocabulary, different surface.

> Pushback on Jordan: a mark in every comment row is a lot of pixels we'd be adding to a list view that we've been working to quiet down. I'll accept a mark for tier 2+ users, but it has to be **text only, gray-400, no border, no purple in the comment lane.** The pill treatment is for the profile page; in comments it's just "· Keeper" after the timestamp. Lena's rule: the comment row's loudest pixel is still the username, not the badge.

> Pushback on Sam: don't give me eight tiers across two axes. Four per axis is the ceiling. More than that and we're designing for a spreadsheet, not a page.

Recommendation: profile = bordered text pill (Inter 10 caps, gray-300 text, gray-700 border, optional 1px purple left rule for Lab); comments = inline "· {tier}" after timestamp, gray-400, only for tier 2+; nowhere else for v1.

### Sam (Data)

KEEP: the data we already have. `profiles.report_count`, `saved_reports`, `user_streaks`, `journal_entries`, `report_comments` (the v9_12 migration shipped this). All five are real, indexed, and cheap to read.
DROP: any threshold we can't defend at 100k users. "Senior Researcher at 100 saves" puts the top tier within reach of anyone who clicks save twice a week for a year — that's not senior, that's *consistent*. If we mean consistent, name it consistent.
CHANGE: tier thresholds have to come from the actual distribution, not from round numbers picked at a whiteboard. I want to set them so roughly **60% / 25% / 12% / 3%** of active users land in the four tiers respectively, recomputed quarterly. Round numbers in the UI ("25 saves," "100 saves") are fine as *displayed thresholds* but the underlying cutoffs should be calibrated to the real curve.

> Pushback on Maya: I love the noun-roles but "Steward" is doing a lot of work for the top contribution tier. We need to define what a Steward *is* — is it 50 reports, or 50 reports + 100 accepted comments + a year of account age? Multi-condition tops are defensible and harder to game; single-threshold tops are gameable in a weekend.

> Pushback on Jordan: don't gate features behind tiers in v1. The minute Reader can't comment but Regular can, we've built a paywall with a fake currency. Cosmetic differentiation only until we have a year of usage data; then we can talk about light affordances (e.g., Stewards can flag a comment for moderator review).

Recommendation: one new lightweight table `user_standing` (user_id PK, catalogue_tier smallint, contribution_tier smallint, computed_at timestamptz). Nightly job recomputes from existing tables. No new event streams, no new write paths. Thresholds live in a config constant, not in the DB, so we can retune without a migration.

---

## 4. Synthesised recommendation

### 4.1 Axes (two, independent)

| Axis | What it measures | Source tables |
|---|---|---|
| **Catalogue** | Curation depth and presence over time | `saved_reports`, `user_streaks.total_active_days`, `profiles.created_at` |
| **Contribution** | What the user has added to the catalogue | `profiles.report_count`, `report_comments` (accepted only), `journal_entries` (shared only) |

Two axes, each evaluated independently. A user has a Catalogue tier *and* a Contribution tier; neither overrides the other. Most users will sit higher on Catalogue than Contribution, which is honest — most readers are readers.

### 4.2 Tier names (four per axis, in Paradocs voice)

| Tier | Catalogue | Contribution |
|---|---|---|
| 1 (default) | **Reader** | **Witness** |
| 2 | **Regular** | **Contributor** |
| 3 | **Keeper** | **Correspondent** |
| 4 | **Archivist** | **Steward** |

All eight names are working nouns. None contain "Senior," "Master," "Elite," "Pro," "Lead," or "Chief." None reference field operations, intelligence work, or paramilitary structure. Witness is what the catalogue calls everyone with a first-hand account on file; using it as the default Contribution tier reinforces the editorial frame.

### 4.3 Thresholds (displayed; underlying cutoffs calibrate to distribution)

**Catalogue:**
- Reader: default
- Regular: 25 saves OR 30 active days
- Keeper: 100 saves AND 90 active days
- Archivist: 250 saves AND 180 active days AND account age ≥ 1 year

**Contribution:**
- Witness: default
- Contributor: 1 accepted report OR 5 accepted comments
- Correspondent: 5 reports OR 25 accepted comments OR 10 shared journal entries
- Steward: 25 reports AND ≥1 year of account age AND no moderation strikes in 180 days

Sam recomputes these against real distributions before launch; published numbers may shift ±20%. Multi-condition tops (AND clauses) are non-negotiable — single-threshold tops are gameable.

### 4.4 Visual treatment

**Profile page (full standing block).**
Two text pills, stacked or side-by-side depending on width. Inter 10 caps, letter-spaced. 1px gray-700 border, transparent fill, gray-300 text, 6px radius, generous padding. No icon. No color. Lab subscribers get a single 1px brand-purple left rule on each pill (same accent-rail device as the cluster card).

```
┌──────────────────┐  ┌────────────────────┐
│ CATALOGUE · KEEPER│  │ CONTRIBUTION · WITNESS│
└──────────────────┘  └────────────────────┘
```

Below the pills, in body copy (Changa 400, 14px, gray-400):
> Keeper since March. Next: Archivist at 250 saves and one year on Paradocs.

That's the entire progression UI. No bar, no percentage, no "75% to next."

**Comments (inline mark, tier 2+ only).**
After the timestamp, separated by a middle dot:
> `@username · 2h ago · Keeper`

Gray-400, no border, no color, no purple even for Lab subscribers (Lab gets its own mark, see 4.6). Tier 1 users (Reader / Witness) get nothing — marking the floor is noise.

If a user qualifies in both axes at tier 2+, show only the higher-prestige one, with Contribution winning ties (a Correspondent comment carries more editorial weight than a Keeper comment).

### 4.5 Unlocks

**v1 (cosmetic only, per Sam's pushback):**
- Tier 2+ gets the inline comment mark.
- Archivist and Steward get a single-line bio slot on the profile page ("Archivist since 2025.") that's auto-generated, not user-editable in v1.

**Deferred to v2+ (functional unlocks, needs a year of data first):**
- Steward can flag a comment for priority moderator review.
- Archivist can pin one saved-reports collection to their profile.
- Correspondent and above bypass the new-contributor comment rate limit.

Nothing in v1 is gated by tier. Nothing.

### 4.6 Lab subscription — separate lane

Lab is **not** a tier in either axis. It's a subscription state that reads as its own mark:

- On the profile pills: 1px purple left rule (described above).
- Inline next to the username everywhere (header, comments, /lab tabs): a single `◇` glyph in cream-tinted gray, no fill, no border, 10px. That's it.

The diamond reads as a small mark, not a badge. Lab subscribers who are also Archivists get *both* — the diamond and the tier mark — because they're two different facts about the person.

### 4.7 Surfacing locations

| Surface | Shows |
|---|---|
| Own profile page | Both pills + prose progression line + Lab diamond (if applicable) |
| Public profile (when built — defer to v2) | Both pills + Lab diamond |
| Comments / discussion | Username + Lab diamond + single inline tier mark (highest, tier 2+ only) |
| Discover feed cards | Nothing. The feed is editorial; user identity doesn't belong there. |
| Lab tabs | Lab diamond next to username in any user-attribution context |
| `/profile/progress` page | Defer to v2. The pills + prose line on the main profile cover the v1 need. |

### 4.8 What we call the system

**"Standing."** Not Ranks (military). Not Levels (game). Not Achievements (spam). Not Reputation (forum baggage). Not Badges (Scout).

Standing is a noun that means "where you stand" without claiming you've conquered anything. It fits the documentary voice. The page section header is "Standing"; the database table is `user_standing`; internal docs say "the standing system."

---

## 5. What we're NOT doing (and why)

- **A single combined "level."** Conflates two different jobs. The placeholder did this and it broke as soon as a user crossed both axes. Two axes, always.
- **A progress bar with a percentage.** That's the casino tell. Prose progression ("Next: Archivist at 250 saves and one year on Paradocs.") respects the user's intelligence and doesn't pulse at them.
- **Icons, shields, laurels, chevrons, color-coded pills.** Achievement-card visual language is everything Paradocs voice is not. Lena killed it for the cluster card; same rule here.
- **Gating features behind tiers in v1.** Sam's call. Without distribution data, any gate is a guess, and a wrong gate is a paywall in a fake currency. Revisit in 12 months.
- **A public leaderboard.** Off-brand. We're not running a competition.
- **Renaming Lab subscribers as a tier.** Lab is a transaction, not an achievement; treating it as the top rung would corrupt both systems. Separate lane, separate mark.
- **A dedicated `/profile/progress` page.** The main profile shows the standing and the next threshold in two pills and one sentence. A whole page for that is overbuilt. Revisit if v1 data shows users hunting for it.
- **Per-tier color theming.** Same reason we killed per-cluster-type color theming on the feed card: it's loud, it's a taste claim, and it imports game UX into a documentary product.
- **Real-time tier-change notifications.** "You're now a Keeper!" is the "Level Up!" we explicitly banned. Tier changes appear silently on next profile visit. If the user notices, the user notices.
- **Backfilling tier history.** We don't need to know that someone was a Regular last month. Current state only; no `standing_history` table.

---

## Recommended path

Ship v1: one new table (`user_standing`), one nightly job, two pills on the profile page, one inline mark in comments, one diamond glyph for Lab. ~1.5 days of implementer work, no new event streams. Sam calibrates thresholds against the live distribution the week before launch. The system stops lying about what users have done this week; it starts earning its place next quarter.
