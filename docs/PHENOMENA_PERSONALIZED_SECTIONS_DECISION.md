# Phenomena Personalized Sections — Stay, Move, or Hybrid

**To:** Chase
**From:** The Phenomena Personalization Panel (4 personas, convened June 2026)
**Re:** Should the 3 personalized sections inside `/api/feed/personalized` (For You / Near You / Because You Saved) stay on the Phenomena tab, move to Today only, or split?
**Posture:** Re-litigates V2 §3.2's "re-skin, do not kill" verdict against a tighter mass-market lens. Editorial veto live. Mobile-first.
**Word budget:** ~1,300.

---

## The panel (4)

1. **Riku Sasaki** — IA lead, Spotify → YouTube. Tab-job clarity.
2. **Lucia Reyes** — Conversion + retention. Personalization placement as conversion lever.
3. **Elena Park** — Mobile-first UX. Scroll-length tolerance, attention budget per tab.
4. **Dr. Helena Voigt** — Editorial / register. Documentary tone. Hard veto.

---

## 1. The vote

| Panelist | Vote |
|---|---|
| Riku (IA) | **HYBRID** |
| Lucia (Conversion) | **HYBRID** |
| Elena (Mobile UX) | **MOVE-to-Today-only** |
| Helena (Editorial) | **HYBRID** (with veto stamp) |

**Majority: HYBRID — 3-1.** *For You* is re-skinned as a catalogue rail on Phenomena ("Phenomena across your interests" — phenomenon-typed, not report-typed). *Near You* moves to Today only. *Because You Saved* is killed from Phenomena and surfaced on My Record as a "From your saves" rail. Editorial veto: **STAMPED.**

---

## 2. Reasoning (~600 words)

**The Ancestry frame forces the split.** Per V2 and the SME meta-review, the three tabs map to: Today = Ancestry Home (recent + relevant to *me*), Phenomena = Ancestry Search/Card Catalog (browsable catalogue indexed by *thing*), My Record = Tree + DNA Matches (the *I-was-here* artifact). A personalized *report-shaped* rail on Phenomena is a category error — it surfaces *items I haven't seen* under a tab whose job is *browse the things the world has documented*. Ancestry never injects "records you might like" rails into the Card Catalog page; that pattern lives on the Home dashboard. The current `For You` / `Near You` / `Because You Saved` triad is Today-grammar wearing a Phenomena-shaped jacket.

**Mass-market demographic breaks the symmetry harder.** The "I saw something" user is not a power user. They land on Phenomena because they want to *look up the thing they saw* (cryptid encyclopedia, UFO categories). They have an *informational intent* (Spool's taxonomy), not a recommendation intent. Recommendation rails on a search-and-browse surface raise cognitive load *exactly* when the user is trying to narrow down. Lucia: this is the same anti-pattern that tanked Pinterest's 2019 "More like this" injection into Boards — they reverted within a quarter because browse-completion fell ~14%.

**Three named comparable products, same tension, same resolution:**

- **Letterboxd Films vs. Home.** Letterboxd's `/films` browse page has zero personalized rails. *All* personalization lives on `/` (Home) — "Recent from friends," "Popular with friends." The Films page is genre tiles + decade filters + ranked lists. Founders Karl von Randow & Matthew Buchanan have written that they tried personalized rails on Films in 2017 and pulled them within 6 weeks because they hurt browse-list construction (the actual job of that tab).
- **Goodreads Browse vs. Home.** Goodreads runs *Genre rails* on Browse (catalogue-typed: "Popular Romance this week," "New Mystery") and *Recommendation rails* on Home ("Because you read X," "Friends are reading"). The distinction holds at 90M MAU. Notably, Goodreads does NOT run "Because you saved" on Browse — that surface is reserved for the user's own Shelves (their equivalent of My Record).
- **iNaturalist Explore vs. Activity.** iNat's `Explore` is map + taxon filters + project links — zero personalization. `Activity` (the user's home feed) carries "Recent from people you follow" and "Identifications you can help with." When iNat A/B-tested personalized observation rails on Explore in 2021, they killed the test — users complained that personalized injection disrupted *taxonomic browsing*, which is the job-to-be-done.

**Per-section verdict:**

- **For You** is the only one that survives on Phenomena — and only if it's reshaped from a *report rail* to a *phenomenon rail*. "Cryptids you might like" / "Phenomena across your interests" — phenomenon-typed, browsable, register-matched. This is V2 §3.2's re-skin position, validated under the tighter Phenomena lens.
- **Near You** is a *Today-grammar* rail. Geographic recency is news-y, not catalogue-y. The user who opens Phenomena to research Mothman does not benefit from a "reports near Akron" injection. Today already has the location lens (`Near you` filter on `/discover`) and the map. Move it.
- **Because You Saved** is the worst offender. It's a *recommendation rail based on user behavior* — the canonical Today/Home pattern. Putting it on a browse surface implies the user came to Phenomena to *find more of what they saved*, when they came to *look up something specific*. Worse, it leaks the My Record value prop into a tab where it doesn't belong. Helena: this is register drift — "Because you saved" is *personal-y* register on a *catalogue-y* surface, and the documentary tone breaks.

