'use client'

import React from 'react'
import Link from 'next/link'
import { Newspaper, Map, BookOpen, FlaskConical } from 'lucide-react'

var navItems = [
  { label: 'Reports', href: '/discover', icon: Newspaper, description: 'Browse the feed' },
  { label: 'Map', href: '/map', icon: Map, description: 'Explore sightings' },
  { label: 'Phenomena', href: '/explore?mode=browse', icon: BookOpen, description: 'Encyclopedia' },
  { label: 'Investigate', href: '/lab', icon: FlaskConical, description: 'Research tools' },
]

export default function QuickNavStrip() {
  return (
    <section className="py-4 border-t border-b border-white/5">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-4 gap-2 sm:gap-4">
          {navItems.map(function(item) {
            var Icon = item.icon
            return (
              <Link
                key={item.label}
                href={item.href}
                className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl hover:bg-white/5 transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center group-hover:bg-primary-500/20 transition-colors">
                  <Icon className="w-5 h-5 text-primary-400" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
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
