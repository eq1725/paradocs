import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { ArrowLeft } from 'lucide-react'
import { classNames } from '@/lib/utils'

// Pages where user browses lists and clicks into detail pages
const LIST_PAGES: Record<string, string> = {
  '/explore': 'Explore',
  '/search': 'Search Results',
  '/discover': 'Discover',
  '/phenomena': 'Encyclopedia',
  '/insights': 'Insights',
  '/map': 'Map',
  '/dashboard/saved': 'Saved Reports',
  '/dashboard/reports': 'My Reports',
  '/dashboard/journal': 'Journal',
}

// Detail pages where user needs a way back
// Detail pages where the floating back button should appear
// Note: /report/ and /phenomena/ pages have their own breadcrumb/back navigation
function isDetailPage(path: string): boolean {
  return (
    path.startsWith('/insights/patterns/') ||
    path.startsWith('/story/') ||
    (path.startsWith('/dashboard/journal/') && path !== '/dashboard/journal' && !path.endsWith('/new'))
  )
}

function getListPageLabel(path: string): string | null {
  if (LIST_PAGES[path]) return LIST_PAGES[path]
  for (const [prefix, label] of Object.entries(LIST_PAGES)) {
    if (path === prefix || path.startsWith(prefix + '?')) return label
  }
  return null
}

const NAV_KEY = 'paradocs_nav_ctx'

interface NavCtx {
  referrerPath: string
  referrerLabel: string
  scrollY: number
}

// Robust scroll restoration that watches for DOM changes
function restoreScrollPosition(targetY: number) {
  if (targetY <= 0) return

  let attempts = 0
  const maxAttempts = 50
  const maxDuration = 5000
  const startTime = Date.now()

  function tryScroll() {
    const docHeight = document.documentElement.scrollHeight
    const viewHeight = window.innerHeight

    // If the page is tall enough to scroll to our target, do it
    if (docHeight >= targetY + viewHeight * 0.5 || attempts > 10) {
      window.scrollTo({ top: targetY, behavior: 'instant' as ScrollBehavior })
    }

    attempts++
    if (attempts >= maxAttempts || Date.now() - startTime > maxDuration) {
      // Final attempt
      window.scrollTo({ top: targetY, behavior: 'instant' as ScrollBehavior })
      return
    }

    // If we haven't reached target position yet, keep trying
    if (Math.abs(window.scrollY - targetY) > 50) {
      requestAnimationFrame(() => {
        setTimeout(tryScroll, 100)
      })
    }
  }

  // Start restoring with increasing delays
  setTimeout(tryScroll, 50)

  // Also observe DOM mutations for dynamic content loading
  const observer = new MutationObserver(() => {
    const docHeight = document.documentElement.scrollHeight
    const viewHeight = window.innerHeight
    if (docHeight >= targetY + viewHeight * 0.3) {
      window.scrollTo({ top: targetY, behavior: 'instant' as ScrollBehavior })
      if (Math.abs(window.scrollY - targetY) < 50) {
        observer.disconnect()
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })

  // Clean up observer after max duration
  setTimeout(() => observer.disconnect(), maxDuration)
}

export default function NavigationHelper() {
  const router = useRouter()
  const [backInfo, setBackInfo] = useState<{ label: string; path: string } | null>(null)
  const [visible, setVisible] = useState(false)

  // Save scroll position when leaving a list page
  useEffect(() => {
    function onRouteStart(url: string) {
      const currentPath = router.asPath.split('?')[0]
      const label = getListPageLabel(currentPath)
      if (label) {
        const ctx: NavCtx = {
          referrerPath: router.asPath,
          referrerLabel: label,
          scrollY: window.scrollY,
        }
        try { sessionStorage.setItem(NAV_KEY, JSON.stringify(ctx)) } catch {}
      }
    }
    router.events.on('routeChangeStart', onRouteStart)
    return () => router.events.off('routeChangeStart', onRouteStart)
  }, [router])

  // Show back button on detail pages
  useEffect(() => {
    const path = router.asPath.split('?')[0]
    if (isDetailPage(path)) {
      try {
        const stored = sessionStorage.getItem(NAV_KEY)
        if (stored) {
          const ctx: NavCtx = JSON.parse(stored)
          setBackInfo({ label: ctx.referrerLabel, path: ctx.referrerPath })
          setTimeout(() => setVisible(true), 300)
          return
        }
      } catch {}
      // Fallback: generic back based on page type
      if (path.startsWith('/insights/patterns/')) {
        setBackInfo({ label: 'Insights', path: '/insights' })
      } else if (path.startsWith('/story/')) {
        setBackInfo({ label: 'Explore', path: '/explore' })
      } else if (path.startsWith('/dashboard/journal/')) {
        setBackInfo({ label: 'Journal', path: '/dashboard/journal' })
      }
      setTimeout(() => setVisible(true), 300)
    } else {
      setBackInfo(null)
      setVisible(false)
    }
  }, [router.asPath])

  // Restore scroll position when returning to a list page
  useEffect(() => {
    function onRouteComplete(url: string) {
      const path = url.split('?')[0]
      if (getListPageLabel(path)) {
        try {
          const stored = sessionStorage.getItem(NAV_KEY)
          if (stored) {
            const ctx: NavCtx = JSON.parse(stored)
            if (ctx.referrerPath.split('?')[0] === path && ctx.scrollY > 0) {
              restoreScrollPosition(ctx.scrollY)
            }
          }
        } catch {}
      }
    }
    router.events.on('routeChangeComplete', onRouteComplete)
    return () => router.events.off('routeChangeComplete', onRouteComplete)
  }, [router])

  const handleBack = useCallback(() => {
    if (!backInfo) return
    setVisible(false)
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(backInfo.path)
    }
  }, [backInfo, router])

  if (!backInfo) return null

  return (
    <button
      onClick={handleBack}
      aria-label={`Back to ${backInfo.label}`}
      className={classNames(
        'fixed z-40 left-3 sm:left-4 flex items-center gap-1.5',
        'px-3 py-2 sm:px-4 sm:py-2.5',
        'rounded-full bg-black/70 backdrop-blur-md border border-white/10',
        'text-sm text-gray-300 hover:text-white hover:bg-black/90 hover:border-white/20',
        'active:scale-95 transition-all duration-300 shadow-lg',
        'top-[4.25rem] sm:top-[4.75rem]',
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'
      )}
    >
      <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      <span className="hidden sm:inline">Back to {backInfo.label}</span>
      <span className="sm:hidden text-xs">Back</span>
    </button>
  )
}
