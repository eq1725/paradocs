# Video Pipeline — Phase C design doc

**Status**: queued for post-launch (target: month 2 after MVP launch).
**Author**: AI engineering pair, May 2026.

Phase A (capture + storage + admin queue) and Phase B (Whisper transcripts + Haiku extraction + OpenAI moderation + WebVTT captions) ship with the MVP. Phase C is the upgrade layer once we have real user-volume data and the highest-impact unknowns are resolved.

## Goals (in priority order)

1. Per-video consent gates — automatic detection of additional people in the frame, with a one-tap consent confirmation before publish.
2. Longer-form videos (>60s, up to 5 min) for narrative-heavy submissions.
3. Share-card video remixing — repackage user clips into shareable TikTok/Instagram-ready posts that point back to the report page.
4. Multi-clip submissions — let a user stitch 2–3 short clips into one report.

## Detail per goal

### 1. Per-video consent gates

**Problem**: Phase B moderates the transcript but not the video itself. A user could film themselves talking on a busy street and inadvertently publish the faces of bystanders. Apple Guideline 1.2 and Google Play User Generated Content policies both expect "reasonable measures" against this.

**Plan**:
- Run AWS Rekognition `DetectFaces` on the first frame at upload time (we already use Rekognition for avatar moderation; the auth + SDK are wired).
- If face count > 1: surface a consent-gate modal on `/submit/video-review/[id]` — "We noticed other people in your video. Please confirm you have their permission to share this publicly."
- Two affordances: "Yes, I have permission" (publish) or "Crop them out / re-record" (route back to capture).
- Store the consent flag on `report_videos.metadata.bystander_consent` for audit.

**Open questions**:
- Do we also run face-detection on a sampling of intermediate frames? The first frame might be the back of someone's head while a clear face appears at second 12. Recommend: sample every 5 seconds, take the max face-count.
- What's the threshold for prompting? Plan: face count ≥ 2 prompts; face count = 1 (presumably the author) does not.

**Cost**: Rekognition `DetectFaces` is ~$0.001/image. At 1k videos/week × 12 frames per video = $12/week. Trivial.

### 2. Longer-form videos (>60s)

**Problem**: 60s is enough for a punchy story but inadequate for full first-person testimonies, especially NDE-style reports where users have substantial context to share. Some of the highest-engagement content in the category (e.g. UFO podcast clips) runs 3–5 minutes.

**Plan**:
- Bump the upload cap to 5 minutes (300s) and the size cap to 200MB.
- Phase B's Whisper costs scale linearly with duration ($0.006/min). At 5 min × $0.006 = $0.03/video. Still trivial.
- Today feed renders only the first 60s of long videos inline, with a "Continue watching" tap that opens the full report page.
- Captions stay throughout; the 60s preview uses the first 60s of `transcript_segments`.

**Risk**: longer videos = bigger Storage bill. At 200MB × 1k = 200GB/mo = $4.20/mo. Still trivial.

### 3. Share-card video remixing

**Problem**: TikTok and Instagram Reels both treat videos with attribution as a viral pipeline. We want a one-tap "Share this report as a video" that produces a 15–30s vertical clip showing the user's video on top, the report title overlaid in the lower third, a Paradocs watermark in the corner, and a final 2s end card with the report URL.

**Plan**:
- Server-side video manipulation via [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static) (Lambda-friendly) or Cloudflare Stream's transform API.
- New endpoint `POST /api/reports/[slug]/share-card` produces the remixed file and returns a signed URL.
- Cache the remixed file in Storage; regenerate on report-metadata edits.

**Open question**: do we render captions in the remix? Probably yes — silent viewing on social is 80%+ of consumption.

### 4. Multi-clip submissions

**Problem**: A user might want to show "here's the location" + "here's where I saw the thing" + "here's my reaction." Stitching is currently their responsibility.

**Plan**:
- Submit form lets user record up to 3 clips, displayed as a chip strip with reorder/delete.
- On upload, server stitches via ffmpeg into a single MP4 with simple crossfade transitions.
- Combined duration cap = 5 minutes (matches Goal 2).
- Storage path layout becomes `<user>/<report>/<clip_id>.<ext>` per clip; the report_videos row tracks the stitched result with a JSON `source_clips: [{ path, duration_sec }]` for re-stitch / edit.

## Implementation budget

Estimated effort to ship all four:

- Consent gates: ~1 day (Rekognition wiring + modal UX).
- Longer videos: ~0.5 day (just cap changes + feed-truncation UX).
- Share-card remixing: ~3 days (ffmpeg pipeline + caching + UX).
- Multi-clip stitch: ~2 days (capture UX + server stitch).

Total ~6.5 days for the full Phase C bundle. Recommend slicing: consent gates first (compliance), then longer videos (volume signal), then share-card (growth), then multi-clip (power-user).

## Metrics to watch before committing

Before building Phase C, measure these from launch data:

- Video submission rate (% of total reports). Below 5% = don't prioritize Phase C; the format isn't sticking.
- Median video duration. Bumping the cap helps only if the existing 60s is being consistently hit.
- Today feed video engagement (impressions, full-watches, taps to report page) vs. text-only cards. If videos are < 1.5× the engagement of text, the network-effect argument doesn't hold and Phase C should defer further.
- Admin video-review queue volume. If we're approving > 50 videos/day manually, auto-moderation maturity (Phase B) needs investment before Phase C.

## What we explicitly DON'T do in Phase C

- Live streaming. Operational complexity is high (CDN, real-time moderation) and the use case isn't first-party for unexplained-experience reports.
- AI-generated captions in non-English languages beyond what Whisper natively returns. Whisper's multilingual coverage is fine for MVP; full localized review UX waits for Phase D.
- Server-side video re-encoding for storage compression. The size savings (~30–40%) don't beat the operational burden until we're at 10k+ videos.
