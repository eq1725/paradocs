'use client'

/**
 * useTodaySaves — save/unsave persistence for the /discover (Today) feed.
 *
 * Bug-fix May 2026 (panel review follow-up): /discover serves both reports
 * AND phenomena, and `saved_reports` strictly FK-references `reports.id`.
 * The previous implementation POSTed phenomenon UUIDs into saved_reports,
 * silently violating the FK; the catch swallowed the error and the user
 * saw a saved-flash with no actual persistence.
 *
 * This version dispatches by `item_type`:
 *   - 'report'     → POST /api/user/saved
 *   - 'phenomenon' → POST /api/user/saved-phenomena (new endpoint)
 *
 * Saves no longer auto-assign a 'Today' collection — they go uncategorized,
 * matching the existing /explore bookmark behavior. Users can move them
 * into a collection from Lab → SAVES.
 *
 * Errors are logged to console.error so silent failures stop happening.
 *
 * Returns:
 *   - savedSet: Set<string> of item_id values currently saved (any type)
 *   - isSaved(id): boolean
 *   - persistSave(id, item_type): Promise — idempotent
 *   - removeSave(id, item_type): Promise
 *   - toggleSave(id, item_type): Promise<{ saved: boolean }>
 *
 * SWC: var, function expressions, string concat only.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type TodaySaveItemType = 'report' | 'phenomenon'

var TODAY_SAVES_KEY = 'today_saves_v1'

function readLocal(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    var raw = localStorage.getItem(TODAY_SAVES_KEY)
    if (!raw) return new Set()
    var arr = JSON.parse(raw)
    if (Array.isArray(arr)) return new Set(arr.filter(function (x) { return typeof x === 'string' }))
  } catch (e) {}
  return new Set()
}

function writeLocal(s: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TODAY_SAVES_KEY, JSON.stringify(Array.from(s)))
  } catch (e) {}
}

function getAuthHeader(): Promise<string | null> {
  return supabase.auth.getSession().then(function (result) {
    var token = result.data.session?.access_token || null
    return token ? 'Bearer ' + token : null
  }).catch(function () { return null })
}

function endpointFor(itemType: TodaySaveItemType): string {
  return itemType === 'phenomenon' ? '/api/user/saved-phenomena' : '/api/user/saved'
}

function payloadKey(itemType: TodaySaveItemType): string {
  return itemType === 'phenomenon' ? 'phenomenon_id' : 'report_id'
}

export function useTodaySaves(userId: string | null | undefined) {
  var [savedSet, setSavedSet] = useState<Set<string>>(function () { return readLocal() })

  // Hydrate from server when authenticated. Pull both reports + phenomena.
  useEffect(function () {
    if (!userId) return
    var aborted = false
    getAuthHeader().then(function (auth) {
      if (!auth || aborted) return
      var headers = { Authorization: auth }

      var fetches: Promise<string[]>[] = [
        fetch('/api/user/saved?limit=200', { headers: headers })
          .then(function (res) { return res.ok ? res.json() : { saved: [] } })
          .then(function (data: any) {
            return (data.saved || []).map(function (row: any) {
              return row.report_id || (row.report && row.report.id)
            }).filter(function (x: any) { return typeof x === 'string' })
          })
          .catch(function () { return [] }),
        fetch('/api/user/saved-phenomena?limit=200', { headers: headers })
          .then(function (res) { return res.ok ? res.json() : { saved: [] } })
          .then(function (data: any) {
            return (data.saved || []).map(function (row: any) {
              return row.phenomenon_id || (row.phenomenon && row.phenomenon.id)
            }).filter(function (x: any) { return typeof x === 'string' })
          })
          .catch(function () { return [] }),
      ]

      Promise.all(fetches).then(function (results) {
        if (aborted) return
        var ids = results[0].concat(results[1])
        if (ids.length > 0) {
          setSavedSet(function (prev) {
            var next = new Set(prev)
            ids.forEach(function (id: string) { next.add(id) })
            writeLocal(next)
            return next
          })
        }
      })
    })
    return function () { aborted = true }
  }, [userId])

  var isSaved = useCallback(function (id: string) {
    return savedSet.has(id)
  }, [savedSet])

  var persistRemote = useCallback(function (id: string, itemType: TodaySaveItemType, saved: boolean) {
    return getAuthHeader().then(function (auth) {
      if (!auth) {
        // Anonymous → localStorage only. That's expected and not an error.
        return
      }
      var method = saved ? 'POST' : 'DELETE'
      var key = payloadKey(itemType)
      var bodyObj: Record<string, any> = {}
      bodyObj[key] = id
      // Note: no collection_name — saves go uncategorized, matching /explore.
      return fetch(endpointFor(itemType), {
        method: method,
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(bodyObj),
      })
        .then(function (res) {
          if (!res.ok) {
            return res.text().then(function (txt) {
              console.error('[useTodaySaves] ' + method + ' ' + endpointFor(itemType) + ' failed:', res.status, txt)
            })
          }
        })
        .catch(function (err) {
          console.error('[useTodaySaves] ' + method + ' ' + endpointFor(itemType) + ' threw:', err)
        })
    })
  }, [])

  var persistSave = useCallback(function (id: string, itemType: TodaySaveItemType) {
    setSavedSet(function (prev) {
      if (prev.has(id)) return prev
      var next = new Set(prev)
      next.add(id)
      writeLocal(next)
      return next
    })
    return persistRemote(id, itemType, true) || Promise.resolve()
  }, [persistRemote])

  var removeSave = useCallback(function (id: string, itemType: TodaySaveItemType) {
    setSavedSet(function (prev) {
      if (!prev.has(id)) return prev
      var next = new Set(prev)
      next.delete(id)
      writeLocal(next)
      return next
    })
    return persistRemote(id, itemType, false) || Promise.resolve()
  }, [persistRemote])

  var toggleSave = useCallback(function (id: string, itemType: TodaySaveItemType) {
    var willSave = !savedSet.has(id)
    if (willSave) persistSave(id, itemType)
    else removeSave(id, itemType)
    return Promise.resolve({ saved: willSave })
  }, [savedSet, persistSave, removeSave])

  return {
    savedSet: savedSet,
    isSaved: isSaved,
    toggleSave: toggleSave,
    persistSave: persistSave,
    removeSave: removeSave,
  }
}

export default useTodaySaves
