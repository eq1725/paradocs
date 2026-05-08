'use client'

/**
 * /start — V9.11 onboarding flow.
 *
 * Multi-step in-page state machine. Mobile-first. Skip is prominent
 * on step 1 (text link below primary CTA, labeled positively as
 * "Browse Paradocs first").
 *
 * State machine:
 *   experience → account → check-email → (magic-link redirect) →
 *   submit → reveal → done
 *
 * State persistence:
 *   Step 1 (experience) saves to localStorage so when the user
 *   bounces to email + comes back via magic link, the data is
 *   still there. Cleared on successful submit.
 *
 * Auth:
 *   Magic link via Supabase Auth signInWithOtp. After clicking the
 *   email link they hit /auth/callback which exchanges the token
 *   then redirects them back to /start?from=auth. We detect that
 *   query param + localStorage and jump to the submit step.
 *
 * SWC: var, function expressions, string concat for compatibility.
 */

import React, { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Sparkles, ArrowRight, Loader2, Check, X, Mail, ChevronDown, ChevronUp,
  EyeOff, Eye, Globe, Lock, AlertCircle, Telescope, Search,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PhenomenonCategory, PhenomenonType } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'
import CategoryIcon from '@/components/ui/CategoryIcon'

// ---------------------------------------------------------------- types

type Step =
  | 'experience'      // step 1 — share form
  | 'account'         // step 2 — email + username
  | 'check-email'     // step 3 — "we sent a link"
  | 'submit'          // step 4 — write report (post-auth)
  | 'reveal'          // step 5 — RADAR matches
  | 'done'            // step 6 — finished, redirecting

interface ExperienceDraft {
  description: string
  /** Canonical PhenomenonCategory slug (e.g. 'ufos_aliens', 'ghosts_hauntings'). */
  category: PhenomenonCategory | ''
  /** Optional FK into phenomenon_types — set when the user picks a specific type. */
  phenomenon_type_id: string
  event_date: string
  location_name: string
  visibility: 'radar_only' | 'public' | 'private'
  share_anonymously: boolean
}

interface AccountDraft {
  email: string
  username: string
  display_name: string
}

interface Example {
  id: string
  title: string
  summary: string
  category: string
}

interface MatchedReport {
  id: string
  title: string
  slug: string
  category: string
  match_score: number
  match_dimensions: string[]
}

const DRAFT_KEY = 'paradocs_onboarding_draft_v1'
const ACCOUNT_KEY = 'paradocs_onboarding_account_v1'
const SKIP_KEY = 'paradocs_onboarding_skipped_v1'
/**
 * Set when a user picks "Or create my account, share later" — they want
 * an account but didn't write a report. The post-auth flow reads this
 * and skips the submit step so the user lands on /discover with an
 * empty account instead of having an incomplete draft auto-submitted.
 */
const ACCOUNT_ONLY_KEY = 'paradocs_onboarding_account_only_v1'
/**
 * Set after a successful first-report submit OR an account-only signup.
 * The /index.tsx first-run redirect treats this as "user has been
 * through the funnel — show them the homepage as a returning visitor
 * instead of bouncing them back to /start."
 */
const COMPLETE_KEY = 'paradocs_onboarding_complete_v1'

/**
 * Editorial-only types that should never appear in the user-facing picker.
 * Mirrors the same filter as /submit so /start stays consistent. Editorial
 * types are headlines/tags used by ingestion ("Notable Case", "Historical
 * Sighting") — the user should pick a personal-experience type.
 */
function isEditorialType(name: string, slug: string | null): boolean {
  var n = name.toLowerCase()
  var s = (slug || '').toLowerCase()
  if (n.indexOf('historical ') === 0) return true
  if (/\b(notable|infamous|classic|famous)\s+(case|report|incident)/i.test(name)) return true
  var locSlugs = ['bermuda-triangle', 'skinwalker-ranch', 'ley-line']
  if (locSlugs.indexOf(s) !== -1) return true
  var locNames = ['bermuda triangle', 'skinwalker ranch', 'ley line']
  if (locNames.indexOf(n) !== -1) return true
  return false
}

// ---------------------------------------------------------------- helpers

