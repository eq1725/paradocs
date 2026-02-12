import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X, ChevronRight, ChevronLeft, Sparkles, MapPin, Brain, Eye, Layers, BarChart3, BookOpen, Compass } from 'lucide-react'

// ─── Tour Step Configuration ─────────────────────────────────────────────

interface TourStep {
  targetSelector: string
  title: string
  description: string
  icon: React.ReactNode
}

const TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour-step="header"]',
    title: 'Comprehensive Case Files',
    description: 'Every case is categorized, dated, and located. See the content type, phenomenon category, credibility rating, and key details at a glance.',
    icon: <BookOpen className="w-5 h-5" />,
  },
  {
    targetSelector: '[data-tour-step="media"]',
    title: 'All Evidence, One Place',
    description: 'Photos, videos, documents — we compile every piece of available media for each case. Click any image to view it full size.',
    icon: <Eye className="w-5 h-5" />,
  },
  {
    targetSelector: '[data-tour-step="description"]',
    title: 'The Full Story',
    description: 'Read the complete account with evidence tags showing what physical proof, photos, or official reports exist for this case.',
    icon: <Layers className="w-5 h-5" />,
  },
  {
    targetSelector: '[data-tour-step="info-grid"]',
    title: 'At-a-Glance Details',
    description: 'Content type, credibility assessment, source tracking, and timeline — key metadata organized into quick-reference cards.',
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    targetSelector: '[data-tour-step="ai-insight"]',
    title: 'AI-Powered Analysis',
    description: 'Our AI analyzes each case for credibility indicators, cross-references patterns across thousands of reports, and provides an objective assessment.',
    icon: <Brain className="w-5 h-5" />,
  },
  {
    targetSelector: '[data-tour-step="location-map"]',
    title: 'Geographic Intelligence',
    description: 'See exactly where events occurred and discover nearby reports. Patterns emerge when you see cases plotted on a map.',
    icon: <MapPin className="w-5 h-5" />,
  },
  {
    targetSelector: '[data-tour-step="environmental"]',
    title: 'Scientific Context',
    description: 'Moon phase, weather conditions, and structured observation data — the environmental and academic context surrounding each event.',
    icon: <Compass className="w-5 h-5" />,
  },
  {
    targetSelector: '[data-tour-step="sidebar"]',
    title: 'Connected Cases',
    description: 'Discover related reports, pattern connections, and linked phenomena. Every case is part of a larger picture — explore the web of connections.',
    icon: <Sparkles className="w-5 h-5" />,
  },
]

// Tooltip is roughly this tall — used for scroll calculations
const TOOLTIP_HEIGHT = 200
const TOOLTIP_GAP = 16

// ─── Component ───────────────────────────────────────────────────────────

interface OnboardingTourProps {
  onComplete: () => void
}

