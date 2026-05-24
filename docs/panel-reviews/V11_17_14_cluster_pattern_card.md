# Cluster Pattern Card — SME Panel Review

**Date:** May 24, 2026
**Surface:** Trending Pattern card ("298 ufos aliens reports from California")
**Bug source:** Chase note in V11.17.14 bug-hunting session — "needs improvement, pull the UI/UX experts together"
**Trigger:** [Screenshot: trending pattern card with raw category slug exposure + generic CTA]

---

## What's wrong (consensus across panel)

The current card violates three baseline product principles:

1. **Raw data leakage.** `ufos aliens` reads as a database slug. The user sees the seam between AI-classified category metadata and human-facing copy.
2. **Generic + numeric.** "298 reports … in this cluster" is a counter, not a story. The card is the most prime real estate on the homepage carousel and it's being used for a headline that any database query could generate.
3. **No narrative payload.** A "Trending Pattern" should answer *what is the pattern?* — not just *how many?*. The current card promises insight and delivers a count.

---

## Panel composition

Four personas, recruited to span the product's intended audience:

- **A — Mass-market curious-skeptic (35F, library asst, Cincinnati):** First-time site visitor referred by a friend. Doesn't know what NDERF, NUFORC, or "cluster" means. Reads headlines, not subtext.
- **B — Researcher/journalist (42M, freelance, Portland):** Familiar with UFO disclosure landscape. Came in via a TikTok mention of the Wired article on UAP data. Cares whether the platform looks credible enough to cite.
- **C — Lifelong experiencer (61F, retired teacher, rural Wyoming):** Saw a UFO at 14. Joined platform to find similar accounts. Skeptical of polish; cares about substance.
- **D — Mobile-first design lead (34NB, product designer, NYC):** Reviewing the product professionally; pays attention to type hierarchy, color discipline, microcopy patterns.

---

## Persona feedback

### Persona A (Mass-market)

> "What's a cluster? I thought patterns were like Spotify Wrapped — 'you listened to indie rock 47% of the year.' This just says 298 reports happened in California. So what?"

Specific issues:
- "ufos aliens" lowercase reads broken — looks like the page didn't finish loading
- "View Reports" button reveals it's a filter, not a story
- Doesn't know if this is a serious thing or a fun curiosity
- Wants: *what's actually trending*, in one line. "A wave of orb sightings hit California last week." Specific. Vivid. Now I want to click.

### Persona B (Researcher)

> "298 is data. What's the methodology? Past 7 days from when? Is this anomalous vs baseline? What's the baseline? If a cluster is genuinely emergent I want to know — but this card doesn't establish whether it's emergent or normal."

Specific issues:
- No baseline comparison (298 vs typical ~120/week → 2.5x; vs typical ~300/week → noise)
- "Trending" implies anomaly detection but the card shows no anomaly evidence
- Would screenshot this for a piece if it had: cluster N, baseline B, p-value or %-above-baseline, link to underlying methodology
- Wants: a one-line *finding*, plus a tooltip explaining what triggers a cluster designation

### Persona C (Experiencer)

> "Doesn't speak to me. I saw something in 1979. 'California reports' doesn't tell me if anyone else saw what I saw."

Specific issues:
- Generic geographic clusters feel impersonal
- Wants connection-based clusters: "47 people described an orange triangle this month" — that's a pattern she'd respond to
- Number alone is hollow. Pattern needs a *shape* (object, behavior, time of day)

### Persona D (Designer)

> "Three problems mechanically: typography hierarchy is flat (one weight, one size for both headline and the count), 'Trending Pattern' pill is competing with the headline for the eye, and the icon is a stock emoji — no visual identity. This is a 4-out-of-10 card on a homepage that has multiple 8-out-of-10 cards next to it."

Specific issues:
- Headline weight should be 600-700, the count should drop to display-secondary
- "298" as the dominant numeric is fine, but it needs a tighter relationship with the label ("reports" should be tiny tabular-nums next to it, not on its own line)
- The "From Paradocs" / "Cluster Pattern" double-eyebrow is redundant
- Purple-on-purple lacks contrast for accessibility (WCAG AA failing on the gradient)
- Carousel arrows obstruct reading on small viewports

---

## Synthesis

The card is **doing two jobs and failing both**: it's trying to be a *trending headline* AND a *filter shortcut*. Pick one.

**The four personas converge on:**
- Replace the slug-derived "ufos aliens" with the categorical proper noun ("UFOs & Aliens")
- Replace the generic count headline with a *specific finding*: WHAT is trending (shape/type/behavior), not just where
- Add baseline context for credibility ("3x typical weekly rate" / "first cluster of this type since 2024")
- Tighten visual hierarchy: one headline, one supporting fact, one CTA

---

## Recommended treatment (panel synthesis)

Card content rewritten:

```
┌─────────────────────────────────────┐
│ 🛸  TRENDING THIS WEEK              │   ← eyebrow (one only)
│                                     │
│ Orange triangular UFOs              │   ← finding (headline, what)
│ over California                     │   ← location (subhead, where)
│                                     │
│ 47 reports in the past 7 days       │   ← evidence line (specific N, time)
│ ~3× the typical weekly rate         │   ← anomaly signal (B persona)
│                                     │
│ [ Explore the cluster →  ]          │   ← single specific CTA
└─────────────────────────────────────┘
```

Generation logic:
- Pick the most specific shared attribute across the cluster (shape, color, behavior) — not just category
- Show count + window + baseline anomaly ratio (when available)
- Drop "Trending Pattern" + "From Paradocs" double-eyebrow → single eyebrow ("TRENDING THIS WEEK")
- Drop stock emoji — use the same CategoryIcon component used elsewhere for visual identity continuity

Engineering implication: needs a "cluster finding" generator (Haiku call across the cluster's reports → one-sentence shared characteristic). Lightweight — ~$0.001/cluster. Cache for 24h.

---

## Recommended next step

**Pick one of these three to ship first:**

1. **Cosmetic-only fix (1 hour):** Title-case the category slug + drop double-eyebrow + use CategoryIcon. Card looks better but content stays generic.
2. **Content-deepening fix (1 day):** Cosmetic + add the Haiku-generated "finding" + add baseline anomaly ratio. Card finally earns its premium homepage slot.
3. **Defer (weeks):** Continue using current generic card while focusing on higher-priority polish elsewhere.

Recommendation: **option 2.** The carousel is too prime to leave on the generic version, and the Haiku call is cheap enough to make worthwhile. ~$2-5/day of cluster-finding generation, refreshed every 24h, ~30-50 active clusters.

---

## Open questions for Chase

1. Should clusters be auto-promoted to homepage (algorithmic), or curated (Chase picks each week)?
2. Anomaly baseline — rolling 30-day rate, or all-time rate? (Rolling is more responsive but volatile in low-data categories.)
3. If a cluster turns out to be debunkable (e.g. Starlink launches caused the California UFO surge), do we surface a "Counterpoint" link, or just remove the cluster?
