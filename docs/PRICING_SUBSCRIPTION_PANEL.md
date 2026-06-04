# Pricing + Subscription UX — Panel Memo

**To:** Chase
**From:** The Pricing Panel (six voices, convened June 2026)
**Re:** /pricing standalone vs. merged; /account/subscription rebuild; tier-state UI propagation; the cold-visitor conversion funnel; Stripe-checkout architecture
**Predecessors:** `/Users/chase/paradocs/docs/LAB_PANEL_REVIEW_V3.md` (gating matrix, locked tiers)
**Status:** Decisions in this memo are the spec the Lab Tier 2 build dispatches against.

---

## 1. TL;DR

- **Split, don't merge. `/pricing` ships as a standalone marketing-style surface; `/account/subscription` stays as the logged-in management surface.** The two pages serve different mental modes (deciding to pay vs. managing what you already pay for) and the copy, hierarchy, and CTAs diverge sharply. They cross-link, they don't collapse.
- **`/pricing` is written in museum-membership voice, not SaaS pitch-deck voice.** Hero leads with the Archive (200k+ reports) as the value object; tiers are framed as *depth of access to the corpus*, not feature lists. No green checkmarks, no "Most Popular" bursts, no countdown timers.
- **`/account/subscription` rebuilds around a single state-aware hero ("You're on Free / Basic / Pro" + the most relevant next action) and demotes the four-tier card grid to a comparison reference below.** The current page is most of the way there already — the rebuild is a copy and IA pass, not a from-scratch teardown.
- **Tier-state propagates through three surfaces, in priority order:** (1) the existing `TierBadge` next to the avatar in account chrome (already shipped), (2) in-context upgrade nudges on the gated surfaces themselves (the V3 paywall surface anchored to named-match teaser is the load-bearing one), (3) a single global header `Upgrade` pill for free users, suppressed entirely for paid users. No upgrade chrome bleeds into the catalogue browsing experience.
- **Keep Stripe Checkout hosted. Do not embed Stripe Elements.** The complexity cost of embedded Checkout is not earned back at our volume; Stripe-hosted captures trust signals (Stripe logo, SCA flows, Apple/Google Pay) that a custom-built form fights to replicate.
- **The conversion funnel is anchored to *one* paywall moment: the named-match teaser on the n=1 dossier.** Every other surface (LabPromo, CaseViewGate, ResearchHubPreview) routes to `/pricing` as a comparison page, but the actual conversion event is expected to happen inline on the user's own Record, where the value of upgrading is concrete and personal.

---

## 2. Audit summary

`/pricing` does not exist as a route. Four surfaces (`LabPromo`, `CaseViewGate`, `ResearchHubPreview`, the Stripe checkout `success_url`) reference `/pricing` and currently 404 — this is the most urgent surface to ship. `/account/subscription` exists at `src/pages/account/subscription.tsx`: it's a 685-line page that already has a state-aware "Current Plan" hero (V9.5 P2.4), a Stripe billing-portal redirect (V9.5 P4.2), a cancellation retention modal (V9.5 P4.3), and a three-card tier grid that uses the legacy SaaS feature vocabulary (`my_reports`, `saved_reports`, `ai_insights`, `data_export`, `api_access`, `team_members`) — none of which maps cleanly to the V3 gating matrix. `TierBadge` ships at `src/components/dashboard/TierBadge.tsx` with four variants (free/basic/pro/enterprise; enterprise is admin-only and filtered from public surfaces). Stripe is wired with hosted Checkout in `src/pages/api/subscription/create-checkout.ts`, falling back to a mock URL when `STRIPE_PRICE_*` env vars are unset (the legacy $9.99/$29.99 prices were retired in V9.6 to avoid charging at stale amounts). Webhook handler exists at `src/pages/api/webhooks/stripe.ts`. Billing portal redirect lives at `src/pages/api/subscription/billing-portal.ts`. There is no marketing-style pricing component anywhere in the tree.

---

## 3. Panel commentary

### 3.1 UI/UX Designer — mass-market consumer product

