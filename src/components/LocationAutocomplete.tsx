'use client'

/**
 * LocationAutocomplete — debounced typeahead input with dropdown
 *
 * Panel-feedback (May 2026). Used for city / state / country
 * fields on the submit + video-review forms. As the user types,
 * fetches up to 5 suggestions from /api/geocode/suggest and shows
 * a clickable dropdown.
 *
 * Selecting a suggestion:
 *   - Sets the value to the user-facing token (city / state /
 *     country, depending on `field`).
 *   - Calls onSuggestionSelect(suggestion) with the full structured
 *     object so the parent can co-populate the other location
 *     fields atomically.
 *
 * Free-typing past any suggestion is fine — the field still
 * accepts whatever the user types.
 *
 * SWC: var + function() form.
 */

import React, { useEffect, useRef, useState } from 'react'

export interface GeocodeSuggestion {
  label: string
  city: string | null
  state: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
}

interface LocationAutocompleteProps {
  /** Which field this input represents — drives the Mapbox `types`
   *  filter so a "city" input doesn't return countries. */
  field: 'city' | 'state' | 'country'
  value: string
  onChange: (value: string) => void
  /** Called when the user picks a suggestion. Parent should use the
   *  structured object to atomically fill related fields. */
  onSuggestionSelect?: (suggestion: GeocodeSuggestion) => void
  placeholder?: string
  className?: string
}

var DEBOUNCE_MS = 250
var MIN_QUERY_CHARS = 2

function typesForField(field: 'city' | 'state' | 'country'): string {
  if (field === 'city') return 'place,locality'
  if (field === 'state') return 'region'
  if (field === 'country') return 'country'
  return 'place,locality,region,country'
}

function pickValueForField(s: GeocodeSuggestion, field: 'city' | 'state' | 'country'): string {
  if (field === 'city') return s.city || s.label
  if (field === 'state') return s.state || s.label
  if (field === 'country') return s.country || s.label
  return s.label
}

export default function LocationAutocomplete(props: LocationAutocompleteProps) {
  var [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  var [open, setOpen] = useState(false)
  var [highlightIdx, setHighlightIdx] = useState(-1)
  var debounceRef = useRef<number | null>(null)
  var wrapperRef = useRef<HTMLDivElement | null>(null)
  var lastQueryRef = useRef<string>('')

  // Close dropdown when clicking outside.
  useEffect(function () {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return function () { document.removeEventListener('mousedown', onClick) }
  }, [])

  function fetchSuggestions(q: string) {
    if (!q || q.length < MIN_QUERY_CHARS) {
      setSuggestions([])
      setOpen(false)
      return
    }
    var types = typesForField(props.field)
    lastQueryRef.current = q
    fetch('/api/geocode/suggest?q=' + encodeURIComponent(q) + '&types=' + encodeURIComponent(types))
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (data: any) {
        // Ignore stale responses.
        if (lastQueryRef.current !== q) return
        if (data && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions)
          setOpen(true)
          setHighlightIdx(-1)
        } else {
          setSuggestions([])
          setOpen(false)
        }
      })
      .catch(function () { /* silent */ })
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    var v = e.target.value
    props.onChange(v)
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(function () { fetchSuggestions(v) }, DEBOUNCE_MS)
  }

  function handleSelect(s: GeocodeSuggestion) {
    var nextValue = pickValueForField(s, props.field)
    props.onChange(nextValue)
    if (props.onSuggestionSelect) props.onSuggestionSelect(s)
    setOpen(false)
    setSuggestions([])
    setHighlightIdx(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(function (i) { return Math.min(i + 1, suggestions.length - 1) })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(function (i) { return Math.max(i - 1, -1) })
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault()
      handleSelect(suggestions[highlightIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={props.value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={function () {
          if (suggestions.length > 0) setOpen(true)
        }}
        placeholder={props.placeholder}
        className={props.className || 'w-full bg-gray-900/80 border border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500'}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-gray-900 border border-gray-700 rounded-xl shadow-xl"
        >
          {suggestions.map(function (s, i) {
            var active = i === highlightIdx
            return (
              <li
                key={s.label + ':' + i}
                role="option"
                aria-selected={active}
                onMouseDown={function (e) { e.preventDefault(); handleSelect(s) }}
                onMouseEnter={function () { setHighlightIdx(i) }}
                className={
                  'px-3 py-2 text-sm cursor-pointer leading-snug ' +
                  (active ? 'bg-purple-600/30 text-purple-100' : 'text-gray-200 hover:bg-gray-800')
                }
              >
                {s.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
