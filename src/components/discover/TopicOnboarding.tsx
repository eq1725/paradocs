'use client'

/**
 * TopicOnboarding — Cold start topic selector.
 *
 * Full-screen overlay shown on first Discover visit.
 * "What draws you in?" — pick 3+ topics from 7 main categories.
 * Stores selections in localStorage + user_preferences (if authenticated).
 * Selected categories get affinity score 80, unselected get 20.
 *
 * V7.3 — restructured into 2 absolute siblings instead of one flex
 * column with padding-bottom. Scrollable content + fixed-bottom CTA
 * bar. Required because iOS PWA standalone mode reports
 * env(safe-area-inset-bottom) as 0px while still visually obscuring
 * the bottom ~30px with the home indicator overlay — the previous
 * padding-based approach kept clipping the CTA off-screen.
 *
 * SWC compliant: var, function expressions, string concat, unicode escapes
 */

import React, { useState } from 'react'
import { Sparkles, X } from 'lucide-react'

var ONBOARDING_KEY = 'paradocs_onboarding_completed'
var TOPICS_KEY = 'paradocs_onboarding_topics'

interface TopicOption {
  id: string
  label: string
  icon: string
  tagline: string
}

var TOPICS: TopicOption[] = [
  {
    id: 'ufos_aliens',
    label: 'UFOs & UAPs',
    icon: '🛸',
    tagline: 'Unexplained craft, close encounters, and government disclosures',
  },
  {
    id: 'cryptids',
    label: 'Cryptids & Creatures',
    icon: '🦶',
    tagline: 'Bigfoot, lake monsters, and creatures that defy classification',
  },
  {
    id: 'ghosts_hauntings',
    label: 'Ghosts & Hauntings',
    icon: '👻',
    tagline: 'Apparitions, poltergeists, haunted locations, and EVP recordings',
  },
  {
    id: 'psychological_experiences',
    label: 'Near-Death Experiences',
    icon: '✨',
    tagline: 'NDEs, out-of-body experiences, and encounters at the threshold',
  },
  {
    id: 'psychic_phenomena',
    label: 'Psychic Phenomena',
    icon: '🔮',
    tagline: 'Telepathy, precognition, remote viewing, and ESP research',
  },
  {
    id: 'consciousness_practices',
    label: 'Consciousness & Altered States',
    icon: '🧘',
    tagline: 'Meditation, astral projection, lucid dreaming, and expanded awareness',
  },
  {
    id: 'esoteric_practices',
    label: 'Occultism & High Strangeness',
    icon: '⚡',
    tagline: 'Ritual traditions, ley lines, synchronicities, and the truly unexplained',
  },
]

interface TopicOnboardingProps {
  onComplete: (selectedTopics: string[]) => void
  userId?: string | null
}

