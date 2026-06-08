import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { ArrowLeft, Scale } from 'lucide-react'

/**
 * /dmca — DMCA Notice & Takedown Policy
 *
 * V11.17.x — Copyright Sprint 1.
 *
 * Public documentation of Paradocs's Section 512 (17 U.S.C. § 512)
 * notice-and-takedown procedure and the registered DMCA agent contact.
 * Companion page to /sources.
 *
 * Register: sober legal-page. The agent placeholder MUST be filled in
 * by the operator once the agent is registered with the U.S. Copyright
 * Office (https://www.copyright.gov/dmca-directory/, $6).
 */
export default function DmcaPage() {
  const lastUpdated = 'June 2026'

  return (
    <>
      <Head>
        <title>DMCA Notice &amp; Takedown Policy | Paradocs</title>
        <meta
          name="description"
          content="Paradocs DMCA notice and takedown procedure under 17 U.S.C. § 512, including the registered DMCA agent contact."
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
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center">
              <Scale className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white">
                DMCA Notice &amp; Takedown Policy
              </h1>
              <p className="text-gray-400">Last updated: {lastUpdated}</p>
            </div>
          </div>
          <p className="text-gray-300 text-lg leading-relaxed">
            Paradocs respects intellectual property rights. We comply with the
            Digital Millennium Copyright Act (DMCA, 17 U.S.C. &sect; 512) for the
            prompt processing of valid notices.
          </p>
        </div>

        <div className="space-y-10 text-gray-300">
          {/* DMCA agent */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Designated DMCA agent</h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              The following agent has been designated to receive notifications of
              claimed infringement under 17 U.S.C. &sect; 512(c)(2):
            </p>
            <div className="glass-card p-5 space-y-1.5">
              <p className="text-sm text-gray-400">
                <span className="text-gray-500">Name: </span>
                <span className="text-white font-medium">
                  Paradocs
                </span>
              </p>
              <p className="text-sm text-gray-400">
                <span className="text-gray-500">Address: </span>
                <span className="text-white font-medium">
                  2232 Dell Range Blvd., Suite 245-3635, Cheyenne, WY 82009
                </span>
              </p>
              <p className="text-sm text-gray-400">
                <span className="text-gray-500">Email: </span>
                <a
                  href="mailto:dmca@discoverparadocs.com"
                  className="text-primary-400 hover:underline"
                >
                  dmca@discoverparadocs.com
                </a>
              </p>
              <p className="text-sm text-gray-400">
                <span className="text-gray-500">Phone: </span>
                <span className="text-white font-medium">
                  (409) 790-8842
                </span>
              </p>
              <p className="text-sm text-gray-400">
                <span className="text-gray-500">Copyright Office Registration: </span>
                <span className="text-white font-medium">
                  DMCA-1073927
                </span>
              </p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mt-3">
              Notices submitted by means other than the designated agent contact
              above may not be processed.
            </p>
          </section>

          {/* What a valid notice must include */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              What a valid DMCA notice must include
            </h2>
            <p className="text-gray-400 leading-relaxed mb-4">
              To be effective under 17 U.S.C. &sect; 512(c)(3)(A), a written
              notification of claimed infringement must include substantially all
              of the following six elements:
            </p>
            <ol className="list-decimal list-inside space-y-3 text-gray-400 ml-2">
              <li>
                <strong className="text-white">Signature.</strong> A physical or
                electronic signature of a person authorized to act on behalf of
                the owner of an exclusive right that is allegedly infringed.
              </li>
              <li>
                <strong className="text-white">Identification of the copyrighted work.</strong>{' '}
                Identification of the copyrighted work claimed to have been
                infringed, or a representative list if multiple works at a single
                site are covered by a single notification.
              </li>
              <li>
                <strong className="text-white">
                  Identification of the allegedly infringing material and its location.
                </strong>{' '}
                Identification of the material that is claimed to be infringing
                and information reasonably sufficient to permit us to locate the
                material &mdash; typically the full Paradocs URL of the page at
                issue.
              </li>
              <li>
                <strong className="text-white">Contact information.</strong>{' '}
                Information reasonably sufficient to permit us to contact the
                complaining party, including a name, address, telephone number,
                and, if available, an email address.
              </li>
              <li>
                <strong className="text-white">Good-faith statement.</strong>{' '}
                A statement that the complaining party has a good-faith belief
                that use of the material in the manner complained of is not
                authorized by the copyright owner, its agent, or the law.
              </li>
              <li>
                <strong className="text-white">
                  Accuracy statement under penalty of perjury.
                </strong>{' '}
                A statement that the information in the notification is accurate,
                and under penalty of perjury, that the complaining party is
                authorized to act on behalf of the owner of an exclusive right
                that is allegedly infringed.
              </li>
            </ol>
            <p className="text-xs text-gray-500 leading-relaxed mt-4">
              Under 17 U.S.C. &sect; 512(f), any person who knowingly materially
              misrepresents that material is infringing may be liable for damages.
              Please consider whether the use is protected by fair use or another
              limitation on copyright before submitting a notice.
            </p>
          </section>

          {/* Counter-notification */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Counter-notification</h2>
            <p className="text-gray-400 leading-relaxed">
              If you believe that material you posted to Paradocs was removed or
              disabled as a result of mistake or misidentification, you may submit
              a counter-notification under 17 U.S.C. &sect; 512(g). The
              counter-notification must include your signature, identification of
              the removed material and its prior location, a statement under
              penalty of perjury that you have a good-faith belief the material
              was removed by mistake or misidentification, your name, address,
              and telephone number, and a statement consenting to the
              jurisdiction of the appropriate federal district court. We will
              forward valid counter-notifications to the original complainant; if
              the complainant does not file an action seeking a court order
              within the statutory window, we may restore the material.
            </p>
          </section>

          {/* Repeat infringer */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Repeat-infringer policy</h2>
            <p className="text-gray-400 leading-relaxed">
              Consistent with 17 U.S.C. &sect; 512(i), Paradocs has adopted and
              reasonably implemented a policy providing for the termination, in
              appropriate circumstances, of account holders who are repeat
              infringers. Determinations are made case-by-case at the discretion
              of the designated agent.
            </p>
          </section>

          {/* Send notices to */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Send notices to</h2>
            <div className="glass-card p-5 space-y-1.5">
              <p className="text-sm text-gray-400">
                <span className="text-gray-500">Email (preferred): </span>
                <a
                  href="mailto:dmca@discoverparadocs.com"
                  className="text-primary-400 hover:underline"
                >
                  dmca@discoverparadocs.com
                </a>
              </p>
              <p className="text-sm text-gray-400">
                <span className="text-gray-500">Mail: </span>
                <span className="text-white font-medium">
                  Paradocs &mdash; DMCA Agent, 2232 Dell Range Blvd., Suite 245-3635, Cheyenne, WY 82009
                </span>
              </p>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mt-4">
              For non-DMCA takedown concerns or general questions about how
              Paradocs uses source material, see the{' '}
              <Link href="/sources" className="text-primary-400 hover:underline">
                Sources &amp; Methodology
              </Link>
              {' '}page or write to{' '}
              <a
                href="mailto:takedown@discoverparadocs.com"
                className="text-primary-400 hover:underline"
              >
                takedown@discoverparadocs.com
              </a>
              .
            </p>
          </section>

          {/* Disclaimer */}
          <section>
            <p className="text-xs text-gray-500 leading-relaxed">
              This page describes Paradocs&apos;s notice-and-takedown procedure.
              It is not legal advice. The DMCA is summarized here for the
              convenience of rights-holders; the statute itself controls.
            </p>
          </section>
        </div>
      </div>
    </>
  )
}
