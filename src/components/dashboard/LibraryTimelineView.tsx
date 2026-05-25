'use client'

/**
 * LibraryTimelineView — Letterboxd Diary pattern for the Lab/Library.
 *
 * Replaces the old grid-first Saves view with a date-headed,
 * reverse-chronological diary. Each month gets a sticky-feel header.
 * Each entry shows: thumbnail · title · location · note · revisit CTA.
 *
 * Why this exists (V11.17.38 PR-7 item 1, expert-panel-driven):
 *   The Library was previously map/list/collections. Map duplicates
 *   the canonical /map page. Collections is fundamentally a filter,
 *   not a view. The 4-person panel landed on Letterboxd Diary as the
 *   strongest analog: a single time-ordered scroll where the user
 *   sees their own research arc grow, with "revisit" affordances
 *   that turn the page into a pull-cue ("oh yeah, that orb sighting
 *   I logged last summer — what's the constellation say now?").
 *
 * Props mirror what LabSavesTab passes to ConstellationListView —
 * we receive a pre-filtered, pre-sorted entry list and just render.
 */

import React, { useMemo } from 'react'
import Link from 'next/link'
import { Eye, MessageCircle, Sparkles } from 'lucide-react'
import type { EntryNode } from '@/lib/constellation-types'

interface LibraryTimelineViewProps {
  entries: EntryNode[]
  onSelectEntry: (entry: EntryNode) => void
}

const CATEGORY_DOT: Record<string, string> = {
  ghost: 'bg-violet-400',
  ufo: 'bg-cyan-400',
  cryptid: 'bg-emerald-400',
  nde: 'bg-amber-300',
  precognition: 'bg-fuchsia-400',
  telepathy: 'bg-rose-400',
  poltergeist: 'bg-orange-400',
  shadow_person: 'bg-slate-400',
  encounter: 'bg-purple-400',
  other: 'bg-gray-400',
}

function monthKey(iso: string): string {
  const d = new Date(iso)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

function monthLabel(key: string): string {
  const [yy, mm] = key.split('-')
  const d = new Date(parseInt(yy), parseInt(mm) - 1, 1)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const month = d.toLocaleString('en-US', { month: 'long' })
  return sameYear ? month : (month + ' ' + d.getFullYear())
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  return String(d.getDate())
}

function dayOfWeek(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { weekday: 'short' })
}

export default function LibraryTimelineView({ entries, onSelectEntry }: LibraryTimelineViewProps) {
  // Group entries by month (already sorted reverse-chron by parent).
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; items: EntryNode[] }[] = []
    let currentKey = ''
    for (const e of entries) {
      const k = monthKey(e.loggedAt)
      if (k !== currentKey) {
        currentKey = k
        groups.push({ key: k, label: monthLabel(k), items: [] })
      }
      groups[groups.length - 1].items.push(e)
    }
    return groups
  }, [entries])

  if (entries.length === 0) return null

  return (
    <div className="space-y-6">
      {grouped.map(group => (
        <section key={group.key}>
          <div className="flex items-baseline justify-between mb-3 px-1">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              {group.label}
            </h3>
            <span className="text-[10px] text-gray-500">
              {group.items.length} {group.items.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <ul className="divide-y divide-gray-800/60 rounded-2xl border border-gray-800/60 bg-gray-950/60 overflow-hidden">
            {group.items.map(entry => (
              <TimelineRow key={entry.id} entry={entry} onSelect={onSelectEntry} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function TimelineRow({ entry, onSelect }: { entry: EntryNode; onSelect: (e: EntryNode) => void }) {
  const dot = CATEGORY_DOT[entry.category] || CATEGORY_DOT.other
  const verdictPill = entry.verdict === 'compelling' ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/20">
      Compelling
    </span>
  ) : entry.verdict === 'inconclusive' ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-500/15 text-gray-400 border border-gray-700/40">
      Inconclusive
    </span>
  ) : null

  // Detail link: prefer report slug, fall back to external URL, then to handler-only.
  const targetHref = entry.slug ? '/reports/' + entry.slug : (entry.externalUrl || null)

  return (
    <li className="group">
      <button
        type="button"
        onClick={() => onSelect(entry)}
        className="w-full text-left flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-white/5 transition-colors"
      >
        {/* Date column */}
        <div className="flex-shrink-0 w-12 text-center pt-0.5">
          <div className="text-xl font-bold text-white leading-none">{dayLabel(entry.loggedAt)}</div>
          <div className="text-[10px] text-gray-500 uppercase mt-0.5">{dayOfWeek(entry.loggedAt)}</div>
        </div>

        {/* Thumbnail */}
        <div className="flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-gray-900 border border-gray-800/60 relative">
          {entry.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-700">
              <Sparkles className="w-5 h-5" />
            </div>
          )}
          <span className={'absolute top-1 right-1 w-2 h-2 rounded-full ring-1 ring-black/40 ' + dot} aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <h4 className="text-sm font-semibold text-white line-clamp-1">
              {entry.name || 'Untitled save'}
            </h4>
            {verdictPill}
          </div>
          <div className="text-[11px] text-gray-500 mb-1 flex items-center gap-2 flex-wrap">
            <span className="capitalize">{entry.category.replace(/_/g, ' ')}</span>
            {entry.locationName && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{entry.locationName}</span>
              </>
            )}
            {entry.communitySaveCount && entry.communitySaveCount > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className="text-gray-400">{entry.communitySaveCount} other researcher{entry.communitySaveCount === 1 ? '' : 's'}</span>
              </>
            ) : null}
          </div>
          {entry.note ? (
            <p className="text-[12px] text-gray-300 line-clamp-2 italic">
              <MessageCircle className="inline w-3 h-3 mr-1 text-gray-500" />
              {entry.note}
            </p>
          ) : entry.summary ? (
            <p className="text-[12px] text-gray-400 line-clamp-2">{entry.summary}</p>
          ) : (
            <p className="text-[11px] text-gray-600 italic">No note yet — tap to add your read</p>
          )}
        </div>

        {/* Revisit CTA — visible on hover (desktop) / always (mobile) */}
        <div className="hidden sm:flex flex-shrink-0 items-center self-center text-gray-500 group-hover:text-purple-300 transition-colors">
          <Eye className="w-4 h-4" />
        </div>
      </button>

      {targetHref && (
        <div className="px-3 sm:px-4 pb-2 -mt-1 ml-[5.5rem] sm:ml-[6.5rem]">
          <Link
            href={targetHref}
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-purple-300"
            target={entry.externalUrl && !entry.slug ? '_blank' : undefined}
            rel={entry.externalUrl && !entry.slug ? 'noopener noreferrer' : undefined}
          >
            Open original →
          </Link>
        </div>
      )}
    </li>
  )
}
