/**
 * Beta Access Landing Page
 *
 * Standalone signup page for open beta access.
 * Collects email and interests, submits to Mailchimp.
 */

import React, { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { CheckCircle, Sparkles, ArrowRight } from 'lucide-react'

// Usage options for the signup form
const USAGE_OPTIONS = [
  { id: 'report_experiences', label: 'Report my experiences', icon: '📝' },
  { id: 'research', label: 'Research & analysis', icon: '🔬' },
  { id: 'explore_reports', label: 'Explore others\' reports', icon: '🔍' },
  { id: 'just_curious', label: 'Just curious', icon: '👀' },
]

export default function BetaAccessPage() {
  const [email, setEmail] = useState('')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectUsage = (id: string) => {
    setSelectedInterests([id])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email) {
      setError('Please enter your email address')
      return
    }

    if (selectedInterests.length === 0) {
      setError('Please select how you plan to use ParaDocs')
      return
    }

    setIsSubmitting(true)

    try {
      // Submit to our API which will forward to Mailchimp
      const response = await fetch('/api/beta-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          interests: selectedInterests
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to sign up')
      }

      setIsSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Head>
        <title>Join the Beta | ParaDocs</title>
        <meta name="description" content="Get early access to ParaDocs - the platform for documenting and exploring paranormal phenomena." />
      </Head>

      <div className="min-h-screen bg-gray-950 flex flex-col">
        {/* Header */}
        <header className="p-6">
          <Link href="/" className="inline-flex items-center gap-2 text-white hover:text-purple-400 transition-colors">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">ParaDocs</span>
          </Link>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            {!isSubmitted ? (
              /* Signup Form */
              <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm font-medium mb-4">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                    </span>
                    Open Beta
                  </div>
                  <h1 className="text-2xl font-bold text-white mb-2">
                    Join the Investigation
                  </h1>
                  <p className="text-gray-400">
                    Get early access to explore, document, and analyze paranormal phenomena.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Email Field */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="investigator@email.com"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>

                  {/* Usage Field */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      How will you use ParaDocs?
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {USAGE_OPTIONS.map((option) => {
                        const isSelected = selectedInterests.includes(option.id)
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => selectUsage(option.id)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-purple-500/20 border-purple-500 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                            }`}
                          >
                            <span className="text-xl">{option.icon}</span>
                            <span className="text-sm font-medium">{option.label}</span>
                            {isSelected && (
                              <CheckCircle className="w-4 h-4 text-purple-400 ml-auto flex-shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                      {error}
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Joining...
                      </>
                    ) : (
                      <>
                        Get Early Access
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                <p className="text-center text-xs text-gray-500 mt-6">
                  By signing up, you agree to receive emails about ParaDocs.
                  <br />
                  Unsubscribe anytime.
                </p>
              </div>
            ) : (
              /* Confirmation Screen */
              <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 text-center">
                <div className="mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  </div>
                  <h1 className="text-2xl font-bold text-white mb-2">
                    You're on the list!
                  </h1>
                  <p className="text-gray-400">
                    Thanks for signing up for early access to ParaDocs.
                  </p>
                </div>

                <div className="p-5 bg-gray-800/50 rounded-lg text-left">
                  <h3 className="text-sm font-semibold text-white mb-3">What happens next?</h3>
                  <ul className="space-y-3 text-sm text-gray-300">
                    <li className="flex items-start gap-3">
                      <span className="text-purple-400 mt-0.5">1.</span>
                      <span>We'll notify you as soon as the beta opens</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-purple-400 mt-0.5">2.</span>
                      <span>You'll receive instructions to create your profile</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-purple-400 mt-0.5">3.</span>
                      <span>Log in and start exploring the paranormal</span>
                    </li>
                  </ul>
                </div>

                <p className="text-xs text-gray-500 mt-6">
                  Keep an eye on your inbox at <span className="text-gray-400">{email}</span>
                </p>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="p-6 text-center text-gray-500 text-sm">
          © {new Date().getFullYear()} ParaDocs. All rights reserved.
        </footer>
      </div>

    </>
  )
}
