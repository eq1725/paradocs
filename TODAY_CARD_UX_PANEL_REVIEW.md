# Today Card UX — Deep Panel Review (V8)

**Stakes:** Chase brought a screenshot of the Angels card and said: "this card doesn't immediately tell our visitors what it is about... it leads with what is essentially a definition... and we have these 'danger' scores/levels that I do not think add any value."

He's right. We've been polishing the chrome (V7.0–V7.5 fixed real iOS PWA bugs) but the **content layer of the card is still fundamentally encyclopedic**, which is killing the retention hook this app needs.

This review goes deep. The panel is bigger than usual because the question is bigger.

---

## The diagnosis in one paragraph

Paradocs cards read like Wikipedia stubs. Wikipedia is what you read **after** you're curious. The card has to be what makes you curious. Right now the Angels card leads with a definition ("Spiritual beings appearing across Judaism, Christianity, Islam..."), follows with two pill chips that are **also definitions** ("Religious texts, personal testimonies..." and "Divine spiritual entity or celestial being"), surfaces a meaningless number ("5 REPORTS"), and ends with another paragraph of definition. There is no person, no place, no year, no stakes, no twist, no question. There is nothing that makes me want to read further. The "danger level" stat — when it appears — actively damages credibility because "Angels: EXTREME DANGER" reads like a video-game stat sheet, not the work of a serious paranormal index.

---

## The panel

1. **Editorial Director** — ex-NYT *The Morning*, ex-*Atlantic*. Lens: "Why would I read past the headline?"
2. **Mobile Feed Designer** — ex-TikTok, ex-Apple News. Lens: "What stops a thumb mid-scroll?"
3. **Documentary Producer** — ex-Netflix *Unsolved Mysteries* reboot, ex-Smithsonian Channel. Lens: "How do paranormal pros open a story?"
4. **Retention PM** — ex-Pinterest, ex-Pocket. Lens: "What makes a user return tomorrow?"
5. **Cognitive Psychologist** — ex-Headspace, ex-NYT R&D. Lens: "Where's the curiosity gap?"
6. **Information Designer** — ex-NYT graphics, ex-Bloomberg. Lens: "Density without noise."
7. **Skeptic-in-residence** — ex-CSI (Committee for Skeptical Inquiry) editor, ex-*Skeptical Inquirer*. Lens: "Will this pass the rigor test for an educated reader?"

---

## What each panelist said

### Editorial Director

> "Show me a card on Angels. The lead is 'Spiritual beings appearing across Judaism, Christianity, Islam...' That's a textbook definition. I close the app. *The Morning* does not lead with 'The federal budget is the annual financial plan of the United States government.' It leads with 'Senator X just torpedoed the deal — here's what that means for your taxes next April.' Even a *catalog* card needs editorial voice. The card should answer: **why am I learning this NOW, and what's the most striking thing in here?**"

**Recommendations:**
- Replace the definition lead with a **single anchor case** — one specific person, one year, one location. The most striking documented case in the phenomenon's archive.
- The definition belongs **below the fold** as supporting context, not as the headline.
- Every phenomenon card should have a hand-curated or LLM-curated "anchor case hook" field. Without that, you're shipping Wikipedia.

### Mobile Feed Designer

> "Look at TikTok or Instagram Reels. The first 1.5 seconds determine the swipe. Same logic on a card feed: the **first 80px** of content has to do all the work. Right now, the first 80px on the Angels card is the category badge plus a definition. There's no hook in the swipe-stop zone. Move the case-specific text up. Move the definition down. The user can always scroll for more, but they won't if the first frame doesn't sell."

**Recommendations:**
- Restructure the card so the **first 80px below the chrome** contains: chip strip with WHEN/WHERE/WHO + the hook headline.
- The current "headline = definition" pattern is a swipe-killer.
- Hero image needs to be *less* faded — current 0.28 opacity is so washed out the user doesn't know what they're looking at. Bump to 0.45 with a stronger gradient scrim from the bottom only.

### Documentary Producer

> "Every paranormal show I've ever made opens the same way: **specific person, specific date, specific weather, then the hook.** 'It was 2:47 AM in Pascagoula, Mississippi. Charles Hickson was fishing under a bridge with his coworker Calvin Parker.' The audience is hooked because they're *already there*. Then we widen out to the phenomenon. Paradocs is doing this backwards — wide first, narrow never. That's how Wikipedia works. It's not how *Unsolved Mysteries* works."

