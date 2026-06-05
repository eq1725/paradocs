# Tier 3C — Named-Match + Peer DM build notes

**Version stamp:** `V11.17.73`
**Date:** 2026-06-04
**Spec sources:**
- `docs/LAB_PANEL_REVIEW_V3.md` §4 (cadence) + §6 (DM mechanics)
- `docs/PRO_TIER_VALIDATION_V3.md` (named-match volume/cadence guardrails)
- `docs/PRICING_SUBSCRIPTION_PANEL.md` §3.6 (inline paywall pattern)

## Migration

- `supabase/migrations/20260604_lab_named_matches.sql`
  - `reports.discoverable` column (default FALSE) + partial index
  - `lab_named_match_offers` (state: pending → initiator_accepted → accepted | declined | expired)
  - `lab_dm_threads` (canonical pair ordering user_a < user_b, UNIQUE per match_offer)
  - `lab_dm_messages` (text-only, ≤2000 chars, CHECK constraint enforced)
  - `lab_match_suppressions` (canonical pair, 90-day suppression)
  - `touch_lab_dm_thread_last_message_at` trigger
  - Full RLS: parties read/write; service role bypass

## Files created

### Lib
- `src/lib/lab/named-match/fingerprint.ts` — 8-signal scorer + anonymous payload builder
- `src/lib/lab/named-match/match-engine.ts` — pair selection + guardrails
- `src/lib/lab/named-match/named-match-auth.ts` — Basic+ gate, service ctx, canonical pair helper

### API
- `src/pages/api/lab/named-match/offers.ts` — GET pending offers
- `src/pages/api/lab/named-match/offers/[id]/accept.ts` — POST accept (advances state, opens thread on mutual accept)
- `src/pages/api/lab/named-match/offers/[id]/decline.ts` — POST decline (adds suppression)
- `src/pages/api/lab/named-match/threads.ts` — GET thread list
- `src/pages/api/lab/named-match/threads/[id]/index.ts` — GET thread + messages
- `src/pages/api/lab/named-match/threads/[id]/messages.ts` — POST send message (+ DM push)
- `src/pages/api/lab/named-match/threads/[id]/messages/read.ts` — POST mark read
- `src/pages/api/lab/named-match/threads/[id]/close.ts` — POST close (adds suppression)
- `src/pages/api/lab/reports/[id]/toggle-discoverable.ts` — POST flip discoverable flag
- `src/pages/api/cron/detect-named-matches.ts` — nightly detector + push

### UI
- `src/components/lab/NamedMatchOffersRail.tsx` — pending-offers feed
- `src/components/lab/NamedMatchOfferCard.tsx` — single offer card (anonymous-only payload)
- `src/components/lab/DMThreadsList.tsx` — list of threads with expand-in-place
- `src/components/lab/DMThreadView.tsx` — message bubbles + composer (≤2000 char)
- `src/components/lab/DiscoverabilityToggle.tsx` — per-experience opt-in toggle

### Scripts
- `scripts/_smoke-test-named-match.ts` — 20 synthetic reports / 5 users / 8 known-positive pairs

## Files modified

- `vercel.json` — added `/api/cron/detect-named-matches` cron at 10:00 UTC daily
- `src/pages/lab.tsx` — imported the 3 new UI pieces; mounted offers rail + threads list + discoverability toggle for Basic+ users; Free continues to see the existing `LabPaywallSurface` teaser

## 8-signal weights (settled)

| Signal          | Weight |
|-----------------|--------|
| phen_family     | 0.30   |
| subfamily       | 0.25   |
| descriptors     | 0.15   |
| geo             | 0.13   |
| decade          | 0.07   |
| time_of_day     | 0.05   |
| multi_witness   | 0.025  |
| media           | 0.025  |
| **sum**         | **1.00** |

- `CONFIDENCE_STRONG = 0.85` → eligible for offer
- `CONFIDENCE_AGGREGATE = 0.70` → Hints rail only
- Hard floor: phen_family AND subfamily must BOTH match for confidence ≥ 0.60 (else clamped to 0.59)
- `signal_overlap_count` = # signals scoring ≥ 0.5 (surfaced in the anonymous card)

## Geo decay

Piecewise linear, per spec: 1.0 ≤25mi → 0.5 @100mi → 0 @500mi.

