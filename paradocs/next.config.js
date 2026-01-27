/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
    typescript: { ignoreBuildErrors: true },
    eslint: { ignoreDuringBuilds: true },
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
