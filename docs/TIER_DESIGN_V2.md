# Tier Design v2 — Subscription Architecture Spec

**Status:** LOCKED · May 16, 2026
**Supersedes:** Original tier design from migration `003_subscriptions.sql` + `011_fix_subscription_tiers.sql`
**Migration:** `supabase/migrations/20260516_tier_design_v2.sql`
**Task:** E0.5 (Track E)
**Single source of truth:** this file. Any divergence between this and a session prompt — this wins.

---

## Why this exists

The original tier structure (free / basic / pro / enterprise at $0 / $9 / $29 / $99) was designed for a different Paradocs than the one shipping today. After the encyclopedia → tag-vocabulary pivot, the Lab V10.14 consolidation, and the introduction of Sonnet 4.6-powered Story analysis + Ask the Unknown, the original gates have two problems:

First, **they gate the wrong things.** The 5-reports-per-month submission cap on Free rate-limits the engagement loop we most want to encourage; the 10-saves-max cap punishes the same. Meanwhile the expensive AI features (Sonnet 4.6 generation, daily push alerts) are effectively ungated, so the per-user variable cost on Free scales unbounded while conversion pressure points are misaligned with high-intent moments.

Second, **the price points have shifted.** Production pricing was lowered to $5.99 Basic / $14.99 Pro in V9.6 T1.2, but the seed migrations still show $9 / $29 and Stripe products at the new prices haven't been configured. The tier-feature spec needs to align with the price-revision reality, which means rethinking what's a Basic feature vs. a Pro feature at the new spread.

Third, **the product is now mass-market.** A mass-market consumer subscription at $5.99 entry requires a Free tier that's truly generous (Spotify model: free is the funnel, not a teaser) and conversion triggers that fire at moments of demonstrated intent — not at first touch.

The panel review of UX, conversion, mass-market growth, AI cost economics, retention, and pricing strategy lenses converged on the architecture below.

## Strategic principles

The architecture is built on five non-negotiables that came out of the panel:

**Free is the entire funnel.** Submissions are corpus growth — gating them costs us our own data-gathering machine. Saves are engagement signal — gating them filters out our highest-LTV future subscribers. Both stay unlimited on Free.

**Gates fire on demonstrated intent, never first touch.** A user who's submitted one experience and got an AI Story analysis understands the product. THAT's when the paywall fires for their second submission. Not before they've seen value.

**The Free tier owns one fully-realized "wow" moment.** Every Free user gets one complete Story analysis on their first submission — RADAR + all 3 SIGNAL cards + 3 Ask-the-Unknown questions tied to that experience. This is the shareable moment, the screenshot, the TikTok-able output. Without it, no Free user converts to anything because no Free user understands what they're missing.

**AI cost ceilings, not just conversion gates.** Sonnet 4.6 is real spend. Free users get capped Ask-the-Unknown (2/day) and one Story analysis to bound cost per user. These caps double as conversion triggers but their primary job is variable-cost control.

**Same tier structure across all billing rails.** Web Stripe / iOS StoreKit / Android Play Billing all entitle the same tier. RevenueCat abstracts the platforms; the entitlement engine is single-source-of-truth.

## The three tiers

### Free — "Explorer"

The acquisition tier. Everyone signs up here. The goal is to fill the funnel, build the corpus, and deliver enough demonstrated value that upgrade is a no-brainer.

**Browsing & discovery (all unlimited):**

- Entire encyclopedia, /explore Browse by Category, /discover Today feed, full-text search
- Every approved report — user-submitted and indexed
- Map view of submissions
- Profile + account management

**Contribution & engagement (all unlimited):**

- Submit unlimited experiences
- Save unlimited reports (bookmark)
- Comment on reports (when comments ship)
- React to reports

**AI features (the hook):**

