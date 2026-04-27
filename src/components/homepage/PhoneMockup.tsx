'use client'

import React from 'react'

interface PhoneMockupProps {
  children: React.ReactNode
}

/**
 * Realistic phone frame for homepage showcase sections.
 * Renders children inside a dark phone bezel with rounded corners,
 * notch, and subtle shadow — styled to match AllTrails homepage pattern.
 */
export default function PhoneMockup({ children }: PhoneMockupProps) {
  return (
    <div className="relative mx-auto" style={{ width: '280px', maxWidth: '100%' }}>
      {/* Phone outer frame */}
      <div className="relative rounded-[2.5rem] border-[6px] border-gray-800 bg-gray-900 shadow-2xl shadow-black/50 overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-gray-800 rounded-b-2xl z-10" />

        {/* Screen content */}
        <div className="relative bg-gray-950 aspect-[9/19.5] overflow-hidden">
          {children}
        </div>

        {/* Home indicator */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[100px] h-[4px] bg-gray-600 rounded-full" />
      </div>
    </div>
  )
}
