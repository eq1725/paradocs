'use client'

/**
 * /discover — Stories (TikTok-style fullscreen swipe feed)
 *
 * Phase 2: Mixed content feed with three card templates.
 * - PhenomenonCard: encyclopedia entries with images/gradients
 * - TextReportCard: first-person experiencer reports (text-focused)
 * - MediaReportCard: reports with photo/video evidence
 *
 * Uses /api/discover/feed-v2 for mixed phenomena + reports.
 * Framer Motion horizontal swipe for related content on each card.
 * Signup gate preserved at card 6 for anonymous users.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
  LogIn,
} from 'lucide-react'
import { classNames } from '@/lib/utils'
import { createClient } from '@supabase/supabase-js'
import {
  PhenomenonCard,
  TextReportCard,
  MediaReportCard,
} from '@/components/discover/DiscoverCards'
import type { FeedItemV2, PhenomenonItem, ReportItem, RelatedItem } from '@/components/discover/DiscoverCards'

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function DiscoverPage() {
  var router = useRouter()
  var [items, setItems] = useState<FeedItemV2[]>([])
  var [loading, setLoading] = useState(true)

  // Fresh seed on every mount \u2014 new random order each visit
  var sessionSeed = useRef(Math.floor(Math.random() * 2147483647))
  var [loadingMore, setLoadingMore] = useState(false)
  var [hasMore, setHasMore] = useState(true)
  var [totalAvailable, setTotalAvailable] = useState(0)
  var [offset, setOffset] = useState(0)
  var [currentIndex, setCurrentIndex] = useState(0)
  var [user, setUser] = useState<any>(null)
  var [showSignupPrompt, setShowSignupPrompt] = useState(false)
  var [signupDismissed, setSignupDismissed] = useState(false)

  // Related items cache: keyed by item id
  var [relatedCache, setRelatedCache] = useState<Record<string, RelatedItem[]>>({})

  var containerRef = useRef<HTMLDivElement>(null)
  var cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  var loadingRef = useRef(false)
  var initialSettled = useRef(false)

  // Track items seen for completion signal
  var [maxSeen, setMaxSeen] = useState(0)

  // --- Auth ---
  useEffect(function () {
    supabase.auth.getSession().then(function (result) {
      setUser(result.data.session?.user || null)
    })
    var sub = supabase.auth.onAuthStateChange(function (_event, session) {
      setUser(session?.user || null)
    })
    return function () { sub.data.subscription.unsubscribe() }
  }, [])

  // --- Load initial feed ---
  useEffect(function () {
    loadFeed(0)
    // Allow prefetching only after initial render + snap settle
    var timer = setTimeout(function () { initialSettled.current = true }, 1200)
    return function () { clearTimeout(timer) }
  }, [])

  // --- Signup gate at card 6 ---
  useEffect(function () {
    if (!user && !signupDismissed && currentIndex === 5) {
      setShowSignupPrompt(true)
    }
  }, [currentIndex, user, signupDismissed])

  // --- Track max seen index ---
  useEffect(function () {
    if (currentIndex > maxSeen) setMaxSeen(currentIndex)
  }, [currentIndex])

  function loadFeed(feedOffset: number) {
    if (loadingRef.current) return
    loadingRef.current = true

    if (feedOffset > 0) setLoadingMore(true)
    else setLoading(true)

    var params = new URLSearchParams({
      limit: '15',
      offset: String(feedOffset),
      seed: String(sessionSeed.current),
    })

    fetch('/api/discover/feed-v2?' + params.toString())
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data.items && data.items.length > 0) {
          setItems(function (prev) {
            var existingIds = new Set(prev.map(function (p) { return p.id }))
            var newItems = data.items.filter(function (item: FeedItemV2) {
              return !existingIds.has(item.id)
            })
            return feedOffset > 0 ? prev.concat(newItems) : data.items
          })
          setOffset(data.nextOffset || feedOffset + data.items.length)
          setHasMore(data.hasMore)
          setTotalAvailable(data.totalAvailable || 0)
        } else {
          setHasMore(false)
        }
      })
      .catch(function (err) {
        console.error('[Discover] Feed error:', err)
      })
      .finally(function () {
        setLoading(false)
        setLoadingMore(false)
        loadingRef.current = false
      })
  }

  // --- Fetch related items for the active card ---
  useEffect(function () {
    if (items.length === 0) return
    var activeItem = items[currentIndex]
    if (!activeItem) return
    if (relatedCache[activeItem.id]) return // already cached

    var slug = activeItem.item_type === 'phenomenon'
      ? (activeItem as PhenomenonItem).slug
      : (activeItem as ReportItem).slug

    // Use report-similar API for reports, related API for phenomena
    var url = activeItem.item_type === 'report'
      ? '/api/ai/report-similar?slug=' + encodeURIComponent(slug)
      : '/api/ai/related?query=' + encodeURIComponent(
          activeItem.item_type === 'phenomenon' ? (activeItem as PhenomenonItem).name : slug
        )

    fetch(url)
      .then(function (res) { return res.ok ? res.json() : null })
      .then(function (data) {
        if (!data) return
        var related: RelatedItem[] = []

        if (activeItem.item_type === 'report' && data.similar) {
          // report-similar endpoint returns { similar: [...] }
          related = data.similar.slice(0, 6).map(function (s: any) {
            return {
              slug: s.slug || s.source_slug || '',
              title: s.title || s.source_title || 'Related',
              category: s.category || '',
              similarity: s.similarity || s.best_similarity || 0,
              item_type: 'report' as const,
            }
          })
        } else if (data.related_reports || data.related_phenomena) {
          // related endpoint returns { related_reports, related_phenomena }
          var rr = (data.related_reports || []).slice(0, 3).map(function (r: any) {
            return {
              slug: r.slug || '',
              title: r.title || 'Report',
              category: r.category || '',
              similarity: r.similarity || 0,
              item_type: 'report' as const,
            }
          })
          var rp = (data.related_phenomena || []).slice(0, 3).map(function (p: any) {
            return {
              slug: p.slug || '',
              title: p.name || p.title || 'Phenomenon',
              category: p.category || '',
              similarity: p.similarity || 0,
              item_type: 'phenomenon' as const,
            }
          })
          related = rr.concat(rp)
        }

        if (related.length > 0) {
          setRelatedCache(function (prev) {
            var next: Record<string, RelatedItem[]> = {}
            Object.keys(prev).forEach(function (k) { next[k] = prev[k] })
            next[activeItem.id] = related
            return next
          })
        }
      })
      .catch(function () {
        // Silently fail \u2014 related tray just won't show
      })
  }, [currentIndex, items.length])

  // --- IntersectionObserver for scroll tracking ---
  useEffect(function () {
    var observer = new IntersectionObserver(
      function (entries) {
        // During initial settle, only allow index 0 to prevent cascade
        var settled = initialSettled.current
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var idx = parseInt(entry.target.getAttribute('data-index') || '0', 10)
            if (settled || idx === 0) {
              setCurrentIndex(idx)
            }
          }
        })
      },
      { threshold: 0.6 }
    )

    cardRefs.current.forEach(function (node) {
      observer.observe(node)
    })

    return function () { observer.disconnect() }
  }, [items.length])

  // --- Prefetch next batch (guarded to prevent runaway on initial render) ---
  useEffect(function () {
    if (!initialSettled.current) return
    if (currentIndex >= items.length - 5 && hasMore && !loadingRef.current) {
      loadFeed(offset)
    }
  }, [currentIndex, items.length, hasMore, offset])

  function registerCard(node: HTMLDivElement | null, index: number) {
    if (node) {
      cardRefs.current.set(index, node)
    } else {
      cardRefs.current.delete(index)
    }
  }

  function scrollToNext() {
    var nextNode = cardRefs.current.get(currentIndex + 1)
    if (nextNode) nextNode.scrollIntoView({ behavior: 'smooth' })
  }

  function scrollToPrev() {
    var prevNode = cardRefs.current.get(Math.max(0, currentIndex - 1))
    if (prevNode) prevNode.scrollIntoView({ behavior: 'smooth' })
  }

  // --- Keyboard nav ---
  useEffect(function () {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        scrollToNext()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        scrollToPrev()
      }
    }
    window.addEventListener('keydown', handleKey)
    return function () { window.removeEventListener('keydown', handleKey) }
  }, [currentIndex])

  var setShowSignupPromptCb = useCallback(function (show: boolean) {
    setShowSignupPrompt(show)
  }, [])

  // --- Completion percentage ---
  var completionPct = totalAvailable > 0
    ? Math.round(((maxSeen + 1) / totalAvailable) * 100)
    : 0

  // --- Loading state ---
  if (loading) {
    return (
      <>
        <Head>
          <title>Stories - Paradocs</title>
        </Head>
        <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-gray-400 text-lg">Loading stories...</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>Stories - Paradocs</title>
        <meta name="description" content="Scroll through the world's most fascinating paranormal phenomena and firsthand reports. Cryptids, UFOs, ghosts, and unexplained events \u2014 one swipe at a time." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 z-50 px-3 sm:px-4 pt-[max(0.625rem,env(safe-area-inset-top))] sm:pt-3 pb-2 sm:pb-3 flex items-center justify-between bg-gradient-to-b from-gray-950 via-gray-950/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <Link href="/">
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Paradocs<span style={{color:'#9000F0'}}>.</span></span>
          </Link>
          {/* Card counter + content type indicator */}
          <span className="text-[10px] sm:text-xs text-gray-500 bg-gray-900/50 backdrop-blur-sm px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
            {currentIndex + 1} / {totalAvailable > 0 ? totalAvailable : items.length}{hasMore ? '+' : ''}
          </span>
          {/* Content type pill for current card */}
          {items[currentIndex] && (
            <span className={classNames(
              'text-[10px] px-2 py-0.5 rounded-full font-medium backdrop-blur-sm',
              items[currentIndex].item_type === 'phenomenon'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-blue-500/20 text-blue-400'
            )}>
              {items[currentIndex].item_type === 'phenomenon' ? 'Encyclopedia' : 'Report'}
            </span>
          )}
        </div>
        <div className="pointer-events-auto">
          {!user ? (
            <Link
              href="/login"
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs sm:text-sm font-medium rounded-full transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Sign In</span>
            </Link>
          ) : (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs sm:text-sm font-medium rounded-full transition-colors"
            >
              Dashboard
            </Link>
          )}
        </div>
      </div>

      {/* Progress indicator with completion percentage */}
      <div className="fixed left-0 right-0 z-40 h-0.5 bg-gray-900" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div
          className="h-full bg-purple-500 transition-all duration-300"
          style={{ width: totalAvailable > 0 ? ((currentIndex + 1) / totalAvailable * 100) + '%' : items.length > 0 ? ((currentIndex + 1) / items.length * 100) + '%' : '0%' }}
        />
      </div>

      {/* Completion milestone toasts */}
      {completionPct >= 25 && completionPct < 50 && currentIndex === maxSeen && maxSeen > 5 && (
        <CompletionToast pct={25} total={totalAvailable} />
      )}
      {completionPct >= 50 && completionPct < 75 && currentIndex === maxSeen && (
        <CompletionToast pct={50} total={totalAvailable} />
      )}
      {completionPct >= 75 && completionPct < 100 && currentIndex === maxSeen && (
        <CompletionToast pct={75} total={totalAvailable} />
      )}

      {/* Main scroll container */}
      <div
        ref={containerRef}
        className="h-screen overflow-y-auto snap-y snap-mandatory overscroll-y-none"
      >
        {items.map(function (item, index) {
          var related = relatedCache[item.id] || []

          if (item.item_type === 'phenomenon') {
            return (
              <PhenomenonCard
                key={item.id}
                item={item as PhenomenonItem}
                index={index}
                isActive={index === currentIndex}
                user={user}
                related={related}
                onRef={function (node) { registerCard(node, index) }}
                onShowSignup={setShowSignupPromptCb}
              />
            )
          }

          // Report cards: choose template based on evidence
          var report = item as ReportItem
          if (report.has_photo_video) {
            return (
              <MediaReportCard
                key={item.id}
                item={report}
                index={index}
                isActive={index === currentIndex}
                user={user}
                related={related}
                onRef={function (node) { registerCard(node, index) }}
                onShowSignup={setShowSignupPromptCb}
              />
            )
          }

          return (
            <TextReportCard
              key={item.id}
              item={report}
              index={index}
              isActive={index === currentIndex}
              user={user}
              related={related}
              onRef={function (node) { registerCard(node, index) }}
              onShowSignup={setShowSignupPromptCb}
            />
          )
        })}

        {/* Loading more indicator */}
        {loadingMore && (
          <div className="h-screen w-full snap-start snap-always flex items-center justify-center bg-gray-950">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
          </div>
        )}

        {/* End of feed */}
        {!hasMore && items.length > 0 && (
          <div className="h-screen w-full snap-start snap-always flex flex-col items-center justify-center bg-gray-950 px-6 text-center">
            <Sparkles className="w-12 h-12 text-purple-500 mb-4" />
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">You have explored them all!</h2>
            <p className="text-gray-400 text-sm sm:text-base mb-2 max-w-md">
              {'You scrolled through all ' + items.length + ' stories \u2014 phenomena and reports combined.'}
            </p>
            <p className="text-gray-500 text-xs mb-8">
              {'That\u2019s ' + totalAvailable + ' entries from our database. More are added every week.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
              <Link
                href="/phenomena"
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-medium transition-colors text-center"
              >
                Browse Encyclopedia
              </Link>
              <Link
                href="/explore"
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-full font-medium transition-colors text-center"
              >
                Explore Feed
              </Link>
              {!user && (
                <Link
                  href="/login"
                  className="px-6 py-3 bg-white/10 hover:bg-white/15 text-white rounded-full font-medium transition-colors text-center border border-white/15"
                >
                  Create Account
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Signup prompt overlay */}
      {showSignupPrompt && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-6">
          <div className="w-full sm:max-w-sm bg-gray-900 border-t sm:border border-gray-700 rounded-t-2xl sm:rounded-2xl p-6 text-center relative">
            <div className="flex justify-center mb-3 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>
            <button
              onClick={function () { setShowSignupPrompt(false); setSignupDismissed(true) }}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <Sparkles className="w-10 h-10 text-purple-500 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-white mb-2">Down the rabbit hole?</h3>
            <p className="text-gray-400 text-sm mb-5">
              Create a free account to save entries, get personalized recommendations, and submit your own sightings.
            </p>
            <Link
              href="/login"
              className="block w-full py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-500 text-white rounded-full font-medium transition-colors mb-3"
            >
              Create Free Account
            </Link>
            <button
              onClick={function () { setShowSignupPrompt(false); setSignupDismissed(true) }}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors py-2"
            >
              Keep scrolling
            </button>
          </div>
        </div>
      )}

      {/* Desktop navigation arrows */}
      <div className="fixed right-6 bottom-8 z-40 hidden md:flex flex-col gap-2">
        <button
          onClick={scrollToPrev}
          disabled={currentIndex === 0}
          className="p-3 bg-gray-800/80 backdrop-blur-sm rounded-full text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
        <button
          onClick={scrollToNext}
          disabled={currentIndex >= items.length - 1 && !hasMore}
          className="p-3 bg-gray-800/80 backdrop-blur-sm rounded-full text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      {/* Scroll hint on first card (mobile only) */}
      {currentIndex === 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-bounce md:hidden">
          <div className="flex flex-col items-center text-gray-500">
            <span className="text-xs mb-1">Swipe up</span>
            <ChevronDown className="w-5 h-5" />
          </div>
        </div>
      )}
    </>
  )
}

// =========================================================================
//  Completion milestone toast
// =========================================================================

function CompletionToast(props: { pct: number; total: number }) {
  var [visible, setVisible] = useState(true)

  useEffect(function () {
    var timer = setTimeout(function () { setVisible(false) }, 3000)
    return function () { clearTimeout(timer) }
  }, [])

  if (!visible) return null

  var messages: Record<number, string> = {
    25: 'You\u2019ve explored 25% of our database!',
    50: 'Halfway through! You\u2019re a true investigator.',
    75: 'Almost there \u2014 75% explored!',
  }

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="bg-gray-900/95 backdrop-blur-sm border border-purple-500/30 rounded-full px-4 py-2 flex items-center gap-2 shadow-lg shadow-purple-500/10">
        <Sparkles className="w-4 h-4 text-purple-400" />
        <span className="text-sm text-gray-300">{messages[props.pct] || ''}</span>
      </div>
    </div>
  )
}
