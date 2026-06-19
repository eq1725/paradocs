# Paradocs — App Store Readiness Plan
### From current web app → Apple App Store + Google Play submission, on the community / first-party thesis

**Date:** June 18, 2026
**Decision (founder):** Commit to the **community / first-party thesis** — Paradocs is *the destination for all experiential reports of any kind*, growing daily via automated pipelines **and** user submissions; the moat is brand + community + first-party experiences. Growth via **podcasts + community + app-store visibility (ASO)**, not Google SEO. Budget flexible; headcount flexible; no live users yet; pricing soft.

**Positioning lock:** *"Paradocs — where you record the experiences you can't explain, and discover you're not alone."* The 309k corpus is the **cold-start mirror** that makes a first submission feel non-empty ("4,000 others described a light like yours"). Daily pipeline + UGC = the fresh-content engine that justifies a membership.

---

## Definition of "submission-ready" (the gate)

Submission to Apple/Google is blocked until ALL of these are true:
1. **It's a real app, not a wrapped website** (clears Apple Guideline 4.2 "minimum functionality" — native push, capture, share, offline-ish feel).
2. **The core loop works on a phone**: open → wonder → capture an experience → see the mirror → it lives in My Record. Mobile-first, on low-end devices.
3. **Trust & Safety is live** (required for UGC approval AND to survive contact with real users): report/block/mute, human-in-loop moderation, crisis-resource interception, named-party/PII redaction, age gate.
4. **Account + data compliance**: in-app account deletion, data export, privacy policy, Apple Privacy Nutrition labels + Google Data Safety form, age rating questionnaire, UGC moderation attestation.
5. **Monetization**: free vs one membership, **web-first checkout (reader/external-link model)** — account creation/management in-app, purchase on the web (Stripe), store-compliant link-out presentation, no dark patterns.
6. **Store assets**: icon, screenshots, preview video, listing copy, keywords (ASO), support URL.

---

## Workstreams (the gaps to close)

### A. Mobile app packaging — the biggest structural gap
Today Paradocs is a Next.js **web** app; the stores need a real app. **Key early decision:**
- **Recommended: Capacitor shell around the existing web app + genuine native plugins** (push notifications, camera/photo for capture, native share sheet, haptics, IAP, secure storage). This reuses everything you've built and reaches the stores fastest — *but only passes Apple 4.2 if it has real native integrations* (the plugins above), not a bare webview.
- *Alternative:* React Native rebuild of the flagship surfaces (feed, capture, My Record) for best-in-class feel — higher cost/time; viable given flexible budget if the web feel proves limiting.
- **Tasks:** choose packaging; set up the iOS/Android build pipeline; resolve Next.js SSR-in-shell (point the shell at the hosted app or move feed special-card SSR to client/edge); add native push (the lifecycle re-engagement channel), native share (the growth artifact), camera (capture), IAP.
- **Close the mobile-render gap** flagged earlier: real device + small-viewport QA must be a standing step.

### B. The community / first-party core — the product spine (was "My Record / Lab")
This is the thesis made real. Rebuild the Lab (Saves/Cases/Map/Notes dashboard) into the **emotional home**:
1. **Capture, elevated from one-time onboarding to an ongoing ritual.** Warm, guided, private-by-default. (The `/start` flow already does capture→reveal — promote it out of onboarding into a first-class, repeatable action.)
2. **The mirror.** On submit, instantly place the experience against the 309k archive — similar accounts, shared patterns, where/when — the "you're not alone" payoff.
3. **The Constellation** as the signature personal home: a living star-map of your experiences + saves + explorations. Beautiful, ownable, shareable.
4. **Connections / community (the moat):** opt-in linking of experiencers with similar accounts; safe, private-by-default. This is what AI can't replicate and what drives both retention and word-of-mouth.
5. First-party submissions feed the archive (with consent + moderation), so the corpus compounds with content that exists nowhere else.

### C. Trust & Safety — non-negotiable for a UGC app (and existential)
Must ship before submission:
- **Moderation pipeline:** automated pre-screen (the kind of classifier work already in the codebase) + **human-in-the-loop** queue; report/block/mute; takedown SLA.
- **Crisis interception:** detect acute mental-health content ("experiences" that are crises) → surface resources, don't amplify. (Aligns with the existing wellbeing-sensitive editorial posture.)
- **Named-party + PII handling:** redact/withhold real names/addresses in user accounts to manage defamation/privacy; PII minimization.
- **Age gate** + age rating; minor-safety.
- **Compliance scaffolding:** account deletion, data export, consent on capture, clear UGC terms.

### D. Onboarding reorder — cheap conversion win
Move the **reveal/mirror BEFORE the email/account gate** (today email is step 2, reveal is step 5). Deliver the wow, then gate. Keep it mobile-first, skippable.