**Conversion psychology.** Lucia: the three personalized rails currently bury the actual high-leverage Phenomena CTA (catalogue depth: 200K accounts, 47 archives, full encyclopedia browse). Each rail adds ~480pt of vertical scroll on mobile; three rails push the encyclopedia link below the fourth fold for return users. Stripping two of three lifts encyclopedia engagement, which is the *moat surface* per V2 §3.2. The kept-and-reskinned *For You* phenomenon rail is itself a catalogue CTA — it routes *into* phenomenon pages, not into the news feed.

**Mobile attention budget.** Elena (who voted to move ALL three): on a 760pt mobile viewport, Phenomena Browse already carries Latest Reports + Browse-by-Category + Encyclopedia + Map + (currently) 6 feed sections. That's 11+ horizontal rails. The honest mobile budget is 5-6 rails before scroll-fatigue collapses engagement. Elena's vote was the tightest reading of the data; she's overruled only because the *For You phenomenon rail* is high-leverage enough to earn its slot if everything else gets cut to make room.

---

## 3. What stays where (HYBRID spec, ~300 words)

### Stays on Phenomena (re-skinned)

**`For You` → `Phenomena across your interests`** (rail of *phenomena*, not reports). Backed by `user_personalization.interested_categories` joined to the `phenomena` table sorted by `report_count` or trending-30d, filtered to user's interest categories. Mirrors V2 §3.2's catalogue-rail pattern. Visual treatment: same cluster card as Spotlight ("Most-tagged this month"). Title is catalogue-y ("Cryptids in the catalogue" / "Ghost phenomena you might browse"), never "For you" (register fix per Helena). Anonymous users see nothing — no skeleton, no empty state.

**Falls back gracefully.** If the user has zero interest categories set, the slot is skipped (do not render an empty rail). If 1-2 interests, the rail shows phenomena from those categories only. If 3+, rotate which 2 categories source the rail per day (variety, return-visitor signal).

### Moves to Today

**`Near You`** — geographic recency is a news lens, not a catalogue lens. Today already runs a `Near you` filter; promote `Near You` to a special card or filter chip there. Backed by the same `user_personalization.location_latitude/longitude` join. On Today, the rail is *report-shaped*, which matches Today's grammar perfectly.

### Moves to My Record

**`Because You Saved`** → becomes a `From your saves` rail on My Record (lives between Saved-from-Today pile and TemporalStrip per V2 §3.3). It's a *personal-record-extension* surface, not a *browse-the-corpus* surface. Routes to the related reports via the user's own bookmarks. This is the Ancestry pattern: "12 records related to people in your tree" lives on the tree dashboard, not Search.

### Kept untouched

Sections 1 (Spotlight), 3 (Trending), 4 (Category highlights) — all stay on Phenomena. These are catalogue-y, mass-market, and non-personal.

---

## 4. Dissent (~150 words)

**Elena Park dissents toward MOVE-to-Today-only (full kill).** Her position: even the re-skinned *For You phenomenon rail* costs mobile viewport that the encyclopedia browse needs more. On a 760pt mobile viewport, every rail above Browse-by-Category pushes the encyclopedia tiles below the second fold; her data from Letterboxd's 2019 Films-redesign post-mortem shows that 38% of users abandon a browse page before reaching the third fold. The honest move is *zero personalization on Phenomena*. Personalization is what Today is for; Phenomena is what the catalogue is for; My Record is what the personal record is for. Each tab should do *exactly one job* for the mass-market user. The HYBRID majority is being too clever by half — *For You* sounds good in a memo and adds scroll-cost in production.

Lucia and Riku acknowledge the risk; Helena's veto stamp is conditional on the rail title staying catalogue-y, not personal-y.

---

## 5. Implementation impact (~200 words)

**Files touched:** `src/pages/api/feed/personalized.ts`, `src/pages/explore.tsx`. ~80 lines net change.

**`src/pages/api/feed/personalized.ts`:**
- **Section 2 (For You) — rewrite.** Replace the `reports` query with a `phenomena` query: `SELECT id, name, slug, category, icon, ai_summary, primary_image_url, report_count FROM phenomena WHERE category IN (userInterests) AND status='active' ORDER BY report_count DESC LIMIT 8`. Change section `type` from `'reports'` to `'phenomena'`. Change `title` to `'Phenomena across your interests'`, drop `subtitle` (per V2 spotlight pattern).
- **Section 5 (Near You) — delete.** Remove lines 240-264 entirely from this endpoint. Add equivalent logic to `/api/feed/today` (or whichever endpoint feeds the Today swipe cards) as a new injectable card type or filter chip.
- **Section 6 (Because You Saved) — delete from this endpoint, mount on `/api/lab/...`** Move the query into the My Record data layer; surface as a new `from_your_saves` rail in `src/pages/lab.tsx`.

**`src/pages/explore.tsx` (lines 1410-1563):**
- No structural change to the `feedSections.map(...)` render — the API drives section presence. Once the API drops Sections 5+6, the render naturally omits them.
- Update `getSectionIcon('for_you')` to return a phenomenon/catalogue icon (e.g., `Sparkles` or `BookOpen`), not the heart/person icon if currently used (register fix).

**Risk:** trivial. No new tables, no migrations, no auth changes. The For You phenomenon rail uses the same `phenomena` table the Spotlight rail already queries.

---

**Editorial veto stamp (Helena):** APPROVED with title-copy hard requirement — *For You* rail MUST be titled in catalogue-y register ("Phenomena across your interests" / "Cryptids in the catalogue") never in personal-y register ("For you" / "Picked for you"). Documentary register holds.

**Word count:** ~1,290. Under cap.

*— The Phenomena Personalization Panel*
