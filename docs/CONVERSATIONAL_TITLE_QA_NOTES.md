# Conversational-Title QA Audit Notes — V11.17.98

**Date**: 2026-06-06
**Trigger**: Founder flagged report URL `https://www.discoverparadocs.com/report/christmas-2017-i-was-visiting-family-in-sedona-and-we-were-p-o2adqg`
**Smoking gun**: a URL slug shaped like a chopped first-sentence narrative.

## Flagged report's full record

```
id                : 8c4897fa-a5c0-4644-baf1-cfd73948988f
slug              : christmas-2017-i-was-visiting-family-in-sedona-and-we-were-p-o2adqg
title             : Massive Underground Boom Shakes Sedona Hotel Room  ← clean Haiku title
source_type       : youtube
source_url        : https://youtube.com/watch?v=djyW0WzPxac&lc=UgxN0bB5kQj6JProKa14AaABAg
category          : cryptids                                            ← mismatched (story is hotel noise)
original_report_id: yt-comment-UgxN0bB5kQj6JProKa14AaABAg
status            : approved → archived (this audit)
visibility        : public
metadata.yt_signal: comment
metadata.contentKind: comment
metadata.likeCount: 30
metadata.replyCount: 7
metadata.videoTitle: "Skinwalker Ranch & Sedona: The Underground Base Pipeline"
metadata.channelName: "Jesse Michels"
paradocs_analysis_model: claude-haiku-4-5-20251001 (consolidated-batch)
description (first 200): "Christmas 2017 I was visiting family in Sedona and we
                          were playing  cards when we heard a loud boom that
                          shook the entire hotel room. I immediately walked
                          outside, saw an older man walking his dog..."
```

The title field is clean — Haiku had already rewritten it from the raw conversational opener to a proper newspaper-style headline. **The slug, however, was generated at INSERT time from the raw adapter title and never refreshed.** That's why the URL still leaks "christmas-2017-i-was-visiting-family-in-sedona-and-we-were-p".

## Audit findings

### Title quality (the founder's hypothesis)
Scanned 6,521 reports whose **slug** starts with a conversational opener
(`christmas-`, `i-was-`, `when-i-was-`, `my-mom-`, `last-night-`,
`this-happened-`, `me-and-my-`, `we-were-`, `so-i-`, etc.) AND verified
whether the **title** itself is still a fragment.

**Result: 0 matches.** Every single report's title has been cleaned to a
proper Haiku-generated headline. Examples:
- slug `me-and-my-wife-both-witnessed-the-same-thing-hah6or`
  title `Shadow Moves Fast Through Apartment as Couple Watches`
- slug `i-had-my-first-lucid-dream-ever-mjidyq`
  title `Hands Splinter, Body Floats in First Lucid Dream`
- slug `my-friend-saw-a-ghost-in-his-dorm-7wz5tw`
  title `Grayish Figure Walks Through Wall at Citadel Dorm`

**Conclusion**: there is no corpus-wide bad-title problem. The visible
defect is **slug staleness**.

### Slug staleness (the actual root cause)
- ~6,521 approved reports have URL slugs that still encode the raw
  pre-Haiku title.
- By source_type the staleness skews to Reddit (`reddit`, by far the
  largest share) and YouTube comments (a small slice).
- These reports themselves are otherwise clean — title, narrative, hook,
  feed_hook, etc. are all Haiku output.

### YouTube comments as the secondary concern
- 18 total approved reports with `metadata.yt_signal = 'comment'`.
- Most are legitimate first-person experiencer accounts (Holloman UFO,
  NAS Fallon disc sighting, NDE, sleep paralysis, etc.) where Haiku
  generated good titles.
- The flagged Sedona report stood out: a YouTube comment about a loud
  Christmas hotel boom, mis-categorized as `cryptids`, where the
  witness's own framing concedes the explanation is mundane ("Vietnam
  vet said definitely not a bomb"). Weak anomaly signal.

## Archive results

1 report flipped to `status='archived'`:

