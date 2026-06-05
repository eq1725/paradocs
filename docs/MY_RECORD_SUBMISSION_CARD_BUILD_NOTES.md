# My Record Submission Card — Tier 1 Build Notes

**Version:** V11.17.78 — submission card upgrade
**Spec:** `docs/MY_RECORD_SUBMISSIONS_PANEL.md` (Tier 1)
**Date:** 2026-06-05

---

## Files created

- `src/lib/lab/sign-user-video.ts` — shared signed-URL helper extracted
  from the two prior copies (`report/[slug].tsx` and `feed-v2.ts`).
  Exposes `signUserVideoUrl(report)` (single) + `signUserVideosForReports(reports)`
  (batch → `Map<reportId, video>`). Service-role keyed; 1h TTL per
  panel guidance. Defensive nulls on every failure path.
- `src/pages/api/lab/sign-user-videos.ts` — POST endpoint the client
  calls from `loadReports`. Verifies ownership against the authed
  user before signing; rejects requests for more than 50 ids.

## Files edited

- `src/pages/lab.tsx` — extended `UserReportRow` with `has_video`,
  `has_photo_video`, `status`, `discoverable`, plus a client-side
  `video` attachment; extended `loadReports` SELECT to include those
  columns and added the post-load fetch to `/api/lab/sign-user-videos`;
  forwarded the new fields into `experiencesForDossier` so
  DossierHeader can render the new chrome.
- `src/components/lab/DossierHeader.tsx` — rewritten to add the three
  Tier 1 elements per panel spec:
  - **A) Video poster** above the prose body (16:9, center play
    button, duration badge), tap to expand in-place to
    `<InlineVideoPlayer mode="watch" />`. Falls back silently to
    prose-only when no video or signing failed.
  - **B) "Read the full report" CTA** in the card footer using
    `next/link` (in-app routing, preserves /lab → /report → back
    loop); `min-h-[44px]` for mobile thumb tap target.
  - **C) Ownership chrome:** eyebrow swapped to
    "Documented by you · Mar 14, 2026"; status pill
    (Published / Pending review / Archived) with documentary
    palette (emerald / amber / gray-subtle, not neon);
    `<DiscoverabilityToggle />` mounted next to identity chrome.
  - Hooks-of-Rules compliance: `useState` + `useEffect` both at the
    top of the component, gate checks (`n === 0` / `!focused`)
    after the hook section.

## Mobile breakpoint considerations applied (≤414px)

- **Card outer padding** dropped from `p-5` to `p-4 sm:p-6` so the
  card never visually pinches inside the page's existing
  `px-4 sm:px-6 lg:px-8` rails. At 320px (iPhone SE) the card has
  ~280px usable interior width — sufficient for the eyebrow row,
  the 16:9 poster, and the title without horizontal overflow.
- **Eyebrow row** uses `flex flex-wrap items-center gap-x-2 gap-y-1`
  so on narrow viewports the status pill drops to a second line
  rather than truncating the "Documented by you · {date}" text or
  the pill itself. Both elements stay legible at 320px.
- **Video poster** uses `aspect-video` + `w-full` — maintains 16:9
  on every viewport, no cropping. Center play target is
  `w-14 h-14` (56px, ≥44px HIG minimum) on mobile and scales up
  to `w-16 h-16` at `sm:` for desktop. Duration badge uses
  `text-[11px]` with `tabular-nums` so timecodes don't reflow.
- **"Read the full report" CTA** uses `py-3` + `min-h-[44px]` so
  the entire 44px hit area extends beyond the text glyph. Icon
  pair sits left-aligned (thumb reach zone on mobile).
- **"Add another to your record" pill** also bumped to
  `min-h-[44px]` for consistency.
- All text uses fluid sizing (`text-sm sm:text-[15px]`,
  `text-lg sm:text-xl`); no fixed `px` font sizes.

## Verification

- `npx tsc --noEmit` — zero errors in `DossierHeader.tsx`,
  `lab.tsx`, `sign-user-video.ts`, `sign-user-videos.ts`. (Pre-
  existing errors elsewhere in repo unchanged.)
- `npx next lint --file src/components/lab/DossierHeader.tsx` —
  No ESLint warnings or errors.

## Commit message draft

```
V11.17.78 - My Record submission card: poster + report link + ownership chrome

Tier 1 of docs/MY_RECORD_SUBMISSIONS_PANEL.md. The DossierHeader card
now renders the artifact the user submitted, not just a prose excerpt.

- Extract sign-user-video helper from report/[slug].tsx and feed-v2
  into src/lib/lab/sign-user-video.ts (single + batch signatures).
- Add /api/lab/sign-user-videos endpoint so the client can request
  poster + playback signed URLs for its own video-bearing reports.
- Extend lab.tsx loadReports to select has_video, has_photo_video,
  status, discoverable; fetch signed video URLs after the rows load.
- Rewrite DossierHeader to add (A) video poster with center play +
  duration badge, tap to expand in-place via InlineVideoPlayer
  mode="watch"; (B) "Read the full report" CTA using next/link;
  (C) ownership chrome — "Documented by you · {date}" eyebrow,
  status pill (Published / Pending review / Archived), and the
  existing DiscoverabilityToggle mounted next to identity chrome.
- Mobile-first: card never overflows 320px, every tap target ≥44px,
  poster maintains 16:9 across breakpoints, eyebrow + status pill
  wrap cleanly on narrow viewports.
- All hooks unconditionally at the top of DossierHeader; gate
  checks after the hooks block per Rules of Hooks.
```

## Open question for founder

The panel's open question (in-place player vs modal lightbox) was
already resolved in favor of in-place per the spec's own default
recommendation — this build follows that recommendation.

**One smaller-grained question worth a thumbs-up before Tier 2:**
the status pill currently labels both `status='rejected'` AND
`status='archived'` as "Archived" (gray-subtle), matching the
documentary palette. The legacy `ManageSubmissionsPanel` paints
`rejected` red. If you prefer the rejected state to keep a louder
red signal on the dossier card (so the user notices their
submission was actually turned down, not merely archived), we can
split it into a fourth "Rejected" red-subtle pill. Default in this
build is the quieter merged label.
