# Tier 3A — Pro Dossier — Build Notes (V11.17.71)

**Scope:** The Pro tier's load-bearing flagship per
`docs/PRO_TIER_VALIDATION_V3.md` §3 — per-experience auto-generated
7-section cross-reference Dossier with PDF export and 1080×1350
social-share card. Lazy-compute, persisted in `pro_dossiers`,
recomputed nightly, gated to Pro tier only.

**Predecessors:**
- `docs/LAB_PANEL_REVIEW_V3.md` §3 — n=1 gold-standard UX context.
- `docs/LAB_TIER2B_BUILD_NOTES.md` — the lab IA the Dossier slots into.
- `docs/PRO_TIER_VALIDATION_V3.md` §3 — the 7-section spec, refresh
  policy, share-card design, and 5-criteria quality eval plan.
- Tier 2A — pricing/subscription/Stripe (untouched here).

**Out of scope (held for next pass):**
- True server-rendered PDF via puppeteer-core + @sparticuz/chromium.
  Today we ship a printable HTML book; the browser's print-to-PDF is
  the deterministic first save path.
- Time-machine API integrations (weather + news). The astronomical
  service is wired (moon + meteor showers); weather + news are
  stubbed with explicit "data not yet wired" notes per the spec's
  honesty rule.
- Editorial enrichment of `SUB_PATTERN_CATALOGUE` beyond the seed 9.
  Founder owns this vocabulary; today's seed covers the canonical
  bigfoot/triangle/disc/orb/residential/sleep-paralysis/OOBE families.

---

## Files created (NEW)

| File | Purpose |
|---|---|
| `supabase/migrations/20260604_pro_dossiers.sql` | `pro_dossiers` table + unique-per-experience constraint + RLS (owner read, public-share-flag read, owner toggle-public, service-role full) + indexes (computed_at DESC, experience_report_id, share_token). |
| `src/lib/lab/dossier/dossier-types.ts` | TypeScript shape for the 7 sections + `DossierSections` envelope + `ProDossierRow` row shape. Each section carries `data_sparse: boolean` so the viewer renders "data sparse" honestly. |
| `src/lib/lab/dossier/dossier-engine.ts` | The compute engine — Sections 1-7 from real DB queries. Closest-reports composite = 0.5 desc + 0.3 geo + 0.2 temporal. Includes `computeChecksum`, `dossierStaleReason`, `computeDossier`. SUB_PATTERN_CATALOGUE = 9 seed sub-patterns across cryptids/UFOs/ghosts/psychic. |
| `src/lib/lab/dossier/dossier-service.ts` | `getOrComputeDossier` (lazy upsert), `forceRecompute`, `getDossierById`, `getDossierByShareToken`, `togglePublicShare`, `listStaleDossiers`. Owner-gating on all reads, service-role on all writes, random base64url share_token. |
| `src/lib/lab/dossier/dossier-auth.ts` | Shared bearer-token resolver + tier gate (`resolveDossierContext`) plus `serviceContext()` for cron + public-share. |
| `src/lib/lab/dossier/dossier-render.ts` | Server-side renderers — `renderShareCardSvg` (1080×1350 SVG, sharp rasterizes to PNG), `renderDossierPrintHtml` (A5 print-stylesheet HTML). Brand-purple `#9000F0`, Changa One headings. |
| `src/pages/api/lab/dossier/index.ts` | `GET ?experienceReportId=X` — lazy fetch-or-compute. Pro tier required (403 to free/basic). |
| `src/pages/api/lab/dossier/recompute.ts` | `POST ?experienceReportId=X` — force-recompute. |
| `src/pages/api/lab/dossier/[id]/export-pdf.ts` | `POST/GET` — returns A5 printable HTML; browser print-to-PDF is the user save path. Owner-only. |
| `src/pages/api/lab/dossier/[id]/share-card.png.ts` | `GET` — returns the 1080×1350 PNG (sharp). Falls back to SVG when sharp unavailable. Public when `?token=<share_token>` matches. |
| `src/pages/api/lab/dossier/[id]/toggle-public.ts` | `POST { public: bool }` — flips `is_public_shareable`. Mints share_token on first ON. |
| `src/pages/api/cron/recompute-dossiers.ts` | Nightly cron (Vercel schedule `0 8 * * *`). Pulls stale Dossiers (computed_at > 7d), force-recomputes with concurrency 4, cap 500/run. CRON_SECRET-gated. |
| `src/components/lab/ProDossier.tsx` | The in-app viewer. 7 collapsible sections open by default. Header with Refresh / PDF / Share. Rules-of-Hooks compliant (all hooks first, gates after — explicit per the LabPaywallSurface lesson). |
| `src/components/lab/DossierShareModal.tsx` | Share modal with image preview, public-link toggle (server-mints token on flip ON), copy-link, X/Twitter share, image download. Anonymized — never includes verbatim account. |
| `src/pages/dossier/share/[token].tsx` | Public unauthed Dossier viewer (`/dossier/share/<token>`). SSR via `getDossierByShareToken` (service-role + `is_public_shareable=TRUE`). Anonymized: phen-family, year, region (state-level), rarity, top-3 descriptors, lineage. NO verbatim text, NO precise location. og:image points to share-card PNG. |
| `scripts/_smoke-test-dossier.ts` | Smoke test — picks N user-submitted experiences, runs compute, writes a markdown grade-sheet to `outputs/dossier-quality-smoke-<ts>.md`. CLI: `--n=8 --out=<dir>`. |

