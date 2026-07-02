# Today Feed — Device-Matrix QA Checklist (P0-7)

_Companion to APP_EXPERIENCE_PANEL_REVIEW.md P0-7. Run before store submission and after any card-component change. ~30 min per device._

## Device matrix (minimum)

| Device | Why |
|---|---|
| iPhone SE / mini class (small, notchless-ish) | Smallest supported viewport; line-clamp + safe-area stress |
| iPhone Pro Max class (large, Dynamic Island) | Safe-area top inset; 9:16 video letterboxing |
| Budget Android (~360×800, low RAM) | Perf floor; HLS via hls.js path (non-Safari) |
| iPad / tablet portrait | md-breakpoint behaviors (edge pills appear ≥768px) |
| Desktop 1280 & 1512 | 3-column layout, rail + connected cases, edge pills + Next/Prev control |

## Per-card checks (all 10 types)

Card types: PhenomenonCard, TextReportCard, MediaReportCard, VideoReportCard, OnThisDateCard, FindingCard, ClusteringCard, LabPromo, SkeletonCard, EndOfFeedCard.

For each card, on each device:
1. **No text overflow** — seed with a longest-case title (>120 chars) and description; line-clamp must ellipsize, never push layout.
2. **Image failure state** — kill the network after paint / use a dead URL; card must render a composed fallback, not a broken-image glyph or collapsed box.
3. **Safe areas** — no content under the notch/Dynamic Island or behind the home indicator; bottom nav clears the Connected chip (bottom-20 offset).
4. **Tap targets** — every action ≥44×44pt effective; hover-only affordances have a tap equivalent.
5. **Theme** — both themes if applicable; hairlines visible on OLED black.

## Feed-level checks

6. **Gestures:** swipe up/down = next/prev; left = dismiss (flashes + advances); right = save; long-press; pull-to-refresh at card 0. Confirm GestureTutorial fires on first run only.
7. **Desktop affordances (V11.41):** edge pills show ✕ Dismiss / 🔖 Save on hover; bottom-right ∨ Next (+ ∧ Prev after first advance) pages the stack; wheel + ArrowDown/Space/J/K all advance; `?` opens the shortcut sheet.
8. **Special-card spacing (V11.41 min-gap):** scroll 50 cards; no two specials (Finding / Cluster / OnThisDate / LabPromo) within 2 slots of each other. Use `?preview_labpromo=1` to force a promo and check it respects spacing relative to the SSR-baked Finding (position 4).
9. **Video cards:** autoplay muted; sound + CC toggles persist across cards; poster paints before HLS attaches; no audio bleed after advancing.
10. **Rail (desktop):** On This Week shows ≥3 distinct categories and ≥3 distinct locations (V11.41 diversity caps); "Browse the full archive →" reachable.
11. **End of feed:** EndOfFeedCard reachable; no infinite spinner; pull-to-refresh from end returns to top with fresh set.
12. **Perf floor (budget Android):** time from tap to first card interactive < 3s on 4G throttle; no dropped-frame jank on swipe (Chrome DevTools > Performance, 4× CPU throttle).

## Regression triggers

Re-run the full sweep when touching: card components, `discover.tsx` injection/gesture code, snap-point logic, Mux/HLS player, or Tailwind breakpoints.
