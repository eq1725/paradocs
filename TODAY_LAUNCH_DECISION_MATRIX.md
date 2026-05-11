# Today (/discover) — Launch Decision Matrix

**Cohort:** Mix of (a) Contact in the Desert booth visitors, (b) Gaia-adjacent paranormal-curious adults who've personally experienced or know someone who has, broader than the active-believer core.
**Format:** Executive summary, scannable, decision-ready.
**Scoring legend:** 🔴 must-fix before booth/mass launch · 🟡 strong recommend before mass launch · 🟢 nice-to-have / phase 2 · ⚪ skip or defer indefinitely

---

## Cohort calibration — what this means

The Gaia-adjacent + Contact-in-the-Desert audience is **patient with reading, sophisticated visually, and primed to save & share**. They will read 60-word headlines without complaint if the page looks credible. They will not stick around if the page looks unfinished. They expect:

- **Apple-News-tier visual polish.** They subscribe to Substack, Pocket, NYT, Gaia. The dossier aesthetic is right *if* it's executed at that level — viewport-fit, visible color, hero imagery, refined typography.
- **Editorial confidence over social-velocity tricks.** This is not a TikTok cohort. Aggressive density reduction is wrong; the Connected Cases panel level of density is right.
- **Collection identity.** They keep journals, save articles, follow long-form Substacks. The save-to-Lab loop and shareable case exports are critical retention machinery.
- **Trust in the source.** "Index, never republish" is exactly the right framing — they will respond to "we have the case file, here's the source" more than "here's a viral repost."
- **Daily-rhythm engagement.** "Today's Lead Case" pushed at 9am fits this cohort perfectly — they read NYT Cooking emails and Gaia-recommends-this notifications already.

**One implication that sharpens the V2 review:** for this cohort, the answer to several "TikTok-style" recommendations is "ignore." They don't need full-bleed video, edge-peek next-card previews, or sub-second swipe rhythm. They need **credibility, beauty, and a reason to come back tomorrow**.

---

## The full decision matrix

### Severity 1 — must-fix before booth (June 2026 / mass launch)

🔴 **1. Viewport-fit contract.** Cards must be exactly viewport height. Sticky-bottom CTA. No element-stack overflow. Body content scrolls inside the card with a soft fade-mask on the bottom edge. Fixes the OnThisDate cut-off you flagged. **Effort: 2 days.**

🔴 **2. Reduce card element count from ≤9 to ≤5.** The Pali Canon card has 9 stacked elements. Apple News and Pocket cards have 3–4. Restructure to: badge row · headline · single chip strip · optional 1-stat callout · sticky CTA bar. Drop the redundant bottom stats bar entirely. **Effort: 1.5 days.**

🔴 **3. Visible category color.** Bump the gradient from 14% alpha (currently invisible) to 22–28%. Switch radial → linear top-down. This is not a stylistic preference — it's the difference between "users perceive a category" and "users don't." **Effort: 2 hours.**

🔴 **4. Hero imagery on phenomenon cards when `primary_image_url` exists.** 30–40% opacity backdrop with a bottom-up gradient scrim for legibility. Apple News, Pocket, Flipboard all use this pattern. The Encyclopedia already has Wikipedia-attributed images for hundreds of phenomena. Use them. **Effort: 1 day.**

🔴 **5. Empty state for filtered-zero-result lens.** Currently the page shows nothing if a lens filters down to zero. Add: "No cases matched 'On this day' for May 26. Try Trending or All." with a Clear button. **Effort: 2 hours.**

🔴 **6. First-day bootstrap feed.** A user signing up at 11pm shouldn't get an empty "today" experience. Curate 10–15 evergreen featured cases (Roswell, Loch Ness, Pali Canon, etc.) as the always-available bootstrap layer, surfaced for first-time visitors before the algorithmic feed kicks in. **Effort: 1 day curation work.**

---

### Severity 2 — strong recommend before mass launch

🟡 **7. Save state animates on the card itself**, not just header toast. Bookmark icon top-right fills on save with a brief scale animation. This is the single highest-impact change for "did my swipe register?" anxiety. **Effort: 1 day.**

🟡 **8. Haptic feedback on save / dismiss / long-press.** `navigator.vibrate(50)` on web; `UIImpactFeedbackGenerator` on iOS PWA. One line per gesture. Massively improves perceived quality. **Effort: 2 hours.**

🟡 **9. Lens chip strip — fade-mask + arrow indicator on right edge.** Communicates "scrollable; more chips off-screen." Right now "Ghosts & H..." is clipped on screen 1; users may not know to scroll. **Effort: 1 hour.**

