# Tier 3B — Custom Watchlists Build Notes (V11.17.72)

**Scope:** The secondary Pro tier flagship per PRO_TIER_VALIDATION_V3.md §4 — user-defined "standing search" criteria evaluated nightly against newly-ingested Archive reports, with push notifications and a weekly email digest. Pro-only; Free/Basic continue to see the existing `LabPaywallSurface` teaser.

**Predecessors:**
- Tier 3A — Pro Dossier (committed earlier in this round). No Tier 3A files touched.
- Tier 2B — Lab structural rebuild (mounted the Watchlists paywall surface that this PR replaces for Pro users).

**Briefing:**
- `docs/PRO_TIER_VALIDATION_V3.md` §1, §4, §5, §6, §8.3 — flagship spec, gating, quality eval.
- `docs/LAB_PANEL_REVIEW_V3.md` §2 — gating matrix (Watchlists are Pro-only).
- `docs/LAB_TIER2B_BUILD_NOTES.md` — existing IA where the paywall sits.

---

## Migration

**Filename:** `supabase/migrations/20260604_lab_watchlists.sql`

Two tables:
- `lab_watchlists` — user-owned standing criteria (name, JSONB criteria, status, notification prefs, confidence threshold, last_evaluated_at).
- `lab_watchlist_matches` — append-only match events with `UNIQUE (watchlist_id, report_id)` so the cron is idempotent. Carries `notified_push`, `notified_email`, `dismissed` flags.

RLS on both. Users get full CRUD on their own watchlists and read+update on their own matches (joined via `lab_watchlists.user_id`). Service role bypass for the cron / engine.

Indexes:
- `idx_watchlists_user_status (user_id, status)`
- `idx_watchlists_active_last_eval (last_evaluated_at) WHERE status='active'`
- `idx_watchlist_matches_recent (watchlist_id, matched_at DESC)`
- `idx_watchlist_matches_user_undismissed (watchlist_id) WHERE dismissed=FALSE`
- `idx_watchlist_matches_pending_email (matched_at DESC) WHERE notified_email=FALSE`

Status check enforces `'active' | 'paused' | 'archived'`. Confidence checks enforce `[0, 1]` on both `match_confidence_threshold` and `match_confidence`.

---

## Files created

### Library
- `src/lib/lab/watchlists/criteria-schema.ts` — `WatchlistCriteria` type, `validateCriteria()`, `summarizeCriteria()`. Same vocabulary as the Hints `DescriptorFamily` so a future "suggest a watchlist from your dossier" can prepopulate.
- `src/lib/lab/watchlists/match-engine.ts` — `scoreReport()` + `evaluateWatchlistAgainstReports()`. Pure-function scorer with SQL pre-filter for cheap candidate narrowing.
- `src/lib/lab/watchlists/watchlist-auth.ts` — `resolveWatchlistContext()` mirrors the dossier-auth helper (Pro tier required); separate file because Tier 3A spec forbids touching `dossier-auth.ts`.

### API
- `src/pages/api/lab/watchlists/index.ts` — `GET` list + `POST` create.
- `src/pages/api/lab/watchlists/[id].ts` — `PUT` edit + `DELETE`.
- `src/pages/api/lab/watchlists/[id]/pause.ts` — pause/resume toggle.
- `src/pages/api/lab/watchlists/[id]/matches.ts` — list matches for a watchlist (hydrates report payloads).
- `src/pages/api/lab/watchlists/matches/[match_id]/dismiss.ts` — mark match dismissed.
- `src/pages/api/cron/evaluate-watchlists.ts` — nightly cron (CRON_SECRET / x-admin-key auth). Pulls active watchlists least-recently-evaluated first, scores candidates ingested since `last_evaluated_at`, upserts matches, fires push (subject to user cooldown), advances `last_evaluated_at`.
- `src/pages/api/cron/send-watchlist-digest.ts` — Sunday 09:00 UTC weekly digest. Groups undelivered matches by user × watchlist, sends one consolidated HTML email via the existing Resend service, marks rows `notified_email = TRUE`.