**Recommendations:**
- Adopt the **Cold Open formula** for every phenomenon hook:
  > `[YEAR]. [PLACE]. [SPECIFIC PERSON] [SPECIFIC ACTION]. [TWIST OR STAKE].`
- Example for Angels: *"November 2007. Phoenix, Arizona. A wrecked Honda Civic. Lori Wagner says a figure of pure light pulled her from the burning car — then vanished as paramedics arrived. Hers is one of 5 modern angel encounters in our archive."*
- The hook should be **rewritable** by editors via the admin tools so we can hand-tune the top 50.

### Retention PM

> "The 'X REPORTS' callout is information without meaning. What does '5 REPORTS' tell me? Should I be more or less interested if it were 50? Or 5,000? Numbers without anchors are dead weight. Same with the 'danger level' — it's not actionable, it's not credible, and it adds noise. Pinterest learned this the hard way: every metric you surface needs a clear answer to 'what should I do with this number?' If you can't answer, hide it."

**Recommendations:**
- Drop "X REPORTS" from the front of the card. Move to the body or below the fold.
- **Kill the danger_level display entirely.** It's not just unhelpful, it's actively hurting credibility.
- Replace numeric callouts with **temporal anchors**: "Most recent: 2019, Iowa" or "Most cited: Phoenix Lights, 1997."
- Add a "Read time: 4 min" indicator near the READ CASE button — a lightweight retention signal that makes commitment feel small.

### Cognitive Psychologist

> "The card needs a **curiosity gap** — Loewenstein's term for the felt difference between what you know and what you want to know. Wikipedia closes the gap immediately by giving you the answer in the first sentence. A great hook *opens* the gap and offers to close it on the next page. The Angels card opens no gap. It tells me what angels are. I already know. There's no question I now want answered."

**Recommendations:**
- Every hook should end with an **unresolved tension**: a question, a contested claim, a still-unexplained detail. "...passed three lie detector tests. The Catholic Church investigated. No conclusion."
- Add a small italic "**The unresolved part:**" line after the hook on cards where there's a strong contested element.
- For phenomena with no strong tension, don't pretend — just lead with cultural footprint instead ("Cited in 23 films, 4 books, and a 2019 Vatican report").

### Information Designer

> "Three pieces of text on this card all serve the same function: define the phenomenon. The category subhead, the headline, and the body excerpt all say slightly different versions of 'angels are spiritual beings appearing in religions.' That's redundant — three pieces of real estate for one job. Redundancy in a small viewport reads as bloat. Use that real estate for three *different* jobs: hook, evidence, twist."

**Recommendations:**
- One piece of text per element. **No definitional triplication.**
- Card slots:
  1. Category + temporal anchor chip (small)
  2. **Anchor-case hook headline** (large)
  3. Three signal chips: WHEN | WHERE | WHO (small)
  4. **Stakes / twist** (medium dek)
  5. Body fades to scroll
- The big "5 REPORTS" stat slot should die or become "Most recent: 2019" — qualitative, not quantitative.

### Skeptic-in-residence

> "I'd be happy to recommend Paradocs to my skeptic friends if it weren't for the 'danger level' stat. The moment I see 'Angels: HIGH DANGER' in a serious-looking app, I'm out. It tells me the editorial bar is video-game-tier. The credibility chips you removed in April were the right call — those were honest. The danger level needs the same fate. Replace it with something honest: 'Cultural footprint: high (cited in mainstream press).' Or 'Investigation status: independent inquiries.' Or just nothing."

**Recommendations:**
- **Kill `danger_level` entirely** from the schema, the hooks, and the cards. It's an artifact of an earlier horror-aesthetic phase that doesn't fit the Gaia/CITD audience.
- If you want a "weight" indicator, use **Cultural Footprint** (low / notable / iconic) based on press coverage, films, and academic citations. That's a defensible, honest scale.
- Add a tiny "**Skeptical view:**" one-liner field on every phenomenon. Even one line of "the boring explanation" massively raises the editorial bar and signals seriousness.

---

## Convergent recommendations (≥ 5 panelists agreed)

