# Chronicling America Bulk-Dump Format — Verified 2026-06-13

Direct probe of `chroniclingamerica.loc.gov/data/batches/` to verify what the
prior agent claimed (tarballs at `/collections/chronicling-america/datasets/`
containing `ocr.txt` per page + METS + ALTO + MARC).

## What's actually true

**Bulk endpoint:** `https://chroniclingamerica.loc.gov/data/batches/`
- Open HTTP directory index (no auth, no Cloudflare bot challenge on this path)
- 3,056 batches listed as subdirectories (one per ingestion batch, e.g. `ak_albatross_ver01`)
- Each batch follows BagIt layout:
  ```
  <batch_id>/
    bag-info.txt          # Payload-Oxum, Bag-Size, awardee, contact
    bagit.txt
    manifest-md5.txt
    tagmanifest-md5.txt
    data/
      batch.xml           # MANIFEST: <issue lccn= issueDate= editionOrder=> path
      batch_1.xml         # (same content, legacy)
      <lccn>/             # one dir per paper LCCN in the batch
        <reel_id>/        # one dir per microfilm reel
          <YYYYMMDDee>/   # one dir per issue (date + edition order)
            <seq>.jp2     # page image (~7 MB each)
            <seq>.pdf     # page PDF (~8 KB stub)
            <seq>.xml     # ALTO XML OCR (~850 KB each)
            <YYYYMMDDee>.xml      # issue METS
            <YYYYMMDDee>_1.xml    # issue METS alt
  ```

**Format reality vs prior-agent claims:**
| Claim                                  | Reality                                                  |
| -------------------------------------- | -------------------------------------------------------- |
| `/datasets/` page lists tarballs       | FALSE. That page exists but returns Cloudflare 403 to crawlers; JSON form is empty. Real source is `/data/batches/` HTML index. |
| Per-batch `.tar.bz2` archive           | FALSE. No tarballs anywhere. Batches are HTTP directory trees, file-by-file. |
| `ocr.txt` plain-text per page          | FALSE. Only ALTO XML — `<String CONTENT="...">` elements must be concatenated. |
| METS XML for structure                 | TRUE. Issue-level METS at `<YYYYMMDDee>.xml` (MODS-wrapped). |
| ALTO XML for positioned OCR            | TRUE. ALTO v2 namespace, ABBYY-derived. |
| MARC metadata                          | NOT in batches. Paper-level MARC is at `/lccn/<LCCN>/marc.xml` on the live API. |
| Date encoding                          | In `batch.xml` (`issueDate="YYYY-MM-DD"`) AND in directory name AND in METS. Use `batch.xml` — cheapest. |
| LCCN identifier                        | In `batch.xml` (`lccn="snXXXXXXXX"`) AND as the top-level paper dir name. |
| State                                  | NOT in batch files. Must resolve LCCN → state via existing repo `state-centroids.json` / a separate LCCN-to-paper-metadata mapping (live API `/lccn/<LCCN>/?fo=json` carries it). |
| 1.5 TB compressed for 1880-1928        | Wildly low. See size analysis below. |

## Size analysis — the real blocker

Sampled 30 random batches' `bag-info.txt` Bag-Size headers:
- Min: 14.8 GB (`ak_amaranth_ver01`)
- Median: ~50 GB
- Max: 134.5 GB (`ak_harborseal_ver04`)

Bag-Size includes JP2 page images (which dominate). For our purposes we only
need the ALTO XML. Per-file probe:
- `0007.jp2`: 6,895,456 bytes
- `0007.xml` (ALTO): 854,696 bytes
- `0007.pdf`: 8,185 bytes
- ALTO is ~12% of total batch bytes

**Total ChronAm scale:**
- ~3,056 batches × ~50 GB avg = ~150 TB total compressed footprint
- ALTO subset = ~18 TB
- Even ALTO-only for 1880-1928 (~70% of corpus) = ~12 TB
- Even fetching XML alone: 50M pages × 850 KB = ~42 TB of HTTP transfer

**Throughput observed (parallel burst test, P=10, no rate-limit):**
- 10 concurrent issue-METS fetches (8 KB each) = 3.3s total → ~3 req/s sustained
- ALTO XML at 850 KB each over typical home bandwidth: bandwidth-bound to ~5-10 pages/sec
- At 7 pages/sec sustained: 50M pages = 82 days of continuous download

The "2-3 days at $550" target premise rested on tarballs containing plain
`ocr.txt`. Without tarballs, fetching every ALTO XML to grep locally is not
faster than the live word-coordinates-service API — the bandwidth itself
becomes the wall-clock bottleneck.

## What still works about bulk

- `batch.xml` is small (~MB) and gives every issue's LCCN + date + path with
  ZERO per-page fetches. Useful for *enumeration* and date filtering.
- No Cloudflare 403 on the `data/batches/` path (the live `/collections/`
  endpoint returns 403 to default UAs)
- No observed rate-limit at burst P=10 (would need longer-running test to
  confirm sustained tolerance)
- ALTO String-element concatenation is trivial (regex `<String[^>]+CONTENT="`)

## Viable alternatives (NOT BUILT — Chase's call)

1. **Selective bulk** — fetch only ALTO for batches whose `batch.xml` issue
   dates fall in 1880-1928. Most papers' batches are narrow date ranges,
   so this drops ~25% of bytes. Still ~9 TB.
2. **Title-targeted bulk** — pick the highest-yield papers from existing
   1895-97 results (e.g. specific big-city dailies) and only ingest those
   LCCNs. ~50 papers covers most of the yield. ~1 TB. Feasible.
3. **Hybrid: keep live API + parallelism + better rate-utilization**. The
   live API's word-coordinates-service path was 0.35s warm, and we have not
   tested parallel fetches against it. If P=5 is tolerated, the 24-day
   estimate drops to ~5 days at the same $550 budget.
4. **Pay LoC for AWS S3 access** — ChronAm has been migrated to S3 for
   internal use; the public bulk via Cloudflare-fronted HTTP is the
   user-facing layer. There's a documented data-services request channel.

## Phase 2 (term-list update) was applied

Independent of the bulk-vs-live decision, the term-list edits in
`src/lib/ingestion/ca-harvest.config.ts` are valid and shipped:
- Dropped: `monster seen`, `meteor mystery`, `lake monster`, `strange lights in the sky`, `strange object in the sky`, `prophetic dream`
- Downgraded to maxPages: `wild man`, `sea serpent` (via new field, default cap = 5)
- Added 22 new terms across ghosts/psychic/UFO/cryptid categories
- Enabled `mental telegraphy`

## Phase 3 was NOT BUILT

Per dispatch guideline ("report blocker honestly rather than working around
it"), I did not write `scripts/ca-bulk-ingest.ts`. The plan as written can
not deliver 50k approved CA reports in 2-3 days because the bulk endpoint
is not a bulk tarball — it's a per-file HTTP tree of ALTO XML at 850 KB
each, dominated by image bytes, and selecting only matching pages requires
either downloading every page or going back to the live search API.

Recommend Chase choose alternative 2 or 3 before any further build.
