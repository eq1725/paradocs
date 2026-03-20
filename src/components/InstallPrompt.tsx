/**
 * InstallPrompt — PWA "Add to Home Screen" prompt
 *
 * Android: intercepts beforeinstallprompt, shows button, triggers native dialog
 * iOS Safari: shows instructional UI (tap Share → Add to Home Screen)
 * Desktop: hidden
 * Already installed (standalone): hidden
 * Already dismissed: hidden (localStorage flag)
 */

import React from 'react'
import { Smartphone, X } from 'lucide-react'
import { useInstallPrompt } from '@/lib/hooks/useInstallPrompt'

export default function InstallPrompt() {
  var install = useInstallPrompt()

  if (!install.isInstallable) return null

  // iOS Safari instructions
  if (install.showIOSInstructions) {
    return (
      <div className="mt-6 mx-auto max-w-sm">
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center relative">
          <button
            onClick={install.dismissPrompt}
            className="absolute top-2 right-2 p-1 text-gray-500 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
          <p className="text-sm text-gray-300 mb-2">To add Paradocs to your home screen:</p>
          <p className="text-sm text-white">
            {'Tap '}
            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-primary-500/20 text-primary-400 text-xs align-middle mx-1">
              {/* Safari share icon approximation */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </span>
            {' then "Add to Home Screen"'}
          </p>
        </div>
      </div>
    )
  }

  // Android / default: show install button
  return (
    <div className="mt-6 text-center">
      <button
        onClick={install.promptInstall}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
      >
        <Smartphone className="w-4 h-4" />
        Add Paradocs to your home screen
      </button>
      <button
        onClick={install.dismissPrompt}
        className="ml-2 text-xs text-gray-600 hover:text-gray-400 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5 inline" />
      </button>
    </div>
  )
}
