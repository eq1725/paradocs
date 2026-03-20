/**
 * NotificationBell — functional notification dropdown
 * Phase 3 item 16: replaces the non-functional bell icon in DashboardLayout
 *
 * Shows "New this week" — recent reports added in the last 7 days.
 * Future: notification preferences (categories, locations).
 */

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Bell, ArrowRight, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface RecentReport {
  id: string
  title: string
  slug: string
  category: string
  created_at: string
}

export default function NotificationBell() {
  var [open, setOpen] = useState(false)
  var [reports, setReports] = useState<RecentReport[]>([])
  var [loading, setLoading] = useState(false)
  var [hasNew, setHasNew] = useState(false)
  var dropdownRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(function() {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return function() { document.removeEventListener('mousedown', handleClick) }
  }, [])

  // Fetch recent reports when dropdown opens
  useEffect(function() {
    if (!open || reports.length > 0) return
    setLoading(true)
    var weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    async function fetchReports() {
      try {
        var res = await supabase
          .from('reports')
          .select('id, title, slug, category, created_at')
          .eq('status', 'approved')
          .gte('created_at', weekAgo)
          .order('created_at', { ascending: false })
          .limit(8)
        setReports(res.data || [])
      } catch (e) { /* non-critical */ }
      setLoading(false)
    }
    fetchReports()
  }, [open])

  // Check if there are new reports (lightweight)
  useEffect(function() {
    var lastSeen = typeof window !== 'undefined' ? localStorage.getItem('paradocs_notif_seen') : null
    var weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .gte('created_at', lastSeen || weekAgo)
      .then(function(res) {
        if (res.count && res.count > 0) setHasNew(true)
      })
  }, [])

  function handleOpen() {
    setOpen(!open)
    if (!open) {
      // Mark as seen
      setHasNew(false)
      if (typeof window !== 'undefined') {
        localStorage.setItem('paradocs_notif_seen', new Date().toISOString())
      }
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={handleOpen}
        className="p-2 text-gray-400 hover:text-white transition-colors relative"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {hasNew && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-gray-900/95 backdrop-blur border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-sm font-medium text-white">New This Week</span>
            <Link
              href="/explore?sort=newest"
              className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
              onClick={function() { setOpen(false) }}
            >
              See all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
            ) : reports.length === 0 ? (
              <div className="p-6 text-center">
                <FileText className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No new reports this week</p>
                <p className="text-xs text-gray-600 mt-1">Check back soon</p>
              </div>
            ) : (
              reports.map(function(report) {
                var timeAgo = getTimeAgo(report.created_at)
                return (
                  <Link
                    key={report.id}
                    href={'/report/' + report.slug}
                    onClick={function() { setOpen(false) }}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
                  >
                    <div className="w-2 h-2 rounded-full bg-primary-500 mt-2 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white font-medium truncate">{report.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{timeAgo}</div>
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function getTimeAgo(dateStr: string): string {
  var now = Date.now()
  var then = new Date(dateStr).getTime()
  var diff = now - then
  var hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'Just now'
  if (hours < 24) return hours + 'h ago'
  var days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return days + ' days ago'
}
