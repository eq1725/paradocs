# My Record — Submissions Panel Review

**Surface:** the spine of `/lab` — the user's own submitted reports
**Trigger:** founder feedback — "Both reports I've submitted as @chase have videos
attached and proper report pages but the My Record tab has no preview of the
videos or even a link to the proper report pages."
**Date:** 2026-06-05
**Status:** Spec ready for Tier 1 implementation

---

## 1. TL;DR

- **The user's own report is rendered as prose, not as an artifact.** The
  `DossierHeader` quotes the description and prints city/year, but there is
  zero visual representation of the *thing the user actually submitted* —
  no video poster, no thumbnail, no "View report" link, no slug-aware
  affordance.
- **The signed video URLs are already being produced** for `/report/[slug]`
  (see `src/pages/report/[slug].tsx` L223-270) — My Record just doesn't ask
  for them. The plumbing exists; this is a surfacing problem, not an
  engineering problem.
- **The Manage Submissions panel hides the only existing slug link** behind
  a "Manage your submissions" pill in a modal — invisible to anyone who
  doesn't already know to look for it.
- **Recommended fix is a single "Your submission" card embedded inside the
  Dossier:** poster frame + play overlay + 1-line AI summary excerpt +
  "View full report" CTA + an ownership eyebrow ("Documented by you ·
  Mar 14, 2026").
- **Tier 1 (this week) is a half-day of work.** Tier 2 (hover preview,
  inline player) is an evening. Tier 3 (cross-submission gallery) is a
  V3 follow-up.
- **One open question for founder** at the bottom — whether the inline
  player should expand the dossier card or open a modal lightbox.

---

## 2. Audit summary — what currently exists

I read the four load-bearing files and the page composition:

**`DossierHeader.tsx`** (the spine, per V3 §3) renders for each user
experience:
- A purple-bordered card with a generic `<UserIcon>` avatar (NOT a video
  thumbnail or poster)
- An eyebrow: `Your experience`
- A title (from `report.title || phenomenon_type.name || category`)
- A facts row: `MapPin + city/state`, `Calendar + year`
- A Haiku-synthesized paragraph (the "your account sits in the wider Archive…"
  line)
- The verbatim `description` excerpt (capped at 480 chars), styled in
  quote marks
- A bottom-centered "Add another to your record" pill linking to `/start`

**What it does NOT render:**
- ❌ No video poster, no thumbnail, no play affordance
- ❌ No link to `/report/[slug]` — the user cannot reach their own
  published report from My Record by clicking the dossier
- ❌ No status badge ("Published" vs "Pending review") on the spine card
- ❌ No date-submitted, no submitted-by identity ("@chase", avatar)
- ❌ No discoverability state ("Visible in the wider archive" vs "Private")
- ❌ No edit affordance on the spine — only via the buried Manage panel
- ❌ Nothing acknowledges the report has media attached

**`ManageSubmissionsPanel.tsx`** is the *only* current path to
`/report/[slug]`. It's:
- Triggered by a `text-[10px] uppercase tracking-widest` pill that reads
  "Manage your submissions" — visually equivalent to a footer link
- Opens a slide-up modal with each submission as a row
- Row title is `<Link href={'/report/' + r.slug}>` *only when status is
  approved/published* — pending submissions have no link at all
- No video preview, no thumbnail, plain category-icon tile on the left

**`EmptyDossier.tsx`** (the n=0 ghost) sets the visual expectation for
what a submission "looks like" — a quote bubble with location + year
facts. The current n≥1 dossier is functionally identical to this
ghosted mock with the opacity dialed up. There is no payoff in the
n=1 state vs. the empty state — same layout, same widgets, same
information density. The user's reward for submitting is replacing a
placeholder quote with their own.

**`reports` schema** already carries: `has_video` (boolean) and a sibling
`report_videos` table with `storage_bucket`, `storage_path`,
`transcript_segments`, `transcript_lang`, `duration_sec`. The signed-URL
pattern is established at `src/pages/report/[slug].tsx` L223-270 and at
`src/pages/api/discover/feed-v2.ts`. `InlineVideoPlayer.tsx` already
supports both `feed` and `watch` modes. **All of the parts exist.**

**Visual hierarchy on /lab today:**
1. Dossier card (prose, no media, no link to own report)
2. Cross-experience header (n≥2 only)
3. Hints rail (catalogue observations, not user's work)
4. Temporal strip
5. Geographic surface
6. Paywall / Named-match
7. Radar
8. Match list (links to other people's reports, with `Has evidence`
   chips and "View full report" CTAs — i.e., **every report the user
   doesn't own gets a richer card than the one they DO own**)
9. Manage panel (hidden behind tiny pill)

This last point is the violation: the *match list* has CTAs and evidence
chips that the user's own dossier lacks. The spine is shorter than the
ribs.

---

## 3. Panel commentary

### Voice 1 — Mass-market UX designer (Notion / Pinterest / Instagram)

What's missing is the *artifact*. Look at how Notion renders a page in a
sidebar peek: the first thing you see is the page's icon, then its title,
then the first line of content. Look at how Pinterest renders a pin you
created: the image is the card. Look at how Instagram renders your own
post in your grid: the media IS the surface. We have inverted that here —
the user is shown a text *description* of their experience, the way a
researcher would render an archival index entry, not the way a consumer
product would render the user's work.

The fix is to lead with the video poster. A 16:9 (or 9:16, matching
`InlineVideoPlayer`'s default aspect) thumbnail with a play-overlay
button, sized to fill the dossier card's hero zone. Beneath it, the
title and a single line of subtext: location · year · "Documented by
you". The current prose treatment — synthesized paragraph + verbatim
excerpt — moves *below* the media, where it belongs. The video isn't a
piece of evidence here; it's the medium of the submission. Show it.

### Voice 2 — User psychology / engagement specialist (Strava model)

A Strava activity, after upload, gives you four things in 200ms: the
route polyline, the time/pace headline, the kudos-able state, and the
shareable link. Each of those exists to make the user think "this is
*mine*" before they're asked to do anything else. The current dossier
does none of that. It tells the user "here is how your account sits in
the wider Archive" — which is research context, not ownership context.

The fix is small but load-bearing: the eyebrow has to change from
"Your experience" to something that names the *act*: "Documented by
you · March 14, 2026" — the verb tense matters. "Your" is possessive;
"Documented by you" is attributional, which is what archive products
do (Smithsonian, Library of Congress catalog entries credit the
collector). It also creates the substrate for later social proof —
once peer DMs ship, we can show "Documented by you · 3 other people
have read this." That's the ownership-attachment loop.

### Voice 3 — Retention strategist (Duolingo / journaling apps)

The retention question for My Record is not "did the user open the
tab today" — it's "did they recognize this as theirs in three months."
Day Out The Window, Day One, Reflectly, and Strava all win the same
way: when the user comes back, the first thing they see is something
they made. Not a streak counter, not a recommendation feed — their
work, dated, with media. That triggers an identity loop (Eyal: "I
am the kind of person who documents experiences").

The submission card must be the visual hero on every return visit.
The "Add another" CTA stays below it (V3 §3 was correct on that). The
video poster carries the recognition load — three months later, the
user will not remember a paragraph excerpt, but they will remember
the still frame they shot. The play affordance is the daily-return
trigger: clicking play is a low-cost dopamine hit that re-cements
ownership. The fact that there's a public `/report/[slug]` URL is the
identity payoff — "this thing I made exists in the world."

### Voice 4 — Information architect

The page composition has an IA inversion. The match list (other
people's reports related to the user's) renders richer cards than
the dossier (the user's own report) — both functionally and visually.
A user scanning /lab cannot tell, in the first 2 seconds of cognitive
load, which card represents *their* submission and which cards represent
the archive's response to it. That ambiguity erodes the "spine"
metaphor V3 §3 was meant to establish.

The repair is two-sided: (a) the dossier card needs the same media +
CTA grammar as the match list cards, so the eye understands "this is
a report-shaped object;" and (b) the dossier card needs ownership
chrome the match list cards lack — the brand-purple top border, the
"Documented by you" eyebrow, the status badge — so the eye understands
"this one is mine." The grammar should be the same; the chrome should
differ. That's how a museum membership card differs from a museum
visitor card: same layout, different border color.

### Voice 5 — Ancestry-style personal archive expert

Ancestry, FamilySearch, MyHeritage, and the Internet Archive's
patron page all share one anchor: every artifact the user contributes
gets a *citation*. Title, date acquired, contributor, status. The
dossier today reads more like a literary essay (synthesized paragraph,
verbatim quote in italics) than a catalog entry. That's pleasant but
it isn't building the user's archive. The archive-building loop is:
contribute → see your contribution cataloged → see it linked to the
larger collection → contribute again because the catalog grew.

The submission card needs to be a *catalog entry first, essay second*.
Top: media + title + ID-shaped subtext ("Report PR-3F8A · Mar 14 2026
· Published"). Middle: media-aware excerpt. Bottom: "View full report"
(canonical link, breaks to /report/[slug]) and a quieter "Edit
submission" affordance. The synthesized paragraph stays — it's the
"how your account sits among the others" line, which is the *linking*
half of the loop — but it moves below the catalog entry, not above it.

### Voice 6 — Brand / Editorial voice

Documentary, archival, museum-membership. The video poster pattern
that fits this register is *not* the Pinterest hover-preview (too
restless), *not* the TikTok auto-loop (too playful), and *not* the
YouTube card with metadata overlays (too platform). The reference
is the BBC Archive interface or Criterion Collection: a still frame
with a quiet play button center-bottom, no auto-play, no looping.
Type treatment: thin sans-serif metadata above the frame, slab/serif
title beneath. The play action opens an inline player (not a
fullscreen modal); the player matches `InlineVideoPlayer`'s `watch`
mode, which is already coded for exactly this use case.

The CTA copy must be plain. Not "Open report" (verb, salesy). Not
"View on Paradocs" (platform-name-as-product). The phrase is "Read
the full report" — read is the documentary verb, full is the
honest qualifier. The same logic governs the eyebrow: "Documented
by you, March 14, 2026" reads like a museum label. "Submitted by
@chase on 3/14" reads like a Reddit post. We are a museum, not a
forum.

---

## 4. Recommended design — concrete spec

### A. The submission card (per user-submitted experience)

```
┌────────────────────────────────────────────────────────┐
│  DOCUMENTED BY YOU · MARCH 14, 2026 · PUBLISHED        │  <- eyebrow, brand-purple
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │                                                  │  │
│  │              [VIDEO POSTER FRAME]                │  │  <- 16:9 or 9:16 per source
│  │                                                  │  │
│  │                     ▶                            │  │  <- center play overlay
│  │                                                  │  │
│  │                              0:47                │  │  <- duration bottom-right
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  Three lights moving in formation over Lumberton       │  <- title (slab/serif)
│  ◷ Lumberton, NC    ⌚ 1998    ✦ UFOs / triangle      │  <- facts row
│                                                        │
│  "Three lights moving in formation, low above         │
│   the trees. No sound. Held position for nearly       │  <- excerpt (gray, italic)
│   a minute before sliding northwest."                  │
│                                                        │
│  Your 1998 Lumberton triangle is one of 23 triangle   │
│  sightings in central North Carolina between 1990     │  <- synthesized paragraph
│  and 2000…                                             │     (kept from V3)
│                                                        │
│  ─────────────────────────────────────────────        │
│  → Read the full report           ⚙ Edit   👁 Visible │  <- CTAs + visibility toggle
└────────────────────────────────────────────────────────┘
```

**Component data shape (drop-in on existing `experiencesForDossier`):**

```ts
interface SubmissionCard {
  id: string
  slug: string                  // for /report/[slug] link
  title: string
  status: 'pending' | 'approved' | 'published' | 'rejected'
  created_at: string            // for "Documented by you · Mar 14, 2026"
  resolved_year: number | null
  location_label: string
  phen_family_label: string
  description_excerpt: string   // 280 char cap
  synthesized_paragraph: string | null
  has_video: boolean
  video?: {
    playback_url: string        // signed, 4h TTL
    poster_url: string | null
    duration_sec: number | null
    segments: TranscriptSegment[] | null
  } | null
  visibility: 'archive' | 'private'
  user_handle?: string | null   // optional — for "@chase" eyebrow variant
}
```

**Data-fetch change (lab.tsx):** the existing reports query at
`loadReports()` selects 16 columns from `reports`. Add `has_video`,
`slug`, `status`, and `visibility`. Then, **for each row where
`has_video=true`**, mirror the signed-URL block from
`src/pages/report/[slug].tsx` L223-270 — fetch the latest `ready`
`report_videos` row, sign the playback + poster URL with the
service-role key (4h TTL), and attach `video: {...}` to the row.
Recommend extracting this into `src/lib/lab/sign-user-video.ts` since
it's about to be the second copy. (Third if you count `feed-v2`.)

### B. Where the card lives in page composition

The card *replaces* the current `DossierHeader` body. The strip and
the "Add another" pill stay exactly where they are.

- **n=1:** card is full-bleed at the top of the page, takes the visual
  space currently occupied by description + synthesized paragraph
- **n=2-4:** experience strip remains above, focused card below.
  Strip pill upgrades: each pill gets a tiny corner badge if the
  experience has video (small play glyph), so the user can scan
  which submissions have media. This is V3-faithful behavior:
  same chrome, more affordance.
- **n=5+:** same as 2-4 with horizontal scroll on the strip (already
  built). At n=15+ surface a filter — already speced.

### C. Video preview pattern

**Static poster + play overlay → click expands inline below the
metadata** (NOT a modal). Specifically:
1. Initial state: poster frame as `<img>`, center-bottom play button
   with `BorderColor: white/30`, duration badge bottom-right. No
   network request for the video file (matches `InlineVideoPlayer`'s
   lazy-load contract).
2. Click → swap `<img>` for `<InlineVideoPlayer mode="watch" />` in
   the same DOM slot, autoplay on (`watch` mode default is don't
   autoplay; we override after explicit click). Captions on by
   default if `segments` is present.
3. Closing returns to poster. This is the BBC Archive / Criterion
   pattern — quiet, deliberate, no restless hover-preview.

**Reject auto-play-muted-on-hover** for the spine card. That pattern
suits a feed (`InlineVideoPlayer` `feed` mode) where the user is
browsing. The dossier is identity space, not browsing space — the
correct register is "this is mine, I'll play it when I want to."

### D. "View full report" affordance

- **Primary:** "→ Read the full report" — text link, brand-purple,
  bottom-left of card footer. Routes via `<Link>` (in-app, preserves
  back stack). The user lands on `/report/[slug]` and their browser
  back returns them to My Record with `focus=` preserved.
- **Secondary (mobile only):** the card title is also tappable to the
  same link. Web-app convention.
- **Do not** open in new tab. The /lab → /report → back loop is
  exactly the journaling-app return loop; preserving it is the
  retention play.
- **For pending/rejected status:** the link is replaced with a status
  pill ("Pending review · we'll surface this when approved") and a
  "Read your submission" link to a private preview route. Tier 2.

### E. Identity / ownership cues

Three small additions, in priority order:
1. **Eyebrow swap:** "Your experience" → "Documented by you ·
   [date]" — date formatted as `MMM D, YYYY` from `created_at`.
2. **Status pill** in the eyebrow row, right-aligned: `Published`
   (emerald), `Pending review` (amber), `Rejected` (red). Mirrors
   the existing pattern in `ManageSubmissionsPanel.tsx` L332-339.
3. **Visibility toggle** in the footer, next to Edit. Wires through
   to the existing `DiscoverabilityToggle` component already imported
   on this page.

No avatar, no handle in the eyebrow. The user knows it's theirs;
attribution noise breaks the museum register. Handle ("@chase") only
surfaces in places where other people will see this card —
public report page, named-match offers, peer DM — never on the
private My Record surface.

---

## 5. Tiered execution plan

### Tier 1 (this week, ~half-day)

**Goal:** the founder's two reports surface video posters + report
links on his next /lab visit.

1. **`lab.tsx` `loadReports()`** — add `has_video`, `slug`,
   `status`, `visibility` to the `select` list.
2. **New `src/lib/lab/sign-user-video.ts`** — extracts the signed-URL
   block from `report/[slug].tsx` into a reusable helper that takes
   an array of `report_id`s and returns a `Map<reportId, video>`.
3. **`lab.tsx`** — after `loadReports` completes, call the helper
   for the subset with `has_video=true`. Attach result to the
   reports state.
4. **`DossierHeader.tsx`** — extend `ExperienceForDossier` interface
   with the new fields. Above the existing prose body, render the
   new media block:
   - Poster `<img>` (when `video.poster_url` present)
   - Play overlay button (sets local `playing=true` state)
   - Duration badge
   - Status pill in the eyebrow row
   - Eyebrow text swap to "Documented by you · {date}"
5. **`DossierHeader.tsx` footer** — add "→ Read the full report"
   `<Link href={`/report/${slug}`}>` when `slug` and
   `status === 'approved' || 'published'`. Bottom-left of the card,
   inside a `border-t pt-3` footer block.
6. **Multi-experience strip** — add a tiny `Play` glyph to pills
   where `has_video=true`. 8x8 icon, brand-purple, bottom-right of
   the pill.
7. **Typecheck + smoke test on Chase's account.**

### Tier 2 (this month, ~1 evening)

1. **Inline `InlineVideoPlayer` swap** — click play, replace poster
   in place with the player in `watch` mode. Captions on by default.
2. **Pending-state preview link** — separate `/lab/preview/[id]`
   route for status≠approved.
3. **Edit affordance on the card** — surfaces the existing
   `EditReportModal` from `ManageSubmissionsPanel`. Lifts the modal
   so the card can open it directly without going through Manage.
4. **`DiscoverabilityToggle`** wired into the card footer alongside
   Edit / Read full report.
5. **Hover-state on desktop only:** poster gets a subtle 102% scale
   on hover, play overlay brightens. Documentary register.

### Tier 3 (V3 follow-up, deferred)

1. **Cross-submission gallery view** — at n≥5, optional grid view
   that shows all the user's submissions as poster tiles (Instagram
   profile grid pattern, archival treatment). Toggles in the
   experience-strip area.
2. **Per-submission insights surface** — "This submission has been
   read 47 times, resonated by 3" — once peer DMs and resonance
   counts are normalized.
3. **Submission-to-submission similarity** — when a user's two
   submissions are themselves matched ("Your 1998 Lumberton triangle
   shares 3 dimensions with your 2014 Pembroke account"). The
   data is already there (constellation match self-cross).

---

## 6. Open question for founder

**Q1.** For the video play interaction — confirm the recommendation
of *click-to-expand-in-place* (poster swaps to inline `<video>` in
the same DOM slot) versus *click-to-open-modal-lightbox*. Panel
consensus was strongly in-place (museum register, preserves scroll
position, matches `InlineVideoPlayer` `watch` mode). Lightbox would
fit better only if you anticipate users wanting to compare video
to the synthesized paragraph side-by-side, which feels like a
research-grade Pro affordance, not a default. **Default
recommendation: in-place.** Confirm or override.

*(No other blocking questions — every other decision in this memo
follows established V3 patterns or extends existing code.)*

---

*End of memo. Tier 1 ETA: half a day. Tier 1 unblocks the founder's
specific complaint and brings the user's own submission to parity
with the cards rendered for everyone else's reports.*
