'use client'

/**
 * /admin/flags — moderation queue for user content flags.
 *
 * V11.41 — UGC trust floor (APP_EXPERIENCE_PANEL_REVIEW.md P0-2).
 * Lists pending content_flags with report context; per-flag actions:
 *   Dismiss          — flag closed, content untouched
 *   Archive report   — reversible status change to 'archived'
 *
 * Follows the /admin/avatar-review pattern (Bearer auth; API
 * enforces the admin role; this page just renders 403 as
 * 'not authorized').
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Check, Archive, AlertCircle, Flag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

interface FlagItem {
  id: string
  report_id: string | null
  comment_id: string | null
  flagged_by: string | null
  reason: string
  details: string | null
  status: string
  created_at: string
  reports: {
    id: string
    title: string | null
    slug: string | null
    status: string | null
    source_type: string | null
    submitted_by: string | null
  } | null
}

var REASON_LABELS: Record<string, string> = {
  inaccurate: 'Inaccurate / misleading',
  offensive: 'Offensive / abusive',
  personal_info: 'Personal information',
  spam: 'Spam / advertising',
  harmful: 'Harmful / dangerous',
  other: 'Other',
}

export default function FlagsAdminPage() {
  var [items, setItems] = useState<FlagItem[]>([])
  var [loading, setLoading] = useState(true)
  var [unauthorized, setUnauthorized] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [actingOn, setActingOn] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      var { data: { session } } = await supabase.auth.getSession()
      if (!session) { setUnauthorized(true); setLoading(false); return }
      var resp = await fetch('/api/admin/flags?status=pending', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
      if (resp.status === 403) { setUnauthorized(true); setLoading(false); return }
      var data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Load failed')
      setItems(data.flags || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(function () { load() }, [])

  async function act(flagId: string, action: 'dismiss' | 'archive_report') {
    setActingOn(flagId)
    try {
      var { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      var resp = await fetch('/api/admin/flags', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ flag_id: flagId, action: action }),
      })
      if (resp.ok) {
        setItems(function (prev) { return prev.filter(function (f) { return f.id !== flagId }) })
      } else {
        var data = await resp.json().catch(function () { return null })
        setError((data && data.error) || 'Action failed')
      }
    } finally {
      setActingOn(null)
    }
  }

  return (
    <AdminLayout title="Content flags">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2.5 mb-1">
          <Flag className="w-5 h-5 text-purple-400" />
          <h1 className="text-lg font-semibold text-white">Content flags</h1>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          User-reported content awaiting review. Archive is reversible (status change only).
        </p>

        {unauthorized && (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <AlertCircle className="w-4 h-4" /> Not authorized.
          </div>
        )}
        {error && !unauthorized && (
          <div className="flex items-center gap-2 text-red-400 text-sm mb-4">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading queue…
          </div>
        )}
        {!loading && !unauthorized && items.length === 0 && (
          <p className="text-sm text-gray-500">Queue is clear. Nothing pending.</p>
        )}

        <div className="space-y-3">
          {items.map(function (f) {
            var report = f.reports
            return (
              <div key={f.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium leading-snug">
                      {report && report.slug ? (
                        <Link href={'/report/' + report.slug} target="_blank" className="hover:text-purple-300 transition-colors">
                          {report.title || 'Untitled report'}
                        </Link>
                      ) : (
                        report?.title || 'Comment / unknown target'
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      <span className="text-purple-300">{REASON_LABELS[f.reason] || f.reason}</span>
                      {' · '}{new Date(f.created_at).toLocaleString()}
                      {report?.source_type ? ' · ' + report.source_type : ''}
                      {report?.status ? ' · report ' + report.status : ''}
                    </p>
                    {f.details && (
                      <p className="text-xs text-gray-300 mt-2 leading-relaxed border-l-2 border-gray-700 pl-2.5">
                        {f.details}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      type="button"
                      disabled={actingOn === f.id}
                      onClick={function () { act(f.id, 'dismiss') }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-300 border border-gray-700 hover:border-gray-500 transition-colors disabled:opacity-40"
                    >
                      <Check className="w-3.5 h-3.5" /> Dismiss
                    </button>
                    <button
                      type="button"
                      disabled={actingOn === f.id || !f.report_id}
                      onClick={function () { act(f.id, 'archive_report') }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-amber-300 border border-amber-800/60 hover:border-amber-600 transition-colors disabled:opacity-40"
                    >
                      <Archive className="w-3.5 h-3.5" /> Archive report
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AdminLayout>
  )
}
