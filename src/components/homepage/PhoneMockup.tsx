'use client'

import React, { useState, useEffect, useRef } from 'react'

interface PhoneMockupProps {
  children: React.ReactNode
}

/**
 * Realistic phone frame for homepage showcase sections.
 *
 * Uses a high-fidelity vector device frame (metallic bezel, notch, camera,
 * side buttons) with a transparent screen area. Screen content is positioned
 * underneath the frame overlay at the exact screen coordinates.
 *
 * Includes scroll-triggered fade-up entrance animation via IntersectionObserver.
 */
export default function PhoneMockup({ children }: PhoneMockupProps) {
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
        width: '360px',
        maxWidth: '100%',
        aspectRatio: '92 / 170',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
      }}
    >
      {/* Screen content — positioned at exact screen coordinates within the frame */}
      <div
        className="absolute overflow-hidden bg-gray-950"
        style={{
          left: '11.7%',
          top: '5.4%',
          width: '76.5%',
          height: '88.7%',
          borderRadius: '3.2%',
        }}
      >
        {children}
      </div>

      {/* Realistic device frame overlay — transparent screen area */}
      <img
        src="/device-phone.svg"
        alt=""
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        draggable={false}
      />

      {/* Subtle shadow cast beneath the device */}
      <div
        className="absolute -bottom-4 left-[10%] right-[10%] h-8 rounded-full blur-xl"
        style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.4) 0%, transparent 70%)' }}
      />
    </div>
  )
}
