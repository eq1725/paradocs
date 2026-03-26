// Media Policy — determines whether media from a source can be downloaded+stored
// or must be linked to the original source only.
//
// Based on ToS review (March 26, 2026) — see MEDIA_POLICY.md for full rationale.

export type MediaPolicy = 'download' | 'link_only' | 'embed_only';

interface SourceMediaPolicy {
  policy: MediaPolicy;
  attribution_required: boolean;
  attribution_template?: string;
}

/**
 * Source-specific media handling policies.
 *
 * - download: Fetch media and store in Supabase Storage (report-media bucket)
 * - link_only: Hotlink to original source URL (do NOT download)
 * - embed_only: Use platform embed player (YouTube, etc.)
 */
var SOURCE_MEDIA_POLICIES: Record<string, SourceMediaPolicy> = {
  // ✅ Can download + store
  'wikipedia':     { policy: 'download', attribution_required: true, attribution_template: 'CC BY-SA, Wikimedia Commons' },
  'cryptid-wiki':  { policy: 'download', attribution_required: true, attribution_template: 'CC BY-SA, Wikimedia Commons' },
  'government':    { policy: 'download', attribution_required: true, attribution_template: 'Public domain' },
  'blackvault':    { policy: 'download', attribution_required: true, attribution_template: 'Public domain / FOIA' },
  'bluebook':      { policy: 'download', attribution_required: true, attribution_template: 'Public domain / Project Blue Book' },
  'foia':          { policy: 'download', attribution_required: true, attribution_template: 'Public domain / FOIA release' },
  'geipan':        { policy: 'download', attribution_required: true, attribution_template: 'GEIPAN / CNES' },
  'kaggle-import': { policy: 'download', attribution_required: true, attribution_template: 'Dataset license — verify per-import' },

  // ⚠️ Link only — no download
  'nuforc':           { policy: 'link_only', attribution_required: false },
  'bfro':             { policy: 'link_only', attribution_required: false },
  'reddit':           { policy: 'link_only', attribution_required: false },
  'reddit-v2':        { policy: 'link_only', attribution_required: false },
  'erowid':           { policy: 'link_only', attribution_required: false },
  'nderf':            { policy: 'link_only', attribution_required: false },
  'iands':            { policy: 'link_only', attribution_required: false },
  'oberf':            { policy: 'link_only', attribution_required: false },
  'shadowlands':      { policy: 'link_only', attribution_required: false },
  'ghostsofamerica':  { policy: 'link_only', attribution_required: false },
  'paranormaldb-uk':  { policy: 'link_only', attribution_required: false },
  'news':             { policy: 'link_only', attribution_required: false },
  'mufon':            { policy: 'link_only', attribution_required: false },

  // 🎬 Embed only — use platform player
  'youtube':          { policy: 'embed_only', attribution_required: false },
  'youtube-comments': { policy: 'embed_only', attribution_required: false },
};

/**
 * Get the media policy for a given source type.
 * Defaults to 'link_only' for unknown sources (safest option).
 */
export function getMediaPolicy(sourceType: string): SourceMediaPolicy {
  if (sourceType && SOURCE_MEDIA_POLICIES[sourceType]) {
    return SOURCE_MEDIA_POLICIES[sourceType];
  }
  // Default: link only (safest)
  return { policy: 'link_only', attribution_required: false };
}

/**
 * Check if media from this source can be downloaded and stored.
 */
export function canDownloadMedia(sourceType: string): boolean {
  return getMediaPolicy(sourceType).policy === 'download';
}

/**
 * Check if media should use embed (YouTube, etc.)
 */
export function shouldEmbed(sourceType: string): boolean {
  return getMediaPolicy(sourceType).policy === 'embed_only';
}

/**
 * Get attribution text for a downloaded media item.
 * Returns null if no attribution is needed (link-only sources).
 */
export function getAttributionText(sourceType: string): string | null {
  var policy = getMediaPolicy(sourceType);
  if (policy.attribution_required && policy.attribution_template) {
    return policy.attribution_template;
  }
  return null;
}