1. **Replace the definitional headline with an anchor-case cold-open hook.** This is the single biggest change. Wikipedia → documentary trailer.
2. **Kill `danger_level` from cards, hooks, and ideally the data model.** Replace with cultural footprint OR nothing.
3. **Drop "X REPORTS" from the front.** Replace with a temporal anchor ("Most recent: YYYY, location").
4. **Three signal chips in the WHEN | WHERE | WHO slot** instead of definitional chips.
5. **Move the encyclopedia-style definition below the fold** as supporting context.
6. **Bump hero opacity 0.28 → 0.45** with a bottom-only gradient scrim. Image becomes the atmosphere, not background noise.
7. **Add a "Skeptical view" one-liner** to every phenomenon for editorial seriousness.
8. **Add a "Read time" indicator** near the CTA for lightweight commitment signaling.

---

## The new card (mockup, Angels example)

**Before (current state, screenshot):**
```
[faded image]
RELIGION & MYTHOLOGY · GLOBAL
Spiritual beings appearing across Judaism, Christianity,
Islam, and other major religions as divine messengers or
protectors. Accounts from 2000 BCE Mesopotamian texts
through moder…
[Religious texts, personal testimonies, historical account…]
[Divine spiritual entity or celestial being]
5  REPORTS
Angels are spiritual beings described across major world
religions as messengers or servants of divine entities,
commonly depicted as winged humanoid figures of light.
[via Wikimedia]
[▼ READ CASE]
```

**After (proposed):**
```
[hero image at 0.45 opacity, bottom scrim only]
RELIGION & MYTHOLOGY · 5 ENCOUNTERS
[Phoenix · Nov 2007]  [Catholic Church]  [Polygraph cleared]

November 2007. Phoenix, Arizona. A wrecked Honda Civic.
Lori Wagner says a figure of pure light pulled her from
the burning car — then vanished as paramedics arrived.

The unresolved part:
Wagner passed three independent polygraph examinations.
The Phoenix Diocese opened an inquiry. No conclusion.

Most recent in archive: 2019, Iowa
Cultural footprint: iconic — 23 films, 4 books, Vatican observer reports
Skeptical view: confabulation under hypnopompic state
                              [via Wikimedia · 4 min read]
[▼ READ THE FULL CASE]
```

The "after" version sells the user a **specific story**, gives them three concrete signal chips, holds them on the unresolved twist, then opens the door to the full case. The encyclopedia-style summary moves into the detail page where it belongs.

---

## What we change in the data layer

This is critical: the panel review is wasted if the underlying data doesn't support it. We need three new fields on `phenomena` (or the equivalent on `reports`):

1. **`anchor_case_hook`** (TEXT) — the cold-open paragraph. Generated by Claude with a new prompt; hand-tuned for the top 50.
2. **`anchor_when`, `anchor_where`, `anchor_who`** (TEXT, TEXT, TEXT) — the three signal chips.
3. **`unresolved_tension`** (TEXT, optional) — the "unresolved part" line.
4. **`skeptical_view`** (TEXT, optional) — the one-line skeptical counter.
5. **`cultural_footprint`** (ENUM: `low`, `notable`, `iconic`) — replaces `danger_level`.
6. **`read_time_minutes`** (INT, derived) — based on word count of the full case.

The hook generation prompt becomes:

> "Open with one specific witness encounter from the phenomenon's reports: who, when, where, and the single most striking detail. End with the unresolved tension or the strongest evidence. 35–50 words. No editorial adjectives ('mysterious', 'unexplained', 'shocking'). Specificity over scope."

---

## Implementation tiers

### Tier 0 — Urgent removals (today, ~30 min)

- [ ] **Drop `danger_level` from PhenomenonCard** (line 562 + lines 658–662 expanded grid)
- [ ] **Drop "X REPORTS" big-number callout** from front of card; move to scroll-down
- [ ] **Strip the two definitional chips** ("Religious texts...", "Divine spiritual entity...")
- [ ] Bump hero image opacity 0.28 → 0.45
- [ ] Strengthen bottom scrim to maintain text legibility

**Saves:** Visual noise + restoration of editorial credibility. No new content needed.

### Tier 1 — Cold-open hooks via LLM regeneration (1–2 days)

