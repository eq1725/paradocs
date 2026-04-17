'use client'

/**
 * LabToolbar — reusable search + sort + view-mode control.
 *
 * Used by the Saves feed and Case File detail view. Controlled component —
 * parent owns state and persists to localStorage so user preferences stick
 * across sessions.
 *
 * Mobile-first layout: search stays full-width; sort + view-mode collapse
 * into a popover trigger under 640px to preserve thumb reach.
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  Search, X as XIcon, LayoutGrid, List as ListIcon, Rows,
  ArrowDownAZ, ArrowUp, ArrowDown, Sparkles, Link2, SlidersHorizontal,
} from 'lucide-react'
import { classNames } from '@/lib/utils'

export type LabViewMode = 'grid' | 'list' | 'compact'
export type LabSortMode =
  | 'newest'
  | 'oldest'
  | 'patterns'
  | 'connections'
  | 'compelling'
  | 'alphabetical'

interface LabToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  sort: LabSortMode
  onSortChange: (value: LabSortMode) => void
  viewMode: LabViewMode
  onViewModeChange: (value: LabViewMode) => void
  /** Placeholder text for search input */
  searchPlaceholder?: string
  /** Total item count — shown alongside filtered count when searching */
  totalCount?: number
  /** Filtered count — shown when search is active */
  filteredCount?: number
}

const SORT_OPTIONS: Array<{ value: LabSortMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'newest',       label: 'Newest first',       icon: ArrowDown },
  { value: 'oldest',       label: 'Oldest first',       icon: ArrowUp },
  { value: 'patterns',     label: 'Most patterns',      icon: Sparkles },
  { value: 'connections',  label: 'Most connections',   icon: Link2 },
  { value: 'compelling',   label: 'Compelling first',   icon: Sparkles },
  { value: 'alphabetical', label: 'A → Z',              icon: ArrowDownAZ },
]

const VIEW_MODE_OPTIONS: Array<{ value: LabViewMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'grid',    label: 'Grid view',    icon: LayoutGrid },
  { value: 'list',    label: 'List view',    icon: ListIcon },
  { value: 'compact', label: 'Compact view', icon: Rows },
]

export default function LabToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  viewMode,
  onViewModeChange,
  searchPlaceholder = 'Search saves...',
  totalCount,
  filteredCount,
}: LabToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close the mobile settings menu on outside click / Esc.
  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const activeSort = SORT_OPTIONS.find(o => o.value === sort) || SORT_OPTIONS[0]
  const activeView = VIEW_MODE_OPTIONS.find(o => o.value === viewMode) || VIEW_MODE_OPTIONS[0]

  return (
    <div className="flex items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-8 pr-8 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50 transition-colors"
          aria-label="Search"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Clear search"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Desktop: inline sort + view-mode. Mobile: single popover trigger. */}
      <div className="hidden sm:flex items-center gap-1.5">
        {/* Sort dropdown */}
        <SortDropdown value={sort} onChange={onSortChange} active={activeSort} />

        {/* View mode segmented */}
        <div className="inline-flex items-center rounded-lg bg-white/[0.04] border border-white/10 p-0.5" role="group" aria-label="View mode">
          {VIEW_MODE_OPTIONS.map(opt => {
            const Icon = opt.icon
            const selected = opt.value === viewMode
            return (
              <button
                key={opt.value}
                onClick={() => onViewModeChange(opt.value)}
                className={classNames(
                  'flex items-center justify-center w-7 h-7 rounded-md transition-colors',
                  selected ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-200'
                )}
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={selected}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Mobile popover */}
      <div className="sm:hidden relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="flex items-center gap-1 px-2 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] text-gray-300"
          aria-label="Sort and view options"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute top-full right-0 mt-1 z-20 w-56 bg-gray-950 border border-gray-800 rounded-lg shadow-2xl p-2 space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold px-1 mb-1">Sort by</div>
              <div className="space-y-0.5">
                {SORT_OPTIONS.map(opt => {
                  const Icon = opt.icon
                  const selected = opt.value === sort
                  return (
                    <button
                      key={opt.value}
                      onClick={() => { onSortChange(opt.value); setMenuOpen(false) }}
                      className={classNames(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[11px] transition-colors',
                        selected ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'
                      )}
                    >
                      <Icon className="w-3 h-3 flex-shrink-0" />
                      <span>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="border-t border-white/5 pt-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold px-1 mb-1">View</div>
              <div className="grid grid-cols-3 gap-1">
                {VIEW_MODE_OPTIONS.map(opt => {
                  const Icon = opt.icon
                  const selected = opt.value === viewMode
                  return (
                    <button
                      key={opt.value}
                      onClick={() => { onViewModeChange(opt.value); setMenuOpen(false) }}
                      className={classNames(
                        'flex flex-col items-center gap-0.5 px-2 py-2 rounded text-[10px] transition-colors',
                        selected ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{opt.label.replace(' view', '')}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter result count */}
      {search && typeof filteredCount === 'number' && typeof totalCount === 'number' && (
        <span className="hidden md:block text-[11px] text-gray-500 tabular-nums flex-shrink-0">
          {filteredCount}/{totalCount}
        </span>
      )}
    </div>
  )
}

// ── Sort dropdown ──

function SortDropdown({
  value,
  onChange,
  active,
}: {
  value: LabSortMode
  onChange: (v: LabSortMode) => void
  active: typeof SORT_OPTIONS[number]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const ActiveIcon = active.icon

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] text-gray-300 hover:bg-white/[0.08] transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ActiveIcon className="w-3 h-3" />
        <span>{active.label}</span>
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 z-20 w-48 bg-gray-950 border border-gray-800 rounded-lg shadow-2xl py-1"
          role="menu"
        >
          {SORT_OPTIONS.map(opt => {
            const Icon = opt.icon
            const selected = opt.value === value
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={classNames(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors',
                  selected ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'
                )}
                role="menuitem"
              >
                <Icon className="w-3 h-3 flex-shrink-0" />
                <span>{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
