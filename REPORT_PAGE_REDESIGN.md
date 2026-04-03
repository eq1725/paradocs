# Report + Encyclopedia Page Redesign Spec

**Date:** April 1, 2026
**Context:** Expert panel review of /report/[slug] (1,461 lines, 29 content sections) and /phenomena/[slug] (1,041 lines, 4-tab structure)

---

## Report Page: The Redesign

### Core Problem
The report page tries to be everything: an article, a data card, an investigation tool, a social engagement surface, and a conversion funnel — all in one 1,461-line vertical scroll. On a 375px mobile screen, 70% of users never see anything below the location map.

### Design Principle: **Progressive Disclosure with Clear Hierarchy**

The first screen answers: "What happened, where, when, and what does Paradocs think?"
The second screen answers: "What's connected to this, and what should I do next?"
Everything else is available but not forced.

### New Layout (Mobile — Index Reports, 99.9% of content)

**SCREEN 1 — The Hook (above the fold, ~600px)**

```
┌──────────────────────────────┐
│ ← Back          🔊 Play  ⋮  │  ← slim top bar: back, audio play, more menu
├──────────────────────────────┤
│                              │
│ 🛸 UFOs & Aliens            │  ← category badge (one, not three)
│                              │
│ Strange Lights Over          │
│ Phoenix, Arizona             │  ← title (large, bold)
│                              │
│ 📍 Phoenix, AZ  📅 Mar 1997 │  ← single meta line (just location + date)
│ ⚖️ High credibility         │
│                              │
├──────────────────────────────┤
│                              │
│ ┌────────────────────────┐   │
│ │  PARADOCS ANALYSIS     │   │  ← THE HERO CONTENT
│ │                        │   │     visually distinct box
│ │  [AI-generated 2-3     │   │     gradient border
│ │   paragraph narrative  │   │     prominent placement
│ │   analysis of this     │   │
│ │   report...]           │   │
│ │                        │   │
│ │  Credibility: High     │   │
│ │  Mundane expl: Low     │   │
│ └────────────────────────┘   │
│                              │
│ Source: NUFORC ↗             │  ← source attribution (one line)
│                              │
│ ┌──────────────────────────┐ │
│ │ ⭐ Save    📤 Share      │ │  ← sticky bottom action bar
│ │        🔊 Listen         │ │     (replaces both action locations)
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**What's on screen 1:**
1. Slim top bar (back + audio play + overflow menu)
2. Category badge (ONE badge, not three)
3. Title
4. Meta line (location + date + credibility — single line, not a row of 5 items)
5. Paradocs Analysis box (THE main content — large, visually prominent)
6. Source attribution (one line)
7. Sticky bottom action bar (Save + Share + Listen)

**That's it. Seven elements. One screen.**

**SCREEN 2 — The Connection Layer (scroll to reveal)**

```
┌──────────────────────────────┐
│                              │
│ 👥 YOU'RE NOT ALONE          │  ← proximity matching card
│ 12 similar reports within    │
│ 50 miles of this location.   │
│ 3 in the same month.         │
│ [See similar reports →]      │
│                              │
├──────────────────────────────┤
│                              │
│ 🗺️ Location                  │  ← compact map (not full MapLibre)
│ [mini map showing pin]       │     tap to expand to full map
│                              │
├──────────────────────────────┤
│                              │
│ 🔗 Connected Reports         │  ← horizontal scroll cards
│ ┌─────┐ ┌─────┐ ┌─────┐     │     (replaces sidebar Related Reports
│ │     │ │     │ │     │     │      + Connection Cards + Pattern
│ │     │ │     │ │     │     │      Connections — all merged)
│ └─────┘ └─────┘ └─────┘     │
│                              │
├──────────────────────────────┤
│                              │
│ 💡 Community Hypotheses      │  ← hypotheses that reference this report
│ "Water proximity correlates  │
│  with cryptid encounters"    │
│  by @susie_ohio • 14 agree   │
│  [Corroborate] [Challenge]   │
│                              │
├──────────────────────────────┤
│                              │
│ Have you seen something      │  ← emotional CTA (moved UP from bottom)
│ similar?                     │
│ [Share Your Experience]      │
│                              │
└──────────────────────────────┘
```

**SCREEN 3+ — Depth (for power users who keep scrolling)**

```
┌──────────────────────────────┐
│                              │
│ 📊 Case Details              │  ← expandable: info grid, evidence,
│ Content type, credibility    │     environmental context, academic
│ rationale, witness count,    │     panel — ALL collapsed by default
│ evidence, environmental...   │
│ [Expand ▼]                   │
│                              │
├──────────────────────────────┤
│                              │
│ 📚 Further Reading           │  ← book recommendations (curated only)
│                              │
├──────────────────────────────┤
│                              │
│ 🏷️ Tags                      │  ← tag cloud
│                              │
├──────────────────────────────┤
│                              │
│ 📎 Cite This Report          │  ← citation generation
│ APA | Chicago | Plain text   │
│                              │
└──────────────────────────────┘
```

### What Gets Cut or Moved

| Current Element | Decision | Reason |
|----------------|----------|--------|
| Reading progress bar | **KEEP** (curated only) | Appropriate for long-form articles |
| Breadcrumb | **SIMPLIFY** — just "← Back" | Breadcrumbs are desktop patterns; "Back" is mobile-native |
| Parent case banner | **KEEP** but make slimmer | Still useful for case clusters |
| Non-experiencer notice | **CUT** — fold into Paradocs Analysis | The analysis already contextualizes content type |
| 3 badge row (content type + featured + phenomenon) | **REDUCE** to 1 category badge | Badge overload confuses users |
| Feed hook lede (italic) | **MERGE** into Analysis box | It's the opening of the analysis, not a separate element |
| Summary (with 4 dedup checks) | **CUT** | Analysis box replaces this |
| Meta row (5 items) | **COMPRESS** to 1 line: location + date + credibility | 5 items is too many; time, witness count, reading time are depth details |
| Header action buttons (Save to Research Hub + Bookmark) | **REPLACE** with sticky bottom bar | One action location, not two |
| Featured media card | **KEEP** but move below analysis | Media supports the analysis, shouldn't precede it |
| Media mention banner | **CUT** | Confusing UX; if there's no media, don't talk about missing media |
| Image gallery | **KEEP** as expandable carousel above the map | |
| Location map (full MapLibre) | **COMPACT** — show mini-map, tap to expand | Full map above the fold is overkill on mobile |
| Table of contents | **KEEP** (curated only) | Appropriate for long-form |
| Full body text | **KEEP** (curated only) | This IS the content for curated reports |
| Paradocs Analysis box | **HERO** — move to top, increase visual prominence | This is the reason Paradocs exists |
| Source Attribution | **KEEP** — one line below Analysis | Legally required, keep compact |
| Research Hub Preview | **CUT** from report page | This is now in the Lab. Don't preview it here — the save action is the conversion hook |
| Tags | **KEEP** — move to depth section | Tags are for power users |
| Info grid (4 cards) | **COLLAPSE** into expandable "Case Details" section | Power user detail, not first-screen content |
| Credibility rationale | **MOVE** into Analysis box or collapsed details | Good content, wrong placement |
| Further Reading | **KEEP** (curated only), move to depth section | |
| AI Analysis (on-demand) | **CUT** — replaced by pre-generated Analysis box | On-demand is slow and can expose raw descriptions |
| Environmental Context | **COLLAPSE** into "Case Details" | Interesting but niche |
| Academic Observation | **COLLAPSE** into "Case Details" | Interesting but niche |
| Connection Cards | **MERGE** into "Connected Reports" horizontal scroll | Simplify from 3 related-content sections to 1 |
| Bottom engagement row | **REPLACE** with sticky bottom bar | One action location |
| Related Reports sidebar | **MERGE** into "Connected Reports" section | No sidebar on mobile anyway |
| Pattern Connections | **MERGE** into "Connected Reports" section | |
| CTA ("Have you seen something similar?") | **MOVE UP** — right after Connected Reports | This is the emotional peak moment |
| Onboarding tour | **CUT** for now | Onboarding is handled by cold start flow, not per-page tours |
| Ask the Unknown | **KEEP** — floating button | Good engagement tool |
| Log to Research Hub modal | **REPLACE** — Save action goes to Lab saves, not Research Hub modal | Simplify the mental model |

### The Sticky Action Bar

Replaces BOTH the header action buttons and the bottom engagement row. Always visible at the bottom of the screen (above the nav bar):

```
┌────────────────────────────────┐
│  ⭐ Save     🔊 Listen    📤   │
└────────────────────────────────┘
```

Three actions only. Save (primary, highlighted), Listen (audio narration), Share.

On save: triggers "You're Not Alone" proximity check + toast notification. Report is added to Lab saves.

On listen: plays pre-generated audio narration of hook + analysis. 30-60 seconds.

On share: native share sheet (mobile) or copy link (desktop). Rich OG preview.

**No upvote/downvote on the report page.** Voting exists on hypotheses (agree/disagree), not on reports. Reports aren't opinions — they're data. Removing the vote simplifies the action bar and is epistemically cleaner.

**No journal link on the report page.** Journal entries are created from the Lab's Notes tab. The report page's job is: consume → save → share. Not: consume → decide which of 6 actions to take.

### Curated Reports: What's Different

Curated reports (Roswell, Rendlesham, etc.) still show the full editorial experience:
- Reading progress bar
- Full body text with TOC
- Evidence section
- Further Reading (book recommendations)
- Media gallery (prominent)

But they ALSO get the sticky action bar and the "You're Not Alone" / Connected Reports sections. The Paradocs Analysis box is replaced by the editorial body text (since we own the content).

### Net Result

**Before:** 29 content sections, 1,461 lines, two action locations, 3 related-content sections, 4 info cards, 3 badge types.

**After:** ~12 content sections, progressive disclosure, one sticky action bar, one "Connected Reports" section, one badge, one meta line. Estimated: ~600-800 lines.

**The page loads faster** (fewer components, lazy-load depth sections), **converts better** (save is always visible, "You're Not Alone" drives emotional connection), and **feeds the social layer** (connected hypotheses + proximity matching visible on every report).

---

## Encyclopedia Page: The Refinements

The encyclopedia page is better structured than the report page — the tab system already provides progressive disclosure. But it needs some adjustments:

### Changes

1. **Compress the hero.** On mobile, the icon (128px) + title + aliases + summary + stats = ~350px before any content. Reduce icon to 64px on mobile, put aliases behind a "..." toggle, and make stats a single horizontal line.

2. **Add a "Listen" button.** Generate audio for the AI summary + description. Same OpenAI TTS-1-HD approach. Encyclopedia entries are Paradocs's owned content — these audio versions could be genuinely podcast-quality mini-episodes.

3. **Add "Community Hypotheses" section.** Show hypotheses that reference this phenomenon type. "3 hypotheses involve [phenomenon name]. 'Water proximity correlates with cryptid encounters' — 14 agree."

4. **Add "Active Reports" indicator.** If there have been recent reports of this phenomenon type: "🔴 7 new [phenomenon] reports this month — 340% above baseline." This ties into the flap detection system.

5. **Strengthen the Reports tab.** Currently shows a basic list. Should show a mini-map of report locations + timeline visualization + list. The geographic pattern of where this phenomenon is reported is a key differentiator.

6. **Add citation button.** Encyclopedia entries are citable. APA/Chicago format.

7. **Cross-link to Feed.** "See [phenomenon] reports in your Feed" — deep link to `/feed?phenomenon=[slug]`.

### What NOT to Change

- The 4-tab structure (Overview/History/Media/Reports) works well — keep it.
- The AI content sections (description, characteristics, theories, Paradocs analysis) are good.
- The quick facts grid is useful and well-structured.
- The mini-map component is a good touch.

### Net Result

Encyclopedia pages go from "good reference pages" to "living research hubs" — connected to the community hypothesis layer, showing real-time activity, and contributing to the audio experience. They become the go-to landing page for SEO traffic on phenomenon-specific searches.

---

## Implementation Notes

### Report page redesign fits into Week 1 of the roadmap.

It should be done DURING the UX consolidation (Days 1-2) because:
- The sticky action bar replaces two existing action locations (header + bottom)
- The "Save to Research Hub" modal gets replaced by the Lab save flow
- The journal link gets replaced by Lab Notes tab
- The sidebar disappears on mobile (merged into Connected Reports)

This is refactoring in the same spirit as the dashboard → Lab consolidation.

### Encyclopedia refinements can happen in Week 2.

The encyclopedia changes are additive (new sections, compressed hero) rather than structural. They depend on:
- Hypothesis DB tables (from Session C1, Day 5)
- Flap detection (from Session C3, Day 6)
- Audio narration infrastructure (from Session C2, Day 5)

### Route changes: None.

`/report/[slug]` stays. `/phenomena/[slug]` stays. These are the right URLs for SEO and shareability. The pages just get simpler internally.
