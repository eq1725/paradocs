/**
 * QuickActions — Horizontal scroll row of action pills.
 *
 * Replaces the old hero CTAs with a faster, more useful set of
 * navigation shortcuts. Each pill is a Link with an icon.
 *
 * Mobile: horizontal scroll with touch-pan-x.
 * Desktop: flex-wrap, all visible.
 */

import React from 'react'
import Link from 'next/link'
import {
  Compass,
  Search,
  Sparkles,
  Bookmark,
  MessageCircle,
} from 'lucide-react'

var actions = [
  { href: '/explore', label: 'Browse Cases', icon: Compass, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { href: '/search', label: 'Search', icon: Search, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  { href: '/ask', label: 'Ask the Unknown', icon: MessageCircle, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  { href: '/dashboard/research-hub', label: 'Research Hub', icon: Sparkles, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
  { href: '/dashboard/saved', label: 'Saved', icon: Bookmark, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
]

export default function QuickActions() {
  return (
    <div className="flex gap-2 overflow-x-auto sm:overflow-x-visible sm:flex-wrap scrollbar-hide touch-pan-x pb-1 sm:pb-0">
      {actions.map(function(action) {
        var Icon = action.icon
        return (
          <Link
            key={action.href}
            href={action.href}
            className={'flex items-center gap-1.5 px-3 py-2 border rounded-full text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 hover:brightness-125 ' + action.bg}
          >
            <Icon className={'w-3.5 h-3.5 ' + action.color} />
            <span className="text-gray-200">{action.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
