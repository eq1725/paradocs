'use client'

import React from 'react'
import PhoneMockup from './PhoneMockup'
import AppStoreBadges from './AppStoreBadges'

/**
 * Map showcase — realistic phone mockup showing the Paradocs interactive map.
 * Static dark map mockup with glowing report dots for now.
 * Differentiated from FeedShowcase with a subtle gradient background.
 *
 * TODO: Replace with looped video/recording of the real map in action.
 */

/* Simulated report locations — reduced density for cleaner rendering */
var reportDots = [
  { x: 0.35, y: 0.28, size: 10, color: '#22d3ee', pulse: true },
  { x: 0.22, y: 0.38, size: 12, color: '#22d3ee', pulse: true },
  { x: 0.40, y: 0.42, size: 7, color: '#4ade80', pulse: false },
  { x: 0.15, y: 0.32, size: 9, color: '#fb923c', pulse: true },
  { x: 0.08, y: 0.40, size: 10, color: '#4ade80', pulse: false },
  { x: 0.50, y: 0.22, size: 7, color: '#fb923c', pulse: true },
  { x: 0.55, y: 0.28, size: 9, color: '#22d3ee', pulse: false },
  { x: 0.65, y: 0.40, size: 8, color: '#c084fc', pulse: true },
  { x: 0.85, y: 0.55, size: 9, color: '#22d3ee', pulse: true },
  { x: 0.38, y: 0.60, size: 7, color: '#c084fc', pulse: false },
  { x: 0.72, y: 0.68, size: 6, color: '#fb923c', pulse: false },
  { x: 0.25, y: 0.48, size: 7, color: '#c084fc', pulse: true },
]

export default function MapShowcase() {
  return (
    <section className="py-16 md:py-24 border-t border-white/5 relative overflow-hidden">
      {/* Differentiated background — subtle gradient wash */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-900/[0.06] via-transparent to-cyan-900/[0.04] pointer-events-none" />
      {/* Ambient glow — positioned near the phone */}
      <div className="absolute top-1/2 right-[15%] -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.06] pointer-events-none" style={{ background: 'radial-gradient(circle, #22d3ee 0%, transparent 70%)' }} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-20">

          {/* Text content — left on desktop, headline above phone on mobile */}
          <div className="flex-1 order-1 md:order-1 text-center md:text-left">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white leading-tight">
              Explore the global map
            </h2>
            <p className="mt-5 text-base md:text-lg text-gray-400 max-w-lg">
              Every report, pinned to where it happened. Filter by type, zoom into hotspots, and uncover clusters.
            </p>

            <div className="mt-10">
              <AppStoreBadges />
            </div>
          </div>

          {/* Phone mockup — right on desktop */}
          <div className="flex-shrink-0 order-2 md:order-2 md:-my-8">
            <PhoneMockup>
              {/* Dark map background */}
              <div className="absolute inset-0 bg-[#0a0f1a]">
                {/* Faint landmass suggestions */}
                <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <ellipse cx="30" cy="35" rx="18" ry="12" fill="none" stroke="#334155" strokeWidth="0.3" />
                  <ellipse cx="55" cy="30" rx="12" ry="15" fill="none" stroke="#334155" strokeWidth="0.3" />
                  <ellipse cx="80" cy="45" rx="10" ry="12" fill="none" stroke="#334155" strokeWidth="0.3" />
                  <ellipse cx="40" cy="60" rx="8" ry="14" fill="none" stroke="#334155" strokeWidth="0.3" />
                  <ellipse cx="72" cy="68" rx="7" ry="5" fill="none" stroke="#334155" strokeWidth="0.3" />
                </svg>

                {/* Report dots with glow — fewer, larger for clarity */}
                {reportDots.map(function(dot, i) {
                  return (
                    <div
                      key={i}
                      className={dot.pulse ? 'animate-pulse' : ''}
                      style={{
                        position: 'absolute',
                        left: (dot.x * 100) + '%',
                        top: (dot.y * 100) + '%',
                        width: dot.size + 'px',
                        height: dot.size + 'px',
                        borderRadius: '50%',
                        backgroundColor: dot.color,
                        boxShadow: '0 0 ' + (dot.size * 2) + 'px ' + dot.color + '80',
                        transform: 'translate(-50%, -50%)',
                      }}
                    />
                  )
                })}

                {/* Map UI overlay — search bar */}
                <div className="absolute top-8 left-3 right-3">
                  <div className="flex items-center gap-2 bg-gray-900/80 backdrop-blur-sm rounded-lg px-3 py-2.5 border border-white/10">
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span className="text-[11px] text-gray-500">Search locations...</span>
                  </div>
                </div>

                {/* Map filter chips */}
                <div className="absolute top-[68px] left-3 right-3 flex gap-2 overflow-hidden">
                  <span className="text-[9px] px-2.5 py-1 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30 whitespace-nowrap font-medium">All</span>
                  <span className="text-[9px] px-2.5 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10 whitespace-nowrap">UFOs</span>
                  <span className="text-[9px] px-2.5 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10 whitespace-nowrap">Cryptids</span>
                  <span className="text-[9px] px-2.5 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10 whitespace-nowrap">Ghosts</span>
                </div>

                {/* Bottom stat bar */}
                <div className="absolute bottom-6 left-3 right-3 flex items-center justify-between bg-gray-900/80 backdrop-blur-sm rounded-lg px-3 py-2.5 border border-white/10">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500">Visible reports</span>
                    <span className="text-[13px] font-semibold text-white">12,847</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-500">Hotspot</span>
                    <span className="text-[11px] font-medium text-primary-400">Pine Bush, NY</span>
                  </div>
                </div>
              </div>
            </PhoneMockup>
          </div>

        </div>
      </div>
    </section>
  )
}
