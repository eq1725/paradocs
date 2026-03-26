# Paradocs Media Policy — Source-by-Source

**Date:** March 26, 2026
**Context:** ToS/copyright review for all active ingestion sources to determine whether we can download+store media in Supabase Storage vs. link-only to original source.

**Guiding principle:** Where ToS permits, download and store in Supabase (`report-media` bucket). Where it doesn't, hotlink to original source URL only. No AI-generated images on report pages.

---

## Policy Matrix

| Source | Media Policy | Rationale |
|--------|-------------|-----------|
| **Wikipedia / Wikimedia Commons** | ✅ DOWNLOAD + STORE | CC BY-SA license. Can reuse with attribution. Must include license notice + link to original. |
| **NUFORC** | ⚠️ LINK ONLY | Site copyright © 2026 NUFORC. User submissions grant NUFORC a perpetual license, but no sublicense to third parties is stated. Media (photos attached to reports) should be linked, not stored. |
| **BFRO** | ⚠️ LINK ONLY | © BFRO.net — standard copyright, no public reuse license found. No ToS page discovered. Conservative approach: link only. |
| **Reddit** | ⚠️ LINK ONLY | Reddit ToS requires permission for commercial use of content. Reddit allows embeds for "reasonable use" but does not grant download/republishing rights. Link to original posts; use Reddit embed URLs where possible. |
| **YouTube** | ⚠️ EMBED ONLY | YouTube ToS explicitly permits embedding via their embed player. Downloading thumbnails or video content is prohibited. Use YouTube embed iframes and link to original videos. |
| **Erowid** | ❌ LINK ONLY | Explicitly prohibits reuse and AI ingestion without written permission. Text content already indexed under fair-use index model; media must never be downloaded. |
| **NDERF** | ❌ LINK ONLY | Joint copyright with experiencers. Most experiencers don't grant republishing permission. Link only. |
| **IANDS** | ❌ LINK ONLY | "All Rights Reserved." Explicit statement: linking is not permission to duplicate or republish content. Academic fair-use citations only. |
| **Shadowlands** | ⚠️ LINK ONLY | © 1998 shadowlord@theshadowlands.net. Standard copyright, no reuse license found. Primarily text-only site (minimal media). Link only. |
| **Ghosts of America** | ⚠️ LINK ONLY | No ToS found. User-submitted ghost sightings. Conservative approach: link only. Primarily text-only. |
| **News** | ❌ LINK ONLY | News articles are copyrighted. Never download news media. Always link to original article. |
| **Government / FOIA / BlackVault / GEIPAN** | ✅ DOWNLOAD + STORE | US government works are public domain. FOIA-released documents can be stored. BlackVault already provides public access. GEIPAN (French agency) publishes under similar open access. |
| **Kaggle / HuggingFace imports** | ✅ DOWNLOAD + STORE (check dataset license) | Pre-cleaned datasets — check individual dataset license. Most are CC-BY or open. |

---

## Implementation Rules

### For adapters that DOWNLOAD + STORE:
1. Download media to Supabase Storage `report-media` bucket
2. Store public URL in `report_media.url` column
3. Include attribution (source, license) in `report_media.caption` or metadata
4. For Wikipedia: append " (CC BY-SA, Wikimedia Commons)" to caption

### For adapters that LINK ONLY:
1. Store original source URL in `report_media.url` — hotlink directly
2. `<img>` tags render from original source (current behavior)
3. If source goes down, media becomes unavailable (acceptable trade-off)

### For YouTube (EMBED ONLY):
1. Never download thumbnails or video files
2. Use YouTube embed player iframe (`youtube.com/embed/VIDEO_ID`)
3. Store embed URL in `report_media.url` with `media_type: 'video'`
4. MediaGallery already handles YouTube embeds correctly

### AI-Generated Images:
- **NO AI-generated images on report detail pages** (user directive)
- Report pages show only real media from `report_media` table
- Phenomena index page may continue using placeholder/stock images for categories
- This is already the current behavior — report pages only render `MediaGallery` with actual `report_media` entries

---

## Sources That Need No Media Changes

Most scraped adapters already hotlink to original source URLs in `report_media.url`. The current behavior is compliant for link-only sources. The only sources that need active download+store implementation are:

1. **Wikipedia** — adapter already extracts Wikimedia Commons URLs; need to add download step
2. **Government/FOIA** — curated reports already use `store-roswell-media.ts` pattern; scraped government docs may need similar treatment

All other sources can continue with current hotlinking behavior.