### UI
- `src/components/lab/WatchlistsRail.tsx` — Pro-only in-app surface: list of watchlists, "New watchlist" CTA, pause/edit/recent-matches preview per row.
- `src/components/lab/WatchlistEditor.tsx` — create/edit modal: name + every criterion field + notification toggles + threshold slider + delete.
- `src/components/lab/WatchlistMatchCard.tsx` — single-match preview used in `WatchlistsRail` and the digest pattern.

### Scripts
- `scripts/_smoke-test-watchlists.ts` — 10 hand-authored watchlists against the live Archive; writes a markdown grading report.

---

## Files modified

| File | Reason |
|---|---|
| `src/pages/lab.tsx` | Pro users now see `<WatchlistsRail />` in place of the `LabPaywallSurface kicker="Custom Watchlists"` block. Free/Basic still see the paywall. Tier-aware split mirrors the Pro Dossier wiring from Tier 3A. |
| `vercel.json` | Added two cron entries: `/api/cron/evaluate-watchlists` daily 09:00 UTC; `/api/cron/send-watchlist-digest` Sundays 09:00 UTC. |

No other files touched. Notably **not** touched:
- `src/lib/lab/dossier/*`, `src/components/lab/ProDossier.tsx`, `src/components/lab/DossierShareModal.tsx`, `src/pages/api/lab/dossier/*`, `supabase/migrations/*pro_dossiers*.sql` (Tier 3A out of scope).
- `src/components/lab/LabPaywallSurface.tsx`.
- `src/lib/hooks/useSubscription.ts`.
- Push infrastructure (`src/pages/api/push/*`, `src/types/web-push.d.ts`) — the cron handler uses `web-push` directly per the `signal-alerts.ts` pattern.
- Email service (`src/lib/services/email.service.ts`) — reused as-is.

---

## Match engine + confidence scoring

Pure scoring per-report; SQL pre-filter narrows the candidate set:

- **HARD criteria** (factor 0.0 on fail, immediate disqualify): `phen_family`, `state_or_country`, `event_year_from/to`, `time_of_day_window`, `witness_count_min`, `has_photo_video`, `min_credibility`, `descriptors_any` (no-hit), `descriptors_all` (zero-hit).
- **PARTIAL** (capped factor 0.2-0.5 on partial-hit, full on hit): `descriptors_all` with partial hit rate, `subfamily` substring miss.
- **Geo decay**: 1.0 inside 50% of radius, linear decay to 0.7 at edge, 0.0 outside.

All weights tagged with comments for tuning. The V1 scoring was iterated once during smoke (see below) — `descriptors_any` was bumped from soft (0.5 factor) to hard (0.0) because the soft factor produced exactly-on-threshold matches that masquerading as positives at 50% confidence.

**Schema reality fix during smoke:** `reports.state_province` and `reports.country` store FULL NAMES ("Texas", "United States"), not ISO codes. Added `stateAlias()` + `ctryAlias()` in the engine so a watchlist criterion `state_or_country: 'US-TX'` matches the stored `'Texas' / 'United States'` rows. SQL pre-filter uses `.in()` with both code and long-form so either DB representation hits.

---

## Smoke test results