The thing the current `/account/subscription` page gets right is the state-aware hero — single sentence telling the user what they're on, single primary CTA. That pattern survives. The thing it gets wrong is everything below the fold: a three-up tier card grid is a SaaS reflex, and on a documentary product it reads as transactional in a way the rest of Paradocs is not. The visual hierarchy of cards-of-equal-weight forces the user into a comparison frame; what we want instead is *a default reading order* — Free is the baseline you're already in, Basic is the inflection point, Pro is the depth tier for the small number of users who want to extract data. That hierarchy is written into the layout, not the chrome.

For `/pricing` standalone: above the fold is a single hero with one sentence about the Archive and a quiet primary CTA ("Start with Basic"). Below it, a single column of three tier panels stacked vertically (not three-up grid) — each is full-bleed editorial, the way a museum site renders membership levels. Free is described first and at the same visual weight as Basic and Pro; this signals the product respects the free tier as a real product, not a friction layer. Comparison table sits below the three panels for the user who wants to verify which features sit where — collapsed by default on mobile, expanded by default on desktop.

The colors `tierColors` ship today (gray / blue / purple / amber) are fine for the dashboard surface but read as SaaS-genre on a marketing page. Use the editorial palette — muted purple accent on cream, no neon. Drop the icons (`User` / `Star` / `Zap` / `Building`) from the public-facing pricing display; they're cartoonish next to documentary typography. Keep them on the in-app `TierBadge` where size constraints earn them.

### 3.2 Subscription Business Model Strategist — freemium-to-paid

The current `/account/subscription` makes a strategic mistake: it shows the tier comparison grid to a paying user. A user who already pays does not need to be sold; they need to be reassured. The rebuild collapses the tier grid for active paid users into a single "Considering a change?" link that expands the comparison inline — and surfaces the comparison grid as default-open *only* for free-tier users on the same page. This is the cheapest possible churn-reduction move: paying users see less commerce chrome, not more.

The retention modal that ships today (V9.5 P4.3) is correctly designed — bullet list of what you'll lose, two-button modal, "Keep my plan" as primary, "Continue to cancel" as muted secondary. The single improvement: replace the generic four-bullet list with the user's *actual* active features at the tier they're cancelling from. "You currently have access to named-match introductions (5 pending), weekly Record re-analysis, and PDF export of your Record" lands harder than "Unlimited saves and RADAR pins."

The Pro tier remains the open question (V3 §7.2). At $14.99, the expected take rate among paying users is 5-15% of the Basic cohort — small enough that the panel does not recommend building a third dedicated landing block, but large enough that the Pro column should remain visible on `/pricing` and `/account/subscription`. The Pro upgrade path lives entirely inside `/account/subscription`, not on `/pricing` — the cold visitor's job is to commit to Basic; the existing Basic user discovers Pro from inside the app when they hit a Pro-gated affordance (export, top-5 on-demand match, daily refresh).

No annual pricing this quarter. Annual plans optimize for ARR at the cost of conversion friction; on a $5.99/mo product where the user's annual cost is $72, the discount needed to make annual compelling (typically 15-20%) costs more in revenue than it saves in churn. Revisit in 12 months when we have cohort data.

### 3.3 User Engagement / Retention Expert — behavioral

The conversion event we should optimize for is not the click on the `/pricing` page CTA. It is the moment on the n=1 dossier where the user sees: *"3 of these accounts came from users who have opted in to be discovered. Subscribe to Basic to see if any of them want to compare notes."* That is a paywall written against a specific, named affordance the user has already seen value in — three real other people who plausibly share the experience the user just typed out. The cold-visitor `/pricing` page exists to catch comparison shoppers and intentional buyers; the actual conversion funnel runs through the Record.