🟡 **10. Sticky-bottom CTA absorbs save action.** When user swipes right, the CTA bar's right edge "lights up" with the saved-state. Visual anchor for the gesture. BeReal pattern. **Effort: 4 hours.**

🟡 **11. Body text truncation on sentence boundary**, not character count. "spatiotempor..." in the OnThisDate body looks unfinished; "...spatial cues." would look intentional. **Effort: 2 hours.**

🟡 **12. Streak chip in TodayHeader top-right.** Once a user has a 2+ day streak, surface it persistently in the header. Reinforces daily-return identity for the Gaia cohort. **Effort: 2 hours.**

🟡 **13. Native search overlay on /discover** instead of routing to /explore. Filter the gesture feed in place via `?q=` param. Avoids breaking the session for a single keyword. **Effort: 2 days.**

🟡 **14. "Read Case" expansion taps onto the card directly.** Currently the Read Case button is the only entry to expanded view. For this cohort, tapping the headline itself should also expand. Lower friction. **Effort: 2 hours.**

🟡 **15. Collapse tooltip on first expansion.** One-time tooltip over the Collapse button explaining "tap to return to the feed." Removes the "is this stuck?" moment. **Effort: 4 hours.**

🟡 **16. Search icon in header → search Today.** Same as #13 — keep users in flow rather than routing them out. **Already implemented partially via #13.**

🟡 **17. Constellation paywall styling.** The "CONSTELLATION / Full case files & connections" footer in the rabbit-hole panel reads as a section divider. For paid conversion, it needs to look like a value proposition: lock icon, accent border, button styling, copy that says what it unlocks. **Effort: 4 hours.**

🟡 **18. Share button in card chrome.** Top-right, next to the (new) bookmark icon. Tap → OS share sheet with pre-formatted content. Critical for the Gaia cohort because they share paranormal content socially as identity-signaling. **Effort: 4 hours (basic share); +2 days for pretty Story-formatted PNG export.**

---

### Severity 3 — engagement loops (post-launch, before paid acquisition spend)

🟡 **19. "Today's Lead Case" daily push notification at 9am local time.** This is the BeReal mechanic adapted for a research product. Single curated case per day. The "Today" name is doing nothing right now; this is what makes it earn the name. Highest single retention lever in the product. **Effort: 3 days (push infra + curation rules).**

🟡 **20. Save → Lab celebration loop.** Every 5 saves: transient toast with category breakdown ("You're building a UFO archive — 12 cases this week"). Strava + Duolingo pattern. **Effort: 1 day.**

🟢 **21. Year in Review / "Your Paradocs Wrapped".** Annual celebration of saves, streaks, top categories, biggest discoveries. Spotify Wrapped is the template. The data infrastructure is already there. Annual feature, run once a year, generates massive sharing. **Effort: 2 weeks (full design pass).**

🟢 **22. Smart match alerts.** "A new case matches your saves: Black Triangle UFOs near Sedona, 1989." Push notification, Core+ tier gated. **Effort: 1 week.**

🟢 **23. "Why you're seeing this" affordance.** Small 'i' icon next to category badge → "We surfaced this because you saved 3 UFO cases this month." Algorithm transparency = trust. **Effort: 1 day.**

🟢 **24. Card → next-card peek (4–6px of next card visible).** TikTok pattern; reduces "did my swipe land?" anxiety. Lower priority for this cohort because they're not in TikTok-velocity mode. **Effort: 3 hours.**

---

### Severity 4 — pre-mass-market polish

🟡 **25. `prefers-reduced-motion` support.** Disable card-slide transforms when OS setting is on. WCAG / accessibility correctness. Not optional for mass market. **Effort: 1 day.**

🟡 **26. Skeleton card during pagination, not just initial load.** Currently second-batch fetches happen silently; on slow connections users see the end of buffered content with no signal more is coming. **Effort: 2 hours.**

🟡 **27. Light theme variant.** Some Gaia subscribers prefer light mode (older eyes, certain visual sensitivities). Doesn't have to be primary; just has to exist. **Effort: 3–5 days.**

🟢 **28. Sound design pass.** Subtle, opt-out by default. Save action = tiny haptic-paired sound. Card swipe = whisper-soft cardstock flip. This cohort responds well to ambient audio cues (Gaia plays Calm-style background sounds). **Effort: 1 sprint.**