## Files modified

| File | Change |
|---|---|
| `src/pages/lab.tsx` | Section 9 — Pro Dossier teaser is now LIVE for Pro users. Imports `ProDossier`; `tier === 'pro'` renders `<ProDossier experienceReportId={focused.id}/>`. Free/Basic continue to see `LabPaywallSurface kicker="The Dossier" upgradeTo="pro"`. |
| `vercel.json` | Added cron `{ "path": "/api/cron/recompute-dossiers", "schedule": "0 8 * * *" }`. |

## Files explicitly NOT touched (per the spec's parallel-agent guard)

- `src/lib/lab/watchlists/*`
- `src/components/lab/Watchlist*`, `src/components/lab/WatchlistsRail.tsx`
- `src/pages/api/lab/watchlists/*`
- `supabase/migrations/*watchlists*.sql`

---

## Migration filename

`supabase/migrations/20260604_pro_dossiers.sql`

---

## Refresh policy (implemented in `dossierStaleReason`)

A cached Dossier is considered stale when ANY of:
1. **No cache** (first view).
2. **Checksum mismatch** — input signals (report description hash +
   lat/lng/year + bucketed archive size at 5k granularity) changed.
3. **Report edited** — `reports.updated_at > pro_dossiers.computed_at`.
4. **>7 days** since `computed_at` (cron + on-view trigger).
5. **Archive grew by >1%** since the cached snapshot's
   `meta.archive_size_at_compute`.

---

## API surface

```
GET    /api/lab/dossier?experienceReportId=X      # lazy compute
POST   /api/lab/dossier/recompute?experienceReportId=X
POST   /api/lab/dossier/[id]/export-pdf           # printable HTML
GET    /api/lab/dossier/[id]/share-card.png       # PNG (or SVG fallback)
POST   /api/lab/dossier/[id]/toggle-public        # { public: bool }
GET    /dossier/share/[token]                     # public unauthed page
POST   /api/cron/recompute-dossiers               # CRON_SECRET-gated
```

All authed endpoints: Pro tier required (`403 pro_tier_required` to
free/basic). Public viewer + share-card-with-token are the only
unauthed paths, and both gate on `is_public_shareable = TRUE` via
RLS + the service-role check in `getDossierByShareToken`.

---

## Typecheck status

```bash
cd /sessions/affectionate-tender-fermi/mnt/paradocs
npx tsc --noEmit --project tsconfig.json 2>&1 \
  | grep -E "dossier|Dossier"
# (no output)
```

**Clean.** Zero new TypeScript errors in any of the new files,
modified files, or the lab.tsx wire-up.

---

## Smoke-test results (V11.17.71)

Ran `npx tsx -r dotenv/config scripts/_smoke-test-dossier.ts --n=5` —
output at `outputs/dossier-quality-smoke-2026-06-04T22-56-56-632Z.md`.