- One full AI Story analysis on the user's first submitted experience: RADAR map + SIGNAL Cards 1, 2, 3 + 3 Ask-the-Unknown questions tied to that experience
- Subsequent submitted experiences get the cheap deterministic surfaces only: RADAR + SIGNAL Cards 1 and 2 (fingerprint + cluster size — no Sonnet calls). Card 3 ("Did You Know") and Ask-the-Unknown for that experience render a locked-state preview with upgrade CTA.
- 2 Ask-the-Unknown questions per day across the platform, regardless of which experience they're tied to. Hard cap enforced server-side. Resets at midnight UTC.
- 5 Constellation match unlocks (existing PaywallModal gate, unchanged).

**Communication:**

- Weekly email digest opt-in (the existing weekly-digest cron)
- No daily push notifications (Signal Alerts are Basic+)
- Notification bell + in-app notifications (when T1.9 ships) — all users

**What's NOT in Free:**

- Daily Signal Alerts push notifications
- Advanced search filters (multi-dimensional combinations)
- Personal analytics dashboard on /lab
- Data export, API access, bulk import
- Comparative Story mode
- Priority Sonnet model

### Basic — "Enthusiast" — $5.99/mo or $59.88/yr ($4.99/mo equivalent)

The conversion tier. The "obvious next step after I tried the free experience and want more." Target conversion: 4-8% of monthly actives. Net margin after 15% platform fee + Sonnet usage: ~$1.50-3.50/mo per subscriber.

**Includes everything in Free, plus:**

- Unlimited full AI Story analysis on every submitted experience (Cards 1-3 + Ask tied to each)
- Unlimited Ask-the-Unknown questions across all experiences (no daily cap)
- Daily Signal Alerts push notifications: pushed when patterns shift in your local cluster (the existing signal-alerts cron, gated to Basic+)
- Daily personalized email digest (replaces weekly)
- Constellation: unlimited match unlocks (PaywallModal stops firing for paid users)
- Advanced search: combine 3+ filters simultaneously (region × date-range × source × credibility × phenomenon-type)
- Personal analytics dashboard on /lab: your submission patterns over time, your "research footprint" (categories submitted, regions covered, comparative timing)

**Sonnet model:** Sonnet 4.5 as the primary model for Card 3 + Ask, with Sonnet 4.6 fallback (acceptable quality for the tier).

### Pro — "Researcher" — $14.99/mo or $149.88/yr ($12.49/mo equivalent)

The power-user / researcher tier. Target conversion: 0.5-1.5% of MAU. Net margin after 15% platform fee + Sonnet usage: ~$5.50-8.50/mo per subscriber.

**Includes everything in Basic, plus:**

- Comparative Story mode: multi-experience pattern analysis. The Tier 2 backlog item gets promoted here as the Pro differentiator (e.g., "compare RADAR of your 3 most-recent submissions side by side").
- Primary Sonnet 4.6 model on Card 3 + Ask (guaranteed, no fallback). The user-perceptible quality delta is modest but real, and it's a clean Pro differentiator.
- Data export: CSV / JSON of your saves, your submissions, your AI insights (full retroactive history).
- API access: 1,000 calls/month for personal research tools / integrations.
- Bulk import: upload a structured file (CSV / JSON) of historical sightings/journal entries to retroactively populate your archive.
- Priority email support: 24-hour SLA on response (vs. best-effort for Free/Basic).
- Early access to new AI features: comparative mode launches Pro-first, then Basic. Future AI surfaces follow the same pattern.

### Enterprise — admin-only, unchanged

$99/mo legacy tier, never surfaced to the public tier list (filtered out in `src/pages/api/subscription/tiers.ts`). Used internally for admin accounts and any future organizational deal. Not part of v2 redesign scope.

## Free trial mechanics

**When the trial fires:** the moment a user submits their first experience. Peak intent — they've just invested ~5-15 minutes in detailing something personal, the Story analysis is generating, and the next thing they'd want to do is keep using the product. This is when they'll click Subscribe.

