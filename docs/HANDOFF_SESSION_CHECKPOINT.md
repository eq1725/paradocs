# Session handoff — pick-up checkpoint

**Date:** June 10-11, 2026 (rolled overnight)
**Latest commit:** V11.18.21 — clusters endpoint surgical fix (response 98s+ → 4.5s)
**Status:** Stable. Three things to pick up — founder picks direction.

---

## What shipped in this session arc

### Patterns surface (Sprints 1A → 1G)
- **9 published Findings on /lab/patterns**, all carrying Gaia-aligned headlines + prose (V11.18.18+19). Shadow figure, tunnel, electromagnetic, OBE, paralysis, time dilation, hypnagogic, sensed presence, reunion with deceased.
- All 9 prose-locked from cron drift (V11.18.16's `prose_locked` column).
- FindingCard variants (rail, grid, today_card) redesigned: prose leads, data tucked behind "See the numbers" disclosure (V11.18.19).
- Pattern detail page at `/lab/patterns/[slug]` with literature commentary, audited for hallucinations (V11.18.8).
- MyRecord PatternsRail → desktop 2-column grid above 1024px (V11.18.19).
- Helena validator nuanced: `haunting` as noun OK, as adjective banned (V11.18.6).

### Today feed cards
- FindingCard SSR-baked into initial items, no race (V11.18.11 + V11.18.14).
- OnThisDate also SSR-baked (V11.18.14).
- ClusterCard fix shipped V11.18.21 — endpoint serialized 65 Haiku calls in a for…of loop, hanging at 98s+. Sort + slice + `Promise.all` + edge cache `s-maxage=3600` + `maxDuration: 30`. Now 4.5s cold / <200ms warm.
- LabPromo Pro-tier preview at `/discover?preview_labpromo=1` (V11.18.15).
- Visual chrome simplified (V11.18.19) — special cards now visually consistent with normal report cards.
- Desktop 3-column layout: OnThisWeekRail left, feed center, CONNECTED CASES right (V11.18.17).

### Copy
- Gaia-aligned voice locked in 3 rules: lead with the qualitative finding, plain-English settings (not taxonomy), two-clause meaning closer (V11.18.18 §1).
- 9 Finding sentences + 5 headlines rewritten (V11.18.18); 4 missed headlines fixed (V11.18.19).
- Reunion sentence sample: *"The dead come back. They come back the same way — recognized, communicating, met as themselves. At a deathbed. In a haunting. At a medium's table. Three different doorways. The same meeting."*

### Copyright + DMCA
- Sprint 1 done: `/sources` + `/dmca` pages, DMCA agent registered (DMCA-1073927, Level 6 LLC dba Paradocs, Cheyenne WY), `(307) 509-0233` Google Voice number registered with Copyright Office.
- Sprint 2 done: description truncate + sha256 hash backfill (~318k rows hashed, ~61k truncated), Haiku narrative regen via Anthropic Batch API (~$134 across 7 chunks, 34,884 of 34,889 successful).
- `prose_locked` column protects founder-edited Finding prose from weekly cron.

### Ingestion
- **NUFORC mass ingest complete** — 117,745 reports inserted, 0 errors, $11.95, 116h 14m elapsed.
- Classifier-drain catching up the trickle on the daily 04:00 cron.

### Infrastructure
- Slug backfill applied — 196,400 rows re-slugged + 301 aliases (V11.17.98).
- Description Option A truncation done (V11.17.99+).
- Description Option B full-strip = Sprint 3, awaiting classifier coverage on the new NUFORC rows.
- E2E Playwright workflow disabled (V11.18.18) to stop email spam — TODO: rewrite tests for new 3-col layout.

---

## Tasks still open

### High-leverage
- **Desktop /discover polish** — FindingCard at desktop still looks unfinished even after V11.18.17's 3-column. Founder flagged "looks awful on anything other than mobile" and "Apple-aligned" repeatedly.
- **Sprint 3: description Option B full-strip** — unblocked by NUFORC completion. Once classifier-drain covers the new 117k rows (~2-3 weeks), strip description body text from DB entirely, keeping only structured facts + sha256 audit trail.
- **E2E test rewrite** — currently disabled at `.github/workflows/e2e.yml: if: false`. Rewrite for new 3-col layout, then re-enable.

### Polish / Sprint 1F-G leftovers
- **piloerection vocabulary** — wired into PATTERN_CONFIGS but UFO 0% in dry-run. Missing keywords like "raised hairs," "felt electricity in the air."
- **animal_witness_reaction vocabulary** — still 0% in UFO + ghost; likely corpus skew, defer until long-form expansion.
- **Anon 401/400 cleanup** — `/api/push/claim-anon-subscriptions`, `/api/user/streak`, `/profiles?select=subscription_tier` still firing for unauthenticated users.
- **V11.18.20 SSR-bake cluster retry** — endpoint now responds, so the SSR-bake fix that was reverted would now be safe. Optional; the post-paint async path already works.
- **Service worker review** — multiple times founder hit stale-cache symptoms.

### Backlog
- Sprint 1C backlog task #221 (cluster service polish, share-card PNG, OG tags, etc.)
- piloerection + animal_witness publish (held drafts)
- paralysis 100% spot-check tightening
- Detail page share-card PNG (Spotify Wrapped pattern)
- /lab/patterns/[slug] OG meta tags for social sharing

---

## Three natural next moves (founder picks)

1. **Polish desktop /discover** — FindingCard desktop treatment + the "Apple-aligned" feel the founder kept asking for. Likely Sprint 1H.
2. **Sprint 3 description full-strip** — copyright posture upgrade once classifier-drain catches new NUFORC rows.
3. **Sit back + stabilize** — ~20 deploys in this session. Let prod settle, gather feedback, come back tomorrow.

---

## Reference

- Cluster endpoint diagnosis: `/Users/chase/paradocs/docs/CLUSTERS_ENDPOINT_DIAGNOSIS.md`
- V11.18.21 runbook: `/Users/chase/paradocs/docs/V11_18_21_NOTES.md`
- Gaia copy: `/Users/chase/paradocs/docs/GAIA_FINDING_COPY.md`
- Pattern taxonomy: `/Users/chase/paradocs/docs/PATTERNS_TAXONOMY.md`
- Copyright audits: `/Users/chase/paradocs/docs/COPYRIGHT_DERIVATIVE_WORK_AUDIT.md` + `HAIKU_NARRATIVE_DERIVATIVE_AUDIT.md`
- UI shipping roadmap (V2): `/Users/chase/paradocs/docs/UI_SHIPPING_ROADMAP_V2.md`
- All Sprint notes: `docs/SPRINT_*_NOTES.md`, `docs/V11_18_*_NOTES.md`
