import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { Smartphone, Globe, ArrowRight } from 'lucide-react'

/**
 * /citd — "Contact in the Desert" event landing page.
 *
 * Phase 1 (current): Branded placeholder with web-app link.
 * Phase 2 (app launch): Auto-detect iOS / Android and redirect
 *   to the appropriate app store. Fallback to this page for desktop.
 *
 * To enable auto-redirect, uncomment the useEffect block below and
 * fill in the real App Store / Play Store URLs.
 */

// ── Uncomment when apps are live ──────────────────────────────
// const APP_STORE_URL = 'https://apps.apple.com/app/paradocs/id...'
// const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=...'

export default function CITDPage() {
  // ── Phase 2: auto-redirect to app stores ──────────────────
  // useEffect(() => {
  //   const ua = navigator.userAgent || ''
  //   if (/iPhone|iPad|iPod/i.test(ua)) {
  //     window.location.href = APP_STORE_URL
  //   } else if (/Android/i.test(ua)) {
  //     window.location.href = PLAY_STORE_URL
  //   }
  // }, [])

  return (
    <>
      <Head>
        <title>Paradocs — Get the App</title>
        <meta
          name="description"
          content="Paradocs: the world's largest aggregated database of unexplained phenomena. Every account, every source, cross-referenced in one place."
        />
        <meta property="og:title" content="Paradocs — Get the App" />
        <meta
          property="og:description"
          content="The world's largest aggregated database of unexplained phenomena."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://discoverparadocs.com/citd" />
      </Head>

      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 text-center">
        {/* Logo / Wordmark */}
        <h1 className="font-display text-5xl sm:text-6xl font-bold text-white tracking-tight mb-2">
          Paradocs<span className="text-primary-500">.</span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-300 max-w-md mb-10">
          Your experience isn&rsquo;t isolated.
        </p>

        {/* Main card */}
        <div className="glass-card p-8 sm:p-10 max-w-lg w-full mb-8">
          <p className="text-gray-300 leading-relaxed mb-8">
            <span className="text-white font-semibold">
              The world&rsquo;s largest aggregated database
            </span>{' '}
            of unexplained phenomena. Every account, every source,
            cross-referenced in one place.
          </p>

          {/* App store coming soon */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <Smartphone className="w-5 h-5 text-primary-400" />
            <span className="text-sm text-gray-400">
              iOS &amp; Android &mdash; coming soon
            </span>
          </div>

          <div className="w-full h-px bg-white/10 mb-6" />

          {/* Web app CTA */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-medium transition-colors"
          >
            <Globe className="w-4 h-4" />
            Explore the Web App
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Event badge */}
        <p className="text-xs text-gray-500">
          Scanned at Contact in the Desert? Welcome aboard.
        </p>
      </div>
    </>
  )
}
