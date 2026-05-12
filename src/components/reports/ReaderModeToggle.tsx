'use client'

/**
 * ReaderModeToggle + useReaderMode — V10.5
 *
 * Two pieces in one file:
 *
 *   useReaderMode() — hook returning { reader, toggle } where
 *   `reader` is the persisted boolean and `toggle` flips it.
 *   Persisted to localStorage so the choice sticks across
 *   visits. Default OFF.
 *
 *   <ReaderModeToggle /> — small floating pill button that
 *   flips the hook. Place it in the page chrome. When reader
 *   mode is ON, the page applies the .reader-mode class to its
 *   root and the consumer's CSS handles the typography changes
 *   (larger body, tighter chrome).
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Type, BookOpen } from 'lucide-react'

const STORAGE_KEY = 'paradocs_reader_mode_v1'

export function useReaderMode() {
  const [reader, setReader] = useState(false)

  useEffect(() => {
    try {
      setReader(localStorage.getItem(STORAGE_KEY) === '1')
    } catch { /* localStorage unavailable */ }
  }, [])

  const toggle = useCallback(() => {
    setReader(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  return { reader, toggle }
}

export interface ReaderModeToggleProps {
  reader: boolean
  onToggle: () => void
  className?: string
}

export default function ReaderModeToggle({ reader, onToggle, className }: ReaderModeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        'inline-flex items-center justify-center w-11 h-11 rounded-full backdrop-blur-sm border transition-colors ' +
        (reader
          ? 'bg-purple-600/30 border-purple-500/60 text-purple-100'
          : 'bg-gray-900/80 border-gray-700 text-gray-300 hover:bg-gray-800') +
        ' ' + (className || '')
      }
      aria-label={reader ? 'Exit reader mode' : 'Reader mode'}
      aria-pressed={reader}
      title={reader ? 'Exit reader mode' : 'Reader mode'}
    >
      {reader ? <BookOpen className="w-4 h-4" /> : <Type className="w-4 h-4" />}
    </button>
  )
}
