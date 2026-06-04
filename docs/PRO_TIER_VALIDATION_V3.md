# Pro Tier Validation V3 — Quality-Gated Flagships, Locked Pre-Launch

**To:** Chase
**From:** The Pro-Tier Panel, reconvened a third time (Subscription Business Model Strategist + Visitor Conversion Specialist + Brand/Editorial Voice + a new Quality Assurance / Eval Lead seated for v3)
**Re:** Founder's quality-review verdict on v2; locked flagship stack with pre-launch quality gates
**Predecessor:** `/Users/chase/paradocs/docs/PRO_TIER_VALIDATION_V2.md`
**Locked context:** `/Users/chase/paradocs/docs/LAB_PANEL_REVIEW_V3.md` §2

---

## 1. TL;DR

- **Pro has two flagships, not three.** **The Dossier** (kept, deepened) and **Custom Watchlists** (added). *Your Documentary* is dropped per founder direction. *The Documentary Book* PDF is folded *into* the Dossier as an export-and-share affordance, not a standalone flagship.
- **The Dossier is the load-bearing surface.** Per-experience auto-generated cross-reference dossier, refreshed nightly, with one-click PDF export and a separate one-click 1080×1350 Instagram-format share card. Public share URL is opt-in, anonymized by default.
- **Custom Watchlists is the secondary pick.** "Alert me when a new triangle UFO sighting lands within 100mi of me" — structured, quality-verifiable (we can author 10 watchlists and manually confirm the right reports surface), brand-fit as a "standing research interest" framing rather than a notification bell.
- **Both flagships are quality-evaluatable before launch.** The Dossier has five concrete criteria (Section 8); Watchlists has a deterministic correctness test. We can produce 5-10 example outputs against real seeded accounts now and ship only if they pass.
- **Annual SKUs and prices from v2 hold:** $14.99/mo or $149/yr Pro; $5.99/mo or $59/yr Basic.

---

## 2. Founder's v2 verdict — what changed

The founder accepted the Dossier and the broader v2 stack but raised one decisive concern: **long-form AI prose is hard to evaluate at scale**, and Paradocs lives on documentary integrity. Two specific moves:

1. **Drop *Your Documentary* (800-1500 word AI essay).** The quality risk on long-form generative prose — voice drift, fabricated claims, treacly sentences slipping past — is high, and the failure mode is brand-existential. There is no scalable QA against 800-word outputs once we have thousands of Pro users. The founder is right; the panel did not weight this risk hard enough in v2.

2. **Promote the PDF + add social share, fold both into the Dossier.** The founder identified viral-buzz potential in a shareable artifact: "my paranormal archive dossier" as an image card on Instagram or a public URL on X creates exactly the documentary-feels-like-a-museum frame the brand wants, and it converts. Demoting PDF from "flagship #3" to "the Dossier's export and share layer" is the right shape — it makes the Dossier *the* artifact, not one of two artifacts.

3. **Replace the third flagship slot with something quality-evaluatable.** The hard new constraint: produce 5-10 sample outputs against real user data and judge pass/fail *before* we open to the mass market. This rules out anything where quality is subjective and only emerges at scale.

The v2 instinct ("Pro needs categorical separation from Basic") still holds. The execution changes: from *more generative prose* to *more structured depth + a shareable artifact*.

---

## 3. The Dossier — refined spec (the flagship)

The Dossier is now carrying the majority of Pro's perceived value. It must be exhaustive, look right, and produce a downloadable / shareable artifact at the user's fingertip.

### 3.1 What goes into the Dossier

Per experience in your Record, the Dossier is structured into seven sections. **All sections are deterministic queries against the Archive plus short single-paragraph Haiku captions** — never long-form generative essays. The structure is the artifact; prose is the bonded glue, not the substance.

