# Social Counts on Today Feed Cards — SME Panel Review

**Date:** May 24, 2026
**Surface:** Today feed cards (homepage + /discover + Today tab in app)
**Trigger:** Chase note in V11.17.14 bug-hunting session — "I think having a comparable number of likes / comments / etc visible on thumbs up icons etc (like tiktok) is a good social feature to have? Panel input?"
**Existing UI:** Cards currently have a thumbs-up / thumbs-down affordance per the screenshot Chase shared (heart-style "I've experienced something like this" elsewhere)

---

## The core question

**Should Today feed cards display public counts (likes, "I've experienced this", views, shares) — TikTok / Reddit / Twitter style?**

This is a fundamental product-positioning decision more than a UI tweak. The four panelists landed in different places and the synthesis matters.

---

## Panel composition

- **A — TikTok-native consumer (24F, marketing assoc, Atlanta):** Came to Paradocs from a creator she follows. Default-evaluates content by engagement metrics. "If nobody else liked it, why would I?"
- **B — Skeptic-researcher (52M, retired aerospace, San Diego):** Came in via Wired article on UAP. Suspicious of social-proof manipulation. Wants quality signals, not popularity.
- **C — First-time experiencer who's never told anyone (38NB, accountant, Vermont):** Joined to read about other experiences before sharing their own. *Will not share* if their account feels like it'll be ranked / judged on a public scoreboard.
- **D — Trust & Safety lead (40M, formerly Reddit/Discord/Pinterest, NYC):** Reviewing for moderation implications and brigade risk. Understands content-platform social dynamics deeply.

---

## Persona feedback

### Persona A (TikTok-native)

> "Without engagement counts I genuinely can't tell if this is a real archive or a curated AI thing. The number is the social proof — without it I bounce."

Specific feedback:
- TikTok-style "47K likes" creates instant credibility
- Without counts, the page reads as machine-generated (which is partially true)
- Likes + reshares + view counts would all help her engage
- Wants public commenting too — she's used to discussion threads

### Persona B (Skeptic-researcher)

> "I came to Paradocs explicitly *because* it doesn't look like a UFO Twitter pile-on. The minute you put 'likes' on a report you turn this into an outrage farm. Mothman reports will get 50,000 emoji-react likes. NDE reports about a stranger's pediatric death will get four. The good stuff vanishes into the popular stuff."

Specific feedback:
- Popularity ≠ credibility. Reverses the platform's positioning.
- Engagement metrics select for spectacle over signal
- Would prefer: "X researchers have cited this" / "verified by Y external sources" / "investigated by Z org"
- "If you must show counts, show them post-click — not on the card. The card should be the case, not the crowd."

### Persona C (Reluctant sharer)

> "I would never share my experience if I knew I'd see a 'like' count under it. The whole reason I'm even reading here is because nobody seems to be voting on these. They're just *accounts*. They sit there with the same weight as every other one."

