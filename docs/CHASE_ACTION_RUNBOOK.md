# Chase Action Runbook

Step-by-step instructions for every external account / config / approval action that Claude can't do directly. Work through these at your own pace; ping me when each is done so I can mark the task and unblock dependents.

---

## 1. Apple Small Business Program — E0.3

**Why this matters:** drops Apple's commission from 30% → 15% on every subscription. At $5.99 Basic that's $0.90 vs $1.80 per subscriber per month. Free money. ~5 min to apply, approval can take a few days.

**Steps:**

1. Go to https://developer.apple.com/app-store/small-business-program/
2. Sign in with the Apple Developer account that owns the Paradocs app
3. Click "Enroll Now"
4. Confirm eligibility: your developer account earned under $1M (USD) in proceeds across all apps in the prior calendar year
5. Submit. You'll get a confirmation email; full enrollment usually takes 1-3 business days
6. Once approved, the reduced 15% rate applies to all transactions from the enrollment date forward (no retroactive credit for past sales)
7. Re-enrollment happens automatically each year if you remain eligible

**When done:** reply "E0.3 done" and I'll mark task #29 complete.

---

## 2. RevenueCat signup + project — E1.1

**Why:** RevenueCat is the abstraction layer that lets one codebase handle Apple StoreKit + Google Play Billing + Stripe with a single API. Free for the first $10k/month of tracked revenue, then 1% above that. Without it we'd be writing three separate receipt-validation pipelines.

**Steps:**

1. Sign up at https://app.revenuecat.com/signup
2. Create a new project named **Paradocs**
3. In the Project Settings:
   - **iOS app:** Bundle ID `com.paradocs.app` (this should match the C1.1 Capacitor init)
   - **Android app:** Package name `com.paradocs.app`
   - **Stripe app** (for web subscriptions): connect to the same Stripe account you'll set up in step 3 below
4. Generate two SDK keys:
   - "iOS — Public SDK Key" (starts with `appl_`)
   - "Android — Public SDK Key" (starts with `goog_`)
5. Add both to Vercel as environment variables:
   - `NEXT_PUBLIC_REVENUECAT_IOS_KEY=appl_...`
   - `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...`
6. Note your **RevenueCat Project ID** somewhere — I'll need it for the webhook configuration when I implement E2.1

**Don't worry about** "Entitlements" or "Offerings" yet — I'll configure those when I wire the SDK in E2.1, and they need to align with the App Store Connect + Play Console products from E1.2 / E1.3.

**When done:** reply "E1.1 done, RC project ID is `<id>`" and I'll mark task #31 complete.

---

## 3. Stripe products at $5.99 / $14.99 — E0.2

**Why:** the web checkout code is built and ready (`src/pages/api/subscription/create-checkout.ts`); without these price IDs configured in Vercel env, every upgrade attempt falls through to the mock-checkout safety net.

**Steps (test mode first, then live mode — repeat steps 2-4 in both):**

1. Sign in to https://dashboard.stripe.com → toggle to **Test mode** (top-right)
2. Products → "+ Add product" — create four products:

   | Product name | Pricing | Recurring | Price ID env var |
   |---|---|---|---|
   | Paradocs Basic — Monthly | $5.99 USD | Monthly | `STRIPE_PRICE_BASIC_MONTHLY` |
   | Paradocs Basic — Yearly | $59.88 USD | Yearly | `STRIPE_PRICE_BASIC_YEARLY` |
   | Paradocs Pro — Monthly | $14.99 USD | Monthly | `STRIPE_PRICE_PRO_MONTHLY` |
   | Paradocs Pro — Yearly | $149.88 USD | Yearly | `STRIPE_PRICE_PRO_YEARLY` |

3. For each, also enable a **7-day free trial** on the Basic monthly + yearly variants only (matches E0.5 spec). Pro tier has no trial.
4. Copy each Price ID (starts with `price_...`) and paste into Vercel → Project → Settings → Environment Variables for **Preview + Production** scopes (test prices go in Preview-only).
5. Switch Stripe to **Live mode** and repeat steps 2-4 with the same names + prices. The live Price IDs go into the **Production** environment scope only.
6. Trigger a Vercel redeploy so the new env vars are picked up.
7. Test: sign in at https://discoverparadocs.com, go to `/account/subscription`, click Upgrade on Basic. The Stripe checkout page should open with the right price. Cancel — don't complete (or use Stripe's test card `4242 4242 4242 4242`).

