/**
 * RecentDiscoveries — Recently saved/bookmarked reports and phenomena.
 *
 * Shows the user's own curation (not the global feed).
 * Mobile: horizontal scroll via MobileCardRow.
 * Desktop: 2-column grid.
 */

import React from 'react'
import Link from 'next/link'
import { Bookmark, ArrowRight } from 'lucide-react'
import { MobileCardRow, MobileCardRowItem } from '@/components/mobile/MobileCardRow'
import { classNames } from '@/lib/utils'

interface SavedItem {
  id: string
  title: string
  category?: string
  date_saved: string
  slug?: string
  type: 'report' | 'phenomenon'
}

interface RecentDiscoveriesProps {
  items: SavedItem[]
}

var CATEGORY_COLORS: Record<string, string> = {
  ufo: 'bg-blue-500/20 text-blue-300',
  cryptid: 'bg-green-500/20 text-green-300',
  ghost: 'bg-purple-500/20 text-purple-300',
  psychic: 'bg-pink-500/20 text-pink-300',
  nde: 'bg-amber-500/20 text-amber-300',
  consciousness: 'bg-cyan-500/20 text-cyan-300',
  default: 'bg-gray-500/20 text-gray-300',
}

function formatDate(dateString: string) {
  var date = new Date(dateString)
  var now = new Date()
  var diffMs = now.getTime() - date.getTime()
  var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return diffDays + 'd ago'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ItemCard(props: { item: SavedItem }) {
  var item = props.item
  var href = item.type === 'report' && item.slug
    ? '/report/' + item.slug
    : item.type === 'phenomenon'
      ? '/phenomena/' + item.id
      : '/dashboard/saved'
  var categoryColor = item.category
    ? (CATEGORY_COLORS[item.category] || CATEGORY_COLORS.default)
    : CATEGORY_COLORS.default

  return (
    <Link
      href={href}
      className="block p-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-purple-500/30 transition-all h-full"
    >
      <p className="text-sm font-medium text-white truncate">{item.title}</p>
      <div className="flex items-center gap-2 mt-2">
        {item.category && (
          <span className={classNames('text-[10px] font-medium px-1.5 py-0.5 rounded-full', categoryColor)}>
            {item.category}
          </span>
        )}
        <span className="text-[10px] text-gray-500">{formatDate(item.date_saved)}</span>
      </div>
    </Link>
  )
}

export default function RecentDiscoveries(props: RecentDiscoveriesProps) {
  if (!props.items || props.items.length === 0) return null

  return (
    <div>
      {/* Mobile: horizontal scroll */}
      <div className="sm:hidden">
        <MobileCardRow
          title="Recent Discoveries"
          icon={<Bookmark className="w-4 h-4 text-purple-400" />}
          seeAllHref="/dashboard/saved"
          cardWidthPercent={72}
          minCardWidth={200}
          maxCardWidth={260}
        >
          {props.items.map(function(item) {
            return (
              <MobileCardRowItem
                key={item.id}
                widthPercent={72}
                minWidth={200}
                maxWidth={260}
              >
                <ItemCard item={item} />
              </MobileCardRowItem>
            )
          })}
        </MobileCardRow>
      </div>

      {/* Desktop: grid */}
      <div className="hidden sm:block">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-purple-400" />
            Recent Discoveries
          </h3>
          <Link
            href="/lab?tab=saves"
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {props.items.map(function(item) {
            return <ItemCard key={item.id} item={item} />
          })}
        </div>
      </div>
    </div>
  )
}
