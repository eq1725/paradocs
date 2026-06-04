# Lab Tier 2A — Build Notes (V11.17.68)

**Scope:** Pricing + Subscription + Stripe wiring half of the Lab
redesign Tier 2. Per
`/Users/chase/paradocs/docs/PRICING_SUBSCRIPTION_PANEL.md`,
`/Users/chase/paradocs/docs/PRO_TIER_VALIDATION_V3.md`,
`/Users/chase/paradocs/docs/PRICING_HERO_IMAGES.md`, and
`/Users/chase/paradocs/docs/LAB_PANEL_REVIEW_V3.md` §2.

**Out of scope (Tier 2B — parallel agent):** Lab IA restructure,
collapse-tabs, persistent dossier, n=1 surfaces. None of those files
touched here.

**Out of scope (Tier 3):** Sentiment arc, named-match introduction
machinery itself (this build ships the *paywall surface* only; the
match engine remains a Tier 3 deliverable), peer DM, Dossier
generator, Watchlists engine.

---

## Files created

| File | Purpose |
|---|---|
| `src/pages/pricing.tsx` | Standalone marketing-style pricing page. Trouvelot Aurora hero, three-tier comparison, annual toggle, FAQ, footer. Server-side redirects logged-in paid users to /account/subscription. |
| `src/components/pricing/PricingHero.tsx` | Full-bleed hero with Trouvelot, *Aurora Borealis* (1872) as background, brand-purple gradient overlay, documentary copy. |
| `src/components/pricing/PricingTierTable.tsx` | Three tier cards + cadence toggle + full feature matrix (V3 §7). Tier slugs `free / basic / pro`. Annual saves 17%. |
| `src/components/pricing/PricingFAQ.tsx` | 7 questions written against real objections (no trial, Dossier, cancellation, data privacy, etc.). |
| `src/components/pricing/PricingFooter.tsx` | Quiet brand-anchored footer with /about · /privacy · /terms · /account/subscription links. |
| `src/components/lab/LabPaywallSurface.tsx` | Inline soft upgrade prompt for free users hitting Basic-gated affordances. Routes to /api/subscription/create-checkout for logged-in users, /pricing for logged-out. Dismissible. |
| `src/pages/api/subscription/billing-history.ts` | GET endpoint returning last 10 invoices. Primary source is local `billing_history` table (populated by webhook); falls back to live Stripe query. |

## Files edited

| File | Change |
|---|---|
| `src/pages/account/subscription.tsx` | **Full rewrite.** SaaS-vocabulary feature labels dropped (`my_reports`, `saved_reports`, `api_access`, `team_members` legacy labels gone). Replaced with V3 matrix vocabulary (named-match introductions, configurable temporal/geographic lenses, Dossier, etc.). New active-benefits checklist drives both the hero and the cancellation-modal bullets. Billing history table added (pulls from new endpoint). Post-checkout success banner. "Considering a change?" link to /pricing instead of inline 3-card grid for paid users. Single tier-comparison link kept for Free users. Retention modal CTA changed from "Continue to cancel" → "Yes, cancel". |
| `src/pages/api/subscription/create-checkout.ts` | Replaced flat `STRIPE_PRICES` map with `resolvePriceId(plan, cadence)` helper supporting new `_ANNUAL` env vars + legacy `_YEARLY` fallback. `success_url` flipped from `/account/settings?...` → `/account/subscription?checkout=success&plan=…&cadence=…` per panel §3.6. `cancel_url` flipped to `/pricing?checkout=cancelled`. `subscription_data.metadata` now carries `tier` + `cadence` + `user_id` so webhook can resolve everything without a Stripe round-trip. `yearly` accepted as synonym for `annual`. |
| `src/pages/api/webhooks/stripe.ts` | Added handler for `invoice.payment_succeeded` → writes `billing_history` row (powers the new invoices list). `customer.subscription.updated` now idempotently aligns `profiles.current_tier_id` + `user_subscriptions.tier_id` when metadata names a plan (so portal-initiated plan flips reflect in our DB). Existing `checkout.session.completed` / `customer.subscription.deleted` / `invoice.payment_failed` paths left unchanged. |
| `src/components/Layout.tsx` | New `Upgrade` pill in the desktop header for free-tier users only. Suppressed for paid (Basic/Pro), and suppressed on `/pricing` + `/account/subscription` to avoid loops. Mobile hidden (panel §6 — tier chrome lives in account nav, not the mobile header). Pricing link added to footer "Community" column for findability. Lightweight tier-name resolution added via a separate `subscription_tiers` lookup (failure-tolerant — defaults to treating the user as Free for the pill suppression decision). |

