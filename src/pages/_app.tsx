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

        {/* V10.6.6 — Favicon v5. Single declaration site (the dupes in
            _document.tsx were removed). SVG is transparent + purple-P
            (clean brand mark, no dark backdrop) and wins on every
            modern browser. .ico stays at v4 (black-bg version) as the
            fallback for legacy SVG-less clients. Versioned filenames
            bypass browser favicon cache — browsers ignore ?v= query
            strings on /favicon.ico (WebKit/Blink quirk). */}
        <link rel="icon" href="/favicon-v5.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-v4.ico" sizes="32x32" />

        <link rel="manifest" href="/manifest.json?v=4" />

        <meta name="theme-color" content="#0a0a14" />
        <meta name="msapplication-TileColor" content="#0a0a14" />

        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Paradocs" />

        {/* V10.1 — Branded PWA icons (black bg + purple Changa
            ExtraBold P). Versioned filenames to bypass iOS Safari's
            apple-touch-icon cache at the canonical path. */}
        <link rel="apple-touch-icon" href="/apple-touch-icon-v4.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180x180.png?v=4" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-167x167.png?v=4" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png?v=4" />

        {/* V10.1 — iOS PWA splash screens (apple-touch-startup-image).
            Black bg + "Paradocs." wordmark with purple period accent.
            Each link's media query matches a specific device's
            (device-width, device-height, -webkit-device-pixel-ratio,
            orientation) tuple. Android handles splash automatically
            via manifest.json background_color + largest icon. */}

        {/* iPhone 16 Pro Max — 440×956 @3x (new size, not the 430×932
            of earlier Pro Max generations). */}
        <link rel="apple-touch-startup-image" href="/splash/splash-1320x2868.png" media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-2868x1320.png" media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />

        {/* iPhone 16 Pro — 402×874 @3x (new size, not the 393×852 of
            iPhone 15 Pro / 14 Pro). */}
        <link rel="apple-touch-startup-image" href="/splash/splash-1206x2622.png" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-2622x1206.png" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />

        {/* iPhone 15 Pro Max / 14 Pro Max — 430×932 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/splash-1290x2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-2796x1290.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />

        {/* iPhone 15 Pro / 14 Pro — 393×852 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/splash-1179x2556.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-2556x1179.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />

        {/* iPhone 16 / 15 / 14 / 13 / 12 — 390×844 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/splash-1170x2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-2532x1170.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />

        {/* iPhone 14 Plus / 13 Pro Max / 12 Pro Max / 11 Pro Max / XS Max — 428×926 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/splash-1284x2778.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-2778x1284.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />

        {/* iPhone 11 Pro / XS / X — 375×812 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/splash-1125x2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-2436x1125.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />

        {/* iPhone 11 / XR — 414×896 @2x */}
        <link rel="apple-touch-startup-image" href="/splash/splash-828x1792.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-1792x828.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />

        {/* iPhone 13 mini / 12 mini — 360×780 @3x */}
        <link rel="apple-touch-startup-image" href="/splash/splash-1080x2340.png" media="(device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-2340x1080.png" media="(device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />

        {/* iPhone SE 3rd / 2nd / 8 / 7 / 6s — 375×667 @2x */}
        <link rel="apple-touch-startup-image" href="/splash/splash-750x1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-1334x750.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />

        {/* iPad Pro 12.9" — 1024×1366 @2x */}
        <link rel="apple-touch-startup-image" href="/splash/splash-2048x2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-2732x2048.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />

        {/* iPad Pro 11" / Air 10.9" — 834×1194 @2x */}
        <link rel="apple-touch-startup-image" href="/splash/splash-1668x2388.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-2388x1668.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />

        {/* iPad 10.2" — 810×1080 @2x */}
        <link rel="apple-touch-startup-image" href="/splash/splash-1620x2160.png" media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-2160x1620.png" media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />

        {/* Fallback splash for any unmatched iOS device. Older iOS
            versions treat a media-less apple-touch-startup-image as
            a universal default. The 1170×2532 PNG (iPhone 12-class)
            scales reasonably on any phone-sized viewport. */}
        <link rel="apple-touch-startup-image" href="/splash/splash-1170x2532.png" />

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
