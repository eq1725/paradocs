'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  ChevronDown,
  ChevronUp,
  Bookmark,
  Share2,
  Sparkles,
  ArrowRight,
  X,
  AlertTriangle,
  MapPin,
  Tag,
  Calendar,
  Compass,
  LogIn,
  Eye,
} from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'
import { createClient } from '@supabase/supabase-js'

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface QuickFacts {
  origin?: string
  first_documented?: string
  classification?: string
  danger_level?: string
  typical_encounter?: string
  evidence_types?: string
  active_period?: string
  notable_feature?: string
  cultural_significance?: string
}

interface FeedItem {
  id: string
  name: string
  slug: string
  category: string
  icon: string
  ai_summary: string | null
  ai_description: string | null
  ai_quick_facts: QuickFacts | null
  primary_image_url: string | null
  report_count: number
  primary_regions: string[] | null
  first_reported_date: string | null
  aliases: string[] | null
}

// Category-specific gradients for the full-screen cards
var CARD_GRADIENTS: Record<string, string> = {
  cryptids: 'from-emerald-950/90 via-gray-950/80 to-gray-950',
  ufos_aliens: 'from-indigo-950/90 via-gray-950/80 to-gray-950',
  ghosts_hauntings: 'from-purple-950/90 via-gray-950/80 to-gray-950',
  psychic_phenomena: 'from-violet-950/90 via-gray-950/80 to-gray-950',
  consciousness_practices: 'from-amber-950/90 via-gray-950/80 to-gray-950',
  psychological_experiences: 'from-cyan-950/90 via-gray-950/80 to-gray-950',
  biological_factors: 'from-rose-950/90 via-gray-950/80 to-gray-950',
  perception_sensory: 'from-orange-950/90 via-gray-950/80 to-gray-950',
  religion_mythology: 'from-yellow-950/90 via-gray-950/80 to-gray-950',
  esoteric_practices: 'from-fuchsia-950/90 via-gray-950/80 to-gray-950',
  combination: 'from-teal-950/90 via-gray-950/80 to-gray-950',
}

var ACCENT_COLORS: Record<string, string> = {
  cryptids: 'text-emerald-400',
  ufos_aliens: 'text-green-400',
  ghosts_hauntings: 'text-purple-400',
  psychic_phenomena: 'text-blue-400',
  consciousness_practices: 'text-indigo-400',
  psychological_experiences: 'text-pink-400',
  biological_factors: 'text-rose-400',
  perception_sensory: 'text-orange-400',
  religion_mythology: 'text-yellow-400',
  esoteric_practices: 'text-fuchsia-400',
  combination: 'text-teal-400',
}

var DANGER_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  'Low': { bg: 'bg-green-500/20', text: 'text-green-400', glow: 'shadow-green-500/20' },
  'Moderate': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', glow: 'shadow-yellow-500/20' },
  'High': { bg: 'bg-orange-500/20', text: 'text-orange-400', glow: 'shadow-orange-500/20' },
  'Extreme': { bg: 'bg-red-500/20', text: 'text-red-400', glow: 'shadow-red-500/20' },
  'Unknown': { bg: 'bg-gray-500/20', text: 'text-gray-400', glow: '' },
  'Varies': { bg: 'bg-purple-500/20', text: 'text-purple-400', glow: 'shadow-purple-500/20' },
}

// Generate a session seed once (persists across navigations but not across tabs)
var SESSION_SEED = Math.floor(Math.random() * 2147483647)