1. **Header strip.** Date, location, phenomenon family, edition number, last-refresh timestamp, your own one-sentence account excerpt.
2. **Closest reports (top 20).** Ranked by multi-signal fingerprint score. Each row: date, location, one-line synopsis (existing Archive field, *not* AI-generated), signal-overlap score badge (e.g., "5/7 signals matched"), Archive citation.
3. **Phenomenology lineage.** The 1-3 catalogue phen pages your account inherits from, each with a single-sentence Haiku caption explaining the inheritance ("This account inherits from the *triangle craft, low-altitude* lineage on three of five descriptor matches"). Caption is structured: one sentence, ≤25 words, archival register.
4. **Geographic neighbors.** Map tile + the list of every Archive report within a 200-mile / 50-year radius. Map clickable, list scrollable.
5. **Temporal neighbors.** Same season / lunar phase / time-of-day / decade matches, plus a small histogram showing your dot against the archive distribution.
6. **Descriptor matches.** Language-pattern siblings — Archive reports sharing imagery or descriptor tokens with your account. Table of 10-20 with the overlapping descriptor highlighted.
7. **Rarity reading.** A computed percentile against the same-phenomenon sub-corpus on each fingerprint signal, plus a one-sentence Haiku caption summarizing where the account sits. ("This account sits at the 78th percentile for rarity within triangle-craft sightings; the temporal signature is what raises it.") **This is structured output, not narrative — the percentile is the artifact, the caption labels it.**
8. **Time-Machine context strip.** What else the Archive captured that week within the region — a short list of contemporaneous reports. (Folds in the v2 "Time-Machine context" Tier 3 idea as a Dossier section.)

### 3.2 What the user sees in-app

Single scrollable page per experience, accessed via a *Dossier* tab on each experience's view (Basic users see a teaser footnote linking to upgrade). Layout:

- Header strip (sticky on scroll)
- Section anchors in a left rail (jump to Closest / Lineage / Geographic / Temporal / Descriptor / Rarity / Context)
- Section bodies render as sectioned cards with clear typographic separation; data-heavy sections (closest reports, geographic neighbors) are tables; rarity is a small horizontal percentile bar.
- Top-right action group: **Refresh now** · **Export PDF** · **Share**

Typography matches the documentary register: serif body, generous line-height, monospace for citations and timestamps. No emojis, no playful microcopy. It should look like a museum acquisition report.

### 3.3 PDF export design

One-click PDF generation from the Dossier tab. Server-side render, 15-30s, download link + email delivery.

- **Cover page.** Phenomenon-family icon, account title ("Lumberton triangle, 1998"), edition number, generation date, the line *"From The Paradocs Archive."*
- **Table of contents.** Auto-generated from the seven sections.
- **Body.** Same seven sections, redesigned for print typography (no scroll, no nav rail; instead, running headers and folio numbers).
- **Footnotes.** Every Archive citation is footnoted; phen pages are linked by stable identifier; descriptors are referenced to their source reports.
- **Closing index.** Locations cited, dates cited, phen pages cited.
- **Colophon.** *"Generated for [Account] on [Date]. The Paradocs Archive, edition [N]. 200,341 reports."*

The PDF is intentionally book-like — A5 page size by default (the size of a paperback monograph), serif throughout, citation block in small-caps. The user has produced *a thing*.

### 3.4 Social share affordance

Two formats, both one-click from the Dossier tab's *Share* action:

1. **Image card (default, Instagram-friendly).** A static, server-rendered 1080×1350 image (the Instagram portrait optimum, also fine on X and LinkedIn). Composition: phenomenon-family motif at top, three callout stats from the Dossier (rarity percentile, closest-report distance, total Archive matches), the account title and date, the line *"From The Paradocs Archive."* No user-identifying details on the default card. User can toggle "include my first name" before sharing.
2. **Public Dossier URL (opt-in).** A read-only public link to a stripped-down version of the Dossier — the rarity strip, the closest-report count, the map tile (region only, not address), the phenomenology lineage. **Excludes** the verbatim account text, the precise location, and any user identifying detail unless the user explicitly opts in to include them. URL is shareable on social; the image card is the link's preview.

Privacy default: anonymized. Sharing requires an active opt-in toggle per Dossier, not a silent account-wide setting. The first-name reveal and the verbatim-text reveal are separate toggles. This protects the user who shares one and forgets they're sharing all.

### 3.5 Refresh cadence

- **Nightly auto-refresh** for Pro users. Computed in batch; user sees a "last refreshed [timestamp]" line in the header strip.
- **On-demand rebuild** via the *Refresh now* action — useful when the user has just submitted a new experience or knows the Archive has grown.
- **Triggered refresh** when the Archive grows by ≥5% since the last cached Dossier, or when a new Archive report scores ≥0.8 fingerprint overlap with this account (the "high-signal new neighbor" trigger).

Edition number increments on every refresh; the previous N editions are kept and viewable, like the v2 *Your Documentary* edition history — but here the surface is structured data, so the edition diff is legible ("Edition VII added 3 closest reports, raised rarity from 72nd to 78th percentile").