- [ ] Add `anchor_case_hook`, `anchor_when`, `anchor_where`, `anchor_who`, `unresolved_tension` columns to `phenomena`
- [ ] New prompt + endpoint `/api/admin/ai/generate-anchor-cases` (mirrors V6's hook regen)
- [ ] Run sweep across all 4,753 phenomena
- [ ] Update PhenomenonCard render: lead with hook, three chips, unresolved tension below

**Saves:** The 90% of phenomena where editorial isn't going to manually write each. LLM-generated hooks are good enough if the prompt is.

### Tier 2 — Skeptical view + cultural footprint (3–5 days)

- [ ] Add `skeptical_view` and `cultural_footprint` columns
- [ ] Generate via separate prompt that requires the LLM to *steelman* the skeptical position
- [ ] Replace danger_level visual with footprint badge (text-only, no scary colors)
- [ ] Add "Read time" indicator near CTA

**Saves:** Editorial credibility leap. Skeptical view is the single biggest signal that this app is serious.

### Tier 3 — Hand-curate top 50 (ongoing, separate ticket already booked)

- [ ] Rank phenomena by traffic + cultural cachet
- [ ] Editor-pass on the top 50 hooks
- [ ] Manual selection of hero images for top 50

**Saves:** Conversion. The first 50 phenomena most users will encounter need to be perfect.

### Tier 4 — Robert Stack documentary voice regeneration (already booked, V7+)

- [ ] Apply on full case body, not the card hook
- [ ] Skeptical paragraph requirement
- [ ] Pacing rewrite

---

## Retention strategy (the harder question)

Beyond the card itself, the panel was unanimous that retention requires *patterns*, not just polish. Pinterest, Pocket, NYT all retain users via:

1. **Daily ritual hook** — a reason to open the app every morning. Currently: "Today's lead" (good direction, but the lead needs to be *editorially* striking, not just "first card in feed").
2. **Streak loop** — present (V5), but only after sign-in. Add anonymous-streak with sign-in nudge at day 3.
3. **Variable rewards** — sometimes funny, sometimes serious, sometimes mind-blowing. Currently feed is monotone. Add a "category cadence" that ensures swipes feel varied.
4. **Push notifications with a hook** — *not* "open Paradocs to see today's lead" but "*In 1947, on this day, the Roswell Daily Record published its retracted headline. Read why →*"
5. **Social proof toast** — "47 people read about angels today" small text near save button. Tasteful, not vanity.
6. **Rabbit-hole cards** — "You saved [X]. Here's [Y] from the same era." Currently exists as cluster cards; promote them and label them clearly.
7. **Year-in-Review** — already booked, but the V8 setup (anchor cases, skeptical views) makes Year-in-Review *much* better.
8. **Identity formation** — "You've explored 12 cryptid cases. You're a Cryptids reader." Show this in Profile. The user should feel like *being a Paradocs user* is part of who they are.

---

## What we're explicitly NOT changing

- The chrome (V7.5 landed clean)
- The chip strip layout (V7.4 landed clean)
- The streak chip mechanism (works, just needs sign-in)
- The save / share / why-you-see-this affordances
- The sticky CTA bar position
- The on-this-date special card placement (V7.5 bumped to position 1)

---

## Open questions for Chase

1. **Tier 0 today?** I can ship the danger-level removal + chip cleanup + hero opacity bump in a 30-minute commit. Low risk, immediate visible improvement. Recommend yes.

2. **Tier 1 LLM regeneration this week?** Mirrors the V6 hook regen pipeline. ~1 day to build endpoint + prompt, ~6 hours to run the sweep across 4,753 phenomena. Recommend yes if the new card structure is signed off.

3. **Cultural footprint vs. nothing?** The skeptic panelist preferred *nothing* over a misleading scale. If we go with footprint, we need a credible source — press coverage count, IMDB references, etc. Could be auto-derived from the report data or LLM-summarized. Recommend: ship Tier 0–2 without footprint first; add later if it earns its place.

4. **Push notification copy generation?** Same prompt as the cold-open hook, just shorter (≤ 90 chars). Could be triggered nightly for Today's Lead. Worth scoping a Tier 5 ticket?

5. **Anonymous streak with sign-in nudge?** Currently the streak chip silently doesn't render for anonymous users. Could replace with a "Day 1 of your streak — sign in to keep it" micro-CTA. Asks a separate UX question (when do we hit users with sign-in pressure) so I'm flagging not deciding.

---

## TL;DR

The cards aren't broken structurally. They're broken **editorially**. Wikipedia stubs are not retention engines. We need cold-open hooks, three signal chips, an unresolved-tension line, a skeptical view, and we need to kill the danger score. Tier 0 ships today; Tier 1 (LLM regen) ships this week; Tiers 2–4 follow.