| id | slug | title | reason |
|----|------|-------|--------|
| 8c4897fa-a5c0-4644-baf1-cfd73948988f | christmas-2017-i-was-visiting-family-in-sedona-and-we-were-p-o2adqg | Massive Underground Boom Shakes Sedona Hotel Room | YouTube comment, mismatched cryptids category, weak anomaly (witness self-explains as mundane underground noise) |

`moderation_notes` set to: `V11.17.98 — QA audit: YouTube comment treated as report; conversational fragment with weak anomaly signal (loud-boom story already mundanely explained by witness)`

**Intentionally NOT archived**: the other 6,520 conversational-slug
reports. Their titles + narratives are all clean Haiku output; only their
URLs are cosmetically stale. Mass-archiving them would destroy 6,500+
legitimate reports for a URL-cleanup defect. Pending founder sign-off
on a slug-backfill (would also require slug-alias 301 redirects to
preserve inbound links / search index).

## Upstream gap

**File**: `src/lib/services/consolidated-ai.service.ts`
**Function**: `persistConsolidatedResult()` — line ~775
**Bug**: the function UPDATEs `reports.title` with Haiku's new headline (line 901, `title: p.title || fallbackTitle`) but never touches `reports.slug`. The slug was set at INSERT time inside `src/lib/ingestion/engine.ts:generateSlug()` (line 528) from `report.title` — the RAW adapter title, before Haiku had ever seen it. So:

- INSERT: slug = chopped-raw-title + "-" + 8-char hash
- UPDATE (Haiku): title overwritten, slug untouched
- Result: URL forever encodes the pre-Haiku conversational fragment

Same call path also covers the `batch-ingest-worker.ts` mass-mode path
(through `modelMarker: 'consolidated-batch'`), so 100k+ batch-mode
reports inherited the same staleness.

## Hardening fix applied — V11.17.98

**File**: `src/lib/services/consolidated-ai.service.ts`
**Location**: `persistConsolidatedResult()`, immediately after `updateData` is built and before the UPDATE call.

When Haiku emits a new `title`:
1. Fetch the existing slug.
2. Split it into prefix + 8-char hash suffix (regex `-([a-z0-9]{4,8})$`).
3. Recompute the prefix from the new title using the same rules as `engine.ts:generateSlug` (lowercase, non-alphanumeric → `-`, trim, max 60 chars).
4. If the new prefix differs from the existing prefix AND is non-empty, attach the original suffix and set `updateData.slug = newSlug`.
5. Wrapped in `try/catch` — slug refresh is best-effort; a slug-write failure does NOT block the primary AI-field persistence.

Why preserve the hash suffix: it's deterministic from `source_type + original_report_id` (engine.ts line 537), so collision risk is unchanged from the original insert-time slug. Old URLs will 404 unless we add a `slug_aliases` table later — see open question below.

Stamped `V11.17.98 - conversational-title gate` (per founder convention).

## Verification

- `npx tsc --noEmit` on the file: clean (no new errors).
- Sedona report confirmed archived (status='archived'), so URL still resolves to nothing in `/report/[slug].tsx` (filter is `.eq('status', 'approved')`).

## Open question for founder

**Should we backfill slugs for the 6,521 existing reports?** Options:

- **(A) Leave as-is** — slug-refresh applies to future Haiku regen runs only. Existing URLs stay ugly but indexed. Zero risk to SEO / inbound links.
- **(B) One-shot backfill + slug_aliases table** — write a script that for each stale slug: (i) regenerates the prefix from the current Haiku title, (ii) stores the OLD slug in a new `slug_aliases(old_slug, report_id)` table, (iii) updates the report row. Then add a fallback in `pages/report/[slug].tsx` that checks `slug_aliases` on 404 and 301s to the new slug. ~3-4h of work, preserves all inbound links + search index.
- **(C) Backfill without redirects** — cheap & dirty: just rewrite the slugs. Inbound links from external sites / cached search results break.

Recommendation: **(A) for now**, queue (B) if/when the visible URL ugliness becomes a brand-cost problem.
