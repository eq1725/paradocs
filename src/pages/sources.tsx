import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { ArrowLeft, BookOpen } from 'lucide-react'

/**
 * /sources — Sources & Methodology
 *
 * V11.17.x — Copyright Sprint 1.
 *
 * Public documentation of the documentary-catalogue framework: what
 * Paradocs ingests, how it treats source material under fair use, and
 * how rights-holders can request takedown. Companion page to /dmca.
 *
 * Register: documentary, austere, Wikipedia-tone. Mobile-first narrow
 * column. No marketing voice.
 */
export default function SourcesPage() {
  const lastUpdated = 'June 2026'

  return (
    <>
      <Head>
        <title>Sources & Methodology | Paradocs</title>
        <meta
          name="description"
          content="Paradocs catalogues paranormal experiences from multiple public sources. This page documents the fair-use framework, the per-source list, and the takedown contact for rights-holders."
        />
      </Head>

      <div className="py-12 max-w-3xl mx-auto px-4">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white">
                Sources &amp; Methodology
              </h1>
              <p className="text-gray-400">Last updated: {lastUpdated}</p>
            </div>
          </div>
          <p className="text-gray-300 text-lg leading-relaxed">
            Paradocs catalogues paranormal experiences from multiple public sources.
            For each report we extract uncopyrightable factual elements &mdash; date,
            location, phenomenon type, described characteristics &mdash; and pair
            them with original Paradocs analysis. We link back to every source so
            readers can verify the original account.
          </p>
        </div>

        <div className="space-y-10 text-gray-300">
          {/* Editorial framework */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Editorial framework</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              Paradocs is structured as a documentary catalogue, not a republication
              archive. A report&apos;s entry on Paradocs is composed of structured
              factual fields (date, location, phenomenon type, witness count,
              described characteristics) plus a Paradocs-authored narrative that
              describes what the source reports without reproducing the source&apos;s
              prose. The original account always remains at the original source; we
              link out from every report.
            </p>
            <p className="text-gray-400 leading-relaxed">
              This editorial posture rests on two long-standing principles of U.S.
              copyright law. Facts &mdash; dates, locations, descriptions of
              observed phenomena &mdash; are not copyrightable (<em>Feist v. Rural
              Telephone</em>, 499 U.S. 340 (1991)). Original commentary and analysis
              about a third-party work is a paradigmatic fair use under 17 U.S.C.
              &sect; 107. Paradocs extracts the former and contributes the latter.
            </p>
          </section>

          {/* Sources list */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Sources catalogued</h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              Volume estimates are approximate and updated periodically. Every
              ingested source receives the same treatment: factual extraction,
              original Paradocs analysis, and a prominent link back to the
              original.
            </p>

            <div className="space-y-6">
              {/* NUFORC */}
              <SourceEntry
                name="NUFORC"
                url="https://nuforc.org/"
                kind="UFO sighting reports submitted to the National UFO Reporting Center."
                volume="~50,000 reports catalogued"
                treatment="Factual extraction (date, city/state, shape, duration, observer count) plus original Paradocs analysis. The full source narrative is never displayed; readers are linked back to NUFORC for the original."
              />

              {/* Reddit */}
              <SourceEntry
                name="Reddit"
                url="https://www.reddit.com/"
                kind="Publicly-posted first-person accounts from paranormal-adjacent subreddits (r/Paranormal, r/UFOs, r/Glitch_in_the_Matrix, and similar)."
                volume="~230,000 posts and comments catalogued"
                treatment="Factual extraction plus original Paradocs analysis. Source prose is not displayed on report pages; readers are linked to the original Reddit thread."
              />

              {/* YouTube */}
              <SourceEntry
                name="YouTube"
                url="https://www.youtube.com/"
                kind="Public videos and comments from paranormal-research channels, accessed through the official YouTube Data API."
                volume="Several thousand videos and selected high-signal comments"
                treatment="YouTube&rsquo;s standard sandboxed embed is used for video playback (per YouTube&rsquo;s embed terms). Factual extraction and original analysis accompany the embed."
              />

              {/* NDERF */}
              <SourceEntry
                name="NDERF"
                url="https://www.nderf.org/"
                kind="Near-Death Experience Research Foundation: experiencer-submitted near-death accounts."
                volume="~5,500 experiences catalogued"
                treatment="Structured case profile (trigger, OBE, life review, etc.) plus original Paradocs analysis. Source narrative is not displayed; readers are linked to the original NDERF entry. Editorial tier classifications are kept internal and never republished."
              />

              {/* OBERF */}
              <SourceEntry
                name="OBERF"
                url="https://www.oberf.org/"
                kind="Out-of-Body Experience Research Foundation: experiencer-submitted OBE, STE, SDE, pre-birth memory, prayer, and dream accounts."
                volume="~2,000 experiences catalogued"
                treatment="Same treatment as NDERF: structured case profile plus original analysis, with link back to the original entry."
              />

              {/* ADCRF */}
              <SourceEntry
                name="ADCRF"
                url="https://www.adcrf.org/"
                kind="After-Death Communication Research Foundation: experiencer-submitted ADC accounts."
                volume="~1,500 experiences catalogued"
                treatment="Same treatment as NDERF/OBERF: structured case profile plus original analysis, with link back."
              />

              {/* BFRO */}
              <SourceEntry
                name="BFRO"
                url="https://www.bfro.net/"
                kind="Bigfoot Field Researchers Organization sighting reports."
                volume="Several thousand reports catalogued"
                treatment="Factual extraction (date, county/state, classification, encounter type) plus original analysis. Source narrative is not displayed; readers are linked to the original BFRO report."
              />

              {/* Wikipedia */}
              <SourceEntry
                name="Wikipedia"
                url="https://www.wikipedia.org/"
                kind="Encyclopedia entries on documented paranormal cases, phenomena, and historical figures."
                volume="Selected articles indexed for cross-reference"
                treatment="Wikipedia content is available under CC BY-SA. Where Paradocs reproduces or adapts Wikipedia text we attribute Wikimedia Commons and the contributing editors, and license the adapted text under the same CC BY-SA terms."
              />

              {/* Government / FOIA / public domain */}
              <SourceEntry
                name="Government, FOIA, and public-domain archives"
                url={null}
                kind="U.S. and international government documents released under FOIA, declassified intelligence reports, and other works in the public domain."
                volume="Varies by archive"
                treatment="Public-domain works are reproduced and excerpted as needed. Government documents are attributed to the issuing agency and dated."
              />
            </div>

            {/* Not currently ingested */}
            <div className="mt-8 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <h3 className="text-white font-medium mb-2">Not currently ingested</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                <strong className="text-white">Erowid</strong> and{' '}
                <strong className="text-white">IANDS</strong> are not currently
                ingested per their stated content-use policies. Paradocs may link
                to their public pages for reference but does not catalogue
                content from either source.
              </p>
            </div>
          </section>

          {/* Methodology */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Methodology</h2>

            <div className="space-y-5">
              <div>
                <h3 className="text-white font-medium mb-2">How a report enters the catalogue</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Ingestion adapters fetch publicly-available content from each
                  source under that source&rsquo;s rate-limit and robots policy.
                  Each candidate is filtered for relevance, classified into the
                  Paradocs phenomenon taxonomy, geocoded where possible, and
                  passed through a personally-identifying-information scrub
                  before any persistence step.
                </p>
              </div>

              <div>
                <h3 className="text-white font-medium mb-2">How the Paradocs narrative is generated</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  The &ldquo;What happened&rdquo; paragraph on every report is
                  Paradocs-authored editorial prose generated by an automated
                  pipeline. The pipeline is instructed to extract facts &mdash;
                  date, location, sequence of events, observed characteristics
                  &mdash; and to compose original third-person editorial
                  language describing what the source reports. It is explicitly
                  instructed never to paraphrase, quote, or restructure source
                  sentences outside of short attributed quotations. The output
                  is transformative analysis, not a reproduction of the source.
                </p>
              </div>

              <div>
                <h3 className="text-white font-medium mb-2">How phenomena are taxonomized</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Reports are classified into a Paradocs-original phenomenon
                  taxonomy: UFO and aerial phenomena, ghosts and hauntings,
                  cryptids, near-death and out-of-body experiences, and dozens
                  more. The full taxonomy and per-phenomenon analytics are
                  browsable at{' '}
                  <Link href="/phenomena" className="text-primary-400 hover:underline">
                    /phenomena
                  </Link>
                  . The taxonomy itself is Paradocs editorial work.
                </p>
              </div>
            </div>
          </section>

          {/* Takedown */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Takedown &amp; contact</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              If you are a source owner or rights-holder and you believe your
              work is being used inappropriately, contact us at{' '}
              <a
                href="mailto:takedown@discoverparadocs.com"
                className="text-primary-400 hover:underline"
              >
                takedown@discoverparadocs.com
              </a>
              {' '}with a link to the affected Paradocs page and a brief description
              of the concern. We respond within seven business days.
            </p>
            <p className="text-gray-400 leading-relaxed">
              For formal notices under the Digital Millennium Copyright Act, see
              the{' '}
              <Link href="/dmca" className="text-primary-400 hover:underline">
                DMCA Notice &amp; Takedown Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </>
  )
}

function SourceEntry(props: {
  name: string
  url: string | null
  kind: string
  volume: string
  treatment: string
}) {
  const { name, url, kind, volume, treatment } = props
  return (
    <div className="border-l-2 border-gray-800 pl-4">
      <h3 className="text-white font-medium mb-1">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-400 transition-colors"
          >
            {name}
          </a>
        ) : (
          name
        )}
      </h3>
      <p className="text-sm text-gray-400 leading-relaxed mb-1">{kind}</p>
      <p className="text-xs text-gray-500 mb-2">{volume}</p>
      <p className="text-sm text-gray-400 leading-relaxed">{treatment}</p>
    </div>
  )
}
