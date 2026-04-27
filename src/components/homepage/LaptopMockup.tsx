'use client'

import React from 'react'

interface LaptopMockupProps {
  children: React.ReactNode
}

/**
 * Realistic laptop frame for homepage showcase sections.
 * Renders children inside a dark laptop screen with bezel,
 * webcam dot, and keyboard base — mirrors the PhoneMockup pattern.
 *
 * TODO: Replace static placeholder content with looped video capture.
 */
export default function LaptopMockup({ children }: LaptopMockupProps) {
  return (
    <div className="relative mx-auto" style={{ width: '560px', maxWidth: '100%' }}>
      {/* Screen + bezel */}
      <div className="relative rounded-xl border-[4px] border-gray-700 bg-gray-800 shadow-2xl shadow-black/50 overflow-hidden">
        {/* Webcam dot */}
        <div className="absolute top-[5px] left-1/2 -translate-x-1/2 w-[6px] h-[6px] rounded-full bg-gray-600 z-10" />

        {/* Screen content */}
        <div className="relative bg-gray-950 aspect-[16/10] overflow-hidden mt-[2px]">
          {children}
        </div>
      </div>

      {/* Keyboard base / hinge */}
      <div className="relative mx-auto">
        {/* Hinge strip */}
        <div className="h-[6px] bg-gradient-to-b from-gray-600 to-gray-700 rounded-b-sm mx-[2px]" />
        {/* Keyboard deck */}
        <div
          className="h-[10px] bg-gray-700 rounded-b-xl mx-auto"
          style={{ width: '108%', marginLeft: '-4%' }}
        />
        {/* Bottom edge / feet */}
        <div
          className="h-[3px] bg-gray-800 rounded-b-xl mx-auto"
          style={{ width: '40%' }}
        />
      </div>
    </div>
  )
}
