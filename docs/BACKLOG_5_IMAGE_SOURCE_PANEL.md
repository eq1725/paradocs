# Backlog #5 — Image Source Panel Memo

**Decision needed:** how to image the 190 active phenomena currently on placeholder, covering ~69K report-links, without AI generation and without breaking the documentary register.

---

## 1. TL;DR

1. **Primary: Option B (public-domain archival sourcing), executed as a focused 90-day curation sprint** — prioritised by report-link volume, starting with the ghosts_hauntings pool (47K links).
2. **Long-term flywheel: Option A (witness-sketch upload in /submit)** — shipped in parallel as a feature, but treated as compounding inventory, not as the bootstrap solution.
3. **Explicit fallback: Option C (honest absence)** — a designed, branded "no canonical image" treatment for the residual phens (estimated 30–50) where neither archive nor witness sketch lands within tonal bounds.

Ranked: **B > A > C**, used as a stack, not as alternatives.

---

## 2. What the archives actually show

Reconnaissance was deliberately narrow — 8 probes — to ground the debate, not to inventory.

- **Wellcome Collection** — strong on early-modern witchcraft, possession, apparition. Public domain confirmed on individual plates (e.g. *Witchcraft: a white-faced witch meeting a black-faced witch with a great beast*, woodcut 1720; *The secrets of the invisible world disclos'd*, 1735). Maps cleanly onto `esoteric_practices`, `psychic_phenomena`, and a meaningful slice of `ghosts_hauntings`.
- **Library of Congress P&P** — direct hits on spirit photography (the 1901 Fallis seance composite; "Revelations of a spirit medium" title plate; 108 lantern slides on spiritualism incl. Fox sisters, Slade, Palladino, ca. 1926). Almost all pre-1929 → public domain. This is the spine of the ghost/spiritualism pool.
- **Internet Archive — FATE Magazine** — full run from Spring 1948 forward is digitised and freely streamable. Licence status is *not* uniformly public domain (post-1964 issues likely under renewed copyright); usable for research and witness-sketch reference, but each pull needs a per-issue licence check before going live as a hero image.
- **Wikimedia Commons — cryptid coverage** — sparse and uneven. Mothman has a usable "Artist's Impression" plate (the bar). Dover Demon has talk-page discussion of the Bartlett sketch but no clean Commons asset. Fresno Nightcrawler, Owlman, Sheepsquatch returned essentially nothing usable — the Nightcrawler category is Marvel cosplay. **The implication: the cryptid pool (29 phens) is where the archive strategy is weakest.**
- **NYPL Digital Collections** — broad spiritualism/photography holdings exist but require manual search; not as instantly addressable as LOC for our purposes. Useful as a second pass.
- **Folkloric ghosts (Qareen, Chindi, Tunda, Soucouyant, Pishacha)** — no clean ethnographic plates surfaced in initial search. Indirect hits via 19th-century ethnographic compendia on Internet Archive (e.g. *The People of India*, *Indian Antiquary*), but the labour to extract a specific entity-illustration per phen is real. **This is the hardest segment of the ghosts pool.**

Net read: B works extremely well for the spiritualism/witchcraft/Western-occult majority (probably 100–130 of 190 phens), works poorly for modern cryptids and non-Western folkloric entities (probably 40–60 phens), and works case-by-case in between.

---

## 3. Panel debate

**Maya (editorial).** "B is the only one of the three that actually matches the voice we shipped at soft-launch. A 1720 witchcraft woodcut, a Fallis seance plate, a Mumler spirit photograph — these are *primary documents*, not illustrations of a phenomenon. They sit at the same documentary level as a witness affidavit. My objection to A standing alone: we're a soft-launch product. We don't have the submission volume to bootstrap a witness-sketch library before launch — Jordan keeps telling me this. So A as the *sole* bet leaves us looking unfinished for months. My objection to C: 190 placeholders on a launching product reads as 'half-built,' not as 'restrained.' Restraint is what we *choose* to leave out, not what we couldn't finish."

**Jordan (product).** "I want to push Maya on the 'half-built' framing. C is cheaper than people think — *if* the placeholder is designed, not a default grey box. A designed 'no image on record' treatment, with a one-line editorial note, is actually on-brand. That said, I agree B is the headline move. The conversion math: ghosts_hauntings is 47K of 69K report-links — 68% of the affected traffic sits in the pool where archival coverage is *strongest*. We don't need to solve all 190 in 90 days. Solve the top 40 phens by report-link volume in ghosts and ufos, and you've covered the majority of impressions. Where I push back on Maya: I don't want us treating this as a moral project. The user lands on a page expecting *something*. A period engraving of an apparition is something. An empty page with an editorial note is also something. Both are fine. AI gen would be the only bad answer, and that's already off the table."

**Lena (design).** "I'm going to disagree with Jordan slightly on 'just solve the top 40.' The catalogue is browseable. Inconsistent image density between categories will read as quality unevenness, not as editorial choice — unless we *design* it as choice. I'd ship B as the primary, but pair every category with a category-level visual language: a single muted treatment for archival plates (sepia/desaturated, consistent crop, attribution chip in the corner). That way a 1720 woodcut next to a 1901 spirit photograph reads as one catalogue, not as a scrapbook. On the cryptids gap that Sam will raise — I think the honest answer for modern cryptids is a *typographic plate*: phen name set in Changa One with a one-line provenance note ('reported 2007, Fresno, CA'). Treated as a deliberate card style. Better than a bad stock illustration."

**Sam (technical/ops).** "Licensing audit is the load-bearing risk on B, and I want it called out. Wellcome and LOC are clean — both publish rights status per item. Wikimedia Commons is mostly clean but each file needs the licence template confirmed (some are CC-BY, not PD — attribution required). FATE Magazine on Internet Archive is *not* uniformly public domain and we'd be wrong to assume it is for any post-1929 issue. So my recommendation: B is correct, but we need (a) a per-image attribution field in the phen schema, (b) a documented sourcing checklist, and (c) a rule that anything ambiguous gets routed to fallback, not pushed live. On A — I'll push back on Maya's 'A is too slow.' It's slow as a *bootstrap*, but it's the only option whose marginal cost on phen #191 trends to zero. Ship A as soon as the /submit flow supports image attach. Don't ship it instead of B; ship it after. On C — I want it called what it is: a *designed placeholder*, not absence. Costs us a half-day of design work and removes the 'feels unfinished' objection entirely."

**Where they actually disagree:** Maya wants 'no bad images' as a hard rule; Jordan wants 'something on every page' as a near-hard rule; Lena wants visual coherence to be the gate; Sam wants licensing rigour to be the gate. The synthesis works because B, A, and a designed-C version each address a different one of these constraints.

---

## 4. Recommendation

**Primary path: B as a 90-day curation sprint, sequenced by report-link volume.**

30-day concrete first steps:

1. **Week 1** — Schema work: add `image_source`, `image_license`, `image_attribution`, `image_archive_url` to phen records. Sam owns. Add a `no_canonical_image: true` flag for designed-fallback rendering.
2. **Week 1** — Design: Lena produces the archival-plate treatment (muted/desaturated, fixed crop ratio, attribution chip) and the typographic fallback card.
3. **Weeks 2–3** — First batch: top 40 phens by report-link volume from ghosts_hauntings, sourced from LOC spirit-photography holdings and Wellcome witchcraft/possession plates. This covers ~30K report-links — roughly 45% of the affected pool.
4. **Week 4** — Second batch: top 20 phens from ufos_aliens (Foo Fighters has WWII-era press photos in public domain; Pascagoula has Hickson's published sketch; older sightings have newspaper morgue scans on LOC Chronicling America).
5. **Week 4** — Sourcing playbook: documented checklist Sam writes — Wellcome / LOC / Wikimedia / Internet Archive / NYPL, in that order, with the per-source licence rule baked in.

**Secondary path (parallel, not blocking): A — ship witness-sketch upload in /submit.**

Treat as inventory accumulation, not as bootstrap. Marginal cost of phen #191 imaging trends to zero once submission volume scales.

**Fallback: designed-C for the residual.**

For phens where (i) the archive returns nothing within tonal bounds and (ii) no witness sketch yet exists, render Lena's typographic plate. This is the right answer for most modern cryptids (Fresno Nightcrawler, Sheepsquatch, etc.) and for folkloric entities where ethnographic illustration is locked behind paywalled academic sources. Not a hole — a card style.

Expected end-state at 90 days: ~120 phens with archival imagery, ~40 on typographic fallback, ~30 still pending. Down from 190 on raw placeholder.

---

## 5. What we're NOT doing and why

- **AI image generation.** Off the table per operator. Not revisited.
- **Stock illustration / paid illustrator commissions.** Considered, rejected. Breaks the witness/archival authenticity register. Reads as fan-art the moment one tile lands wrong. Also fails the scale constraint — marginal cost per phen stays high.
- **Cryptozoology-fandom wikis as image source.** Considered (e.g. Cryptid Wiki, Fandom-network artwork). Rejected on licensing (mixed/unclear) and on voice (fan-illustration register).
- **B alone, with no fallback.** Rejected: the archive coverage gap on modern cryptids and non-Western folklore is real (see §2), and pretending B solves 100% would result in either bad image choices or indefinite placeholders.
- **A alone.** Rejected: too slow to bootstrap before the public launch window, leaves 190 phens unaddressed for months. Strong as a long-term compounding source; weak as the only move.
- **C alone (default-state placeholder).** Rejected: 190 grey boxes on a launching product reads as unfinished, not as editorial restraint. The *designed* C — Lena's typographic plate — is what we keep, used selectively.
- **Sub-panelist suggestion (Jordan) that we just ship 40 phens and accept inconsistency.** Rejected: catalogue is browseable and inconsistency reads as quality unevenness, not as choice. Resolved by Lena's category-level visual language requirement.
