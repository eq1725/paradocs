# Pro Tier Validation — Does $14.99 Justify Itself?

**To:** Chase
**From:** The 2-Voice Pricing Panel (Subscription Business Model Strategist + Visitor Conversion Specialist)
**Re:** Pro tier feature stack against the locked $5.99 / $14.99 ladder
**Predecessor:** `/Users/chase/paradocs/docs/LAB_PANEL_REVIEW_V3.md` Section 2

---

## 1. TL;DR

**Verdict on the current Pro stack: insufficient.** As written in V3 Section 2, the Pro delta over Basic is real-time refresh, raw-data export (JSON + KML + county density), top-5 on-demand matches, snapshot-sharing in DMs, and finer Year-in-Review. Every one of those is a *dial-turn* on something Basic already has. None is a categorically new surface. At 2.5x Basic, the buyer needs at least one feature they cannot describe in the phrase "more of." The panel's read: the current stack converts a sliver of power-users but leaves the majority of Basic subscribers feeling Pro is a tax on impatience.

**Load-bearing recommended additions (the two flagships):**
1. **Family / Legacy Plan** — Pro includes 2 additional Records under one subscription, with a post-mortem inheritance toggle ("when I'm gone, my Record passes to ___"). This is the Ancestry move and it is the single highest-WTP unlock for a documentary-of-the-self product.
2. **Human Research Consultation, 1/month** — a real operator (founder-as-curator at first, eventually a contractor) responds within 5 business days to one user-flagged experience with a curated cross-reference pull from the Archive. This is the feature that makes Pro *feel* like a different product, not a different tier.

**Price ladder:** Keep $5.99 / $14.99. The 2.5x ratio is defensible *with* the additions above; without them it isn't. (Brief debate in Section 4.)

**Annual plan:** Yes — ship at launch. $59 Basic / $149 Pro (17% off). Retention math dominates the discount cost.

---

## 2. Panel Commentary

### Subscription Business Model Strategist (~370 words)

"Look at the comparables. Ancestry, Strava, Notion, Calm, Duolingo — every mature freemium ladder above $10/mo has the same shape: the top tier carries at least one feature the lower tier *cannot replicate by waiting longer or trying harder*. Strava Premium gives you segment leaderboards a free user will never see no matter how many runs they log. Ancestry's top tier opens entire record collections that simply don't exist for lower tiers. Notion's AI tier is a different product surface, not a more-frequent-refresh of the same one.

The current Pro column in V3 is all 'more frequent, more granular, more exportable.' That's a power-user pitch and power users are 3-5% of the base. You're pricing for 30-40% conversion off Basic, which is the optimistic ceiling for a mass-market personal-meaning product. To hit it, Pro needs a *category* that's only on Pro.

Family Plan is the obvious one and it's culturally perfect for Paradocs. The product is already framed as 'My Record' against 'The Archive' — a documentary catalogue of the self. The natural extension is *our* Record. My mother saw a triangle in 1972. My grandfather had missing-time in Korea. The Record is the family heirloom, not the personal diary. Ancestry built a $4B business on exactly this insight. Even if only 8% of Pro buyers use the family seats, the *option* is the conversion lever — the same way iCloud Family Plan converts more standalone subscribers than it converts families.

The human consultation feature does something different: it makes Pro the tier where the catalogue talks back. That's the emotional jump from $5.99 to $14.99 — not 'I get my data faster,' but 'a human being who cares about this archive is reading my account.' Cost-wise it's tractable: at 1k Pro subscribers and 30% monthly usage, that's 300 consultations/month, ~15 minutes each, ~75 hours of operator time. One part-timer at $25/hr = $1,875/mo against ~$4,500/mo in Pro revenue from the human-consult-attributed cohort. Margin survives.

Churn protection: both features create a *switching cost*. Family members are on the Record. Past consultations are in the Record. That's stickiness Basic can't generate. Annual plans on top compound this — Pro annual buyers churn at roughly half the monthly rate, which is where the real LTV math lives."

### Visitor Conversion Specialist (~360 words)

"I work the landing-page comparison table. Three columns, fifteen rows, a Buy button under each. What sells the right column is *one feature that makes the prospect physically point at it and say 'I want that.'* The current Pro column has none. Real-time refresh? A prospect reads that and thinks 'I don't even know how often I'd open this thing.' Top-5 matches on demand? Sounds nice; doesn't punch. KML export? Niche.

The pricing-ladder literature is consistent: when the top tier is *quantitatively* better, conversion to the top tier sits at 4-8%. When the top tier is *qualitatively* different — has one feature the buyer can name in one breath that the cheaper tier doesn't — conversion lands at 18-25%. That's the difference between Pro being a rounding error in MRR and being a meaningful revenue tier.

Family Plan is the breath-name feature for the demographic. The Paradocs audience skews 45-65, leans toward lineage-and-legacy thinking — people who've already had the experience and want it preserved. 'Include my spouse / my sister / my kid' is a sentence that closes a sale. It also activates a referral mechanic: the additional family Record gets the family member into the product, and a percentage of them upgrade independently later.

The human consultation is the *emotional* close. The landing-page line writes itself: 'Pro members can request one researcher-curated cross-reference per month. A real person will read your account and search the Archive for connections you wouldn't find on your own.' That sentence reframes the whole product. Suddenly Pro isn't 'unlimited everything' — it's 'someone is paying attention to *my* account.'

