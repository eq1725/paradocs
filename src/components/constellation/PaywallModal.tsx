'use client'

/**
 * PaywallModal — Depth gate for Constellation V2
 *
 * Shown when a user tries to unlock a locked match (beyond their free 5).
 * Two paths:
 *   1. "Get Pro" — future Stripe integration (for now, captures email for waitlist)
 *   2. "Notify me when Pro launches" — email capture to waitlist
 *
 * SWC: Uses var + function(){} for compatibility.
 */

import React, { useState, useCallback } from 'react'
import { X, Lock, Star, Zap, Bell, CheckCircle, Loader2 } from 'lucide-react'
import { getApiBase } from '@/lib/utils'

interface PaywallModalProps {
  isOpen: boolean
  onClose: () => void
  /** Pre-fill email if user is logged in */
  userEmail?: string
  /** How many free matches they've already unlocked */
  unlockedCount?: number
  /** Total matches available */
  totalMatches?: number
}

export default function PaywallModal({
  isOpen,
  onClose,
  userEmail,
  unlockedCount = 5,
  totalMatches = 0,
}: PaywallModalProps) {
  var [email, setEmail] = useState(userEmail || '')
  var [submitting, setSubmitting] = useState(false)
  var [submitted, setSubmitted] = useState(false)
  var [error, setError] = useState('')

  var handleSubmit = useCallback(async function(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    setSubmitting(true)
    setError('')

    try {
      var res = await fetch(getApiBase() + '/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          source: 'constellation_paywall',
          metadata: {
            unlocked_count: unlockedCount,
            total_matches: totalMatches,
          },
        }),
      })

      if (res.ok) {
        setSubmitted(true)
      } else {
        var data = await res.json().catch(function() { return {} })
        setError(data.error || 'Something went wrong. Please try again.')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [email, unlockedCount, totalMatches])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl"
        onClick={function(e) { e.stopPropagation() }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Glow accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-32 bg-primary-600/20 rounded-full blur-3xl pointer-events-none" />

        {submitted ? (
          /* Success state */
          <div className="px-6 py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-display font-bold text-white mb-3">
              You're on the list
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              We'll let you know when Pro access is available.
              Your {unlockedCount} free matches aren't going anywhere.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-full text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 transition-colors"
            >
              Back to Constellation
            </button>
          </div>
        ) : (
          /* Main content */
          <div className="px-6 py-8">
            {/* Icon */}
            <div className="w-14 h-14 rounded-full bg-primary-600/20 flex items-center justify-center mx-auto mb-5">
              <Lock className="w-7 h-7 text-primary-400" />
            </div>

            <h2 className="text-xl font-display font-bold text-white text-center mb-2">
              Unlock All Connections
            </h2>
            <p className="text-gray-400 text-sm text-center mb-6">
              You've explored your {unlockedCount} free matches.
              {totalMatches > unlockedCount && (
                <span className="text-primary-400 font-medium">
                  {' '}{totalMatches - unlockedCount} more connections are waiting.
                </span>
              )}
            </p>

            {/* Pro features */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-primary-600/15 flex items-center justify-center flex-shrink-0">
                  <Star className="w-4 h-4 text-primary-400" />
                </div>
                <span className="text-gray-300">
                  Unlimited match unlocks across all categories
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-primary-600/15 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 text-primary-400" />
                </div>
                <span className="text-gray-300">
                  Advanced pattern analysis and deeper insights
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-primary-600/15 flex items-center justify-center flex-shrink-0">
                  <Bell className="w-4 h-4 text-primary-400" />
                </div>
                <span className="text-gray-300">
                  New match alerts when similar reports come in
                </span>
              </div>
            </div>

            {/* Email capture */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={function(e) { setEmail(e.target.value); setError('') }}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-600 transition-colors"
                  disabled={submitting}
                />
                {error && (
                  <p className="text-red-400 text-xs mt-1.5">{error}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {submitting ? 'Joining...' : 'Notify Me When Pro Launches'}
              </button>
            </form>

            <p className="text-[11px] text-gray-600 text-center mt-4">
              No spam, ever. We'll only email when Pro is ready.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
