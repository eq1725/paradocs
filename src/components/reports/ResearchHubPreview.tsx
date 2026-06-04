/**
 * ResearchHubPreview Component
 *
 * Blurred preview of the Research Hub with subscription CTA for free/unauthenticated users.
 * Subscribed users see a link to add the report to their hub.
 * Dynamic CTA text references the specific report's connections.
 *
 * SWC compliant: var, function(){}, string concat, no template literals in JSX.
 */

import React, { useState } from 'react'
import Link from 'next/link'
import { BookOpen, Lock, ArrowRight } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface Props {
  reportId: string
  reportTitle: string
  reportCategory: string
  categoryLabel: string
  isSubscribed: boolean
  isAuthenticated: boolean
  className?: string
}

export default function ResearchHubPreview({
  reportId,
  reportTitle,
  reportCategory,
  categoryLabel,
  isSubscribed,
  isAuthenticated,
  className
}: Props) {
  // P3: Two-step auth — capture email before redirecting to full signup
  var _emailState = useState('')
  var email = _emailState[0]
  var setEmail = _emailState[1]
  var _submittedState = useState(false)
  var emailSubmitted = _submittedState[0]
  var setEmailSubmitted = _submittedState[1]

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || email.indexOf('@') === -1) return
    // Store email in sessionStorage for the signup page to prefill
    try { sessionStorage.setItem('paradocs_signup_email', email) } catch (_e) {}
    setEmailSubmitted(true)
    // Short delay so user sees confirmation, then redirect
    setTimeout(function() {
      window.location.href = '/auth/login?email=' + encodeURIComponent(email) + '&from=report&ref=' + reportId
    }, 600)
  }
  // Subscribed users see a link to add report to their Research Hub
  if (isSubscribed) {
    return (
      <div className={classNames('mt-8 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 sm:p-5', className)}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Research Hub</p>
            <p className="text-xs text-gray-400">Save this case to your research collection for deeper analysis</p>
          </div>
          <Link
            href={'/dashboard/hub?add=' + reportId}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-full text-xs font-medium transition-colors flex-shrink-0"
          >
            Add to Hub
          </Link>
        </div>
      </div>
    )
  }

  // P3: Contextual CTA copy based on report category
  var ctaHeadline = categoryLabel
    ? 'Go deeper on ' + categoryLabel + ' cases'
    : 'Unlock the full research toolkit'
  var ctaBody = categoryLabel
    ? 'Cross-reference this case with other ' + categoryLabel.toLowerCase() + ' reports, track patterns, and access our analysis tools.'
    : 'Save cases, cross-reference patterns, and access deep analysis tools.'

  // Free/unauthenticated users see blurred preview with CTA
  return (
    <div className={classNames('relative mt-8 rounded-xl overflow-hidden', className)}>
      {/* Blurred content preview */}
      <div className="filter blur-sm pointer-events-none p-5 sm:p-6 bg-white/5 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">Research Hub</h3>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          Deep analysis, case file connections, related artifacts, and cross-referencing tools...
        </p>
        {/* Fake content blocks to suggest depth */}
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 bg-white/10 rounded-lg" />
          <div className="h-20 bg-white/10 rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="h-12 bg-white/10 rounded-lg" />
          <div className="h-12 bg-white/10 rounded-lg" />
          <div className="h-12 bg-white/10 rounded-lg" />
        </div>
      </div>

      {/* Overlay CTA */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-xl">
        <div className="text-center px-6 max-w-sm mx-auto">
          <Lock className="w-6 h-6 text-purple-400 mx-auto mb-3" />
          <p className="text-white font-medium mb-2">{ctaHeadline}</p>
          <p className="text-gray-300 text-sm mb-4">
            {ctaBody}
          </p>
          {isAuthenticated ? (
            <Link
              href="/pricing"
              className="inline-block bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors"
            >
              {'Start with Basic \u2014 $5.99/mo'}
            </Link>
          ) : (
            emailSubmitted ? (
              <p className="text-green-400 text-sm font-medium">{'Redirecting\u2026'}</p>
            ) : (
              <form onSubmit={handleEmailSubmit} className="space-y-2">
                <input
                  type="email"
                  value={email}
                  onChange={function(e) { setEmail(e.target.value) }}
                  placeholder="Your email"
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-full text-sm text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                />
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors"
                >
                  {'Get started free'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            )
          )}
        </div>
      </div>
    </div>
  )
}
