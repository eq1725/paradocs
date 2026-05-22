/**
 * CountryTypeahead — V11.15.1
 *
 * Searchable country picker replacing the 200-option <select> dropdown
 * that was painful on mobile. Per SME panel (Persona C, mobile UX):
 *   - Default: input with "Search countries..." placeholder
 *   - As user types: filtered, ranked list dropdown opens
 *   - Top suggestions when empty input: countries with most reports
 *     (sourced from regionBuckets passed by parent)
 *   - Selected country shows as inline chip with X to clear
 *
 * Used on both mobile and desktop. Compact and touch-friendly.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Search, X, MapPin } from 'lucide-react'

interface CountryOption {
  code?: string
  name: string
  count?: number
}

interface CountryTypeaheadProps {
  /** Currently selected country name (or null). */
  value: string | null
  /** Called with new country name or null when cleared. */
  onChange: (country: string | null) => void
  /** Optional list of all valid countries (e.g. COUNTRIES constant). */
  allCountries: string[]
  /** Optional pre-ranked top countries with counts for default suggestions. */
  rankedCountries?: Array<{ code?: string; name: string; total: number }>
  /** Placeholder for the input. */
  placeholder?: string
  /** Optional className passthrough. */
  className?: string
}

export default function CountryTypeahead({
  value,
  onChange,
  allCountries,
  rankedCountries,
  placeholder = 'Search countries...',
  className,
}: CountryTypeaheadProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click.
  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick)
    }
  }, [isOpen])

  // Build the candidate list: filtered by query if user is typing,
  // otherwise ranked-by-count suggestions (or alphabetical as fallback).
  const suggestions: CountryOption[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length > 0) {
      const matches: CountryOption[] = []
      // Prefer matches from rankedCountries first (they have counts)
      const seen = new Set<string>()
      if (rankedCountries) {
        for (const r of rankedCountries) {
          if (r.name.toLowerCase().includes(q)) {
            matches.push({ code: r.code, name: r.name, count: r.total })
            seen.add(r.name.toLowerCase())
            if (matches.length >= 30) break
          }
        }
      }
      // Then any other countries from the master list
      for (const c of allCountries) {
        if (matches.length >= 30) break
        if (seen.has(c.toLowerCase())) continue
        if (c.toLowerCase().includes(q)) matches.push({ name: c })
      }
      return matches
    }
    // Empty query: show top ranked countries
    if (rankedCountries && rankedCountries.length > 0) {
      return rankedCountries
        .slice(0, 12)
        .map(r => ({ code: r.code, name: r.name, count: r.total }))
    }
    // Fallback: alphabetical top 12
    return allCountries.slice(0, 12).map(c => ({ name: c }))
  }, [query, allCountries, rankedCountries])

  function selectCountry(name: string | null) {
    onChange(name)
    setQuery('')
    setIsOpen(false)
    if (inputRef.current && name === null) {
      // Refocus input when clearing so user can search again
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <div ref={containerRef} className={'relative ' + (className || '')}>
      {/* Selected country chip (replaces input when active) */}
      {value && !isOpen ? (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-purple-500/15 border border-purple-500/30 rounded-lg">
          <MapPin size={14} className="text-purple-300 flex-shrink-0" />
          <span className="flex-1 text-sm text-white truncate">{value}</span>
          <button
            type="button"
            onClick={() => selectCountry(null)}
            className="text-purple-300 hover:text-white p-0.5 rounded transition-colors"
            aria-label={'Clear ' + value + ' country filter'}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true) }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className="w-full pl-9 pr-3 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      {/* Dropdown suggestions */}
      {isOpen && !value && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-gray-900/98 backdrop-blur-lg border border-white/10 rounded-lg shadow-2xl z-50">
          {query.length === 0 && (
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/5">
              Top countries by reports
            </div>
          )}
          {suggestions.map((opt) => (
            <button
              key={opt.name}
              type="button"
              onClick={() => selectCountry(opt.name)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/8 focus:bg-white/8 focus:outline-none transition-colors"
            >
              <span className="text-sm text-gray-100 truncate">{opt.name}</span>
              {typeof opt.count === 'number' && opt.count > 0 && (
                <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">
                  {opt.count.toLocaleString()}
                </span>
              )}
            </button>
          ))}
          {suggestions.length === 0 && (
            <div className="px-3 py-3 text-sm text-gray-500">No matches.</div>
          )}
        </div>
      )}
    </div>
  )
}
