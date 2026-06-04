'use client'

// V11.17.68 - Tier 2A
//
// PricingFooter — quiet brand-anchored footer for the /pricing page.
// Links to /about, /privacy, /terms, and /account/subscription so a
// logged-in user can step into the management surface directly.
//
// Documentary register — no decorative SaaS chrome.

import React from 'react'
import Link from 'next/link'

export default function PricingFooter() {
  return (
    <footer className="border-t border-white/5 bg-black/30 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-8">
          <div className="max-w-sm">
            <Link href="/" className="inline-block mb-3">
              <span className="font-brand text-2xl text-white tracking-tight">
                Paradocs<span style={{ color: '#9000F0' }}>.</span>
              </span>
            </Link>
            <p className="text-sm text-gray-400 leading-relaxed">
              A documentary catalogue of paranormal and anomalous
              experience. Built from public archives, contributor
              submissions, and decades of newspaper, broadcast, and
              online records.
            </p>
          </div>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-gray-400">
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms
                </Link>
              </li>
              <li>
                <Link
                  href="/account/subscription"
                  className="hover:text-white transition-colors"
                >
                  Manage subscription
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 text-xs text-gray-500">
          <p>
            © {new Date().getFullYear()}{' '}
            <span className="font-brand text-gray-300 tracking-tight">
              Paradocs<span style={{ color: '#9000F0' }}>.</span>
            </span>{' '}
            All rights reserved. Submissions are free, forever.
          </p>
        </div>
      </div>
    </footer>
  )
}
