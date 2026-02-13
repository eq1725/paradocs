/**
 * DashboardTour Component
 *
 * Feature showcase modal that introduces the engagement features
 * (Constellation Map, Research Streaks, Journal, Weekly Reports)
 * when a user first visits the dashboard.
 */

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Stars,
  Flame,
  BookOpen,
  Newspaper,
  Rocket,
} from 'lucide-react'

// ─── Tour Steps ────────────────────────────────────────────────

interface FeatureStep {
  icon: React.ReactNode
  emoji: string
  title: string
  description: string
  color: string
  glowColor: string
  cta: string
  href: string
}

const FEATURES: FeatureStep[] = [
  {
    icon: <Stars className="w-8 h-8" />,
    emoji: '✦',
    title: 'Your Constellation Map',
    description: 'See your research universe come alive. Each phenomenon you explore becomes a star — watch connections form between UFOs, cryptids, ghosts, and more as you dive deeper into the unknown.',
    color: '#a855f7',
    glowColor: 'rgba(168, 85, 247, 0.15)',
    cta: 'View My Constellation',
    href: '/dashboard/constellation',
  },
  {
    icon: <Flame className="w-8 h-8" />,
    emoji: '🔥',
    title: 'Research Streaks',
    description: 'Build momentum with daily research streaks. Every report you read, every journal entry you write keeps your streak alive. Hit milestones from 3 days to a full year of dedicated investigation.',
    color: '#f97316',
    glowColor: 'rgba(249, 115, 22, 0.15)',
    cta: 'Start Your Streak',
    href: '/dashboard',
  },
  {
    icon: <BookOpen className="w-8 h-8" />,
    emoji: '📓',
    title: 'Investigation Journal',
    description: 'Document your observations, hypotheses, and evidence reviews. Link journal entries to specific reports, tag them by category, and build a personal research archive that grows with you.',
    color: '#60a5fa',
    glowColor: 'rgba(96, 165, 250, 0.15)',
    cta: 'Open Journal',
    href: '/dashboard/journal',
  },
  {
    icon: <Newspaper className="w-8 h-8" />,
    emoji: '📬',
    title: 'Weekly Anomaly Reports',
    description: 'Get personalized weekly digests delivered to your inbox — trending cases, activity in your followed categories, streak updates, and new discoveries tailored to your interests.',
    color: '#34d399',
    glowColor: 'rgba(52, 211, 153, 0.15)',
    cta: 'View Reports',
    href: '/dashboard/digests',
  },
]

// ─── Storage ────────────────────────────────────────────────────

const STORAGE_KEY = 'paradocs_dashboard_tour_complete'

export function hasDashboardTourCompleted(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export function resetDashboardTour() {
  localStorage.removeItem(STORAGE_KEY)
}

// ─── Component ──────────────────────────────────────────────────

interface DashboardTourProps {
  onComplete: () => void
}

export default function DashboardTour({ onComplete }: DashboardTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  const feature = FEATURES[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === FEATURES.length - 1

  // Fade in
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleComplete()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext()
      else if (e.key === 'ArrowLeft') handleBack()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStep])

  const handleNext = useCallback(() => {
    if (isLast) {
      handleComplete()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }, [isLast])

  const handleBack = useCallback(() => {
    if (!isFirst) setCurrentStep(prev => prev - 1)
  }, [isFirst])

  const handleComplete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setIsVisible(false)
    setTimeout(onComplete, 200)
  }, [onComplete])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleComplete}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(15, 15, 35, 0.98), rgba(10, 10, 25, 0.98))',
          borderColor: `${feature.color}33`,
          boxShadow: `0 0 60px ${feature.glowColor}, 0 25px 80px rgba(0, 0, 0, 0.6)`,
          transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
        }}
      >
        {/* Close button */}
        <button
          onClick={handleComplete}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-10 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top header */}
        <div className="text-center pt-6 pb-2 px-6">
          <p className="text-xs font-medium uppercase tracking-[3px] text-gray-500">
            {currentStep === 0 ? "What's New" : `Feature ${currentStep + 1} of ${FEATURES.length}`}
          </p>
        </div>

        {/* Feature content */}
        <div className="px-8 pb-6 pt-2 text-center" key={currentStep}>
          {/* Icon */}
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-5"
            style={{
              background: feature.glowColor,
              color: feature.color,
              boxShadow: `0 0 30px ${feature.glowColor}`,
              transition: 'all 0.4s ease',
            }}
          >
            {feature.icon}
          </div>

          {/* Title */}
          <h2
            className="text-2xl font-bold mb-3"
            style={{ color: feature.color, transition: 'color 0.4s ease' }}
          >
            {feature.title}
          </h2>

          {/* Description */}
          <p className="text-gray-300 text-sm leading-relaxed max-w-sm mx-auto mb-6">
            {feature.description}
          </p>

          {/* CTA */}
          <Link
            href={feature.href}
            onClick={handleComplete}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:brightness-110"
            style={{
              background: `linear-gradient(135deg, ${feature.color}, ${feature.color}cc)`,
              boxShadow: `0 4px 15px ${feature.glowColor}`,
            }}
          >
            {feature.cta}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-8 pb-6">
          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {FEATURES.map((f, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className="transition-all duration-300"
                style={{
                  width: i === currentStep ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: i === currentStep
                    ? feature.color
                    : i < currentStep
                      ? `${feature.color}66`
                      : 'rgba(255, 255, 255, 0.15)',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>

          {/* Nav buttons */}
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
                Skip all
              </button>
            )}
            {!isLast ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all"
                style={{
                  background: `linear-gradient(135deg, ${feature.color}, ${feature.color}cc)`,
                  boxShadow: `0 2px 10px ${feature.glowColor}`,
                }}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all"
                style={{
                  background: 'linear-gradient(135deg, #5b63f1, #4f46e5)',
                  boxShadow: '0 2px 10px rgba(91, 99, 241, 0.3)',
                }}
              >
                <Rocket className="w-4 h-4" />
                Let's Go
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
