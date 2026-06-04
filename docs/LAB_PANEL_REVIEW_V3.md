# Lab Panel Review V3 — Founder Decisions Locked, MVP Finalized

**To:** Chase
**From:** The Lab Panel (same seven voices, reconvened June 2026)
**Re:** v2 open questions resolved by founder; the gating matrix; the one-experience UX; the cadence design; sentiment-analysis verdict; the consolidated execution plan
**Length:** ~2,650 words
**Predecessors:** `/Users/chase/paradocs/docs/LAB_PANEL_REVIEW.md` (v1), `/Users/chase/paradocs/docs/LAB_PANEL_REVIEW_V2.md` (v2)

---

## 1. TL;DR

- **Naming is locked: "Record."** The v2 panel split was a clear majority for "My Record" — five voices to two (Documentary Editorial, Consumer Product Strategist, Ancestry UX Expert, AI Product Designer, Behavioral Designer in favor; Subscription Strategist and Onboarding Expert preferred "My Archive" as the nav noun). We are calling it. *The user builds **My Record**; the corpus they're set against is **The Archive**; case files remain **Collections**.* Every code reference, copy line, and email template uses this trio going forward.
- **Gating model inverted from v2.** Pattern surfaces (temporal / geographic / sentiment) are *not* gated by experience count. A user with **one** submitted experience sees every comparative surface immediately — drawn from comparing that single point to the 200k+ Archive. *Subscription tier governs **depth**, never **access**.* Section 2 is the matrix.
- **Submissions are free, unlimited, forever.** No CC wall, no count cap. The moat is the depth of insight surfaced *back* to the user, not friction on contribution. Every v1/v2 line about a "free-tier cap of 1 or 3" is voided.
- **Named-match introductions move behind the Basic ($5.99) tier**, with mutual opt-in always required. Anonymous-aggregate matches ("8 nearby reports") stay free for everyone.
- **Sentiment analysis: ship in MVP as a corpus-level comparative surface**, narrowly scoped, behind a feature flag, with editorial review of every copy template. The panel was split (4-3) but lands on ship — the population-baseline framing the founder proposed *defuses* the diagnostic risk that worried the v2 panel about personal sentiment arcs. Detail in Section 5.

---

## 2. The new gating matrix

This is the central deliverable of v3. The principle, stated plainly: **access is universal at one experience; depth scales with subscription.** A free user with one submitted report sees every surface; a Basic user sees more dimensions, deeper history, and the named-match layer; a Pro user sees the full instrumented archive and export tools.

| Feature | Free | Basic ($5.99/mo) | Pro (higher tier) |
|---|---|---|---|
| **Submitting experiences** | Unlimited, no cap | Unlimited | Unlimited |
| **Viewing My Record (dossier)** | Full — every submitted experience renders as a full-bleed dossier | Full + cross-experience header at 2+, filter/lens bar at 15+ | Full + advanced lenses (export-ready view, custom date/region scoping) |
| **AI synthesized paragraph** | One paragraph per experience, regenerated when the corpus shifts meaningfully (≤ once per 30 days) | Same, plus a *body-of-work* paragraph for multi-experience users, refreshed weekly | Refreshed nightly; on-demand "regenerate now" available |
| **Temporal analysis** | Yes — 24h clock + decade band, your point(s) layered against archive distribution for matching phenomenon | Adds time-of-week, lunar-phase, and seasonal overlays; adds "decades shift" historical view | Adds custom date-range filters; raw underlying histograms downloadable |
| **Geographic analysis** | Yes — map tile centered on your location, 50-mile default radius, 3 data lines beneath (count, closest, corridor if real) | Configurable radius (10 / 50 / 200 / 500 mi); adjacent-state view; "corridor explorer" with hover | County-level density data; multi-experience comparative geography; KML export |
| **Sentiment analysis (corpus-comparative)** | Yes — one-line population baseline ("Reports of this phenomenon-type skew anxious-to-resolved in 38% of accounts; your account language reads closer to anxious") | Multi-dimensional breakdown (fear / wonder / dissociation / resolution), comparison to sub-pattern not just parent | Trajectory analysis on multi-experience users; ability to view archive-wide sentiment shifts by decade |
| **Aggregate-pattern matches** ("8 people in your county logged triangle sightings") | Yes, always-on, no consent gate | Same + adjacent counties + nearby phenomenon families | Same + the underlying matched reports listed and citable |
| **Named-match offers** (a specific other user is offered as a possible peer) | **No** — Free users see only anonymous aggregates | Yes — mutual opt-in required on both sides before any identifying detail surfaces | Yes — plus "show me my top 5 potential matches" on-demand surface |
| **Mutual DM / private channel after match** | **No** | Yes — one private channel per matched pair, both must have opted in | Yes — plus the ability to share Record snapshots inside the channel |
| **Hints queue** ("This 1997 Robeson County report sounds similar — is it related?") | Yes — one Hint per visit, soft-cap of 12 lifetime confirmations; never empty (see Section 4 fallback logic) | Unlimited Hints, refreshed daily, with "show me 5 more like this" on-demand | Same + Hints can be saved into Collections directly |
| **Downloadable export** of Record (PDF + JSON) | **No** | PDF export of Record (formatted for archival print) | Same + raw JSON, full match list, all attached citations |
| **Phenomenon-page claims** | Read-only — see related phenomena | Claim phenomena into Record (the "this is part of my story" pin) | Same + edit/annotate the phenomenon entry on your own Record view |
| **Re-analysis frequency** (when corpus grows) | Monthly recompute against newly ingested reports | Weekly recompute; push/email digest of new matches | Daily recompute; real-time digest on demand |
| **Year-in-Review / annual digest** | Teaser (3 cards) | Full | Full + multi-year retrospective |
| **Shareable private Record link** | No | Yes — view-only link, expirable | Yes + permissions per section |

