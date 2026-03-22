'use client'

/**
 * /discover — Stories (TikTok-style fullscreen swipe feed)
 *
 * Phase 2.5: 2D snap grid — vertical scroll through main feed,
 * horizontal swipe-left on any card to explore related content.
 *
 * Layout:
 *   Outer div: snap-y snap-mandatory (vertical feed)
 *   Each row:  snap-start + snap-x snap-mandatory (horizontal related cards)
 *   Each card:  w-screen h-screen snap-start snap-always
 *
 * Related cards are full-screen, same templates as main feed.
 * Swiping up/down from any horizontal position returns to the main feed.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
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
import type { FeedItemV2, PhenomenonItem, ReportItem } from '@/components/discover/DiscoverCards'

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function DiscoverPage() {
  var router = useRouter()
  var [items, setItems] = useState<FeedItemV2[]>([])
  var [loading, setLoading] = useState(true)

  // Fresh seed on every mount
  var sessionSeed = useRef(Math.floor(Math.random() * 2147483647))
  var [loadingMore, setLoadingMore] = useState(false)
  var [hasMore, setHasMore] = useState(true)
  var [totalAvailable, setTotalAvailable] = useState(0)
  var [offset, setOffset] = useState(0)
  var [currentIndex, setCurrentIndex] = useState(0)
  var [user, setUser] = useState<any>(null)
  var [showSignupPrompt, setShowSignupPrompt] = useState(false)
  var [signupDismissed, setSignupDismissed] = useState(false)

  // Related cards cache: keyed by item id, stores full FeedItemV2[] arrays
  var [relatedCache, setRelatedCache] = useState<Record<string, FeedItemV2[]>>({})
  var relatedLoadingRef = useRef<Record<string, boolean>>({})

  // Track which row the user is in horizontally (0 = main card)
  var [horizontalIndex, setHorizontalIndex] = useState(0)

  var containerRef = useRef<HTMLDivElement>(null)
  var rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
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

  // --- Fetch related cards for active item ---
  useEffect(function () {
    if (items.length === 0) return
    var activeItem = items[currentIndex]
    if (!activeItem) return
    if (relatedCache[activeItem.id] || relatedLoadingRef.current[activeItem.id]) return

    relatedLoadingRef.current[activeItem.id] = true

    var url = '/api/discover/related-cards?id=' + encodeURIComponent(activeItem.id) + '&type=' + encodeURIComponent(activeItem.item_type)

    fetch(url)
      .then(function (res) { return res.ok ? res.json() : null })
      .then(function (data) {
        if (data && data.items && data.items.length > 0) {
          setRelatedCache(function (prev) {
            var next: Record<string, FeedItemV2[]> = {}
            Object.keys(prev).forEach(function (k) { next[k] = prev[k] })
            next[activeItem.id] = data.items
            return next
          })
        }
      })
      .catch(function () {})
      .finally(function () {
        relatedLoadingRef.current[activeItem.id] = false
      })
  }, [currentIndex, items.length])

  // --- IntersectionObserver for vertical scroll tracking ---
  useEffect(function () {
    var observer = new IntersectionObserver(
      function (entries) {
        var settled = initialSettled.current
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var idx = parseInt(entry.target.getAttribute('data-row-index') || '0', 10)
            if (settled || idx === 0) {
              setCurrentIndex(idx)
              // Reset horizontal position when changing vertical rows
              setHorizontalIndex(0)
              // Scroll the new row back to its first card
              var rowEl = entry.target as HTMLDivElement
              if (rowEl.scrollLeft > 0) {
                rowEl.scrollTo({ left: 0, behavior: 'auto' })
              }
            }
          }
        })
      },
      { threshold: 0.6 }
    )

    rowRefs.current.forEach(function (node) {
      observer.observe(node)
    })

    return function () { observer.disconnect() }
  }, [items.length])

  // --- Prefetch next batch ---
  useEffect(function () {
    if (!initialSettled.current) return
    if (currentIndex >= items.length - 5 && hasMore && !loadingRef.current) {
      loadFeed(offset)
    }
  }, [currentIndex, items.length, hasMore, offset])

  function registerRow(node: HTMLDivElement | null, index: number) {
    if (node) {
      rowRefs.current.set(index, node)
    } else {
      rowRefs.current.delete(index)
    }
  }

  function scrollToNext() {
    var nextRow = rowRefs.current.get(currentIndex + 1)
    if (nextRow) nextRow.scrollIntoView({ behavior: 'smooth' })
  }

  function scrollToPrev() {
    var prevRow = rowRefs.current.get(Math.max(0, currentIndex - 1))
    if (prevRow) prevRow.scrollIntoView({ behavior: 'smooth' })
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
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        var row = rowRefs.current.get(currentIndex)
        if (row) {
          var newPos = Math.max(0, row.scrollLeft - window.innerWidth)
          row.scrollTo({ left: newPos, behavior: 'smooth' })
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        var row2 = rowRefs.current.get(currentIndex)
        if (row2) {
          var newPos2 = row2.scrollLeft + window.innerWidth
          row2.scrollTo({ left: newPos2, behavior: 'smooth' })
        }
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

  // --- Render a single card by FeedItemV2 data ---
  function renderCard(item: FeedItemV2, index: number, isActive: boolean, cardKey: string) {
    if (item.item_type === 'phenomenon') {
      return (
        <PhenomenonCard
          key={cardKey}
          item={item as PhenomenonItem}
          index={index}
          isActive={isActive}
          user={user}
          onShowSignup={setShowSignupPromptCb}
        />
      )
    }

    var report = item as ReportItem
    if (report.has_photo_video) {
      return (
        <MediaReportCard
          key={cardKey}
          item={report}
          index={index}
          isActive={isActive}
          user={user}
          onShowSignup={setShowSignupPromptCb}
        />
      )
    }

    return (
      <TextReportCard
        key={cardKey}
        item={report}
        index={index}
        isActive={isActive}
        user={user}
        onShowSignup={setShowSignupPromptCb}
      />
    )
  }

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
          <span className="text-[10px] sm:text-xs text-gray-500 bg-gray-900/50 backdrop-blur-sm px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
            {currentIndex + 1} / {totalAvailable > 0 ? totalAvailable : items.length}{hasMore ? '+' : ''}
          </span>
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
          {/* Horizontal depth indicator — shows when swiped into related */}
          {horizontalIndex > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium backdrop-blur-sm bg-white/10 text-gray-400">
              {'Related ' + horizontalIndex + ' / ' + ((relatedCache[items[currentIndex]?.id] || []).length)}
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

      {/* Progress indicator */}
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

      {/* Main vertical scroll container */}
      <div
        ref={containerRef}
        className="h-screen overflow-y-auto snap-y snap-mandatory overscroll-y-none"
      >
        {items.map(function (item, index) {
          var related = relatedCache[item.id] || []
          var isActiveRow = index === currentIndex
          var hasRelated = related.length > 0

          return (
            <FeedRow
              key={item.id}
              item={item}
              related={related}
              index={index}
              isActiveRow={isActiveRow}
              hasRelated={hasRelated}
              user={user}
              onRef={function (node) { registerRow(node, index) }}
              onShowSignup={setShowSignupPromptCb}
              onHorizontalChange={function (hIdx) {
                if (isActiveRow) setHorizontalIndex(hIdx)
              }}
              renderCard={renderCard}
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

      {/* Scroll hint on first card */}
      {currentIndex === 0 && horizontalIndex === 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-bounce md:hidden">
          <div className="flex flex-col items-center text-gray-500">
            <span className="text-xs mb-1">Swipe up</span>
            <ChevronDown className="w-5 h-5" />
          </div>
        </div>
      )}

      {/* Back-to-main hint when in related cards */}
      {horizontalIndex > 0 && (
        <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40">
          <button
            onClick={function () {
              var row = rowRefs.current.get(currentIndex)
              if (row) row.scrollTo({ left: 0, behavior: 'smooth' })
            }}
            className="p-2 bg-gray-800/70 backdrop-blur-sm rounded-full text-white/60 hover:text-white hover:bg-gray-700/70 transition-all"
            title="Back to main card"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  )
}

// =========================================================================
//  FeedRow — one horizontal row containing main card + related cards
// =========================================================================

function FeedRow(props: {
  item: FeedItemV2
  related: FeedItemV2[]
  index: number
  isActiveRow: boolean
  hasRelated: boolean
  user: any
  onRef: (node: HTMLDivElement | null) => void
  onShowSignup: (show: boolean) => void
  onHorizontalChange: (hIdx: number) => void
  renderCard: (item: FeedItemV2, index: number, isActive: boolean, key: string) => React.ReactNode
}) {
  var rowRef = useRef<HTMLDivElement | null>(null)

  // Track horizontal scroll position within this row
  useEffect(function () {
    var el = rowRef.current
    if (!el) return

    var handleScroll = function () {
      var hIdx = Math.round(el!.scrollLeft / window.innerWidth)
      props.onHorizontalChange(hIdx)
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return function () {
      el!.removeEventListener('scroll', handleScroll)
    }
  }, [props.hasRelated])

  function setRef(node: HTMLDivElement | null) {
    rowRef.current = node
    props.onRef(node)
  }

  var allCards: FeedItemV2[] = [props.item].concat(props.related)

  return (
    <div
      ref={setRef}
      data-row-index={props.index}
      className="h-screen w-full snap-start snap-always flex overflow-x-auto snap-x snap-mandatory overscroll-x-none scrollbar-hide"
      style={{ scrollSnapStop: 'always' }}
    >
      {allCards.map(function (card, hIdx) {
        var isMainCard = hIdx === 0
        var cardKey = isMainCard ? card.id : card.id + '-related-' + hIdx

        return (
          <div
            key={cardKey}
            className="h-screen w-screen flex-shrink-0 snap-start snap-always relative"
          >
            {props.renderCard(card, props.index, props.isActiveRow && isMainCard, cardKey)}

            {/* Swipe-left hint on main card when related cards are available */}
            {isMainCard && props.hasRelated && props.isActiveRow && (
              <SwipeHint count={props.related.length} />
            )}

            {/* "Back to main" indicator on related cards */}
            {!isMainCard && (
              <div className="absolute top-16 sm:top-20 left-5 sm:left-8 z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-white/10 backdrop-blur-sm text-gray-300">
                  <ChevronLeft className="w-3 h-3" />
                  {'Related ' + hIdx + ' of ' + props.related.length}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// =========================================================================
//  SwipeHint — subtle left-arrow indicator showing related cards exist
// =========================================================================

function SwipeHint(props: { count: number }) {
  var [visible, setVisible] = useState(true)

  useEffect(function () {
    var timer = setTimeout(function () { setVisible(false) }, 4000)
    return function () { clearTimeout(timer) }
  }, [])

  if (!visible) return null

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 animate-pulse">
      <div className="flex flex-col items-center gap-1 text-white/40">
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <ChevronLeft className="w-4 h-4" />
        </div>
        <span className="text-[10px]">{props.count + ' related'}</span>
      </div>
    </div>
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