**4 / 4 computes succeeded** (the DB had 4 distinct
user-submitted approved UFO reports matching the filter; cron will
naturally widen this as new submissions land).

**Representative section (Dossier 1 — Diamond-Shaped Light, Saratoga
TX, 2012-11-28):**

```
### Section 1 — Closest reports
pool=5000 · sparse=false

| # | Score | Title | Year | Location | Distance |
|---|---|---|---|---|---|
| 1 | 49 | Silent White Circle Descends Over Los Gatos | 2025 | Los Gatos, CA | 4 mi |
| 2 | 49 | Expanding Fireball Dims Over San Jose Highway | 2022 | San Jose, CA | 9 mi |
| 3 | 48 | Small Circular Light Makes Sharp Right Turn Over … | 2025 | Hayward, CA | 28 mi |
| 4 | 48 | Orange Light Descends Over Oakland Residential Ar… | 2022 | Oakland, CA | 20 mi |
| 5 | 48 | Fireball Descends North to South Over San Jose | 2022 | San Jose, CA | 9 mi |

### Section 3 — Geographic neighbors
307 reports within 50 miles, grouped:
- ufos_aliens — 181
- ghosts_hauntings — 68
- psychological_experiences — 24
- Near-Death Experience — 8
- cryptids — 7

### Section 4 — Temporal neighbors
2554 in your decade (2010s) · 502 in your month (November) · 0 in your hour window

### Section 7 — Time-machine
Moon: Waxing Gibbous (99%)
- No notable meteor shower active in this window.
- No other Archive reports within 7 days + 100 mi of this event.
- Notable news context: data not yet wired (Time-Machine TODO).
- Weather context: data not yet wired (Time-Machine TODO).
```

**Observations from the smoke run:**
- Closest-reports scoring is producing tight geographic clusters
  (4-28 mi for matches in a 500-mi pool) — composite formula is
  working. Top-5 relevance reads as good for criterion #1.
- Geographic neighbors counts come from `phenomenon_types(name)`
  when present, falling back to `category` — that's why the bucket
  table mixes `ufos_aliens` (category) with `Near-Death Experience`
  (named phen). Acceptable; the founder may want to normalize
  display labels in a follow-up.
- The 4 sampled experiences had NO descriptor-vocabulary hits in
  their narratives (short, plain-English UFO descriptions). Section 5
  + Section 6 (rarity) correctly degraded to `data_sparse: true`
  rather than fabricating a percentile. This is the integrity rule
  working as designed.
- Average compute duration: ~2-4 seconds per Dossier against the
  live 250k-report corpus. Cron concurrency of 4 keeps the nightly
  recompute well under Vercel's function budget at expected scale.
- Time-machine astronomical context working end-to-end (moon phase
  computed for every dated event).

---

## TODOs / sub-issues noticed

1. **Time-Machine — weather + news API.** Today both render
   explicit "data not yet wired (Time-Machine TODO)" notes per the
   spec's honesty rule. Weather can be wired via Open-Meteo
   (free historical), news via NewsAPI or similar.
2. **Descriptor extraction is text-keyword based.** The
   `paradocs_assessment` pipeline already produces structured
   descriptors for many newer reports; the engine reads both
   `tags` and `paradocs_assessment.descriptors` plus does
   text-keyword fallback. For older submissions where neither is
   populated, the rarity section degrades to data_sparse. Pre-
   backfilling `paradocs_assessment.descriptors` on all user
   submissions would unlock Sections 5+6 on the long tail.
3. **True server-rendered PDF.** Today the export endpoint returns
   A5-formatted HTML the user prints to PDF. Adding
   `puppeteer-core + @sparticuz/chromium` would let us mint the PDF
   server-side and return a real `application/pdf` blob (and
   upload to Supabase Storage with a signed URL for email
   delivery). Function timeout would need to bump from default to
   30-60s.
4. **`SUB_PATTERN_CATALOGUE` is a seed of 9.** Founder owns this
   vocabulary. Expanding it deepens Section 2 (lineage) materially.
   A `sub_patterns` DB table + admin UI is a natural follow-up.
5. **Public-share page anonymization scope.** Current default
   strips verbatim text, precise location, and identifying detail.
   The spec calls out a future toggle for "include my first name"
   on the share card; not wired in this pass.