**Operating principle for the PM:** if a feature appears in any column, the *interaction model* is identical across columns — only the **depth, refresh rate, or volume** changes. A Free user looking at the temporal strip sees the same shape on the same page in the same position as a Pro user; the Pro version just has more dials and finer-grained underlying data. This is critical for honest funnel: the user should see the surface they're being asked to pay to deepen, not encounter a locked door.

---

## 3. "One experience is world-class" — concrete UX

The founder's most important framing: most users will share exactly one experience. The product must feel rich for that user, not for a hypothetical collector. v2 designed three thresholds (1, 2-4, 5+, 15+); v3 collapses the design effort onto the **n=1 case** as the gold standard and treats multi-experience as additive enrichment.

### First-session walkthrough — n=1 user, free tier

1. **Submission completes.** Inline confirmation appears. The user is not redirected; the page they're already on (the submission flow's final step) transforms in place into their first My Record dossier. No "you've unlocked the Lab" framing — the Record simply *is* now.
2. **Hero dossier renders.** Full-bleed card containing the submitted experience: date, location, phenomenon family auto-tagged by Haiku at submit time, the user's written account preserved verbatim. This is the load-bearing object. Above it: a one-sentence **synthesis paragraph** generated by Haiku within ~3 seconds of submit: *"Your 1998 Lumberton triangle is one of 23 triangle sightings in central North Carolina between 1990 and 2000. The closest in time and place was July 14, 1998, eleven miles east."* Two sentences. Documentary voice. No exclamation marks, no "wow."
3. **Below the dossier, the comparative strip renders** — three surfaces stacked, each with its own one-line summary:
   - **Temporal strip.** A 24-hour dial with the user's experience plotted as a single dot, layered against a faint background histogram of the Archive's distribution for the same phenomenon-family. Copy beneath: *"Your account occurred at 02:47 AM — like 64% of UFO-shape reports in the Archive, this falls in the 12 AM–4 AM cluster the catalogue refers to as the liminal hours."* The number under the dot is the user's own time; the histogram is the corpus. A decade band beneath shows the user's 1998 dot against the same-phenomenon historical density.
   - **Geographic panel.** A small map tile centered on Lumberton with a 50-mile ring. Three data lines: *"Within 50 miles of your account: 14 related reports."* / *"The closest in time and place: July 14, 1998, eleven miles east."* / *"Reports cluster on a roughly NW-SE corridor along US-74."* The corridor line is suppressed if the algorithm doesn't find a real corridor — never forced.
   - **Sentiment baseline.** A single line, no chart: *"Among UFO-shape reports, account language tends toward initial-fear-to-later-resolution in 38% of cases. Your account language reads closer to sustained unease."* The framing puts the **corpus first**, the user second — diagnostic risk dissolved. (See Section 5 for why this framing matters.)
