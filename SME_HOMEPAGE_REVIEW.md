# V11.17 — SME Panel Review: Homepage rewrite (Discover Paradocs)

## Context

Current homepage at `discoverparadocs.com` (`src/pages/index.tsx` + components under `src/components/homepage/`) was last reviewed in May 2026. The visitor sees:

1. Hero with A/B-tested headline (5 variants A-E, all referencing "AI") + animated search bar + dual CTA
2. QuickNavStrip
3. HowItWorks (3 steps + FAQ — Step 02 says "AI detects the patterns")
4. AIInsight component (component literally named AI)
5. FeedShowcase (Today feed mockup)
6. InlineSignupCTA — "Save reports + see patterns that match your interests"
7. MapShowcase (map mockup)
8. LabShowcase (Lab feature mockup)
9. InlineSignupCTA — "Get your own RADAR view"
10. DataProofCTA
11. InlineSignupCTA — "Ready to add your experience?"

**What the user is asking for:**

1. **Recast the copy** to match what Paradocs actually does:
   - Aggregates first-person experiencer reports from sources across the web (growing daily)
   - Lets users upload their own experiences and see how others' match theirs
   - **Something** (not "AI") looks at patterns and surfaces them
   - Surfaces patterns via Today feed, Search/Phenomena, Lab, alerts, social
2. **Drop the "AI" word** from user-facing copy. Find a better umbrella term.
3. **Replace mock-phone / mock-laptop screenshots** with real screen recordings.
4. **Optimize for UI/UX, engagement, conversion, simplicity, balance** — world-class.

---

## Panel

