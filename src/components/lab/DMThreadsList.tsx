'use client'

// V11.17.73 — Named-Match + DM
//
// DMThreadsList — list of the user's named-match DM threads (open +
// closed). Click a row to expand into the DMThreadView in place.
//
// Mounted in src/pages/lab.tsx for Basic+ users. Free users see
// LabPaywallSurface in this slot.

import React, { useCallback, useEffect, useState } from 'react'
import { MessageSquare, ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import DMThreadView from './DMThreadView'

interface ThreadRow {
  id: string
  state: 'open' | 'closed'
  created_at: string
  last_message_at: string
  closed_at: string | null
  counterparty: { user_id: string; display_name: string }
  last_message: { body: string; sent_at: string; sender_user_id: string } | null
  unread_count: number
}

export function DMThreadsList() {
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [threads, setThreads] = useState<ThreadRow[]>([])
  var [expandedId, setExpandedId] = useState<string | null>(null)

  var reload = useCallback(async function () {
    setLoading(true)
    setError(null)
    try {
      var s = await supabase.auth.getSession()
      var token = s.data.session?.access_token
      if (!token) { setError('not_authenticated'); setLoading(false); return }
      var resp = await fetch('/api/lab/named-match/threads', {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (resp.status === 403) { setError('basic_tier_required'); setLoading(false); return }
      if (!resp.ok) { setError('fetch_failed'); setLoading(false); return }
      var json = await resp.json()
      setThreads((json.threads || []) as ThreadRow[])
      setLoading(false)
    } catch (e: any) {
      setError(String(e && e.message || e))
      setLoading(false)
    }
  }, [])

  useEffect(function () { reload() }, [reload])

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/5 bg-gray-950/40 p-5 sm:p-6">
        <div className="h-4 w-1/3 bg-white/5 rounded animate-pulse" />
      </div>
    )
  }

  if (error === 'basic_tier_required' || error === 'not_authenticated') return null

  if (error) {
    return (
      <div className="rounded-2xl border border-white/5 bg-gray-950/40 p-5 sm:p-6">
        <p className="text-sm text-gray-400">Could not load threads.</p>
      </div>
    )
  }

  return (
    <div
      id="threads"
      role="region"
      aria-label="Named-match DM threads"
      className="rounded-2xl border border-white/5 bg-gray-950/40 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-500/15 rounded-lg">
            <MessageSquare className="w-4 h-4 text-purple-300" />
          </div>
          <h3 className="text-base font-semibold text-white">Private threads</h3>
        </div>
        {threads.length > 0 && (
          <span className="text-xs text-gray-500">{threads.length} active</span>
        )}
      </div>

      {threads.length === 0 ? (
        <div className="text-sm text-gray-400 leading-relaxed">
          No threads yet. When a named-match offer is accepted by both contributors,
          a private 1:1 thread opens here. Either party can close it at any time.
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map(function (t) {
            var isExpanded = expandedId === t.id
            return (
              <div key={t.id} className="rounded-xl border border-white/5 bg-gray-950/40">
                <button
                  type="button"
                  onClick={function () { setExpandedId(isExpanded ? null : t.id) }}
                  id={'thread-' + t.id}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors rounded-xl"
                >
                  <span className="flex-shrink-0">
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-gray-400" />
                      : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white font-semibold truncate">
                        {t.counterparty.display_name}
                      </p>
                      {t.state === 'closed' && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                          <Lock className="w-3 h-3" /> closed
                        </span>
                      )}
                      {t.unread_count > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-purple-600/30 text-purple-200 text-[10px] font-semibold">
                          {t.unread_count} new
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {t.last_message ? t.last_message.body : '(no messages yet)'}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-500 flex-shrink-0">
                    {new Date(t.last_message_at).toLocaleDateString()}
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-2 pb-2">
                    <DMThreadView threadId={t.id} onClosed={reload} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default DMThreadsList
