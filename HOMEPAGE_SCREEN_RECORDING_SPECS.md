# Homepage Screen Recording Specs (V11.17 Phase 2)

You're providing three recordings to replace the static mock-phone / mock-laptop content in the three homepage showcases. Once you drop the files into `public/showcase/`, I'll wire them into `FeedShowcase`, `MapShowcase`, and `LabShowcase` (the static mocks become the fallback if a video fails to load).

---

## What to record

### 1. Feed Showcase — `feed`
- **What's shown:** the `/discover` Today feed on mobile viewport
- **What happens in the recording:**
  - Page loads, feed cards fade in
  - User scrolls down ~3-4 cards smoothly
  - A "save" tap on one card (heart icon → filled state)
  - Loop back to top
- **Recommended length:** 6-8 seconds
- **Viewport:** **375×812** (iPhone 13/14/15 portrait)
- **No audio**

### 2. Map Showcase — `map`
- **What's shown:** the `/explore?mode=map` view on desktop viewport
- **What happens in the recording:**
  - Map renders with choropleth + cluster pins
  - User pans slightly (e.g., centers on US Northeast)
  - User zooms in 1-2 levels, clusters split into smaller clusters
  - User clicks a cluster, popup expands showing nearby reports
- **Recommended length:** 6-10 seconds
- **Viewport:** **1280×720** (cropped from your desktop browser)
- **No audio**

### 3. Lab Showcase — `lab`
- **What's shown:** a phenomenon detail page on desktop, ideally one with a clean pattern story (Bigfoot, Mothman, Sleep Paralysis, etc.)
- **What happens in the recording:**
  - Page hero loads with description visible
  - User scrolls down to filter bar
  - User taps a filter chip (e.g., Country → USA), reports refilter
  - Brief pause showing the filtered list
- **Recommended length:** 6-10 seconds
- **Viewport:** **1280×720** desktop
- **No audio**

---

## How to record (macOS, no special tools)

1. **Open Paradocs in Chrome/Safari** at the right viewport. Use DevTools' device emulator for mobile: Cmd+Opt+I → toggle device toolbar → set to iPhone 14 Pro.
2. **Hide DevTools** before recording.
3. **Press Shift + Cmd + 5** to bring up the macOS screen recording UI.
4. Click **"Record Selected Portion"** and draw the box tightly around the browser content area (not the whole screen — just the page content at the right viewport size).
5. Click **"Record"**.
6. Perform the interaction (smoothly! avoid rapid jerky movement).
7. Stop recording (click the stop button in the menu bar).
8. macOS saves a `.mov` file to your Desktop.

---

## Encoding (one ffmpeg command each)

Install ffmpeg if needed: `brew install ffmpeg`. Then for each `.mov`:

```bash
# WebM (smaller, modern browsers) — replace INPUT and NAME
ffmpeg -i ~/Desktop/INPUT.mov \
  -c:v libvpx-vp9 -crf 35 -b:v 0 -an \
  -vf "scale=-2:720" \
  -movflags +faststart \
  ~/paradocs/public/showcase/NAME.webm

# MP4 fallback (universal compat) — same INPUT and NAME
ffmpeg -i ~/Desktop/INPUT.mov \
  -c:v libx264 -crf 26 -an \
  -vf "scale=-2:720" \
  -movflags +faststart \
  -pix_fmt yuv420p \
  ~/paradocs/public/showcase/NAME.mp4
```

Run twice per recording — once for WebM, once for MP4. Resulting file sizes should be:

| Clip | Expected WebM | Expected MP4 |
|---|---|---|
| feed | 80-180 KB | 200-400 KB |
| map | 100-220 KB | 220-450 KB |
| lab | 80-180 KB | 200-400 KB |

If any clip is >500 KB MP4, bump the `crf` value (28-30 instead of 26) to compress harder.

---

## File paths the homepage will look for

```
public/showcase/
  feed.webm
  feed.mp4
  map.webm
  map.mp4
  lab.webm
  lab.mp4
```

---

## What I'll do once you drop the files

I'll wire up each showcase component to render:

```tsx
<video autoPlay muted loop playsInline className="...">
  <source src="/showcase/feed.webm" type="video/webm" />
  <source src="/showcase/feed.mp4" type="video/mp4" />
  {/* static mock as final fallback if both fail */}
</video>
```

The static mock content stays in the codebase as fallback for browsers/networks where the video fails to load. So you can drop one file at a time and the others keep showing the mock.

---

## Quality checklist before sending

- [ ] Recording is steady, no jerky pans
- [ ] Final cursor position doesn't show "click here" hesitation
- [ ] Content shown isn't a debug/admin view — looks like real production UI
- [ ] No PII / personal email / dev tools visible
- [ ] File size <500KB per encoding (run ffmpeg again with higher crf if not)
- [ ] Plays cleanly in a browser when you open the file directly (Cmd+O in Chrome)

Drop the files in `public/showcase/` and tell me. I'll do the component wiring + ship V11.17.2.
