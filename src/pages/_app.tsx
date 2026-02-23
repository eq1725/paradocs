import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { ToastProvider } from '@/components/Toast'

// Pages that should NOT have the main app layout (nav, footer, etc.)
const STANDALONE_PAGES = ['/beta-access', '/survey', '/discover']

// Pages/routes that have their own complete layout (like DashboardLayout)
const CUSTOM_LAYOUT_PREFIXES = ['/dashboard']

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const isStandalonePage = STANDALONE_PAGES.includes(router.pathname)
  const hasCustomLayout = CUSTOM_LAYOUT_PREFIXES.some(prefix => router.pathname.startsWith(prefix))

  return (
    <>
      <Head>
        <title>Paradocs - The World's Largest Paranormal Database</title>
        <meta name="description" content="Explore, analyze, and contribute to the world's largest database of paranormal phenomena. UFO sightings, cryptid encounters, ghost reports, and unexplained events." />

        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />

        <link rel="icon" href="/favicon.ico" />

        <link rel="manifest" href="/manifest.json" />

        <meta name="theme-color" content="#0a0a14" />
        <meta name="msapplication-TileColor" content="#0a0a14" />

        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Paradocs" />

        <link rel="apple-touch-icon" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-152x152.png" />

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
    </>
  )
}