## Cadence + suppression

- Max **1 NEW offer per user per 7 days** (enforced in `selectOffersWithGuardrails`; counts toward BOTH parties).
- Offers expire after **14 days** (cron sweep flips state → `expired`).
- Decline → 90-day suppression for the (user_a, user_b) pair.
- Thread closure → 90-day suppression for the same canonical pair.
- Existing-offer dedup via UNIQUE(initiator_report_id, recipient_report_id) AND a canonical-id pair check.

## Privacy floor (HARD)

Pre-mutual-acceptance, the offer rows only carry:
- `phen_family` (e.g. `ufos_aliens`)
- `decade` (e.g. 1990)
- `signal_overlap_count` (e.g. 6 of 8)
- `distance_bucket` (`within_25mi` | `25_100mi` | `100_500mi` | `over_500mi` | `unknown`)

No display_name, no exact coords, no photo, no verbatim text leaks via `GET /offers`. Identity only surfaces via `GET /threads/[id]` after the offer transitions to `accepted` (which opens the thread).

## Smoke test results

`npx tsx scripts/_smoke-test-named-match.ts`:

```
Pair stats:
  total pairs scored:        190
  same-user pairs (skipped): 30
  strong (≥0.85):            9
  aggregate (0.70-0.85):     0
  noise (<0.70):             151

Strong pairs:
  A1 × B1   conf=0.975  overlap=7/8
  A2 × B1   conf=0.975  overlap=7/8
  A4 × B3   conf=0.950  overlap=6/8
  C1 × D1   conf=0.950  overlap=6/8
  C1 × D2   conf=0.950  overlap=6/8
  C2 × D1   conf=0.950  overlap=6/8
  C2 × D2   conf=0.950  overlap=6/8
  A1 × B2   conf=0.875  overlap=6/8
  A2 × B2   conf=0.875  overlap=6/8

Grading (vs expected strong-match set of 8):
  TP=8  FP=1  FN=0
  precision=88.9%
  recall=   100.0%

PASS
```

The single FP (`A2 × B2`) is a North Carolina triangle pair sharing 6/8 signals — strictly within the matcher's design intent; it was just not on my hand-listed positives.

## Push + email cadence

- **Offer push** fires once per offer to the initiator on the cron pass that creates it. Cadence cap already guaranteed ≤1 per user per 7 days. Documentary tone: *"Another contributor's account shares X of 8 signals with your <decade> <family> account. Visit My Record to view."* Deep-link `/lab#offers`.
- **DM push** fires per message to the counterparty (interactive surface, no 7-day cap on DMs themselves — VAPID push subscription + thread state is the consent). Copy: *"You have a new message in your named-match thread."* Deep-link `/lab#thread-<threadId>`.
- **Email weekly digest** — NOT shipped in this PR. The watchlist digest infra exists; folding a "named-match this week" section into the same Sunday email is a logical follow-up. Tracked as an open item.

## Typecheck status

`npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "named-match|NamedMatch|DM|named_match|dm_"` → **clean (no output)**. The broader typecheck has pre-existing `scripts/*` errors unrelated to this PR.

## Open questions for founder

1. **Free-tier discoverable behavior.** Current `toggle-discoverable` allows ANY tier to flip the flag, including Free. A Free user can opt in to be discovered by Basic+ contributors (their report can match into a Basic user's offers rail). The Free user themselves still cannot see/accept offers. Is this desired (it grows the matchable pool) or should we restrict the toggle to Basic+ only?
2. **Recipient push on `initiator_accepted` transition.** Right now, the recipient only learns about the awaiting-them offer on their next site visit (the cron only pushes the initiator at offer-creation time). Do we want a second push when the initiator accepts so the recipient knows it's their turn? My instinct says yes-with-cap but I left it out to respect the "max 1 push per week" panel rule until you confirm.
3. **Email digest section.** Bundle named-match offers into the watchlist Sunday digest, or fire a separate weekly named-match digest, or skip email entirely (push only)?
4. **Subfamily derivation.** I derive subfamily from `paradocs_assessment.subfamily / sub_pattern / sub_family` with a fallback to first-matching `craft_shape_*` descriptor. If a more authoritative subfamily exists (e.g., a column we haven't surfaced yet), the matcher's recall could rise materially.
