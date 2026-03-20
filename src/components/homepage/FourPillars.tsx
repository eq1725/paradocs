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
        'hover:shadow-lg hover:shadow-primary-500/10'
      )}>
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary-500/20 to-purple-500/20 flex items-center justify-center text-primary-400 group-hover:scale-110 transition-transform">
            {icon}
          </div>
          {badge && (
            <span className="px-2 py-1 text-xs font-medium bg-primary-500/20 text-primary-400 rounded-full">
              {badge}
            </span>
          )}
        </div>

        <h3 className="text-lg font-semibold text-white mb-2">
          {title}
        </h3>

        <p className="text-sm text-gray-400 flex-grow mb-4 line-clamp-2">
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
      description: 'Millions of sources scanned. AI-filtered for credibility. The most comprehensive paranormal database ever built.',
      ctaText: 'Explore',
      ctaHref: '/explore',
      badge: undefined
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: 'AI Intelligence',
      description: 'Cross-reference millions of reports to surface patterns no human could find. Geographic clusters, temporal spikes, phenomena connections.',
      ctaText: 'View Insights',
      ctaHref: '/insights',
      badge: undefined
    },
    {
      icon: <LayoutDashboard className="w-6 h-6" />,
      title: 'Research Workspace',
      description: 'Case files, evidence collection, Constellation graph. Your command center for the unexplained.',
      ctaText: 'Access Dashboard',
      ctaHref: '/dashboard',
      badge: 'Pro'
    },
    {
      icon: <Flame className="w-6 h-6" />,
      title: 'Discover Feed',
      description: 'Swipe through the unknown. Bigfoot to black triangles, ghost encounters to government files.',
      ctaText: 'Start Swiping',
      ctaHref: '/discover',
      badge: undefined
    }
  ]

  return (
    <section className="py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-4">
            What Is Paradocs?
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Four pillars of paranormal research and investigation, powered by AI and community intelligence.
          </p>
        </div>

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
