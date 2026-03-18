# Session Prompt: Report Experience — Roswell Content Enrichment

Read `PROJECT_STATUS.md` and `HANDOFF_REPORTS.md` before doing anything else. These are your coordination documents. Pay special attention to the **"NEXT PRIORITY: Roswell Content Enrichment"** section in HANDOFF_REPORTS.md — it contains the complete source inventory, per-report enrichment plan, and critical principles.

## Mission

The Roswell cluster (13 reports: 1 showcase + 12 witnesses) is the quality bar for ALL future Paradocs content. Currently the descriptions are 2,000-3,000 chars — solid but not comprehensive. They need to be 4,000-6,000+ chars that demonstrate Paradocs' value proposition as the world's best aggregated resource for paranormal phenomena research.

Your job: research every available source, verify every fact, synthesize everything through the Paradocs lens, and rewrite all 13 report descriptions to be substantively richer.

## What's been completed (do not redo):

* All 13 report pages exist, are linked to the case group, have media images stored in Supabase Storage
* Pull quote system works (quotes must be 40+ chars between `"..."` to trigger)
* Attribution regex has NOT_NAMES blocklist and isLikelyName() validator
* AI Analysis system is hash-based cached + DB-grounded (no hallucination)
* Client-side navigation between reports works (hooks violation fixed, stale-slug guard)
* On-demand ISR revalidation available at `/api/admin/revalidate` (POST array of paths)
* General admin media endpoint at `/api/admin/add-media` (POST with slug, url, caption, media_type)
* Barnett YouTube video added, Glenn Dennis video added (`_DA-g94Ro1I`)

## Sources to research (fetch and synthesize):

1. **roswellproof.com** — Dedicated witness pages, debris analysis, ABC News bulletin, Ramey Memo:
   - `/Chester_Lytle.html`, `/Dennis.html`, `/dubose.html`, `/brazel_interview.html`
   - `/debris_main.html`, `/debris1_beams.html`, `/debris2_memory_foil.html`
   - `/ABC_News_July8.html`, `/post-1947-Roswell-references.html`, `/lovekin.html`
   - `/debris5_parchment.html`, `/debris3_misc_metal.html`, `/debris7_quantity.html`

2. **roswellfiles.com** — Individual witness profiles (`/Witnesses/*.htm`)

3. **Kevin Randle's blog** — kevinrandle.blogspot.com — analytical posts on Cavitt, Rickett, Marcel, Blanchard

4. **Government documents:**
   - GAO Report NSIAD-95-187: `gao.gov/assets/nsiad-95-187.pdf`
   - NSA Roswell Report: `nsa.gov/portals/75/documents/news-features/declassified-documents/ufo/report_af_roswell.pdf`
   - FBI Vault: `vault.fbi.gov/Roswell%20UFO`
   - National Archives footage: `archive.org/details/gov.archives.341-roswell-*`

5. **SoundCloud** — ABC News 1947 broadcast: `soundcloud.com/x503/abc-news-1947-roswell-ufo`

6. **Wikipedia** — Roswell incident, Glenn Dennis, individual witness articles

7. **ufoevidence.org/documents/doc397.htm** — Compiled witness testimonies

## Per-report enrichment targets:

See the table in HANDOFF_REPORTS.md for current vs target char counts and specific additions needed per report.

## Approach:

1. Research each source methodically — fetch the page, extract facts, verify against other sources
2. For each report, draft the enriched description locally
3. Update via an admin script (pattern: `fix-roswell-quotes.ts` does find/replace on descriptions)
4. Add any new media (YouTube videos, document links) via `/api/admin/add-media`
5. Run `/api/admin/revalidate` to refresh ISR cache
6. Verify each page renders correctly

## Critical rules:

* **NEVER hallucinate.** Every factual claim must trace to a documented source. If uncertain, say "according to [source]" or "reportedly" — never state contested claims as established fact.
* **Include uncertainty explicitly.** Where testimony is contested or evolved over time, explain the controversy with specifics.
* **Format quotes for pull extraction.** Key testimony quotes should be 40+ chars between quotation marks. Use `"Name stated: "The full quote here that's at least forty characters long."` pattern.
* **Store all images in Supabase Storage.** Use the `store-roswell-media.ts` pattern. Never hotlink to external URLs.
* **Never claim something doesn't exist** without thorough verification (the Barnett "no photo exists" mistake).
* **Attribute everything.** "According to [Name]", "As documented in [Source]", "Per the [Year] Air Force report".

## Key technical context:

* SWC compatibility in admin scripts: use `var`, `function(){}`, no template literals in browser-side code. Next.js codebase uses normal TypeScript.
* User pushes from local terminal (`git push origin main`). Provide commit commands but don't try to push from sandbox.
* Vercel auto-deploys on push to main (~2 min build time).
* Admin scripts run from browser console using auth token in localStorage key `sb-bhkbctdmwnowfmqpksed-auth-token`.
* The user's core principle: accuracy and transparency over estimation. If values are approximate, the platform must be clear about that.
* Do NOT add "Co-Authored-By" lines to commit messages.
