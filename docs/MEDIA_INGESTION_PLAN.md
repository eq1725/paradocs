# Media Ingestion Plan for ParaDocs

## Overview
Many Reddit posts reference images and videos that provide important visual evidence for paranormal reports. This plan outlines how to capture, store, and display this media.

## Current State
- Reddit posts often have:
  - Direct image links (i.imgur.com, i.redd.it)
  - Reddit-hosted videos (v.redd.it)
  - Gallery posts (multiple images)
  - External video links (YouTube, etc.)
- Currently, we only capture text content
- Media references are lost in the import

## Proposed Architecture

### 1. Database Schema Changes

```sql
-- Add media table
CREATE TABLE report_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio')),
  source_url TEXT NOT NULL,           -- Original URL
  storage_path TEXT,                   -- Supabase storage path (if stored)
  thumbnail_path TEXT,                 -- Thumbnail for videos/large images
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  mime_type TEXT,
  caption TEXT,
  is_primary BOOLEAN DEFAULT false,    -- Main media for the report
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_report_media_report_id ON report_media(report_id);

-- Add media_count to reports for quick access
ALTER TABLE reports ADD COLUMN media_count INTEGER DEFAULT 0;
```

### 2. Media Sources from Reddit

| Source | Pattern | Handling |
|--------|---------|----------|
| i.redd.it | `https://i.redd.it/*.jpg/png/gif` | Direct download |
| i.imgur.com | `https://i.imgur.com/*.jpg/png/gif` | Direct download |
| Reddit video | `https://v.redd.it/*` | Download + generate thumbnail |
| Reddit gallery | `gallery` in `post.url` | Fetch gallery API |
| YouTube | `youtube.com/watch?v=*` | Store link + fetch thumbnail |
| External images | `*.jpg/*.png/*.gif` URLs in text | Download if accessible |

### 3. Import Process Enhancement

```typescript
// Enhanced RedditPost interface
interface RedditPost {
  id: string
  title: string
  selftext: string
  url?: string              // Link posts have this
  is_video?: boolean
  media?: {
    reddit_video?: {
      fallback_url: string
      height: number
      width: number
    }
  }
  gallery_data?: {          // Gallery posts
    items: Array<{
      media_id: string
      id: number
    }>
  }
  media_metadata?: Record<string, {
    e: string               // 'Image'
    s: { u: string, x: number, y: number }  // source
  }>
  preview?: {
    images: Array<{
      source: { url: string, width: number, height: number }
    }>
  }
}

// Media extraction function
async function extractMedia(post: RedditPost): Promise<MediaItem[]> {
  const media: MediaItem[] = []

  // 1. Check post URL for direct images
  if (post.url && isImageUrl(post.url)) {
    media.push({ type: 'image', url: post.url, isPrimary: true })
  }

  // 2. Check for Reddit video
  if (post.is_video && post.media?.reddit_video) {
    media.push({
      type: 'video',
      url: post.media.reddit_video.fallback_url,
      width: post.media.reddit_video.width,
      height: post.media.reddit_video.height,
      isPrimary: true
    })
  }

  // 3. Check for gallery
  if (post.gallery_data && post.media_metadata) {
    for (const item of post.gallery_data.items) {
      const meta = post.media_metadata[item.media_id]
      if (meta?.s?.u) {
        media.push({
          type: 'image',
          url: meta.s.u.replace(/&amp;/g, '&'),
          width: meta.s.x,
          height: meta.s.y,
          isPrimary: media.length === 0
        })
      }
    }
  }

  // 4. Check preview images
  if (post.preview?.images?.length) {
    const preview = post.preview.images[0].source
    if (!media.some(m => m.isPrimary)) {
      media.push({
        type: 'image',
        url: preview.url.replace(/&amp;/g, '&'),
        width: preview.width,
        height: preview.height,
        isPrimary: true
      })
    }
  }

  // 5. Extract image URLs from text
  const imageUrls = extractImageUrlsFromText(post.selftext)
  for (const url of imageUrls) {
    if (!media.some(m => m.url === url)) {
      media.push({ type: 'image', url, isPrimary: false })
    }
  }

  return media
}
```

### 4. Storage Strategy

**Option A: Store in Supabase Storage (Recommended for images)**
- Pros: Single source of truth, fast serving, no external dependencies
- Cons: Storage costs, need to handle large files
- Implementation: Download → Upload to Supabase Storage → Store path

**Option B: Store URLs only (For videos)**
- Pros: No storage costs, instant
- Cons: Links may break over time
- Implementation: Store original URL + thumbnail

**Recommended Hybrid Approach:**
- Images < 5MB: Download and store in Supabase Storage
- Images > 5MB: Store URL only
- Videos: Store URL + generate/store thumbnail
- YouTube: Store URL + fetch thumbnail via API

### 5. Implementation Phases

#### Phase 1: Schema & Basic Extraction (1-2 days)
- [ ] Create `report_media` table
- [ ] Add `media_count` to reports
- [ ] Update direct-import API to extract media URLs
- [ ] Store URLs in report_media table

#### Phase 2: Image Storage (2-3 days)
- [ ] Set up Supabase Storage bucket for media
- [ ] Implement image download & upload
- [ ] Generate thumbnails for large images
- [ ] Update import process to store images

#### Phase 3: Video Support (2-3 days)
- [ ] Handle Reddit video downloads
- [ ] Generate video thumbnails
- [ ] YouTube integration (oEmbed API for thumbnails)
- [ ] Handle v.redd.it special cases

#### Phase 4: UI Integration (2-3 days)
- [ ] Display media gallery on report page
- [ ] Lightbox for full-size images
- [ ] Video player integration
- [ ] Media thumbnails in explore grid

#### Phase 5: Backfill Existing Data (1-2 days)
- [ ] Create script to re-process existing Reddit reports
- [ ] Extract media from stored posts
- [ ] Batch download & store images

### 6. API Endpoints

```
POST /api/admin/extract-media
  - Extract media from existing reports

GET /api/reports/[id]/media
  - Get all media for a report

POST /api/admin/media/upload
  - Upload media file to storage
```

### 7. Estimated Costs

**Storage (Supabase):**
- ~100KB average per image
- 50,000 reports × 0.5 images average = 25,000 images
- ~2.5 GB storage = ~$0.25/month

**Bandwidth:**
- CDN serving via Supabase = included in plan

### 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| External links breaking | Store copies of images locally |
| Large video files | Store URLs only, generate thumbnails |
| Copyright issues | Only store from original Reddit posts |
| Storage costs | Set file size limits, compress images |
| Rate limiting | Batch downloads with delays |

## Next Steps

1. Run schema migration to add `report_media` table
2. Update direct-import API to capture media URLs
3. Implement image storage pipeline
4. Build UI components for media display
