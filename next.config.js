/** @type {import('next').NextConfig} */

// C1.2 — Capacitor static export mode.
// When building for the iOS/Android Capacitor shells we need a fully
// static `out/` directory (no server-side rendering, no API routes
// running on-device). Web production builds (Vercel) keep the full
// SSR + API surface.
//
// Trigger: PARADOCS_CAPACITOR=1 (set by the `cap:build` npm script).
//
// Caveats baked into native build:
//   - API routes don't ship into the static bundle. The native shells
//     continue to call /api/* against the deployed Vercel origin via
//     the absolute API base URL (NEXT_PUBLIC_SITE_URL).
//   - getServerSideProps pages need conversion to getStaticProps or
//     pure client-fetch. Current SSR pages in the repo:
//     src/pages/story/[id].tsx, src/pages/cases/public/[slug].tsx,
//     src/pages/dashboard/constellation.tsx. Audit these before
//     shipping Capacitor builds; if they don't render correctly under
//     static export, either convert them or hide them from the native
//     surface (web users keep the SSR version on Vercel).
//   - Image optimization via next/image is disabled in static export;
//     `images.unoptimized: true` is set conditionally below.
const IS_CAPACITOR_BUILD = process.env.PARADOCS_CAPACITOR === '1'

const nextConfig = {
  reactStrictMode: true,
  // V10.7.E.13 — Vercel output file tracing for ffmpeg binary.
  // The video pipeline calls @ffmpeg-installer/ffmpeg from
  // /api/reports/video/[id]/finalize to remux .mov → MP4 faststart.
  // Next.js auto-traces require() chains but binary packages can
  // slip through; this glob is the belt-and-suspenders to make
  // sure the binary actually gets bundled into the serverless
  // function on Vercel deploy.
  ...(IS_CAPACITOR_BUILD ? {} : {
    outputFileTracingIncludes: {
      '/api/reports/video/[id]/finalize': [
        './node_modules/@ffmpeg-installer/**',
      ],
    },
  }),
  // C1.2 — static export gated on Capacitor build env flag
  ...(IS_CAPACITOR_BUILD ? { output: 'export', trailingSlash: true } : {}),
  async redirects() {
    // C1.2 — redirects() requires a runtime; static export doesn't have one.
    // Capacitor builds skip the redirect table — native users navigate via
    // in-app routing, never via direct URL typing, so URL-level redirects
    // aren't meaningful for the native shell.
    if (IS_CAPACITOR_BUILD) return []
    return [
      // T1.2: /phenomena index is deprecated as a standalone surface.
      // Encyclopedia browsing now happens via /explore "Browse by Category"
      // drill-down. The /phenomena/[slug] deep-dive routes still exist
      // (T1.3 simplifies them to thin "Reports tagged X" pages) — only the
      // index page is killed.
      {
        source: '/phenomena',
        destination: '/explore?view=categories',
        permanent: true,
      },
      // /encyclopedia is a friendly alias — also routes to /explore now.
      // Slug-level encyclopedia URLs preserved (route to thin reports page).
      {
        source: '/encyclopedia',
        destination: '/explore?view=categories',
        permanent: true,
      },
      {
        source: '/encyclopedia/:slug',
        destination: '/phenomena/:slug',
        permanent: true,
      },
      // Session A1: UX Consolidation — dashboard → lab redirects
      {
        source: '/dashboard',
        destination: '/lab',
        permanent: true,
      },
      {
        source: '/dashboard/saved',
        destination: '/lab?tab=saves',
        permanent: true,
      },
      {
        source: '/dashboard/research-hub',
        destination: '/lab?tab=cases',
        permanent: true,
      },
      {
        source: '/dashboard/reports',
        destination: '/lab?tab=cases',
        permanent: true,
      },
      {
        source: '/dashboard/constellation',
        destination: '/lab?tab=map',
        permanent: true,
      },
      {
        source: '/dashboard/journal',
        destination: '/lab?tab=notes',
        permanent: true,
      },
      {
        source: '/dashboard/journal/:path*',
        destination: '/lab?tab=notes',
        permanent: true,
      },
      {
        source: '/dashboard/insights',
        destination: '/lab?tab=saves',
        permanent: true,
      },
      {
        source: '/dashboard/digests',
        destination: '/lab',
        permanent: true,
      },
      // V9.5 P3.1 — account surface lives at /account/*. The previous
      // redirects sent /dashboard/settings → /profile (Session A1 UX
      // Consolidation), which along with browser-cached 301 was the
      // reason clicking Account Settings or Subscription appeared to
      // do nothing — the route silently bounced back to the page the
      // user was already on. New canonical home is /account/*.
      {
        source: '/dashboard/settings',
        destination: '/account/settings',
        permanent: false,
      },
      {
        source: '/dashboard/subscription',
        destination: '/account/subscription',
        permanent: false,
      },
      // Session A2: Explore Consolidation — absorbed routes
      {
        source: '/map',
        destination: '/explore?mode=map',
        permanent: true,
      },
      {
        source: '/search',
        destination: '/explore?mode=search',
        permanent: true,
      },
      // /phenomena is the Encyclopedia directory (src/pages/phenomena/index.tsx).
      // Previously 301'd to /explore in Session A2 Explore Consolidation, but
      // restored in B1.5 so users can scan every encyclopedia entry. The
      // Encyclopedia Spotlight card on /explore links to /phenomena.
      {
        source: '/analytics',
        destination: '/explore',
        permanent: true,
      },
      // /discover stays as-is (Feed), but /feed also works
      {
        source: '/feed',
        destination: '/discover',
        permanent: true,
      },
    ]
  },
  async rewrites() {
    // C1.2 — rewrites() requires a runtime. Capacitor builds skip them.
    // Native code that needs to hit PostHog directly (i.e. not via the
    // /_posthog/* proxy) does so by setting NEXT_PUBLIC_POSTHOG_HOST to
    // the upstream URL in the Capacitor build env. The /:slug fallback
    // is also web-only — native navigation goes through the in-app
    // router rather than URL string matching.
    if (IS_CAPACITOR_BUILD) return []
    return {
      // T1.12 — PostHog reverse proxy under our own origin so iCloud
      // Private Relay (which blocks third-party telemetry origins
      // including i.posthog.com) doesn't drop session recordings or
      // events. Configured BEFORE the fallback so /_posthog/* doesn't
      // get caught by the /:slug → /phenomena/:slug catch-all.
      // Reference: https://posthog.com/docs/advanced/proxy
      beforeFiles: [
        {
          source: '/_posthog/static/:path*',
          destination: 'https://us-assets.i.posthog.com/static/:path*',
        },
        {
          source: '/_posthog/:path*',
          destination: 'https://us.i.posthog.com/:path*',
        },
      ],
      fallback: [
        {
          source: '/:slug',
          destination: '/phenomena/:slug',
        },
      ],
    }
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['localhost', 'supabase.co', '*.supabase.co'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
    // C1.2 — static export doesn't have a runtime to do image optimization.
    // The native shells display unoptimized images sourced from the bundled
    // static export + the deployed Vercel origin.
    ...(IS_CAPACITOR_BUILD ? { unoptimized: true } : {}),
  },
}

module.exports = nextConfig
// Build trigger: Thu Jan 29 13:06:49 UTC 2026
// Deployment trigger 1769692729
// Build trigger: Thu Jan 29 13:25:23 UTC 2026
// Rebuild trigger: 1769694308
// Rebuild 1769694544
// Deploy trigger 1769695045
// Webhook trigger 1769695273
// Fresh deploy 1769696137
