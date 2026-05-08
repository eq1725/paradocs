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
  EyeOff, Eye, Globe, Lock, AlertCircle, Telescope, Search, Calendar,
  MapPin, Users, FileText, Camera, Locate, Upload, Image as ImageIcon, Film, Music,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { PhenomenonCategory, PhenomenonType } from '@/lib/database.types'
import { CATEGORY_CONFIG, COUNTRIES, US_STATES } from '@/lib/constants'
import { classNames } from '@/lib/utils'
import CategoryIcon from '@/components/ui/CategoryIcon'

// Lazy-loaded so the Leaflet bundle (~50KB) only ships when the user
// expands the "Where" section.
const LocationPicker = dynamic(() => import('@/components/LocationPicker'), { ssr: false })

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
  /** Cross-disciplinary tagging — additional phenomenon_types beyond the primary. */
  additional_type_ids: string[]

  // V9.11.3 #2-5 — deep details (all optional).
  // When did this happen?
  event_date: string
  event_date_precision: 'exact' | 'month' | 'year' | 'decade'
  event_time: string
  duration_minutes: string

  // Where did this happen?
  location_name: string
  location_description: string
  country: string
  state_province: string
  city: string
  latitude: string
  longitude: string

  // Witnesses
  witness_count: string
  submitter_was_witness: boolean

  // Evidence
  has_physical_evidence: boolean
  has_photo_video: boolean
  has_official_report: boolean
  evidence_summary: string

  // Privacy
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

/**
 * Upload pending media files to Supabase Storage + write report_media rows.
 * Mirrors the pattern in /components/ImageUpload.tsx but adapted for the
 * onboarding flow where uploads are deferred until after auth.
 */
