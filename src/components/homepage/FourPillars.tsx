'use client'

import React from 'react'
import Link from 'next/link'
import { Database, Sparkles, LayoutDashboard, Flame } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface PillarCardProps {
  icon: React.ReactNode
  title: string
  description: string
  ctaText: string
  ctaHref: string
  badge?: string
}

function PillarCard({ icon, title, description, ctaText, ctaHref, badge }: PillarCardProps) {
  return (
    <Link href={ctaHref} className="block h-full group">
      <div className={classNames(
        'glass-card p-6 h-full flex flex-col rounded-xl',
        'border border-white/10',
        'hover:border-white/20 hover:bg-white/[0.08] transition-all duration-300',
        'hover:shadow-lg hover:shadow-primary-500/10',
        'min-h-[280px] md:min-h-[320px]'
      )}>
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary-500/20 to-purple-500/20 flex items-center justify-center text-primary-400 group-hover:scale-110 transition-transform">
            {icon}
          </div>
          {badge && (
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              {badge}
            </span>
          )}
        </div>

        <h3 className="text-lg font-semibold text-white mb-2">
          {title}
        </h3>

        <p className="text-sm text-gray-400 flex-grow mb-4">
          {description}
        </p>

        <div className="inline-flex items-center text-sm font-medium text-primary-400 group-hover:text-primary-300 transition-colors">
          {ctaText}
          <svg className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  )
}

export default function FourPillars() {
  var pillars = [
    {
      icon: <Database className="w-6 h-6" />,
      title: 'The Database',
      description: 'Every UFO sighting, cryptid encounter, ghost report, and unexplained event\u2014aggregated from thousands of sources and filtered by AI for credibility. Search by location, date, phenomenon type, or keywords across the largest paranormal database ever assembled.',
      ctaText: 'Search the database',
      ctaHref: '/explore',
      badge: undefined
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: 'AI Intelligence',
      description: 'Our AI reads every report so you don\u2019t have to. It cross-references sightings across time and geography to surface patterns invisible to any single researcher\u2014clustering hotspots, linking similar encounters, and flagging anomalies that deserve a closer look.',
      ctaText: 'Uncover patterns',
      ctaHref: '/insights',
      badge: undefined
    },
    {
      icon: <LayoutDashboard className="w-6 h-6" />,
      title: 'Research Workspace',
      description: 'Build case files, collect evidence, and visualize connections with the Constellation graph. Whether you\u2019re tracking a local legend or mapping a nationwide wave, this is your command center for serious investigation.',
      ctaText: 'Build a case file',
      ctaHref: '/dashboard',
      badge: 'Pro'
    },
    {
      icon: <Flame className="w-6 h-6" />,
      title: 'Discover Feed',
      description: 'Not sure where to start? Swipe through encounters handpicked from the database\u2014Bigfoot tracks in the Pacific Northwest, black triangles over military bases, apparitions in century-old homes. Every card is a rabbit hole waiting to happen.',
      ctaText: 'Start swiping',
      ctaHref: '/discover',
      badge: undefined
    }
  ]

  return (
    <section className="py-10 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-sm text-gray-500 uppercase tracking-wider mb-6">Four ways to explore</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {pillars.map(function(pillar, index) {
            return (
              <PillarCard
                key={index}
                icon={pillar.icon}
                title={pillar.title}
                description={pillar.description}
                ctaText={pillar.ctaText}
                ctaHref={pillar.ctaHref}
                badge={pillar.badge}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}
