/**
 * Feature flags for Paradocs UI surfaces.
 *
 * Flags are read from NEXT_PUBLIC_* env vars so they're available on the client.
 * Each flag documents its default and the reason it's flagged.
 *
 * Add new flags here as `SHOW_*` booleans. Keep defaults conservative (off by default
 * for things we're pausing or experimenting with) and gate at the usage site, not
 * inside the component — that way a component staying in the repo is still fully
 * functional when the flag is flipped back on.
 */

/**
 * Research Data Panels — the Research Hub paywall preview on report pages plus
 * the Academic Observation Panel. Paused in Session B1.5 while we rethink the
 * research surfaces. Flip `NEXT_PUBLIC_SHOW_RESEARCH_PANELS=true` to re-enable.
 *
 * Default: OFF.
 */
export const SHOW_RESEARCH_PANELS: boolean =
  process.env.NEXT_PUBLIC_SHOW_RESEARCH_PANELS === 'true'