async function uploadPendingMedia(
  files: File[],
  reportId: string,
  userId: string
): Promise<void> {
  for (var i = 0; i < files.length; i++) {
    var file = files[i]
    var ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || 'bin'
    var path = userId + '/' + reportId + '/' + Date.now() + '-' + i + '.' + ext

    var { error: uploadErr } = await supabase.storage
      .from('report-media')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadErr) {
      console.warn('[Onboarding] storage upload failed:', uploadErr.message)
      continue
    }
    var { data: urlData } = supabase.storage.from('report-media').getPublicUrl(path)
    var publicUrl = (urlData && urlData.publicUrl) || ''
    var mediaType = file.type.indexOf('image/') === 0 ? 'image'
                  : file.type.indexOf('video/') === 0 ? 'video'
                  : 'image'

    await (supabase.from('report_media') as any).insert({
      report_id: reportId,
      media_type: mediaType,
      url: publicUrl,
      caption: null,
      is_primary: i === 0,
      uploaded_by: userId,
    })
  }
}

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
    additional_type_ids: [],
    event_date: '',
    event_date_precision: 'exact',
    event_time: '',
    duration_minutes: '',
    location_name: '',
    location_description: '',
    country: '',
    state_province: '',
    city: '',
    latitude: '',
    longitude: '',
    witness_count: '1',
    submitter_was_witness: false,
    has_physical_evidence: false,
    has_photo_video: false,
    has_official_report: false,
    evidence_summary: '',
    visibility: 'radar_only',
    share_anonymously: false,
  })

  // Phenomenon-type picker state (V9.11.1 — replaces the old emoji chip strip)
  var [phenomenonTypes, setPhenomenonTypes] = useState<PhenomenonType[]>([])
  var [typeSearch, setTypeSearch] = useState('')
  var [typeSearchFocused, setTypeSearchFocused] = useState(false)
  var [showBrowseCategories, setShowBrowseCategories] = useState(false)

  // V9.11.3 — deep-detail picker state.
  var [openSections, setOpenSections] = useState<{
    when: boolean; where: boolean; witnesses: boolean; related: boolean; evidence: boolean
  }>({ when: false, where: false, witnesses: false, related: false, evidence: false })

  // Related phenomena (cross-disciplinary tagging)
  var [typeAssociations, setTypeAssociations] = useState<{ type_id: string; score: number }[]>([])
  var [relatedSearch, setRelatedSearch] = useState('')
  var [showAllRelated, setShowAllRelated] = useState(false)

  // Geolocation state
  var [geolocating, setGeolocating] = useState(false)
  var [geoError, setGeoError] = useState('')

  // Pending media — staged in memory, uploaded after auth completes.
  // We can't persist File objects in localStorage, so the user has to
  // re-attach if they bounce away and come back via magic link. That's
  // an acceptable trade-off — most onboarders attach last anyway.
  var [pendingMedia, setPendingMedia] = useState<File[]>([])

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

  // V9.11.3 — fetch type-associations when the primary phenomenon_type
  // changes so we can suggest related phenomena in the "Related" section.
  useEffect(function () {
    if (!draft.phenomenon_type_id) {
      setTypeAssociations([])
      return
    }
    var typeId = draft.phenomenon_type_id
    ;(supabase.from('phenomenon_type_associations') as any)
      .select('type_id_a, type_id_b, association_score')
      .or('type_id_a.eq.' + typeId + ',type_id_b.eq.' + typeId)
      .order('association_score', { ascending: false })
      .limit(10)
      .then(function (res: any) {
        if (res && Array.isArray(res.data)) {
          var mapped = res.data.map(function (row: any) {
            return {
              type_id: row.type_id_a === typeId ? row.type_id_b : row.type_id_a,
              score: row.association_score,
            }
          })
          setTypeAssociations(mapped)
        }
      })
  }, [draft.phenomenon_type_id])

  // V9.11.3 — geolocation handler for the "Where" section's "Use my
  // current location" button. Reverse-geocodes via OpenStreetMap so we
  // can pre-fill country / state / city alongside lat/lng.
  async function detectLocation() {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser')
      return
    }
    setGeolocating(true)
    setGeoError('')
    try {
      var position = await new Promise<GeolocationPosition>(function (resolve, reject) {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000,
        })
      })
      var lat = position.coords.latitude
      var lng = position.coords.longitude
      setDraft(function (d) {
        return { ...d, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }
      })
      try {
        var res = await fetch(
          'https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&accept-language=en',
          { headers: { 'User-Agent': 'Paradocs-Onboarding/1.0' } }
        )
        if (res.ok) {
          var data = await res.json()
          var addr = data.address || {}
          var rawCountry = addr.country || ''
          var nameMap: any = {
            'United States of America': 'United States',
            'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
            'Russian Federation': 'Russia',
          }
          var mapped = nameMap[rawCountry] || rawCountry
          var knownCountry = COUNTRIES.indexOf(mapped) !== -1 ? mapped : (rawCountry ? 'Other' : '')
          var city = addr.city || addr.town || addr.village || addr.municipality || ''
          var stateName = ''
          if (knownCountry === 'United States' && addr.state) {
            stateName = addr.state.replace(/^State of /i, '')
            if (US_STATES.indexOf(stateName) === -1) stateName = ''
          }
          setDraft(function (d) {
            return {
              ...d,
              country: knownCountry || d.country,
              state_province: stateName || d.state_province,
              city: city || d.city,
            }
          })
        }
      } catch {}
    } catch (err: any) {
      var msg = 'Could not detect location. Please enter manually.'
      if (err && err.code === 1) msg = 'Location access denied. Please enable in browser settings or enter manually.'
      else if (err && err.code === 2) msg = 'Location unavailable. Please enter manually.'
      else if (err && err.code === 3) msg = 'Location request timed out. Please try again.'
      setGeoError(msg)
    } finally {
      setGeolocating(false)
    }
  }

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
            additional_type_ids: draft.additional_type_ids,
            // V9.11.3 — deep details. The API normalises empty strings
            // to nulls so empty optional fields don't pollute the row.
            event_date: draft.event_date || null,
            event_date_precision: draft.event_date_precision,
            event_time: draft.event_time || null,
            duration_minutes: draft.duration_minutes ? parseInt(draft.duration_minutes, 10) : null,
            location_name: draft.location_name || null,
            location_description: draft.location_description || null,
            country: draft.country || null,
            state_province: draft.state_province || null,
            city: draft.city || null,
            latitude: draft.latitude || null,
            longitude: draft.longitude || null,
            witness_count: draft.witness_count ? parseInt(draft.witness_count, 10) : null,
            submitter_was_witness: draft.submitter_was_witness,
            has_physical_evidence: draft.has_physical_evidence,
            has_photo_video: draft.has_photo_video,
            has_official_report: draft.has_official_report,
            evidence_summary: draft.evidence_summary || null,
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

        // V9.11.3 — upload any media files staged during step 1. Best-
        // effort: if upload fails we still proceed to the RADAR reveal
        // because the report itself is saved. User can re-attach later
        // from the report editor.
        if (pendingMedia.length > 0 && result.report_id) {
          try {
            await uploadPendingMedia(pendingMedia, result.report_id, session.user.id)
          } catch (e: any) {
            console.warn('[Onboarding] media upload failed:', e?.message)
          }
        }

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

          {/* V9.11.3 #7 — wordmark dropped; the top nav already shows
              "Paradocs." on every page. Step indicator stays so users
              can see which step of the funnel they're on. Keep the
              container so the spacing rhythm doesn't change. */}
          <div className="mb-6 sm:mb-10 flex items-center justify-end">
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
                    Others shared
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

              {/* V9.11.3 #2-5 — five topic-grouped expandable sections.
                  All optional; collapsed by default; each header shows
                  a "Filled" badge once the user adds anything inside.
                  Mass-market visitors leave them closed (30-second flow).
                  Experienced witnesses see the full depth available
                  without being forced to use it (panel consensus). */}
              <div className="border-t border-gray-800/50 pt-3 space-y-2">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 mb-1">
                  Add more details (optional)
                </p>

                {/* ── WHEN ─────────────────────────────────────────── */}
                <DetailSection
                  open={openSections.when}
                  onToggle={function () { setOpenSections(function (s) { return { ...s, when: !s.when } }) }}
                  icon={<Calendar className="w-4 h-4" />}
                  title="When did this happen?"
                  preview="Date, time, duration"
                  filled={!!(draft.event_date || draft.event_time || draft.duration_minutes)}
                >
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">
                        How precisely do you remember?
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {[
                          { v: 'exact', l: 'Exact date' },
                          { v: 'month', l: 'Month + year' },
                          { v: 'year', l: 'Year only' },
                          { v: 'decade', l: 'Approx. decade' },
                        ].map(function (o) {
                          var active = draft.event_date_precision === o.v
                          return (
                            <button
                              key={o.v}
                              type="button"
                              onClick={function () {
                                setDraft(function (d) {
                                  return { ...d, event_date_precision: o.v as any, event_date: '', event_time: '' }
                                })
                              }}
                              className={
                                'px-2 py-1.5 rounded-lg text-xs font-medium transition-colors border ' +
                                (active
                                  ? 'bg-purple-600 text-white border-purple-500'
                                  : 'bg-gray-900/60 text-gray-300 border-gray-700 hover:border-purple-500/40')
                              }
                            >
                              {o.l}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {draft.event_date_precision === 'exact' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Date</label>
                          <input
                            type="date"
                            value={draft.event_date}
                            max={new Date().toISOString().split('T')[0]}
                            onChange={function (e) { setDraft(function (d) { return { ...d, event_date: e.target.value } }) }}
                            className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Time <span className="text-gray-600">(optional)</span></label>
                          <input
                            type="time"
                            value={draft.event_time}
                            onChange={function (e) { setDraft(function (d) { return { ...d, event_time: e.target.value } }) }}
                            className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                          />
                        </div>
                      </div>
                    )}

                    {draft.event_date_precision === 'month' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Month + year</label>
                        <input
                          type="month"
                          value={draft.event_date}
                          onChange={function (e) { setDraft(function (d) { return { ...d, event_date: e.target.value } }) }}
                          className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    )}

                    {draft.event_date_precision === 'year' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Year</label>
                        <select
                          value={draft.event_date}
                          onChange={function (e) { setDraft(function (d) { return { ...d, event_date: e.target.value } }) }}
                          className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Select a year</option>
                          {(function () {
                            var y = new Date().getFullYear()
                            var arr: number[] = []
                            for (var i = y; i >= 1900; i--) arr.push(i)
                            return arr
                          })().map(function (y) {
                            return <option key={y} value={String(y)}>{y}</option>
                          })}
                        </select>
                      </div>
                    )}

                    {draft.event_date_precision === 'decade' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Approximate decade</label>
                        <select
                          value={draft.event_date}
                          onChange={function (e) { setDraft(function (d) { return { ...d, event_date: e.target.value } }) }}
                          className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Select a decade</option>
                          {(function () {
                            var y = Math.floor(new Date().getFullYear() / 10) * 10
                            var arr: string[] = []
                            for (var i = y; i >= 1900; i -= 10) arr.push(i + 's')
                            return arr
                          })().map(function (d) {
                            return <option key={d} value={d}>{d}</option>
                          })}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Duration <span className="text-gray-600">(minutes, optional)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={draft.duration_minutes}
                        onChange={function (e) { setDraft(function (d) { return { ...d, duration_minutes: e.target.value } }) }}
                        placeholder="e.g. 5"
                        className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                </DetailSection>

                {/* ── WHERE ────────────────────────────────────────── */}
                <DetailSection
                  open={openSections.where}
                  onToggle={function () { setOpenSections(function (s) { return { ...s, where: !s.where } }) }}
                  icon={<MapPin className="w-4 h-4" />}
                  title="Where did this happen?"
                  preview="Country, city, map pin"
                  filled={!!(draft.country || draft.city || draft.location_name || draft.latitude)}
                >
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={detectLocation}
                      disabled={geolocating}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/30 transition-colors disabled:opacity-50"
                    >
                      {geolocating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Locate className="w-3 h-3" />}
                      Use my current location
                    </button>
                    {geoError && (
                      <p className="text-[11px] text-red-300">{geoError}</p>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Country <span className="text-gray-600">(optional)</span>
                      </label>
                      <select
                        value={draft.country}
                        onChange={function (e) { setDraft(function (d) { return { ...d, country: e.target.value } }) }}
                        className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                      >
                        <option value="">Select a country</option>
                        {COUNTRIES.map(function (c) {
                          return <option key={c} value={c}>{c}</option>
                        })}
                      </select>
                    </div>

                    {draft.country === 'United States' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">State</label>
                        <select
                          value={draft.state_province}
                          onChange={function (e) { setDraft(function (d) { return { ...d, state_province: e.target.value } }) }}
                          className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Select a state</option>
                          {US_STATES.map(function (s) {
                            return <option key={s} value={s}>{s}</option>
                          })}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">City / Town</label>
                      <input
                        type="text"
                        value={draft.city}
                        onChange={function (e) { setDraft(function (d) { return { ...d, city: e.target.value } }) }}
                        placeholder="e.g. Phoenix"
                        className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Specific location name <span className="text-gray-600">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={draft.location_name}
                        onChange={function (e) { setDraft(function (d) { return { ...d, location_name: e.target.value } }) }}
                        placeholder="e.g. Phoenix Sky Harbor, Highway 51"
                        className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Describe the location <span className="text-gray-600">(optional)</span>
                      </label>
                      <textarea
                        rows={2}
                        value={draft.location_description}
                        onChange={function (e) { setDraft(function (d) { return { ...d, location_description: e.target.value } }) }}
                        placeholder="Rural area, near a lake, suburban neighborhood…"
                        className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Pin the location on the map <span className="text-gray-600">(optional)</span>
                      </label>
                      <div className="rounded-lg overflow-hidden border border-gray-700">
                        <LocationPicker
                          latitude={draft.latitude}
                          longitude={draft.longitude}
                          onLocationChange={function (lat: string, lng: string) {
                            setDraft(function (d) { return { ...d, latitude: lat, longitude: lng } })
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">
                        Click the map to drop a pin, or fill the city above to auto-locate.
                      </p>
                    </div>
                  </div>
                </DetailSection>

                {/* ── WITNESSES ────────────────────────────────────── */}
                <DetailSection
                  open={openSections.witnesses}
                  onToggle={function () { setOpenSections(function (s) { return { ...s, witnesses: !s.witnesses } }) }}
                  icon={<Users className="w-4 h-4" />}
                  title="Witnesses"
                  preview="How many, were you one of them"
                  filled={!!(draft.witness_count && draft.witness_count !== '1') || draft.submitter_was_witness}
                >
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Number of witnesses</label>
                      <input
                        type="number"
                        min="1"
                        value={draft.witness_count}
                        onChange={function (e) { setDraft(function (d) { return { ...d, witness_count: e.target.value } }) }}
                        className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <label className="flex items-start gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={draft.submitter_was_witness}
                        onChange={function (e) { setDraft(function (d) { return { ...d, submitter_was_witness: e.target.checked } }) }}
                        className="w-4 h-4 mt-0.5 accent-purple-500"
                      />
                      <span className="text-gray-200 leading-snug">
                        I personally witnessed this event
                        <span className="block text-[11px] text-gray-500 mt-0.5">
                          Helps us prioritize first-hand reports in the archive.
                        </span>
                      </span>
                    </label>
                  </div>
                </DetailSection>

                {/* ── RELATED PHENOMENA ────────────────────────────── */}
                <DetailSection
                  open={openSections.related}
                  onToggle={function () { setOpenSections(function (s) { return { ...s, related: !s.related } }) }}
                  icon={<Sparkles className="w-4 h-4" />}
                  title="Related experiences"
                  preview="Other phenomena that overlapped"
                  filled={draft.additional_type_ids.length > 0}
                >
                  {(function () {
                    // Suggested types from primary-type associations.
                    var suggestedTypes = typeAssociations
                      .map(function (a) { return phenomenonTypes.find(function (t) { return t.id === a.type_id }) })
                      .filter(function (t): t is PhenomenonType {
                        return !!t && t.id !== draft.phenomenon_type_id && !isEditorialType(t.name, t.slug)
                      })
                      .slice(0, 5)

                    var rq = relatedSearch.trim().toLowerCase()
                    var rqWords = rq.split(/\s+/).filter(function (w) { return w.length >= 2 })
                    var crossTypes = submittableTypes.filter(function (t) {
                      return t.id !== draft.phenomenon_type_id
                    })
                    var relatedSearchResults = rq.length >= 2
                      ? crossTypes
                          .map(function (t) {
                            var name = t.name.toLowerCase()
                            var desc = (t.description || '').toLowerCase()
                            var score = 0
                            if (name === rq) score = 100
                            else if (name.indexOf(rq) === 0) score = 80
                            else if (name.indexOf(rq) !== -1) score = 60
                            else if (desc.indexOf(rq) !== -1) score = 30
                            if (score === 0 && rqWords.length > 1) {
                              var nameHits = rqWords.filter(function (w) { return name.indexOf(w) !== -1 }).length
                              if (nameHits === rqWords.length) score = 55
                              else if (nameHits > 0) score = 40
                            }
                            return { type: t, score: score }
                          })
                          .filter(function (r) { return r.score > 0 })
                          .sort(function (a, b) { return b.score - a.score })
                          .slice(0, 10)
                          .map(function (r) { return r.type })
                      : []

                    function renderTypeRow(type: PhenomenonType) {
                      var isSelected = draft.additional_type_ids.indexOf(type.id) !== -1
                      return (
                        <button
                          key={type.id}
                          type="button"
                          onClick={function () {
                            setDraft(function (d) {
                              var ids = isSelected
                                ? d.additional_type_ids.filter(function (id) { return id !== type.id })
                                : d.additional_type_ids.concat([type.id])
                              return { ...d, additional_type_ids: ids }
                            })
                          }}
                          className={classNames(
                            'w-full text-left px-3 py-2 rounded-lg transition-colors flex items-start gap-3',
                            isSelected
                              ? 'bg-purple-500/15 border border-purple-500/40'
                              : 'hover:bg-white/5 border border-transparent'
                          )}
                        >
                          <div className={classNames(
                            'w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5',
                            isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-500'
                          )}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="min-w-0">
                            <span className={classNames(
                              'text-sm block',
                              isSelected ? 'text-purple-200 font-medium' : 'text-gray-300'
                            )}>
                              {type.name}
                            </span>
                            {type.description && (
                              <span className="text-[11px] text-gray-500 block mt-0.5 leading-snug">
                                {type.description}
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    }

                    return (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-400">
                          Did your experience also involve any of these? Search or pick from suggestions.
                        </p>

                        {draft.additional_type_ids.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {draft.additional_type_ids.map(function (id) {
                              var t = phenomenonTypes.find(function (pt) { return pt.id === id })
                              if (!t) return null
                              return (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40"
                                >
                                  {t.name}
                                  <button
                                    type="button"
                                    onClick={function () {
                                      setDraft(function (d) {
                                        return { ...d, additional_type_ids: d.additional_type_ids.filter(function (x) { return x !== id }) }
                                      })
                                    }}
                                    className="hover:text-white ml-0.5"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                        )}

                        {suggestedTypes.length > 0 && !relatedSearch && (
                          <div>
                            <p className="text-[11px] text-gray-500 mb-1.5">
                              Others with similar experiences also reported:
                            </p>
                            <div className="space-y-0.5 bg-white/5 rounded-lg border border-white/10 p-2">
                              {suggestedTypes.map(renderTypeRow)}
                            </div>
                          </div>
                        )}

                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                          <input
                            type="text"
                            value={relatedSearch}
                            onChange={function (e) { setRelatedSearch(e.target.value) }}
                            placeholder="Search related phenomena (e.g. sleep paralysis, telepathy, missing time)"
                            className="w-full bg-gray-900/80 border border-gray-700 rounded-lg pl-10 pr-10 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                          />
                          {relatedSearch && (
                            <button
                              type="button"
                              onClick={function () { setRelatedSearch('') }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {relatedSearch.length >= 2 && (
                          <div className="bg-white/5 rounded-lg border border-white/10 p-2">
                            {relatedSearchResults.length > 0 ? (
                              <div className="space-y-0.5">
                                {relatedSearchResults.map(renderTypeRow)}
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-500 p-2 text-center">
                                No matches for &ldquo;{relatedSearch}&rdquo;
                              </p>
                            )}
                          </div>
                        )}

                        {!relatedSearch && (
                          <>
                            <button
                              type="button"
                              onClick={function () { setShowAllRelated(function (v) { return !v }) }}
                              className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
                            >
                              <ChevronDown className={classNames(
                                'w-3 h-3 transition-transform',
                                showAllRelated ? 'rotate-180' : ''
                              )} />
                              Browse all by category
                            </button>
                            {showAllRelated && (
                              <div className="max-h-72 overflow-y-auto space-y-3 p-3 bg-white/5 rounded-lg border border-white/10">
                                {Object.entries(CATEGORY_CONFIG)
                                  .filter(function (entry) { return entry[0] !== draft.category })
                                  .map(function (entry) {
                                    var catKey = entry[0]
                                    var catConfig = entry[1]
                                    var catTypes = crossTypes.filter(function (t) { return t.category === catKey })
                                    if (catTypes.length === 0) return null
                                    return (
                                      <div key={catKey}>
                                        <p className="text-[11px] text-gray-400 font-medium flex items-center gap-1 mb-1.5 sticky top-0 bg-gray-950/80 py-1 rounded">
                                          <CategoryIcon category={catKey as PhenomenonCategory} size={12} /> {catConfig.label}
                                        </p>
                                        <div className="space-y-0.5 ml-1">
                                          {catTypes.map(renderTypeRow)}
                                        </div>
                                      </div>
                                    )
                                  })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })()}
                </DetailSection>

                {/* ── EVIDENCE ─────────────────────────────────────── */}
                <DetailSection
                  open={openSections.evidence}
                  onToggle={function () { setOpenSections(function (s) { return { ...s, evidence: !s.evidence } }) }}
                  icon={<Camera className="w-4 h-4" />}
                  title="Evidence"
                  preview="Photos, video, physical artifacts"
                  filled={
                    draft.has_physical_evidence || draft.has_photo_video || draft.has_official_report ||
                    !!draft.evidence_summary || pendingMedia.length > 0
                  }
                >
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={draft.has_photo_video}
                          onChange={function (e) { setDraft(function (d) { return { ...d, has_photo_video: e.target.checked } }) }}
                          className="w-4 h-4 mt-0.5 accent-purple-500"
                        />
                        <span className="text-gray-200">I have photos or video</span>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={draft.has_physical_evidence}
                          onChange={function (e) { setDraft(function (d) { return { ...d, has_physical_evidence: e.target.checked } }) }}
                          className="w-4 h-4 mt-0.5 accent-purple-500"
                        />
                        <span className="text-gray-200">I have physical evidence (an object, residue, etc.)</span>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={draft.has_official_report}
                          onChange={function (e) { setDraft(function (d) { return { ...d, has_official_report: e.target.checked } }) }}
                          className="w-4 h-4 mt-0.5 accent-purple-500"
                        />
                        <span className="text-gray-200">There&apos;s an official report (police, military, news)</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Describe the evidence <span className="text-gray-600">(optional)</span>
                      </label>
                      <textarea
                        rows={2}
                        value={draft.evidence_summary}
                        onChange={function (e) { setDraft(function (d) { return { ...d, evidence_summary: e.target.value } }) }}
                        placeholder="Brief notes — what kind of evidence, when collected, where stored…"
                        className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Attach photos / videos <span className="text-gray-600">(optional)</span>
                      </label>
                      <PendingMediaPicker
                        files={pendingMedia}
                        onChange={setPendingMedia}
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        Files upload after you confirm your email.
                      </p>
                    </div>
                  </div>
                </DetailSection>
              </div>

              {/* Visibility + anonymous */}
              <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">Privacy</p>

                <div>
                  <p className="text-sm font-medium text-white mb-2">Who can see this report?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {/* V9.11.3 #1 — labels are plain-language because new
                        users haven't met "RADAR" yet. */}
                    <VisibilityChip
                      active={draft.visibility === 'radar_only'}
                      icon={<Telescope className="w-4 h-4" />}
                      label="Match only"
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
                    {draft.visibility === 'radar_only' && 'Used only to find other people with similar experiences. Not shown in the public browse feed.'}
                    {draft.visibility === 'public' && 'Anyone can read your report from the public browse feed.'}
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

              {/* V9.11.3 #8 — reassurance that one report isn't a cap.
                  Reduces anxiety for users who have multiple experiences
                  but feel they need to pick the "right" one for signup. */}
              <p className="text-[11px] text-gray-500 text-center px-4 leading-relaxed">
                You can share more experiences anytime from your account.
              </p>

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
                  placeholder="Your name"
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
                    : 'Your report is the first of its kind we\'ve seen. As more people share, we\'ll surface matches here.'}
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

/**
 * Collapsible accordion for one of the five "Add more details" sections.
 * Header always visible: icon + title + preview (small subtitle when
 * collapsed) + a green "Filled" badge once the user adds something
 * inside. Body is the children; renders only when open so heavy
 * subtrees (like the LocationPicker map) don't load until expanded.
 */
function DetailSection(props: {
  open: boolean
  onToggle: () => void
  icon: React.ReactNode
  title: string
  preview: string
  filled: boolean
  children: React.ReactNode
}) {
  return (
    <div className={
      'rounded-xl border transition-colors ' +
      (props.open
        ? 'border-purple-500/30 bg-gray-900/40'
        : 'border-gray-800/60 bg-gray-900/20 hover:border-gray-700/80')
    }>
      <button
        type="button"
        onClick={props.onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className={props.open ? 'text-purple-300' : 'text-gray-500'}>{props.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="text-sm font-medium text-white block">{props.title}</span>
          {!props.open && (
            <span className="text-[11px] text-gray-500 block leading-snug">{props.preview}</span>
          )}
        </span>
        {props.filled && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-full">
            <Check className="w-3 h-3" /> Filled
          </span>
        )}
        {props.open
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {props.open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-800/60">
          {props.children}
        </div>
      )}
    </div>
  )
}

/**
 * Pre-auth media picker: stages File objects in memory. The actual
 * upload happens AFTER the magic-link click in start.tsx's submit
 * effect, when we have a Supabase session.
 *
 * Limits: max 4 files, 10MB each, image+video MIME only. Generates
 * an object-URL preview thumbnail per file so the user can see what
 * they're attaching before signing in.
 */
function PendingMediaPicker(props: {
  files: File[]
  onChange: (files: File[]) => void
}) {
  var [previews, setPreviews] = useState<Record<string, string>>({})

  // Build preview URLs whenever the file list changes; revoke old ones.
  useEffect(function () {
    var next: Record<string, string> = {}
    props.files.forEach(function (f) {
      var key = f.name + '|' + f.size
      if (previews[key]) {
        next[key] = previews[key]
      } else if (f.type.indexOf('image/') === 0) {
        next[key] = URL.createObjectURL(f)
      }
    })
    Object.keys(previews).forEach(function (k) {
      if (!next[k]) URL.revokeObjectURL(previews[k])
    })
    setPreviews(next)
    return function () {
      // No cleanup here — revocation handled on next change.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.files])

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    var picked = Array.from(e.target.files || [])
    var combined = props.files.concat(picked).slice(0, 4)
    var filtered = combined.filter(function (f) {
      if (f.size > 10 * 1024 * 1024) return false
      if (f.type.indexOf('image/') !== 0 && f.type.indexOf('video/') !== 0) return false
      return true
    })
    props.onChange(filtered)
    e.target.value = ''
  }

  function removeAt(i: number) {
    props.onChange(props.files.filter(function (_f, idx) { return idx !== i }))
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {props.files.map(function (f, i) {
          var key = f.name + '|' + f.size
          var isImage = f.type.indexOf('image/') === 0
          return (
            <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-900 border border-gray-800">
              {isImage && previews[key]
                ? <img src={previews[key]} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-500">
                    <Film className="w-5 h-5" />
                    <span className="text-[10px] truncate w-full text-center px-1">{f.name}</span>
                  </div>}
              <button
                type="button"
                onClick={function () { removeAt(i) }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-600/80"
                aria-label="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        })}
        {props.files.length < 4 && (
          <label className="aspect-square rounded-lg border-2 border-dashed border-gray-700 hover:border-purple-500/50 bg-gray-900/40 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors">
            <Upload className="w-4 h-4 text-gray-500" />
            <span className="text-[10px] text-gray-500">Add</span>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleSelect}
              className="hidden"
            />
          </label>
        )}
      </div>
      {props.files.length > 0 && (
        <p className="text-[10px] text-gray-500">
          {props.files.length} of 4 attached · 10 MB max each
        </p>
      )}
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
