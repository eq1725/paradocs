/**
 * InstallPrompt — PWA "Add to Home Screen" prompt
 *
 * Android: intercepts beforeinstallprompt, shows button, triggers native dialog
 * iOS Safari: shows 4-step instructional UI (More → Share → View More → Add to Home Screen)
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

  // iOS Safari: 4-step instructions
  if (install.showIOSInstructions) {
    return (
      <div className="mt-6 mx-auto max-w-sm">
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 relative">
          <button
            onClick={install.dismissPrompt}
            className="absolute top-2 right-2 p-1 text-gray-500 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
          <p className="text-sm font-medium text-white mb-3 text-center">Add Paradocs to your home screen</p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-500/20 text-primary-400 text-xs font-bold flex items-center justify-center">1</span>
              <p className="text-sm text-gray-300">
                {'Tap '}
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-700 text-white text-xs align-middle mx-0.5 font-bold">{'\u2026'}</span>
                {' (More) in your browser toolbar'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-500/20 text-primary-400 text-xs font-bold flex items-center justify-center">2</span>
              <p className="text-sm text-gray-300">
                {'Tap '}
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-700 align-middle mx-0.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                </span>
                {' Share'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-500/20 text-primary-400 text-xs font-bold flex items-center justify-center">3</span>
              <p className="text-sm text-gray-300">Scroll down and tap <span className="text-white font-medium">Add to Home Screen</span></p>
            </div>
          </div>
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
