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
    <div className="relative mx-auto" style={{ width: '320px', maxWidth: '100%' }}>
      {/* Phone outer frame — thick dark bezel for realistic device feel */}
      <div className="relative rounded-[2.8rem] border-[10px] border-black bg-black shadow-2xl shadow-black/60 overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[110px] h-[26px] bg-black rounded-b-2xl z-10" />

        {/* Screen content */}
        <div className="relative bg-gray-950 aspect-[9/19.5] overflow-hidden">
          {children}
        </div>

        {/* Home indicator */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[100px] h-[4px] bg-gray-700 rounded-full" />
      </div>
    </div>
  )
}