Specific feedback:
- The non-rankedness is the unique selling point relative to Reddit / Twitter
- If counts arrive, will not share, will likely leave
- Existing thumbs up/down already feels marginally off. Heart/save feels safer (personal action, not public judgment)
- "I've experienced something like this" private-count (Chase's anonymous-resonance counter) is OK because it's anonymous + counter is small + framed as solidarity not approval

### Persona D (Trust & Safety)

> "Three structural problems with public-count engagement on a content type like first-person paranormal experience:"
>
> 1. **Brigading.** Witness accounts will be either downvoted to oblivion by skeptics or upvoted to noise by enthusiasts. Either way, the count is a worse signal than the content.
> 2. **Sensitive-topic gradient.** Child apparitions, near-death experiences, sexual assault during sleep paralysis — these are sometimes posted. Public engagement counts on those is reputation-trauma-by-design.
> 3. **Manipulation surface.** Once counts exist, bot/sock-puppet activity follows. Especially in fringe-belief communities.
>
> What does work: per-report *categorical signal* like "Investigated by MUFON" / "Has photo/video" / "32 similar reports linked" — counts *about the data*, not *about social engagement*.

---

## Synthesis

The panel is **2-1 against TikTok-style social counts on cards**, with Persona D providing the deciding analytical framework.

The disagreement is about *what the product is*:

- Persona A treats the platform as a content-consumption surface (Reddit/TikTok genre). In that model social counts are necessary.
- Personas B + C + D treat it as a *case archive with editorial integrity* (Wikipedia/Internet Archive genre). In that model social counts erode the unique value proposition.

Chase's stated brand position is **"The home of the unexplained" + Apple App Store / Netflix / Spotify polish + encyclopedic neutral tone**. This positioning aligns with B/C/D, not A. The A persona is real (and large in TAM), but accommodating them via TikTok-style counts moves the product into a less-defensible competitive position.

---

## Recommended treatment

**Don't show public engagement counts on cards.**

But **do** show *signal-bearing data* in the same visual slot — Persona D's insight:

```
┌────────────────────────────────────────────┐
│ [thumbnail/icon]   UFO Sighting · 3h ago   │
│                                            │
│ A silent triangle drifted over the tree-   │
│ line, each corner pulsing soft amber...    │
│                                            │
│ 📍 Pine Bush, NY                           │
│                                            │
│ 32 similar reports · Photo/video           │
│ ──────────────────────────────             │
│ 🔍 Investigated by MUFON                   │
└────────────────────────────────────────────┘
```

What goes in the engagement slot:

- **Similar-report count** ("47 nearby in past month" / "12 similar in 1950s") — this *is* the social proof but it's evidence-based
- **Provenance badge** (source: NUFORC, NDERF, MUFON-investigated, government FOIA, etc.)
- **Has-media/has-photo signal**
- **Witness-count + duration** if known ("3 witnesses, 4-minute observation")
- **"I've experienced something like this" anonymous resonance counter** — private to the report, doesn't rank it across the feed, doesn't show on the card preview (only when expanded)

What we explicitly **do not** show on cards:

- ❌ Public like count
- ❌ Public comment count
- ❌ Share count
- ❌ View count

---

## What about the existing thumbs up/down icons?

These should be **reframed or removed:**

- Reframe: "Was this account substantive?" (private, helps tune the AI; never displayed)
- OR remove entirely. The "I've experienced something like this" heart is enough.

The thumbs metaphor reads like Reddit. We don't want users evaluating other witnesses' accounts; we want them evaluating their own resonance with the phenomenon.

---

## What if Chase wants the TikTok-style retention anyway?

If the strategic decision is *we need TikTok-grade engagement to scale*, two compromise approaches:

**Option X — Aggregated, non-rankable counts.** Show total platform engagement *across the corpus* (not per-report). "23M people have visited a report this month." Conveys scale without ranking individual accounts.

**Option Y — Witness-resonance only.** Public count of *only* the "I've experienced something like this" anonymous resonance. Frame it as solidarity, not popularity. Not displayed on report cards until expanded, never on Today feed.

These both let A persona feel the social proof without the brigade/manipulation/trauma risks D persona flags.

---

## Recommendation to Chase

**Ship: provenance + similar-count + has-media badges on cards. Don't ship: per-report like/comment/share counts.**

If A-persona engagement metrics become a measured retention problem in beta data, revisit with Option Y (aggregated-only) as the lightest-touch compromise.

---

## Open questions

1. Is the existing thumbs up/down ever displayed (vs purely admin tooling)? If yes — recommend removal.
2. The "I've experienced something like this" anonymous-count UI from the screenshot — should the count be displayed at all? (Recommendation: no public count, just the call-to-action. Counter is internal signal for AI ranking + clustering.)
3. Comments — separate panel review needed if/when comments become a feature. Same content-type concerns apply but the design space differs.