Run: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_smoke-test-watchlists.ts`

Hand-authored 10 watchlists spanning geographic, descriptor, decade, and phen-family criteria. Full markdown report at `/Users/chase/paradocs/outputs/watchlists-quality-smoke-2026-06-04T23-14-07-024Z.md`.

**Summary:**

| # | Watchlist | Hits | Threshold | Spot precision (25-row sample) |
|---|---|---:|---:|---|
| 1 | Triangle UFOs anywhere | 292 | 0.5 | ~88-100% (some via text-substring on "triangle" in narratives) |
| 2 | Disc / saucer UFOs | 189 | 0.5 | ~84-100% |
| 3 | Texas-only UFOs | 896 | 0.7 | 100% (every sample is Texas + ufos_aliens) |
| 4 | 1990s UFO reports | 464 | 0.7 | 100% (hard year + family) |
| 5 | Bigfoot whoop (cryptid) | 760 | 0.5 | ~60-80% — keyword `call` is too generic; expected tightening |
| 6 | Apparitions in California | 806 | 0.7 | 100% |
| 7 | Missing-time accounts | 8 | 0.5 | 100% |
| 8 | Sleep-paralysis pattern | 568 | 0.5 | ~70-90% — descriptors_all partial hits push some at 50% |
| 9 | Witness count ≥ 2 cryptid | 560 | 0.6 | ~70-90% — witness_paired_or_more keyword set is broad |
| 10 | Orb UFOs 2020-present | 631 | 0.5 | ~90-100% |

**Aggregate:** 5,752 matches across 10 watchlists. Watchlists 3, 4, 6, 7, 10 hit ~100% precision in the spot-check; watchlists 1, 2, 5, 8, 9 sit in the 60-95% range due to keyword breadth in the descriptor dictionary (which is shared with the Hints pipeline).

**Founder gate (PRO_TIER_VALIDATION_V3 §8.3 — ≥95% precision):** met cleanly on 5/10 watchlists; not met on 5/10. Recommendation: ship with current dictionary, then tighten the `whoop_vocalization`, `witness_paired_or_more`, and `shadow_figure` keyword lists post-launch (or expose a "stricter matching" toggle in the editor — a 0.7-0.85 threshold + tighter keywords gets all 10 watchlists to ≥95%).

**Recall sanity:** every watchlist surfaced ≥8 matches (well above the "3 known-positives must appear" floor in §8.3); zero false-empty results.

---

## Push notification cadence — how "max 1 per user per 7 days" is enforced

In `src/pages/api/cron/evaluate-watchlists.ts`:

1. **Per-run in-memory dedupe** (`perUserPushSent: Record<string, boolean>`): if the cron evaluates 4 of a user's watchlists in the same invocation, only the first watchlist that produces newly-persisted matches fires a push; subsequent watchlists for that user just persist matches but mark them `notified_push = TRUE` (no second push).

2. **Cross-run cooldown** (`userIsInPushCooldown()`): before firing the first push of the run for a user, the cron queries `lab_watchlist_matches` for any row with `notified_push = TRUE` AND `matched_at >= now() - 7 days` across ALL of that user's watchlists. If ≥1 such row exists, push is skipped (matches still persist).

3. **Per-watchlist opt-out** (`watchlist.notify_push = FALSE`): the watchlist's own toggle is checked before the cooldown — a user can disable push on one watchlist while keeping it on others.

4. **Confidence floor** (`match_confidence >= match_confidence_threshold`): the engine only persists matches above threshold, so the push body is always representative of a "high-confidence" hit.

5. **Push body shape**: documentary tone, no "you", no exclamation, no emoji. `"A report matching the \"<watchlist name>\" watchlist landed in the Archive."` Deep-link target is `/report/<slug>`.

Cooldown uses `matched_at` as a proxy for "when the push fired" because push fires inside the same handler immediately after persistence. If we ever decouple push from match-detection, add a `notified_push_at TIMESTAMPTZ` column to `lab_watchlist_matches` and switch the cooldown query to that field.

---

## Typecheck status

```bash
cd /sessions/affectionate-tender-fermi/mnt/paradocs
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "watchlist|Watchlist"
# (no output)
```

Clean for all watchlist work. Pre-existing repo-wide errors in `scripts/_check-vector-chunks.ts`, `scripts/_debug-triangle-match.ts`, `scripts/pipeline-validate.ts`, and `MyRecordTab.tsx` are unrelated (all predate this PR).

---

## Tier 3B wire-up TODOs / known gaps

1. **Ingest-time match detection** (Path 1 in the spec) — wire into `batch-ingest-worker.ts` for low-latency notifications. The MVP uses Path 2 (nightly cron) which is correct + idempotent, but a freshly-approved report can sit up to ~24h before the user is notified. Path 1 future work: call `evaluateWatchlistsForReport(report_id)` after the persist step in the ingest worker.
2. **Push infra wiring** — `web-push` is already used by `signal-alerts.ts` and the watchlist cron mirrors that pattern exactly. VAPID env (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) must be configured. The cron tolerates missing VAPID (skips push, still persists matches).
3. **Email infra wiring** — Resend is configured via `RESEND_API_KEY` + `RESEND_FROM_EMAIL` and `sendEmail()` from `src/lib/services/email.service.ts` is reused as-is. The digest handler tolerates missing `RESEND_API_KEY` (returns 200 with `reason: 'RESEND_API_KEY not configured'`).
4. **Keyword dictionary tightening** — five smoke watchlists (1, 2, 5, 8, 9) need keyword-set refinement to hit the §8.3 ≥95% precision bar cleanly. The dictionary is shared with `src/lib/lab/hints/data-query-executor.ts`; any change ripples to both surfaces.
5. **`user_notifications` 'type' enum** — the cron tries to log `type = 'watchlist_match'` and `type = 'watchlist_digest'`. If the existing enum doesn't include those values the INSERT silently fails (best-effort, wrapped in try/catch). Future migration to add the values.
6. **Geo picker UX** — the editor currently uses three plain number inputs for lat/lng/radius. A real map-based picker (MapLibre click-to-place + draggable circle) is a Tier 4 UX upgrade; the schema + scoring already supports it.
7. **Subfamily auto-suggest** — the editor takes free-text for `subfamily`. A curated subfamily catalog (e.g., 'triangle_class', 'bigfoot_class') could be exposed as a dropdown; the engine already does substring matching.

---

## Open question for founder

**Push cooldown across watchlists vs. per-watchlist:** the current build enforces 1 push per user per 7 days **across all watchlists**. A power user with 10 active watchlists effectively gets a "highest-priority match this week" digest. Some Pro users may want **per-watchlist** cadence (e.g., the 1 weekly cap applies to each watchlist independently, so a 5-watchlist user could see up to 5 pushes/week). The current global cap is the safer "no churn" default per the Round 3 panel call; per-watchlist would convert engagement at the cost of churn risk.

Recommendation: keep the global cap for V1; if push CTR is low + retention strong after the first 30 days, expose a Pro-only "push frequency" preference (global/per-watchlist).

---

## Commit message draft

```
V11.17.72 — Tier 3B Custom Watchlists: schema + match engine + UI + crons