On the ladder shape: $5.99 → $14.99 is a 2.5x jump, which is at the high end but defensible if the qualitative gap is visible. The wrong move is $11.99 — it's too close to Basic to feel like a tier, and the missing $3/mo is real money at scale. $19.99 would test better if Pro had three flagship features instead of two, but with two flagships, $14.99 holds the line.

Anchor the page with Pro on the right, marked 'Most Complete,' Basic in the middle marked 'Most Popular.' Free on the left with no badge. That visual hierarchy alone moves Pro share by 30-40% against unbadged layouts."

---

## 3. Final Pro Feature Stack — for the Pricing Page

**Pro ($14.99/mo) — Everything in Basic, plus:**

- **Family Plan: up to 2 additional Records under one subscription**, each with their own full feature set; legacy-transfer toggle so a Record can be passed to a designated family member
- **Monthly Research Consultation**: flag one experience per month; a Paradocs researcher returns a curated cross-reference pull from the Archive within 5 business days
- **Real-time recompute** of Record against newly ingested reports (vs. weekly on Basic) + on-demand "regenerate now" for the synthesis paragraph
- **Top-5 named matches on demand** with full mutual-opt-in handshake
- **Custom watchlists**: set criteria (phenomenon family, region, decade, language patterns), get notified when matching reports land
- **Advanced export**: raw JSON, full match list, all citations, county-level density data, KML for geographic data
- **Phenomenon-page annotations**: edit and annotate phenomenon entries on your own Record view
- **Shareable Record links with permissioned sections**: share only the geographic surface with a researcher; share only the dossier with family
- **Multi-year retrospective** Year-in-Review (vs. single-year on Basic)
- **Record snapshot sharing** inside matched DM channels
- **First-look status**: notification the moment a freshly ingested report matches your fingerprint, before the weekly digest

**Held for later (not at MVP launch):**
- API access (Pro+, charge separately at $29/mo when researcher demand surfaces)
- AI-narrated long-form essay of the Record (interesting but cost-uncertain at scale; ship as a Pro-exclusive *teaser* in year 2)
- Beta access to new Hints / features (good cultural fit but not a conversion driver on its own; bundle into Pro as a free perk once there's something to beta)

---

## 4. Price Ladder — Brief Debate

**Subscription Strategist:** "$14.99 is correct *given* the additions in Section 3. The 2.5x ratio works because Family Plan alone would justify $9.99 standalone in any other category. Don't move it."

**Conversion Specialist:** "I'd test $12.99 against $14.99 in a 50/50 split if we had the traffic. We don't. Ship $14.99. The risk at $11.99 is that Pro reads as 'slightly more Basic' instead of 'a different tier.' The risk at $19.99 is sticker shock on a category most buyers have never paid for before. $14.99 is the safe center."

**Both agree:** Keep $5.99 / $14.99. Revisit after 6 months of conversion data. If Pro conversion is < 12% of paid users at month 6, the *features* are wrong, not the price.

---

## 5. Annual Plan — Recommendation

**Ship annual plans at launch. Both tiers.**

- **Basic annual: $59/yr** (17% off vs. $71.88 monthly)
- **Pro annual: $149/yr** (17% off vs. $179.88 monthly)

Reasoning:
1. **Retention math dominates.** Annual subscribers churn at roughly 40-50% the rate of monthly. The 17% revenue discount is paid back inside month 7 of retention.
2. **Cash-flow benefit.** Annual revenue lands up front. For a pre-Series-A founder this is non-trivial runway leverage.
3. **Cultural fit.** The Paradocs product is *built for slow returns* — the corpus grows monthly, your Record evolves quarterly. Annual is the natural billing cadence for a documentary catalogue. Calm, Strava, Ancestry all see >40% of paid users opt for annual when offered at first checkout.
4. **Offer placement.** Default the toggle to monthly on the pricing page (lower friction to start), but show the annual price *as a strikethrough* next to it ("$5.99/mo or $59/yr — save $12.88"). After the first month, send a one-time offer: "Switch to annual and save the next 12 months at 17% off."

Do not offer lifetime plans. The product's value is in the corpus growing under the user — lifetime breaks that contract.

---

## 6. Open Questions for Founder

1. **Family Plan cap: 2 or 3 additional Records?** Panel default is 2 (matches typical iCloud Family / Spotify Duo framing without going full Spotify Family). 3 would let it cover a nuclear family unit but adds margin pressure. Founder call.
2. **Research consultation operator at launch.** Panel assumes founder runs it personally for the first 6 months to set quality bar. Acceptable? If not, who?
3. **Legacy-transfer mechanic.** The "Record passes to ___" toggle is emotionally load-bearing and legally non-trivial. Do we ship it as a soft promise at MVP ("we'll honor designated transfers on request") and build the full mechanism in v2?
4. **Pro tier badge copy.** "Most Complete" vs. "For Researchers" vs. "Family Plan" vs. no badge. Conversion specialist leans "Most Complete" — broadest appeal. Founder may want something more on-brand.
5. **Discount stack.** Should annual + Family compound (e.g., add a Family seat at $4.99/mo extra on annual)? Panel didn't model this. Worth a separate session if Family Plan ships.

---

*— The 2-Voice Pricing Panel*
