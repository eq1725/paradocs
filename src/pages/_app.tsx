import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'

// Pages that should NOT have the main app layout (nav, footer, etc.)
const STANDALONE_PAGES = ['/beta-access']

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const isStandalonePage = STANDALONE_PAGES.includes(router.pathname)

  return (
    <>
      <Head>
        <title>Paradocs - The World's Largest Paranormal Database</title>
        <meta name="description" content="Explore, analyze, and contribute to the world's largest database of paranormal phenomena. UFO sightings, cryptid encounters, ghost reports, and unexplained events." />

        {/* Viewport - viewport-fit=cover for edge-to-edge on iOS */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />

        {/* PWA - Web App Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* PWA - Theme colors */}
        <meta name="theme-color" content="#0a0a14" />
        <meta name="msapplication-TileColor" content="#0a0a14" />

        {/* PWA - iOS Safari specific */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Paradocs" />

        {/* PWA - iOS Safari icons */}
        <link rel="apple-touch-icon" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-152x152.png" />

        {/* PWA - Splash screens for iOS */}
        <meta name="apple-mobile-web-app-capable" content="yes" />

        {/* Prevent search engine indexing for beta site */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {isStandalonePage ? (
        <Component {...pageProps} />
      ) : (
        <Layout>
          <Component {...pageProps} />
        </Layout>
      )}
    </>
  )
}