### E. Monetization — simplify + web-first checkout (reader/external-link model)
- Collapse `free / basic / pro` → **free vs one membership** ("Member"). Free: daily wonder + browse + capture a few experiences. Member: unlimited archive, full connections/community, the deep "Lab"/data, ad-free, contributor status.
- **Pricing (decision locked):** single membership at **$7.99/mo or $59.99/yr (~37% off)**, annual emphasized as default, 7-day trial retained. Grounded in comps (Gaia $15.99/mo·$139.99/yr; Calm $14.99; Headspace $12.99/$69.99; Co-Star/Finch low anchor) and the annual-retention edge (~34% vs ~14% at 1yr). Single tier (not 3) because at pre-launch there's one persona and no differentiated premium cluster yet; add a higher tier later once the deep Lab/data warrants it.
- **Checkout = your own webpage, not store IAP (founder decision, Netflix-style).** Paradocs already runs Stripe **web** checkout (`/api/subscription/create-checkout`) — that *is* the payment page the app links to. The mobile app will be a **reader / external-link app**: free account creation + account management in-app, membership purchased on the web. This keeps store fees at/near $0.
  - **iOS:** US storefront (post-*Epic* April-2025 injunction) currently allows external payment buttons/links with **$0 Apple commission**, entitlement not required; the stricter reader-app model (link out for sign-up, no in-app prices) is the conservative fallback. *Caveat:* Dec-2025 appeals ruling lets Apple eventually charge a "reasonable commission" and require IAP be no less prominent; Apple petitioned SCOTUS (May 2026) — monitor, but $0 holds today.
  - **Android:** US currently $0 under the *Epic* injunction; the June-30-2026 settlement caps external-checkout fees at **10% on subscriptions** (vs old 30%).
  - **Packaging requirement:** in the mobile build (workstream A), the membership CTA must link out to the web checkout and follow each store's presentation rules (correct disclosure sheets; don't make IAP less prominent than required). No native StoreKit/Play Billing needed unless we later choose to offer it as an option.
- Value story = **identity + belonging + contribution + depth**, not "library access."

### F. Design system & world-class polish
- Formalize **design tokens** (color/space/type/radius/motion) + component library so the web + app builds stay consistent (hire/contract for this — budget is flexible).
- The **"modern mysticism / cosmic documentary"** bar: deep-space dark canvas, one disciplined accent (#9000F0), cinematic imagery, editorial type, awe-paced motion, the Constellation as the iconic object.
- **Mobile-first performance budget** (low-end devices; image weight, motion cost, time-to-first-wonder).
- Finish visual unification (the indigo Lab promo is the last outlier).

### G. Feed & content (mostly in good shape)
- The Today feed work is largely done (never-empty clusters, reliable On This Date, unified specials, event-dates). Remaining: make it a **finishable daily moment** + a **shareable artifact** (feeds the podcast/community growth motion).
- Keep the daily pipeline running so the "grows every day" promise is real.

### H. Store compliance & ASO assets
- Privacy policy + ToS (UGC-aware), Apple Privacy labels, Google Data Safety form, age rating, UGC attestation, support URL, account deletion.
- ASO: app name + subtitle + keywords (own the *behavior*, not "paranormal"), icon, 6–10 screenshots, a 15–30s preview video, a post-wow rating prompt.

### I. Growth-channel readiness (your actual channels)
- **Podcast kit:** a press/story angle ("the world's largest archive of the unexplained / record your own"), shareable account cards podcasters can read/show, a memorable URL + ASO landing.
- **Community seeding:** the first cohort (the 150 + podcast audiences) → seed early submissions so the community feels alive at launch.
- **Share artifact** (from §G) as the organic loop.

---

## Sequencing & critical path

**Phase 1 — Foundations (parallelizable):**
- Decide packaging (A) — *gates everything app-store*.
- Stand up Trust & Safety MVP (C) — *gates UGC submission*.
- Onboarding reorder (D) + pricing collapse (E) — cheap, high-leverage.
- Begin design-system formalization (F).

**Phase 2 — The core loop:**
- Build the community/first-party home (B) on top of the existing capture flow.
- Native integrations (push/share/camera/IAP) in the shell (A).
- Finishable daily moment + share artifact (G).

**Phase 3 — Submission hardening:**
- Compliance + store assets (H), ASO, device QA across low-end phones.
- T&S load-tested with the seed cohort.
- Growth kit ready (I) for a coordinated launch (not a trickle).

**Critical path:** Packaging (A) → Core loop on device (B) → Trust & Safety (C) → Compliance/assets (H) → Submit. Everything else is parallel.

---

## Decisions needed from you (to start Phase 1)
1. **Packaging:** Capacitor-shell-plus-native-plugins (fast, recommended) vs React-Native flagship rebuild (slower, max feel)?
2. ~~**Membership price point**~~ — **locked: $7.99/mo or $59.99/yr (annual-default), single tier, web checkout.**
3. **Community scope at launch:** full connections between experiencers, or start with private capture + the archive mirror only and add member-to-member connection post-launch? (Affects T&S load + timeline.)
4. **Moderation model:** in-house human review vs a moderation vendor + your existing classifier as pre-screen? (Affects cost + timeline; budget flexible.)
5. **Brand/name surface:** how far to move app-store listing language from "paranormal" toward the behavior ("record what you can't explain")?

---

### Bottom line
The strategy is sound and your corrections tighten it. The gap from here to submission is concrete and mostly *not* about the feed (that's in good shape) — it's **(1) becoming a real app**, **(2) turning the Lab into the community/first-party home**, and **(3) standing up Trust & Safety**, wrapped in compliance + ASO. Pick the five decisions above and Phase 1 can start immediately; I can take the first concrete build slice (recommend: the onboarding reorder + pricing collapse, or the My Record → community-home rebuild) whenever you want to go from plan to code.
