/**
 * oEmbed adapter library — universal Tier-3 policy (May 2026)
 *
 * Editorial / panel-reviewed decision: third-party source embeds
 * (YouTube, Vimeo, Reddit, Imgur, TikTok, Archive.org, etc.) are
 * no longer rendered on Paradocs report pages. The attribution
 * chrome ("Originally published at YouTube · Read original") is
 * shown above ALL ingested reports; users who want the source
 * material click the "Read original" link.
 *
 * Reasons we landed here:
 *   - Editorial voice consistency. Embedded YouTube videos bring
 *     in narration / music / sponsor reads / thumbnail aesthetics
 *     that compete with our paradocs_narrative for attention and
 *     bleed sensationalism into our archival page tone.
 *   - Comprehension over engagement. Visitors who hit "play" stop
 *     reading the editorial framing — feed_hook, answer_line,
 *     paradocs_narrative, lens cards, similar cases — which is
 *     the value Paradocs adds.
 *   - Confusion. For comment-harvest reports (e.g. an experiencer
 *     comment under a popular UFO video), embedding the video
 *     makes it look like the video IS the report rather than the
 *     comment underneath it.
 *   - Trust/safety. Tying our reputation to creator-side ToS
 *     changes, takedowns, or content pivots is unnecessary risk.
 *
 * Three tiers still exist in code, but the runtime policy is:
 *
 *   Tier 1 — iframe embed (currently UNUSED — all explicit
 *            handlers below set `forceTier3: true`).
 *   Tier 2 — OG thumbnail + excerpt card (currently UNREACHABLE —
 *            fallthrough now returns Tier 3).
 *   Tier 3 — Attribution chrome only ("Originally published at
 *            <platform> · Read original"). The current default for
 *            every ingested source.
 *
 * Carve-out: Paradocs-native user-submitted videos render through
 * the `InlineVideoPlayer` component, NOT through this library —
 * those still play inline because the experiencer IS the source.
 *
 * To re-enable an embed for a specific platform: drop the
 * `forceTier3: true` flag from that handler.
 *
 * Privacy note: we never proxy or cache the source content. Even
 * in Tier 1, the user's browser fetches the iframe directly from
 * the source.
 */

export type MediaTier = 1 | 2 | 3

export interface OembedResult {
  tier: MediaTier
  /** Canonical URL (same as input, normalized). */
  url: string
  /** When tier=1: full iframe URL ready to drop into a sandboxed iframe. */
  embedUrl?: string
  /** Suggested aspect ratio for tier-1 embeds (e.g. '16/9', '4/5', '1/1'). */
  aspectRatio?: string
  /** Platform identifier used for attribution chrome ("youtube", "reddit", etc.). */
  platform: string
  /** Display name for the platform shown above the embed. */
  platformLabel: string
  /** When tier=1: allow attribute on the iframe. */
  iframeAllow?: string
  /** When tier=1: sandbox attribute on the iframe (we always sandbox for safety). */
  iframeSandbox?: string
  /** When provided, suggest a min-height (e.g. for Reddit threads that need vertical room). */
  minHeight?: number
}

// ── Domain → platform mapping ───────────────────────────────

const HOSTILE_DOMAINS = new Set<string>([
  // Domains that have sent past takedowns. Force Tier 3 (text-only).
  // Empty for now; add as needed.
])

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

function tryParse(url: string): URL | null {
  try { return new URL(url) } catch { return null }
}

// ── Per-platform handlers ───────────────────────────────────

interface PlatformHandler {
  platform: string
  platformLabel: string
  matches: (host: string, pathname: string) => boolean
  embed: (parsed: URL) => Omit<OembedResult, 'tier' | 'url' | 'platform' | 'platformLabel'> | null
  /**
   * When true, the resolver skips both Tier 1 (iframe embed) AND Tier 2
   * (OG thumbnail card) for matched hosts and returns Tier 3 — just the
   * attribution-chrome one-liner. Used when we explicitly never want to
   * render a preview of the source (e.g. ingested Reddit posts, where the
   * embed duplicates content the user already sees in our own narrative).
   */
  forceTier3?: boolean
}

