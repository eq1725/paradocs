'use client'

/**
 * /terms — Terms of Service.
 *
 * V9.11.5 #26 — placeholder page for the Terms link in /start, /login,
 * /account/settings, and the magic-link email footer. Real legal
 * counsel should review and replace this content before public launch.
 * For pre-launch private-beta state, this is adequate to satisfy the
 * footer link expectations (no longer 404s, no longer falls through to
 * an unrelated route).
 */

import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

var LAST_UPDATED = 'May 2026'

export default function TermsPage() {
  return (
    <>
      <Head>
        <title>Terms of Service · Paradocs</title>
        <meta name="description" content="Paradocs Terms of Service. Rules and conditions for using the platform." />
      </Head>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-white">
        <p className="text-[11px] font-semibold tracking-widest uppercase text-purple-400 mb-2">
          Legal
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-3">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="prose prose-invert prose-sm sm:prose-base max-w-none space-y-6 text-gray-200 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. About Paradocs</h2>
            <p>
              Paradocs is a documentary archive of unexplained experience. We collect, organize,
              and analyse first-hand reports of phenomena that defy conventional explanation
              &mdash; UFO sightings, ghost encounters, near-death experiences, cryptid
              sightings, and similar accounts &mdash; and use AI-assisted matching to surface
              patterns across the archive. By using the service you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Eligibility</h2>
            <p>
              You must be at least 13 years old to use Paradocs (16 in the EU/UK). By creating
              an account or submitting a report, you represent that you meet this age
              requirement and that you have the legal capacity to enter into these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Your account</h2>
            <p>
              We use passwordless email sign-in (one-tap link). You are responsible for the
              security of the email address you sign up with. We are not liable for losses
              arising from unauthorized access to your email.
            </p>
            <p>
              You may delete your account at any time from <Link href="/account/settings" className="text-purple-300 underline">Account Settings</Link>.
              When you delete your account we permanently remove your profile and any reports
              you submitted, except where retention is required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Your content</h2>
            <p>
              You retain ownership of the experience reports, descriptions, photos, and other
              content you submit. By submitting, you grant Paradocs a worldwide, non-exclusive,
              royalty-free licence to host, display, and analyse that content for the purposes
              of operating the service &mdash; including running it through our matching engine,
              showing it on the public browse feed (when you choose Public visibility), and
              referencing it in cross-report pattern analysis.
            </p>
            <p>
              You can change a report&rsquo;s visibility (Public / Match-only / Private) or
              delete it at any time. Deleting a report removes it from the archive within
              30 days; cached search results may persist briefly during that window.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Acceptable use</h2>
            <p>You agree NOT to:</p>
            <ul className="list-disc list-outside pl-6 space-y-1 marker:text-purple-400">
              <li>Submit content that is hateful, threatening, or targets specific named individuals with abuse</li>
              <li>Doxx real people (publish private addresses, phone numbers, identifying information)</li>
              <li>Submit sexual content involving minors</li>
              <li>Use the service to spam, advertise, or promote commercial products</li>
              <li>Attempt to access accounts other than your own, or to scrape the platform at scale</li>
              <li>Knowingly submit fabricated reports as if they were genuine experiences</li>
            </ul>
            <p>
              We review submissions for compliance and may remove content or suspend accounts
              that violate these rules.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. AI analysis</h2>
            <p>
              Paradocs uses large language models and similarity algorithms to match reports,
              detect patterns, and assist with curation. AI-generated outputs are heuristic and
              may be wrong. We do not represent that match scores, similarity rankings, or
              automated classifications are accurate or appropriate for any particular use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. No medical, legal, or psychiatric advice</h2>
            <p>
              Paradocs is not a substitute for professional advice. If you are experiencing
              psychological distress, hearing voices, or feeling unsafe, please contact a
              licensed mental-health professional or, in an emergency, your local emergency
              services. Content on the platform is documentary and exploratory in nature
              and should not be construed as diagnosis, treatment, or recommendation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Subscriptions and billing</h2>
            <p>
              Free accounts have access to core features. Paid tiers (Basic, Pro) unlock
              expanded match limits and additional analysis tools. Subscriptions renew
              automatically at the cadence you select; you may cancel at any time from
              Account Settings, and access continues through the end of the paid period.
              Refunds are issued at our discretion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Disclaimers and limitation of liability</h2>
            <p>
              The service is provided &ldquo;as is&rdquo; without warranty of any kind. We do
              not warrant the truth, accuracy, or completeness of reports submitted by users
              or content sourced from third parties. To the maximum extent permitted by law,
              Paradocs and its operators are not liable for indirect, incidental, or
              consequential damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Changes to these terms</h2>
            <p>
              We may update these terms from time to time. Material changes will be announced
              via email or in-app notice at least 14 days before they take effect. Continued
              use of the service after a change indicates your acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Contact</h2>
            <p>
              Questions about these terms? Email{' '}
              <a href="mailto:hello@discoverparadocs.com" className="text-purple-300 underline">
                hello@discoverparadocs.com
              </a>
              .
            </p>
          </section>

          <p className="text-xs text-gray-500 pt-6 border-t border-white/10">
            See also our{' '}
            <Link href="/privacy" className="text-purple-300 underline">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </>
  )
}
