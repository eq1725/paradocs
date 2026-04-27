'use client'

import React from 'react'
import PhoneMockup from './PhoneMockup'
import AppStoreBadges from './AppStoreBadges'

/**
 * Map showcase — AllTrails-style phone mockup showing the Paradocs interactive map.
 * Static dark map mockup with glowing report dots for now.
 * TODO: Replace with looped video/recording of the real map in action.
 */

/* Simulated report locations (normalized 0-1 within the phone screen) */
var reportDots = [
  { x: 0.35, y: 0.28, size: 8, color: '#22d3ee', pulse: true },   /* Northeast US */
  { x: 0.30, y: 0.35, size: 6, color: '#c084fc', pulse: false },  /* Mid-Atlantic */
  { x: 0.22, y: 0.38, size: 10, color: '#22d3ee', pulse: true },  /* Great Lakes */
  { x: 0.40, y: 0.42, size: 5, color: '#4ade80', pulse: false },  /* Southeast */
  { x: 0.15, y: 0.32, size: 7, color: '#fb923c', pulse: true },   /* Plains */
  { x: 0.10, y: 0.30, size: 9, color: '#22d3ee', pulse: false },  /* Mountain West */
  { x: 0.06, y: 0.35, size: 6, color: '#c084fc', pulse: true },   /* Pacific NW */
  { x: 0.08, y: 0.40, size: 8, color: '#4ade80', pulse: false },  /* California */
  { x: 0.50, y: 0.22, size: 5, color: '#fb923c', pulse: true },   /* UK */
  { x: 0.55, y: 0.28, size: 7, color: '#22d3ee', pulse: false },  /* France */
  { x: 0.65, y: 0.40, size: 6, color: '#c084fc', pulse: true },   /* Middle East */
  { x: 0.78, y: 0.48, size: 5, color: '#4ade80', pulse: false },  /* India */
  { x: 0.85, y: 0.55, size: 7, color: '#22d3ee', pulse: true },   /* SE Asia */
  { x: 0.72, y: 0.70, size: 4, color: '#fb923c', pulse: false },  /* Australia */
  { x: 0.38, y: 0.60, size: 5, color: '#c084fc', pulse: true },   /* South America */
  { x: 0.58, y: 0.58, size: 6, color: '#22d3ee', pulse: false },  /* East Africa */
  { x: 0.45, y: 0.18, size: 4, color: '#4ade80', pulse: true },   /* Scandinavia */
  { x: 0.25, y: 0.45, size: 5, color: '#fb923c', pulse: false },  /* Southern US */
]

export default function MapShowcase() {
  return (
    <section className="py-16 md:py-24 overflow-hidden border-t border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">

          {/* Text content — left on desktop (reversed from feed section) */}
          <div className="flex-1 order-2 md:order-1 text-center md:text-left">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white leading-tight">
              Explore the global map
            </h2>
            <p className="mt-4 text-base md:text-lg text-gray-400 max-w-lg">
              Every report, pinned to where it happened. Filter by phenomena type, zoom into hotspots, and uncover clusters the data reveals.
            </p>

            <div className="mt-8">
              <AppStoreBadges />
            </div>
          </div>

          {/* Phone mockup — right on desktop */}
          <div className="flex-shrink-0 order-1 md:order-2">
            <PhoneMockup>
              {/* Dark map background */}
              <div className="absolute inset-0 bg-[#0a0f1a]">
                {/* Faint grid / landmass suggestion */}
                <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {/* Simplified continent outlines - just suggestive shapes */}
                  <ellipse cx="30" cy="35" rx="18" ry="12" fill="none" stroke="#334155" strokeWidth="0.3" />
                  <ellipse cx="55" cy="30" rx="12" ry="15" fill="none" stroke="#334155" strokeWidth="0.3" />
                  <ellipse cx="80" cy="45" rx="10" ry="12" fill="none" stroke="#334155" strokeWidth="0.3" />
                  <ellipse cx="40" cy="60" rx="8" ry="14" fill="none" stroke="#334155" strokeWidth="0.3" />
                  <ellipse cx="72" cy="68" rx="7" ry="5" fill="none" stroke="#334155" strokeWidth="0.3" />
                </svg>

                {/* Report dots with glow */}
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
                <div className="absolute top-10 left-3 right-3">
                  <div className="flex items-center gap-2 bg-gray-900/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span className="text-[10px] text-gray-500">Search locations...</span>
                  </div>
                </div>

                {/* Map filter chips */}
                <div className="absolute top-[72px] left-3 right-3 flex gap-1.5 overflow-hidden">
                  <span className="text-[8px] px-2 py-1 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30 whitespace-nowrap">All</span>
                  <span className="text-[8px] px-2 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10 whitespace-nowrap">UFOs</span>
                  <span className="text-[8px] px-2 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10 whitespace-nowrap">Cryptids</span>
                  <span className="text-[8px] px-2 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10 whitespace-nowrap">Ghosts</span>
                </div>

                {/* Bottom stat bar */}
                <div className="absolute bottom-8 left-3 right-3 flex items-center justify-between bg-gray-900/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500">Visible reports</span>
                    <span className="text-[12px] font-semibold text-white">12,847</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] text-gray-500">Hotspot</span>
                    <span className="text-[10px] font-medium text-primary-400">Pine Bush, NY</span>
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