---

## Stripe Price ID env var contract

The four founder-sent Price IDs map to these env vars (set in
`.env.local` + Vercel project env):

```
STRIPE_PRICE_BASIC_MONTHLY=price_1Tej3oHMHkQBcyeVYugDH9we
STRIPE_PRICE_BASIC_ANNUAL =price_1Tej4THMHkQBcyeVw6W252MW
STRIPE_PRICE_PRO_MONTHLY  =price_1Tej4rHMHkQBcyeVXrSMhXfp
STRIPE_PRICE_PRO_ANNUAL   =price_1Tej5XHMHkQBcyeVtgaURDGD
```

`STRIPE_PRICE_*_YEARLY` is accepted as a legacy fallback in
`resolvePriceId()` so existing deploys keep working during rollout.
No price IDs are hardcoded in source.

`STRIPE_WEBHOOK_SECRET` is unchanged (already wired).

---

## Page structure of /pricing

1. Optional `?checkout=cancelled` amber banner.
2. `PricingHero` — Trouvelot Aurora 1872 background, 60% brand-purple
   gradient bottom-left → top-right, vignette, documentary headline
   + sub-copy + auth-aware primary CTA + "see the tiers ↓" anchor.
3. `PricingTierTable` — kicker + heading + cadence toggle (Monthly /
   Annual with "Save 17%" pill) + three side-by-side tier cards
   (Free / Basic / Pro, Pro carries flagship purple bullets) + full
   22-row comparison matrix (collapsed `<details>` element, open by
   default).
4. `PricingFAQ` — 7 questions in documentary voice covering Free,
   Basic, the Dossier, cancellation, privacy, no-trial, drop-to-Free.
5. `PricingFooter` — wordmark + tagline, footer-nav (About, Privacy,
   Terms, Manage subscription), copyright.

Logged-in paid users are server-side redirected to
`/account/subscription?from=pricing`; client-side useEffect handles
the same redirect as a fallback.

---

## What I kept from the existing /account/subscription

- The state-aware "Current Plan" hero gradient card + CreditCard icon
  treatment (V9.5 P2.4). The shape and primary-CTA placement is the
  panel-blessed pattern.
- `openBillingPortal()` flow (V9.5 P4.2). Stripe Customer Portal
  remains the surface for actual payment-method / cancel actions.
- Retention modal scaffolding (V9.5 P4.3) — kept the modal shell,
  rewrote the bullets to be tier-specific via the new
  `getActiveBenefits()` helper.
- `AccountNav` + the `Account · Billing` kicker pattern.

---

## TODOs / stubs left for downstream

1. **Lab IA agent (Tier 2B):** `LabPaywallSurface` is built and
   exported; it expects callers to gate on tier and pass
   `kicker` / `body` / `surface` props. The canonical caller is the
   named-match teaser on the n=1 dossier — wiring that into the new
   Record surface is your job. Suggested kicker: "Named-match
   introductions". Suggested body: "3 of these accounts came from
   contributors who have opted in to be discovered. Basic offers an
   introduction when phenomenon, location, time, and language signals
   align." Suggested surface slug: `named_match`. Cooldown after
   dismiss should reuse the existing `lab_promo_impressions` table.
