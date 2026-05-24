'use client'

import React, { useState } from 'react'
import PhoneMockup from './PhoneMockup'
import AppStoreBadges from './AppStoreBadges'

/**
 * "What people are reporting" — showcase section with realistic phone mockup.
 *
 * V11.17.14 — Replaced the static feed-card mock with a real screen
 * recording of the Today feed (`public/showcase/feed.mp4`, re-encoded
 * from `Report Today Feed Demo 1.mov` for web: H.264, 660×1434, 30fps,
 * no audio, 1.1MB). The video autoplays, mutes, loops, and plays-inline
 * on iOS. Mirrors the pattern in MapShowcase.tsx — if the video fails
 * to load (codec issue, slow network, etc.) the original static card
 * mock renders as a graceful fallback.
 *
 * To regenerate the .mp4 from the .mov source:
 *   ffmpeg -y -i "Report Today Feed Demo 1.mov" -c:v libx264 -preset slow \
 *     -crf 26 -maxrate 1500k -bufsize 3000k -vf "scale=660:-2,fps=30" \
 *     -movflags +faststart -an feed.mp4
 */

/* Fake feed cards — 3 cards for cleaner readability at rendered size */
// V11.17.3 — Mix of dramatic and subtle/personal. The third card
// is intentionally a subtle premonition-style account so the visitor
// who's only had a small, personal strange thing sees themselves in
// the feed too. Mass-market signal: "small moments belong here."
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
    category: 'Premonition',
    color: '#f0abfc',
    hook: 'I dreamed of my grandmother three nights in a row. She died on the fourth.',
    location: 'Lisbon, Portugal',
    time: '8 hours ago',
  },
]

function FeedCardMock({ card, index }: { card: typeof mockFeedCards[0]; index: number }) {
  return (
    <div
      className="mx-3 mb-2.5 rounded-xl border border-white/10 bg-white/5 p-3.5"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: card.color }} />
        <span className="text-[11px] font-medium" style={{ color: card.color }}>{card.category}</span>
        <span className="text-[10px] text-gray-600 ml-auto">{card.time}</span>
      </div>
      <p className="text-[12px] text-gray-300 leading-snug line-clamp-2">
        {card.hook}
      </p>
      <p className="text-[10px] text-gray-500 mt-1.5">{card.location}</p>
    </div>
  )
}

export default function FeedShowcase() {
  // If the video errors (404, codec issue, slow network), fall back
  // to the static feed-card mockup. State flip happens in <video onError>.
  var [videoFailed, setVideoFailed] = useState(false)

  return (
    <section className="py-16 md:py-24 border-t border-white/5 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/2 left-[20%] -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.07] pointer-events-none" style={{ background: 'radial-gradient(circle, #9000F0 0%, transparent 70%)' }} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-10 md:gap-14">

          {/* Phone mockup — left on desktop */}
          <div className="flex-shrink-0 order-2 md:order-1 md:-my-16">
            <PhoneMockup>
              {!videoFailed ? (
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label="Demo of the Paradocs Today feed showing real reports"
                  onError={function() { setVideoFailed(true) }}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ backgroundColor: '#0a0f1a' }}
                >
                  <source src="/showcase/feed.mp4" type="video/mp4" />
                </video>
              ) : (
                <>
                  {/* Status bar */}
                  <div className="pt-8 px-4 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-white">Paradocs</span>
                    <span className="text-[10px] text-gray-500">Reports</span>
                  </div>

                  {/* Section header inside phone */}
                  <div className="px-3.5 pb-2.5">
                    <p className="text-[12px] font-semibold text-white">What people are reporting</p>
                    <p className="text-[9px] text-gray-500 mt-0.5">Real encounters and patterns from the Index</p>
                  </div>

                  {/* Feed cards */}
                  <div className="flex flex-col">
                    {mockFeedCards.map(function(card, i) {
                      return <FeedCardMock key={i} card={card} index={i} />
                    })}
                  </div>

                  {/* Bottom nav mock */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-around px-6 py-2.5 border-t border-white/10 bg-gray-950/90">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-4 h-4 rounded bg-primary-500/30" />
                      <span className="text-[8px] text-primary-400">Reports</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-4 h-4 rounded bg-white/10" />
                      <span className="text-[8px] text-gray-500">Phenomena</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-4 h-4 rounded bg-white/10" />
                      <span className="text-[8px] text-gray-500">Investigate</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-4 h-4 rounded bg-white/10" />
                      <span className="text-[8px] text-gray-500">Profile</span>
                    </div>
                  </div>
                </>
              )}
            </PhoneMockup>
          </div>

          {/* Text content — right on desktop, headline above phone on mobile */}
          <div className="flex-1 order-1 md:order-2 text-center md:text-left md:pt-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white leading-tight">
              What people are reporting
            </h2>
            <p className="mt-4 text-base md:text-lg text-gray-400 max-w-lg">
              Swipe through real encounters, save what matters, and discover connections no one else can see.
            </p>

            <div className="mt-8">
              <AppStoreBadges />
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