4. **The first Hint appears.** A single card with confirm/dismiss: *"This 1997 account from Robeson County describes a similar triangle. Would you like to add it to your Record?"* One decision, no choice paralysis.
5. **The aggregate-matches strip.** *"8 other people in central North Carolina have logged triangle sightings. 3 of them in the late 1990s."* Anonymous, no names. A "what is this?" affordance. Free for everyone.
6. **The named-match teaser** (the Basic paywall surface, surfaced honestly): *"3 of these accounts came from users who have opted in to be discovered. Subscribe to Basic to see if any of them want to compare notes."* Inline, not a popup. Optional dismiss. The user sees what they would get without being trapped.
7. **The "Add another to your record" pill** sits below the dossier, never above it. Permanent. Soft.

### What the Haiku call produces for an n=1 user

A single prompt at submit, ~2-3 seconds, costs $0.001 or so. The prompt receives: the user's experience text, its tagged phenomenon family, its geocoded location, and the top 20 matched reports from the existing match RPC. The output is exactly two sentences in the documentary register, plus a 1-sentence sentiment baseline, plus 1 short Hint candidate. We do not generate "what makes you unusual" or "your fingerprint" copy at this volume — those surfaces become legible at 2+ experiences and are the *body-of-work* paragraph regenerated weekly for Basic users.

### Why this feels rich at n=1

The richness is not in the user's depth of contribution; it is in the **Archive's depth as context**. The 200k reports do the heavy lifting. One submitted dot rendered against a 200k cloud is more emotionally resonant than ten dots rendered alone. The Record's value is its position in the wider record, not its volume.

---

## 4. Aggressive-but-safe match cadence design

Founder direction: aggressive engagement loop, no retention risk. The panel proposes a layered cadence with explicit fallback floors so the surface is never empty and never spammy.

### The cadence rules

**Rule 1 — Confidence threshold for named matches.** A named-match offer fires only when the multi-signal fingerprint score crosses a **high-confidence threshold** (we suggest starting at signals reaching ≥3 of the v2 ranked criteria, with phenomenon-sub-type + geographic proximity as mandatory two of the three). Below the threshold, no named offer; only aggregates.

**Rule 2 — Pacing.** At most **one strong named-match prompt per visit**, even when multiple qualifying matches exist. A Basic user who has 4 strong matches sees one at a time, surfaced in confidence-rank order. The "show me my top 5" on-demand affordance is the escape valve for users who want more — but the default surface is one.

**Rule 3 — Time-decay.** Newer matches surface first; older matches that were dismissed once are de-prioritized for 60 days and re-surface only if the corpus grows materially or the user re-engages with that phenomenon family. Dismissed twice = retired permanently.

**Rule 4 — Never-empty floor.** This is the load-bearing rule. When no named match meets threshold, the surface falls back through this priority list, in order:
   1. A **fresh aggregate insight** computed on this visit ("Two new triangle sightings were logged within 100 miles of your account this week").
   2. An **adjacent-phenomenon Hint** ("Three accounts in your county describe missing-time — a pattern adjacent to triangle sightings in the catalogue").
   3. An **editorial pick** — a hand-curated, never-stale phenomenon page or report selected by the operator and rotated weekly.
   4. A **temporal nudge** ("The Archive grew by 3,400 reports this month. None matched your fingerprint yet — we'll keep watching").
   
The surface **is never blank.** The user always sees a sentence with substance. This is non-negotiable.

**Rule 5 — Streak-aware suppression.** The same Hint, aggregate, or near-match never appears in two consecutive sessions. The user must perceive *forward motion*.

**Rule 6 — Subscription-aware volume.** Free users see one Hint per visit + the aggregate strip; Basic users see one Hint + one named-match offer (if available) + the aggregate strip; Pro users get the same + an on-demand "top 5" view they can request.

**Rule 7 — Notification cadence (push / email).** Independent of the in-app surface: a Basic user gets *at most one push* and *at most one email digest per week*, batched. Even if five strong matches surface during the week, the user gets one consolidated notification. This is the retention-protection floor; the panel is unanimous that more frequent push notifications on emotional content will produce churn faster than they produce engagement.

### The retention-vs-aggression trade-off, explicit

Aggressive: one Hint per visit, one named match per visit (Basic+), one notification per week, regenerated paragraph cadence aligned with corpus updates. *That is aggressive by paranormal-vertical standards* — most adjacent products in the genre re-engage monthly or never.

