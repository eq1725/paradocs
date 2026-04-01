/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/encyclopedia',
        destination: '/explore?mode=browse',
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
      {
        source: '/dashboard/settings',
        destination: '/profile',
        permanent: true,
      },
      {
        source: '/dashboard/subscription',
        destination: '/profile',
        permanent: true,
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
      {
        source: '/phenomena',
        destination: '/explore?mode=browse',
        permanent: true,
      },
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
    return {
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
