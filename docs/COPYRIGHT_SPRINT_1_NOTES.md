# Copyright Sprint 1 — Implementation Notes

**Date:** June 8, 2026
**Status:** Code changes saved locally. NOT committed (operator commits).
**Parent docs:**
- `docs/COPYRIGHT_DERIVATIVE_WORK_AUDIT.md` (the audit that defined this sprint)
- `docs/HAIKU_NARRATIVE_DERIVATIVE_AUDIT.md` (anti-paraphrase rule source)

---

## 1. What shipped (1-paragraph summary)

Sprint 1 closes the four highest-leverage fair-use gaps the audit identified: a public `/sources` page documenting the documentary-catalogue framework + per-source list + takedown contact; a public `/dmca` page with the Section 512 procedure and a registered-DMCA-agent placeholder; the removal of `SourceBlock`'s Tier-2 OG-thumbnail + 500-char italicized excerpt card (sources that previously rendered with an excerpt now render text-only attribution); and the verbatim port of the `GLOBAL ANTI-PARAPHRASE RULE` from the fallback `paradocs-analysis.service.ts` into the production `consolidated-ai.service.ts` prompt so Haiku narratives never echo witness language outside of attributed short quotations. No DB writes, no background-script changes, no AI calls were made during implementation. Pre-existing typecheck errors in unrelated files were not introduced or worsened by these changes — the four edited files type-check clean.

---

## 2. File-by-file diff summary

### 2.1 New file: `src/pages/sources.tsx`

- New public page at `/sources`.
- Narrow column (`max-w-3xl`), documentary register, mobile-first.
- Sections: Header + framing paragraph; Editorial framework; Sources catalogued (NUFORC, Reddit, YouTube, NDERF, OBERF, ADCRF, BFRO, Wikipedia, Government/FOIA/public-domain); "Not currently ingested" callout for Erowid + IANDS; Methodology (ingestion, narrative generation, taxonomy); Takedown & contact.
- Scaffolding (`<Head>`, narrow column, back-link, gradient header card) copied from `src/pages/privacy.tsx`.
- Links to `/dmca`, `/phenomena`.
- Contact emails: `takedown@discoverparadocs.com` (general takedown), `dmca@discoverparadocs.com` (formal DMCA via `/dmca`).

### 2.2 New file: `src/pages/dmca.tsx`

- New public page at `/dmca`.
- Same scaffolding as `/sources` (narrow column, gradient header, back-link).
- Sections: Designated DMCA agent (with `[TO BE REGISTERED]` placeholders for name/address/phone, email `dmca@discoverparadocs.com`); the six §512(c)(3)(A) required elements as a numbered list; Counter-notification (§512(g)); Repeat-infringer policy (§512(i)); Send-notices-to restatement; non-legal-advice disclaimer.
- Operator must replace the three `[TO BE REGISTERED — see operator runbook]` placeholders once the agent registration is complete (see Section 3 below).

### 2.3 `src/components/reports/SourceBlock.tsx` (edited)

- Added a `V11.17.x` header comment block documenting the Sprint 1 change.
- Updated the file-level docstring from "Three rendering modes" to "Two rendering modes" and rewrote the per-tier description.
- Removed the `<Tier2Card>` invocation (previously gated on `oembed.tier === 2`) — replaced with an inline comment explaining the removal.
- Deleted the `Tier2Card` function definition (previously ~45 lines).
- Removed the now-unused `Link2` import from `lucide-react`.
- Marked `excerpt` and `thumbnailUrl` props as `@deprecated` on the `SourceBlockProps` interface so existing call sites (`ReportPageV2.tsx` passes both) continue to type-check without modification, while the values are silently ignored.
- Removed `excerpt` and `thumbnailUrl` from the destructure in `SourceBlock` since they are no longer rendered; added a comment explaining the back-compat reason.
- Tier 1 (sandboxed iframes for YouTube/Reddit/Vimeo/Imgur), `AttributionHeader`, `PlatformBadge`, `EmbedFrame`, `AdditionalMedia` are **unchanged**.
- `Tier2Card` is a local subcomponent — verified via `grep -r Tier2Card src` that nothing else imports it.

