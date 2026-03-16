/**
 * MapSpotlightRow — Horizontal-scroll row of curated map view cards
 *
 * Each card deep-links to /map with pre-set filters and bounds.
 * Renders on the Explore Discover feed to draw users into the map.
 *
 * ⚠️  PLACEHOLDER DATA — These cards are hardcoded examples built before
 * mass data ingestion. After ingestion, replace with dynamically generated
 * spotlight cards based on actual cluster density, recent activity hotspots,
 * and user-relevant geographic areas. See HANDOFF_MAP.md Phase 3 notes.
 */

import React from 'react'
import Link from 'next/link'
import { Map, Flame, Globe2, Compass, Skull, Ghost, ChevronLeft, ChevronRight } from 'lucide-react'

interface SpotlightCard {
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  gradient: string // tailwind gradient classes
  accentColor: string // border hover color
  href: string // deep-link to /map with query params
  reportCount?: number
}

// ⚠️  PLACEHOLDER — Replace with dynamic data post-ingestion
var SPOTLIGHT_CARDS: SpotlightCard[] = [
  {
    id: 'ufo-hotspots-us',
    title: 'UFO Hotspots',
    subtitle: 'United States',
    icon: <Globe2 className="w-7 h-7" />,
    gradient: 'from-emerald-900/60 via-emerald-950/40 to-gray-950',
    accentColor: 'hover:border-emerald-500/40',
    href: '/map?category=ufos_aliens&country=United+States',
    reportCount: 308,
  },
  {
    id: 'cryptid-sightings',
    title: 'Cryptid Sightings',
    subtitle: 'Worldwide encounters',
    icon: <Skull className="w-7 h-7" />,
    gradient: 'from-amber-900/60 via-amber-950/40 to-gray-950',
    accentColor: 'hover:border-amber-500/40',
    href: '/map?category=cryptids',
    reportCount: 2,
  },
  {
    id: 'ghost-hauntings',
    title: 'Ghost & Hauntings',
    subtitle: 'Paranormal activity map',
    icon: <Ghost className="w-7 h-7" />,
    gradient: 'from-purple-900/60 via-purple-950/40 to-gray-950',
    accentColor: 'hover:border-purple-500/40',
    href: '/map?category=ghosts_hauntings',
    reportCount: 1,
  },
  {
    id: 'heatmap-global',
    title: 'Global Heatmap',
    subtitle: 'Activity density worldwide',
    icon: <Flame className="w-7 h-7" />,
    gradient: 'from-red-900/60 via-red-950/40 to-gray-950',
    accentColor: 'hover:border-red-500/40',
    href: '/map?mode=heat',
  },
  {
    id: 'pre-modern',
    title: 'Pre-Modern Encounters',
    subtitle: 'Historical sightings before 1900',
    icon: <Compass className="w-7 h-7" />,
    gradient: 'from-indigo-900/60 via-indigo-950/40 to-gray-950',
    accentColor: 'hover:border-indigo-500/40',
    href: '/map?dateTo=1899',
  },
]

function scrollRow(direction: 'left' | 'right') {
  var el = document.getElementById('map-spotlight-row')
  if (el) el.scrollBy({ left: direction === 'left' ? -280 : 280, behavior: 'smooth' })
}

export default function MapSpotlightRow() {
  return (
    <div className="group/section">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2.5">
          <Map className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white">Map Spotlight</h2>
            <p className="text-xs text-gray-500">Explore curated map views</p>
          </div>
        </div>
        <div className="hidden sm:flex gap-1 opacity-0 group-hover/section:opacity-100 transition-opacity">
          <button onClick={function() { scrollRow('left') }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={function() { scrollRow('right') }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable card row */}
      <div className="relative">
        <div
          id="map-spotlight-row"
          className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory pr-8"
        >
          {SPOTLIGHT_CARDS.map(function(card) {
            return (
              <Link
                key={card.id}
                href={card.href}
                className={'min-w-[75vw] sm:min-w-[260px] max-w-[80vw] sm:max-w-[280px] flex-shrink-0 snap-start group/card relative overflow-hidden rounded-xl border border-white/10 ' + card.accentColor + ' transition-all'}
              >
                {/* Gradient background */}
                <div className={'absolute inset-0 bg-gradient-to-br ' + card.gradient} />

                {/* Decorative glow */}
                <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white/5 blur-2xl -translate-y-1/2 translate-x-1/4" />

                {/* Content */}
                <div className="relative p-4 sm:p-5 flex flex-col justify-between h-44 sm:h-48">
                  <div className="flex items-start justify-between">
                    <div className="p-2 rounded-lg bg-white/10 text-white/80 group-hover/card:text-white transition-colors">
                      {card.icon}
                    </div>
                    {card.reportCount != null && (
                      <span className="text-[10px] font-medium text-gray-400 bg-white/5 px-2 py-0.5 rounded-full tabular-nums">
                        {card.reportCount.toLocaleString()} reports
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-semibold text-white group-hover/card:text-white/90 mb-0.5">
                      {card.title}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-gray-400">
                      {card.subtitle}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
        {/* Fade-out edge */}
        <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[#0a0a1a] to-transparent pointer-events-none" />
      </div>
    </div>
  )
}
