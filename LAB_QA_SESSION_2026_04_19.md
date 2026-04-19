# Lab QA Session — April 17–19, 2026

**Branch:** main
**Commits range:** `74faf363` → `37b82489` (28 commits, ~3,000+ LOC net)
**Deploy:** beta.discoverparadocs.com
**Workflow:** Claude-Anthropic pair with Chase. Chase QAs live after each Vercel deploy; feedback drives the next iteration.

> Every commit in this session is live on beta. Chase has been iteratively QAing and the assistant has been shipping focused polish commits per round.

---

## What shipped

### Bug fixes to unblock usage
- **Case-file bootstrap** — `CreateCaseFileModal` exported from `CaseFileBar`; `LabCasesTab` now has a persistent "+ New case file" header button + empty-state primary CTA. Users can create their first case file without already having one.
- **Detail panel stale-reference bug** — after a case-file membership toggle, the parent refetches `userMapData`, but `selectedEntry` held a pre-refetch EntryNode. Added a `useEffect` in `LabSavesTab`, `LabCasesTab`, and `LabMapTab` that syncs `selectedEntry` by id on every `userMapData` change. Also fixes note edits, tag changes, and verdict changes reflecting immediately.
- **Duplicate footer on `/lab` and `/profile`** — `_app.tsx` already wraps all non-standalone pages in `<Layout>`, but `lab.tsx` and `profile.tsx` also wrapped their own content in `<Layout>`. Stripped the inner wrappers.
- **Reader toggle missing on ufonews.co saves** — extended news/blog URL pattern in `extract.ts` to catch `/post/`, `/blog/`, `/p/` (Wix/WordPress/Ghost/Blogger).

### Patterns surface overhaul
- Replaced the scattered `InsightCardInline` grid with a single canonical `PatternsLane` at the top of `/lab?tab=saves`.
- Built `PatternCard.tsx` — one card component for both library insights and recommended reports, shared icon + color vocabulary.
- Expanded `detectInsights` in `constellation-data.ts`:
  - Dropped generic `tag_cluster` + exact-match `location_cluster` + `verdict_drift` + `category_compelling` (all "obvious count" tautologies).
  - Added `historical_wave` (cross-references user saves against `HISTORICAL_WAVES` corpus — 11 curated waves anchored to encyclopedia entries in `phenomena-seed.json`).
  - Added `tag_cooccurrence` (category-plus-tag correlation, ≥4 saves, ≥60% ratio).
  - Added `geographic_density` (proximity clustering via haversine, 80km radius).
  - Kept `temporal_cluster`.
- New `/api/constellation/related-reports` endpoint — builds a 180-day research footprint (top categories, countries, tags), returns up to 10 recent unseen Paradocs reports with match-reason labels.
- Wikilink matching (`matchesWave`) relaxed to accept tag/title/encyclopedia-anchor signal, not only `eventDate`-in-window — so Chase's Roswell save triggers the 1947 wave card without needing a parsed event date.

### Note editor: textarea → Tiptap WYSIWYG
- Shipped in stages: textarea → Write/Preview toggle → full Tiptap/ProseMirror editor.
- **Storage unchanged** — still markdown via `tiptap-markdown` roundtrip, so every non-editor surface (`NodeDetailPanel`, backlinks, card preview, digest email, `markdown-lite.ts`) keeps working.
- Toolbar is now state-aware: Bold/Italic highlight when selection already has that mark. Click to toggle, Word-style.
- Wikilinks:
  - `[[Title]]` syntax preserved end-to-end.
  - Custom ProseMirror decoration paints a cyan chip over every `[[…]]` match inside the editor; brackets hidden at zero-width so visual chip shows only the title.
  - Rendered-view chip in `markdown-lite` pinned to absolute px (13px font, 1/6px padding, rounded-md) so it looks identical in editor + detail panel + card preview.
  - `tiptap-markdown` escapes `[` as `\[` — we unescape on save and tolerate escaped brackets on render, so existing notes + new saves all resolve.
  - Toolbar icon swapped `Sparkles` → `AtSign` → `FolderSymlink` ("link to another item in your library").
- External link insert (`[text](url)`) — when selection is empty, insert URL as text + link mark (previously `setLink` was a no-op).
- Modal resized: `h-[85vh]`, `max-w-4xl`, full-width textarea, spellcheck on, empty-state cheat sheet.

### Terminology cleanup
- "Research Hub" (legacy) → "Lab" everywhere user-facing. Backend file paths + DB column names intentionally untouched.
- "Wikilinks" term dropped from empty-state copy and editor footer — describe the behavior (`[[save title]]`) not the convention.

### Cards & thumbnails
- `CategoryHero` — image-less saves (typical for internal Paradocs reports without `primary_image_url`) now render as a diagonal-gradient hero tinted by category accent color + radial glow + grid-paper texture + large centered glyph. Category theme color table is safelisted for Tailwind's JIT.
- Card note previews now go through `renderNotePreview` (inline-only flatten of first paragraph) so wikilinks render as chips without brackets, matching editor + detail panel.

### Lab Map — full port to MapLibre GL
Replaced react-leaflet entirely. The Lab map now shares the same stack as Explore.

**Tier 1 — parity**
- MapLibre GL WebGL rendering
- Basemap switcher (dark / satellite / terrain), persists via localStorage
- Density heatmap toggle over user saves

**Tier 2 — polish**
- NavigationControl + GeolocateControl
- Animated `flyTo` on cluster click; initial `fitBounds` with padding + `maxZoom`
- Hover-grow on user pins