### 2.4 `src/lib/services/consolidated-ai.service.ts` (edited)

- Added a new `GLOBAL ANTI-PARAPHRASE RULE` block immediately after the existing `ANALYSIS (narrative body) RULES` block (around line 372 in the prompt array).
- Block is ported from `paradocs-analysis.service.ts:609–612`, lightly adapted to the consolidated prompt's bullet style and combined with the audit's R3 attributed-quote exception (max 12 words, inline `as the witness puts it`).
- Marked with a TS comment: `// V11.17.x — ported from paradocs-analysis.service.ts:609 per HAIKU_NARRATIVE_DERIVATIVE_AUDIT.md`.
- Preserves the existing prompt structure — no other prompt text was modified.
- Rule applies to `analysis`, `hook`, `feed_hook`, `pull_quote` per the audit's scope.

### 2.5 New file: `docs/COPYRIGHT_SPRINT_1_NOTES.md`

This document.

---

## 3. DMCA agent registration runbook

The `/dmca` page ships with three `[TO BE REGISTERED — see operator runbook]` placeholders. To complete safe-harbor status under 17 U.S.C. §512(c)(2), the operator must register a designated agent with the U.S. Copyright Office and then fill those placeholders.

### Steps

1. Visit the U.S. Copyright Office Designated Agent Directory:
   <https://www.copyright.gov/dmca-directory/>
2. Click "Login or Register" (the eCO portal).
3. Create a Service Provider account if you don't already have one for Paradocs.
4. Designate an agent. You'll need:
   - **Service Provider legal name** (the entity that owns Paradocs — LLC, Inc., or sole prop).
   - **Service Provider alternate names** (include "Paradocs", "DiscoverParadocs", and the production domain).
   - **Designated agent name** (an individual or a position title, e.g. "DMCA Agent, Paradocs").
   - **Physical address** (a real street address — P.O. boxes are not accepted by the Copyright Office).
   - **Telephone number** (a real phone number).
   - **Email address** — use `dmca@discoverparadocs.com` (already wired up in `/dmca`).
5. Pay the $6 registration fee.
6. Record the assigned Service Provider ID (six-digit number).
7. Update `src/pages/dmca.tsx` — replace the three `[TO BE REGISTERED — see operator runbook]` strings in the "Designated DMCA agent" section and in the "Send notices to" section with the real name/address/phone.
8. Set a calendar reminder to renew the designation every three years (Copyright Office requirement; missing the renewal forfeits safe-harbor status).
9. Configure `dmca@discoverparadocs.com` as a real, monitored inbox (forwarding to legal or counsel works). Set an internal SLA of 24–48 hours for first response.

### Where to put the values

In `src/pages/dmca.tsx`, find the three occurrences of `[TO BE REGISTERED — see operator runbook]` and replace with the registered values. Both the "Designated DMCA agent" block and the "Send notices to" block need updating.

---

## 4. Post-deploy spot-check commands

Run after the operator deploys the Sprint 1 commit.

### 4.1 Verify the two new pages render

```bash
# Replace with the prod URL.
curl -sI https://discoverparadocs.com/sources | head -1
curl -sI https://discoverparadocs.com/dmca   | head -1
# Each should return: HTTP/2 200
```

Then visit each in a browser and confirm:

- `/sources` — header, framing paragraph, source list (NUFORC/Reddit/YouTube/NDERF/OBERF/ADCRF/BFRO/Wikipedia/Government), Erowid+IANDS callout, methodology paragraphs, takedown email, link to `/dmca`.
- `/dmca` — header, "TO BE REGISTERED" placeholders visible (until §3 above is complete), six numbered §512(c)(3)(A) elements, counter-notification paragraph, repeat-infringer paragraph, send-notices-to block.

### 4.2 Confirm Tier-2 sources no longer render an excerpt

Identify three known former Tier-2 reports (news, BFRO, or OBERF sources without an iframe embed). For each:

```bash
# Example slugs — adapt to whatever the operator has handy.
curl -s https://discoverparadocs.com/report/<some-bfro-slug> | grep -i "fair use for commentary"
# Should print NOTHING. The old Tier-2 caption was the only place that string appeared.

curl -s https://discoverparadocs.com/report/<some-bfro-slug> | grep -c "Originally published at"
# Should print 1 (the AttributionHeader still renders).
```

