# Free-Tier Limit Enforcement Audit — E2.4

**Status:** Audit complete · May 16, 2026
**Spec:** docs/TIER_DESIGN_V2.md
**Purpose:** verify that every free-tier limit defined in the V2 tier
spec is enforced server-side, not just gated in the UI. UI gates without
backing server enforcement are bypassable by anyone who can modify
client state or call the API directly — they kill conversion pressure
and they leak the cost ceiling the tier limits are meant to enforce.

## Limit-by-limit status

| Limit (V2 spec) | Free value | Server-side enforced? | Where | Notes |
|---|---|---|---|---|
| `reports_per_month` | -1 (unlimited) | n/a | — | V2 removed this cap per panel review |
| `saved_reports_max` | -1 (unlimited) | n/a | — | V2 removed this cap per panel review |
| `ask_questions_per_day` | 2 | ✅ YES | `src/pages/api/lab/ask-the-unknown.ts` | E0.7. Tier resolved per-request; returns 429 with upgrade payload on cap |
| `story_analysis_max` | 1 | ⚠️ N/A | — | Card 3 (`context`) is deterministic post-V10.12; no Sonnet cost to gate. UI lock from E0.6 is purely conversion-trigger surface, not cost control. **No server enforcement needed.** |
| `constellation_unlocks_max` | 5 | ❌ NO | — | **GAP** — PaywallModal is purely client-side. Trivially bypassable. See follow-up. |
| `api_calls_per_month` | 0 (Free), 1000 (Pro) | ❌ NO | — | **GAP** — no `/api/public/*` endpoints exist yet, so no immediate exposure. Becomes a gap when API tier surfaces. See follow-up. |
| `signal_alerts_push` | false | ✅ YES | `src/pages/api/cron/signal-alerts.ts` | E0.8. Tier resolved per-user-per-run; free users excluded + one-time notice + topic unsubscribe |
| `email_digest` | weekly | ⚠️ DEGRADED | `src/pages/api/cron/signal-digest-email.ts` | Cron currently sends digest based on `email_digest_cadence` user preference. Free users get whatever cadence they last picked. Should be capped at weekly for Free. See follow-up. |
| `comparative_story` (Pro only) | false | ⚠️ N/A | — | Feature not yet implemented (Tier 2 backlog). Will be Pro-gated on build. |
| `sonnet_model_priority` (Pro=primary) | fallback | ❌ NO | — | Currently all users get Sonnet 4.6 primary in `your-signal-ai.service.ts` and `ask-the-unknown.service.ts`. Pro-only model differentiation per V2 spec not yet implemented. See follow-up. |
| `data_export` (Pro only) | false | n/a UI-only | — | Export UI doesn't exist yet; build-time gate sufficient |
| `bulk_import` (Pro only) | false | n/a UI-only | — | Same as data_export |
| `advanced_search` (Basic+) | false | ⚠️ partial | — | Free can construct multi-filter URLs by hand. UI prevents 3rd filter on Free; server-side query honors all filters regardless. **Low-priority gap** — bypass requires URL-manipulation skills; conversion pressure still mostly fires |

## Follow-up tasks created

The audit revealed five enforcement gaps. Each is filed as a discrete task:

1. **E2.4.a** — Constellation unlock server-side enforcement (`unlocked_constellation_matches` table + check in `/api/constellation/match.ts`)
2. **E2.4.b** — API access endpoint enforcement (deferred until `/api/public/*` surfaces exist; place a guard in the API key-issuance flow when built)
3. **E2.4.c** — Email digest cadence capped to weekly on Free (`signal-digest-email.ts` cron)
4. **E2.4.d** — Sonnet model tier-priority differentiation (Pro = 4.6 primary, Basic = 4.5 fallback) in `your-signal-ai.service.ts` + `ask-the-unknown.service.ts`
5. **E2.4.e** — Advanced search filter-count cap enforced server-side (`/api/reports/search.ts` or equivalent)

None of these are launch-blocking individually. Combined, they're a meaningful post-launch hardening sprint. Recommendation: ship MVP with the current state, file these as Tier 1.5 follow-ups for the week after launch, prioritize by actual conversion / cost data once it exists.

## What "ship MVP with current state" actually means

- **E0.7 (Ask cap) is the most critical enforcement** — protects per-user Sonnet cost ceiling. Without it, a single curious Free user could cost $5+/month in Sonnet usage. With it, hard-capped at ~$0.05/day per Free user.
- **E0.8 (Signal Alerts gating) is the second most critical** — push notification cost is bounded but more importantly the conversion hook isn't given away to Free users.
- **Other gaps are conversion-pressure leaks, not cost-control leaks.** Free users bypassing the Constellation 5-unlock cap don't cost us money; they just don't get pressured to upgrade. Acceptable for MVP launch; close post-launch.

## Verification queries

Run periodically to confirm enforcements hold:

```sql
-- Ask cap: any free user over 2 per day?
SELECT user_id, DATE(created_at) AS day, COUNT(*) AS asks
FROM ask_the_unknown_log a
JOIN user_subscriptions s ON s.user_id = a.user_id AND s.status = 'active'
JOIN subscription_tiers t ON t.id = s.tier_id
WHERE t.name = 'free' AND a.created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id, DATE(created_at)
HAVING COUNT(*) > 2;
-- Expected: zero rows. Any rows = E0.7 enforcement bug.

-- Signal Alerts: any free user receiving daily push?
SELECT n.user_id, COUNT(*) AS alert_count
FROM user_notifications n
JOIN user_subscriptions s ON s.user_id = n.user_id AND s.status = 'active'
JOIN subscription_tiers t ON t.id = s.tier_id
WHERE t.name = 'free'
  AND n.type = 'signal_alert'
  AND n.created_at > NOW() - INTERVAL '7 days'
GROUP BY n.user_id;
-- Expected: zero rows. Any rows = E0.8 enforcement bug.

-- Tier-change notices: count of free users who received the one-time notice
SELECT COUNT(*) FROM user_notifications
WHERE type = 'tier_change' AND created_at > NOW() - INTERVAL '24 hours';
-- Expected: matches the number of free users who had your_signal topic
-- before E0.8 deployed.
```
