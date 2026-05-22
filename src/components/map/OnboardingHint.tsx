/**
 * OnboardingHint — V11.15.1
 *
 * First-visit toast at top of map area. Tells new users:
 *   - Click a cluster to expand
 *   - Drag to pan, pinch to zoom
 *   - Toggle layers via the right toolbar
 *
 * Dismisses automatically after 8s OR on first map interaction OR on
 * tap of the X button. localStorage flag prevents reappearance for
 * returning users.
 *
 * Per SME panel Persona F (Growth UX): time-to-first-cluster-click is
 * the activation metric. This hint shortens that path for first-time
 * visitors.
 *
 * Renders ABOVE the map area but BELOW the page header / mode tabs.
 * Animated fade-in on mount; fade-out before unmount.
 */

import React, { useEffect, useState } from 'react'
import { X, MousePointer2, Compass } from 'lucide-react'

interface OnboardingHintProps {
  /** localStorage key for "I've dismissed this". Default 'paradocs.map.onboarded'. */
  storageKey?: string
  /** Milliseconds before auto-dismiss. Default 8000. */
  autoDismissMs?: number
}

const DEFAULT_STORAGE_KEY = 'paradocs.map.onboarded'

export default function OnboardingHint({ storageKey = DEFAULT_STORAGE_KEY, autoDismissMs = 8000 }: OnboardingHintProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  // Mount check: only show if storage key isn't set.
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const seen = window.localStorage.getItem(storageKey)
      if (!seen) {
        // Small delay so the toast feels intentional, not jarring.
        const t = setTimeout(() => setVisible(true), 400)
        return () => clearTimeout(t)
      }
    } catch (_e) {
      // localStorage unavailable (private mode, etc.) — don't show.
    }
  }, [storageKey])

  // Auto-dismiss timer.
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => dismiss(), autoDismissMs)
    return () => clearTimeout(t)
  }, [visible, autoDismissMs])

  // Dismiss on first map interaction (pointer/touch event anywhere on
  // map area). Listens at the document level since we can't easily
  // attach to MapLibre's canvas from here.
  useEffect(() => {
    if (!visible) return
    let dismissed = false
    function onInteract(_e: Event) {
      if (dismissed) return
      dismissed = true
      dismiss()
    }
    window.addEventListener('mousedown', onInteract, { once: true })
    window.addEventListener('touchstart', onInteract, { once: true })
    window.addEventListener('keydown', onInteract, { once: true })
    return () => {
      window.removeEventListener('mousedown', onInteract)
      window.removeEventListener('touchstart', onInteract)
      window.removeEventListener('keydown', onInteract)
    }
  }, [visible])

  function dismiss() {
    setExiting(true)
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, '1')
      }
    } catch (_e) {}
    // Wait for the fade-out animation to complete before unmounting.
    setTimeout(() => setVisible(false), 220)
  }

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Map quick start tips"
      className={
        'absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-md w-[calc(100%-2rem)] sm:w-auto bg-gray-950/95 backdrop-blur-lg border border-purple-500/30 rounded-xl shadow-2xl shadow-purple-500/15 px-4 py-3 transition-all duration-200 ' +
        (exiting ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0')
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-purple-500/15 flex items-center justify-center mt-0.5">
          <Compass size={17} className="text-purple-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white mb-1">Quick start</div>
          <div className="text-[12px] text-gray-300 leading-relaxed">
            <span className="inline-flex items-center gap-1 mr-3">
              <MousePointer2 size={11} className="text-gray-400" />
              <span>Click a cluster to expand</span>
            </span>
            <span className="text-gray-500 hidden sm:inline">·</span>
            <span className="sm:inline block mt-1 sm:mt-0 sm:ml-3 text-gray-400">Drag to pan, pinch to zoom</span>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="flex-shrink-0 -mt-1 -mr-1 w-7 h-7 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex items-center justify-center"
          aria-label="Dismiss quick start"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