function saveDraft(draft: ExperienceDraft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch {}
}
function loadDraft(): ExperienceDraft | null {
  try {
    var raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(ACCOUNT_KEY) } catch {}
}
function saveAccount(a: AccountDraft) {
  try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)) } catch {}
}
function loadAccount(): AccountDraft | null {
  try {
    var raw = localStorage.getItem(ACCOUNT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

// ---------------------------------------------------------------- page

export default function StartPage() {
  var router = useRouter()
  var [step, setStep] = useState<Step>('experience')

  // Form state (step 1)
  var [draft, setDraft] = useState<ExperienceDraft>({
    description: '',
    category: '',
    phenomenon_type_id: '',
    event_date: '',
    location_name: '',
    visibility: 'radar_only',
    share_anonymously: false,
  })
  var [showDeep, setShowDeep] = useState(false)

  // Phenomenon-type picker state (V9.11.1 — replaces the old emoji chip strip)
  var [phenomenonTypes, setPhenomenonTypes] = useState<PhenomenonType[]>([])
  var [typeSearch, setTypeSearch] = useState('')
  var [typeSearchFocused, setTypeSearchFocused] = useState(false)
  var [showBrowseCategories, setShowBrowseCategories] = useState(false)

  // Account state (step 2)
  var [account, setAccount] = useState<AccountDraft>({
    email: '', username: '', display_name: '',
  })
  var [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle')
  var [usernameReason, setUsernameReason] = useState<string>('')

  // Examples (loaded once)
  var [examples, setExamples] = useState<Example[]>([])
  var [exampleIndex, setExampleIndex] = useState(0)

  // Submit + reveal state
  var [busy, setBusy] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [reportId, setReportId] = useState<string | null>(null)
  var [reportSlug, setReportSlug] = useState<string | null>(null)
  var [matches, setMatches] = useState<MatchedReport[]>([])
  var [matchStats, setMatchStats] = useState<{ total: number; nearby: number; database: number }>({
    total: 0, nearby: 0, database: 0,
  })

  // Auto-resize textarea ref
  var textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // ---------------- mount: detect post-auth return + restore drafts

  useEffect(function () {
    // Restore drafts.
    var d = loadDraft()
    if (d) setDraft(d)
    var a = loadAccount()
    if (a) setAccount(a)

    // If we just came back from auth callback, jump to submit step.
    if (router.query.from === 'auth') {
      // Need a session; check + advance.
      supabase.auth.getSession().then(function (s) {
        if (s.data.session) {
          // V9.11.2 — if user picked "share later", skip submit + go to /discover
          // even if there's a draft. They may have typed something then changed
          // their mind; honor their final choice.
          var accountOnly = (function () {
            try { return localStorage.getItem(ACCOUNT_ONLY_KEY) === '1' } catch { return false }
          })()
          if (accountOnly) {
            try {
              localStorage.removeItem(ACCOUNT_ONLY_KEY)
              // V9.11.2 #F — they've finished onboarding (just without
              // a first report). Mark complete so / doesn't bounce them.
              localStorage.setItem(COMPLETE_KEY, '1')
            } catch {}
            clearDraft()
            router.replace('/discover')
            return
          }

          // Have auth + draft → submit; have auth + no draft → reveal nothing
          if (d && d.description.trim().length >= 30) {
            setStep('submit')
          } else {
            // Edge case: no draft. Send to discover.
            router.replace('/discover')
          }
        } else {
          // Auth not active yet (race) — show check-email again.
          setStep('check-email')
        }
      })
      return
    }

    // Already signed in + no draft? Just redirect to lab.
    supabase.auth.getSession().then(function (s) {
      if (s.data.session && (!d || d.description.trim().length < 30)) {
        // They're signed in already; onboarding doesn't apply.
        router.replace('/lab')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.from])

  // ---------------- examples fetch

  useEffect(function () {
    if (step !== 'experience') return
    fetch('/api/onboarding/examples')
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (data) {
        if (data && Array.isArray(data.examples) && data.examples.length > 0) {
          setExamples(data.examples)
        }
      })
      .catch(function () { /* silent */ })
  }, [step])

  // ---------------- phenomenon types fetch (for the picker)

  useEffect(function () {
    if (step !== 'experience') return
    if (phenomenonTypes.length > 0) return
    supabase
      .from('phenomenon_types')
      .select('*')
      .order('name')
      .then(function (res: any) {
        if (res && Array.isArray(res.data)) setPhenomenonTypes(res.data as PhenomenonType[])
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Picker derived state -----------------------------------------------------

  var submittableTypes = phenomenonTypes.filter(function (t) {
    return !isEditorialType(t.name, t.slug)
  })

  var selectedType: PhenomenonType | undefined = draft.phenomenon_type_id
    ? phenomenonTypes.find(function (t) { return t.id === draft.phenomenon_type_id })
    : undefined

  var selectedCategoryConfig = draft.category
    ? CATEGORY_CONFIG[draft.category as PhenomenonCategory]
    : undefined

  // Types that match the chosen category (used in the "narrow it down" select).
  var filteredTypes = submittableTypes.filter(function (t) {
    return !draft.category || t.category === draft.category
  })

  // Smart search across all types.
  var typeSearchResults: PhenomenonType[] = (function () {
    var q = typeSearch.trim().toLowerCase()
    if (q.length < 2) return []
    var words = q.split(/\s+/).filter(function (w) { return w.length >= 2 })
    var scored = submittableTypes
      .map(function (t) {
        var name = t.name.toLowerCase()
        var slug = (t.slug || '').toLowerCase()
        var score = 0
        if (name === q) score += 100
        if (name.indexOf(q) === 0) score += 50
        if (name.indexOf(q) !== -1) score += 20
        if (slug.indexOf(q) !== -1) score += 10
        words.forEach(function (w) {
          if (name.indexOf(w) !== -1) score += 5
        })
        return { t: t, score: score }
      })
      .filter(function (s) { return s.score > 0 })
      .sort(function (a, b) { return b.score - a.score })
      .slice(0, 8)
    return scored.map(function (s) { return s.t })
  })()

  function selectTypeFromSearch(type: PhenomenonType) {
    setDraft(function (d) {
      return {
        ...d,
        category: (type.category as PhenomenonCategory) || d.category,
        phenomenon_type_id: type.id,
      }
    })
    setTypeSearch('')
    setTypeSearchFocused(false)
    setShowBrowseCategories(false)
  }

  function clearTypeSelection() {
    setDraft(function (d) { return { ...d, category: '', phenomenon_type_id: '' } })
    setTypeSearch('')
  }

  // Rotate the example carousel.
  useEffect(function () {
    if (examples.length < 2) return
    var t = setInterval(function () {
      setExampleIndex(function (i) { return (i + 1) % examples.length })
    }, 5000)
    return function () { clearInterval(t) }
  }, [examples])

  // Auto-resize textarea on change.
  useEffect(function () {
    var el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 480) + 'px'
  }, [draft.description])

  // Username availability (V9.9 P2 reuse).
  useEffect(function () {
    if (step !== 'account') return
    var u = (account.username || '').trim()
    if (!u) { setUsernameStatus('idle'); setUsernameReason(''); return }
    setUsernameStatus('checking')
    var t = setTimeout(async function () {
      try {
        var resp = await fetch('/api/user/username-check?u=' + encodeURIComponent(u))
        var data = await resp.json()
        if (!data?.ok) { setUsernameStatus('idle'); setUsernameReason(''); return }
        setUsernameStatus(data.status === 'self' ? 'available' : data.status)
        setUsernameReason(data.reason || '')
      } catch { setUsernameStatus('idle') }
    }, 500)
    return function () { clearTimeout(t) }
  }, [account.username, step])

  // ---------------- step 1 → step 2

  function continueToAccount() {
    setError(null)
    if (draft.description.trim().length < 30) {
      setError('Please describe your experience in at least 30 characters.')
      return
    }
    saveDraft(draft)
    setStep('account')
  }

  function handleSkip() {
    try { localStorage.setItem(SKIP_KEY, '1') } catch {}
    router.replace('/discover')
  }

  /**
   * "Or create my account, share later" path.
   * The user wants an account but isn't ready to share an experience.
   * Clears the draft so the post-auth flow doesn't auto-submit anything,
   * sets the ACCOUNT_ONLY flag so we know to route to /discover instead
   * of the RADAR reveal, and advances to step 2 (email/username).
   */
  function handleAccountOnly() {
    try {
      localStorage.setItem(ACCOUNT_ONLY_KEY, '1')
      localStorage.removeItem(DRAFT_KEY)
    } catch {}
    setDraft(function (d) { return { ...d, description: '', phenomenon_type_id: '', category: '' } })
    setStep('account')
  }

  // ---------------- step 2 → step 3

  async function sendMagicLink() {
    setError(null)
    setBusy(true)
    try {
      // Validate
      var email = (account.email || '').trim().toLowerCase()
      if (!email || !/.+@.+\..+/.test(email)) {
        throw new Error('Please enter a valid email address.')
      }
      if (usernameStatus === 'taken' || usernameStatus === 'invalid') {
        throw new Error('Pick a different username before continuing.')
      }
      if (!account.username) {
        throw new Error('Please choose a username.')
      }
      saveAccount(account)
      saveDraft(draft) // re-save in case anything changed

      // Supabase Auth — magic link with metadata for the profile-creation
      // trigger (handle_new_user reads username + display_name from
      // raw_user_meta_data).
      var displayName = account.display_name?.trim() || account.username
      var redirectTo = window.location.origin + '/auth/callback?next=' + encodeURIComponent('/start?from=auth')

      var { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectTo,
          data: {
            username: account.username,
            display_name: displayName,
          },
        },
      })
      if (otpErr) throw otpErr
      setStep('check-email')
    } catch (err: any) {
      setError(err?.message || 'Could not send magic link.')
    } finally {
      setBusy(false)
    }
  }

  // ---------------- step 4 — actually submit the report (post-auth)

  useEffect(function () {
    if (step !== 'submit') return
    var cancelled = false
    ;(async function () {
      setBusy(true)
      setError(null)
      try {
        var { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          throw new Error('Sign-in expired. Please go back and try again.')
        }
        var resp = await fetch('/api/onboarding/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + session.access_token,
          },
          body: JSON.stringify({
            description: draft.description,
            // Default to 'combination' when uncategorised — that's the
            // catch-all PhenomenonCategory, replaces the deprecated
            // 'unexplained_event' string used in V9.11 prerelease.
            category: draft.category || 'combination',
            phenomenon_type_id: draft.phenomenon_type_id || null,
            event_date: draft.event_date || null,
            location_name: draft.location_name || null,
            visibility: draft.visibility,
            share_anonymously: draft.share_anonymously,
          }),
        })
        var result = await resp.json()
        if (cancelled) return
        if (!resp.ok || !result.ok) {
          throw new Error(result.error || 'Could not save your experience.')
        }
        setReportId(result.report_id)
        setReportSlug(result.slug)
        // V9.11.2 #F — mark the funnel as completed so future homepage
        // visits don't bounce this user back to /start.
        try { localStorage.setItem(COMPLETE_KEY, '1') } catch {}

        // Now request matches.
        try {
          var matchUrl = '/api/constellation/match?report_id=' + encodeURIComponent(result.report_id) +
                         '&category=' + encodeURIComponent(draft.category || 'combination') +
                         '&description=' + encodeURIComponent(draft.description.slice(0, 500)) +
                         '&limit=8'
          var mResp = await fetch(matchUrl, {
            headers: { Authorization: 'Bearer ' + session.access_token },
          })
          if (mResp.ok) {
            var mData = await mResp.json()
            if (!cancelled) {
              setMatches(mData.matches || [])
              setMatchStats({
                total: mData.stats?.total_matched || 0,
                nearby: mData.stats?.nearby || 0,
                database: mData.stats?.total_database || 0,
              })
            }
          }
        } catch { /* RADAR is best-effort; don't block */ }

        clearDraft()
        if (!cancelled) setStep('reveal')
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Something went wrong.')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return function () { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ---------------- render

  return (
    <>
      <Head>
        <title>Share your experience · Paradocs</title>
        <meta name="description" content="Join Paradocs by sharing one experience you can't explain. We'll match yours against millions of others in the archive." />
      </Head>

      <div className="min-h-[100dvh] bg-gradient-to-b from-gray-950 via-purple-950/20 to-gray-950 text-white">
        <div className="max-w-xl mx-auto px-4 sm:px-6 pt-6 sm:pt-12 pb-24">

          {/* Brand strip */}
          <div className="mb-6 sm:mb-10 flex items-center justify-between">
            <Link href="/" className="font-brand text-xl sm:text-2xl tracking-tight">
              Paradocs<span className="text-purple-500">.</span>
            </Link>
            <StepIndicator step={step} />
          </div>

          {/* ============= STEP 1 — EXPERIENCE ============= */}
          {step === 'experience' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                  What did you see?
                </h1>
                <p className="text-sm sm:text-base text-gray-300 mt-2 leading-relaxed">
                  Join Paradocs by sharing one experience you can&apos;t explain. We&apos;ll match yours against millions of others in the archive.
                </p>
              </div>

              {/* Examples carousel */}
              {examples.length > 0 && (
                <div className="bg-purple-950/30 border border-purple-800/30 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-400 mb-1">
                    Other researchers shared
                  </p>
                  <p className="text-sm text-gray-200 italic leading-snug">
                    &ldquo;{examples[exampleIndex]?.summary}&rdquo;
                  </p>
                </div>
              )}

              {/* Textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="exp-desc">
                  Your experience
                </label>
                <textarea
                  id="exp-desc"
                  ref={textareaRef}
                  value={draft.description}
                  onChange={function (e) { setDraft(function (d) { return { ...d, description: e.target.value } }) }}
                  placeholder="It happened in… I saw… I felt…"
                  rows={4}
                  maxLength={2000}
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl p-4 text-base placeholder-gray-500 focus:outline-none focus:border-purple-500 leading-relaxed resize-none"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1.5 px-1">
                  <span>{draft.description.length < 30 ? (30 - draft.description.length) + ' more characters needed' : '✓ Long enough'}</span>
                  <span>{draft.description.length} / 2000</span>
                </div>
              </div>

              {/* What did you experience? — phenomenology picker (V9.11.1).
                  Mirrors the /submit pattern: search-first, browse-by-category fallback.
                  Replaces the deprecated emoji chip strip. */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  What did you experience? <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Search for an experience type, or browse by category.
                </p>

                {draft.category && selectedType ? (
                  /* Type selected — show chip with category context */
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={classNames(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border',
                      selectedCategoryConfig
                        ? selectedCategoryConfig.bgColor + ' border-current ' + selectedCategoryConfig.color
                        : 'bg-white/5 border-white/10'
                    )}>
                      <CategoryIcon category={draft.category as PhenomenonCategory} size={16} />
                      <span className="text-sm font-medium text-white">{selectedType.name}</span>
                      <span className="text-xs text-gray-400">in {selectedCategoryConfig?.label}</span>
                    </div>
                    <button
                      type="button"
                      onClick={clearTypeSelection}
                      className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <X className="w-3 h-3" /> Change
                    </button>
                  </div>
                ) : draft.category && !selectedType ? (
                  /* Category-only — chip + optional narrow-it-down dropdown */
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={classNames(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border',
                        selectedCategoryConfig
                          ? selectedCategoryConfig.bgColor + ' border-current ' + selectedCategoryConfig.color
                          : 'bg-white/5 border-white/10'
                      )}>
                        <CategoryIcon category={draft.category as PhenomenonCategory} size={16} />
                        <span className="text-sm font-medium text-white">
                          {selectedCategoryConfig?.label}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={clearTypeSelection}
                        className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <X className="w-3 h-3" /> Change
                      </button>
                    </div>
                    {filteredTypes.length > 0 && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Narrow it down (optional)
                        </label>
                        <select
                          value={draft.phenomenon_type_id}
                          onChange={function (e) {
                            var v = e.target.value
                            setDraft(function (d) { return { ...d, phenomenon_type_id: v } })
                          }}
                          className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Select a specific type…</option>
                          {filteredTypes.map(function (type) {
                            return (
                              <option key={type.id} value={type.id}>{type.name}</option>
                            )
                          })}
                        </select>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Nothing selected — search input + browse-by-category */
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      <input
                        type="text"
                        value={typeSearch}
                        onChange={function (e) { setTypeSearch(e.target.value) }}
                        onFocus={function () { setTypeSearchFocused(true) }}
                        onBlur={function () { setTimeout(function () { setTypeSearchFocused(false) }, 200) }}
                        placeholder="e.g. lucid dream, shadow figure, abduction…"
                        className="w-full bg-gray-900/80 border border-gray-700 rounded-lg pl-10 pr-8 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      />
                      {typeSearch && (
                        <button
                          type="button"
                          onClick={function () { setTypeSearch('') }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}

                      {typeSearchFocused && typeSearch.length >= 2 && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                          {typeSearchResults.length > 0 ? (
                            typeSearchResults.map(function (type) {
                              var catConfig = CATEGORY_CONFIG[type.category as PhenomenonCategory]
                              return (
                                <button
                                  key={type.id}
                                  type="button"
                                  onClick={function () { selectTypeFromSearch(type) }}
                                  className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center justify-between gap-3 border-b border-white/5 last:border-0"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <CategoryIcon category={type.category as PhenomenonCategory} size={16} />
                                    <span className="text-sm text-white truncate">{type.name}</span>
                                  </div>
                                  {catConfig && (
                                    <span className={classNames(
                                      'text-xs px-2 py-0.5 rounded-full shrink-0',
                                      catConfig.bgColor, catConfig.color
                                    )}>
                                      {catConfig.label}
                                    </span>
                                  )}
                                </button>
                              )
                            })
                          ) : (
                            <div className="px-4 py-3 text-sm text-gray-500">
                              No matching types. Try different keywords or browse by category below.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={function () { setShowBrowseCategories(function (v) { return !v }) }}
                      className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      <ChevronDown className={classNames(
                        'w-4 h-4 transition-transform',
                        showBrowseCategories ? 'rotate-180' : ''
                      )} />
                      Or browse by category
                    </button>

                    {showBrowseCategories && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(CATEGORY_CONFIG).map(function (entry) {
                          var key = entry[0]
                          var config = entry[1]
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={function () {
                                setDraft(function (d) {
                                  return { ...d, category: key as PhenomenonCategory, phenomenon_type_id: '' }
                                })
                                setShowBrowseCategories(false)
                              }}
                              className="p-3 rounded-lg border text-left transition-all bg-white/5 border-white/10 hover:border-purple-500/40"
                            >
                              <CategoryIcon category={key as PhenomenonCategory} size={20} />
                              <p className="mt-1 text-sm font-medium text-white">{config.label}</p>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tier 2 — Deep details (collapsed) */}
              <div className="border-t border-gray-800/50 pt-4">
                <button
                  type="button"
                  onClick={function () { setShowDeep(function (v) { return !v }) }}
                  className="flex items-center gap-2 text-sm text-purple-300 hover:text-purple-200 transition-colors"
                >
                  {showDeep ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Add more details
                  <span className="text-xs text-gray-500">(when, where — optional)</span>
                </button>
                {showDeep && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">When did this happen?</label>
                      <input
                        type="text"
                        value={draft.event_date}
                        onChange={function (e) { setDraft(function (d) { return { ...d, event_date: e.target.value } }) }}
                        placeholder="e.g. Summer 1998, March 12 2003"
                        className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Where (city or area)</label>
                      <input
                        type="text"
                        value={draft.location_name}
                        onChange={function (e) { setDraft(function (d) { return { ...d, location_name: e.target.value } }) }}
                        placeholder="e.g. Phoenix, AZ"
                        className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Visibility + anonymous */}
              <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">Privacy</p>

                <div>
                  <p className="text-sm font-medium text-white mb-2">Who can see this report?</p>
                  <div className="grid grid-cols-3 gap-2">
                    <VisibilityChip
                      active={draft.visibility === 'radar_only'}
                      icon={<Telescope className="w-4 h-4" />}
                      label="RADAR only"
                      sub="default"
                      onClick={function () { setDraft(function (d) { return { ...d, visibility: 'radar_only' } }) }}
                    />
                    <VisibilityChip
                      active={draft.visibility === 'public'}
                      icon={<Globe className="w-4 h-4" />}
                      label="Public"
                      onClick={function () { setDraft(function (d) { return { ...d, visibility: 'public' } }) }}
                    />
                    <VisibilityChip
                      active={draft.visibility === 'private'}
                      icon={<Lock className="w-4 h-4" />}
                      label="Just me"
                      onClick={function () { setDraft(function (d) { return { ...d, visibility: 'private' } }) }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                    {draft.visibility === 'radar_only' && 'Visible only when other users have similar experiences. Not in the public feed.'}
                    {draft.visibility === 'public' && 'Anyone can read your report from the browse feed.'}
                    {draft.visibility === 'private' && 'Only you and our research team can see this.'}
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={draft.share_anonymously}
                    onChange={function (e) { setDraft(function (d) { return { ...d, share_anonymously: e.target.checked } }) }}
                    className="w-4 h-4 accent-purple-500"
                  />
                  <span className="text-gray-200">Share anonymously</span>
                  <span className="text-gray-500 text-xs">(no name attached)</span>
                </label>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-200">{error}</p>
                </div>
              )}

              {/* Continue + Skip */}
              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={continueToAccount}
                  disabled={draft.description.trim().length < 30}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-40"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="text-sm text-gray-400 hover:text-gray-200 transition-colors py-1"
                  >
                    Browse Paradocs first →
                  </button>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    No account needed to browse.
                  </p>
                </div>
                {/* V9.11.2 — secondary path: account without an experience.
                    Smaller, lower-contrast than the primary skip (panel
                    consensus: keep two-skips visually weighted by intent
                    frequency). */}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleAccountOnly}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline-offset-2 hover:underline"
                  >
                    Or create my account, share later →
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 text-center px-4 leading-relaxed">
                  By sharing, you agree to our <Link href="/terms" className="underline hover:text-gray-300">Terms</Link> and <Link href="/privacy" className="underline hover:text-gray-300">Privacy Policy</Link>.
                </p>
              </div>
            </div>
          )}

          {/* ============= STEP 2 — ACCOUNT ============= */}
          {step === 'account' && (() => {
            // V9.11.2 — different headline depending on whether the user
            // is sharing an experience now ("one more step") or skipped
            // straight to account creation ("share later").
            var accountOnly = false
            try { accountOnly = localStorage.getItem(ACCOUNT_ONLY_KEY) === '1' } catch {}
            return (
            <div className="space-y-6">
              <div>
                <button
                  type="button"
                  onClick={function () { setStep('experience') }}
                  className="text-sm text-gray-400 hover:text-white mb-3 inline-flex items-center gap-1"
                >
                  ← Back
                </button>
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                  {accountOnly ? 'Create your account.' : 'One more step.'}
                </h1>
                <p className="text-sm sm:text-base text-gray-300 mt-2 leading-relaxed">
                  {accountOnly
                    ? 'We’ll email you a magic link to sign in. No password to remember. You can share your experience anytime.'
                    : 'We’ll save your experience and email you a magic link to sign in. No password to remember.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="acc-email">
                  Email
                </label>
                <input
                  id="acc-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={account.email}
                  onChange={function (e) { setAccount(function (a) { return { ...a, email: e.target.value } }) }}
                  placeholder="you@example.com"
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="acc-display">
                  Your name <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  id="acc-display"
                  type="text"
                  autoComplete="name"
                  value={account.display_name}
                  onChange={function (e) { setAccount(function (a) { return { ...a, display_name: e.target.value } }) }}
                  placeholder="Researcher"
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="acc-username">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                  <input
                    id="acc-username"
                    type="text"
                    autoComplete="username"
                    inputMode="text"
                    value={account.username}
                    onChange={function (e) { setAccount(function (a) { return { ...a, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') } }) }}
                    placeholder="username"
                    className={
                      'w-full pl-8 pr-10 py-3 bg-gray-900/80 border rounded-xl text-base placeholder-gray-500 focus:outline-none transition-colors ' +
                      (usernameStatus === 'taken' || usernameStatus === 'invalid'
                        ? 'border-red-500/60 focus:border-red-500'
                        : usernameStatus === 'available'
                          ? 'border-emerald-500/60 focus:border-emerald-500'
                          : 'border-gray-700 focus:border-purple-500')
                    }
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                    {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />}
                    {usernameStatus === 'available' && <span className="text-emerald-400">✓</span>}
                    {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <span className="text-red-400">✗</span>}
                  </span>
                </div>
                {(usernameStatus === 'taken' || usernameStatus === 'invalid') && usernameReason && (
                  <p className="text-xs text-red-300 mt-1.5">{usernameReason}</p>
                )}
                {usernameStatus === 'available' && (
                  <p className="text-xs text-emerald-300 mt-1.5">Available — yours to claim.</p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-200">{error}</p>
                </div>
              )}

              <button
                type="button"
                onClick={sendMagicLink}
                disabled={
                  busy ||
                  !account.email ||
                  !account.username ||
                  usernameStatus === 'taken' ||
                  usernameStatus === 'invalid' ||
                  usernameStatus === 'checking'
                }
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-40"
              >
                {busy ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                ) : (
                  <><Mail className="w-4 h-4" /> Send me the link</>
                )}
              </button>

              <p className="text-[10px] text-gray-500 text-center leading-relaxed">
                We use magic links so you don&apos;t have to remember another password.
              </p>
            </div>
            )
          })()}

          {/* ============= STEP 3 — CHECK EMAIL ============= */}
          {step === 'check-email' && (
            <div className="text-center py-8 space-y-6">
              <div className="inline-flex w-16 h-16 rounded-full bg-purple-600/20 border border-purple-500/30 items-center justify-center">
                <Mail className="w-7 h-7 text-purple-300" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">Check your email.</h1>
                <p className="text-sm sm:text-base text-gray-300 mt-2 leading-relaxed">
                  We sent a magic link to <strong className="text-white">{account.email}</strong>.
                  Click it to sign in and we&apos;ll save your experience.
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={function () { setStep('account') }}
                  className="text-sm text-purple-300 hover:text-purple-200"
                >
                  Wrong email? Go back
                </button>
              </div>
            </div>
          )}

          {/* ============= STEP 4 — SUBMITTING ============= */}
          {step === 'submit' && (
            <div className="text-center py-12 space-y-6">
              <Loader2 className="w-10 h-10 text-purple-300 animate-spin mx-auto" />
              <p className="text-base text-gray-200">
                {busy ? 'Saving your experience…' : 'Searching the archive…'}
              </p>
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-950/30 border border-red-900/50 rounded-lg text-left">
                  <AlertCircle className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-200">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ============= STEP 5 — RADAR REVEAL ============= */}
          {step === 'reveal' && (
            <div className="space-y-6">
              <div className="text-center pt-4">
                <Sparkles className="w-8 h-8 text-purple-300 mx-auto mb-3" />
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                  {matches.length > 0
                    ? 'You\'re not alone.'
                    : 'Your experience is logged.'}
                </h1>
                <p className="text-sm sm:text-base text-gray-300 mt-2 leading-relaxed px-2">
                  {matches.length > 0
                    ? 'We found ' + matchStats.total + ' similar reports across our archive of ' + (matchStats.database || 0).toLocaleString() + ' phenomena.'
                    : 'Your report is the first of its kind we\'ve seen. As more researchers join, we\'ll surface matches here.'}
                </p>
              </div>

              {matches.length > 0 && (
                <div className="space-y-2">
                  {matches.slice(0, 6).map(function (m) {
                    return (
                      <Link
                        key={m.id}
                        href={'/report/' + m.slug}
                        className="block p-3 bg-gray-900/80 border border-gray-800 rounded-xl hover:border-purple-500/40 transition-colors"
                      >
                        <p className="text-sm font-medium text-white truncate">{m.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {Math.round(m.match_score * 100)}% match · {m.match_dimensions.join(', ')}
                        </p>
                      </Link>
                    )
                  })}
                </div>
              )}

              <div className="space-y-2 pt-2">
                <Link
                  href="/lab"
                  className="block w-full text-center px-6 py-3.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors"
                >
                  Open my Lab →
                </Link>
                <Link
                  href="/discover"
                  className="block w-full text-center text-sm text-gray-400 hover:text-gray-200 py-2"
                >
                  Browse the feed
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- subcomponents

function StepIndicator({ step }: { step: Step }) {
  // Visual progress dots — only on the user-facing pre-auth steps.
  var visible: Step[] = ['experience', 'account', 'check-email']
  if (visible.indexOf(step) === -1) return null
  var idx = visible.indexOf(step)
  return (
    <div className="flex items-center gap-1.5">
      {visible.map(function (_s, i) {
        return (
          <span
            key={'dot-' + i}
            className={
              'h-1.5 rounded-full transition-all ' +
              (i === idx
                ? 'w-8 bg-purple-400'
                : i < idx
                  ? 'w-3 bg-purple-600'
                  : 'w-3 bg-gray-700')
            }
          />
        )
      })}
    </div>
  )
}

function VisibilityChip(props: {
  active: boolean
  icon: React.ReactNode
  label: string
  sub?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={
        'flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border transition-all ' +
        (props.active
          ? 'bg-purple-600/20 border-purple-500 text-white'
          : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600')
      }
    >
      <span className={props.active ? 'text-purple-300' : 'text-gray-500'}>{props.icon}</span>
      <span className="text-[11px] font-medium">{props.label}</span>
      {props.sub && (
        <span className="text-[9px] text-gray-500 uppercase tracking-wider -mt-0.5">{props.sub}</span>
      )}
    </button>
  )
}
