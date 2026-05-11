import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'
import Layout from '@/components/Layout'
import { ToastProvider } from '@/components/Toast'

// Pages that should NOT have the main app layout (nav, footer, etc.)
const STANDALONE_PAGES = ['/beta-access', '/survey']

// Pages/routes that have their own complete layout (like DashboardLayout).
// V9.6 — /account/* is now under the default Layout (same as /profile)
// with an in-page AccountNav strip. Reserves DashboardLayout for /lab
// and /admin where the sidebar still has actual destinations.
const CUSTOM_LAYOUT_PREFIXES = ['/dashboard']

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const isStandalonePage = STANDALONE_PAGES.includes(router.pathname)
  const hasCustomLayout = CUSTOM_LAYOUT_PREFIXES.some(prefix => router.pathname.startsWith(prefix))

  // Register service worker for PWA installability
  useEffect(function() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function(err) {
        console.warn('SW registration failed:', err)
      })
    }
  }, [])

  return (
    <>
      <Head>
        <title>Paradocs - The World's Largest Paranormal Database</title>
        <meta name="description" content="Explore, analyze, and contribute to the world's largest database of paranormal phenomena. UFO sightings, cryptid encounters, ghost reports, and unexplained events." />

        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />

        {/* V10 — versioned filenames bypass browser favicon cache.
            Browsers cache /favicon.ico aggressively at the canonical
            path and ignore ?v= query strings (same WebKit/Blink quirk
            we hit with apple-touch-icon). Versioning the path forces
            a fresh fetch. Bump the suffix on future icon changes. */}
        <link rel="icon" href="/favicon-v3.ico" sizes="32x32" />
        <link rel="icon" href="/favicon-v3.svg" type="image/svg+xml" />

        <link rel="manifest" href="/manifest.json?v=3" />

        <meta name="theme-color" content="#0a0a14" />
        <meta name="msapplication-TileColor" content="#0a0a14" />

        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Paradocs" />

        {/* V10 — branded PWA icons: purple bg + Changa ExtraBold P.
            Apple HIG: default apple-touch-icon should be 180x180.
            Older devices request 152 (iPad), 167 (iPad Pro).

            iOS Safari aggressively caches the canonical
            /apple-touch-icon.png path and IGNORES query strings on
            it (well-documented WebKit quirk). To force a refetch
            without telling users to clear their cache, we point the
            default href at a versioned filename — Safari has never
            seen this URL before, so the old cache entry can't
            shadow it. Bump the suffix on future icon changes. */}
        <link rel="apple-touch-icon" href="/apple-touch-icon-v3.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180x180.png?v=3" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-167x167.png?v=3" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png?v=3" />

        <meta name="apple-mobile-web-app-capable" content="yes" />

        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <ToastProvider>
        {isStandalonePage || hasCustomLayout ? (
          <Component {...pageProps} />
        ) : (
          <Layout>
            <Component {...pageProps} />
          </Layout>
        )}
      </ToastProvider>
      <SpeedInsights />
      <Analytics />
    </>
  )
}
