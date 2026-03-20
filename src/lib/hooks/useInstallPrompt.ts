/**
 * useInstallPrompt — PWA "Add to Home Screen" install prompt hook
 *
 * Returns:
 * - isInstallable: true if beforeinstallprompt fired (Android) or iOS Safari detected
 * - isIOS: true if iOS Safari (not Chrome on iOS)
 * - isInstalled: true if already in standalone mode
 * - isDesktop: true if not mobile
 * - promptInstall: calls prompt() (Android) or sets showIOSInstructions (iOS)
 * - dismissPrompt: sets localStorage flag and hides
 * - showIOSInstructions: true when iOS instructions should be shown
 */

import { useState, useEffect, useRef } from 'react'

var DISMISS_KEY = 'paradocs_a2hs_dismissed'

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
  var [isInstallable, setIsInstallable] = useState(false)
  var [showIOSInstructions, setShowIOSInstructions] = useState(false)
  var deferredPrompt = useRef<any>(null)

  // Detect platform
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
  var isDismissed = !isServer && localStorage.getItem(DISMISS_KEY) === 'true'

  useEffect(function() {
    if (isServer || isStandalone || isDismissed || isDesktop) return

    // Android/Chrome: listen for beforeinstallprompt
    function handleBeforeInstall(e: Event) {
      e.preventDefault()
      deferredPrompt.current = e
      setIsInstallable(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // iOS Safari: show custom instructions
    if (isIOSSafari) {
      setIsInstallable(true)
    }

    return function() {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  function promptInstall() {
    if (deferredPrompt.current) {
      // Android: trigger native prompt
      deferredPrompt.current.prompt()
      deferredPrompt.current.userChoice.then(function(result: any) {
        deferredPrompt.current = null
        if (result.outcome === 'accepted') {
          setIsInstallable(false)
        }
      })
    } else if (isIOSSafari) {
      setShowIOSInstructions(true)
    }
  }

  function dismissPrompt() {
    setIsInstallable(false)
    setShowIOSInstructions(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISMISS_KEY, 'true')
    }
  }

  return {
    isInstallable: isInstallable && !isStandalone && !isDismissed && !isDesktop,
    isIOS: isIOSSafari,
    isInstalled: isStandalone,
    isDesktop: isDesktop,
    promptInstall: promptInstall,
    dismissPrompt: dismissPrompt,
    showIOSInstructions: showIOSInstructions,
  }
}
