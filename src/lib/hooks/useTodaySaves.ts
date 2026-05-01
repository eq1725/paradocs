'use client'

/**
 * useTodaySaves — save/unsave persistence for the /discover (Today) feed.
 *
 * Behavior:
 *   - Anonymous users: writes to localStorage under TODAY_SAVES_KEY.
 *   - Authenticated users: POST /api/user/saved with collection_name='Today'.
 *   - Always also tracks the action in a local Set for instant UI updates.
 *   - On mount: hydrates the local Set from localStorage AND from the
 *     authenticated /api/user/saved?collection=Today endpoint when a
 *     supabase session is available.
 *
 * Returns:
 *   - savedSet: Set<string> of report_id values currently saved
 *   - isSaved(id): boolean
 *   - toggleSave(id): Promise<{ saved: boolean }>
 *   - persistSave(id): Promise<void>  (idempotent)
 *   - removeSave(id): Promise<void>
 *
 * SWC: var, function expressions, string concat only.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

var TODAY_SAVES_KEY = 'today_saves_v1'
var TODAY_COLLECTION = 'Today'

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

export function useTodaySaves(userId: string | null | undefined) {
  var [savedSet, setSavedSet] = useState<Set<string>>(function () { return readLocal() })

  // Hydrate from server when authenticated
  useEffect(function () {
    if (!userId) return
    var aborted = false
    getAuthHeader().then(function (auth) {
      if (!auth || aborted) return
      fetch('/api/user/saved?collection=' + encodeURIComponent(TODAY_COLLECTION) + '&limit=200', {
        headers: { Authorization: auth },
      })
        .then(function (res) { return res.ok ? res.json() : null })
        .then(function (data) {
          if (!data || aborted) return
          var ids = (data.saved || []).map(function (row: any) {
            return row.report_id || (row.report && row.report.id)
          }).filter(function (x: any) { return typeof x === 'string' })
          if (ids.length > 0) {
            setSavedSet(function (prev) {
              var next = new Set(prev)
              ids.forEach(function (id: string) { next.add(id) })
              writeLocal(next)
              return next
            })
          }
        })
        .catch(function () {})
    })
    return function () { aborted = true }
  }, [userId])

  var isSaved = useCallback(function (id: string) {
    return savedSet.has(id)
  }, [savedSet])

  var persistRemote = useCallback(function (id: string, saved: boolean) {
    return getAuthHeader().then(function (auth) {
      if (!auth) return  // anonymous → localStorage only
      var method = saved ? 'POST' : 'DELETE'
      var body = saved
        ? JSON.stringify({ report_id: id, collection_name: TODAY_COLLECTION })
        : JSON.stringify({ report_id: id })
      return fetch('/api/user/saved', {
        method: method,
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: body,
      }).catch(function () {})
    })
  }, [])

  var persistSave = useCallback(function (id: string) {
    setSavedSet(function (prev) {
      if (prev.has(id)) return prev
      var next = new Set(prev)
      next.add(id)
      writeLocal(next)
      return next
    })
    return persistRemote(id, true) || Promise.resolve()
  }, [persistRemote])

  var removeSave = useCallback(function (id: string) {
    setSavedSet(function (prev) {
      if (!prev.has(id)) return prev
      var next = new Set(prev)
      next.delete(id)
      writeLocal(next)
      return next
    })
    return persistRemote(id, false) || Promise.resolve()
  }, [persistRemote])

  var toggleSave = useCallback(function (id: string) {
    var willSave = !savedSet.has(id)
    if (willSave) persistSave(id)
    else removeSave(id)
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