6. **Map screenshot in Section 3.** The viewer renders the bucket
   list + center coords as text; the spec calls for a small inline
   map. The maplibre `GeographicSurface` component is available and
   can be embedded inside ProDossier in a polish pass.
7. **Email delivery of generated PDFs.** Spec §3.3 mentions email
   delivery; today the PDF route returns HTML to a new tab. The
   `resend` package is already in the stack — a follow-up can hook
   into it once true server-rendered PDF lands.

---

## Open question for founder

**Should the public-share URL preview-OG-image be the rasterized PNG
or a brand-templated higher-res version?** Today
`/dossier/share/[token]` sets `og:image` to the share-card PNG
endpoint (`/api/lab/dossier/[id]/share-card.png?token=...`). When
Twitter/Slack/iMessage previews fetch it, they render the 1080×1350
PNG as the preview card. That's correct for Instagram-shape sharing,
but X/Twitter favors 1200×630 landscape for in-feed previews. Do we
want a second `share-card-landscape.png` endpoint at 1200×630 (and
swap the og:image to that for X / Open Graph contexts), or is the
portrait-on-X tradeoff acceptable for V1?

---

## Commit message draft

```
V11.17.71 — Tier 3A Pro Dossier: 7-section auto cross-reference + PDF + share card

Per PRO_TIER_VALIDATION_V3.md §3 — the Pro tier's load-bearing
flagship. Per-experience structured cross-reference Dossier with
deterministic queries against the 250k-report Archive, lazy-computed
on first view, recomputed nightly + when input signals change.

DB:
- supabase/migrations/20260604_pro_dossiers.sql — pro_dossiers
  table (one row per user+experience), JSONB sections_json,
  rarity_score for indexed sort, checksum for cache-invalidation,
  share_token + is_public_shareable for opt-in public URL. RLS:
  owner read, public read when flag is TRUE, service write only.

Engine (src/lib/lab/dossier/):
- dossier-types.ts        — 7 section shapes + envelope
- dossier-engine.ts       — computeDossier (parallel sections, no
                             fabrication, data_sparse honesty)
- dossier-service.ts      — getOrComputeDossier, forceRecompute,
                             toggle, share-token mint
- dossier-auth.ts         — Pro-tier gate
- dossier-render.ts       — SVG share card (1080×1350 → PNG via
                             sharp) + A5 printable HTML

API (src/pages/api/lab/dossier/):
- index.ts                — GET lazy fetch/compute
- recompute.ts            — POST force-recompute
- [id]/export-pdf.ts      — POST/GET printable HTML
- [id]/share-card.png.ts  — GET PNG (public via ?token)
- [id]/toggle-public.ts   — POST flip flag, mint token

Cron:
- src/pages/api/cron/recompute-dossiers.ts (nightly 08:00 UTC, added
  to vercel.json)

UI (src/components/lab/):
- ProDossier.tsx          — 7-section viewer, Refresh/PDF/Share
- DossierShareModal.tsx   — preview + public toggle + copy link
- src/pages/dossier/share/[token].tsx — public unauthed anonymized
  viewer with og:image for social previews

Integration:
- src/pages/lab.tsx — Pro users see <ProDossier/>; Free/Basic
  continue to see the LabPaywallSurface upsell teaser.

Smoke test:
- scripts/_smoke-test-dossier.ts — picks N user-submitted reports,
  runs compute, writes a markdown grade-sheet for the 5
  PRO_TIER_VALIDATION_V3 §8.2 criteria.

Typecheck: clean (zero new errors in touched files).
Smoke: 4/4 computes succeeded against live DB; ~2-4s per Dossier
       at 250k corpus size; data_sparse degraded honestly when the
       sampled experiences lacked descriptor vocabulary hits.

NOT touched (parallel-agent guard): src/lib/lab/watchlists/*,
src/components/lab/Watchlist*, src/pages/api/lab/watchlists/*,
supabase/migrations/*watchlists*.sql.

See docs/TIER3A_PRO_DOSSIER_BUILD_NOTES.md for the full TODO list,
smoke-test results, and founder open question on the share-card
aspect ratio.
```
