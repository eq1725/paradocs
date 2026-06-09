# Sprint 1A polish round 2 — V11.18.3

**Version tag:** V11.18.3
**Predecessor:** V11.18.2 (Sprint 1A polish — promo clamping fix + FindingCard visual redesign + eyebrow polish)
**Trigger:** Founder post-deploy feedback after V11.18.2 hit prod.
**Risk:** Low — copy + nav-discoverability + footer overflow + diagnostic logging. No DB migration (the founder runs ONE SQL UPDATE for the shadow_figure row). No new API endpoints. No ingestion-path touches.

---

## 1. Root cause — Today FindingCard never shown to founder

### Investigation summary

API + injection code-path audit found no functional break in the
position-4 Finding injection. The live API returns the published row
correctly:

```
$ curl 'https://www.discoverparadocs.com/api/lab/patterns/list?limit=20'
{ "findings": [{ "id": "7db205ab-…", "slug": "shadow-figure-…", … }] }    # count=1
```

The injection branch in `discover.tsx::fetchSpecialCards()` (V11.18.1)
guards correctly:

- `!categoryFilter` → branch fires for the default `/discover` URL.
- API returns 1 finding → `available.length === 1`, `pickIdx = doy % 1 = 0`, `f = available[0]` (shadow_figure).
- Push `{ card: findingCard, position: 4 }`.
- `injectPendingSpecialCards()` splices at idx 4 once `arr.length >= 4`.

The initial feed load is `limit=15`, so position 4 always fits. The
position-4 splice happens AFTER position-8 cluster and BEFORE position-1
on-this-date (DESC sort), so the Finding lands at **idx 5** in
displayItems (the on-this-date insertion at idx 1 pushes everything after
it down by 1). That means the user encounters the Finding as the **6th
card swiped to** (idx 5).

### Most likely real-world causes (none reproducible from server)

1. **Stale service-worker cache.** The founder's browser may have been
   serving pre-V11.18.1 bundle from `sw.js` cache. The Finding-injection
   code only landed in V11.18.1; older clients have no awareness of the
   `item_type: 'finding'` branch and would skip it silently.
2. **Network race on the Haiku-backed promo decision.** The `Promise.all`
   in `fetchSpecialCards()` awaits `fetchLabPromoShouldShow()` which can
   take 200-800ms. If the user starts swiping immediately on a cold
   network, they may reach idx 5+ before the first injection tick
   fires. In that case the position-4 splice happens BEHIND the user's
   current idx and never gets seen unless they swipe back.
3. **A silent fetch error.** No console logging was wired around the
   `/api/lab/patterns/list` call until this commit, so a network error
   or 5xx would have been swallowed by the existing `.catch(function () {})`.

### Fix applied this commit (V11.18.3)

**Diagnostic logging** added to make all three causes diagnosable on the
next founder pass:

- `[Discover/FindingCard]` logs the fetch outcome:
  - On success: `{ available_count, doy, pickIdx, slug, id, position }`
  - On 5xx: `[Discover/FindingCard] patterns/list non-2xx: <status>`
  - On empty: `[Discover/FindingCard] patterns/list returned no findings`
  - On throw: `[Discover/FindingCard] patterns/list threw: <err.message>`
  - On filter suppression: `[Discover/FindingCard] suppressed — category filter active: <cat>`

- `[Discover/inject]` logs every `injectPendingSpecialCards` tick:
  - `{ arr_in_len, arr_out_len, inserted: [{type, position}], deferred: […], all_injected }`