Protective: never-empty floor (so the user never feels the loop is broken); confidence threshold (so named-matches feel earned, not random); streak-aware suppression (so the user never sees the same thing twice); per-visit pacing cap of one named-match (so the surface never feels like a recommendation feed). These four protections are what let the cadence run hot without producing retention damage.

The single biggest risk in this design: a user who logs an emotional experience receives a named-match offer that they're not ready for. The mitigation is **mutual opt-in on both ends** — the user being suggested as a match has explicitly opted in to be discovered (Basic+ feature, off by default in the toggle), and the user receiving the offer can dismiss without consequence. The introduction is a soft handshake, never a forced reveal.

---

## 5. Sentiment analysis — the panel's substantive feedback

Founder asked for reaction, not a must-have. The panel split 4-3 in deliberation and lands on **ship in MVP, narrowly scoped, behind a feature flag, with editorial review on every copy template.** Here is the case.

### Is comparison-to-corpus a good idea?

**Yes — and it's a better idea than the personal sentiment arc the v2 panel was nervous about.** v2 worried about "your earlier accounts describe fear; your later accounts describe acceptance" — diagnostic, intrusive, presumes a narrative the user may not have. The founder's reframe (compute sentiment on the 200k Archive, compare user against the corpus baseline) inverts the gaze. The user is no longer being analyzed; the **corpus** is being analyzed, and the user is being told *where they sit relative to other people's accounts of the same phenomenon-type*. That's a documentary stance. It's the same move the temporal and geographic surfaces make — your dot against the cloud.

### Brand-voice risk

Real, manageable. The line *"Your account expresses dissociation more strongly than 68% of comparable accounts"* is wrong — diagnostic, clinical, presumes the user wants to be located on a fear/wonder spectrum. The line *"Reports of triangle sightings cluster in two distinct language patterns: 56% describe wonder-and-curiosity, 38% describe initial-unease-resolving-to-calm, 6% sustained alarm. Your account language reads closest to the second cluster"* is right — corpus-first, neutral language, no pathology vocabulary.

The hard editorial rule: **never use diagnostic words** (anxiety, depression, dissociation, trauma, PTSD). Use **language-pattern descriptors** (unease, wonder, calm, alarm, curiosity, resolution). The corpus is described in terms of its language, not its psychology. The user is placed within that language-space, never diagnosed.

### Technical practicality

Roughly: Haiku scores all 200k Archive reports on 4 dimensions (initial-unease, wonder-curiosity, sustained-alarm, resolution-calm) — each a 0-1 score. Store as `sentiment_scores jsonb` column on the reports table. Cost: ~$0.0002 per report × 200k = ~$40 one-time, ~$5/mo for incremental new ingest. The user-side compute is a single embedding-distance query against the relevant phenomenon sub-corpus. Negligible runtime cost. The refresh cadence: weekly recompute of the corpus baseline statistics, on-submit comparison for the user.

### Where it surfaces in the UI

Alongside the temporal and geographic strip on the n=1 dossier, as a single line (Free) or expandable multi-dimension panel (Basic+). Not a standalone tab. Not a chart on first contact — chart only on the Basic expanded view. The Free user gets one prose sentence and that's it; it lives at the bottom of the comparative strip.

### Cost-benefit vs. other features

Versus Tier 2 features the panel could otherwise prioritize: corpus-comparative sentiment is **lower lift than the geographic corridor detection** and **lower risk than the personal sentiment arc**. It's a Tier 2 feature, not a Tier 1, but it's cheap enough and on-brand enough to ship in the MVP window if the founder wants. The expected uplift: it converts the comparative strip from two surfaces (temporal, geographic) into three, which materially increases the page's perceived depth on n=1.

### Recommendation

**Ship in MVP as a Tier 2 deliverable, behind a feature flag, soft-launched to 10% of new submissions for two weeks, monitored for any "this felt weird" feedback, then expanded.** Kill it if any meaningful percentage of soft-launch users flag the copy as intrusive. Hold the personal sentiment arc (multi-experience users only, "your language has shifted across submissions") for post-MVP — that one carries real brand risk and should wait.

---

## 6. Revised Tier 1 / Tier 2 / Tier 3 plan — consolidated

Deltas from v2, then the final list.

### Demoted / removed from v2