export function TopicOnboarding(props: TopicOnboardingProps) {
  var [selected, setSelected] = useState<Set<string>>(new Set())
  var [isAnimating, setIsAnimating] = useState(false)

  function toggleTopic(topicId: string) {
    setSelected(function (prev) {
      var next = new Set(prev)
      if (next.has(topicId)) {
        next.delete(topicId)
      } else {
        next.add(topicId)
      }
      return next
    })
  }

  function handleComplete() {
    if (selected.size < 3) return

    var topics = Array.from(selected)
    setIsAnimating(true)

    // Persist to localStorage
    try {
      localStorage.setItem(ONBOARDING_KEY, 'true')
      localStorage.setItem(TOPICS_KEY, JSON.stringify(topics))
    } catch (e) {
      // Storage full
    }

    // Persist to server if authenticated
    if (props.userId) {
      fetch('/api/user/personalization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interested_categories: topics }),
      }).catch(function () {})
    }

    // Brief animation then callback
    setTimeout(function () {
      props.onComplete(topics)
    }, 400)
  }

  function handleSkip() {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'true')
    } catch (e) {}
    props.onComplete([])
  }

  var canProceed = selected.size >= 3

  return (
    <div
      className={
        'fixed inset-0 z-[70] bg-gray-950/98 backdrop-blur-xl transition-opacity duration-400 ' +
        (isAnimating ? 'opacity-0 scale-105' : 'opacity-100 scale-100')
      }
    >
      {/* Skip button — well below Dynamic Island */}
      <button
        onClick={handleSkip}
        className="absolute right-4 sm:right-6 p-2 text-gray-500 hover:text-gray-300 transition-colors z-20"
        style={{ top: 'max(env(safe-area-inset-top, 0px) + 0.75rem, 2.5rem)' }}
        title="Skip"
      >
        <X className="w-5 h-5" />
      </button>

      {/* (1) Scrollable content area — header + topic grid.
          paddingBottom reserves room equal to the fixed-CTA height
          (~120px) plus the home-indicator allowance so the last
          topic card never sits beneath the CTA bar. */}
      <div
        className="absolute inset-0 overflow-y-auto"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px) + 2.5rem, 4rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 170px)',
        }}
      >
        <div className="flex flex-col items-center pb-4">
          {/* Header */}
          <div className="text-center px-6 mb-7 sm:mb-9">
            <div className="w-14 h-14 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-purple-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              What draws you in?
            </h1>
            <p className="text-gray-400 text-sm sm:text-base max-w-md px-2">
              {'Pick at least 3 topics to personalize your feed. You can always change these later.'}
            </p>
          </div>

          {/* Topic grid */}
          <div className="grid grid-cols-2 gap-3 px-4 sm:px-6 w-full max-w-lg">
            {TOPICS.map(function (topic) {
              var isSelected = selected.has(topic.id)
              return (
                <button
                  key={topic.id}
                  onClick={function () { toggleTopic(topic.id) }}
                  className={
                    'relative flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-200 text-left min-h-[100px] ' +
                    (isSelected
                      ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10'
                      : 'border-gray-800 bg-gray-900/50 hover:border-gray-700 hover:bg-gray-900/80')
                  }
                >
                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">{'✓'}</span>
                    </div>
                  )}

                  <span className="text-2xl mb-2">{topic.icon}</span>
                  <span className={
                    'text-sm font-semibold mb-1 ' +
                    (isSelected ? 'text-purple-300' : 'text-white')
                  }>
                    {topic.label}
                  </span>
                  <span className="text-[11px] text-gray-500 leading-tight line-clamp-2">
                    {topic.tagline}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* (2) Fixed-bottom CTA bar — pinned to viewport bottom,
          decoupled from scroll. Background gradient feathers the
          last topic card cleanly into the CTA region instead of
          a hard cutoff. paddingBottom honors safe-area-inset-bottom
          but enforces a minimum 1rem clearance for iOS PWA
          standalone (where the env value reports 0). */}
      <div
        className="absolute left-0 right-0 bottom-0 z-10 px-6 pt-6"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 1rem, 2rem)',
          background:
            'linear-gradient(to top, rgba(10,10,20,1) 0%, rgba(10,10,20,0.98) 60%, rgba(10,10,20,0) 100%)',
        }}
      >
        <div className="w-full max-w-lg mx-auto">
          <button
            onClick={handleComplete}
            disabled={!canProceed}
            className={
              'w-full py-3.5 rounded-full font-semibold text-sm transition-all duration-200 ' +
              (canProceed
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed')
            }
          >
            {canProceed
              ? 'Start exploring'
              : 'Pick ' + (3 - selected.size) + ' more topic' + (3 - selected.size !== 1 ? 's' : '')}
          </button>
          <p className="text-center text-xs text-gray-600 mt-2">
            {'Selected ' + selected.size + ' of 7'}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Helper: Check if onboarding was completed.
 */
export function isOnboardingComplete(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(ONBOARDING_KEY) === 'true'
}

/**
 * Helper: Get selected onboarding topics.
 */
export function getOnboardingTopics(): string[] {
  if (typeof window === 'undefined') return []
  try {
    var raw = localStorage.getItem(TOPICS_KEY)
    if (raw) return JSON.parse(raw) as string[]
  } catch (e) {}
  return []
}
