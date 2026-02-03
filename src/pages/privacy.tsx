import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { Shield, ArrowLeft } from 'lucide-react'

export default function PrivacyPolicyPage() {
  const lastUpdated = 'February 2026'

  return (
    <>
      <Head>
        <title>Privacy Policy | ParaDocs</title>
        <meta
          name="description"
          content="ParaDocs privacy policy - how we collect, use, and protect your personal information."
        />
      </Head>

      <div className="py-12 max-w-4xl mx-auto px-4">
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
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white">
                Privacy Policy
              </h1>
              <p className="text-gray-400">Last updated: {lastUpdated}</p>
            </div>
          </div>
          <p className="text-gray-300 text-lg leading-relaxed">
            At ParaDocs, we take your privacy seriously. This policy explains what information
            we collect, how we use it, and what rights you have regarding your data.
          </p>
        </div>

        {/* Content */}
        <div className="space-y-10 text-gray-300">
          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. Information We Collect</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-medium mb-2">Information You Provide</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-400 ml-2">
                  <li>Account information (email, username, display name) when you register</li>
                  <li>Report submissions including descriptions, locations, dates, and any media you upload</li>
                  <li>Comments, feedback, and communications you send us</li>
                  <li>Profile information you choose to add</li>
                </ul>
              </div>
              <div>
                <h3 className="text-white font-medium mb-2">Information Collected Automatically</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-400 ml-2">
                  <li>Device information (browser type, operating system)</li>
                  <li>Usage data (pages visited, features used, time spent)</li>
                  <li>IP address and approximate location (country/region level)</li>
                  <li>Cookies and similar tracking technologies</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-400 ml-2">
              <li>To provide, maintain, and improve ParaDocs services</li>
              <li>To process and display report submissions (with privacy controls you set)</li>
              <li>To analyze patterns and trends in aggregated, anonymized data</li>
              <li>To communicate with you about your account or our services</li>
              <li>To detect and prevent fraud, abuse, or security issues</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. Report Privacy & Anonymity</h2>
            <p className="mb-4 text-gray-400">
              We understand that sharing paranormal experiences can be sensitive. ParaDocs offers
              several privacy controls for report submissions:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-400 ml-2">
              <li><strong className="text-white">Anonymous display:</strong> You can choose to hide your username on published reports</li>
              <li><strong className="text-white">Optional location detail:</strong> Precise coordinates are optional—you control how specific your location data is</li>
              <li><strong className="text-white">Display name control:</strong> Use any display name you choose, separate from your real identity</li>
              <li><strong className="text-white">Draft management:</strong> You can delete draft reports before publishing</li>
            </ul>
            <p className="mt-4 text-gray-400">
              We never publicly associate your real name or contact information with your reports
              unless you explicitly choose to include it.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. Information Sharing</h2>
            <p className="mb-4 text-gray-400">
              We do not sell your personal information. We may share information in limited circumstances:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-400 ml-2">
              <li><strong className="text-white">Public reports:</strong> Information you include in public reports is visible to all users</li>
              <li><strong className="text-white">Service providers:</strong> Trusted third parties who help us operate ParaDocs (hosting, analytics)</li>
              <li><strong className="text-white">Aggregated data:</strong> Anonymized, aggregated statistics may be shared for research purposes</li>
              <li><strong className="text-white">Legal requirements:</strong> When required by law or to protect rights and safety</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">5. Data Security</h2>
            <p className="text-gray-400">
              We implement industry-standard security measures to protect your information,
              including encryption in transit (HTTPS), secure data storage, access controls,
              and regular security reviews. However, no system is completely secure, and we
              cannot guarantee absolute security of your data.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">6. Your Rights & Choices</h2>
            <p className="mb-4 text-gray-400">You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-400 ml-2">
              <li>Access the personal information we hold about you</li>
              <li>Correct inaccurate information</li>
              <li>Delete your account and associated data</li>
              <li>Request a copy of your data by contacting us</li>
              <li>Opt out of non-essential communications</li>
              <li>Disable cookies through your browser settings</li>
            </ul>
            <p className="mt-4 text-gray-400">
              To exercise these rights, contact us at{' '}
              <a href="mailto:contact@discoverparadocs.com" className="text-primary-400 hover:underline">
                contact@discoverparadocs.com
              </a>.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">7. Cookies</h2>
            <p className="text-gray-400">
              We use cookies and similar technologies for essential site functionality (keeping
              you logged in), analytics (understanding how people use ParaDocs), and preferences
              (remembering your settings). You can control cookies through your browser settings,
              though some features may not work properly if cookies are disabled.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">8. Children's Privacy</h2>
            <p className="text-gray-400">
              ParaDocs is not intended for children under 13. We do not knowingly collect
              personal information from children under 13. If you believe we have collected
              information from a child under 13, please contact us immediately.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">9. International Users</h2>
            <p className="text-gray-400">
              ParaDocs is operated from the United States. If you access ParaDocs from outside
              the US, your information may be transferred to, stored, and processed in the US
              or other countries where our service providers operate. By using ParaDocs, you
              consent to this transfer.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">10. Changes to This Policy</h2>
            <p className="text-gray-400">
              We may update this privacy policy from time to time. We will notify you of
              significant changes by posting a notice on ParaDocs or sending you an email.
              Your continued use of ParaDocs after changes take effect constitutes acceptance
              of the updated policy.
            </p>
          </section>

          {/* Section 11 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">11. Contact Us</h2>
            <p className="text-gray-400">
              If you have questions about this privacy policy or our data practices, contact us at:
            </p>
            <div className="mt-4 glass-card p-4">
              <p className="text-white font-medium">ParaDocs</p>
              <a
                href="mailto:contact@discoverparadocs.com"
                className="text-primary-400 hover:underline"
              >
                contact@discoverparadocs.com
              </a>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
