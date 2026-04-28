'use client'

import React, { useState, useEffect, useRef } from 'react'

interface LaptopMockupProps {
  children: React.ReactNode
}

/**
 * Realistic laptop frame for homepage showcase sections.
 *
 * Uses a high-fidelity vector device frame (metallic hinge, keyboard deck,
 * trackpad, webcam) with a transparent screen area. Screen content is
 * positioned underneath the frame overlay at the exact screen coordinates.
 *
 * Includes scroll-triggered fade-up entrance animation via IntersectionObserver.
 *
 * TODO: Replace static placeholder content with looped video capture.
 */
export default function LaptopMockup({ children }: LaptopMockupProps) {
  var [isVisible, setIsVisible] = useState(false)
  var ref = useRef<HTMLDivElement>(null)

  useEffect(function() {
    if (!ref.current) return
    var observer = new IntersectionObserver(
      function(entries) {
        if (entries[0].isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(ref.current)
    return function() { observer.disconnect() }
  }, [])

  return (
    <div
      ref={ref}
      className="relative mx-auto transition-all duration-700 ease-out"
      style={{
        width: '560px',
        maxWidth: '100%',
        aspectRatio: '440 / 257',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
      }}
    >
      {/* Screen content — positioned at exact screen coordinates within the frame */}
      <div
        className="absolute overflow-hidden bg-gray-950"
        style={{
          left: '12.0%',
          top: '5.7%',
          width: '76.0%',
          height: '80.5%',
        }}
      >
        {children}
      </div>

      {/* Realistic device frame overlay — transparent screen area */}
      <img
        src="/device-laptop.svg"
        alt=""
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        draggable={false}
      />

      {/* Subtle shadow cast beneath the device */}
      <div
        className="absolute -bottom-3 left-[15%] right-[15%] h-6 rounded-full blur-xl"
        style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.35) 0%, transparent 70%)' }}
      />
    </div>
  )
}
