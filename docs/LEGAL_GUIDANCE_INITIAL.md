# Initial Legal Guidance — B0.8

**Status:** Initial framework only · Not a substitute for outside counsel
**Date:** May 16, 2026
**Purpose:** give Chase enough framing to scope the actual counsel engagement and understand the trade-offs per source. Counsel still needs to bless the final architecture in writing before submission to either app store.

---

## Standard disclaimer

I am not a lawyer. This document reflects an informed read of the relevant terms of service, the post-Epic injunction landscape (Epic v. Apple, 9th Cir. 2024; Epic v. Google, N.D. Cal. 2024, on appeal), and the conventional posture taken by indexing-and-attribution platforms operating in adjacent spaces (Common Crawl, Internet Archive, Reddit archival projects, Spotify's reader-app implementation). Treat everything below as **a starting point for a counsel conversation, not legal advice**. Decisions that bet meaningful revenue or expose the platform to takedown / litigation risk warrant a written opinion from someone with malpractice insurance.

---

## Per-source compliance analysis

Each source is evaluated on three axes: (a) what their published terms permit, (b) what their effective enforcement posture has been historically, (c) what our specific use (index-with-attribution, original Paradocs-voice narrative, never republish source content) implies for risk. Recommendations are sorted from **green light** (low risk, proceed) to **caution** (proceed with mitigations) to **defer** (don't ingest until counsel blesses).

### NUFORC (National UFO Reporting Center) — **GREEN LIGHT**

Founded 1974, 501(c)(3) nonprofit operated by Peter Davenport. Reports are explicitly published for public research use, with no terms restricting indexing or attribution. The NUFORC archive has been mirrored by academic researchers, journalists, and other UFO/UAP databases for decades without issue.

**Our use is compatible.** Index-with-attribution is exactly the model NUFORC publishes for. Each indexed report should link back to the canonical NUFORC entry (`https://www.nuforc.org/sighting/?id=XXXXX`) and credit NUFORC visibly.

**Mitigations to bake in:** (1) attribution badge on every NUFORC-sourced report, (2) honor any takedown requests within 7 days, (3) don't republish full report text — index and excerpt with a "Read full report at NUFORC →" CTA. **Counsel question:** none required for green-light go.

### NDERF + OBERF (Near-Death + Out-of-Body Experience Research Foundations) — **GREEN LIGHT with outreach recommended**

Both run by Dr. Jeffrey Long, M.D., a radiation oncologist who has built the largest first-person NDE/OBE case archive in the world (~5,000+ cases). Reports are submitted with explicit consent for public publication and research use. The archive is referenced in peer-reviewed literature; academic attribution norms apply.

**Our use is compatible** — indexing with attribution and original Paradocs-voice narrative around each case is exactly what the academic literature does. The model is well-established.

**Mitigations:** (1) attribution on every NDERF/OBERF-sourced report (`Case from NDERF Archive #XXXX`), (2) link back to the canonical entry, (3) take down any case Dr. Long requests removed.

**Recommended additional step:** send Dr. Long a courtesy email describing what Paradocs is doing. Not required — the archive is public — but a partnership-style heads-up (a) lowers any future-friction risk, (b) opens the door to him linking back / endorsing, which is worth more than the legal protection it provides. Templated note: "Hi Dr. Long, we're building Paradocs as a cross-source archive of unexplained experiences and would like to index NDERF cases with full attribution and links back to your canonical entries. Wanted to give you a heads-up + ask if you'd like to be informed when we go live."

### BFRO (Bigfoot Field Researchers Organization) — **GREEN LIGHT**

Run by Matt Moneymaker. Reports are published for public research and educational use; the database has been referenced by media (Animal Planet's *Finding Bigfoot*) without issue. Attribution model is similar to NUFORC.

**Our use is compatible.** Same mitigations as NUFORC: attribution badge + link back + honor takedowns.

### IANDS (International Association for Near-Death Studies) — **CAUTION**

Academic membership association founded 1981. Publishes the *Journal of Near-Death Studies* with subscriber access. Public-facing case reports more limited than NDERF; much of the substantive content is gated behind membership.

**Our use is partially compatible.** Only the publicly-published reports should be indexed; don't index anything from the subscriber-only journal even if the abstract is public. Attribution + link back required.

**Counsel question:** confirm that indexing the public-facing case excerpts on iands.org constitutes fair use under §107 of the U.S. Copyright Act (commentary/transformative use rather than reproduction).

**Recommended additional step:** as with NDERF, a courtesy email to IANDS is worth the goodwill. They have a research-publication norm to defend; you're building a platform that respects that norm.

### Reddit (via Arctic Shift archive) — **PROCEED WITH SPECIFIC MITIGATIONS**

This is the highest-volume source and the most legally textured one. The relevant facts:

- **Reddit User Agreement** grants Reddit a sub-license to display user content; users retain copyright. Reddit may grant sub-licenses to others (which is the API license model).
- **Reddit Data API terms** tightened in mid-2023 — primary changes were rate-limiting the free tier (effectively pricing out academic/archival use) and prohibiting AI training without a commercial license.
- **Arctic Shift** is a community-run archive operated independently of Reddit. It captures Reddit data before the API changes via legitimate API access during the open period. Distributing the archive itself is legally murky — Reddit could claim Arctic Shift is unauthorized redistribution; Arctic Shift's defenders argue archival use under research/educational fair use precedents.
- **Our use** would be: pull the Arctic Shift dump (one-time copy), index posts with attribution, generate original Paradocs-voice narrative around each (not republishing the post text verbatim), provide takedown mechanism for individual users.

**Risk profile:** Reddit has historically pursued enforcement against AI training (the Anthropic / OpenAI lawsuits) and large-scale commercial scraping — not against indexing-and-attribution archives. The risk is more reputational + relationship than legal, in the realistic case.

**Specific mitigations required:**

1. **Don't republish post bodies in full.** Index the post (title, key entities, location, date), generate original Paradocs-voice summary narrative, link back to the Reddit URL as the canonical source. This puts us closer to "transformative commentary" (fair use friendly) than "verbatim reproduction" (fair use unfriendly).
2. **Honor user deletion.** If a user deletes their Reddit post or account, we honor that within 7 days via either Reddit's webhook (if available) or a daily check against the canonical URLs.
3. **Provide a takedown email** (`takedown@discoverparadocs.com`) and respond within 7 days to any user who wants their content removed.
4. **Filter aggressively before ingest.** Spam, off-topic, NSFW, content tied to identifiable minors (we're going to see kids' ghost-encounter stories — they need extra care), PII in comments. The B0.7 cost-control task includes the rate-limit logic; this should include filter logic too.
5. **No AI training on the ingested corpus.** Sonnet calls for paradocs_narrative generation are inference, not training — that distinction matters legally. Make sure no future "fine-tune on the corpus" project happens without re-checking compliance.

**Counsel question:** confirm the index-with-attribution + transformative-narrative model fits within fair use under §107 for Reddit content specifically, given the post-2023 API ToS changes. Also confirm Arctic Shift is a legitimate upstream (the archive's own legal status).

### YouTube comments — **DEFER**

This is the legally murkiest source. The relevant facts:

- **YouTube ToS Section 5** explicitly prohibits "accessing, reproducing, downloading, distributing, transmitting, broadcasting, displaying, selling, licensing, altering, modifying or otherwise using any part of the Service or any Content except (a) as expressly authorized by the Service; or (b) with prior written permission from YouTube and, if applicable, the respective rights holders."
- The **YouTube Data API v3** is the authorized way to programmatically access comments. It has rate limits but is ToS-compliant.
- **Comments scraping outside the API is explicitly prohibited.** Google has historically enforced against bulk scrapers.
- **Comment authorship is opaque.** Unlike NUFORC reports (which have clear authorial intent for archival use), YouTube comments are tied to user accounts and have no presumption of consent to indexing.

**Risk profile:** materially higher than Reddit. Google has more legal resources and more aggressive enforcement posture. Comments-on-paranormal-channels is a niche, but ToS compliance is binary.

**Recommendation:** defer ingestion until counsel reviews. If counsel green-lights, use YouTube Data API v3 + attribution + transformative narrative + same takedown mechanism as Reddit. If counsel red-lights, defer indefinitely and consider partnership with specific channel owners for explicit content licensing instead.

### Wikipedia + historical archive sources — **GREEN LIGHT (CC-BY-SA)**

Wikipedia content is CC-BY-SA. Attribution required + share-alike licensing applies to derivative works. Our use (indexing with attribution + transformative narrative) is well within license scope. Historical archive sources are typically public domain (case reports, government documents) — green light with attribution where appropriate.

---

## Billing architecture — initial guidance

The question: how should Paradocs handle subscription billing across web + iOS + Android given Apple's anti-steering rules, Google's more permissive landscape, and the post-Epic injunction state?

### The current state of platform billing rules (mid-2026)

**Apple App Store Review Guideline 3.1.1** prohibits in-app linking to or promoting alternative purchase methods (the "anti-steering" rule). Post-Epic v. Apple (9th Cir. 2024) injunction, Apple is required to permit external link-outs but their compliance pattern is: (a) require a "scare sheet" warning interstitial when users tap external link, (b) charge a 27% commission on tracked external purchases within 7 days of the click. This is barely better than just using Apple's in-app purchase at 30% (or 15% via Small Business Program). Apple's compliance is itself being re-litigated.

**Google Play Payments Policy** requires Google Play Billing for digital goods consumed in-app, with a 15% rate on under-$1M-per-year earners (auto-applied, no application needed) and 15% on subscriptions from day one (rather than after year one). Post-Epic v. Google injunction (N.D. Cal. 2024, on appeal at 9th Cir.) requires Google to permit developers to communicate about and link to alternative billing. The injunction is broader than Apple's — but Google could still require billing through Play for in-app-consumed services. The appeal outcome could narrow or expand this.

**The "reader app" exception (Spotify, Netflix, Kindle):** apps whose primary purpose is consuming previously-purchased content can be sign-in-only — no in-app subscription UI, no upsell, no payment surface — and direct users to subscribe entirely on the web. Both Apple and Google permit this. Paradocs is borderline: it's a content-discovery + UGC platform, not strictly a reader. Could fit the reader exception by structuring as "the app lets you access your account" without any subscription UI inside the app.

### The three architectures worth comparing

**Option A — Full reader-app model** (the maximally-conservative posture).

- Web is the only subscription surface (Stripe at 2.9% + 30¢)
- iOS / Android apps require sign-in to an existing account; no subscription UI in-app at all
- Users who want to subscribe must navigate to the web themselves
- **Pro:** zero platform fees (only Stripe processing). Clean compliance posture both platforms green-light.
- **Con:** mass-market conversion drops ~50-70% vs in-app billing. Friction filters out low-intent users — which is bad at $5.99 mass-market pricing.
- **When this makes sense:** when your audience is high-intent (Spotify's users actively chose Spotify). Less right for Paradocs's mass-market positioning.

**Option B — Platform billing on all rails** (the maximally-permissive conversion posture).

- Apple StoreKit on iOS at 15% (via Small Business Program)
- Google Play Billing on Android at 15% (auto for under-$1M earners)
- Stripe on web at 2.9% + 30¢
- RevenueCat abstracts all three into one entitlement model
- **Pro:** highest conversion across all platforms. Compliance-clean (you're using each platform's own billing rail).
- **Con:** 15% platform fee. At $5.99 that's $0.90/mo per subscriber.
- **When this makes sense:** mass-market apps where conversion friction matters more than per-subscriber margin. **Paradocs is here.**

**Option C — Hybrid** (Spotify-on-Android, Apple-strict-on-iOS).

- iOS: reader-app model (web-only subscription, no in-app UI)
- Android: Google Play Billing (15%, gets the conversion benefit on the more-permissive platform)
- Web: Stripe
- **Pro:** preserves iOS economics for high-intent users while capturing Android conversion. This is what Spotify actually does.
- **Con:** maintaining two upgrade-UI patterns. iOS Free users are conversion-suppressed.
- **When this makes sense:** when iOS subscription economics are critical and you have a high-intent audience expected to navigate to web.

### My recommendation, with reasoning

**For Paradocs MVP launch: Option B (platform billing on all rails) at the 15% Small Business rate.**

The math: at $5.99 Basic and 15% platform fee, you net $5.09. Variable cost per subscriber (Sonnet usage + infrastructure) is ~$0.25-0.50/mo per the E0.5 cost-economics analysis. Net margin per subscriber: $4.50-4.85/mo. This is healthy and scales linearly.

The conversion math: at mass-market low-intent acquisition (which Paradocs's app-store-discovery launch will be), web-only signup converts at 0.2-0.4x the rate of in-app billing for the same upsell event. Saving 15% in fees but losing 50-80% in conversion is bad math at this price point and audience.

Once you've crossed $1M ARR and Apple/Google start charging 30% on amounts over the threshold, revisit. Add User Choice Billing on Android at that point (4% additional reduction). Consider Option C on iOS only if audience maturation makes web-only viable.

### What to ask outside counsel specifically

1. **Per-source compliance memo:** review the analysis above for NDERF, OBERF, NUFORC, BFRO, IANDS, Reddit (Arctic Shift), Wikipedia, historical archives, and give per-source go/no-go for our index-with-attribution + transformative-narrative model. Same for YouTube comments specifically.
2. **Fair use analysis** of the transformative-narrative pattern: does generating an original Paradocs-voice paragraph about an indexed source report constitute fair use under §107 even when the source is copyrighted (Reddit posts, IANDS journal excerpts)?
3. **Billing architecture review:** confirm Option B (platform billing on all rails with 15% via Apple SBP + Google's auto-applied rate) is compliant with current Apple Guideline 3.1.1 and current Google Play Payments Policy. Specifically confirm:
   - StoreKit + Play Billing implementations don't violate any antitrust commitments
   - The 7-day Basic free trial structure (auto-activated on first submission) is compliant with both stores' trial requirements (Apple requires explicit user opt-in to trial in some configurations)
4. **Takedown contact + DMCA agent registration:** do we need a registered DMCA agent for the Reddit / YouTube content given we're at scale? (Threshold for required registration is typically operating "for profit" + storing content + handling 100+ takedowns/year — we're not there yet but should plan.)
5. **Privacy policy review** for app-store compliance: does the current draft satisfy Apple's Privacy Nutrition Label requirements AND Google Play's Data Safety section AND GDPR/CCPA?
6. **Account-deletion endpoint review** (the C3.1 task): confirm our "7-day grace period + cascading anonymization" model satisfies Apple Guideline 5.1.1(v).

**Engagement scoping:** 4-6 hours of senior counsel time should cover all six questions if you provide this document as context. Counsel familiar with both platform billing law AND content-licensing fair use is ideal — try someone who works with mobile apps that use content (Internet Archive's legal team is the gold standard here for the content side; mobile fintech specialists for the billing side).

---

## What I'd avoid doing without counsel

- Ingesting YouTube comments (defer until reviewed)
- Republishing source-content text verbatim from any source (always transformative narrative + link back)
- Promoting alternative billing in-app on iOS in any way that could be construed as steering
- Training any AI model on the ingested corpus without re-checking ToS compliance for each source

## What's safe to proceed with now without counsel

- NUFORC / NDERF / OBERF / BFRO ingestion with attribution + link-back + takedown mechanism
- Wikipedia + historical archive ingestion (CC-BY-SA / public domain)
- Web subscription via Stripe at the new $5.99 / $14.99 prices
- Building the Capacitor wrap + native platform integration
- The trial-activation flow (legally a standard subscription mechanic)

The Reddit ingestion + YouTube ingestion + final app-store billing implementation should wait for counsel's blessing.