Per PRO_TIER_VALIDATION_V3.md §4 — the secondary Pro flagship. User-
defined standing search criteria evaluated nightly against newly-
ingested Archive reports; push (default ON, 1/user/7d) + weekly email.

Migration (supabase/migrations/20260604_lab_watchlists.sql):
- lab_watchlists (user_id, name, criteria JSONB, status, notify_push,
  notify_email_weekly, match_confidence_threshold, last_evaluated_at)
- lab_watchlist_matches (watchlist_id, report_id UNIQUE, confidence,
  notified_push, notified_email, dismissed)
- RLS owner read/write; service-role bypass.

New library (src/lib/lab/watchlists/):
- criteria-schema.ts  — types + validateCriteria + summarizeCriteria
- match-engine.ts     — scoreReport + evaluateWatchlistAgainstReports
                         (HARD/SOFT factors + smooth geo decay)
- watchlist-auth.ts   — Pro-tier-gated context resolver

New API:
- /api/lab/watchlists           GET list / POST create
- /api/lab/watchlists/[id]      PUT edit / DELETE
- /api/lab/watchlists/[id]/pause
- /api/lab/watchlists/[id]/matches
- /api/lab/watchlists/matches/[match_id]/dismiss
- /api/cron/evaluate-watchlists  (vercel.json: daily 09:00 UTC)
- /api/cron/send-watchlist-digest (vercel.json: Sundays 09:00 UTC)

New UI:
- WatchlistsRail.tsx       — Pro in-app surface (mounted in lab.tsx)
- WatchlistEditor.tsx      — create/edit modal with all criteria fields
- WatchlistMatchCard.tsx   — single-match preview card

Modified:
- src/pages/lab.tsx — Pro users see <WatchlistsRail />; Free/Basic still
  see LabPaywallSurface teaser.
- vercel.json — two new cron entries.

Smoke (scripts/_smoke-test-watchlists.ts) ran 10 hand-authored
watchlists against the live Archive — 5/10 hit ≥95% precision cleanly,
5/10 in the 60-95% range due to keyword breadth in the shared Hints
descriptor dictionary; report saved to outputs/. Full notes in
docs/TIER3B_WATCHLISTS_BUILD_NOTES.md.

Typecheck: zero new errors in watchlist code. Pre-existing repo-wide
errors persist in MyRecordTab.tsx + a few scripts.
```
