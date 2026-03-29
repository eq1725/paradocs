'use client'

/**
 * Constellation — blurred SVG node-and-line visualization
 * Used as a visual paywall hint below expanded case summaries.
 * Uses site primary color (#9000F0 / primary-500).
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
    <div className="relative rounded-xl overflow-hidden bg-primary-500/[0.04]">
      <svg viewBox="0 0 100 100" className="w-full" style={{ height: 90, filter: 'blur(3.5px)' }}>
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
              stroke="rgba(144,0,240,0.4)"
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
              fill="rgba(144,0,240,0.6)"
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30">
        <span className="text-primary-400 text-sm">{'\u2726'}</span>
        <span className="text-primary-400 text-[9px] font-sans font-semibold uppercase tracking-widest">
          Constellation
        </span>
        <span className="text-gray-500 text-[8px] font-sans">
          Full case files & connections
        </span>
      </div>
    </div>
  )
}