**Tier 3 — differentiation**
- Timeline scrubber (dual-thumb year-range slider). Range aligns with Explore's `TIMELINE.min` (1400) → current year when global context is on; falls back to user's save-year range when off. Filters both user saves AND global backdrop pins.
- Historical wave overlays — faint cyan dashed-ring polygons render around any `HISTORICAL_WAVES` centroid with at least one user save inside its window.
- Global-context backdrop — toggle to render all Paradocs reports as neutral slate dots under the user's saves. Loads lazily via `GlobalContextLoader` (child component) so the `useViewportData` fetch only runs when the user opts in. Dots are interactive: hover grows them to 6px with a cyan ring + Popup showing title/location/year; click opens `/report/{slug}` in a new tab.

**Fixes along the way**
- Paradocs-report saves weren't appearing: Supabase's FK join returned `report` as either object or `[object]` depending on inference. Added `unwrapReport()` + `toNum()` helpers in `user-map.ts` applied to both `constellation_entries` and `saved_reports` paths.
- External artifact saves explicitly stay off the map (no auto-placing news articles on their subject's location).
- Empty state explains which save class is responsible: "N external URL saves… save a Paradocs report with coordinates".

### Detail panel polish
- z-index bumped to `z-[1000]` so it never sinks behind Leaflet panes / MapLibre panes.
- Header leads with entry title (line-clamp-2); category icon + label moved to a sub-label beneath. Previously the category chip read like the primary title.
- Source CTA link and verdict chip share a `flex gap-x-4` row (they used to sit as bare siblings under `space-y-4`, which doesn't separate inline-flex siblings).
- `[[` markers from legacy stored notes: `markdown-lite` normalizes `\[\[…\]\]` → `[[…]]` on render so existing buggy-encoded data still resolves.

---

## Files changed (high level)

```
src/lib/historical-waves.ts                              NEW
src/lib/markdown-lite.ts                                 HEAVY EDIT
src/lib/constellation-data.ts                            HEAVY EDIT
src/lib/hooks/useLabData.ts                              edit (title, lat/lng plumbing)
src/components/dashboard/PatternCard.tsx                 NEW
src/components/dashboard/PatternsLane.tsx                NEW
src/components/dashboard/RichNoteEditor.tsx              NEW  (Tiptap editor)
src/components/dashboard/NoteEditorModal.tsx             REWRITTEN
src/components/dashboard/NodeDetailPanel.tsx             HEAVY EDIT
src/components/dashboard/ConstellationListView.tsx       HEAVY EDIT (CategoryHero + wikilink parity)
src/components/dashboard/CaseFileBar.tsx                 edit (hideCreate + exported modal)
src/components/dashboard/LabSavesTab.tsx                 edit (PatternsLane integration, sync effect)
src/components/dashboard/LabCasesTab.tsx                 edit (scoped insights + sync effect + bootstrap)
src/components/dashboard/LabMapTab.tsx                   edit (hideCreate + sync effect)
src/components/dashboard/LabGeoMap.tsx                   REWRITTEN (MapLibre port)
src/components/dashboard/PasteUrlButton.tsx              edit (AI suggestion redesign)
src/components/LogToConstellation.tsx                    edit (copy: Research Hub → Lab)
src/pages/api/constellation/user-map.ts                  edit (unwrapReport, toNum, external no auto-geo)
src/pages/api/constellation/related-reports.ts           NEW
src/pages/api/constellation/artifacts/extract.ts         edit (news URL heuristic)
src/pages/lab.tsx                                        edit (drop duplicate Layout)
src/pages/profile.tsx                                    edit (drop duplicate Layout)
src/pages/report/[slug].tsx                              edit (copy: Research Hub → Lab)
src/styles/globals.css                                   append (Tiptap editor prose styles + wikilink chip)
package.json + package-lock.json                         adds Tiptap stack
```

---

## Current open QA threads

1. **Lab map QA continues** — basemap switcher, heatmap, global context all working on Chase's last test. Expect iteration on pin styling, historical wave visibility at various zooms, and potentially adding the remaining MapContainer parity features (cluster expansion zoom animation quality, etc.).
2. **Patterns lane polish** — want to verify all pattern types render correctly once Chase has enough save data to trigger them (historical wave, tag_cooccurrence, geographic_density).
3. **Note editor paste behavior** — no one has tested paste-from-Word/Docs into Tiptap yet.
4. **Mobile map layers panel** — controls panel is absolutely positioned; check if it clashes with other mobile controls on small viewports.
5. **Case file features remaining** — public sharing via `public_slug` exists; cross-user pattern detection on shared case files is still pending (task #65).
6. **Cases tab visual polish** — grid + detail view haven't gotten the same iteration love as Saves/Map.

---

## Deferred / known gaps

- Cross-user pattern detection (task #65).
- Mini knowledge-graph per case file (task #62).
- Nightly Haiku pass for emergent patterns (framework exists via `related-reports`, LLM pass still deferred).
- Pattern lane on the Cases tab uses `PatternCard` but no related-reports strip yet.
- Legacy `/dashboard/research-hub` route + `research-hub/*` components still live in the repo but aren't reachable from nav. Cleanup pass pending.
- `react-leaflet` + `leaflet` packages still in `package.json`; nothing imports them now. Safe to drop in a follow-up.

---

## Workflow conventions established this session

- **Every commit pushed immediately** — Chase deploys via `git push origin main` → Vercel auto-deploys → Chase QAs.
- **Quoted paths in shell** when a filename contains glob characters: `'src/pages/report/[slug].tsx'`.
- **Never `cd` with placeholder paths** — Chase is already in the paradocs dir.
- **Typecheck before committing** — `npx tsc --noEmit` filtered by touched files.
- **Commit messages use HEREDOC** so multi-line bodies survive shell quoting cleanly.
- **Defer large refactors** that introduce new deps until Chase explicitly says "do it" (e.g., Tiptap was scoped as two-path option before commit).