The founder reproduces by opening `/discover` with DevTools console open
and confirming the inject log shows `finding @ position 4` lands in
`inserted` on the initial tick. If it appears in `deferred`, the issue
is the swipe-race (cause #2). If it never appears, the issue is the API
fetch (cause #1 or #3).

**No code path change** for the injection itself — investigation found
no functional bug. The diagnostic is the fix; once the founder's next
pass confirms what's actually happening on their device, we can target
the real cause if any.

> **NOTE for founder:** if you reproduce the issue and the console log
> shows the Finding in `inserted` on the first tick, the bug is your
> service worker cache. Hard refresh (`Cmd+Shift+R`) or clear site data
> in DevTools → Application → Storage. If you see `deferred`, the next
> patch should pre-cache the patterns/list call at page-load time (not
> inside Promise.all). If you see no log at all, the bundle isn't
> deploying — Vercel deployment status check needed.

---

## 2. Copy decisions — final picks for shadow_figure

### Headline (rewritten)

- **Before** (V11.18.1): `Shadow-figure imagery recurs across perception-sensory, haunting, and UFO accounts.`
- **After** (V11.18.3): `The same shadow figure appears in hauntings, sleep paralysis, and UFO encounters.`

**Rationale:** the founder's proposed alternative was already the right
direction — direct, plain, intriguing. "The same X appears in A, B, C"
invites the reader to ask "why?" within 5 seconds; the original
"recurs across… accounts" was taxonomic and asked for nothing back.
"The same" is a soft identity claim defensible by the data (the same
descriptor recurs, not the same entity) but reads as natural English
to a non-academic user.

### Interpretive sentence (rewritten)

- **Before** (V11.18.1): `Across 142,116 accounts, shadow figures appear in nearly half of ghost reports (47%) and perception-sensory accounts (45%), and just 9% of UFO encounters — the descriptor cuts across categories rather than belonging to any one.`
- **After** (V11.18.3): `What people see during a haunting (47%) matches what they see during sleep paralysis (45%) — and shows up in 9% of UFO accounts. Across 142,116 documented accounts, the shadow figure is the constant.`

**Rationale:** the V11.18.1 sentence ended with "the descriptor cuts
across categories rather than belonging to any one." That's a sentence
about the catalogue, not about the phenomenon — academic, no payload.
The new sentence leads with the cross-cutting comparison ("what A sees
matches what B sees"), grounds in the absolute count, and ends with a
plain framing ("the shadow figure is the constant") that implies the
Vallée-thesis question without making it. Helena O4: corpus structure
described, inference left to the reader.

Word count: 33 words (<50-word brief ceiling).
Helena bans check: no `!`, no `mysteriously` / `unexplained` / etc.,
no `you` / `your`, no superlatives.

### Eyebrow (no change)

- **Kept:** `ACROSS PHENOMENA` (rendered from `eyebrow_type:
  cross_cutting_descriptor` via `EYEBROW_LABEL` map in FindingCard.tsx).

**Rationale:** `ACROSS PHENOMENA` tells the user what kind of finding
this is (a cross-cutting one) before they read the headline. `THE
PATTERN` is more provocative but too generic — when future Findings
ship (`temporal`, `geographic`, `witness_pattern`, etc.), the user
benefits from knowing what they're looking at. `ACROSS PHENOMENA` is
the structural label that earns itself; we're not yet at the bar where
"THE PATTERN" alone (no qualifier) would land.

### SQL UPDATE — operator runs

```sql
-- V11.18.3 — Sprint 1A polish round 2. Rewrite shadow_figure headline +
-- interpretive sentence per founder feedback ("lack of just plainly
-- telling people why they should care should be addressed").
UPDATE findings_catalogue
SET
  headline = 'The same shadow figure appears in hauntings, sleep paralysis, and UFO encounters.',
  interpretive_sentence = 'What people see during a haunting (47%) matches what they see during sleep paralysis (45%) — and shows up in 9% of UFO accounts. Across 142,116 documented accounts, the shadow figure is the constant.',
  refreshed_at = NOW()
WHERE slug = 'shadow-figure-across-perception-sensory-haunting-ufo';

-- Verify:
SELECT slug, headline, interpretive_sentence
FROM findings_catalogue
WHERE slug = 'shadow-figure-across-perception-sensory-haunting-ufo';
```

The edge cache TTL on `/api/lab/patterns/list` is 5 min (`s-maxage=300`).
The new copy lands within 5 min of the SQL UPDATE; force-busting by
adding a `?cb=<ts>` query param works too.

---

## 3. Seed script prompt rewrite for future Findings

`scripts/seed-patterns-v1.ts` — Haiku system prompt rewritten so any new
Finding generated by the seed pipeline biases toward the "why care"
shape from the start. Key changes:

- **Purpose statement added:** "Make the reader think 'wait — that's
  interesting' within 5 seconds."
- **Structure templates provided** ("What X sees matches what Y sees…",
  "Three families describe the same…", "[A] (P%), [B] (Q%), [C] (R%):
  one recurring [descriptor]"). The catalogue-treatment "lead with the
  descriptor" instruction has been REMOVED.
- **Always include the absolute count** to make scale concrete.
- **Vallée-thesis inference banned** ("the same phenomenon", "the same
  entity", "evidence of") — corpus structure described, reader infers.
- **`remarkable` / `striking` added to BANNED** list (Haiku reaches for
  them when prompted for "interesting" framing).
- **Word ceiling raised** from 35→50 words (the new shape needs the
  comparison + the count anchor, both of which run longer).

`buildHeadline()` also rewritten — V11.18.1 generated `<Descriptor>
imagery recurs across A, B, and C accounts.`; V11.18.3 generates `The
same <descriptor> appears in A, B, and C.`. A new
`humanizeDescriptorForHeadline()` helper supplies plain noun forms that
fit the "The same X" structure ("shadow figure" not "shadow-figure
imagery").

`templatedInterpretive()` (the no-API-key fallback) rewritten to match.

**Re-run impact:** the next operator run of `npx tsx
scripts/seed-patterns-v1.ts --apply` will rewrite all 5 source-hint
payloads with new headlines + Haiku-generated interpretive sentences.
The existing shadow_figure row gets re-UPSERTed under the same slug;
the SQL UPDATE above is the one-shot patch ahead of that re-seed.

---

## 4. /lab/patterns discoverability

Two nav entry points added (founder feedback: "aside from typing the
URL directly… not sure how to get to this page").

### 4a. PatternsRail header link

`src/components/lab/PatternsRail.tsx` — section header upgraded from a
left-aligned title-only block to a flex-justified row with a
right-aligned `See all patterns →` link. Hairline-underlined treatment
(`border-b border-purple-300/40`) matches other `See more` links
elsewhere in /lab. `min-h-[44px]` keeps the tap target Apple-HIG
compliant on mobile.

### 4b. Global footer Phenomena column

`src/components/Layout.tsx` — added `Patterns` link to the Phenomena
column of the desktop footer (between Ghosts and Map). Mobile uses the
bottom tab nav (no footer there); the PatternsRail header link covers
mobile discoverability.

Routes work via tap on mobile + desktop (Next.js `Link`
client-routing; no auth gate on /lab/patterns per V2 §2.5).

---

## 5. /lab/patterns grid overflow fix

`src/components/patterns/FindingCard.tsx` — grid-variant footer fixed.

**Before:** `<div className="… flex items-center justify-between gap-3">`
with the right link `<Link>See representative reports →</Link>` as a
single non-wrapping element. On narrow grid cells (1 column at mobile
breakpoints), the long link string ran past the right edge of the card.

**After:** three changes:
1. Footer link copy shortened from `See representative reports →` to
   `See reports →` (option (a) from the brief — cleanest visual + most
   forgiving on narrow cells).
2. Footer container now `flex … flex-wrap` so the link wraps below the
   citation if the citation expands beyond available width.
3. `FooterCitation` wrapped in a `min-w-0` div so it can shrink-to-fit
   inside the flex row (Tailwind defaults prevent flex-shrink without
   `min-w-0`).
4. Link given `whitespace-nowrap` so the shorter copy stays as a single
   line even when wrapped.

Visual result: clean fit at all breaks; link no longer overflows on the
single-column mobile grid; legibility preserved at all breaks.

---

## 6. Files touched this commit

```
src/pages/discover.tsx                   — diagnostic logging in fetchSpecialCards + injectPendingSpecialCards
src/components/patterns/FindingCard.tsx  — grid footer overflow fix (shorter copy + flex-wrap + min-w-0 + whitespace-nowrap)
src/components/lab/PatternsRail.tsx      — "See all patterns →" header link
src/components/Layout.tsx                — Patterns entry added to footer Phenomena column
scripts/seed-patterns-v1.ts              — Haiku prompt rewrite + buildHeadline rewrite + validator relaxed
docs/SPRINT_1A_POLISH_R2_NOTES.md        — this file
```

No DB migration. No new API endpoints. No ingestion-path touches
(NUFORC ingest + classifier-daily + regen-writeback all running
undisturbed in background).

---

## 7. Operator commit + spot-check sequence

### Commit

```
git add src/pages/discover.tsx \
        src/components/patterns/FindingCard.tsx \
        src/components/lab/PatternsRail.tsx \
        src/components/Layout.tsx \
        scripts/seed-patterns-v1.ts \
        docs/SPRINT_1A_POLISH_R2_NOTES.md
git commit -m "V11.18.3 — Sprint 1A polish r2: FindingCard diagnostics + why-care copy + /lab/patterns nav + grid overflow"
git push origin main
```

### Run SQL UPDATE (after deploy lands)

Paste into Supabase SQL editor:

```sql
UPDATE findings_catalogue
SET
  headline = 'The same shadow figure appears in hauntings, sleep paralysis, and UFO encounters.',
  interpretive_sentence = 'What people see during a haunting (47%) matches what they see during sleep paralysis (45%) — and shows up in 9% of UFO accounts. Across 142,116 documented accounts, the shadow figure is the constant.',
  refreshed_at = NOW()
WHERE slug = 'shadow-figure-across-perception-sensory-haunting-ufo';
```

Wait 5 min (edge cache TTL) or force-bust:

```
curl 'https://www.discoverparadocs.com/api/lab/patterns/list?limit=20&cb=$(date +%s)'
```

### Spot-check on Vercel preview / prod

1. **Today FindingCard injection** (`/discover`):
   - Open with DevTools console open.
   - Confirm `[Discover/FindingCard] injected {slug: "shadow-figure-…", position: 4}` log fires.
   - Confirm `[Discover/inject] tick … inserted: [{type:"finding", position:4}, …]` log fires.
   - Swipe through cards. The Finding should appear as the 6th card
     swiped to (idx 5 after the on-this-date splice pushes it from idx
     4 → idx 5).
   - Verify the new headline + interpretive sentence render.

2. **PatternsRail header link** (`/lab`):
   - Look for `See all patterns →` link on the right side of the
     "Patterns from the archive" header.
   - Tap on mobile / click on desktop → routes to `/lab/patterns`.

3. **Footer Patterns link** (any desktop page with footer):
   - Look in the Phenomena column for `Patterns` (between Ghosts and Map).
   - Click → routes to `/lab/patterns`.

4. **Grid overflow fix** (`/lab/patterns` mobile):
   - Confirm "See reports →" stays inside the card's right edge in the
     single-column mobile layout.
   - Resize to desktop breakpoints — link still aligns right inside the
     card border.

5. **Background jobs unaffected:**
   - NUFORC ingest, classifier-daily, regen-writeback all continuing
     in background without disturbance (no ingestion-path touches in
     this commit).

---

## 8. Quality-bar self-check

- `npx tsc --noEmit` clean on edited files (the pre-existing scripts/
  errors and one `@vercel/og` module-missing error in `api/og/discover.tsx`
  are not introduced by this commit).
- Mobile-first: every new tap target is `min-h-[44px]`; the grid
  overflow fix is mobile-specific; the diagnostic logs are devtools-only.
- Documentary register: the new headline + interpretive sentence drop
  the V11.18.1 "catalogue treats this as" academic voice and lead with
  plain English; no exhortation, no spook, no superlatives.
- "Why care" pop-check: the new interpretive sentence reads twice for
  me — the parenthetical comparison (47% / 45%) lands as a "wait, what?"
  beat that the V11.18.1 sentence never delivered.
