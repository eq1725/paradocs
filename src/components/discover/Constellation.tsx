'use client'

/**
 * Constellation — blurred SVG node-and-line visualization
 * Used as a visual paywall hint below expanded case summaries.
 * Represents Paradocs's "Constellation" premium tier.
 */

import React from 'react'

var NODES = [
  { x: 50, y: 50, r: 5 },
  { x: 22, y: 28, r: 3.5 },
  { x: 78, y: 24, r: 4 },
  { x: 34, y: 76, r: 3.5 },
  { x: 72, y: 78, r: 4.5 },
  { x: 14, y: 62, r: 3 },
  { x: 88, y: 58, r: 3.5 },
  { x: 56, y: 14, r: 3 },
]

var LINES: number[][] = [
  [0, 1], [0, 2], [0, 3], [0, 4],
  [1, 5], [2, 7], [4, 6], [3, 5], [2, 4],
]

export function Constellation() {
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: 'rgba(212,175,55,0.04)' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: 90, filter: 'blur(3.5px)' }}>
        {LINES.map(function (pair, i) {
          var a = pair[0]
          var b = pair[1]
          return (
            <line
              key={'l' + i}
              x1={NODES[a].x}
              y1={NODES[a].y}
              x2={NODES[b].x}
              y2={NODES[b].y}
              stroke="rgba(212,175,55,0.5)"
              strokeWidth="0.7"
            />
          )
        })}
        {NODES.map(function (n, i) {
          return (
            <circle
              key={'n' + i}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill="rgba(212,175,55,0.8)"
            />
          )
        })}
      </svg>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        background: 'rgba(0,0,0,0.3)',
      }}>
        <span style={{ color: '#d4af37', fontSize: 13 }}>{'\u2726'}</span>
        <span style={{ color: '#d4af37', fontSize: 9.5, fontFamily: "'Courier New',monospace", letterSpacing: 2.5, textTransform: 'uppercase' as const }}>
          Constellation
        </span>
        <span style={{ color: 'rgba(255,255,255,0.32)', fontSize: 8, fontFamily: "'Courier New',monospace" }}>
          Full case files & connections
        </span>
      </div>
    </div>
  )
}
