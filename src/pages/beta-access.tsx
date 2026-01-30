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

// Interest options for the signup form
const INTEREST_OPTIONS = [
  { id: 'ufos_aliens', label: 'UFOs & Aliens', icon: '🛸' },
  { id: 'cryptids', label: 'Cryptids', icon: '🦶' },
  { id: 'ghosts_hauntings', label: 'Ghosts & Hauntings', icon: '👻' },
  { id: 'psychic_phenomena', label: 'Psychic Phenomena', icon: '🔮' },
  { id: 'consciousness', label: 'Consciousness & Dreams', icon: '🧘' },
  { id: 'unexplained', label: 'Other Unexplained', icon: '✨' },
]

export default function BetaAccessPage() {
  const [email, setEmail] = useState('')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id)
      }
      if (prev.length >= 3) {
        // Replace oldest selection
        return [...prev.slice(1), id]
      }
      return [...prev, id]
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email) {
      setError('Please enter your email address')
      return
    }

    if (selectedInterests.length === 0) {
      setError('Please select at least one interest')
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

                  {/* Interests Field */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      What interests you? <span className="text-gray-500">(Pick 1-3)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {INTEREST_OPTIONS.map((interest) => {
                        const isSelected = selectedInterests.includes(interest.id)
                        return (
                          <button
                            key={interest.id}
                            type="button"
                            onClick={() => toggleInterest(interest.id)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-purple-500/20 border-purple-500 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                            }`}
                          >
                            <span className="text-lg">{interest.icon}</span>
                            <span className="text-sm font-medium truncate">{interest.label}</span>
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
              /* Thank You Screen */
              <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 text-center">
                <div className="mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4 animate-bounce-slow">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  </div>
                  <h1 className="text-2xl font-bold text-white mb-2">
                    You're In!
                  </h1>
                  <p className="text-gray-400">
                    Welcome to the investigation. Check your inbox for next steps.
                  </p>
                </div>

                <div className="p-4 bg-gray-800/50 rounded-lg mb-6">
                  <p className="text-sm text-gray-300">
                    <span className="text-purple-400 font-medium">Your interests:</span>{' '}
                    {selectedInterests.map(id =>
                      INTEREST_OPTIONS.find(o => o.id === id)?.label
                    ).join(', ')}
                  </p>
                </div>

                <div className="space-y-3">
                  <Link
                    href="/explore"
                    className="block w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-colors"
                  >
                    Start Exploring Reports
                  </Link>
                  <Link
                    href="/"
                    className="block w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
                  >
                    Back to Home
                  </Link>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="p-6 text-center text-gray-500 text-sm">
          © {new Date().getFullYear()} ParaDocs. All rights reserved.
        </footer>
      </div>

      <style jsx>{`
        @keyframes bounce-slow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
      `}</style>
    </>
  )
}