🟢 **29. Inline media-rich card variant.** When a phenomenon has a strong primary image + region map + first-reported year, render those as a "media card" variant with split layout (image left, text right on tablet/desktop). For now keep mobile single-column. **Effort: 1 week.**

🟢 **30. Onboarding refresh referencing the cohort.** First-run topic picker copy is generic. Gaia-adjacent cohort responds to "What draws you in?" tied to their personal experience: "Have you experienced something you can't explain?" → branches to topic picker. Higher conversion. **Effort: 4 hours copy + design.**

🟢 **31. Tablet/iPad layout refinement.** Currently tablet collapses to mobile single-column. iPad-toting Gaia subscribers (very real demographic) deserve a 2-column or magazine layout. **Effort: 1 week.**

---

### Severity 5 — defer or deprioritize for this cohort

⚪ **32. TikTok-velocity sub-second card transitions.** Stay at the current 230ms. Faster would feel anxious to this cohort.

⚪ **33. Auto-expand on dwell.** Already removed. Keep removed. Don't re-introduce even as opt-in for v1; the mental model conflict isn't worth the friction.

⚪ **34. Aggressive imagery-required policy.** Phenomena without imagery still need to look great. Don't gate cards on having `primary_image_url`. Lean on category icon watermarks for the imageless variant.

⚪ **35. Edge-peek "next card" preview.** TikTok pattern. Out of style for this cohort. Skip.

⚪ **36. Long-press as a primary save mechanism.** Keep it as a secondary "more like this" affordance only. Right-swipe is the primary save, with the new card-anchored bookmark animation reinforcing it.

⚪ **37. Verbose tooltips / explainers.** This cohort doesn't need walkthrough chrome. The first-run gesture tutorial is enough; don't add more onboarding overlays.

---

## What to ship before booth (assumed timeline: ≥2 weeks)

If you have ~2 weeks before Contact in the Desert, this is the critical-path list:

**Week 1 (must-fix):** Items 1, 2, 3, 4, 5, 6 — the visual / structural readiness floor. After these are shipped, the booth experience would be: visitor scans QR → sees a card with hero imagery, visible category color, clear CTA, beautiful typography. They can swipe through 5–10 cards in a minute, save 1–2 to their phone. Equivalent to leafing through a high-end magazine at the booth.

**Week 2 (engagement-loop quick wins):** Items 7, 8, 9, 10, 11, 12, 18 — save animation, haptic, lens chip polish, share button, sentence-boundary truncation, streak chip. After these, the experience is "sticky" — users walk away from the booth having shared a card with a friend, started a streak, and gotten a notification the next morning.

**Week 3+ (post-booth, pre-paid-acquisition):** Items 13, 14, 17, 19, 20, 25 — search overlay, tap-to-expand, paywall polish, daily push, save celebration, reduced-motion support.

---

## What to ship after booth (Months 1–3 of mass launch)

**Items 21, 22, 23, 27, 30, 31** — Year in Review (built before next year's wrapped season), smart match alerts (paid-tier feature for retention), algorithm transparency, light theme, cohort-tuned onboarding, tablet layout.

---

## What I'd skip entirely

**Items 32–37** in the matrix above — they're all imported from the TikTok / social-velocity playbook and don't fit the Gaia + Contact cohort. Re-evaluate only if a future cohort shifts toward social-discovery.

---

## Summary: total effort

| Tier | Items | Effort |
|------|-------|--------|
| Must-fix before booth | 1–6 | ~6 days focused work |
| Strong recommend pre-mass-launch | 7–18 | ~6 days focused work |
| Engagement loops | 19–24 | ~3 weeks (with 21 alone being 2 weeks) |
| Polish | 25–31 | ~3–4 weeks |
| Skip | 32–37 | 0 days |

For booth-readiness in 2 weeks, focus is items **1–18**: roughly **10–12 days of focused implementation work**. Achievable as a single sprint with one engineer + one designer if you want to stretch design polish, or in ~14 working days as a solo effort.

The ROI on items 1–4 is the highest of any work in this product right now. They're the difference between "a research-paranormal app that's fine" and "an Apple-tier index that the Gaia cohort is willing to pay for and share with friends."

---

## Recommended next conversation

Tell me which tier you want to commit to before booth. If it's tier 1 only (must-fix), I can ship items 1–6 in a single sustained pass. If it's tiers 1 + 2 (booth-ready), it's 1–18 across two passes with a checkpoint between them. Either way, the OnThisDate clip (item 1) and the visible category color (item 3) and the hero imagery (item 4) are the three changes that will most visibly transform the live build for the next set of screenshots.
