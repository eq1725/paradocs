# V11.16 — SME Panel Review: 957 Phenomena Image Strategy

## Context

957 of 1,463 active phenomena in the encyclopedia have no `primary_image_url`. Browse cards on `/explore?view=categories` and detail headers on `/phenomena/[slug]` fall back to `<PhenomenonIcon>` (a Lucide-icon emblem per category) — readable, but visually flat and indistinguishable across siblings.

**What we know from the audit (Queries 2 + 3):**

- Existing image URLs are *all* sourced from Wikimedia Commons (`upload.wikimedia.org`). No local Supabase Storage bucket.
- The existing curation is mixed-quality. Hits (Chupacabra artist rendition, Tehran UFO 1976, Pwca 1880 illustration) sit alongside obvious misses (rove beetle as a cryptid, women's self-defense seminar, generic Greek astronomy chart). The pipeline that produced these was automated Wikipedia keyword search and it accepted a lot of false positives.
- The top-20 highest-traffic missing-image phenomena are **100% cryptids** (Fresno Nightcrawler at 316 reports, Enfield Horror at 114, Smoke Wolf, Dover Demon, Indrid Cold, Owlman, Sheepsquatch, etc.). Every one has an iconic visual reference — trail-cam stills, witness pencil sketches, news illustrations — most in public domain or under fair-use.

**Still pending (Query 1):** category breakdown of the full 957-missing set. The recommendation here covers the part of the problem visible from the data we have; if the long tail turns out to be dominated by abstract psychological/perceptual concepts, the hybrid weighting in the recommendation shifts.

---

## Panel

- **Olive** — Visual design lead. The look-and-feel of the encyclopedia at scale.
- **Marcus** — Content strategy. What signal an image carries on a phenomenon page.
- **Priya** — Legal / licensing. Public domain, fair use, attribution, removal requests.
- **Theo** — Performance engineer. CDN, image format, lazy loading, mobile bandwidth.
- **Asher** — Accessibility specialist. alt-text, screen reader, low-vision, color contrast.

---

## Olive — Visual design

We've been treating "an image" as a binary toggle, but encyclopedias don't work that way. The image is the **emotional commitment to the entry**. Wikipedia learned this in 2007 with their image quality drive — every flagship article got a photograph that *committed* to a specific factual reading: this is what Yosemite looked like at sunset in 2006, this is the only known photograph of Anne Frank, etc. An iconic image makes the article feel investigated.

What we have now is sometimes the opposite: a beetle on a cryptid page tells the reader "this is filler, no one cared." That's worse than no image. **A wrong image actively damages credibility.**

So the V1 quality bar must be: every image we ship must be *defensibly* about that phenomenon. Three acceptable categories:

1. **Witness-documented** — the original photograph, video still, or sketch the case was built on. Fresno Nightcrawler trail cam frame. Bartlett's 1977 Dover Demon sketch. The Patterson-Gimlin frame for Bigfoot. These are the gold standard.

2. **Period illustration** — pre-1928 published illustration that depicts the entity (e.g., Wirt Sikes' 1880 Pwca engraving, which we already have). Public domain by age, visually period-accurate, attribution clean.

3. **Modern reconstruction** — a curated illustrator's interpretation, used under license or commissioned. Lower visual specificity but signals the editorial seriousness. Only use when categories 1 and 2 are unavailable.

What I don't want:

- AI-generated images of cryptids. They look "AI-generated" — flat lighting, unstable anatomy, no specific signature. They fail Wikipedia's commitment test. The reader's first read is "this is filler."
- Stock photography. "A spooky forest" for Sasquatch is the equivalent of using a phone-call clip art for an article about a specific phone call.
- The existing Lucide-icon fallback at hero size. It's fine on browse cards (small) but on `/phenomena/bigfoot` the 64-pixel icon in a 800-pixel hero looks abandoned.

Consistency, on the other hand, is a real visual problem the existing set already has. The Chupacabra artist rendition is illustrated, the Tehran UFO is a grainy photograph, the Pwca is an 1880 woodcut — three very different visual languages on three adjacent encyclopedia pages. **Treat the visual frame as fixed and let the image breathe within it:** consistent crop ratio (4:3 or square), consistent dark-mode-friendly background treatment (subtle gradient overlay so a white-background illustration doesn't blow out next to a dark photograph), consistent typography for the credit line.

---

## Marcus — Content strategy

The image carries a specific function on these pages: it's the **claim anchor**. It says "this thing exists in the world enough that this is what it looks like." For known cryptids with witness documentation, the right image is the *most-frequently-cited* visual artifact in that subculture — what an experiencer or researcher would recognize the moment they land on the page. For a Fresno Nightcrawler page that's not "a CGI white stick figure walking through a park," it's the specific Bakersfield trail-cam 2007 still that motivated the original Reddit discussions.

So sourcing isn't "find any image of X." It's archaeology: what was the *original* image that the phenomenon's discourse was built around? That's what readers expect to see, and it's almost always findable.

**For abstract phenomena (assuming Query 1 reveals a large long-tail in `psychological_experiences`, `consciousness_practices`, `perception_sensory`):** there's no canonical artifact, so the design problem is different. Two options:

- **A symbolic still** — Wikipedia commonly uses brain MRIs, ancient illustrations, or scientific diagrams for entries like "déjà vu" or "out-of-body experience." That works because Wikipedia has 500 words of body text to recontextualize what would otherwise be a strange image choice. We have a 200-word `ai_summary`. The recontextualization is thinner.
- **A unified illustrated set** — commission or license a small set of 30-50 abstract illustrations in a single style (e.g., line art, single-color washes) keyed to phenomenon types. Each abstract phenomenon gets the illustration that best matches its essence. Cheap once you have the set, visually unified, no embarrassing mismatches. This is what Substack's editorial template does and it's robust.

I'd push hard for option (b) for the abstract long-tail. It's a one-time spend that solves 50-200 abstract phenomena at predictable cost.

---

## Priya — Legal & licensing

Wikimedia Commons is the right base layer — we've been using it and it's clean if we handle it correctly. But three pitfalls:

**1. Not all Wikimedia images are CC0.** Many are CC BY-SA or CC BY which require attribution. Several are fair-use under U.S. law but not free-content. The current implementation in production hotlinks to `upload.wikimedia.org` without storing or attributing — that's working because Wikimedia allows hotlinking and treats Paradocs as a downstream user, but it sets us up for two problems later:
  - **Takedown vulnerability** — if a Wikimedia image gets deleted or replaced, our hero image goes 404 with no fallback.
  - **Attribution missing** — for CC BY-SA images we are *technically* required to attribute. Wikimedia's terms are forgiving for now, but if we ever monetize or grow visible, the attribution gap becomes a real risk.

  **Fix:** for every image we adopt, copy the file into Supabase Storage (we'd create a `phenomena-images` bucket if it doesn't already exist), record the license + attribution metadata in a new column or in `paradocs_assessment`-style JSONB, and render the attribution line below the image at hero size on the detail page. Browse cards can omit attribution but still benefit from the in-bucket copy for stability.

**2. AI-generated images carry their own licensing questions.** OpenAI's DALL-E 3 outputs are owned by the prompting user; Imagen 3 has similar terms; SDXL is permissive. If we go AI for any subset, document which model produced which image so future legal questions are answerable. **Don't AI-gen real people** — never the witness, never named researchers. There's no recognition exception that protects us.

**3. Witness sketches and trail-cam stills** — most are pre-1989 amateur work, which doesn't make them public domain automatically. The general posture in cryptid research is fair-use for educational/research display, and that's defensible for Paradocs. But mark these as `fair_use` in the metadata, not `public_domain`, and have a removal-on-request policy posted. We'll get one or two takedown requests a year and we want a clear answer.

---

## Theo — Performance & infrastructure

The image change is going to be one of the bigger perf moves we make this year — 957 new hero images, plus thumbnail variants for the browse-card carousel, plus the OpenGraph share-card variant. Three structural calls:

**1. Format & sizing.** Every image we adopt should be re-encoded to AVIF + WebP with a JPEG fallback, served from Supabase Storage with edge caching. Three sizes per image:
  - `hero` 1200×900 or 1200×1200 — for `/phenomena/[slug]` and the OG share image
  - `card` 600×450 — for browse cards
  - `thumb` 120×90 — for in-line citation chips

We can use `next/image` with a custom loader pointing at Supabase Storage; the responsive sizing falls out of the framework.

**2. Lazy loading.** Hero images load eagerly (LCP target). Browse-grid cards load with `loading="lazy"`. Below-fold images on the encyclopedia browse view default to lazy too. We're already doing this elsewhere; just be disciplined.

**3. Storage cost.** 957 phenomena × 3 sizes × ~150KB average AVIF = ~430MB. Supabase Storage at $0.021/GB/mo = ~$0.009/mo. Negligible. Egress is the real question; with edge caching it's also a non-issue.

**4. Stale-while-revalidate** on the image URL response makes sense — if we ever swap an image (better source found later), readers see the old one for up to 24h before refresh. Acceptable tradeoff for cache hit rate.

**One thing I'd push back on:** don't try to generate images at request-time, even with caching. We've seen this pattern (lazy AI generation on first page-view) get expensive when crawlers hit every phenomenon page in sequence. Pre-generate everything once, store, serve as a static asset.

---

## Asher — Accessibility

This is straightforward but easy to skip and we have skipped it.

**1. Every image needs alt-text that *describes the image*, not "image of Bigfoot."** A blind reader landing on `/phenomena/bigfoot` should hear something like "Frame 352 of the 1967 Patterson-Gimlin film, showing a large dark bipedal figure walking through a clearing at Bluff Creek." That's information. "Bigfoot image" is noise.

**2. AI-generated alt-text is fine for this purpose** — Haiku can write a good descriptive alt-text given the image URL or filename. Build that into the same pipeline that adopts the image.

**3. Decorative use of imagery** (browse cards) can use `alt=""` to signal to screen readers that the image is decorative and the adjacent text is the content. Hero images cannot.

**4. Color contrast.** If we adopt mostly grayscale historical illustrations next to mostly full-color photographs, screen readers don't care but low-vision users with custom color filters will notice. Tag images as `monochrome` or `color` in metadata so dark-mode rendering can do something smart (e.g., apply a slight color cast to grayscale images to match the page treatment).

**5. Prefers-reduced-motion** isn't directly an image concern, but if we add any image transitions (hover zoom, parallax) — disable them under that media query. We already do this on the bottom sheet.

---

## Recommended V1 scope

Synthesizing all five voices:

**Pipeline architecture (build once):**

1. New Supabase Storage bucket `phenomena-images` with `hero/`, `card/`, `thumb/` subfolders.
2. New columns on `phenomena`:
   - `image_source` — `wikimedia` | `ai_generated` | `commissioned` | `fair_use` | `pre_1928`
   - `image_license` — `cc0` | `cc_by` | `cc_by_sa` | `pd_age` | `fair_use_educational` | `proprietary`
   - `image_attribution` — short HTML string for the credit line
   - `image_alt_text` — descriptive alt for screen readers
   - `image_adopted_at` — timestamp
3. New script `scripts/adopt-phenomena-images.ts` that handles the whole pipeline per-phenomenon: fetch source, encode AVIF/WebP/JPEG at three sizes, upload to Storage, write metadata back to DB.

**Sourcing by category:**

- **Cryptids (high-traffic top ~50)** — Wikimedia-curated with manual confirmation. Fresno Nightcrawler → the actual 2007 Bakersfield trail-cam still (Creative Commons via tribute work or fair-use). Dover Demon → Bartlett's sketch. Owlman → Shiels' illustration. Use Haiku to *propose* candidates from a Wikimedia search and a human (or batch-confirmation prompt to a stronger model like Sonnet) picks the best.
- **Cryptids (long tail) + UFOs + ghosts** — same pipeline but lighter confirmation. Accept anything that has the phenomenon's name in the Wikimedia filename or page title.
- **Abstract concepts (psychological_experiences, consciousness_practices, perception_sensory, esoteric_practices)** — commission a unified illustrated set, 30-50 abstract images in a single style, mapped to subcategories. Style direction: clean line art, single-color washes (gold for cryptids, indigo for abstract, etc., to subtly carry category through). One-time cost ~$500-2000 depending on illustrator.
- **Religion / mythology** — Wikimedia public-domain only. Period engravings and pre-1928 illustrations are abundant for these subjects. Quality bar: must depict the entity, not be tangentially related.

**Quality gate (defensible Olive's "no embarrassing mismatch" rule):**

After adopting any candidate image, run a quick Haiku check: "Does this image plausibly depict <phenomenon name>? Provide a confidence score 0-100 and a one-sentence reason." Anything below 60 gets rejected. This is what would have caught the rove-beetle-for-cryptid error in the existing set.

**Sequencing:**

1. Build the pipeline + bucket + schema (1 day)
2. Run the Wikimedia + Haiku-confirmation pass against the top 50 highest-traffic missing phenomena (1 day, ~$5 in Haiku confirmation cost)
3. Spot-check the first 50, tighten the confirmation prompt if needed
4. Run the full Wikimedia pass on the remaining ~700 visual-subject phenomena (2 days, ~$30-50 in confirmation cost)
5. Commission or source the abstract illustration set (1-2 weeks, separate work stream)
6. Run a periodic re-scan against the existing 506 phenomena that already have images, to catch and replace the existing mismatches (the rove-beetle ones) (1 day)

**Total cost estimate:**

- Pipeline infrastructure: $0 incremental (Supabase Storage cost is negligible)
- Haiku confirmation passes (V1 + cleanup): ~$50-100 total
- Optional commissioned abstract set: $500-2000 one-time
- **Range: $50-2100 depending on whether you commission illustrations**

**Won't ship in V1:**

- AI-generated cryptid imagery — explicitly out per Olive's recommendation
- Lazy server-side generation — bad cost profile
- User-uploaded images on phenomenon pages — separate feature, different security posture

---

## Pending: Query 1 (category breakdown of the 957)

Specifically, I need to know what percentage of the 957 missing-image phenomena are in `psychological_experiences` / `consciousness_practices` / `perception_sensory` (which means commissioning illustrations is on the critical path) vs. `cryptids` / `ufos_aliens` / `ghosts_hauntings` / `religion_mythology` (which means Wikimedia + Haiku-confirm dominates the work).

Run this and paste the output and I'll lock in the specific work sequence:

```sql
SELECT category,
       COUNT(*) AS total_active,
       COUNT(*) FILTER (WHERE primary_image_url IS NULL) AS missing,
       COUNT(*) FILTER (WHERE primary_image_url IS NOT NULL) AS has_image,
       ROUND(100.0 * COUNT(*) FILTER (WHERE primary_image_url IS NULL) / COUNT(*), 1) AS pct_missing
FROM phenomena
WHERE status = 'active'
GROUP BY category
ORDER BY missing DESC;
```

---

## Decisions for you

1. **Approve V1 scope above** — Wikimedia + Haiku confirmation for visual subjects, commissioned illustration set for abstract concepts, no AI-generated cryptid imagery. Or pick a different approach.
2. **Commissioned illustration set for abstract phenomena — yes or no?** This is the variable cost. If no, the abstract phenomena keep their Lucide-icon fallback for now and we revisit later.
3. **Priority for the cleanup pass on the existing 506 images that may have mismatches** — fix proactively now, or wait until users report problems? My recommendation: proactively (one-time cost ~$10 in Haiku confirmation, replaces the rove-beetle-style embarrassments before they get noticed).

Reply with answers and I'll start building the pipeline.