If a curl-based check is fiddly, just load three known-Tier-2 report pages in a browser and confirm:

- The SourceBlock contains the "Originally published at X" header and the "Read original" button.
- There is **no** italicized blockquote with a 500-char excerpt.
- There is **no** OG thumbnail image inside the SourceBlock.
- The "Excerpt and preview shown under fair use for commentary" caption is gone.

### 4.3 Verify YouTube / Reddit iframe embeds still work (Tier 1 unchanged)

Load one YouTube-sourced and one Reddit-sourced report. Confirm the sandboxed iframe still renders below the AttributionHeader. No regression should be visible — the change only touched Tier 2.

### 4.4 Confirm new Haiku narratives are free of light-paraphrase

After the deploy, pick three reports whose `paradocs_narrative` was generated **after** the deploy timestamp. Run the same n-gram check the audit used (`docs/HAIKU_NARRATIVE_DERIVATIVE_AUDIT.md` §"Appendix: Audit method, reproducibility").

Quick spot-check (operator can adapt the audit's helper or do it by eye):

```sql
-- Identify three recent narratives to spot-check (run via Supabase SQL editor with read-only role).
SELECT slug, source_type, paradocs_analysis_generated_at,
       length(description) AS src_len,
       length(paradocs_narrative) AS narr_len
FROM reports
WHERE paradocs_narrative IS NOT NULL
  AND description IS NOT NULL
  AND paradocs_analysis_generated_at > '<DEPLOY_TIMESTAMP>'
ORDER BY paradocs_analysis_generated_at DESC
LIMIT 3;
```

For each, fetch `description` and `paradocs_narrative` and confirm by eye:

- No verbatim 7+-word run from the source appears in the narrative **outside of** quotation marks.
- Any quoted witness phrase is short (≤12 words) and attributed inline ("as the witness puts it", "the source describes").

Target outcome: 3/3 spot-checks clean. If a longer unattributed verbatim run appears, the prompt change did not take effect — verify the deploy actually included `consolidated-ai.service.ts` and that `USE_CONSOLIDATED_AI=true` is still set.

---

## 5. Pre-commit checklist for the operator

Before `git add` + `git commit`:

- [ ] Read the four edited files end-to-end one more time.
- [ ] `npx tsc --noEmit` — confirm no NEW errors compared to the pre-Sprint baseline (Sprint 1 introduced zero new errors; pre-existing errors in `scripts/`, `LogToConstellation.tsx`, etc. are unaffected).
- [ ] `npm run dev` — load `/sources` and `/dmca` locally; confirm the chrome renders and links resolve.
- [ ] Spot-check a Tier-2 report locally; confirm no excerpt + no thumbnail in the SourceBlock.
- [ ] Confirm Tier-1 iframe embeds (YouTube/Reddit) still render unchanged.
- [ ] Decide whether to commit the runbook (`docs/COPYRIGHT_SPRINT_1_NOTES.md`) along with the code changes (recommended — keeps the rationale next to the diff in git history).

### Suggested `git add` commands

```bash
cd /Users/chase/paradocs
git add src/pages/sources.tsx
git add src/pages/dmca.tsx
git add src/components/reports/SourceBlock.tsx
git add src/lib/services/consolidated-ai.service.ts
git add docs/COPYRIGHT_SPRINT_1_NOTES.md
git status   # sanity-check that nothing else is staged
git diff --cached --stat
```

### Suggested commit message

```
V11.17.x — Copyright Sprint 1: /sources + /dmca + drop SourceBlock Tier 2 + port anti-paraphrase rule

- Add /sources page documenting the documentary-catalogue framework, per-source
  list (NUFORC/Reddit/YouTube/NDERF/OBERF/ADCRF/BFRO/Wikipedia/Govt), and
  takedown contact. Erowid + IANDS explicitly flagged as not ingested.
- Add /dmca page with §512 procedure, six §512(c)(3)(A) elements,
  counter-notification + repeat-infringer paragraphs. Designated agent
  placeholder pending operator registration with US Copyright Office ($6).
- Drop SourceBlock Tier 2 (OG thumbnail + 500-char italicized excerpt card)
  per copyright Sprint 1. Sources that previously resolved to Tier 2 now
  render the text-only AttributionHeader only. Tier 1 (iframe embeds) and
  AttributionHeader unchanged.
- Port GLOBAL ANTI-PARAPHRASE RULE from paradocs-analysis.service.ts:609
  into the live consolidated-ai prompt. Closes the prompt-level gap the
  Haiku derivative-work sub-audit identified (4/15 LIGHT-PARAPHRASE samples).

Pending operator action:
- Register DMCA agent at https://www.copyright.gov/dmca-directory/ ($6) and
  fill the three placeholders in src/pages/dmca.tsx.
- Stand up the dmca@discoverparadocs.com and takedown@discoverparadocs.com
  inboxes for monitoring.

See docs/COPYRIGHT_SPRINT_1_NOTES.md for full runbook.
```

---

## 6. Rollback steps

If anything regresses post-deploy, here is the rollback for each change.

### 6.1 Roll back `/sources` and `/dmca`

```bash
git rm src/pages/sources.tsx src/pages/dmca.tsx
git commit -m "Revert: drop /sources and /dmca pages"
```

There are no dynamic imports or links to these pages from elsewhere in the code — removing the files is sufficient. Inbound links from `/privacy` or `/terms` (if you added any later) would 404, so audit those before reverting.

### 6.2 Roll back the SourceBlock Tier-2 drop

If founder wants Tier-2 back, the simplest path is to revert the SourceBlock commit:

```bash
git revert <sprint-1-commit-sha> -- src/components/reports/SourceBlock.tsx
```

That restores the `Tier2Card` subcomponent, the `Link2` import, the `excerpt`/`thumbnailUrl` destructure, and the `{oembed.tier === 2 && <Tier2Card .../>}` invocation in one shot. Callers in `ReportPageV2.tsx` did not change, so the revert is self-contained.

### 6.3 Roll back the anti-paraphrase prompt port

Delete the new `GLOBAL ANTI-PARAPHRASE RULE` block in `src/lib/services/consolidated-ai.service.ts` (lines added between the existing `ANALYSIS RULES` block and the `FRAMES` block). The block is bounded by the `// V11.17.x — ported from paradocs-analysis.service.ts:609 …` comment and the next `'====...'` divider before `'GLOBAL ANTI-PARAPHRASE RULE …'`.

Effect of rollback: Haiku narratives revert to the pre-Sprint behavior, which the audit measured at 11/15 FACTS-DERIVED, 4/15 LIGHT-PARAPHRASE. The risk is reabsorbed but does not break anything functionally.

### 6.4 Roll back everything

```bash
git revert <sprint-1-commit-sha>
```

If Sprint 1 was committed as a single commit, a single `git revert` undoes all four changes plus the runbook.

---

## 7. Open questions for the operator / counsel

These are unchanged from the parent audit but worth flagging here:

1. **DMCA agent registration** — actually pull the trigger on the $6 registration. Until then, the `/dmca` page lists placeholders, which is legally weaker than no page at all if a rights-holder claims they couldn't find a real agent to send notice to.
2. **Storage-layer caps** — Sprint 1 does NOT touch the per-source `description` storage caps the audit recommended (Reddit 1,500-char cap, NDERF/OBERF 3,000-char cap, NUFORC 2,000-char cap, etc.). That belongs to a separate sprint with a one-time backfill migration.
3. **Erowid + IANDS row archival** — Sprint 1 declares on `/sources` that we don't currently ingest these. Verify that the corresponding adapters are paused in operations AND that any existing IANDS/Erowid rows are archived (`status='archived'`) so the public claim matches the DB reality. If they aren't, either archive the rows or amend the `/sources` copy.
4. **Counsel review** — none of this is legal advice. Before mass-market launch, a media/IP attorney should review the `/dmca`, `/sources`, and ToS language. The `B0_8_LEGAL_REVIEW_PACKET.md` brief is already drafted for that purpose.
