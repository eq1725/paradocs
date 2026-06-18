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
import { Map, Flame, Compass, ChevronLeft, ChevronRight, Clock, Sparkles, Globe, MapPin } from 'lucide-react'
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
  ufos_aliens_us: number
  cryptids: number
  ghosts_hauntings: number
  preModern: number
  consciousness: number
  psychological: number
  psychic: number
  esoteric: number
  modern: number
  recent: number
  uk_ghosts: number
  canada: number
  australia: number
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
  // V11.18.49 — Categories not yet featured.
  {
    id: 'altered-states',
    title: 'Altered States',
    subtitle: 'Lucid dreaming, OBE, meditation',
    icon: <CategoryIcon category="consciousness_practices" size={28} />,
    gradient: 'from-teal-900/60 via-teal-950/40 to-gray-950',
    accentColor: 'hover:border-teal-500/40',
    href: '/explore?mode=map&category=consciousness_practices',
    countFor: function(c) { return c.consciousness },
  },
  {
    id: 'minds-edge',
    title: "The Mind's Edge",
    subtitle: 'Sleep paralysis, NDE, missing time',
    icon: <CategoryIcon category="psychological_experiences" size={28} />,
    gradient: 'from-rose-900/60 via-rose-950/40 to-gray-950',
    accentColor: 'hover:border-rose-500/40',
    href: '/explore?mode=map&category=psychological_experiences',
    countFor: function(c) { return c.psychological },
  },
  {
    id: 'psychic',
    title: 'Psychic Phenomena',
    subtitle: 'Premonitions, telepathy, ESP',
    icon: <CategoryIcon category="psychic_phenomena" size={28} />,
    gradient: 'from-violet-900/60 via-violet-950/40 to-gray-950',
    accentColor: 'hover:border-violet-500/40',
    href: '/explore?mode=map&category=psychic_phenomena',
    countFor: function(c) { return c.psychic },
  },
  {
    id: 'esoteric',
    title: 'Esoteric & Occult',
    subtitle: 'Ritual, divination, magic',
    icon: <CategoryIcon category="esoteric_practices" size={28} />,
    gradient: 'from-fuchsia-900/60 via-fuchsia-950/40 to-gray-950',
    accentColor: 'hover:border-fuchsia-500/40',
    href: '/explore?mode=map&category=esoteric_practices',
    countFor: function(c) { return c.esoteric },
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
  // V11.18.49 — Era ladder (Recent → Modern → Pre-Modern).
  {
    id: 'recent-activity',
    title: 'Recent Activity',
    subtitle: 'Sightings since 2015',
    icon: <Sparkles className="w-7 h-7" />,
    gradient: 'from-emerald-900/60 via-emerald-950/40 to-gray-950',
    accentColor: 'hover:border-emerald-500/40',
    href: '/explore?mode=map&dateFrom=2015',
    countFor: function(c) { return c.recent },
  },
  {
    id: 'modern-era',
    title: 'Modern Era',
    subtitle: '1900 to today',
    icon: <Clock className="w-7 h-7" />,
    gradient: 'from-slate-800/60 via-slate-950/40 to-gray-950',
    accentColor: 'hover:border-slate-400/40',
    href: '/explore?mode=map&dateFrom=1900',
    countFor: function(c) { return c.modern },
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
  // V11.18.49 — Regional.
  {
    id: 'haunted-britain',
    title: 'Haunted Britain',
    subtitle: 'United Kingdom hauntings',
    icon: <CategoryIcon category="ghosts_hauntings" size={28} />,
    gradient: 'from-purple-900/60 via-purple-950/40 to-gray-950',
    accentColor: 'hover:border-purple-500/40',
    href: '/explore?mode=map&category=ghosts_hauntings&country=United+Kingdom',
    countFor: function(c) { return c.uk_ghosts },
  },
  {
    id: 'canada',
    title: 'Canada',
    subtitle: 'Encounters nationwide',
    icon: <MapPin className="w-7 h-7" />,
    gradient: 'from-red-900/60 via-rose-950/40 to-gray-950',
    accentColor: 'hover:border-rose-500/40',
    href: '/explore?mode=map&country=Canada',
    countFor: function(c) { return c.canada },
  },
  {
    id: 'australia',
    title: 'Australia',
    subtitle: 'Encounters nationwide',
    icon: <Globe className="w-7 h-7" />,
    gradient: 'from-orange-900/60 via-orange-950/40 to-gray-950',
    accentColor: 'hover:border-orange-500/40',
    href: '/explore?mode=map&country=Australia',
    countFor: function(c) { return c.australia },
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
  // Keyed so each bucket maps unambiguously to its query (all parallel HEAD counts).
  var q: Record<string, any> = {
    total: approvedHead(),
    ufos_aliens_us: approvedHead().eq('category', 'ufos_aliens').eq('country', 'United States'),
    cryptids: approvedHead().eq('category', 'cryptids'),
    ghosts_hauntings: approvedHead().eq('category', 'ghosts_hauntings'),
    preModern: approvedHead().lt('event_date', '1900-01-01'),
    consciousness: approvedHead().eq('category', 'consciousness_practices'),
    psychological: approvedHead().eq('category', 'psychological_experiences'),
    psychic: approvedHead().eq('category', 'psychic_phenomena'),
    esoteric: approvedHead().eq('category', 'esoteric_practices'),
    modern: approvedHead().gte('event_date', '1900-01-01'),
    recent: approvedHead().gte('event_date', '2015-01-01'),
    uk_ghosts: approvedHead().eq('category', 'ghosts_hauntings').eq('country', 'United Kingdom'),
    canada: approvedHead().eq('country', 'Canada'),
    australia: approvedHead().eq('country', 'Australia'),
  }
  var keys = Object.keys(q)
  var results = await Promise.all(keys.map(function(k) { return q[k] }))
  var out: Record<string, number> = {}
  keys.forEach(function(k, i) { out[k] = results[i].count || 0 })
  return out as unknown as SpotlightCounts
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
