# Report Page Design & Functionality Review

## Current Architecture
- **Layout:** Flex row on desktop (`lg:flex lg:gap-8`), stacked on mobile
- **Main content:** `flex-1 max-w-4xl` article
- **Sidebar:** Fixed 320px (`lg:w-80`) with sticky positioning
- **Card style:** `.glass-card` (3% white bg, 10px blur, 8% border)

---

## HIGH-PRIORITY ISSUES

### 1. Duplicate & Non-Functional Buttons
- **Save button appears twice** — once in the header, once in the actions bar. Neither one actually works.
- **Share button** — renders but has no functionality (no clipboard copy, no share dialog).
- **Fix:** Remove the header Save button, wire up the actions bar Save + Share with real functionality (Supabase bookmark table, `navigator.share()` / clipboard fallback).

### 2. Vote State Not Shown
- Users can vote but get no visual feedback on their current vote. The thumb icons don't highlight after clicking.
- **Fix:** Query existing vote on load, add active state styling (filled icon + color) to the user's current vote.

### 3. Inconsistent Card Styles
- `glass-card` used in most places, but `ReportPhenomena` uses `bg-gray-900 border border-gray-800 rounded-xl p-6` — different bg opacity, border color, border-radius, and padding.
- **Fix:** Standardize all sidebar/section cards to use `glass-card` or create a named variant.

### 4. Info Grid Feels Disconnected
The 4-box grid (Content Type, Credibility, Source, Submitted) sits between the description and AI Analysis. It's sparse and breaks the reading flow.
- **Fix:** Integrate these as inline metadata chips in the header area, or consolidate into a compact horizontal bar. Free up vertical space for the actual content.

### 5. No Reading Time / Content Length Indicator
For reports with 4,000+ word descriptions (like Roswell), users have no sense of scope.
- **Fix:** Add estimated reading time next to the date/location metadata.

---

## MEDIUM-PRIORITY IMPROVEMENTS

### 6. Mobile Sidebar Rendering
On mobile, RelatedReports + PatternConnections + ReportPhenomena stack into a very long vertical scroll below the article. This pushes the sidebar content far out of view.
- **Fix:** On mobile, collapse sidebar into a tabbed or accordion section. Or show a compact "Related" strip with horizontal scroll cards.

### 7. No Sticky Actions on Scroll
When reading a long report, the vote/save/share actions are only visible at one fixed point. Users have to scroll back to interact.
- **Fix:** Add a slim sticky bar (appears after scrolling past the header) with key actions: vote count, save, share, comment count anchor link.

### 8. Source Reference Not Linked
The `source_reference` field likely contains URLs (NUFORC, MUFON, etc.) but is rendered as plain text in `evidence_summary`.
- **Fix:** Auto-detect URLs in evidence_summary and source_reference, render as clickable links.

### 9. Tags Buried Inside Description Card
Tags are at the bottom of the glass card containing the description. Easy to miss.
- **Fix:** Move tags above the description card or into the header metadata area. Makes them scannable and clickable before the user reads the full text.

### 10. Comments Section — Basic
No sorting (newest/oldest), no threading, no reactions, no edit/delete for own comments.
- **Fix (minimum):** Add sort toggle (newest first / oldest first). Show comment count in a sticky nav. Add a scroll anchor from the actions bar comment icon.

### 11. Description Rendering
`whitespace-pre-wrap` preserves all whitespace from the database, but the text isn't parsed for any structure. Long-form content like the Roswell showcase has paragraph breaks but no headings, blockquotes, or formatted citations.
- **Fix:** Parse markdown or at least auto-detect paragraph breaks and add proper spacing. Consider rendering `description` through a lightweight markdown parser for enriched showcase content.

---

## LOW-PRIORITY / NICE-TO-HAVE

### 12. Breadcrumb Navigation
Only a `router.back()` button exists. If user arrived directly (shared link), "Back" goes to browser history which could be another site entirely.
- **Fix:** Replace with breadcrumbs: Home → Explore → [Category] → Report Title. Or at minimum, link "Back" to `/explore` as fallback.

### 13. SEO & Social Sharing Meta
Basic `<title>` and `<meta description>` exist, but no Open Graph or Twitter Card tags. Shared links on social media won't have images or rich previews.
- **Fix:** Add `og:title`, `og:description`, `og:image` (use primary media or category placeholder), `twitter:card`.

### 14. Print / Export Friendly
No consideration for print styles. A researcher might want to print or PDF a report.
- **Fix:** Add `@media print` styles or a "Export as PDF" button.

### 15. Lazy Loading Below-the-Fold
EnvironmentalContext, AcademicObservationPanel, LocationMap, and sidebar components all load eagerly. On a slow connection, this means many parallel API calls.
- **Fix:** Use intersection observer or `loading="lazy"` pattern to defer non-visible components until scrolled into view.

### 16. View Count Inflated
`view_count` increments on every page load including refreshes.
- **Fix:** Debounce with session storage check — only count once per session per report.

### 17. Error Handling per Section
If one component (e.g., PatternConnections) fails to load, it shouldn't affect the rest.
- **Fix:** Wrap each async component in an error boundary with graceful fallback.

---

## LAYOUT RESTRUCTURE PROPOSAL

### Current (top to bottom):
```
[Back button]
[Content Notice banner]
[Header: badges, title, save btn, summary, metadata]
[Media Gallery]
[Description card + evidence + tags]
[Info Grid: 4 boxes]
[AI Analysis]
[Location Map]
[Environmental + Academic side-by-side]
[Actions bar: votes, views, save, share]
[Comments]
                                          [Sidebar: Related Reports]
                                          [Sidebar: Pattern Connections]
                                          [Sidebar: Related Phenomena]
```

### Proposed:
```
[Breadcrumbs: Home > Category > Report]
[Header: category badge + title]
[Metadata bar: location, date, time, witnesses, reading time]
[Content Notice banner (if applicable)]
[Media Gallery]
[Tags row]
[Description card + evidence]
[Quick Stats bar: content type, credibility, source, submitted — horizontal]
[AI Analysis]
[Location Map]
[Environmental + Academic side-by-side]
[Sticky Actions bar: votes, views, save, share, comments anchor]
[Comments]
                                          [Sidebar: Related Reports]
                                          [Sidebar: Pattern Connections]
                                          [Sidebar: Related Phenomena]
```

### Key changes:
1. Breadcrumbs replace ambiguous "Back" button
2. Remove duplicate Save from header
3. Tags moved up (above description or just below media)
4. Info grid → compact horizontal bar (saves ~100px vertical space)
5. Actions bar becomes sticky on scroll
6. Comment icon in actions bar becomes anchor link to comments section
