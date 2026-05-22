/**
 * MapSpotlightRow — Horizontal-scroll row of curated map view cards
 *
 * Each card deep-links to /explore?mode=map with pre-set filters.
 * Renders on the Explore Discover feed to draw users into the map.
 *
 * V11.14.7 — Counts now fetched live from Supabase on mount instead of
 * hardcoded. URL params aligned with useMapState (heatmap=true, not
 * heat=true). Clicking a card applies the filter correctly because
 * useMapState is URL-driven.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Map, Flame, Compass, ChevronLeft, ChevronRight } from 'lucide-react'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { supabase } from '@/lib/supabase'

interface SpotlightCard {
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  gradient: string
  accentColor: string
  href: string
  // Function that, given the live count map, returns the count for this card.
  countFor: (counts: SpotlightCounts) => number | undefined
}

interface SpotlightCounts {
  total: number
  ufos_aliens: number
  ufos_aliens_us: number
  cryptids: number
  ghosts_hauntings: number
  preModern: number
}

// V11.14.7 — Card defs. `countFor` resolves against the live counts map
// fetched on mount.
var SPOTLIGHT_CARDS: SpotlightCard[] = [
  {
    id: 'ufo-hotspots-us',
    title: 'UFO Hotspots',
    subtitle: 'United States',
    icon: <CategoryIcon category="ufos_aliens" size={28} />,
    gradient: 'from-green-900/60 via-green-950/40 to-gray-950',
    accentColor: 'hover:border-green-500/40',
    href: '/explore?mode=map&category=ufos_aliens&country=United+States',
    countFor: function(c) { return c.ufos_aliens_us },
  },
  {
    id: 'cryptid-sightings',
    title: 'Cryptid Sightings',
    subtitle: 'Worldwide encounters',
    icon: <CategoryIcon category="cryptids" size={28} />,
    gradient: 'from-amber-900/60 via-amber-950/40 to-gray-950',
    accentColor: 'hover:border-amber-500/40',
    href: '/explore?mode=map&category=cryptids',
    countFor: function(c) { return c.cryptids },
  },
  {
    id: 'ghost-hauntings',
    title: 'Ghost & Hauntings',
    subtitle: 'Paranormal activity map',
    icon: <CategoryIcon category="ghosts_hauntings" size={28} />,
    gradient: 'from-purple-900/60 via-purple-950/40 to-gray-950',
    accentColor: 'hover:border-purple-500/40',
    href: '/explore?mode=map&category=ghosts_hauntings',
    countFor: function(c) { return c.ghosts_hauntings },
  },
  {
    id: 'heatmap-global',
    title: 'Global Heatmap',
    subtitle: 'Activity density worldwide',
    icon: <Flame className="w-7 h-7" />,
    gradient: 'from-red-900/60 via-red-950/40 to-gray-950',
    accentColor: 'hover:border-red-500/40',
    // V11.14.7 — was 'heat=true' which useMapState ignores.
    href: '/explore?mode=map&heatmap=true',
    countFor: function(c) { return c.total },
  },
  {
    id: 'pre-modern',
    title: 'Pre-Modern Encounters',
    subtitle: 'Historical sightings before 1900',
    icon: <Compass className="w-7 h-7" />,
    gradient: 'from-indigo-900/60 via-indigo-950/40 to-gray-950',
    accentColor: 'hover:border-indigo-500/40',
    href: '/explore?mode=map&dateTo=1899',
    countFor: function(c) { return c.preModern },
  },
]

function scrollRow(direction: 'left' | 'right') {
  var el = document.getElementById('map-spotlight-row')
  if (el) el.scrollBy({ left: direction === 'left' ? -280 : 280, behavior: 'smooth' })
}

// Fetch all six count buckets in parallel. Each is a HEAD count query
// against approved reports, so DB returns just a number, not rows.
async function fetchSpotlightCounts(): Promise<SpotlightCounts> {
  function approvedHead() {
    return supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'approved')
  }
  var queries = [
    approvedHead(),
    approvedHead().eq('category', 'ufos_aliens'),
    approvedHead().eq('category', 'ufos_aliens').eq('country', 'United States'),
    approvedHead().eq('category', 'cryptids'),
    approvedHead().eq('category', 'ghosts_hauntings'),
    approvedHead().lt('event_date', '1900-01-01'),
  ]
  var results = await Promise.all(queries)
  return {
    total: results[0].count || 0,
    ufos_aliens: results[1].count || 0,
    ufos_aliens_us: results[2].count || 0,
    cryptids: results[3].count || 0,
    ghosts_hauntings: results[4].count || 0,
    preModern: results[5].count || 0,
  }
}

export default function MapSpotlightRow() {
  var [counts, setCounts] = useState<SpotlightCounts | null>(null)
  var [loading, setLoading] = useState(true)

  useEffect(function() {
    var cancelled = false
    fetchSpotlightCounts()
      .then(function(c) { if (!cancelled) { setCounts(c); setLoading(false) } })
      .catch(function(_e) { if (!cancelled) setLoading(false) })
    return function() { cancelled = true }
  }, [])

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
            var liveCount = counts ? card.countFor(counts) : undefined
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
                    {/* V11.14.7 — Live count from DB. Skeleton bar while
                        loading; absent if the bucket genuinely has 0
                        (don't show "0 reports" — that's a bad signal). */}
                    {loading ? (
                      <span className="text-[10px] font-medium text-gray-500 bg-white/5 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <span className="inline-block w-8 h-2 bg-white/10 rounded animate-pulse" />
                      </span>
                    ) : liveCount != null && liveCount > 0 ? (
                      <span className="text-[10px] font-medium text-gray-400 bg-white/5 px-2 py-0.5 rounded-full tabular-nums">
                        {liveCount.toLocaleString()} {liveCount === 1 ? 'report' : 'reports'}
                      </span>
                    ) : null}
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
