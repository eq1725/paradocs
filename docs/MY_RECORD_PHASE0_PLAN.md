# My Record — Phase 0/1 Execution Plan

_Bridges `MY_RECORD_UX_PANEL_REVIEW.md` (recommendations) → implementation. Founder directions now locked; this is the ordered, code-grounded execution plan. No payment/membership logic is touched in Phase 0._

---

## Founder directions (LOCKED)

From the 4 open taste-calls:

1. **Free generosity → generous-but-bounded.** Free delivers *complete units of real value* (the Record/Opening, closest kindred with "why you match", one full Dossier section, the living count) so no one feels coerced. Membership is visibly *more* (full kindred set, all 7 Dossier sections, the ritual) — never *access to the actual product*.
2. **Introductions → don't cut, don't build yet.** The matched-user connection concept (users exchanging the unique insights Paradocs surfaced, compounding collective value) is a value-loop worth its own ideation. Build the spine **without** it; run a dedicated panel on purpose/value-loop/safety before any of it ships (Phase 3 at earliest).
3. **Multi-experience → n=1 default, multi first-class.** Center the spine on a single experience; users with multiple experiences get a Record switcher/list that feels **native and equally polished**, not a bolt-on.
4. **Naming → run a naming panel.** "My Record" is a working placeholder, not necessarily the go-to-market name. Naming panel (market-research / product-marketing / mass-market / conversion voices) runs separately; it does **not** block the build.

Two spin-off expert panels queued: **naming**, and **connection/insight-sharing concept**.

---

## Phase 0 — quick wins on the CURRENT page (no flag, reversible, low-risk)

Goal: de-clutter toward app-store-ready without restructuring. The experience-first *reframe* is Phase 1 (flagged), per the panel.

Current `MyRecordTab` render order (grounded): **RADAR chart → category legend → "Share another experience" CTA → "Your report" card → filter chips → match-count → witness-adjacency callout → new-match-alerts card → match list → Dossier surfaces.** The emotional content (the report card + the "N people described this, none of you knew each other" line) sits at positions 4 and 7 — buried under a chart, exactly the panel's critique.

| # | Item | Where (grounded) | Proposed change | Risk |
|---|------|------------------|-----------------|------|
| 0.1 | **Wonder-first lead copy** | `MyRecordTab.tsx` ~1191 ("Your report"), ~1230 ("This is the report we're matching against.") | Warm the register: label → "Your experience"; meta line → something human ("This is your account — every echo below was matched against it."). Keep "report" in data/admin contexts. | Low (copy only) |
| 0.2 | **Honest empty states (kill silent-suppression)** | `PatternsRail.tsx` (L81/83 explicit `return null` on empty — *reconcile with prior "render nothing" brief*), `HintsRail.tsx` (L191/194), geographic/temporal sparse cases | Per-surface call: surfaces that leave a visible *gap* when empty get an honest composed line ("No geographic clustering yet — your night stands alone so far"); rails that hide cleanly with no gap may stay hidden (less clutter). **Each line is a voice call → review diffs.** | Low–med (per-surface judgment) |
| 0.3 | **Remove dead-end / duplicate CTAs** | `MyRecordTab.tsx` "Share another experience" (~1159); audit Library/Saves CTAs | One clear action per moment; remove redundant save/share buttons the panel flagged historically. | Low |
| 0.4 | **Saves → a live destination** | `lab.tsx` tab routing (`library` tab), `LabSavesTab` | Ensure Saves links somewhere alive (not "into a tab and dies"); confirm the Library tab surfaces saved items with a real empty state. | Low |
| 0.5 | **Surface the living-context line earlier** | `MyRecordTab.tsx` witness-adjacency block (~1295, currently gated ≥3 corroborated, buried at position 7) | Make a concise distinction-framed line available near the Opening even at low-kindred ("Yours is rare — only N accounts in 313k echo it"), per the n=1 red-team fix. Borders Phase 1; keep light in Phase 0. | Med |

**Execution note:** 0.1, 0.3, 0.4 are unambiguous and safe. 0.2 and 0.5 carry voice/taste judgment — build as diffs for founder review before commit. Nothing here touches Stripe/membership gating.

---

## Phase 1 — the Record spine (behind a feature flag)

Build ①Opening → ②Kindred → ③Dossier as a single vertical spine as the new `/lab`, demote Library/Explore to one secondary "Browse / Saved" tap, A/B vs. the current page, instrument activation + free→member + the trust guardrail. n=1 as the default case; multi-experience switcher first-class. Generous-but-bounded free per the locked direction. **This is the core of the redesign** and is deliberately flagged + measured, not a live in-place edit.

Phases 2 (Living Edge ritual) and 3 (Artifact + the gated connection feature) follow per the panel roadmap.

---

## Success metrics + guardrails (carry from panel)
Activation (D7 return to My Record), free→member rate + *where* in the spine it fires, D7/D30 retention + Living Edge engagement, share-cards/active-user. **Trust guardrail (must not regress):** refund / cancel / report-block / unsubscribe rates. If conversion rises while any guardrail worsens → roll back.
