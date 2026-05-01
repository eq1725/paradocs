'use client'

/**
 * GestureTutorial — first-run interactive overlay teaching the four-direction
 * gesture grammar on /discover (Today). Replaces the 6%-opacity vertical text
 * hints that nobody discovered.
 *
 * Steps:
 *   1. Swipe up   → next case
 *   2. Swipe right → save
 *   3. Swipe left  → dismiss
 *   4. Swipe down  → rabbit hole (related cases)
 *
 * The tutorial advances automatically via 1500ms-tick or on tap "Got it".
 * Persists completion to localStorage so it only shows once.
 *
 * Also exports a tiny check helper used by /discover so the Tutorial isn't
 * shown after the user has already completed it.
 *
 * SWC: var, function expressions, string concat only.
 */

import React, { useEffect, useState } from 'react'

var STORAGE_KEY = 'today_gesture_tutorial_complete_v1'

export function isGestureTutorialComplete(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch (e) {
    return true
  }
}

export function markGestureTutorialComplete() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch (e) {}
}

export function resetGestureTutorial() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {}
}

interface Step {
  id: string
  arrow: string
  axis: 'up' | 'down' | 'left' | 'right'
  title: string
  detail: string
  color: string
}

var STEPS: Step[] = [
  { id: 'up',    arrow: '↑', axis: 'up',    title: 'Swipe up',    detail: 'Next case in your feed.',          color: '#9000F0' },
  { id: 'right', arrow: '→', axis: 'right', title: 'Swipe right', detail: 'Save — we keep it in your library.', color: '#FFD166' },
  { id: 'left',  arrow: '←', axis: 'left',  title: 'Swipe left',  detail: 'Dismiss — we’ll show fewer like it.', color: '#94A3B8' },
  { id: 'down',  arrow: '↓', axis: 'down',  title: 'Swipe down',  detail: 'Open the rabbit hole — related cases.', color: '#4FC3F7' },
]

function arrowOffset(axis: Step['axis']): { dx: string, dy: string } {
  if (axis === 'up')    return { dx: '0',     dy: '-14px' }
  if (axis === 'down')  return { dx: '0',     dy: '14px'  }
  if (axis === 'left')  return { dx: '-14px', dy: '0'     }
  return { dx: '14px', dy: '0' }
}

export function GestureTutorial(props: { onComplete: () => void }) {
  var [stepIdx, setStepIdx] = useState(0)
  var step = STEPS[stepIdx]
  var off = arrowOffset(step.axis)

  // Auto-advance after 2.6s; tap to advance manually.
  useEffect(function () {
    var t = setTimeout(function () {
      advance()
    }, 2600)
    return function () { clearTimeout(t) }
  }, [stepIdx])

  function advance() {
    if (stepIdx >= STEPS.length - 1) {
      markGestureTutorialComplete()
      props.onComplete()
    } else {
      setStepIdx(function (i) { return i + 1 })
    }
  }

  function skip() {
    markGestureTutorialComplete()
    props.onComplete()
  }

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6"
      role="dialog"
      aria-label="Gesture tutorial"
      onClick={advance}
    >
      <button
        onClick={function (e) { e.stopPropagation(); skip() }}
        className="absolute top-5 right-5 text-gray-500 hover:text-white transition-colors text-sm font-sans"
        aria-label="Skip tutorial"
      >
        Skip
      </button>

      {/* Animated arrow */}
      <div
        className="text-7xl md:text-8xl mb-8 today-tutorial-arrow"
        style={{
          color: step.color,
          ['--arrow-dx' as any]: off.dx,
          ['--arrow-dy' as any]: off.dy,
        }}
        aria-hidden="true"
      >
        {step.arrow}
      </div>

      {/* Title */}
      <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-3 text-center">
        {step.title}
      </h2>
      <p className="text-sm md:text-base text-gray-400 font-sans max-w-xs text-center mb-8">
        {step.detail}
      </p>

      {/* Step dots */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map(function (_, i) {
          return (
            <span
              key={i}
              className={'h-1.5 rounded-full transition-all ' + (i === stepIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/25')}
            />
          )
        })}
      </div>

      <button
        onClick={function (e) { e.stopPropagation(); advance() }}
        className="px-6 py-2.5 rounded-full bg-white/10 border border-white/20 text-sm font-sans font-medium text-white hover:bg-white/15 transition-colors"
      >
        {stepIdx === STEPS.length - 1 ? 'Got it' : 'Next'}
      </button>

      <p className="text-[11px] text-gray-600 font-sans mt-6 text-center">
        Tap anywhere to advance
      </p>
    </div>
  )
}

export default GestureTutorial
