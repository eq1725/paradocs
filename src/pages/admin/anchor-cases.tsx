'use client'

/**
 * /admin/anchor-cases — V9.3 anchor case editor.
 *
 * Lab admin page for hand-tuning the anchor_case_hook + WHEN/WHERE/
 * WHO chip values + unresolved_tension + push_copy on any phenomenon
 * or report. Search by name on top, edit on right, regenerate via
 * Claude with one tap.
 *
 * Auth: same gate as /admin/index.tsx (email + role=admin).
 *
 * SWC compliant: var, function expressions, string concat.
 */

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'

interface AnchorRow {
  id: string
  name?: string
  title?: string
  slug: string
  category?: string
  source_label?: string
  report_count?: number
  anchor_case_hook: string | null
  anchor_when: string | null
  anchor_where: string | null
  anchor_witness: string | null
  unresolved_tension: string | null
  push_copy: string | null
}

export default function AnchorCasesAdminPage() {
  var router = useRouter()

  var [isAdmin, setIsAdmin] = useState(false)
  var [authChecked, setAuthChecked] = useState(false)

  var [type, setType] = useState<'phenomena' | 'reports'>('phenomena')
  var [query, setQuery] = useState('')
  var [results, setResults] = useState<AnchorRow[]>([])
  var [searching, setSearching] = useState(false)

  var [active, setActive] = useState<AnchorRow | null>(null)

  // Editable form state
  var [hook, setHook] = useState('')
  var [when, setWhen] = useState('')
  var [where, setWhere] = useState('')
  var [who, setWho] = useState('')
  var [tension, setTension] = useState('')
  var [pushCopy, setPushCopy] = useState('')

  var [saving, setSaving] = useState(false)
  var [regenerating, setRegenerating] = useState(false)
  var [statusMsg, setStatusMsg] = useState<string | null>(null)

  // ---- Auth check (raw supabase, matches /admin/index.tsx) ----
  useEffect(function () {
    var run = async function () {
      var { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.push('/login?redirect=/admin/anchor-cases')
        return
      }
      if (session.user.email !== 'williamschaseh@gmail.com') {
        router.push('/')
        return
      }
      var { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
      if ((profile as any)?.role !== 'admin') {
        router.push('/')
        return
      }
      setIsAdmin(true)
    }
    run().finally(function () { setAuthChecked(true) })
  }, [router])

  // ---- Search ----
  useEffect(function () {
    if (!isAdmin) return
    if (query.trim().length < 2) { setResults([]); return }
    var aborted = false
    setSearching(true)
    fetch('/api/admin/anchor-cases/search?type=' + type + '&q=' + encodeURIComponent(query.trim()))
      .then(function (res) { return res.ok ? res.json() : null })
      .then(function (data) {
        if (aborted) return
        setResults((data && data.results) || [])
      })
      .catch(function () {})
      .finally(function () { if (!aborted) setSearching(false) })
    return function () { aborted = true }
  }, [query, type, isAdmin])

  function loadRow(row: AnchorRow) {
    setActive(row)
    setHook(row.anchor_case_hook || '')
    setWhen(row.anchor_when || '')
    setWhere(row.anchor_where || '')
    setWho(row.anchor_witness || '')
    setTension(row.unresolved_tension || '')
    setPushCopy(row.push_copy || '')
    setStatusMsg(null)
  }

  function handleSave() {
    if (!active) return
    setSaving(true)
    setStatusMsg(null)
    fetch('/api/admin/anchor-cases/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: type,
        id: active.id,
        anchor_case_hook: hook || null,
        anchor_when: when || null,
        anchor_where: where || null,
        anchor_witness: who || null,
        unresolved_tension: tension || null,
        push_copy: pushCopy || null,
      }),
    })
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data.success) {
          setStatusMsg('✓ Saved')
        } else {
          setStatusMsg('✗ ' + (data.error || 'Save failed'))
        }
      })
      .catch(function (err) { setStatusMsg('✗ ' + err.message) })
      .finally(function () { setSaving(false) })
  }

  function handleRegenerateAnchor() {
    if (!active) return
    setRegenerating(true)
    setStatusMsg('Regenerating anchor case via Claude…')
    fetch('/api/admin/ai/generate-anchor-cases?type=' + type, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'single', id: active.id }),
    })
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data.parsed && data.parsed.anchor_case_hook) {
          setHook(data.parsed.anchor_case_hook)
          setWhen(data.parsed.anchor_when || '')
          setWhere(data.parsed.anchor_where || '')
          setWho(data.parsed.anchor_witness || '')
          setTension(data.parsed.unresolved_tension || '')
          setStatusMsg('✓ Regenerated. Click Save to persist.')
        } else {
          setStatusMsg('✗ ' + (data.error || 'Regeneration failed'))
        }
      })
      .catch(function (err) { setStatusMsg('✗ ' + err.message) })
      .finally(function () { setRegenerating(false) })
  }

  function handleRegeneratePushCopy() {
    if (!active) return
    setRegenerating(true)
    setStatusMsg('Regenerating push copy via Claude…')
    fetch('/api/admin/ai/generate-push-copy?type=' + type, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'single', id: active.id }),
    })
      .then(function (res) { return res.json() })
      .then(function (data) {
        if (data.push_copy) {
          setPushCopy(data.push_copy)
          setStatusMsg('✓ Regenerated push copy (' + data.length + ' chars). Click Save to persist.')
        } else {
          setStatusMsg('✗ ' + (data.error || 'Regeneration failed'))
        }
      })
      .catch(function (err) { setStatusMsg('✗ ' + err.message) })
      .finally(function () { setRegenerating(false) })
  }

  if (!authChecked) {
    return <div className="min-h-screen bg-gray-950 text-gray-400 p-8">Checking auth…</div>
  }
  if (!isAdmin) {
    return <div className="min-h-screen bg-gray-950 text-gray-400 p-8">Not authorized.</div>
  }

  return (
    <>
      <Head>
        <title>Anchor Cases · Paradocs Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <header className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold font-display">Anchor Cases Editor</h1>
              <p className="text-sm text-gray-400 mt-1">Edit hooks, WHEN/WHERE/WHO chips, unresolved tension, and push copy. Regenerate via Claude with one tap.</p>
            </div>
            <a href="/admin" className="text-sm text-primary-400 hover:text-primary-300">← Back to Admin</a>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT — Search & results */}
            <section className="bg-gray-900/50 border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <select
                  value={type}
                  onChange={function (e) { setType(e.target.value as 'phenomena' | 'reports'); setActive(null); setResults([]) }}
                  className="bg-gray-900 border border-white/10 rounded px-2 py-1.5 text-sm"
                >
                  <option value="phenomena">Phenomena</option>
                  <option value="reports">Reports</option>
                </select>
                <input
                  type="search"
                  value={query}
                  onChange={function (e) { setQuery(e.target.value) }}
                  placeholder={type === 'reports' ? 'Search by report title…' : 'Search by phenomenon name…'}
                  className="flex-1 bg-gray-900 border border-white/10 rounded px-3 py-1.5 text-sm placeholder-gray-500"
                />
              </div>

              <div className="text-xs text-gray-500 mb-2">
                {searching ? 'Searching…' : results.length === 0 ? (query.length < 2 ? 'Type at least 2 characters to search.' : 'No results.') : results.length + ' result' + (results.length === 1 ? '' : 's')}
              </div>

              <ul className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
                {results.map(function (row) {
                  var label = (row as any).name || (row as any).title || row.slug
                  var hasAnchor = !!row.anchor_case_hook && row.anchor_case_hook.substring(0, 2) !== '__'
                  var hasPush = !!row.push_copy && row.push_copy.substring(0, 2) !== '__'
                  var isActive = active && active.id === row.id
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={function () { loadRow(row) }}
                        className={
                          'w-full text-left px-3 py-2 rounded border transition-colors ' +
                          (isActive
                            ? 'bg-primary-500/20 border-primary-400/50'
                            : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07]')
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{label}</span>
                          <span className="flex items-center gap-1 text-[10px]">
                            <span className={hasAnchor ? 'text-emerald-400' : 'text-gray-600'}>● anchor</span>
                            <span className={hasPush ? 'text-emerald-400' : 'text-gray-600'}>● push</span>
                          </span>
                        </div>
                        {row.category && (
                          <div className="text-[11px] text-gray-500 mt-0.5">{row.category}{row.report_count ? ' · ' + row.report_count + ' reports' : ''}</div>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            {/* RIGHT — Edit form */}
            <section className="bg-gray-900/50 border border-white/10 rounded-xl p-4">
              {!active ? (
                <div className="text-sm text-gray-500 italic py-12 text-center">Select a {type === 'reports' ? 'report' : 'phenomenon'} from the left to edit.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-bold font-display">
                      {(active as any).name || (active as any).title || active.slug}
                    </h2>
                    <a
                      href={'/' + (type === 'reports' ? 'report' : 'phenomena') + '/' + active.slug}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary-400 hover:text-primary-300"
                    >
                      View public page →
                    </a>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <FormField label="WHEN" value={when} onChange={setWhen} placeholder="October 1934" />
                    <FormField label="WHERE" value={where} onChange={setWhere} placeholder="Loch Ness, Scotland" />
                    <FormField label="WHO" value={who} onChange={setWho} placeholder="A vacationing surgeon" />
                  </div>

                  <FormField
                    label="ANCHOR CASE HOOK"
                    value={hook}
                    onChange={setHook}
                    placeholder="October 1934. Loch Ness, Scotland. A vacationing surgeon photographed…"
                    multiline
                    rows={4}
                    helper={hook ? hook.length + ' chars' : undefined}
                  />

                  <FormField
                    label="UNRESOLVED TENSION"
                    value={tension}
                    onChange={setTension}
                    placeholder="The 1994 confession explains one image. It does not explain the 1,200+ sightings…"
                    multiline
                    rows={3}
                    helper={tension ? tension.length + ' chars' : undefined}
                  />

                  <FormField
                    label="PUSH COPY (≤90 chars)"
                    value={pushCopy}
                    onChange={setPushCopy}
                    placeholder="October 1934, Loch Ness: a surgeon photographed a 60-foot silhouette."
                    helper={
                      pushCopy
                        ? pushCopy.length + ' chars' + (pushCopy.length > 90 ? ' ⚠ over 90' : '')
                        : undefined
                    }
                  />

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 rounded bg-primary-600 hover:bg-primary-500 text-sm font-semibold disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerateAnchor}
                      disabled={regenerating}
                      className="px-3 py-2 rounded border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-sm disabled:opacity-50"
                    >
                      {regenerating ? '…' : 'Regenerate Anchor'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRegeneratePushCopy}
                      disabled={regenerating}
                      className="px-3 py-2 rounded border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-sm disabled:opacity-50"
                    >
                      {regenerating ? '…' : 'Regenerate Push'}
                    </button>
                    {statusMsg && <span className="text-xs text-gray-300 ml-2">{statusMsg}</span>}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  )
}

function FormField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  rows?: number
  helper?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
        {props.label}
        {props.helper && <span className="ml-2 text-gray-400 normal-case tracking-normal font-normal">{props.helper}</span>}
      </span>
      {props.multiline ? (
        <textarea
          value={props.value}
          onChange={function (e) { props.onChange(e.target.value) }}
          placeholder={props.placeholder}
          rows={props.rows || 3}
          className="bg-gray-900 border border-white/10 rounded px-3 py-2 text-sm placeholder-gray-600 resize-y leading-relaxed font-sans"
        />
      ) : (
        <input
          type="text"
          value={props.value}
          onChange={function (e) { props.onChange(e.target.value) }}
          placeholder={props.placeholder}
          className="bg-gray-900 border border-white/10 rounded px-3 py-2 text-sm placeholder-gray-600 font-sans"
        />
      )}
    </label>
  )
}
