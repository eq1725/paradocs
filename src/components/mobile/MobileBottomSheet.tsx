'use client'

import { classNames } from '@/lib/utils'
import { X } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'

interface MobileBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  /** Initial snap point as percentage of viewport height */
  snapPoint?: 'peek' | 'half' | 'full'
  /** Whether to show the close button in the header */
  showClose?: boolean
  /** Whether swipe-to-dismiss is enabled */
  dismissible?: boolean
  /** Additional class names for the sheet content area */
  contentClassName?: string
  children: React.ReactNode
}

/** Snap point heights as vh percentages */
var SNAP_POINTS = {
  peek: 35,
  half: 55,
  full: 90,
}

/** Minimum velocity (px/ms) to trigger a dismiss */
var DISMISS_VELOCITY = 0.5

/** Minimum drag distance (px) before considering it a dismiss */
var DISMISS_THRESHOLD = 80

export function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  snapPoint,
  showClose,
  dismissible,
  contentClassName,
  children,
}: MobileBottomSheetProps) {
  var initialSnap = snapPoint || 'half'
  var showCloseButton = showClose !== false
  var isDismissible = dismissible !== false

  var [currentHeight, setCurrentHeight] = useState(SNAP_POINTS[initialSnap])
  var [isDragging, setIsDragging] = useState(false)
  var [isAnimating, setIsAnimating] = useState(false)

  var sheetRef = useRef<HTMLDivElement>(null)
  var dragStartY = useRef(0)
  var dragStartHeight = useRef(0)
  var dragStartTime = useRef(0)
  var lastY = useRef(0)

  // Reset height when opened with a new snap point
  useEffect(function() {
    if (isOpen) {
      setCurrentHeight(SNAP_POINTS[initialSnap])
      setIsAnimating(true)
      // Lock body scroll
      document.body.classList.add('sheet-open')
    } else {
      document.body.classList.remove('sheet-open')
    }
    return function() {
      document.body.classList.remove('sheet-open')
    }
  }, [isOpen, initialSnap])

  var handleDismiss = useCallback(function() {
    setIsAnimating(true)
    setCurrentHeight(0)
    // Wait for animation then close
    setTimeout(function() {
      onClose()
    }, 300)
  }, [onClose])

  var handleTouchStart = useCallback(function(e: React.TouchEvent) {
    if (!isDismissible) return
    var touch = e.touches[0]
    dragStartY.current = touch.clientY
    dragStartHeight.current = currentHeight
    dragStartTime.current = Date.now()
    lastY.current = touch.clientY
    setIsDragging(true)
    setIsAnimating(false)
  }, [currentHeight, isDismissible])

  var handleTouchMove = useCallback(function(e: React.TouchEvent) {
    if (!isDragging) return
    var touch = e.touches[0]
    var deltaY = dragStartY.current - touch.clientY
    var deltaVh = (deltaY / window.innerHeight) * 100
    var newHeight = Math.max(0, Math.min(95, dragStartHeight.current + deltaVh))
    lastY.current = touch.clientY
    setCurrentHeight(newHeight)
  }, [isDragging])

  var handleTouchEnd = useCallback(function() {
    if (!isDragging) return
    setIsDragging(false)
    setIsAnimating(true)

    var deltaY = lastY.current - dragStartY.current
    var deltaTime = Date.now() - dragStartTime.current
    var velocity = Math.abs(deltaY) / deltaTime

    // Swiped down fast enough to dismiss
    if (deltaY > 0 && velocity > DISMISS_VELOCITY && isDismissible) {
      handleDismiss()
      return
    }

    // Dragged past dismiss threshold
    if (deltaY > DISMISS_THRESHOLD && isDismissible) {
      handleDismiss()
      return
    }

    // Snap to nearest snap point
    var snapValues = [SNAP_POINTS.peek, SNAP_POINTS.half, SNAP_POINTS.full]
    var closest = snapValues[0]
    var closestDist = Math.abs(currentHeight - closest)
    for (var i = 1; i < snapValues.length; i++) {
      var dist = Math.abs(currentHeight - snapValues[i])
      if (dist < closestDist) {
        closest = snapValues[i]
        closestDist = dist
      }
    }
    setCurrentHeight(closest)
  }, [isDragging, currentHeight, isDismissible, handleDismiss])

  if (!isOpen && currentHeight === 0) return null

  var heightStyle = currentHeight + 'vh'

  return (
    <>
      {/* Backdrop */}
      <div
        className={classNames(
          'fixed inset-0 z-40 transition-opacity duration-300 md:hidden',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={isDismissible ? handleDismiss : undefined}
        style={{ background: 'rgba(0, 0, 0, ' + (isOpen ? '0.5' : '0') + ')' }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={classNames(
          'fixed bottom-0 left-0 right-0 z-50 md:hidden',
          'bg-gray-900 rounded-t-2xl border-t border-gray-800',
          'flex flex-col',
          isAnimating && !isDragging ? 'transition-all duration-300 ease-out' : '',
          !isOpen && !isDragging ? 'pointer-events-none' : ''
        )}
        style={{
          height: heightStyle,
          maxHeight: '95vh',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        }}
      >
        {/* Drag handle area */}
        <div
          className="flex-shrink-0 pt-3 pb-2 flex justify-center cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="sheet-handle" />
        </div>

        {/* Header (optional) */}
        {(title || showCloseButton) && (
          <div className="flex-shrink-0 px-4 pb-3 flex items-center justify-between border-b border-gray-800">
            <h2 className="text-base font-semibold text-white truncate">
              {title || ''}
            </h2>
            {showCloseButton && (
              <button
                onClick={handleDismiss}
                className="p-2 -mr-1 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div
          className={classNames(
            'flex-1 overflow-y-auto overflow-x-hidden overscroll-contain',
            contentClassName || ''
          )}
        >
          {children}
        </div>
      </div>
    </>
  )
}

export default MobileBottomSheet