const HANDLERS: PlatformHandler[] = [
  // ── YouTube ─────────────────────────────────────────────
  // Tier 3 — attribution-only. See policy block at top of file.
  {
    platform: 'youtube',
    platformLabel: 'YouTube',
    matches: (host) => host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be',
    embed: () => null,
    forceTier3: true,
  },

  // ── Vimeo ───────────────────────────────────────────────
  {
    platform: 'vimeo',
    platformLabel: 'Vimeo',
    matches: (host) => host === 'vimeo.com' || host === 'player.vimeo.com',
    embed: () => null,
    forceTier3: true,
  },

  // ── Reddit ──────────────────────────────────────────────
  // Reddit is `forceTier3` — we don't render a preview of the source
  // post at all. The redditmedia.com iframe embed duplicates the
  // narrative our own page already shows (paradocs_narrative,
  // feed_hook, transcript, etc.) and adds visual clutter without
  // adding information. Users who want the original can click the
  // "Read original" button in the attribution chrome.
  {
    platform: 'reddit',
    platformLabel: 'Reddit',
    matches: (host) => host === 'reddit.com' || host === 'old.reddit.com' || host === 'new.reddit.com',
    embed: () => null,
    forceTier3: true,
  },

  // ── Twitter / X ─────────────────────────────────────────
  // Twitter's oEmbed serves JSON-with-script; pure iframe isn't an option
  // unless we host an embed-loader. For now we render Tier 2 for X — the
  // attribution card with OG thumbnail. Adding when our embed script is
  // approved.
  // (deliberately no handler — falls through to Tier 2)

  // ── Imgur ───────────────────────────────────────────────
  {
    platform: 'imgur',
    platformLabel: 'Imgur',
    matches: (host) => host === 'imgur.com' || host === 'i.imgur.com',
    embed: () => null,
    forceTier3: true,
  },

  // ── TikTok ──────────────────────────────────────────────
  {
    platform: 'tiktok',
    platformLabel: 'TikTok',
    matches: (host) => host === 'tiktok.com',
    embed: () => null,
    forceTier3: true,
  },

  // ── Instagram ───────────────────────────────────────────
  {
    platform: 'instagram',
    platformLabel: 'Instagram',
    matches: (host) => host === 'instagram.com',
    embed: () => null,
    forceTier3: true,
  },

  // ── Substack ────────────────────────────────────────────
  {
    platform: 'substack',
    platformLabel: 'Substack',
    matches: (host) => host.endsWith('.substack.com') || host === 'substack.com',
    embed: () => null,
    forceTier3: true,
  },

  // ── Wikipedia ───────────────────────────────────────────
  {
    platform: 'wikipedia',
    platformLabel: 'Wikipedia',
    matches: (host) => host.endsWith('.wikipedia.org'),
    embed: () => null,
    forceTier3: true,
  },

  // ── Twitter / X ─────────────────────────────────────────
  {
    platform: 'twitter',
    platformLabel: 'X (Twitter)',
    matches: (host) => host === 'twitter.com' || host === 'x.com' || host === 'mobile.twitter.com',
    embed: () => null,
    forceTier3: true,
  },

  // ── Substack ────────────────────────────────────────────
  // Substack supports oEmbed via their /api/v1/embed endpoint
  // returning HTML, but iframe embeds need server-side enrichment.
  // For now Tier 2 — attribution card. (no handler)

  // ── Wikipedia ───────────────────────────────────────────
  // Wikipedia content is CC-licensed and Wikipedia provides
  // mobile-optimized article fragments via their REST API
  // (en.wikipedia.org/api/rest_v1/page/mobile-sections/...), but
  // those return JSON not iframable HTML. The right pattern is
  // Tier 2 — attribution card with thumbnail + lead paragraph.
  // (no handler)

  // ── Archive.org ─────────────────────────────────────────
  {
    platform: 'archive_org',
    platformLabel: 'Archive.org',
    matches: (host) => host === 'archive.org',
    embed: () => null,
    forceTier3: true,
  },
]

// ── Main entry point ────────────────────────────────────────

/**
 * Determine which media tier a URL falls into, and return the
 * iframe payload when tier=1.
 *
 * Always succeeds — even an unparseable URL returns tier=3.
 */
export function resolveMediaTier(rawUrl: string): OembedResult {
  const parsed = tryParse(rawUrl)
  if (!parsed) {
    return { tier: 3, url: rawUrl, platform: 'unknown', platformLabel: 'Source' }
  }

  const host = normalizeHost(parsed.hostname)

  if (HOSTILE_DOMAINS.has(host)) {
    return { tier: 3, url: rawUrl, platform: 'hostile', platformLabel: hostDisplayLabel(host) }
  }

  for (const h of HANDLERS) {
    if (h.matches(host, parsed.pathname)) {
      // forceTier3 platforms skip both the iframe (Tier 1) and the OG
      // thumbnail card (Tier 2). Just the attribution-chrome one-liner.
      if (h.forceTier3) {
        return { tier: 3, url: rawUrl, platform: h.platform, platformLabel: h.platformLabel }
      }
      const embed = h.embed(parsed)
      if (embed && embed.embedUrl) {
        return {
          tier: 1,
          url: rawUrl,
          platform: h.platform,
          platformLabel: h.platformLabel,
          ...embed,
        }
      }
      // Handler matched the host but the URL didn't yield a valid
      // embed (wrong path, e.g. youtube.com/feed). Fall to Tier 3
      // under the universal-Tier-3 policy.
      return { tier: 3, url: rawUrl, platform: h.platform, platformLabel: h.platformLabel }
    }
  }

  // No handler matched. Default to Tier 3 — attribution chrome only.
  // Was previously Tier 2 (OG card); changed to Tier 3 in May 2026
  // under the universal-attribution-only policy. See top-of-file
  // JSDoc for rationale.
  return { tier: 3, url: rawUrl, platform: 'web', platformLabel: hostDisplayLabel(host) }
}

/**
 * Friendly display label for a host when we don't have a
 * platform-specific name. Strips common subdomains and TLDs to
 * produce e.g. "bfro.net" → "BFRO", "nuforc.org" → "NUFORC",
 * "nytimes.com" → "NYTimes". Falls back to the host as-is.
 */
function hostDisplayLabel(host: string): string {
  const known: Record<string, string> = {
    'bfro.net':                 'BFRO',
    'nuforc.org':               'NUFORC',
    'mufon.com':                'MUFON',
    'nderf.org':                'NDERF',
    'oberf.org':                'OBERF',
    'nytimes.com':              'NYTimes',
    'washingtonpost.com':       'Washington Post',
    'theguardian.com':          'The Guardian',
    'bbc.com':                  'BBC',
    'reuters.com':              'Reuters',
    'apnews.com':               'AP News',
    'wikipedia.org':            'Wikipedia',
    'en.wikipedia.org':         'Wikipedia',
    'substack.com':             'Substack',
    'twitter.com':              'Twitter',
    'x.com':                    'X',
    'facebook.com':             'Facebook',
    'instagram.com':            'Instagram',
    'medium.com':               'Medium',
  }
  if (known[host]) return known[host]
  // Strip www. / m. / mobile. and the TLD; capitalize the SLD.
  const sld = host.split('.').slice(-2, -1)[0] || host
  return sld.charAt(0).toUpperCase() + sld.slice(1)
}