export default function DiscoverPage() {
  var router = useRouter()
  var [items, setItems] = useState<FeedItem[]>([])
  var [loading, setLoading] = useState(true)
  var [loadingMore, setLoadingMore] = useState(false)
  var [hasMore, setHasMore] = useState(true)
  var [totalAvailable, setTotalAvailable] = useState(0)
  var [offset, setOffset] = useState(0)
  var [currentIndex, setCurrentIndex] = useState(0)
  var [user, setUser] = useState<any>(null)
  var [showSignupPrompt, setShowSignupPrompt] = useState(false)
  var [signupDismissed, setSignupDismissed] = useState(false)
  var [imgErrors, setImgErrors] = useState<Set<string>>(new Set())
  var containerRef = useRef<HTMLDivElement>(null)
  var cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  var loadingRef = useRef(false)

  // Check auth state
  useEffect(function () {
    supabase.auth.getSession().then(function ({ data: { session } }) {
      setUser(session?.user || null)
    })
    var { data: { subscription } } = supabase.auth.onAuthStateChange(function (_event, session) {
      setUser(session?.user || null)
    })
    return function () { subscription.unsubscribe() }
  }, [])

  // Load initial feed
  useEffect(function () {
    loadFeed(0)
  }, [])

  // Show signup prompt at card 6 for non-logged-in users
  useEffect(function () {
    if (!user && !signupDismissed && currentIndex === 5) {
      setShowSignupPrompt(true)
    }
  }, [currentIndex, user, signupDismissed])

  function loadFeed(feedOffset: number) {
    if (loadingRef.current) return
    loadingRef.current = true

    if (feedOffset > 0) setLoadingMore(true)
    else setLoading(true)

    var params = new URLSearchParams({
      limit: '15',
      offset: String(feedOffset),
      seed: String(SESSION_SEED),
    })

    fetch('/api/discover/feed?' + params.toString())
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data.items && data.items.length > 0) {
          setItems(function (prev) {
            // Deduplicate in case of race conditions
            var existingIds = new Set(prev.map(function (p) { return p.id }))
            var newItems = data.items.filter(function (item: FeedItem) {
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

  // Single IntersectionObserver for all cards (much better perf than one per card)
  useEffect(function () {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var idx = parseInt(entry.target.getAttribute('data-index') || '0', 10)
            setCurrentIndex(idx)
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

  // Prefetch next batch when approaching the end
  useEffect(function () {
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

  function handleImageError(id: string) {
    setImgErrors(function (prev) { var next = new Set(prev); next.add(id); return next })
  }

  function scrollToNext() {
    var nextNode = cardRefs.current.get(currentIndex + 1)
    if (nextNode) {
      nextNode.scrollIntoView({ behavior: 'smooth' })
    }
  }

  function scrollToPrev() {
    var prevNode = cardRefs.current.get(Math.max(0, currentIndex - 1))
    if (prevNode) {
      prevNode.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Keyboard navigation
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

  if (loading) {
    return (
      <>
        <Head>
          <title>Discover - Paradocs</title>
        </Head>
        <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-gray-400 text-lg">Loading discoveries...</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>Discover - Paradocs</title>
        <meta name="description" content="Scroll through the world's most fascinating paranormal phenomena. Cryptids, UFOs, ghosts, and unexplained events — one swipe at a time." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      {/* Fixed header — sits below status bar on mobile via safe-area-inset */}
      <div className="fixed top-0 left-0 right-0 z-50 px-3 sm:px-4 pt-[max(0.625rem,env(safe-area-inset-top))] sm:pt-3 pb-2 sm:pb-3 flex items-center justify-between bg-gradient-to-b from-gray-950 via-gray-950/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <Link href="/">
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Paradocs<span className="text-purple-500">.</span></span>
          </Link>
          {/* Card counter — inline with logo on mobile */}
          <span className="text-[10px] sm:text-xs text-gray-500 bg-gray-900/50 backdrop-blur-sm px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
            {currentIndex + 1} / {totalAvailable > 0 ? totalAvailable : items.length}{hasMore ? '+' : ''}
          </span>
        </div>
        <div className="pointer-events-auto">
          {!user ? (
            <Link
              href="/login"
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs sm:text-sm font-medium rounded-full transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Sign In</span>
              <span className="sm:hidden">Sign In</span>
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

      {/* Progress indicator — below safe area */}
      <div className="fixed left-0 right-0 z-40 h-0.5 bg-gray-900" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div
          className="h-full bg-purple-500 transition-all duration-300"
          style={{ width: totalAvailable > 0 ? ((currentIndex + 1) / totalAvailable * 100) + '%' : items.length > 0 ? ((currentIndex + 1) / items.length * 100) + '%' : '0%' }}
        />
      </div>

      {/* Main scroll container — overscroll-none prevents bounce-through on iOS */}
      <div
        ref={containerRef}
        className="h-screen overflow-y-auto snap-y snap-mandatory overscroll-y-none"
      >
        {items.map(function (item, index) {
          return (
            <DiscoverCard
              key={item.id}
              item={item}
              index={index}
              isActive={index === currentIndex}
              user={user}
              imgError={imgErrors.has(item.id)}
              onImageError={function () { handleImageError(item.id) }}
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
            <p className="text-gray-400 text-sm sm:text-base mb-8 max-w-md">
              You scrolled through our entire encyclopedia of {items.length} phenomena.
              Want to dive deeper into any of them?
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
              <Link
                href="/phenomena"
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-medium transition-colors text-center"
              >
                Browse Encyclopedia
              </Link>
              {!user && (
                <Link
                  href="/login"
                  className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-full font-medium transition-colors text-center"
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
            {/* Mobile drag handle */}
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

      {/* Navigation arrows (desktop only) */}
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

interface DiscoverCardProps {
  item: FeedItem
  index: number
  isActive: boolean
  user: any
  imgError: boolean
  onImageError: () => void
  onRef: (node: HTMLDivElement | null) => void
  onShowSignup: (show: boolean) => void
}

function DiscoverCard({ item, index, isActive, user, imgError, onImageError, onRef, onShowSignup }: DiscoverCardProps) {
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var gradient = CARD_GRADIENTS[item.category] || 'from-gray-950/90 to-gray-950'
  var accent = ACCENT_COLORS[item.category] || 'text-purple-400'
  var qf = item.ai_quick_facts
  var hasImage = item.primary_image_url && !imgError
  var placeholderUrl = 'https://bhkbctdmwnowfmqpksed.supabase.co/storage/v1/object/public/phenomena-images/default-cryptid.jpg'
  var isPlaceholder = item.primary_image_url === placeholderUrl

  var dangerKey = qf?.danger_level?.split(' ')?.[0] || ''
  var dangerStyle = DANGER_COLORS[dangerKey] || null

  return (
    <div
      ref={onRef}
      data-index={index}
      className="h-screen w-full snap-start snap-always relative overflow-hidden bg-gray-950"
    >
      {/* Background image */}
      {hasImage && !isPlaceholder ? (
        <>
          <img
            src={item.primary_image_url!}
            alt=""
            className={classNames(
              'absolute inset-0 w-full h-full object-cover transition-transform duration-700',
              isActive ? 'scale-100' : 'scale-105'
            )}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={onImageError}
          />
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-gray-950/30" />
        </>
      ) : (
        /* Stylized gradient background for entries without real images */
        <div className={classNames('absolute inset-0 bg-gradient-to-br', gradient)}>
          {/* Decorative icon in background */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.06]">
            <span className="text-[12rem] sm:text-[20rem] leading-none select-none">{item.icon || config?.icon}</span>
          </div>
          {/* Subtle texture */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.05),transparent_70%)]" />
        </div>
      )}

      {/* Content positioned at bottom — right padding clears action buttons */}
      <div className="absolute inset-0 flex flex-col justify-end p-5 pb-16 pr-16 sm:p-8 sm:pb-24 sm:pr-24 md:p-12 md:pb-16 md:pr-12">
        {/* Category badge */}
        <div className="mb-3 sm:mb-4">
          <span className={classNames(
            'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold backdrop-blur-sm',
            config?.bgColor || 'bg-gray-800',
            config?.color || 'text-gray-400'
          )}>
            <span>{config?.icon}</span>
            {config?.label}
          </span>
        </div>

        {/* Title */}
        <h1 className={classNames(
          'text-3xl sm:text-5xl md:text-6xl font-bold text-white mb-2 sm:mb-3 leading-tight transition-all duration-500',
          isActive ? 'opacity-100 translate-y-0' : 'opacity-80 translate-y-2'
        )}>
          {item.name}
        </h1>

        {/* Aliases */}
        {item.aliases && item.aliases.length > 0 && (
          <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 italic line-clamp-1">
            Also known as: {item.aliases.slice(0, 3).join(', ')}
          </p>
        )}

        {/* Summary */}
        {item.ai_summary && (
          <p className={classNames(
            'text-sm sm:text-base md:text-lg text-gray-300 max-w-2xl leading-relaxed mb-4 sm:mb-6 line-clamp-3 transition-all duration-500 delay-100',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-2'
          )}>
            {item.ai_summary}
          </p>
        )}

        {/* Quick fact pills — horizontal scroll on mobile */}
        {qf && (
          <div className={classNames(
            'flex gap-1.5 sm:gap-2 mb-4 sm:mb-6 transition-all duration-500 delay-200 overflow-x-auto scrollbar-hide -mx-1 px-1 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible',
            isActive ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-2'
          )}>
            {dangerStyle && qf.danger_level && (
              <span className={classNames(
                'inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold backdrop-blur-sm shadow-lg flex-shrink-0',
                dangerStyle.bg, dangerStyle.text, dangerStyle.glow
              )}>
                <AlertTriangle className="w-3 h-3" />
                Danger: {qf.danger_level.split(' ')[0]}
              </span>
            )}
            {qf.origin && (
              <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-white/10 text-gray-300 backdrop-blur-sm flex-shrink-0">
                <MapPin className="w-3 h-3" />
                {qf.origin.length > 25 ? qf.origin.substring(0, 23) + '...' : qf.origin}
              </span>
            )}
            {qf.classification && (
              <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-white/10 text-gray-300 backdrop-blur-sm flex-shrink-0">
                <Tag className="w-3 h-3" />
                {qf.classification.length > 20 ? qf.classification.substring(0, 18) + '...' : qf.classification}
              </span>
            )}
            {qf.first_documented && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 text-gray-300 backdrop-blur-sm flex-shrink-0">
                <Calendar className="w-3 h-3" />
                {qf.first_documented.length > 25 ? qf.first_documented.substring(0, 23) + '...' : qf.first_documented}
              </span>
            )}
          </div>
        )}

        {/* CTA */}
        <div className={classNames(
          'flex items-center gap-3 transition-all duration-500 delay-300',
          isActive ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-2'
        )}>
          <Link
            href={'/phenomena/' + item.slug}
            className={classNames(
              'inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full font-semibold text-sm transition-all',
              'bg-white text-gray-900 hover:bg-gray-100 active:bg-gray-200 hover:shadow-lg hover:shadow-white/10'
            )}
          >
            <Eye className="w-4 h-4" />
            Read Full Entry
            <ArrowRight className="w-4 h-4" />
          </Link>
          {item.report_count > 0 && (
            <span className="text-xs sm:text-sm text-gray-500">
              {item.report_count} report{item.report_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Right sidebar actions (TikTok-style) — repositioned for mobile */}
      <div className={classNames(
        'absolute right-3 sm:right-6 bottom-20 sm:bottom-40 md:bottom-24 flex flex-col items-center gap-4 sm:gap-5 transition-all duration-500',
        isActive ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
      )}>
        <button
          onClick={function (e) {
            e.stopPropagation()
            if (!user) {
              onShowSignup(true)
            }
            // TODO: implement save functionality for logged-in users
          }}
          className="flex flex-col items-center gap-1 text-white/70 hover:text-white transition-colors"
          title="Save"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gray-800/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-gray-700/60 transition-colors">
            <Bookmark className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <span className="text-[10px]">Save</span>
        </button>

        <button
          onClick={function (e) {
            e.stopPropagation()
            if (navigator.share) {
              navigator.share({
                title: item.name,
                text: item.ai_summary || 'Discover ' + item.name + ' on Paradocs',
                url: window.location.origin + '/phenomena/' + item.slug,
              }).catch(function () {})
            } else {
              navigator.clipboard.writeText(window.location.origin + '/phenomena/' + item.slug)
            }
          }}
          className="flex flex-col items-center gap-1 text-white/70 hover:text-white transition-colors"
          title="Share"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gray-800/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-gray-700/60 transition-colors">
            <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <span className="text-[10px]">Share</span>
        </button>

        <Link
          href={'/phenomena?category=' + item.category}
          className="flex flex-col items-center gap-1 text-white/70 hover:text-white transition-colors"
          title="More like this"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gray-800/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-gray-700/60 transition-colors">
            <Compass className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <span className="text-[10px]">More</span>
        </Link>
      </div>
    </div>
  )
}