**When done:** reply "E0.2 done" and confirm the test purchase worked. I'll mark task #28 complete.

---

## 4. Apple App Store Connect API key — C0.2

**Why:** lets future CI uploads happen programmatically instead of requiring you to be at a Mac with Xcode. Initial submission is fine via manual upload; this is for the second submission onward.

**What I need from you:** three things, all generated together:

1. Sign in to https://appstoreconnect.apple.com
2. Users and Access → **Integrations** tab → **App Store Connect API**
3. Click "Generate API Key" (or the "+" if you have existing keys)
4. Name: "Paradocs CI"
5. Access: **App Manager** role (highest privilege short of Admin — needed for build uploads)
6. After generating, capture three things:
   - **Issuer ID** (shown at the top of the page, same for all your keys)
   - **Key ID** (shown in the keys list)
   - **The .p8 private key file** — you can only download this ONCE; if you miss it you have to regenerate
7. Base64-encode the .p8 file: `base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy` (puts it on your clipboard)
8. Add all three to Vercel env vars (Production scope):
   - `APP_STORE_CONNECT_ISSUER_ID=...`
   - `APP_STORE_CONNECT_KEY_ID=...`
   - `APP_STORE_CONNECT_KEY_P8_BASE64=<paste the base64 string>`

**When done:** reply "C0.2 done" and I'll mark task #21 complete.

---

## 5. Apply DB migrations to production

**Why:** two new migrations from this session need to run before the new tier structure + notifications bell work in prod.

**Files to apply (in order):**
1. `supabase/migrations/20260516_tier_design_v2.sql`
2. `supabase/migrations/20260516_user_notifications.sql`

**Option A — Supabase Dashboard (simpler):**
1. Open https://supabase.com/dashboard/project/<your-project>/sql/new
2. Paste the contents of `20260516_tier_design_v2.sql`
3. Click "Run"
4. Repeat with `20260516_user_notifications.sql`
5. Verify with the queries at the bottom of each migration's file (commented-out verification queries — uncomment and run them to confirm state)

**Option B — Supabase CLI (preferred if you have it set up):**
```bash
cd /Users/chase/paradocs
supabase db push
```
This applies all pending migrations. Faster but requires `supabase login` + project linking already done.

**Staging dry-run first (recommended):** if you have a staging project, apply there first. The tier-design migration touches live `subscription_tiers` rows; testing against staging catches any pre-existing data drift.

**When done:** reply "migrations applied" and I'll know prod is on the new schema.

---

## 6. PostHog session replay QA on Private Relay — T1.12 follow-up

**Why:** T1.12 ships the reverse proxy that should bypass iCloud Private Relay blocking, but the only honest validation is to enable Private Relay on a real Mac and verify recordings flow.

**Steps:**

1. After the next prod deploy, on your Mac: Settings → Apple ID → iCloud → Private Relay → **turn on**
2. Open Safari (Private Relay only affects Safari) → https://discoverparadocs.com
3. Sign in
4. Open DevTools (Develop menu → Show Web Inspector → Network)
5. In the filter box, type `_posthog`
6. Browse the site for ~30 seconds — click around, navigate to `/lab`, scroll the feed
7. **Pass:** the `_posthog/decide/?v=3` requests show status 200 (or status 0 with "ok" body for opaque responses). Sessions appear in https://us.posthog.com/project/<id>/recordings within ~5 minutes.
8. **Fail:** the requests show "blocked" or "failed" in the Network tab, OR no session appears in PostHog within 10 minutes. Reply here so we troubleshoot.

**When done:** reply "T1.12 verified" or "T1.12 issue — <what you saw>" and I'll respond accordingly.

---

## 7. Pre-ship verification (run before declaring this branch ready)

