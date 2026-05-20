/**
 * oEmbed adapter library — V10.4 Phase 2
 *
 * Detects whether a source URL can be safely embedded under the
 * source platform's own ToS, and returns the iframe HTML the
 * platform sanctions. Three tiers:
 *
 *   Tier 1 — oEmbed-permitted platforms (full embed):
 *     YouTube, Reddit, Vimeo, Twitter/X, Imgur, TikTok,
 *     Instagram, Substack, Wikipedia, Archive.org.
 *     We construct the iframe URL using their published
 *     embed-URL patterns (NOT scraping their HTML). This is
 *     identical to what every Slack/Discord/iMessage preview
 *     does for the same links.
 *
 *   Tier 2 — OG thumbnail + first-paragraph excerpt (fair use):
 *     For news sites, BFRO, MUFON, NUFORC, paywalled or
 *     unrecognized sources. Attribution-card render handled
 *     by the MediaTierRenderer component, not here — this lib
 *     just identifies the tier.
 *
 *   Tier 3 — Text-only attribution:
 *     For sources that have sent past takedowns or are very
 *     hostile to embedding. Currently the empty bucket; pre-
 *     wired so we can move a domain into it if needed.
 *
 * Privacy note: we never proxy or cache the source content.
 * The user's browser fetches the iframe directly from the
 * source, so the source platform sees normal embed traffic and
 * we don't store anything they own.
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
  {
    platform: 'youtube',
    platformLabel: 'YouTube',
    matches: (host) => host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be',
    embed: (u) => {
      let videoId: string | null = null
      if (u.hostname.endsWith('youtu.be')) {
        videoId = u.pathname.replace(/^\/+/, '').split('/')[0] || null
      } else if (u.pathname === '/watch') {
        videoId = u.searchParams.get('v')
      } else if (u.pathname.startsWith('/embed/')) {
        videoId = u.pathname.replace('/embed/', '').split('/')[0] || null
      } else if (u.pathname.startsWith('/shorts/')) {
        videoId = u.pathname.replace('/shorts/', '').split('/')[0] || null
      }
      if (!videoId || !/^[A-Za-z0-9_-]{6,16}$/.test(videoId)) return null
      return {
        embedUrl: 'https://www.youtube.com/embed/' + videoId,
        aspectRatio: '16/9',
        iframeAllow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
        iframeSandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
      }
    },
  },

  // ── Vimeo ───────────────────────────────────────────────
  {
    platform: 'vimeo',
    platformLabel: 'Vimeo',
    matches: (host) => host === 'vimeo.com' || host === 'player.vimeo.com',
    embed: (u) => {
      let videoId: string | null = null
      if (u.hostname === 'player.vimeo.com' && u.pathname.startsWith('/video/')) {
        videoId = u.pathname.replace('/video/', '').split('/')[0] || null
      } else {
        // vimeo.com/123456789 or vimeo.com/123456789/abcdef
        const parts = u.pathname.split('/').filter(Boolean)
        if (parts[0] && /^\d{6,12}$/.test(parts[0])) videoId = parts[0]
      }
      if (!videoId) return null
      return {
        embedUrl: 'https://player.vimeo.com/video/' + videoId,
        aspectRatio: '16/9',
        iframeAllow: 'autoplay; fullscreen; picture-in-picture; clipboard-write',
        iframeSandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
      }
    },
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
    embed: (u) => {
      let id: string | null = null
      const parts = u.pathname.split('/').filter(Boolean)
      if (u.hostname === 'i.imgur.com') {
        id = (parts[0] || '').replace(/\.(jpg|jpeg|png|gif|mp4|webp)$/i, '')
      } else if (parts[0] === 'gallery' || parts[0] === 'a') {
        id = parts[1] || null
      } else {
        id = parts[0] || null
      }
      if (!id || !/^[A-Za-z0-9]{5,12}$/.test(id)) return null
      return {
        embedUrl: 'https://imgur.com/' + id + '/embed?pub=true&ref=&w=540',
        minHeight: 540,
        iframeAllow: '',
        iframeSandbox: 'allow-scripts allow-same-origin allow-popups',
      }
    },
  },

  // ── TikTok ──────────────────────────────────────────────
  {
    platform: 'tiktok',
    platformLabel: 'TikTok',
    matches: (host) => host === 'tiktok.com',
    embed: (u) => {
      const m = u.pathname.match(/\/@[^/]+\/video\/(\d+)/)
      if (!m) return null
      return {
        embedUrl: 'https://www.tiktok.com/embed/v2/' + m[1],
        aspectRatio: '9/16',
        iframeAllow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
        iframeSandbox: 'allow-scripts allow-same-origin allow-popups',
      }
    },
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
    embed: (u) => {
      const m = u.pathname.match(/\/(details|embed)\/([^\/]+)/)
      if (!m) return null
      return {
        embedUrl: 'https://archive.org/embed/' + m[2],
        aspectRatio: '16/9',
        iframeAllow: 'fullscreen',
        iframeSandbox: 'allow-scripts allow-same-origin allow-popups',
      }
    },
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
      // embed (wrong path, e.g. youtube.com/feed). Fall to Tier 2.
      return { tier: 2, url: rawUrl, platform: h.platform, platformLabel: h.platformLabel }
    }
  }

  return { tier: 2, url: rawUrl, platform: 'web', platformLabel: hostDisplayLabel(host) }
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
