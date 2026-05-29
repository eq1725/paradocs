# Standing System v1 — Deployment Notes

**Version:** V11.17.42
**Panel memo:** docs/BADGE_SYSTEM_PANEL.md

## What shipped

Two-axis "Standing" system replacing the placeholder rank (Observer / Investigator / Senior Researcher / Field Agent).

- **Catalogue axis** (curation depth): Reader → Regular → Keeper → Archivist
- **Contribution axis** (what the user has added): Witness → Contributor → Correspondent → Steward
- Independent axes — neither overrides the other. Cosmetic only in v1, no feature gating.

## Files changed / added

| File | Status | Purpose |
|---|---|---|
| `supabase/migrations/20260529_user_standing.sql` | NEW | `user_standing` table + RLS (public read, service-role write) |
| `src/lib/standing/types.ts` | NEW | Shared types + tier names + `pickInlineLabel` |
| `src/lib/services/standing.service.ts` | NEW | Compute / persist / batch read / Lab-subscriber checks + thresholds config |
| `src/pages/api/standing/me.ts` | NEW | Authed read for current user, recomputes if stale > 24h |
| `src/pages/api/cron/recompute-standing.ts` | NEW | Nightly recompute of active users (60-day window) + stale (>7d) rows |
| `vercel.json` | EDIT | Added `0 7 * * *` cron for recompute-standing |
| `src/components/profile/StandingPills.tsx` | NEW | Two text pills + prose progression line |
| `src/components/profile/LabMark.tsx` | NEW | Tiny ◇ glyph next to Lab subscriber usernames |
| `src/pages/profile.tsx` | EDIT | Replaced placeholder rank logic with `<StandingPills>` + `<LabMark>` next to `<h1>` |
| `src/pages/api/reports/[slug]/comments/index.ts` | EDIT | GET + POST now enrich author with `inline_label` (tier 2+) + `is_lab` |
| `src/components/reports/ReportComments.tsx` | EDIT | CommentRow renders LabMark next to username + `· Keeper` after timestamp |

## Deploy steps for operator

1. **Run migration in Supabase SQL editor:**
   ```
   supabase/migrations/20260529_user_standing.sql
   ```
2. **Commit + push** (sandbox can't commit from `.git/`):
   ```
   rm -f .git/index.lock
   git add -A
   git commit -F- <<'EOF'
   V11.17.42 — two-axis Standing system replaces placeholder rank
   
   Per Maya/Jordan/Lena/Sam panel (docs/BADGE_SYSTEM_PANEL.md). Adds
   user_standing table + nightly cron + /api/standing/me + profile
   pills + Lab diamond + inline comment tier mark (tier 2+).
   EOF
   git push
   ```
3. **First run of the cron** will be 07:00 UTC after deploy. Until
   then, /api/standing/me computes on demand on first profile visit.
4. **Sam's threshold calibration** can happen in `CATALOGUE_LADDER` /
   `CONTRIBUTION_LADDER` constants in `standing.service.ts` without
   another migration.

## Deliberate v1 omissions (panel section 5)

No feature gating, no progress bar, no leaderboard, no `/profile/progress`
page, no tier-change notifications, no per-tier color theming, no
backfilled tier history. These are deferred to v2+ when we have a
year of distribution data.

## Known sharp edges

- The Steward "no moderation strikes in 180 days" clause is unenforced
  in v1 — we don't have a strikes table yet. Currently it just
  checks reports ≥ 25 + account age ≥ 1y.
- The cron's "active user" query uses `{ distinct: true }` on
  `user_activity_log`. If this Supabase client option behaves
  unexpectedly at scale, fall back to a `select distinct user_id`
  RPC. (At current volumes the simple version is fine.)
- `LabMark` inside `<h1 class="truncate">` could theoretically clip
  on very long display names; the glyph is 10px so this is unlikely.