Quick smoke check that the session's code changes don't have surface-level breakage. Run all four in order.

```bash
cd /Users/chase/paradocs

# 1. Install new dependencies (Playwright was added)
npm install

# 2. TypeScript check — gate that runs at build time
npm run typecheck

# 3. Local dev server — visual smoke
npm run dev
# Then in browser at http://localhost:3000:
#   - /                         → loads, brand visible
#   - /explore?view=categories  → category cards show with dual-labels
#   - /phenomena/roswell-incident  → thin "Reports tagged" page renders
#   - /discover                 → Today feed shows
#   - /start (incognito)        → sees account-first "Sign up to share" gate
#   - /lab?tab=story (signed in)  → bell icon visible top-right
#   - Click bell                → dropdown opens with empty state or recent notifications
#   - Ctrl-C the dev server when done

# 4. Playwright smoke tests
npm run test:e2e:install   # one-time, downloads Chromium (~80MB)
npm run test:e2e -- smoke.spec.ts
# Expect green for all "public pages render" tests. The four flow specs
# are .skip()-ed until the test backend exists (item 8 below).
```

**Expected output for step 2 (typecheck):** zero errors. If you see errors related to files I touched this session, paste them back and I'll fix.

**Expected output for step 4 (Playwright):** 7 passing tests in smoke.spec.ts, 4 skipped flow specs.

**When done:** reply "pre-ship green" or paste any failures.

---

## 8. Test Supabase project + Playwright secrets — T1.13 follow-up

**Why:** activates the 4 gated E2E flow tests in CI. Not blocking launch — the smoke tests run today. This unblocks higher-coverage regression testing post-launch.

**Steps:**

1. Create a new Supabase project at https://supabase.com/dashboard named `paradocs-test`
2. Apply your full prod schema to it. Easiest path: in the Supabase Dashboard for your prod project, Settings → Database → "Connection pooling" → grab the connection string, then:
   ```bash
   pg_dump --schema-only "<prod-connection-string>" > paradocs-schema.sql
   psql "<paradocs-test-connection-string>" < paradocs-schema.sql
   ```
3. Create one test user via the Supabase Dashboard → Authentication → Users → "Add user". Email like `e2e-tests@discoverparadocs.com`, password `<long-random-string>`. Confirm the email manually.
4. In GitHub → Repo → Settings → Secrets and Variables → Actions → New repository secret:
   - `PLAYWRIGHT_TEST_USER_EMAIL` = the email above
   - `PLAYWRIGHT_TEST_USER_PASSWORD` = the password above
   - `NEXT_PUBLIC_SUPABASE_URL` = the **test** project's URL (NOT prod)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the **test** project's anon key
5. The next CI run will automatically pick up these secrets and the 4 flow tests will activate.

**When done:** reply "test backend ready" and I'll mark T1.13's follow-up as resolved.

---

## 9. Takedown email — set up `takedown@discoverparadocs.com` inbox

**Why:** B0.6 privacy policy update references this address. Once that page is live, you legally need to be receiving and responding to takedown requests sent there. Resend won't help here — Resend is for sending, not receiving. Pick one of these inbound options:

**Option A — Cloudflare Email Routing (recommended, free, ~5 min):**

1. Sign in to https://dash.cloudflare.com → pick the discoverparadocs.com zone
2. Email → Email Routing → "Get started"
3. Accept the MX records Cloudflare adds automatically
4. Create a custom address: `takedown@discoverparadocs.com` → forward to your personal email
5. Verify the destination address via the email Cloudflare sends there
6. Test from a different sender — should land in your personal inbox

**Option B — Google Workspace alias** (free if you already pay for Workspace):

1. Workspace Admin → Users → your user → Aliases → Add `takedown@discoverparadocs.com`
2. Messages to that address land in your existing inbox, marked with the original To: header

**Option C — ImprovMX** (free, ~5 min, works on any DNS provider): https://improvmx.com — same forwarding model as Cloudflare.

**When done:** reply "takedown email live" and I'll mark the implicit B0.6 follow-up complete.

---

## 10. App icon + splash screen design — C3.3

