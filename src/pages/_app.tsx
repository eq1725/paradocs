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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
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