### 3.6 Why this works as a single flagship instead of three

The Dossier-with-PDF-and-share is a **product**, not a feature list. It produces a structured, refreshable, citable, printable, shareable artifact for every experience in the user's Record. That is categorically different from Basic — Basic shows three closest reports in a card; Pro produces a 7-section, 20-cite, percentile-scored, PDF-exportable, share-card-renderable Dossier per experience. The categorical separation is unambiguous and the quality is structurally evaluatable.

---

## 4. Secondary flagship — candidate evaluation

The founder said 1-2. The panel ranked 10 candidates against four criteria (each 0-2, max 8): quality-evaluatable pre-launch / categorical-differentiation / brand fit / engineering effort (where 2 = low effort).

| # | Candidate | Quality-eval | Cat-diff | Brand | Eng | Total |
|---|---|---|---|---|---|---|
| 1 | **Custom watchlists / saved searches** | 2 | 2 | 2 | 2 | **8** |
| 2 | Rarity / probability scoring (per-experience) | 2 | 1 | 1 | 2 | **6** *(folded into Dossier)* |
| 3 | Premium catalogue annotations | 2 | 1 | 1 | 2 | 6 |
| 4 | Multi-Record / private collections | 1 | 2 | 1 | 1 | 5 |
| 5 | Premium visualizations (heatmap / wordcloud) | 1 | 1 | 1 | 2 | 5 |
| 6 | Premium phen-page features (deep stats) | 1 | 1 | 2 | 2 | 6 |
| 7 | Time-Machine context per experience | 2 | 1 | 2 | 1 | 6 *(folded into Dossier §3.1.8)* |
| 8 | API access / raw data export | 2 | 1 | 1 | 2 | 6 |
| 9 | Earlier feature access (beta tier) | 0 | 0 | 1 | 2 | 3 |
| 10 | Real-time refresh | 1 | 0 | 1 | 2 | 4 |

### Notes on the scoring

- **#1 Watchlists** is the only candidate scoring full marks on all four. Quality-evaluatability is excellent: we author 10 watchlists by hand (e.g., "triangle UFO within 100mi of [zip]", "any report in [county] mentioning 'missing time'", "any 1990s North Carolina UFO sighting"), then run them against the Archive and verify the surfaced reports are correct. Categorical-differentiation is real — Basic users *cannot* save searches; this is the user expressing a standing research interest, which is exactly the brand frame ("you keep watch on a portion of the Archive"). Engineering effort is low (we have the match RPC; watchlists are stored criteria + a scheduled query).
- **#2 Rarity scoring** is high-quality and easy to evaluate — but it already lives inside the Dossier (§3.1.7). Promoting it to a standalone flagship dilutes both surfaces. Keep folded.
- **#3 Annotations** is fine but the value emerges only after the user has annotated 10+ reports. Pre-launch quality eval is structural ("does the note persist, render only for the owner, export into the PDF?") which is binary engineering correctness, not the "is the output good?" eval the founder wants. Marginal flagship.
- **#4 Multi-Record** still fails the audience-sizing test from v2. Real but small. Not a flagship.
- **#5 Premium visualizations** is mostly design quality — we can mockup-review but cannot stress-test it the way the founder wants for the Dossier.
- **#6 Premium phen-page features** are good Pro perks (full descriptor breakdowns, raw report samples) but they're not a *flagship* in the categorical-differentiation sense. The phen pages already exist; this is "more depth on the same page."
- **#7 Time-Machine context** — same logic as Rarity. It is most powerful as a Dossier section, not as a standalone surface.
- **#8 API access** is correctly held for a later Pro+ tier targeting researchers / journalists. Not a mass-Pro flagship.
- **#9 Beta access** fails the "is there an output to evaluate?" test by construction. Cut.
- **#10 Real-time refresh** is a dial-turn on Basic. Cut as flagship; retain as Pro perk per V3 §2.

### Recommendation: ship Watchlists as the second flagship, hold the rest as Pro perks