- **Experience-count gating logic** (the "5+ unlocks the temporal strip" mechanism) — gone. Every comparative surface renders at n=1.
- **Free-tier submission cap of 1 or 3** — gone. Submissions are unlimited for everyone.
- **The v2 "Pattern surface unlocks at 5+ experiences" copy and gating UI** — gone.
- **Multi-experience header as a *threshold* feature** — gone; it now simply renders when n ≥ 2 with no gate language.

### Promoted from v2

- **Named-match offers** (v2 Tier 3 #2) — promoted to **Tier 2** as the central paid-tier feature, gated behind Basic.
- **Mutual opt-in toggles** (v2 Tier 2 #7) — promoted to **Tier 1** scaffolding because Tier 2 named-matches depend on it.

### Added by v3

- **Cadence-and-fallback logic** for the Hints queue (Section 4) — Tier 2 deliverable, has real engineering surface (queue logic, suppression rules, fallback content pool).
- **Corpus-level sentiment scoring** of the 200k Archive (Section 5) — Tier 2 deliverable, one-time backfill + ongoing ingest hook.
- **Sentiment-comparison line in the n=1 dossier** — Tier 2, behind feature flag.

### Final consolidated plan

**Tier 1 — this week (ship in days, no architectural risk):**
1. Rename pass: all user-facing "constellation" / "Lab" page chrome → "My Record" / "The Archive" / "Collections." DB tables stay; presentation-layer views provide aliases.
2. Promote `SinceLastVisitLine` to full-bleed on return visits.
3. Persistent experience pill across all current tabs.
4. "Add another to your record" pill below the dossier on every visit.
5. Replace four Signal cards with one synthesized prose paragraph; demote cards to "see the breakdown" expandable.
6. RADAR scope eyebrow + "What's not shown" tooltip + "Widen the view" pill.
7. Per-experience mutual-opt-in toggles (allow anonymous matching: default on; allow named-match offers: default off). Scaffolding for Tier 2 named matches.

**Tier 2 — this month (structural):**
1. Temporal strip + Geographic panel — both rendered at n=1, default surfaces on the dossier.
2. Hints queue with full cadence and fallback logic per Section 4 (the never-empty floor is the hardest piece — content pool curation needs an operator workflow).
3. Aggregate-aggregate match strip — free for all, "8 people in your county logged X."
4. Named-match offer surface — Basic-gated, mutual-opt-in only, one-per-visit cap, weekly notification batching.
5. Private channel per matched pair — one channel per match, scoped, no general DMs.
6. Corpus-level sentiment scoring + the n=1 sentiment line on the dossier (feature flag, 10% soft launch).
7. Voice guide rewrite across every Lab surface.
8. Paywall surface — anchored to the named-match teaser on the n=1 dossier ("3 of these accounts came from users who opted in to be discovered — subscribe to Basic to see"). Inline, dismissible.

**Tier 3 — next quarter (the flywheel):**
1. Phenomenon "claim" mechanic (Basic+).
2. Multi-experience cross-Record analytics (cross-experience header, lens bar at 15+).
3. Periodic re-analysis with push/email digest of new matches (Basic weekly, Pro daily).
4. Shareable private Record links (Basic view-only, Pro permissioned).
5. Personal sentiment arc — only for n ≥ 3 users, off by default, behind feature flag, full editorial review before any expansion. **Hold this one — it's the bramble.**
6. Demographic-segmented onboarding branching.
7. DB table rename window (Sunday morning after UI ships and views have proved out for a sprint).
8. PDF / JSON export (Basic / Pro).

---

## 7. Remaining open questions

Most are now resolved. Three remain:

1. **Sentiment-comparison soft-launch threshold.** Panel suggests 10% of new submissions for two weeks. Founder may want a lower (5%) or higher (25%) percentage depending on appetite. Operational call.

2. **The "Pro" tier price point and the precise depth delta.** The matrix in Section 2 assumes a higher tier exists above Basic, but the gap (export, real-time refresh, top-5 on-demand) is currently the panel's invention. If the operator's stated price ladder is only Free + Basic, the "Pro" column collapses into Basic and several conveniences disappear. The panel recommends a $11.99 Pro tier exists for the 5-10% of users who'd pay it; otherwise rebalance Basic to include the Pro column items.

3. **Editorial review process for the never-empty Hints content pool.** Tier 2 deliverable #2 requires an operator-curated fallback pool — at minimum 50 evergreen Hint candidates segmented by phenomenon family. Who owns this content workflow? Suggested: founder + one editorial pass for the MVP pool, ongoing operator workflow post-launch.

---

*— The Panel*
