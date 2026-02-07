/**
 * Early Access Survey Page
 *
 * Quick survey for early signups to share what they're most
 * excited about. Linked from the alpha update email campaign.
 * Stores responses in Supabase survey_responses table.
 */

import React, { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { CheckCircle, ArrowRight, Sparkles } from 'lucide-react'

// Topic options matching Paradocs categories
const TOPIC_OPTIONS = [
  { id: 'ufos', label: 'UFOs & Alien Encounters', icon: '🛸' },
  { id: 'ndes', label: 'Near-Death Experiences', icon: '✨' },
  { id: 'consciousness', label: 'Consciousness Research', icon: '🧠' },
  { id: 'cryptids', label: 'Cryptids & Unknown Creatures', icon: '🦶' },
  { id: 'ghosts', label: 'Ghosts & Hauntings', icon: '👻' },
  { id: 'psychic', label: 'Psychic & ESP Phenomena', icon: '🔮' },
  { id: 'reincarnation', label: 'Reincarnation & Past Lives', icon: '🔄' },
  { id: 'occult', label: 'Occultism & Esoteric', icon: '📜' },
]

// Researcher type options
const RESEARCHER_OPTIONS = [
  { id: 'casual', label: 'Casual explorer — I follow the curiosity', icon: '🌟' },
  { id: 'enthusiast', label: 'Serious enthusiast — I dig deep', icon: '🔍' },
  { id: 'academic', label: 'Academic or professional researcher', icon: '🎓' },
  { id: 'creator', label: 'Content creator, journalist, or author', icon: '✍️' },
]

export default function SurveyPage() {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [researcherType, setResearcherType] = useState<string>('')
  const [openResponse, setOpenResponse] = useState('')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleTopic = (id: string) => {
    setSelectedTopics(prev =>
      prev.includes(id)
        ? prev.filter(t => t !== id)
        : [...prev, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (selectedTopics.length === 0) {
      setError('Select at least one topic you\'re interested in')
      return
    }

    if (!researcherType) {
      setError('Let us know how you\'d describe yourself')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/survey-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topics: selectedTopics,
          researcher_type: researcherType,
          open_response: openResponse.trim() || null,
          email: email.trim().toLowerCase() || null,
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit survey')
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
        <title>Share Your Thoughts | Paradocs</title>
        <meta name="description" content="Help shape Paradocs — tell us what you're most excited to explore." />
      </Head>

      <div className="min-h-screen bg-gray-950 flex flex-col">
        {/* Header */}
        <header className="p-6">
          <Link href="https://www.discoverparadocs.com" className="inline-block text-white hover:opacity-80 transition-opacity">
            <span className="text-xl font-black tracking-tight">Paradocs.</span>
          </Link>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-start justify-center px-4 py-8 md:py-12">
          <div className="w-full max-w-lg">
            {!isSubmitted ? (
              /* Survey Form */
              <div className="bg-gray-900 rounded-2xl p-6 md:p-8 border border-gray-800">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm font-medium mb-4">
                    <Sparkles className="w-3.5 h-3.5" />
                    30-Second Survey
                  </div>
                  <h1 className="text-2xl font-bold text-white mb-2">
                    Help us build Paradocs for you
                  </h1>
                  <p className="text-gray-400 text-sm">
                    Your answers directly shape what we prioritize for the open beta in March.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                  {/* Q1: Topics */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      What topics are you most excited to explore?
                    </label>
                    <p className="text-xs text-gray-500 mb-3">Select all that apply</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {TOPIC_OPTIONS.map((option) => {
                        const isSelected = selectedTopics.includes(option.id)
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => toggleTopic(option.id)}
                            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all text-sm ${
                              isSelected
                                ? 'bg-purple-500/20 border-purple-500 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                            }`}
                          >
                            <span className="text-lg flex-shrink-0">{option.icon}</span>
                            <span className="font-medium leading-tight">{option.label}</span>
                            {isSelected && (
                              <CheckCircle className="w-4 h-4 text-purple-400 ml-auto flex-shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Q2: Researcher Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      How would you describe yourself?
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {RESEARCHER_OPTIONS.map((option) => {
                        const isSelected = researcherType === option.id
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setResearcherType(option.id)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all text-sm ${
                              isSelected
                                ? 'bg-purple-500/20 border-purple-500 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                            }`}
                          >
                            <span className="text-lg flex-shrink-0">{option.icon}</span>
                            <span className="font-medium">{option.label}</span>
                            {isSelected && (
                              <CheckCircle className="w-4 h-4 text-purple-400 ml-auto flex-shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Q3: Open Response */}
                  <div>
                    <label htmlFor="open-response" className="block text-sm font-medium text-gray-300 mb-1">
                      Anything else you'd love to see in Paradocs?
                    </label>
                    <p className="text-xs text-gray-500 mb-2">Optional — but we read every response</p>
                    <textarea
                      id="open-response"
                      value={openResponse}
                      onChange={(e) => setOpenResponse(e.target.value)}
                      placeholder="A feature, a dataset, an idea..."
                      rows={3}
                      maxLength={500}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm resize-none"
                    />
                  </div>

                  {/* Optional Email */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                      Your email
                    </label>
                    <p className="text-xs text-gray-500 mb-2">Optional — if you'd like us to follow up with you personally</p>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                    />
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
                        Submitting...
                      </>
                    ) : (
                      <>
                        Submit
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              /* Success Screen */
              <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 text-center">
                <div className="mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  </div>
                  <h1 className="text-2xl font-bold text-white mb-2">
                    Thanks for sharing!
                  </h1>
                  <p className="text-gray-400">
                    Your input is shaping what Paradocs becomes. We'll have more to share with you very soon.
                  </p>
                </div>

                <div className="p-5 bg-gray-800/50 rounded-lg text-left">
                  <h3 className="text-sm font-semibold text-white mb-3">What's next?</h3>
                  <ul className="space-y-3 text-sm text-gray-300">
                    <li className="flex items-start gap-3">
                      <span className="text-purple-400 mt-0.5">1.</span>
                      <span>Open beta invitations go out in <strong className="text-white">March 2026</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-purple-400 mt-0.5">2.</span>
                      <span>Early signups like you get first access</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-purple-400 mt-0.5">3.</span>
                      <span>Industry partnerships &amp; collaborations announced soon</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-800">
                  <p className="text-sm text-gray-400 mb-3">Know someone who should be part of this?</p>
                  <a
                    href="https://www.discoverparadocs.com"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Share Paradocs
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="p-6 text-center text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} Paradocs. All rights reserved.
        </footer>
      </div>
    </>
  )
}