**What the trial offers:** 7 days of Basic tier ($5.99/mo equivalent). Auto-activated, no payment method required upfront. Trial expiration brings the user back to Free unless they convert.

**During the trial:** the user sees Basic-tier UI everywhere (no locked-state CTAs on Story Card 3, no Ask-the-Unknown counter, daily push alerts active). A persistent unobtrusive header chip shows "Trial: X days left — Continue at $5.99/mo" linking to the upgrade flow. The chip turns urgent (color + countdown emphasis) at 2 days remaining.

**Day 6 conversion email:** "Your 7-day Basic trial ends tomorrow." With a one-click "Continue" CTA. Sent via existing email infrastructure.

**Day 7 expiration:** trial auto-converts to Free, the unconverted user sees the next day a one-time "Welcome back to Free" email summarizing what they had, with one explicit upgrade CTA. The Story Card 3 generated during trial stays accessible (we don't take back content the user already saw); future submissions get the Free tier treatment.

**Fraud protection:** one trial per email address per Stripe customer per device fingerprint. New email + new card + new device = new trial; otherwise blocked. RevenueCat handles this on native; web checks Stripe customer ID + cookie ID at trial-start.

**Edge cases worth flagging:**

- User submits first experience, doesn't convert, then submits a second experience two weeks later. Second submission gets Free-tier treatment (Cards 1-2 only). The first-experience hook is permanent for that experience, not for the user.
- User subscribes to Basic during trial, then cancels. Behaves like a normal cancel — keeps Basic through the originally-trial-replacing first billing cycle, then drops to Free.
- User signed up before T1.8 / E0.5 ship date. Existing users don't get retroactive trials; the trigger is "first submission after E0.5 deploy." Pre-existing submitters were already past the hook moment.

## Conversion trigger surfaces — where the paywall fires

Six surfaces, each tied to a high-intent moment, never first touch:

**Second submission attempt.** When the user starts their second experience submission flow, after the first Story analysis is complete, show inline interstitial: "Your full Story analysis is part of Basic. Continue submitting for $5.99/mo." Skip-able once per submission; persistent on the Story tab card-3 locked state for that experience.

**Fourth Ask-the-Unknown question of the day.** Server-side 429 with payload `{ "upgrade_to": "basic", "reason": "daily_ask_cap" }`. Client renders modal: "You've asked 2 questions today. Unlock unlimited with Basic, $5.99/mo." Counter visible on Ask tab: "2 of 2 today."

**Sixth Constellation match unlock attempt.** The existing PaywallModal, converted from waitlist-capture to live purchase (E2.3). Behavior matches today's model — 5 free unlocks, then the modal.

**Data export attempt.** Pro feature. Export button visible on saves/submissions UI; click triggers "Pro unlocks data export — $14.99/mo" modal.

**Advanced search activation.** When user adds a 3rd filter dimension in /explore, show inline upsell: "Combine 3+ filters with Basic — $5.99/mo." 2-filter combinations stay free.

**Ambient Premium discoverability.** A "Premium" chip in the top-right of the Lab tab (and other anchor surfaces) is always visible, links to `/account/subscription`. Not naggy — just present. Combats the "I didn't know there was a paid version" problem.

## AI cost economics — back-of-envelope

Per-user variable cost is the part of the model where Free has to be carefully bounded. Sonnet 4.6 at $3 input / $15 output per million tokens, typical Card 3 generation ~800 input + 200 output tokens = ~$0.005 per generation. Typical Ask question ~1500 input + 250 output = ~$0.008 per question.

**Free user:**

- First experience: 1 Card 3 generation (~$0.005) + up to 3 Asks during initial onboarding (~$0.024) = ~$0.03 one-time
- Subsequent: only Cards 1-2 (deterministic, no Sonnet) + 2 Ask/day cap × ~30 days/mo if hyperactive = ~$0.48/mo ceiling
- Realistic average: most Free users never ask anywhere close to the cap; expected variable cost ~$0.05-0.15/mo

**Basic user at $5.99 (gross $5.09 after 15% platform fee):**

- 5-15 submissions over the user's lifetime × 1 Card 3 each = ~$0.03-0.08 one-time
- ~30 Asks/month at typical usage = ~$0.24/mo
- Daily push alerts: pure infrastructure cost, ~$0.001/mo per user
- **Total variable cost: ~$0.25-0.50/mo. Net margin: $4.50-4.85/mo per Basic subscriber.**

**Pro user at $14.99 (gross $12.74 after 15% platform fee):**

- 10-30 submissions × Card 3 each = ~$0.05-0.15 one-time
- ~80 Asks/month at heavy usage = ~$0.64/mo
- Comparative Story mode: additional Sonnet calls, ~$0.10/mo
- Early-access AI features: budget ~$0.30/mo headroom
- API: ~1000 calls × small cost = ~$0.10/mo
- **Total variable cost: ~$1.20-2.00/mo. Net margin: $10.70-11.50/mo per Pro subscriber.**

Both tiers have healthy margins that scale linearly with revenue. The Free → Basic conversion economics are strongly positive even at 4% conversion of MAU: at 10k MAU and 4% conversion that's 400 Basic at $4.50-4.85 net = $1,800-1,940/mo recurring revenue per 10k MAU floor.

## Cross-platform billing alignment

Three rails, one entitlement model:

| Rail | Platform | Implementation | Platform fee |
|---|---|---|---|
| Stripe | Web | Existing `/api/subscription/create-checkout` (E0.2 to configure products) | 2.9% + 30¢ |
| StoreKit | iOS | RevenueCat SDK in Capacitor build (E2.1) | 15% (Small Business Program, E0.3) |
| Play Billing | Android | RevenueCat SDK in Capacitor build (E2.1) | 15% (auto-applied to <$1M/yr earners, E0.4) |

The `/account/subscription` page (E2.2) routes the upgrade button to the correct rail via `Capacitor.isNativePlatform()` detection. Webhooks from all three providers update the same `user_subscriptions` table. The same user is identified across rails via Supabase user_id + email + (for native) RevenueCat appUserId.

A user who subscribes on iOS should not be charged again on web. RevenueCat handles cross-platform entitlement reconciliation transparently.

## Backward-compat with existing feature keys

The migration updates the existing `subscription_tiers.features` and `subscription_tiers.limits` JSONB columns rather than introducing new column names, so all existing consumers (`hasFeature()`, `isWithinLimit()`, `getSubscriptionWithUsage()`) keep working. Some keys gain new enum values; some get new keys added; deprecated keys (`custom_reports`, `team_members`) stay in the JSONB as `false` for all customer-facing tiers.

New feature keys introduced:

- `story_analysis`: `'first_only' | 'unlimited'` — controls Story tab Card 3 + Ask gating
- `ask_the_unknown`: `'limited' | 'unlimited'` — derived; UI uses this directly
- `signal_alerts_push`: `boolean` — gates daily push cron
- `email_digest`: `'weekly' | 'daily'` — controls digest cron frequency for that user
- `constellation_unlocks`: `'limited' | 'unlimited'` — gates PaywallModal
- `comparative_story`: `boolean` — Pro-only Story mode
- `sonnet_model_priority`: `'fallback' | 'primary'` — Pro guarantees 4.6
- `early_access`: `boolean` — Pro gets new AI features first

New limit keys introduced:

- `story_analysis_max`: `number (-1 = unlimited)` — 1 for Free, -1 for paid
- `ask_questions_per_day`: `number (-1 = unlimited)` — 2 for Free, -1 for paid
- `constellation_unlocks_max`: `number (-1 = unlimited)` — 5 for Free, -1 for paid
- `free_trial_days`: stored on `subscription_tiers` as a new column (not in limits JSONB) — 7 on Basic, 0 elsewhere

Existing keys that change semantics:

- `reports_per_month` on Free: was 5, becomes -1 (unlimited) per panel decision
- `saved_reports_max` on Free: was 10, becomes -1 (unlimited) per panel decision
- `ai_insights` on Free: was `'view_only'`, becomes derived from `story_analysis` — kept as `'view_only'` for backward compat consumers, but no longer load-bearing

## Implementation map

The spec lock-in unblocks these implementation tasks:

- **E0.6** — Story tab locked-state UI on Free 2nd+ experiences. Reads `story_analysis === 'first_only'` and renders Card 3 + Ask as locked previews. Blocked by this spec.
- **E0.7** — Ask the Unknown server-side daily cap. Reads `ask_questions_per_day` limit; tracks via new `ask_question_log` table; returns 429 with upgrade payload when exceeded. Blocked by this spec.
- **E0.8** — Signal Alerts cron gating to `signal_alerts_push: true` users. Free users who opted into `your_signal` topic get a one-time "moved to Basic" push, then removed from topic. Blocked by this spec.
- **E1.2** — iOS subscription products created in App Store Connect at $5.99 + $59.88 (Basic) and $14.99 + $149.88 (Pro) with 7-day intro trial on Basic. Blocked by this spec.
- **E1.3** — Android subscription products created in Play Console matching iOS. Blocked by this spec.
- **E2.2** — Billing-provider abstraction in `/account/subscription` routes by `Capacitor.isNativePlatform()`. Blocked by this spec.
- **E2.3** — PaywallModal converted from waitlist to live purchase; reads `constellation_unlocks === 'limited'` for trigger logic. Blocked by this spec.
- **E2.4** — Free-tier limit enforcement audit verifies every gate is actually backed by server-side rejection (not just UI). Blocked by this spec.

T1.8 (account-first onboarding) needs to integrate the trial-activation hook directly: on first-experience submission, call `/api/subscription/activate-trial` (new) which creates a 7-day Basic subscription record. This wiring lives in T1.8, not in this spec, but the contract is defined here.

## Open questions / future v2.1 work

A few things worth noting as future work, not blocking E0.5:

**Annual pricing discount calibration.** Current spec uses $59.88/yr Basic (no discount, ~17% effective discount vs 12 × $5.99 = $71.88) and $149.88/yr Pro (similar). Industry norm is 16-20% annual discount on $5-15/mo subscriptions; we're in that band. Worth A/B testing post-launch.

**Intro pricing.** Optional first-month-at-$1.99 lever is not in v1 launch; could test post-launch.

**Pro → Business tier.** If we see meaningful uptake of API access + bulk import among the Pro user base, splitting off a Business tier at $39-49/mo with higher API limits, team seats, dedicated support is the natural v3 move.

**Lifetime/founders pricing.** Pre-launch waitlist users might be a candidate for a one-time founders deal. Out of scope for v2.

**Free → Basic A/B on trial length.** 7 days is the decision; once we have conversion data, test 14-day variant.

## Edge cases the implementation must handle

- User on trial cancels mid-trial → falls back to Free immediately or stays Basic until trial end? Decision: stays Basic until original trial end date, then drops to Free. No double-jeopardy.
- User on Basic downgrades to Free → existing data preserved (per existing `/account/subscription` policy); future submissions get Free treatment.
- User on Pro downgrades to Basic mid-cycle → keeps Pro features through billing period end, then Basic.
- User upgrades Basic → Pro mid-cycle → immediate Pro access, prorated via Stripe.
- Trial user submits second experience → counts against the unlimited Basic during trial; on trial end, that second experience's Story Card 3 stays accessible (no retroactive lockout).
- User on App Store subscription wants to manage via web → opens RevenueCat-aware billing portal that surfaces native-managed status with "manage in App Store" link. Apple requires native flows to be managed natively per their guidelines.

---

**Single-source-of-truth:** this file. Any divergence between this and a session prompt — this wins. Last updated: May 16, 2026.