I can design these. Before I start, I need a few things from you to get the brand right:

**What I need:**

1. **The Paradocs wordmark / logo file** (SVG preferred, PNG OK) — if there's an existing one, drop the file in `/Users/chase/paradocs` and tell me where; if not, I'll need a style direction
2. **Brand color confirmation:** the codebase uses `#9000F0` (purple) as the brand accent based on what I saw in Layout.tsx. Is that the canonical brand purple? Any other colors you want represented (e.g., a secondary accent)?
3. **Style direction** — pick one:
   - **Literal:** a glyph that represents the product (e.g., a telescope, a signal/waveform, a constellation)
   - **Abstract:** a geometric mark that doesn't represent anything specific (think Linear's L, Notion's stacked rectangles)
   - **Wordmark-derived:** the "P" or "Paradocs" letterforms as the icon

**When you reply with those three answers**, I'll design the master 1024×1024 iOS icon, the 512×512 + adaptive Android pair, and the 2732×2732 splash screen. Delivery as SVG sources + PNG exports at all required sizes.

Alternative: if you'd rather route this to a human designer or another tool, no problem — I just need to know to stop expecting to do it myself.

---

## Status snapshot (after this runbook)

**Updated end of V11.17.12 session (May 23, 2026).** Items completed since the runbook was first written are flagged. See `docs/SESSION_HANDOFF_V11_17.md` for the full current punchlist + the engineering-resume trigger.

| Action | Status | Notes |
|---|---|---|
| C0.1 Google Play signup | ✅ Done (Chase) | Awaiting Google verification |
| E0.3 Apple SBP | ⏭️ | Item 1 above — not yet enrolled |
| E1.1 RevenueCat | ⏭️ | Item 2 above — not yet signed up |
| E0.2 Stripe products | ⏭️ | Item 3 above — products not yet created |
| C0.2 App Store Connect API key | ⏭️ | Item 4 above |
| Apply migrations (`tier_design_v2` + `user_notifications`) | ❓ verify | Item 5 above — applied during earlier session work; new session should confirm |
| T1.12 Private Relay QA | ⏭️ | Item 6 above (post-deploy) |
| Pre-ship verification | ⏭️ | Item 7 above |
| T1.13 test backend | ⏭️ | Item 8 above (post-launch OK) |
| C3.3 App icons | ⏭️ | Item 9 above — needs Chase's input first |
| B0.8 Legal counsel | ⏭️ | See `docs/LEGAL_GUIDANCE_INITIAL.md` |

**Completed since this runbook was first written (V11.x stream):**
- V11.14 — Consolidated AI service + Anthropic Batch API worker shipped; mass Reddit ingestion completed (~70k reports linked, 196k junction rows)
- V11.15 — Map UX overhaul: choropleth, region totals, mobile filter sheet, progressive pin loading, search pagination
- V11.16 — Phenomenon image pipeline (Wikimedia + Haiku confirm + Supabase Storage adoption); 506 mismatched + 957 missing tracked separately
- V11.17 — Homepage rewrite through 4 SME rounds → "The home of the unexplained."; map demo video; live activity ticker; dynamic stats via ISR
- V11.17.5-12 — Map/UX bug bundle + `phenomena.display_blurb` (Haiku batch + 1,458 phenomena populated) + breakpoint-swap card layout

**Pending (Chase's "next go" sequence — see SESSION_HANDOFF_V11_17.md §3.3):**
1. Vercel canonical host + Supabase URL config
2. Non-incognito smoke at https://www.discoverparadocs.com
3. B0.1.exec — `npx tsx scripts/b1-5-smoke-test.ts`
4. Title backfill — `npx tsx scripts/backfill-report-titles.ts --dry-run` then live
5. B0.8 — Outside counsel engagement
6. E0.2 / E1.1 / E0.3 — Stripe, RevenueCat, Apple SBP
7. Mass ingestion: NDERF → OBERF → NUFORC → (after counsel) YouTube

**Engineering-resume trigger:** B0.1.exec green + RevenueCat ready → C1.3 + C2.x + Track D + E2.4 follow-ups + auth hardening (OTP fallback).