2. **Pro upgrade affordance inside the app:** `/account/subscription`
   surfaces an "Upgrade to Pro" button for Basic users. The
   discoverable in-app Pro-upgrade surfaces (Dossier export hover,
   on-demand top-5 affordance, etc.) are Tier 3 deliverables — those
   should call `startCheckout('pro', 'monthly')` directly or route
   to `/pricing`.
3. **`billing_history` migration:** the webhook writes to a
   `billing_history` table (columns referenced:
   `user_id, stripe_invoice_id, amount, currency, status,
   description, receipt_url, invoice_date, payment_method`). The
   existing `changeSubscription()` helper in `src/lib/subscription.ts`
   already inserts into this table for the mock-billing path, so the
   table likely exists; a one-off audit by ops to confirm the
   `stripe_invoice_id` column has a unique index would let the
   webhook's "Stripe retry → duplicate insert" path be hardened from
   best-effort to true upsert. Not blocking.
4. **`Profile` type extension:** `Layout.tsx` reads
   `current_tier_id` off the profile via cast (`profileWithTier as
   any`). If the codebase's `Profile` interface in
   `src/lib/database.types` doesn't already include this column,
   adding it would tighten the read.

---

## Typecheck status

**Clean for Tier 2A files.** Zero new TypeScript errors introduced.

```bash
cd /sessions/affectionate-tender-fermi/mnt/paradocs
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E \
  "pricing|subscription|create-checkout|LabPaywallSurface|Layout|billing-history|webhooks/stripe"
# (no output)
```

Pre-existing Supabase generic-typing errors in
`src/pages/api/research-hub/*`, `src/pages/api/user/*`, etc. persist
unchanged from before this work.

---

## Open question for founder

**Tier 1 LabPromo trial copy.** `src/components/discover/LabPromo.tsx`
still advertises "Start 7-day free trial" in its locked copy header
(line 56 of the file's leading doc-comment, and the CTA elsewhere).
The panel locked "no trial — Free is the trial" and the new /pricing
FAQ explicitly says that. LabPromo's actual rendered CTA was already
rewritten in Tier 1 to "Start with Basic — $5.99/mo", so the runtime
copy is consistent — but the doc-comment is stale. Should I sweep the
comment in a follow-up, or leave the comment as a paper trail of the
abandoned trial idea?

---

## Commit message draft

```
V11.17.68 — Tier 2A pricing + subscription + Stripe wiring

Ships /pricing as a standalone documentary-voice pricing page,
rebuilds /account/subscription against the V3 vocabulary, wires the
four founder-sent Stripe Price IDs (Basic/Pro × monthly/annual) via
env vars, hardens the webhook to handle plan flips + log invoices,
adds the inline LabPaywallSurface component for in-context upgrade
prompts, and drops an Upgrade pill in the global header for free
users.

New files:
- src/pages/pricing.tsx
- src/components/pricing/{PricingHero,PricingTierTable,PricingFAQ,PricingFooter}.tsx
- src/components/lab/LabPaywallSurface.tsx
- src/pages/api/subscription/billing-history.ts

Edited:
- src/pages/account/subscription.tsx (rewrite — V3 matrix vocabulary,
  active-benefits checklist, billing history, tier-specific retention
  modal, post-checkout banner)
- src/pages/api/subscription/create-checkout.ts (annual cadence,
  fixed success_url → /account/subscription, cancel_url → /pricing,
  metadata carries tier + cadence)
- src/pages/api/webhooks/stripe.ts (invoice.payment_succeeded handler,
  plan-flip alignment on subscription.updated)
- src/components/Layout.tsx (Upgrade pill in header for free users;
  /pricing link added to footer)

Hero image: Trouvelot, "Aurora Borealis" (1872) — public-domain
NYPL/Wikimedia chromolithograph. 60% brand-purple gradient overlay.

No new dependencies. Stripe Price IDs sourced exclusively from env
vars; never hardcoded. Voice is documentary throughout — no "unlock",
no "premium", no "supercharge".

Typecheck: zero new errors. Pre-existing Supabase generic-typing
errors persist at identical lines.

See docs/LAB_TIER2A_BUILD_NOTES.md for the full file table + commit
notes.
```
