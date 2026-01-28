import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  // Dashboard pages use their own DashboardLayout, so don't wrap them in the main Layout
  const isDashboardPage = router.pathname.startsWith('/dashboard')

  return (
    <>
      <Head>
        <title>ParaDocs - The World's Largest Paranormal Database</title>
        <meta name="description" content="Explore, analyze, and contribute to the world's largest database of paranormal phenomena. UFO sightings, cryptid encounters, ghost reports, and unexplained events." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      {isDashboardPage ? (
        <Component {...pageProps} />
      ) : (
        <Layout>
          <Component {...pageProps} />
        </Layout>
      )}
    </>
  )
}