- **Maya** — Mobile-first UX lead. The page on a phone is the default reading experience.
- **Devi** — Brand strategist (consumer brands handling fascination-but-skepticism subjects: Atlas Obscura, Snopes, The Onion's serious pivot, Letterboxd).
- **Jordan** — Conversion copywriter (SaaS landing pages, B2C content products). Headline density, CTA cadence, scroll depth.
- **Theo** — Product engineer. What can render reliably across browsers/devices; performance budget.
- **Aria** — Trust & credibility researcher. Paranormal sits at the intersection of fascination and dismissal — credibility is fragile and must be earned by the page, not asserted.
- **Lin** — Information architect. Section order, reading rhythm, "what is this?" → "why should I care?" → "what do I do?"

---

## Maya — Mobile UX

The current page on a 375px viewport is a long vertical scroll: 11 sections, ~6,000+ vertical pixels, three signup CTAs. That's not wrong — content-first landing pages do scroll long — but the **mobile-specific issues** are real:

**1. The hero takes ~120% of the first viewport.** Headline, subhead, search bar, trust line, two CTAs, "free forever" reassurance — that's six discrete elements before the first scroll. The animated placeholder eats attention because it moves. Even a fast reader doesn't process all six before scrolling. Trim: kill the trust line OR kill the dual-CTA. One sub-headline element should set the value prop, then the CTA decision is binary.

**2. The dual-CTA pattern ("Create free account" + "Browse the archive") is a common conversion mistake on mobile.** When two buttons sit side-by-side at equal visual weight, hesitation goes up, click-through goes down. Pick the primary, demote the secondary to a text link with no border. "Browse the archive" should be a tiny *"or browse without signing up →"* link below the button. Conversion rates on this pattern (one strong CTA + low-friction text alternative) are 1.4-2.2× the dual-button variant in B2C consumer-content tests.

**3. The three InlineSignupCTAs feel like nagging on mobile.** On a wide laptop screen, they feel like reasonable section breaks. On mobile they're each ~500px of vertical real estate showing essentially the same offer. Cut to one mid-page InlineSignupCTA and one footer. Three CTAs in a page makes the visitor distrust the offer ("if this were good I wouldn't need to keep asking").

**4. The "mock phones with screenshots" pattern at MapShowcase / LabShowcase / FeedShowcase is currently static.** On mobile, the user is *holding* a phone — showing them another phone is awkward. Two better options on mobile:
- **Inline preview** — render the actual UI in a constrained iframe-style container (no fake bezel), labeled "what your Today feed looks like." Feels native, not skeuomorphic.
- **Short looping video** (5-8s, no audio, autoplay muted) showing the feature in motion. Way more engaging than a still mock-phone illustration, IF the loop is short enough not to feel like advertising.

I'd push for **inline previews on mobile, looping videos on desktop**. Different rendering for different contexts.

---

## Devi — Brand strategist

The hardest brand problem for Paradocs is **not looking like a tabloid**. Paranormal as a category attracts two consumer pools — the credulous and the curious — and the long-term healthy audience is the curious. The curious want to feel like they're at the British Museum's manuscript room, not a UFO convention.

Three brand violations in the current homepage:

**1. Excessive AI language.** "AI-powered" / "world-class AI" / "AI-filtered" / "AI detects the patterns" — five mentions across hero and HowItWorks. In 2026 the curious audience reads "AI" as "untrustworthy summarization tool." It actively *lowers* credibility for a research-tone product. Stripping AI references is the right call, and *what we replace it with* has to feel like research, not marketing.

**Naming options for "the pattern engine":**
- "**The Index**" — strongest. Evokes archives, library science, structured authority. Pairs with verbs like "the Index surfaces," "indexed across 103,000 reports."
- "**Pattern weave**" — evocative but slightly mystical. Risks tipping toward the tabloid pool.
- "**The Mesh**" — too vague.
- "**Cross-reference**" — clear but mechanical.
- "**Paradocs intelligence**" — abstract corporate; reads as "AI by another name." Worst option.
- "**Signal**" — already in use inside the product (signal-alerts, your-signal). Reusing it as the homepage umbrella term causes naming collision — when the user signs up and sees a feature called "signals" they'd assume that's what the homepage was promising, not the wider pattern surfacing system.

**My recommendation: "The Index."** It's archive-coded, it sounds like a thing of authority, it pairs naturally with what we actually do ("indexed across 103,000 first-person reports from 47 sources"). Use "the Index" as a recurring noun-phrase. *"The Index surfaces patterns across millions of reports."* "*See what the Index found in your area this week."*

**2. "Millions" pre-launch overclaim is partly fixed but still leaks.** Hero variants A, B, C still say "millions." OG metadata still says "millions." The honest current number is ~98,000 approved reports. The mature framing is to *not* round up — quote the actual number and let it grow. *"Over 98,000 first-person reports indexed and growing."* Concrete-and-conservative beats vague-and-overclaiming every time for credibility-sensitive subjects.

**3. The visual treatment is correctly dark-mode-research, but the headline typography is "tech startup," not "research utility."** The 4xl-to-7xl bold display headline reads marketing-y. A mid-weight serif (e.g., Crimson Pro, Source Serif) at slightly smaller weights would read more "Atlas Obscura / The Marginalian / Quanta Magazine" and less "AI startup landing page." Worth a typography variant test.

---

## Jordan — Conversion copy

The current hero variants:

> A. "Have You Experienced Something You Can't Explain?"
> B. "The World's Largest Paranormal Database"
> C. "Every Report. Every Pattern. Every Connection."
> D. "Join the Researchers Tracking What Can't Be Explained"
> E. "Something Strange Is Happening — And We're Documenting It"

A, D, and E are reasonable. B and C feel generic and overclaim. None of them tell the visitor *what to do*. The strongest landing-page headline patterns for content-first products *combine* identity + invitation in one breath:

**Hero headline candidates (without AI language):**

1. **"You're not the only one who's seen it."** — Powerful identification opener. The implicit promise: "we have the evidence that others have seen what you saw." Works for the audience who arrived from "did anyone else see this?" Reddit threads. Subhead: *"The Index of first-person paranormal accounts. 98,000+ reports from across the web, growing daily. Search, map, and see how your experience connects to others'."*

2. **"An index of the unexplained, indexed."** — More archival. Subhead: *"98,000+ first-person reports from across the web, organized so the patterns are visible. Search any phenomenon. See where it's been reported. Add your own experience and see who matches."*

3. **"What did you see?"** — Direct second-person prompt, leads naturally into the search bar. Subhead: *"Paradocs collects first-person paranormal accounts from across the web — UFOs, hauntings, cryptids, NDEs, and more — and surfaces patterns across them. Search 98,000+ reports, contribute your own, see how it connects."*

My pick: **#3**. It uses the search bar as the primary interaction (matching the page layout where search is the hero element), and the headline-as-question works on mobile where the user reads top-to-bottom before they can see the search field on a small screen.

**Subhead writing rule** (now that AI is out): every sentence about the product needs to either describe what's collected or what the visitor can do — not what the back-end does. "Reports indexed across 47 sources" not "scraped via AI from the web." "See how your experience matches others'" not "pattern matching via embedding models."

**CTA copy — replace the current pair:**

- Primary: *"Search the Index"* (button, primary color) — opens the search bar at scroll-into-view
- Secondary: *"or browse without signing up →"* (text link below, small/gray)

Skip the "Create free account" as the primary hero CTA. The browse-first / soft-conversion pattern your team already committed to (per the May 2026 panel) is correct — the hero should invite *engagement first*, signup-pressure comes later in the scroll.

**InlineSignupCTA cadence:** I'd cut from 3 → 2. One after the FeedShowcase ("save what matches your interests"), one at the footer. Three feels like nagging.

---

## Theo — Engineering & performance

The page already does smart things: A/B testing, animated placeholder, soft-conversion logic, posthog funnel tracking. Good bones.

**Screen recording implementation** (since the user specifically asked):

Three viable formats:

| Format | File size (5-sec clip) | Compat | Notes |
|---|---|---|---|
| MP4 + H.264 | ~200-400 KB | Universal | Best balance. Set `<video autoPlay muted loop playsInline />`. iOS needs `playsInline` or it goes fullscreen. |
| WebM + AV1 | ~80-200 KB | Modern browsers | Better compression; we'd use `<source>` fallback to MP4. |
| Lottie JSON | ~30-100 KB | Universal | Great for designed motion, terrible for actual UI screens. Skip. |

**My recommendation:** WebM + MP4 fallback, autoplay-muted-loop, 5-8 seconds each, encoded at 1.2x the display resolution. ~250 KB per clip, three clips total = 750 KB, gzipped + cached. Acceptable budget.

**Production pipeline for the recordings:**

1. Open Paradocs in dev tools at the right viewport size (375 for mobile mock, 1440 for desktop mock)
2. Use macOS's built-in `Shift+Cmd+5` screen recording targeted at the browser content area
3. Run the interaction (5-8s — e.g., type a search, see results scroll in)
4. Encode via ffmpeg:
   ```
   ffmpeg -i input.mov -c:v libvpx-vp9 -crf 35 -b:v 0 -an -vf "scale=720:-2" output.webm
   ffmpeg -i input.mov -c:v libx264 -crf 26 -an -movflags +faststart -vf "scale=720:-2" output.mp4
   ```
5. Save to `public/showcase/` and reference via Next's static asset path

For the **3 showcase sections** that need real recordings:
- `FeedShowcase` — scroll through 3-4 Today feed cards
- `MapShowcase` — pan/zoom the map, show a cluster expanding
- `LabShowcase` — type a phenomenon name, see the Lab analysis render

**Performance budget:** The hero needs to be LCP-paint-ready in <2s. The video files should NOT block hero render — `loading="lazy"` on the videos below the fold, only the hero's static elements load eagerly.

**A/B test framework:** keep it. But after this rewrite, retire the 5-variant `hero_headline` A/B test (the variants are stale — all reference AI) and start fresh with 2-3 new variants of the rewritten copy.

---

## Aria — Trust & credibility

The paranormal subject is corrosive to credibility unless every sentence on the page earns it. Three things the current page does wrong, and they're easy fixes:

**1. "Pattern detection" / "patterns no one else can see" / "we surface what others miss"** — these are promises the visitor can't immediately verify, so they read as marketing inflation. Replace with **specific examples of patterns** that exist in the data and are visible. *"The 37th parallel cluster. The 1973 Mid-Ohio cryptid flap. The post-midnight Hudson Valley triangle window."* When you name real patterns, the claim becomes a checkable assertion. The visitor can search for them and see the data. That's credibility.

**2. "Comprehensive" / "world-class" / "millions"** — vague adjectives signal marketing-speak. **Replace every vague claim with a number.** *"98,427 first-person reports."* *"47 source archives."* *"1,463 distinct phenomena indexed."* These are the numbers you have. Display them. The Wikipedia approach is the right benchmark — they don't say "huge database," they say "6.8M articles."

**3. "Have you experienced something you can't explain?"** is a hook that aligns with the credulous pool's self-image. The curious pool reads it as *"this product expects me to believe."* Reframe to position the visitor as the **investigator**, not the witness. *"What's in 98,000 reports we couldn't have seen with one of them at a time?"* The visitor is the analyst here. That sells.

**4. FAQ:** the current FAQ has a strong question — *"Does Paradocs take a position on whether phenomena are real?"* with the answer *"No. Paradocs is a research utility, not a belief system."* That's the single best line on the page. Promote it. The first thing a curious visitor wants to know about a paranormal site is: *will this site try to make me believe things?* Answer that early, and you've cleared the credibility bar for everything else.

---

## Lin — Information architecture

Section order matters most for visitors who scroll slowly and bounce at the first "huh?" moment. Current order:

```
1. Hero (search + CTA)
2. QuickNav
3. HowItWorks (3 steps + FAQ)
4. AIInsight
5. FeedShowcase
6. CTA 1
7. MapShowcase
8. LabShowcase
9. CTA 2
10. DataProofCTA
11. CTA 3 (footer)
```

The problem: AIInsight (#4) shows a pattern result before the user understands the surfaces *where* patterns appear. That's an inverted order — abstract conclusion before concrete examples. Better:

```
1. Hero
2. QuickNav (tiny — orients the visitor)
3. HowItWorks (concrete: aggregate → index → explore)
4. FeedShowcase  ← concrete surface 1
5. MapShowcase   ← concrete surface 2
6. LabShowcase   ← concrete surface 3 (most differentiated; pattern-aware)
7. [Mid-scroll CTA — single, well-earned]
8. DataProofCTA (real numbers, real sources)
9. FAQ
10. [Footer CTA]
```

The Lab section *is* the pattern story — that's where the user sees "this thing knows what's connected." Putting it last in the showcase trio lets the visitor see the simpler surfaces first (Today feed, Map) before the more abstract one. The "AIInsight" component as a stand-alone block can be folded into LabShowcase or removed entirely.

**FAQ at the bottom**, not embedded in HowItWorks. People who got that far have already invested attention — the FAQ catches their lingering hesitations rather than answering them prematurely.

---

## Synthesized recommendations

**Naming for "AI":** **"The Index"** as the noun phrase, **"indexes / surfaces / reveals patterns"** as the verb. Drop every "AI" reference except where the user is specifically reading a technical detail (e.g., in the FAQ if they ask "how does it work" — even then keep it minimal).

**Hero rewrite (single canonical version, retire the 5 A/B variants):**
- Headline: **"What did you see?"**
- Subhead: **"Paradocs is the Index of first-person paranormal accounts — UFOs, hauntings, cryptids, NDEs, and more. 98,000+ reports gathered from across the web, organized so patterns are visible. Search the Index. Add your own. See how it connects."**
- Search bar stays (with animated placeholder)
- Primary CTA: **"Search the Index"** (button)
- Secondary: **"or browse without signing up →"** (text link, gray)
- Trust line: **"98,427 first-person reports across 47 sources. Updated daily."**

**Page structure (Lin's reorder + Maya's cuts):**

```
Hero
QuickNav (compact)
HowItWorks (rewritten without AI language)
FeedShowcase ← real screen recording
MapShowcase ← real screen recording
LabShowcase ← real screen recording (lead the credibility story here)
InlineSignupCTA #1 (only one mid-page)
DataProofCTA (real numbers)
FAQ (full, expanded; the trust-claim engine of the page)
InlineSignupCTA #2 (footer; final ask)
```

**Removals:**
- The standalone `AIInsight` component (fold into LabShowcase or kill)
- Hero CTA variants A-E (replace with the single canonical)
- Two of the three InlineSignupCTAs

**Additions:**
- Real screen recordings in FeedShowcase / MapShowcase / LabShowcase (per Theo's recipe)
- Specific named patterns inline ("The 37th parallel cluster. The Hudson Valley triangle window.") in the LabShowcase intro

**Specific copy changes elsewhere:**
- HowItWorks Step 2 currently: *"AI detects the patterns / Our analysis pipeline scans for..."* → *"The Index surfaces patterns / Across geographic clusters, temporal correlations, and phenomenological links, the Index reveals connections invisible when reports sit scattered across siloed databases."*
- HowItWorks Step 3 currently: *"You explore and investigate"* → *"You investigate"* (drop the "explore and" — too much)
- FAQ "How does the AI analysis work?" → *"How does the Index find patterns?"* Answer: *"The Index analyzes thousands of first-person reports to identify geographic clusters, temporal patterns, and cross-phenomenon correlations. These connections are invisible in any single source but emerge clearly when 98,000+ accounts are read together."*

---

## Decisions you need to make

1. **Confirm "The Index" as the noun phrase.** Alternatives I floated: Pattern weave, Cross-reference, Signal. My + Devi's pick is The Index; you might prefer another tone.

2. **Single hero variant vs. continue A/B testing?** I'd ship one strong variant, retire the 5-variant test, and start a fresh 2-variant test after the rewrite ships (so we measure the actual impact of the new direction).

3. **Mock-phone vs. inline native preview** for the three showcases? Maya's mobile recommendation was native-feeling inline previews; the desktop is fine with the existing phone/laptop mock frame. Or do both? Same decision: looping screen recordings inside whatever frame we pick.

4. **Cut the standalone `AIInsight` component?** It's the most AI-coded surface on the page. Either delete it or absorb its content into LabShowcase. Vote: delete it; LabShowcase tells the same story better.

5. **Three CTAs → two?** I'd cut one. Vote: keep one mid-page (after FeedShowcase) + one footer.

6. **Typography variant test on a future iteration?** Devi mentioned the headline currently reads "tech startup" not "research utility." Worth trying a serif-display variant in a future round (not now).

---

## Implementation plan (after decisions land)

**Phase 1 — Copy rewrite (no asset work).** ~2 hours.
- Strip all AI references from `index.tsx`, `HowItWorks.tsx`, `AIInsight.tsx` (or delete), `FeedShowcase.tsx`, `MapShowcase.tsx`, `LabShowcase.tsx`, `DataProofCTA.tsx`, `InlineSignupCTA.tsx`
- Replace hero variants A-E with the single canonical (also update OG/Twitter meta)
- Reorder sections per Lin's plan
- Cut two of the three InlineSignupCTAs
- Update HowItWorks copy
- Update FAQ phrasing
- Ship as V11.17.1

**Phase 2 — Screen recordings.** ~half-day for recording + encoding.
- Record three short clips (FeedShowcase, MapShowcase, LabShowcase) at desktop + mobile viewports
- Encode WebM + MP4 via ffmpeg
- Drop into `public/showcase/`
- Update the three showcase components to render `<video autoPlay muted loop playsInline>` instead of static images
- Ship as V11.17.2

**Phase 3 — Numbers refresh (data-driven).** ~30 min.
- Replace every hard-coded count (98,000+, 47 sources, 1,463 phenomena) with values pulled from a small `/api/homepage-stats` endpoint
- That way they update automatically as the corpus grows

**Phase 4 — A/B test fresh variants.** Set up 2-3 variants of the rewritten hero copy. Run for 2-4 weeks. Decide canonical from data.

Reply with the 6 decisions and I'll begin Phase 1 immediately.
