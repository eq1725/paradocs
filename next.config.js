/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
