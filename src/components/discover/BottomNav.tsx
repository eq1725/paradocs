'use client'

/**
 * BottomNav — mobile-first bottom navigation bar
 *
 * Shows on the Discover page (and eventually all mobile pages).
 * Four tabs: Discover, Database, Saved, Profile.
 * Fixed to bottom, respects safe area insets.
 *
 * SWC-compatible: var, function expressions, string concat.
 */

import React from 'react'
import Link from 'next/link'

var NAV_ITEMS = [
  { icon: '\u25C9', label: 'Discover', href: '/discover', key: 'discover' },
  { icon: '\u2588\u2588', label: 'Database', href: '/phenomena', key: 'database' },
  { icon: '\u2661', label: 'Saved', href: '/dashboard', key: 'saved' },
  { icon: '\u2726', label: 'Profile', href: '/dashboard', key: 'profile' },
]

export function BottomNav(props: { active?: string }) {
  var activeKey = props.active || 'discover'

  return (
    <div style={{
      padding: '11px 0 18px',
      display: 'flex',
      justifyContent: 'space-around',
      flexShrink: 0,
      zIndex: 10,
      borderTop: '1px solid rgba(255,255,255,0.05)',
      background: 'rgba(9,9,15,0.95)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      paddingBottom: 'max(18px, env(safe-area-inset-bottom))',
    }}>
      {NAV_ITEMS.map(function (item) {
        var isActive = item.key === activeKey
        return (
          <Link key={item.key} href={item.href} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            textDecoration: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{
              fontSize: 15,
              color: isActive ? '#d4af37' : 'rgba(255,255,255,0.25)',
              transition: 'color 0.2s',
            }}>
              {item.icon}
            </span>
            <span style={{
              fontSize: 7.5,
              color: isActive ? '#d4af37' : 'rgba(255,255,255,0.25)',
              fontFamily: "'Courier New',monospace",
              letterSpacing: 0.5,
              transition: 'color 0.2s',
            }}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