Implication for paywall placement: do not stack upgrade CTAs throughout the catalogue. A user browsing reports should not be hit with `Upgrade` pills on every fourth card. The single header `Upgrade` pill (free users only) is enough; everything else is in-context on the gated affordance itself, where the user has demonstrated intent. Suppression matters: dismissing the named-match teaser once should suppress the same surface for that user for ≥7 days. The `lab_promo_impressions` table (already shipped — task #9-12) is the right substrate for this; add a `dismissed_at` column and check it in the gate logic.

The free-tier "what you'd get with Basic" hover affordance: yes, but only on the surfaces where it's earned. On the n=1 temporal/geographic/sentiment strip, an unobtrusive `i` icon next to the surface title that expands a 1-sentence "Basic adds: configurable radius, decades shift, multi-dimension sentiment." Not a modal, not a sales pitch — a footnote.

Cancellation flow: the retention modal we ship is correct. Do not add a "downgrade to Free" intermediate step before cancel — that's a dark pattern and Paradocs is a documentary product, not a churn-and-win product. The user who wants to cancel can cancel in two clicks.

### 3.4 Visitor Conversion Specialist — landing-page conversion

A cold visitor lands on Paradocs via a shared report, a category page, or a phenomenon page — not the home page. The job of `/pricing` is to be findable, fast, and to close. Findable: link from the global header for logged-out users (`Pricing` link next to `Sign in`), link from the footer on every page. Fast: above-the-fold renders in <1s with no client JS dependency; the hero is server-rendered, the CTA is a plain `<Link href>`, the comparison table is below the fold and can be progressively enhanced. Close: the primary CTA on `/pricing` for a logged-out user is "Get started" (signup), not "Start Basic — $5.99/mo" (Stripe checkout). The signup flow itself routes paid-intent users to Stripe Checkout after account creation; this avoids the dropoff where a cold visitor commits to paying before they have an account.

Logged-in free users on `/pricing` see "Start Basic — $5.99/mo" as primary, routing straight to Stripe Checkout via the existing `/api/subscription/create-checkout` endpoint. Logged-in paid users on `/pricing` are redirected to `/account/subscription` with a banner ("You're already on Basic — manage your subscription here"), because there is no reason for a paying user to land on the marketing surface.

FAQ block is load-bearing for conversion — it catches the user who is interested but has objections. 5-7 questions, written against the actual objections (see §5.4 below): the questions about cancellation, data ownership, and what happens if you stop paying are the ones that actually move conversion; tier-comparison questions are filler and should be cut.

Trust signals: the Archive size (200k+ reports) is the single trust signal that matters. Do not add fake testimonials, do not add user counts before they exist, do not add logos of imaginary press coverage. One real numeric claim does more than four manufactured ones. When real testimonials exist post-launch, surface them; until then, the Archive does the work.

### 3.5 Brand / Editorial Voice — documentary

The cardinal rule for `/pricing` copy: **the page is about the Archive, not about the product**. The user is being invited to become a deeper participant in a record that already exists. Tier copy follows from that frame. Free is "the catalogue is open"; Basic is "the comparative depth opens"; Pro is "the working tools open." Never "unlock," never "supercharge," never "premium experience."

Specific vocabulary to avoid on all pricing surfaces: *unlock, premium, exclusive, supercharge, AI-powered, next-level, take it further, level up, upgrade your experience, member benefits, perks, savings, value*. The vocabulary that earns its place: *access, depth, comparison, the Archive, contributors, the record, your record, named introductions, the corpus, the catalogue*. Tier names stay lowercase in body copy (`basic`, `pro`), capitalized only in chrome (TierBadge, page titles, CTAs).

A worked example of right vs. wrong. **Wrong:** *"Basic unlocks unlimited Hints and AI-powered pattern matching to supercharge your research."* **Right:** *"Basic opens the named-match layer: when another contributor's account shares geographic, temporal, and phenomenon signals with yours, you can see who they are and, with their consent, compare notes."*

The price reads as a quiet detail, not a header. *"Basic — $5.99 / month."* Not *"$5.99/mo — Most Popular!"* The page is a museum membership card, not a feature comparison spreadsheet.

### 3.6 Stripe Integration Engineer — technical

Architecture: `/pricing` → button click → `/api/subscription/create-checkout` (existing) → Stripe-hosted Checkout → Stripe webhook (`/api/webhooks/stripe`) → updates `user_subscriptions` and `profiles.current_tier_id` → user lands on `success_url` → app reads tier from `useSubscription` hook → gates lift. This flow is already plumbed. The Tier 2 work is (a) building `/pricing` as the entry point and (b) fixing two specific Stripe redirect URLs.

Critical Stripe-side fix: `create-checkout.ts` currently sets `success_url` to `/account/settings?checkout=success` and `cancel_url` to `/account/settings?checkout=cancelled`. The post-checkout landing should be `/account/subscription?checkout=success` (the page that actually shows the user their new tier state) with a celebratory but quiet banner. Cancelled checkout should land back on `/pricing?checkout=cancelled` (so the user is back where they decided), not buried in settings.

The mock-checkout fallback when `STRIPE_PRICE_*` env vars are unset is correct and should stay — it prevents charging at the wrong amount during reconfiguration. Verify the Basic / Pro Stripe Price IDs are configured for $5.99 / $14.99 monthly before launch.

Embedded Stripe Elements vs. hosted Checkout: hosted wins for our scale. Embedded gives marginal conversion lift (~2-5% in published benchmarks) at the cost of (a) implementing SCA / 3DS flows in our own UI, (b) maintaining the form when Stripe ships changes, (c) losing Apple Pay / Google Pay one-tap unless we wire them ourselves, (d) the trust hit of users entering card details into an unfamiliar form. Stripe-hosted is the default for a reason. Revisit when our volume justifies a conversion-optimization engineer; not before.

One technical hardening item: the webhook handler should be idempotent on `customer.subscription.updated` events and should write a single source of truth for tier state. Verify the existing handler treats Stripe as the truth (not `user_subscriptions` table writes from the app) — any tier change must round-trip through Stripe to avoid drift between Stripe's view of the subscription and ours.

---

## 4. Recommended architecture — final decisions

### Q1 — /pricing standalone vs. merged with /subscription

**Decision: split.** `/pricing` is a public marketing surface for cold visitors, logged-out users, and comparison shoppers. `/account/subscription` is a logged-in management surface for users who already have a tier (including Free).

Differences:
- **Audience:** `/pricing` assumes no relationship; `/subscription` assumes one.
- **Hero:** `/pricing` opens with the Archive; `/subscription` opens with "You're on [tier]".
- **Primary CTA:** `/pricing` → "Get started" (logged-out) or "Start Basic" (logged-in free); `/subscription` → "Manage billing" (paid) or "See plans" (free).
- **Tone:** `/pricing` is editorial / museum-membership; `/subscription` is operational / account-management.
- **Cross-link:** `/pricing` has a footer link to `/account/subscription` for logged-in users; `/subscription` has a comparison sidebar that links to `/pricing` for "see the public comparison."

Logged-in paid users who hit `/pricing` are server-redirected to `/account/subscription` with `?from=pricing` so we can show a one-line "You're already on Basic" banner.

### Q2 — /pricing IA (see §5 for sample copy)

- **Above the fold:** Editorial hero (one image or static SVG, no carousel). One headline sentence about the Archive. One sub-line on the trio (catalogue / record / contributors). Single primary CTA. No tier prices in the hero.
- **Section 2 — The three tiers:** Three stacked editorial panels (not three-up grid). Each panel: tier name, price line, 1-paragraph framing, 4-6 bullet specifics drawn from V3 §2 matrix, single CTA.
- **Section 3 — The full comparison:** Collapsed/accordion on mobile, expanded on desktop. Sourced directly from V3 §2 matrix. No green checkmarks; use plain text values ("yes", "weekly", "configurable 10-500 mi").
- **Section 4 — Trust:** A single block stating the size of the Archive, how submissions work, and the consent model. No fake testimonials.
- **Section 5 — FAQ:** 5 questions, written against real objections (see §5.4).
- **Footer CTA:** Single block — logged-out gets "Get started free"; logged-in free gets "Start Basic — $5.99/mo"; logged-in paid gets the redirect handled at the route level.

### Q3 — /account/subscription rebuild

The page keeps its current architecture and gets a copy + IA pass:

```
[AccountNav: Profile · Settings · Subscription]

KICKER: Account · Billing
H1: Subscription

[Hero card — state-aware]
  Free:   "You're on Free. The catalogue is open. Basic opens the named-match layer."
          [See plans] →
  Basic:  "You're on Basic. Renews [date]."
          [Manage billing] [Change plan] [Cancel]
  Pro:    "You're on Pro. Renews [date]."
          [Manage billing] [Change plan] [Cancel]

[Active benefits checklist — paid users only]
  - Named-match introductions (mutual opt-in)
  - Configurable temporal & geographic depth
  - Weekly Record re-analysis
  - PDF export (Pro: + JSON)
  - Shareable private Record link

[Usage meters — kept from current page]
  - Reports submitted: unlimited (no meter, just the word)
  - Saves: usage / unlimited
  - Hints this week: usage / unlimited (Basic+)

[Compare plans — collapsed by default for paid users, expanded for free]
  Three-column tier comparison, identical layout to /pricing comparison section

[Billing history — paid users only, last 10 invoices]
  Date · Amount · Status · [Receipt link to Stripe-hosted invoice]

[FAQ — 3 questions]
  Same 3 currently shipped (upgrade timing, data on downgrade, refunds) —
  the public FAQ on /pricing handles the conversion questions.
```

Cancellation flow: keep the existing retention modal (V9.5 P4.3). Single edit: when the user is on Basic, the bullet list shows the *Basic-specific* features they'll lose, not the generic four bullets. When the user is on Pro, the bullet list adds Pro-specific items (export, daily refresh, top-5 on-demand). Use the tier feature mapping to drive this.

### Q4 — Tier-state UI propagation (see §6 for the touchpoint map)

Principle: tier state surfaces in three places — the user's own account chrome, the in-context affordance gates, and a single global header pill for free users. No tier chrome bleeds into catalogue browsing.

### Q5 — Conversion funnel

```
Cold visitor lands on a shared report or category page
  ↓
Reads. (Catalogue is fully open, no friction.)
  ↓
Encounters ResearchHubPreview or CaseViewGate at session depth ≥3
  ↓ (these route to /pricing as a comparison page)
/pricing — hero + three tiers + FAQ
  ↓
Click "Get started" → /auth/login (with `from=pricing` param)
  ↓
Account created → routed back to /pricing (logged-in free state)
  ↓
Click "Start Basic — $5.99/mo" → /api/subscription/create-checkout → Stripe Checkout
  ↓
Checkout completes → Stripe webhook → tier flips → success_url
  ↓
Lands on /account/subscription?checkout=success
  ↓ banner: "Welcome to Basic. Your Record is now connected."
  ↓ primary CTA: "Go to your Record" → /lab
  ↓
On the Record, the named-match teaser is no longer locked.
  ↓ THIS is the activation moment that proves the upgrade was worth it:
  ↓ "Three contributors have opted in to be discovered. Here they are."
```

The minimum activation moment that demonstrates Basic value is the **first named-match offer rendering on the Record** post-checkout. That's the load-bearing payoff. Tier 2 must ensure that for a Basic user who has at least one submitted experience, at least one named-match offer is queued by the time they hit the Record post-checkout — falling back through the V3 §4 never-empty cascade if no named match meets threshold.

### Q6 — Stripe checkout: embedded vs. hosted

**Decision: hosted, full stop.** Marginal conversion gain from embedded Elements does not justify the engineering cost and trust risk. Revisit at scale.

---

## 5. Concrete content samples

### 5.1 /pricing hero copy

> **The Archive holds over 200,000 documented accounts of paranormal and anomalous experience. Anyone can read it. Anyone can add to it.**
>
> Paradocs is a documentary catalogue, built from public archives, contributor submissions, and decades of newspaper, broadcast, and online records. The catalogue is open. Submissions are free, for everyone, forever.
>
> What a subscription opens is the layer that places your own account inside the wider record: comparative temporal and geographic surfaces drawn from the full corpus, named introductions to other contributors whose accounts share signal with yours, and the working tools — export, refresh, deeper lenses — for the small number of contributors who want them.
>
> **[Get started free]** &nbsp;·&nbsp; [See the tiers ↓]

### 5.2 Tier-comparison table (sourced from V3 §2)

The on-page table renders all rows below. Mobile renders the three tier columns as a stacked accordion per row; desktop renders side-by-side.

| | **Free** | **Basic — $5.99/mo** | **Pro — $14.99/mo** |
|---|---|---|---|
| Submitting experiences | Unlimited | Unlimited | Unlimited |
| Browsing the catalogue | Open | Open | Open |
| Your Record (dossier view) | Full | Full + cross-experience header | Full + advanced lenses & custom scoping |
| AI synthesis paragraph | Per experience, refreshed monthly | + body-of-work paragraph, weekly | Refreshed nightly, regenerate on demand |
| Temporal analysis | 24h dial + decade band | + time-of-week, lunar, seasonal, decades shift | + custom date-range, raw histograms |
| Geographic analysis | 50-mile ring, 3 data lines | Configurable 10–500 mi, corridor explorer | County-level density, multi-experience, KML |
| Sentiment baseline | One-line population comparison | Multi-dimensional, sub-pattern comparison | Trajectory analysis, archive-wide shifts |
| Aggregate-pattern matches | Always-on | + adjacent counties, nearby phenomena | + underlying reports listed and citable |
| Named-match introductions | — | Mutual opt-in, one per visit | + on-demand "top 5" view |
| Private channel after match | — | One channel per matched pair | + Record snapshot sharing |
| Hints | One per visit, lifetime cap 12 | Unlimited, refreshed daily | + save Hints into Collections |
| Record export | — | PDF | PDF + JSON + match list + citations |
| Phenomenon claims | Read-only | Claim to Record | + edit / annotate |
| Re-analysis cadence | Monthly | Weekly + digest | Daily + real-time on demand |
| Year-in-Review | Teaser (3 cards) | Full | Full + multi-year retrospective |
| Shareable Record link | — | View-only, expirable | Permissioned by section |

### 5.3 /subscription text wireframe (paid user state)

```
─────────────────────────────────────────────
Account · Billing
Subscription

┌───────────────────────────────────────────┐
│ [CreditCard icon]  You're on Basic.       │
│                    Renews October 14, 2026│
│                    [TierBadge: Basic]     │
│                                           │
│ [Manage billing] [Change plan] [Cancel]   │
│                                           │
│ ─────────────────────────────────────     │
│ Saves: 23 · unlimited                     │
│ Hints this week: 4 · unlimited            │
└───────────────────────────────────────────┘

ACTIVE
  Named-match introductions (mutual opt-in)
  Configurable temporal and geographic depth
  Weekly Record re-analysis
  PDF export
  Shareable private Record link

COMPARE PLANS  [chevron, collapsed by default]

BILLING HISTORY
  Sep 14, 2026  $5.99  Paid     [Receipt]
  Aug 14, 2026  $5.99  Paid     [Receipt]
  …

FAQ
  Can I upgrade or downgrade at any time?
  What happens to my data if I downgrade?
  Do you offer refunds?
─────────────────────────────────────────────
```

### 5.4 FAQ — `/pricing` block (5 questions, written for cold visitors)

> **What happens if I stop paying?**
> Your account doesn't go anywhere. Your submitted experiences remain in the Archive. You drop back to the Free tier, which keeps you reading the catalogue and seeing the comparative surfaces on your Record at the depth Free shows them. Named-match channels you've already opened stay readable but no new introductions are offered.
>
> **Who can see my submitted experiences?**
> Your account appears in the public catalogue with the visibility setting you chose at submission (public, anonymous, or operator-only). Named-match introductions require mutual opt-in from both contributors before any identifying detail is shared. We do not sell data and we do not use submissions to train third-party models. The full policy lives in the privacy notes.
>
> **What is "named-match introduction"?**
> When another contributor's account shares enough signal with yours — phenomenon-type, geography, time period, and language pattern — Basic offers an introduction. Both contributors must have opted in to be discovered. The introduction is a soft handshake, never a forced reveal, and either side can dismiss without consequence.
>
> **Can I cancel anytime?**
> Yes. Cancellation is two clicks from the Subscription page; your subscription stays active through the end of the period you've already paid for. No questions, no retention call.
>
> **Do you offer a free trial?**
> No trial period — the Free tier is the trial. It's a real product, not a friction layer; it includes unlimited submissions, the full catalogue, and the n=1 comparative surfaces at Free depth. Subscribe when you want the named-match layer or the working tools, not before.

---

## 6. Tier-state UI touchpoint map

| Surface | Free | Basic | Pro | Treatment |
|---|---|---|---|---|
| Global header (desktop) | `Upgrade` pill, muted purple | (nothing) | (nothing) | One pill, links to `/pricing`. Suppressed for paid. |
| Global header (mobile) | (nothing — space-constrained) | (nothing) | (nothing) | Tier-aware chrome lives in account nav, not the header. |
| Bottom nav (mobile) | (nothing) | (nothing) | (nothing) | Do not pollute primary nav with tier chrome. |
| Account nav strip | (nothing) | (nothing) | (nothing) | Tier surfaces on the `/account/subscription` tab; no badge in the strip. |
| Avatar / profile dropdown | TierBadge: Free | TierBadge: Basic | TierBadge: Pro | Existing component. Lives next to display name. |
| Profile page | TierBadge near header | Same | Same | Existing. No change. |
| Comments inline | (nothing) | Small diamond glyph | Small diamond glyph | Already shipped (task #62/63). Identifies paid contributors. |
| Lab / My Record — n=1 dossier | All surfaces render at Free depth | Render at Basic depth | Render at Pro depth | V3 §2 governs. No "locked" chrome — depth differs, not access. |
| Lab — named-match teaser | Inline paywall surface | Active surface | Active surface + on-demand "top 5" | The conversion moment. Dismissible. Cooldown 7d after dismiss. |
| Lab — Hints rail | One Hint/visit, cap 12 | Unlimited, daily refresh | + save to Collections | Visibility differs by tier; soft "Basic unlocks more" footnote at cap. |
| Lab — comparative strips (temporal/geo/sentiment) | Free depth | Basic depth | Pro depth | Single `i` footnote: "Basic adds: configurable radius, decades shift, multi-dimension sentiment." |
| CaseViewGate (after session depth ≥3) | Full-page gate, routes to `/pricing` | (suppressed) | (suppressed) | Existing component. Update CTA copy per §5.5. |
| LabPromo (Today feed) | Renders with rate cap (6/wk) | (suppressed) | (suppressed) | Existing. Updated copy already shipped. |
| ResearchHubPreview (on report pages) | Blurred preview + email capture or `/pricing` link | "Add to Hub" | "Add to Hub" | Existing component. CTA already shipped. |
| Phenomenon claim affordance | Read-only | "Claim to Record" button | "Claim & annotate" | New in Tier 3. Free shows a soft footnote on hover. |
| Export buttons (Record / Collection) | (suppressed) | PDF button | PDF + JSON buttons | Render only at tier; no "Upgrade to export" prompts cluttering the chrome. |

The rule the panel keeps returning to: **tier-aware chrome on free-user surfaces is one pill in the header and one in-context paywall on each gated affordance. No more.** Paying users see no upgrade chrome anywhere except inside `/account/subscription`.

---

## 7. Execution checklist for Tier 2

Files to create or modify, in dispatch order:

1. **`src/pages/pricing.tsx`** — new file. Standalone marketing-style page per §4 Q2 and §5 sample copy. Server-renders for logged-out users; reads `useSubscription` on the client for logged-in state-aware CTAs. Logged-in paid users hit a `getServerSideProps` redirect to `/account/subscription?from=pricing`.

2. **`src/components/pricing/PricingHero.tsx`**, **`PricingTierPanel.tsx`**, **`PricingComparisonTable.tsx`**, **`PricingFAQ.tsx`** — new components. Documentary voice per §5. Shared between `/pricing` (full) and `/account/subscription` (comparison table only).

3. **`src/pages/account/subscription.tsx`** — edit existing. Rewrite tier-feature labels to match V3 §2 matrix (drop `my_reports`/`saved_reports`/`api_access`/`team_members` SaaS labels; surface `named-match introductions`, `temporal depth`, `geographic depth`, `re-analysis cadence`, `export`). Rebuild retention modal bullets to be tier-specific. Add billing-history section pulling from Stripe invoices via a new `/api/subscription/billing-history` endpoint.

4. **`src/pages/api/subscription/billing-history.ts`** — new file. Server endpoint that lists last 10 invoices for the user's Stripe customer, returns `[{ date, amount, status, receipt_url }]`.

5. **`src/pages/api/subscription/create-checkout.ts`** — edit existing. Change `success_url` to `/account/subscription?checkout=success&plan=...`. Change `cancel_url` to `/pricing?checkout=cancelled`. Verify `STRIPE_PRICE_BASIC_MONTHLY` and `STRIPE_PRICE_PRO_MONTHLY` env vars are set to the live $5.99 / $14.99 price IDs.

6. **`src/components/discover/CaseViewGate.tsx`**, **`src/components/discover/LabPromo.tsx`**, **`src/components/reports/ResearchHubPreview.tsx`** — edit. CTAs already route to `/pricing`; sanity-check copy is documentary-voice consistent with §5. The "Start with Basic — $5.99/mo" copy already lives in CaseViewGate and ResearchHubPreview; cross-check after `/pricing` ships.

7. **`src/components/Layout.tsx`** — edit. Add a single `Upgrade` pill in the global header for logged-out and free-tier users, hidden for paid. Link to `/pricing`. Suppressed entirely on `/pricing` and `/account/subscription` themselves to avoid loops.

8. **`src/components/lab/LabPaywallSurface.tsx`** — new file, Tier 2 dispatch. The inline named-match teaser per V3 §3.6 and §4. This is the load-bearing conversion surface; routes to `/api/subscription/create-checkout` directly for logged-in users (skipping `/pricing`), or to `/pricing?ref=lab` for logged-out.

9. **`src/lib/subscription.ts`** — edit. Add a `getActiveBenefits(tierName: TierName): string[]` helper that returns the active-features list used by the Subscription hero, the retention modal, and the `/pricing` tier panels. Single source of truth.

10. **Smoke test for `/pricing` checkout flow:** cold visitor → `/pricing` → signup → back to `/pricing` → Stripe Checkout → webhook → tier flips → lands on `/account/subscription?checkout=success` → named-match surface unlocks on `/lab`. End-to-end run before Tier 2 ships.

---

## 8. Open questions for founder

1. **Pro tier — keep at $14.99 or fold into Basic?** V3 §7.2 flagged this; the panel reaffirms a separate Pro tier exists for the 5-15% of contributors who want export and on-demand depth, but the founder should confirm before the comparison table goes live with three columns. If folded into Basic, several Pro-column items (JSON export, daily refresh, on-demand top-5) need a new home or a quiet deprecation.

2. **Annual pricing — defer 12 months, or ship at launch?** Panel recommends defer. If the founder wants annual at launch for cash-flow reasons, the recommendation is a 15% discount ($60.99/yr Basic, $151.99/yr Pro) and a separate Stripe Price ID per tier — but every line of pricing copy needs an annual/monthly toggle the panel did not design.

3. **Trial period — none, or 7-day free trial gated on credit card?** Current LabPromo copy advertises "Start 7-day free trial" (`src/components/discover/LabPromo.tsx` line 56). The panel's recommendation is no trial — Free is the trial — which means LabPromo's CTA copy needs to change to "Start with Basic — $5.99/mo" to match the other surfaces. Founder call: revert LabPromo to a trial flow, or align LabPromo to the no-trial recommendation?

4. **Post-checkout activation guarantee.** Tier 2 §5 Q5 calls for at least one named-match offer to be queued by the time a freshly-upgraded Basic user lands on their Record. If no real match clears the confidence threshold, the V3 §4 never-empty cascade falls back to aggregate / adjacent / editorial. Founder should confirm: is the editorial fallback (a hand-curated phenomenon page rotated weekly) an acceptable post-checkout activation surface, or do we need a stronger guarantee?

5. **`/pricing` hero imagery.** §5.1 specifies "one image or static SVG, no carousel." The panel did not specify the image. Suggestion: a quiet, archival photograph from the public-domain holdings (a Mass Observation diary page, a 1950s clipping, an Air Force report cover) at low contrast under the headline. Founder picks the image; the panel writes the copy.

---

*— The Pricing Panel*
