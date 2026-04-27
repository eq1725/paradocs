'use client'

import React from 'react'
import PhoneMockup from './PhoneMockup'

/**
 * "What people are reporting" — AllTrails-style showcase section.
 * Phone mockup with stylized discover feed on one side,
 * descriptive text + app store badges on the other.
 * TODO: Replace static feed mockup with looped video capture of real discover feed.
 */

/* Fake feed cards for the static phone mockup */
var mockFeedCards = [
  {
    category: 'UFO Sighting',
    color: '#22d3ee',
    hook: 'A silent triangle drifted over the treeline, each corner pulsing with a soft amber glow.',
    location: 'Pine Bush, NY',
    time: '2 hours ago',
  },
  {
    category: 'Cryptid Encounter',
    color: '#4ade80',
    hook: 'It stood upright at the edge of the creek, at least seven feet tall, and turned its head to look directly at me.',
    location: 'Fouke, AR',
    time: '5 hours ago',
  },
  {
    category: 'Ghost / Apparition',
    color: '#c084fc',
    hook: 'The figure appeared at the foot of the bed every night for a week, always pointing toward the closet.',
    location: 'Gettysburg, PA',
    time: '8 hours ago',
  },
  {
    category: 'High Strangeness',
    color: '#fb923c',
    hook: 'Every clock in the house stopped at 3:17 AM. The next morning we found symbols scratched into the back door.',
    location: 'Sedona, AZ',
    time: '1 day ago',
  },
]

function FeedCardMock({ card, index }: { card: typeof mockFeedCards[0]; index: number }) {
  return (
    <div
      className="mx-3 mb-2 rounded-xl border border-white/10 bg-white/5 p-3"
      style={{ animationDelay: index * 150 + 'ms' }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: card.color }} />
        <span className="text-[10px] font-medium" style={{ color: card.color }}>{card.category}</span>
        <span className="text-[9px] text-gray-600 ml-auto">{card.time}</span>
      </div>
      <p className="text-[11px] text-gray-300 leading-snug line-clamp-2">
        {card.hook}
      </p>
      <p className="text-[9px] text-gray-500 mt-1">{card.location}</p>
    </div>
  )
}

export default function FeedShowcase() {
  return (
    <section className="py-16 md:py-24 overflow-hidden border-t border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">

          {/* Phone mockup — left on desktop */}
          <div className="flex-shrink-0 order-1 md:order-1">
            <PhoneMockup>
              {/* Fake status bar */}
              <div className="pt-9 px-4 pb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-white">Paradocs</span>
                <span className="text-[9px] text-gray-500">Reports</span>
              </div>

              {/* Section header inside phone */}
              <div className="px-3 pb-2">
                <p className="text-[11px] font-semibold text-white">What people are reporting</p>
                <p className="text-[8px] text-gray-500">Real encounters and AI-detected patterns</p>
              </div>

              {/* Feed cards */}
              <div className="flex flex-col">
                {mockFeedCards.map(function(card, i) {
                  return <FeedCardMock key={i} card={card} index={i} />
                })}
              </div>

              {/* Bottom nav mock */}
              <div className="absolute bottom-6 left-0 right-0 flex justify-around px-6 py-2 border-t border-white/10 bg-gray-950/90">
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-4 h-4 rounded bg-primary-500/30" />
                  <span className="text-[7px] text-primary-400">Reports</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-4 h-4 rounded bg-white/10" />
                  <span className="text-[7px] text-gray-500">Phenomena</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-4 h-4 rounded bg-white/10" />
                  <span className="text-[7px] text-gray-500">Investigate</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-4 h-4 rounded bg-white/10" />
                  <span className="text-[7px] text-gray-500">Profile</span>
                </div>
              </div>
            </PhoneMockup>
          </div>

          {/* Text content — right on desktop */}
          <div className="flex-1 order-2 md:order-2 text-center md:text-left">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white leading-tight">
              What people are reporting
            </h2>
            <p className="mt-4 text-base md:text-lg text-gray-400 max-w-lg">
              Real encounters and AI-detected patterns emerging from millions of cases. Swipe through reports, save what matters, and discover connections no one else can see.
            </p>

            <p className="mt-6 text-sm text-gray-500">
              Available on iOS, Android, and web
            </p>
          </div>

        </div>
      </div>
    </section>
  )
}
