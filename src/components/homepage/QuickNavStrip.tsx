'use client'

import React from 'react'
import Link from 'next/link'
import { Newspaper, Map, BookOpen, FlaskConical } from 'lucide-react'

var navItems = [
  { label: 'Reports', href: '/discover', icon: Newspaper, accent: 'cyan' },
  { label: 'Map', href: '/map', icon: Map, accent: 'green' },
  { label: 'Phenomena', href: '/explore?mode=browse', icon: BookOpen, accent: 'purple' },
  { label: 'Investigate', href: '/lab', icon: FlaskConical, accent: 'orange' },
]

/* Accent color mappings for the subtle tint on each pill */
var accentStyles: Record<string, { border: string; bg: string; glow: string; icon: string; hoverBg: string }> = {
  cyan: {
    border: 'border-cyan-500/20',
    bg: 'bg-cyan-500/5',
    glow: 'group-hover:shadow-cyan-500/10',
    icon: 'text-cyan-400',
    hoverBg: 'group-hover:bg-cyan-500/10',
  },
  green: {
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/5',
    glow: 'group-hover:shadow-emerald-500/10',
    icon: 'text-emerald-400',
    hoverBg: 'group-hover:bg-emerald-500/10',
  },
  purple: {
    border: 'border-primary-500/20',
    bg: 'bg-primary-500/5',
    glow: 'group-hover:shadow-primary-500/10',
    icon: 'text-primary-400',
    hoverBg: 'group-hover:bg-primary-500/10',
  },
  orange: {
    border: 'border-orange-500/20',
    bg: 'bg-orange-500/5',
    glow: 'group-hover:shadow-orange-500/10',
    icon: 'text-orange-400',
    hoverBg: 'group-hover:bg-orange-500/10',
  },
}

export default function QuickNavStrip() {
  return (
    <section className="py-6 md:py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
          {navItems.map(function(item) {
            var Icon = item.icon
            var colors = accentStyles[item.accent]
            return (
              <Link
                key={item.label}
                href={item.href}
                className={'group relative flex items-center gap-2.5 px-5 py-2.5 sm:px-6 sm:py-3 rounded-full border transition-all duration-200 shadow-lg shadow-transparent ' + colors.border + ' ' + colors.bg + ' ' + colors.glow + ' ' + colors.hoverBg + ' hover:border-opacity-40 hover:shadow-lg'}
              >
                <Icon className={'w-4 h-4 sm:w-[18px] sm:h-[18px] transition-colors ' + colors.icon} />
                <span className="text-sm sm:text-[15px] font-medium text-gray-300 group-hover:text-white transition-colors">
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