export default function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const [isAnimating, setIsAnimating] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const step = TOUR_STEPS[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === TOUR_STEPS.length - 1

  // ─── Position calculation ──────────────────────────────────
  // Always uses absolute positioning (relative to document).
  // Tooltip goes below target by default, or above if below
  // would go off-screen.

  const updatePosition = useCallback(() => {
    if (!step) return

    const target = document.querySelector(step.targetSelector)
    if (!target) {
      if (!isLast) {
        setCurrentStep(prev => prev + 1)
      } else {
        handleComplete()
      }
      return
    }

    const rect = target.getBoundingClientRect()
    // For very tall elements (like the description), cap the spotlight
    // so it doesn't cover the entire viewport. Show the top portion.
    const maxSpotlightHeight = Math.min(rect.height, window.innerHeight * 0.45)
    const cappedRect = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: maxSpotlightHeight,
      bottom: rect.top + maxSpotlightHeight,
      right: rect.right,
    }
    setTargetRect(cappedRect as DOMRect)

    // Calculate tooltip placement
    const tooltipWidth = Math.min(380, window.innerWidth - 32)
    const isMobile = window.innerWidth < 768

    // Determine if tooltip goes below or above the (capped) target
    const spaceBelow = window.innerHeight - cappedRect.bottom
    const placeBelow = spaceBelow >= TOOLTIP_HEIGHT + TOOLTIP_GAP

    // For sidebar step, position tooltip to the left of the sidebar
    const isSidebarStep = step.targetSelector.includes('sidebar')

    let style: React.CSSProperties = {
      position: 'absolute',
      width: isMobile ? 'calc(100vw - 32px)' : `${tooltipWidth}px`,
      maxWidth: '380px',
    }

    if (isMobile) {
      // Mobile: always below, full width
      style.left = '16px'
      style.top = `${cappedRect.bottom + TOOLTIP_GAP + window.scrollY}px`
    } else if (isSidebarStep && rect.left > tooltipWidth + 32) {
      // Sidebar: position tooltip to the left of the sidebar
      style.top = `${cappedRect.top + window.scrollY}px`
      style.left = `${rect.left - tooltipWidth - TOOLTIP_GAP}px`
    } else if (placeBelow) {
      // Below the target
      style.top = `${cappedRect.bottom + TOOLTIP_GAP + window.scrollY}px`
      style.left = `${Math.max(16, Math.min(rect.left, window.innerWidth - tooltipWidth - 16))}px`
    } else {
      // Above the target
      style.top = `${cappedRect.top - TOOLTIP_HEIGHT - TOOLTIP_GAP + window.scrollY}px`
      style.left = `${Math.max(16, Math.min(rect.left, window.innerWidth - tooltipWidth - 16))}px`
    }

    setTooltipStyle(style)
  }, [step, currentStep, isLast])

  // ─── Scroll to target, ensuring both target + tooltip are visible ──────

  useEffect(() => {
    if (!step) return

    setIsAnimating(true)

    const isSidebarStep = step.targetSelector.includes('sidebar')

    const target = document.querySelector(step.targetSelector)
    if (target) {
      const rect = target.getBoundingClientRect()
      const maxSpotlightHeight = Math.min(rect.height, window.innerHeight * 0.45)

      // For sticky sidebar: unstick it temporarily by scrolling to the
      // absolute top of the element (its offset from document top).
      // Use a more generous top margin so the element + spotlight padding is fully visible.
      const elementAbsoluteTop = window.scrollY + rect.top

      // Desired position: element top at ~20% from viewport top
      // This gives comfortable room for both the spotlight + tooltip below
      const desiredTargetTopInViewport = window.innerHeight * 0.2

      // For sidebar, scroll so the top of the aside is visible
      // The sticky positioning means we need to scroll to where the aside starts in the document
      let scrollTarget: number
      if (isSidebarStep) {
        // For sticky elements, get the actual document position
        const htmlEl = target as HTMLElement
        const offsetTop = htmlEl.offsetTop
        scrollTarget = offsetTop - desiredTargetTopInViewport
      } else {
        scrollTarget = elementAbsoluteTop - desiredTargetTopInViewport
      }

      // Also check: if tooltip goes below, make sure we scroll enough
      // that the bottom of tooltip is visible
      const totalNeededHeight = maxSpotlightHeight + TOOLTIP_GAP + TOOLTIP_HEIGHT + 60
      const minScrollToShowAll = elementAbsoluteTop - (window.innerHeight - totalNeededHeight)

      const scrollTo = Math.max(0, Math.max(scrollTarget, minScrollToShowAll))

      window.scrollTo({
        top: scrollTo,
        behavior: currentStep === 0 ? 'auto' : 'smooth',
      })

      // Wait for scroll to settle, then calculate tooltip position
      // Use longer delay for sidebar since sticky repositioning takes time
      const delay = currentStep === 0 ? 150 : (isSidebarStep ? 800 : 600)
      const timer = setTimeout(() => {
        // Recalculate after scroll — important for sticky elements
        updatePosition()
        setIsAnimating(false)
        if (!isVisible) setIsVisible(true)
      }, delay)

      return () => clearTimeout(timer)
    } else {
      setIsAnimating(false)
      if (!isVisible) setIsVisible(true)
    }
  }, [currentStep, step, updatePosition])

  // ─── Resize listener (no scroll listener — we control scroll) ──────────

  useEffect(() => {
    const handleResize = () => updatePosition()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updatePosition])

  // ─── ResizeObserver for target element changes ─────────────

  useEffect(() => {
    if (!step) return

    const target = document.querySelector(step.targetSelector)
    if (!target) return

    resizeObserverRef.current = new ResizeObserver(() => {
      updatePosition()
    })
    resizeObserverRef.current.observe(target)

    return () => {
      resizeObserverRef.current?.disconnect()
    }
  }, [step, updatePosition])

  // ─── Keyboard navigation ───────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleComplete()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        handleBack()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStep])

  // ─── Navigation handlers ───────────────────────────────────

  function handleNext() {
    if (isLast) {
      handleComplete()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  function handleBack() {
    if (!isFirst) {
      setCurrentStep(prev => prev - 1)
    }
  }

  function handleComplete() {
    localStorage.setItem('paradocs_onboarding_complete', 'true')
    onComplete()
  }

  // ─── Spotlight mask (box-shadow trick for the cutout) ──────

  function getSpotlightStyle(): React.CSSProperties {
    if (!targetRect) return {}

    const padding = 8
    return {
      position: 'fixed',
      top: targetRect.top - padding,
      left: targetRect.left - padding,
      width: targetRect.width + padding * 2,
      height: targetRect.height + padding * 2,
      borderRadius: '12px',
      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)',
      pointerEvents: 'none' as const,
      zIndex: 9998,
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    }
  }

  if (!step) return null

  return (
    <div className="onboarding-tour" style={{ zIndex: 9997 }}>
      {/* Backdrop - catches clicks outside */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 9997 }}
        onClick={(e) => {
          e.stopPropagation()
        }}
      />

      {/* Spotlight cutout */}
      {targetRect && (
        <div style={getSpotlightStyle()} />
      )}

      {/* Tooltip */}
      {isVisible && !isAnimating && (
        <div
          ref={tooltipRef}
          style={{ ...tooltipStyle, zIndex: 9999 }}
          className="animate-fade-in"
        >
          <div
            className="rounded-xl border shadow-2xl"
            style={{
              background: 'rgba(15, 15, 30, 0.95)',
              backdropFilter: 'blur(20px)',
              borderColor: 'rgba(91, 99, 241, 0.3)',
              boxShadow: '0 0 30px rgba(91, 99, 241, 0.15), 0 20px 60px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-4 pb-2">
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-lg"
                  style={{
                    background: 'rgba(91, 99, 241, 0.15)',
                    color: '#5b63f1',
                  }}
                >
                  {step.icon}
                </div>
                <div>
                  <h3 className="font-display font-bold text-white text-base leading-tight">
                    {step.title}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {currentStep + 1} of {TOUR_STEPS.length}
                  </span>
                </div>
              </div>
              <button
                onClick={handleComplete}
                className="text-gray-500 hover:text-white transition-colors p-1 -mt-1 -mr-1"
                title="Skip tour"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Description */}
            <div className="px-4 pb-3">
              <p className="text-gray-300 text-sm leading-relaxed">
                {step.description}
              </p>
            </div>

            {/* Progress dots + Navigation */}
            <div className="flex items-center justify-between px-4 pb-4 pt-1">
              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {TOUR_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentStep(i)}
                    className="transition-all duration-300"
                    style={{
                      width: i === currentStep ? '20px' : '6px',
                      height: '6px',
                      borderRadius: '3px',
                      background: i === currentStep
                        ? '#5b63f1'
                        : i < currentStep
                          ? 'rgba(91, 99, 241, 0.4)'
                          : 'rgba(255, 255, 255, 0.15)',
                    }}
                  />
                ))}
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2">
                {!isFirst && (
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                )}
                {isFirst && (
                  <button
                    onClick={handleComplete}
                    className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Skip
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #5b63f1, #4f46e5)',
                    boxShadow: '0 2px 10px rgba(91, 99, 241, 0.3)',
                  }}
                >
                  {isLast ? 'Finish' : 'Next'}
                  {!isLast && <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Utility: Reset onboarding (for testing / settings page) ─────────

export function resetOnboarding() {
  localStorage.removeItem('paradocs_onboarding_complete')
}

export function hasCompletedOnboarding(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem('paradocs_onboarding_complete') === 'true'
}
