'use client'

import React from 'react'

/**
 * App Store + Google Play badges with QR code.
 * Badges are non-interactive until native apps are published.
 * QR code links to the PWA at beta.discoverparadocs.com.
 */
export default function AppStoreBadges() {
  return (
    <div className="flex items-center gap-4 sm:gap-6">
      {/* QR Code */}
      <div className="hidden sm:block w-[72px] h-[72px] rounded-lg overflow-hidden bg-white p-1">
        <img
          src="/qr-paradocs.svg"
          alt="Scan to open Paradocs"
          width={64}
          height={64}
          className="w-full h-full"
        />
      </div>

      {/* Badge stack — non-interactive until apps are live */}
      <div className="flex flex-col gap-2">
        {/* Apple App Store */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-black rounded-lg border border-white/20 opacity-80">
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          <div className="flex flex-col">
            <span className="text-[9px] text-gray-400 leading-none">Coming soon on the</span>
            <span className="text-sm font-semibold text-white leading-tight">App Store</span>
          </div>
        </div>

        {/* Google Play */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-black rounded-lg border border-white/20 opacity-80">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92z" fill="#4285F4"/>
            <path d="M17.556 8.236L5.504.678C4.982.37 4.39.264 3.828.37l9.964 9.964 3.764-2.098z" fill="#EA4335"/>
            <path d="M17.556 15.764L13.792 12l3.764-3.764 2.614 1.458a1.09 1.09 0 010 1.898l-2.614 2.172z" fill="#FBBC04"/>
            <path d="M3.828 23.63c.562.106 1.154 0 1.676-.308l12.052-7.558-3.764-3.764L3.828 23.63z" fill="#34A853"/>
          </svg>
          <div className="flex flex-col">
            <span className="text-[9px] text-gray-400 leading-none">Coming soon on</span>
            <span className="text-sm font-semibold text-white leading-tight">Google Play</span>
          </div>
        </div>
      </div>
    </div>
  )
}