The panel debated whether to ship Pro with **only** the Dossier and no second flagship. The case for one-flagship: it lets the Dossier carry the page cleanly and avoids the dilution risk the founder warned about. The case for adding Watchlists: it covers a categorically different *mode of engagement* — the Dossier is retrospective (looking at experiences you've had); Watchlists is prospective (alerting you to experiences the Archive surfaces later that match your standing interest). Together they bracket the user's relationship to the Archive in past and future. That's a cleaner two-flagship story than the v2 trio.

**Verdict: Dossier + Watchlists. Two flagships, both quality-evaluatable, both shippable on stack, no overlap.**

---

## 5. Final Pro flagship stack

1. **The Dossier** (with PDF export and social share) — per-experience structured cross-reference, refreshed nightly, one-click PDF book and 1080×1350 share card.
2. **Custom Watchlists** — saved search criteria that fire notifications when new Archive ingest matches.

All other Pro features from V3 §2 and v2 §6 are retained as Pro perks but not flagships:
- Advanced lenses on temporal / geographic / sentiment surfaces
- Private annotations on any catalogue report or phen page
- Real-time Record refresh, regenerate-on-demand
- Top-5 named-match on-demand
- Permissioned shareable Record links
- Multi-year Year-in-Review
- Raw data export (JSON / KML / CSV)
- First-look on matched ingest
- Daily re-analysis cadence

---

## 6. Final Pro feature stack (pricing-page copy spec)

**Pro — $14.99/month or $149/year. Everything in Basic, plus:**

- **The Dossier** — for every experience in your Record, an auto-generated, structured cross-reference dossier: closest reports, phenomenology lineage, geographic and temporal neighbors, descriptor matches, contextual notes, and a rarity reading. Refreshed nightly. Export as a formatted PDF book. Share as an image card or public link.
- **Custom Watchlists** — define standing research interests (a phenomenon family within a region, a descriptor combination, a decade and shape). When matching reports land in the Archive, you are notified.
- **Advanced lenses** on every comparative surface — custom date-ranges, county-level density, KML export, multi-dimensional sentiment, trajectory analysis.
- **Private annotations** on any catalogue report or phenomenon page.
- **Real-time refresh** with on-demand regenerate.
- **Top-5 named-match on-demand** with full mutual opt-in handshake.
- **Permissioned shareable Record links.**
- **Multi-year Year-in-Review.**
- **Raw data export** — JSON, full match list, all citations, county-level density data, KML.
- **First-look status** on freshly ingested reports matching your fingerprint.

---

## 7. Tier-comparison table — Free / Basic / Pro (final)

| Feature | Free | Basic ($5.99/mo · $59/yr) | Pro ($14.99/mo · $149/yr) |
|---|:---:|:---:|:---:|
| Submitting experiences | Unlimited | Unlimited | Unlimited |
| Browsing the Archive | Open | Open | Open |
| Your Record (dossier view) | Full | Full + cross-experience header | Full + advanced lenses |
| AI synthesis paragraph | Per experience, monthly refresh | + body-of-work paragraph, weekly | Nightly + regenerate on demand |
| **The Dossier (cross-reference)** | — | Closest 3 reports listed | **Full 7-section dossier per experience, nightly refresh** |
| **Dossier PDF export** | — | — | **Formatted PDF book with cover, TOC, footnotes, citations** |
| **Dossier social share** | — | — | **1080×1350 image card + opt-in public URL** |
| **Custom Watchlists** | — | — | **Saved search criteria, push/email on new matches** |
| Temporal analysis | 24h dial + decade band | + time-of-week, lunar, seasonal, decades shift | + custom date-range, raw histograms |
| Geographic analysis | 50-mile ring, 3 data lines | Configurable 10-500 mi, corridor explorer | County-level density, multi-experience, KML |
| Sentiment baseline | One-line population comparison | Multi-dimensional, sub-pattern comparison | Trajectory analysis, archive-wide shifts |
| Aggregate-pattern matches | Always-on | + adjacent counties, nearby phenomena | + underlying reports listed and citable |
| Named-match introductions | — | Mutual opt-in, one per visit | + on-demand top-5 view |
| Private channel after match | — | One channel per matched pair | + Record snapshot sharing |
| Hints queue | 1/visit, lifetime cap 12 | Unlimited, refreshed daily | + save Hints into Collections |
| **Private annotations** | — | — | **On any catalogue report or phen page** |
| Phenomenon claims | Read-only | Claim to Record | + edit / annotate |
| Re-analysis cadence | Monthly | Weekly + digest | Daily + real-time on demand |
| Year-in-Review | Teaser (3 cards) | Full | Full + multi-year retrospective |
| Shareable Record link | — | View-only, expirable | Permissioned by section |
| Raw export (JSON / KML / CSV) | — | — | Yes |
| First-look on matched ingest | — | Weekly digest | Real-time |

Bolded rows are Pro flagships and flagship-tier outputs.

---

## 8. Quality evaluation plan — pre-launch gate

This is the founder's hard requirement: produce sample outputs against real data, judge pass/fail, ship only if pass.

### 8.1 Smoke-test population

Recruit **8 internal accounts** (founder + 7 friends/family known to the founder) and have each submit **1-3 real experiences**. Goal: 15-20 real submitted experiences across diverse phenomenon families (UFO, ghost, missing-time, cryptid, unexplained-sound). This is the eval set. Use seeded Archive (200k+ existing reports) for the comparative substrate.

### 8.2 Dossier quality criteria — 5 specific, measurable

The Dossier passes the launch gate if it meets **4 of 5** criteria across the eval set. If 3 or fewer, iterate; if 2 or fewer, founder-level rethink.

| # | Criterion | Pass threshold |
|---|---|---|
| 1 | **Closest reports relevance.** For each experience, founder manually inspects the top-5 closest reports and rates each as *relevant* / *marginal* / *off*. | ≥80% of top-5 rows rated *relevant* across the eval set (i.e., ≥4 of 5 on most experiences). |
| 2 | **Phenomenology lineage correctness.** Founder verifies the 1-3 phen pages the Dossier inherits from are the right pages. | 100% of inheritances are *correct* (no wrong-family inheritances). Marginals allowed; wrongs are a kill. |
| 3 | **Rarity score alignment with expert intuition.** Founder pre-scores each eval experience 0-100 on rarity-vs-the-corpus. Dossier-computed rarity is compared. | Founder score and Dossier score within ±20 percentile points on ≥80% of experiences. |
| 4 | **Geographic and temporal neighbor accuracy.** Manual spot-check of 5 experiences against ground truth (founder cross-references Archive directly). | 100% of returned neighbors are actually within the stated radius / window. (This is a correctness test, not a quality test.) |
| 5 | **PDF and share-card brand fit.** Editorial review of 3 PDFs and 3 share cards by founder + brand voice reviewer. | Both reviewers rate "ships" on 5 of 6 artifacts. The Documentary register must be intact; no register-breaking copy. |

### 8.3 Watchlists quality criterion

Watchlists ship the same gate, simpler: author **10 hand-designed watchlists** spanning geographic, descriptor, decade, and phenomenon-family criteria. Run them against the seeded Archive. Founder manually verifies the surfaced reports.

| # | Criterion | Pass threshold |
|---|---|---|
| 1 | **Watchlist correctness.** For each of the 10 watchlists, founder reviews the surfaced reports. | ≥95% precision (almost no false-positives); recall is verified by spot-check against 3 known-positive Archive reports per watchlist (must appear). |

### 8.4 Iteration plan if any criterion fails

- **Criterion 1 fails (closest-reports relevance).** Retune the fingerprint scoring weights; the match RPC is the lever. One-week sprint, re-evaluate.
- **Criterion 2 fails (lineage).** Almost certainly a phen-family-tagging bug at submission. Audit the tagger; one-week sprint.
- **Criterion 3 fails (rarity).** The percentile computation needs sub-corpus stratification (compare against same-phenomenon-family only, not whole-archive). One-week sprint.
- **Criterion 4 fails (geo/temporal correctness).** Index bug; deterministic to fix.
- **Criterion 5 fails (brand fit on PDF/share).** Editorial rewrite of templates. One-week sprint with brand-voice reviewer.
- **Watchlist precision fails.** Tighten the match criteria; surface a precision/recall tradeoff control to the user in v2 of the feature.

### 8.5 What we are explicitly *not* evaluating

- **Long-form prose quality.** Because there is no long-form prose in the Dossier — only structured data plus single-sentence captions. The captions are short enough (≤25 words) that brand-voice review at the *template level* covers them. This is the founder's instinct made operational.

---

## 9. Open question for founder

1. **Watchlist notification channel.** Push only, email only, or both? Panel default: in-app surface always; email weekly digest by default; push opt-in. Founder taste call on whether push should be default-on or default-off — the documentary-brand instinct says default-off (no nag), the engagement instinct says default-on for a paid feature.

---

*— The Pro-Tier Panel, V3*
