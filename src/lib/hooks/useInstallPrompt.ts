/**
 * useInstallPrompt — PWA "Add to Home Screen" install prompt hook
 *
 * IMPORTANT: The beforeinstallprompt event fires EARLY — often before React
 * mounts. We capture it globally on window so it's never missed, then the
 * hook reads from the global when it mounts.
 */

import { useState, useEffect, useCallback } from 'react'

var DISMISS_KEY = 'paradocs_a2hs_dismissed'

// Global capture — runs immediately on import, before any React mounts.
// This ensures we never miss the beforeinstallprompt event.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    (window as any).__pwaPromptEvent = e
  })
}

interface InstallPromptResult {
  isInstallable: boolean
  isIOS: boolean
  isInstalled: boolean
  isDesktop: boolean
  promptInstall: () => void
  dismissPrompt: () => void
  showIOSInstructions: boolean
}

export function useInstallPrompt(): InstallPromptResult {
  var [installable, setInstallable] = useState(false)
  var [showIOSInstructions, setShowIOSInstructions] = useState(false)
  var [dismissed, setDismissed] = useState(false)

  // Detect platform (safe for SSR — all default to false)
  var isServer = typeof window === 'undefined'
  var ua = isServer ? '' : navigator.userAgent || ''
  var isIOS = !isServer && /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
  var isCriOS = ua.indexOf('CriOS') > -1
  var isIOSSafari = isIOS && !isCriOS
  var isStandalone = !isServer && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
  var isMobile = !isServer && /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  var isDesktop = !isServer && !isMobile

  useEffect(function() {
    if (isServer || isStandalone || isDesktop) return

    // Check if already dismissed
    if (localStorage.getItem(DISMISS_KEY) === 'true') {
      setDismissed(true)
      return
    }

    // Android: check if we already captured the event globally
    if ((window as any).__pwaPromptEvent) {
      setInstallable(true)
    }

    // Also listen for future events (e.g., if SW registers late)
    function handlePrompt(e: Event) {
      e.preventDefault();
      (window as any).__pwaPromptEvent = e
      setInstallable(true)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)

    // iOS Safari: always show (no beforeinstallprompt on iOS)
    if (isIOSSafari) {
      setInstallable(true)
    }

    return function() {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
    }
  }, [])

  var promptInstall = useCallback(function() {
    var evt = (window as any).__pwaPromptEvent
    if (evt) {
      // Android: trigger native prompt
      evt.prompt()
      evt.userChoice.then(function(result: any) {
        (window as any).__pwaPromptEvent = null
        if (result.outcome === 'accepted') {
          setInstallable(false)
        }
      })
    } else if (isIOSSafari) {
      setShowIOSInstructions(true)
    }
  }, [isIOSSafari])

  var dismissPrompt = useCallback(function() {
    setInstallable(false)
    setShowIOSInstructions(false)
    setDismissed(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISMISS_KEY, 'true')
    }
  }, [])

  return {
    isInstallable: installable && !isStandalone && !dismissed && !isDesktop,
    isIOS: isIOSSafari,
    isInstalled: isStandalone,
    isDesktop: isDesktop,
    promptInstall: promptInstall,
    dismissPrompt: dismissPrompt,
    showIOSInstructions: showIOSInstructions,
  }
}
