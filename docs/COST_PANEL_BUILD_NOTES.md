# Cost Panel — V11.17.85 build notes

Adds a visible AI-spend ledger to the top of `/admin`, consuming the
`/api/admin/cost-summary` endpoint shipped in V11.17.84.

## Files

**Created**
- `src/components/admin/CostPanel.tsx` — self-contained client component.

**Modified**
- `src/pages/admin/index.tsx` — imports `CostPanel` and mounts it directly
  below the "Run All Ingestion" header row (above the message banner and
  tab nav). One import line + one JSX block; existing sections untouched.

## Endpoint contract

Calls `GET /api/admin/cost-summary?from={now-14d}&to={now}` with
`Authorization: Bearer <session.access_token>` — same pattern the
`runQualityAction` calls on the same page use.

Response shape consumed:
- `total_calls`, `by_service: { [name]: { spend_usd, calls } }`
- `by_day: [{ day: 'YYYY-MM-DD', spend_usd, calls }]`

Today / yesterday / last-7d are derived client-side from `by_day` so the
panel doesn't need a second endpoint call.

## Layout

**Desktop (≥1024px)**
- Row 1: 3 stat tiles side-by-side (Today / Yesterday / Last 7 days).
- Row 2: 5-col grid — by-service breakdown (col-span-3, ~60%) +
  14-day daily area chart (col-span-2, ~40%).

**Tablet (640–1024px)**
- Row 1 stays 3-up via `md:grid-cols-3`.
- Row 2 stacks vertically (no `lg:` columns).

**Mobile (<640px)**
- Everything stacks vertically (`grid-cols-1`).

## Visual register

- **Today's spend** rendered at `text-3xl font-mono tabular-nums` in
  brand purple `#9000F0` (inline `style` — Tailwind has no purple-#9000F0
  alias on this project).
- Yesterday / Last-7d in the same size/weight but `text-gray-100` to keep
  Today visually primary.
- Eyebrows ("Spend ledger", "Today (UTC)") in `text-[10px] tracking-widest
  uppercase text-gray-400/500` — the same archival treatment used by the
  existing `ReviewQueuesRow` on the same page.
- By-service bars are 1.5px tall, filled with brand purple; no border
  radius variation, no animation, no gradient — same restraint as the
  existing source-health rows.
- Daily area chart uses recharts `<AreaChart>` with a brand-purple
  vertical gradient (0.55 → 0.05). X-axis `interval={1}` so labels don't
  overlap on the 14-day window. Y-axis tick formatter `'$' + Math.round(v)`.
- Delta caption is amber if spend went up, green if down, gray if
  yesterday was $0 — framed for cost-control (down is good).

## Charting library

**recharts** (already in `package.json` at `^2.12.7`, used by the existing
Content/Activity/Quality tabs). No new dependencies introduced.

## State machine

Single `useEffect` triggers an initial fetch on mount. A `Refresh` button
in the panel header re-runs the fetch. Four render branches:

1. `loading` — animated skeleton with the same outer chrome as the loaded
   state, so the dashboard doesn't jump on first paint.
2. `unauthorized` (401/403) — quiet one-liner: "You must be an admin to
   view the cost ledger." No alarm bells (the page itself already gates
   admin access — this is defense in depth).
3. `error` — error message + Retry button.
4. `loaded` — the panel.

All hooks (`useState`, `useEffect`, `useCallback`, `useMemo`) are called
unconditionally before any early return — Rules-of-Hooks compliant.

## Verification

```
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "CostPanel|admin/index"
# → no CostPanel errors
# → 2 pre-existing errors in admin/index.tsx (lines 198, 342) unrelated
#   to this change (supabase generic-type issues on profile.role and
#   data_sources.update — both predate V11.17.85).

npx next lint --file src/components/admin/CostPanel.tsx
# → ✔ No ESLint warnings or errors
```

## Style-bible alignment

- `var` declarations, function expressions, string concat — SWC-friendly,
  matches the conventions in `AdminLayout.tsx` and `ReviewQueuesRow`.
- Default export named function — same shape as `StatsCard`/`ActivityFeed`.
- Version-stamped header comment `V11.17.85 - admin cost panel`.
- No emoji anywhere. No SaaS-pitch copy. Eyebrows like "Spend ledger" /
  "By service — 14-day window" / "Daily spend — 14 days" — documentary,
  archival, never gamified.

## Open question for the founder

Auto-refresh cadence. Right now the panel fetches once on mount and only
re-fetches when the user clicks Refresh. The Activity Feed on the same
page polls every 30s; the queue-counts row polls every 60s. Should the
cost panel also poll on a timer (e.g., every 60s) or stay manual? Manual
feels right for a number the founder checks deliberately rather than
watches live — but happy to flip a switch if the preference is otherwise.
