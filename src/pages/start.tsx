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
  ShieldCheck,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { stashVideo, loadStashedVideo, clearStashedVideo, type StashedVideo } from '@/lib/onboarding/video-stash'
import { PhenomenonCategory, PhenomenonType } from '@/lib/database.types'
import { CATEGORY_CONFIG, COUNTRIES, US_STATES } from '@/lib/constants'
import { classNames } from '@/lib/utils'
import CategoryIcon from '@/components/ui/CategoryIcon'
import RadarVisualization from '@/components/radar/RadarVisualization'
import { inferLocation } from '@/lib/ingestion/utils/location-inferrer'

// Lazy-loaded so the Leaflet bundle (~50KB) only ships when the user
// expands the "Where" section.
const LocationPicker = dynamic(() => import('@/components/LocationPicker'), { ssr: false })
import LocationAutocomplete from '@/components/LocationAutocomplete'

// ---------------------------------------------------------------- types

type Step =
  | 'experience'      // step 1 — capture (description / video)
  | 'reveal'          // step 2 — RADAR matches (pre-auth payoff)
  | 'details'         // step 3 — sharpen: required when/where + category
  | 'account'         // step 4 — email (magic link)
  | 'check-email'     // step 5 — "we sent a link"
  | 'submit'          // step 6 — write report (post-auth)
  | 'done'            // step 7 — finished, redirecting

interface ExperienceDraft {
  /**
   * Panel-feedback (May 2026): the body and title are now distinct
   * fields. The body ("what happened?") is required and renders as
   * the report-page description. The title is optional — left blank,
   * we auto-suggest one via Haiku when the user has finished typing
   * the body, and the server makes the same call as a fallback if
   * neither user-typed nor accepted-suggestion is present.
   */
  title: string
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
  /**
   * Panel-feedback (May 2026) — location precision tier. Derived
   * client-side based on which location fields are populated:
   * lat+lng → 'exact' (drops a pin on the report-page map),
   * city → 'city' (renders a radius circle),
   * state_province → 'region',
   * country → 'country' (country chip only, no map).
   * Server re-derives if absent, but we send the client's view so
   * the user's intent is preserved.
   */
  location_precision: 'exact' | 'city' | 'region' | 'country'

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
  /**
   * V9.11.5 #10 — the API returns objects {label, score}, NOT plain
   * strings. Earlier the type was wrong and `.join(', ')` produced
   * "[object Object], [object Object]" in the rendered match list.
   */
  match_dimensions: Array<{ label: string; score: number }>
}

const DRAFT_KEY = 'paradocs_onboarding_draft_v1'
const DRAFT_TS_KEY = 'paradocs_onboarding_draft_ts_v1'
// V11.21.9 — recover an in-progress draft if the user navigates away (e.g.
// taps a reveal match → report → Back) and returns within this window, so
// they don't lose what they wrote. Bounded so stale/abandoned drafts and
// shared-device privacy aren't a concern. Cleared on successful submit.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000
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
  // V9.11.5 #23 — bug fix. Original regex required notable/famous/etc.
  // immediately followed by case/report/incident. That misses 'Notable
  // ESP Case' (notable + ESP + case with a word between). Relaxed to
  // match the words anywhere in the name with arbitrary content
  // between, so 'Notable ESP Case' / 'Famous UFO Report' / 'Classic
  // Roswell Incident' all get filtered.
  if (/\b(notable|infamous|classic|famous)\b.*\b(case|report|incident)\b/i.test(name)) return true
  var locSlugs = ['bermuda-triangle', 'skinwalker-ranch', 'ley-line']
  if (locSlugs.indexOf(s) !== -1) return true
  var locNames = ['bermuda triangle', 'skinwalker ranch', 'ley line']
  if (locNames.indexOf(n) !== -1) return true
  return false
}

/**
 * V9.11.5 #17 — friendly name resolution for the phenomenology picker.
 *
 * Database type names use field-of-study terminology (Hynek's CE-1
 * through CE-5, MJ-12, NDE/OBE/STE acronyms, etc.). Mass-market users
 * don't decode that jargon. Map known jargon names to plain-English
 * labels so the picker reads naturally — falling back to the original
 * name when no override exists.
 *
 * Returns:
 *   { primary: string, secondary?: string }
 * The picker UI shows `primary` prominently and `secondary` as a
 * smaller subtitle.
 */
function friendlyTypeName(name: string, description: string | null): { primary: string; secondary?: string } {
  // Hynek Close Encounter scale.
  var hynekMap: Record<string, { primary: string; secondary: string }> = {
    'CE-1': { primary: 'Saw a UFO up close',                      secondary: 'Close Encounter, first kind' },
    'CE-2': { primary: 'UFO that left physical traces',           secondary: 'Close Encounter, second kind' },
    'CE-3': { primary: 'Saw a UFO and its occupants',             secondary: 'Close Encounter, third kind' },
    'CE-4': { primary: 'UFO abduction',                           secondary: 'Close Encounter, fourth kind' },
    'CE-5': { primary: 'Communication with UFO occupants',        secondary: 'Close Encounter, fifth kind' },
  }
  // Match any "CE-N: Close Encounter ..." style name.
  var hynekMatch = name.match(/^CE-(\d):/)
  if (hynekMatch) {
    var key = 'CE-' + hynekMatch[1]
    var m = hynekMap[key]
    if (m) return { primary: m.primary, secondary: m.secondary }
  }

  // V9.11.5 #18 — comprehensive jargon coverage.
  // Acronyms and field-of-study terms get plain-English primaries.
  // Keys are matched case-insensitively against the trimmed name.
  var aliasMap: Record<string, { primary: string; secondary: string }> = {
    // NDE family
    'NDE':   { primary: 'Near-death experience',                  secondary: 'NDE' },
    'OBE':   { primary: 'Out-of-body experience',                 secondary: 'OBE' },
    'SOBE':  { primary: 'Sudden out-of-body experience',          secondary: 'SOBE' },
    'STE':   { primary: 'Spiritually transformative experience',  secondary: 'STE' },
    'DBV':   { primary: 'Deathbed vision',                        secondary: 'DBV' },
    'ADC':   { primary: 'After-death communication',              secondary: 'ADC' },
    'NELE':  { primary: 'Near-end-of-life experience',            secondary: 'NELE' },
    // UFO / aerial
    'UAP':   { primary: 'Saw a UAP',                              secondary: 'Unidentified Aerial Phenomenon' },
    'UFO':   { primary: 'Saw a UFO',                              secondary: 'Unidentified Flying Object' },
    'IFO':   { primary: 'Identified flying object',               secondary: 'IFO' },
    'BOL':   { primary: 'Ball of light',                          secondary: 'BOL' },
    // Government / official
    'AATIP': { primary: 'Government UAP study (AATIP)',           secondary: 'Advanced Aerospace Threat Identification Program' },
    'AARO':  { primary: 'Government UAP office (AARO)',           secondary: 'All-domain Anomaly Resolution Office' },
    'AAWSAP':{ primary: 'Government UAP study (AAWSAP)',          secondary: 'Advanced Aerospace Weapon System Applications Program' },
    'MJ-12': { primary: 'Majestic 12 documents',                  secondary: 'Alleged secret committee' },
    // Audio / electronic
    'EVP':   { primary: 'Voice or sound recording',               secondary: 'EVP — Electronic Voice Phenomenon' },
    'ITC':   { primary: 'Spirit communication via electronics',   secondary: 'ITC — Instrumental TransCommunication' },
    // Psychic / parapsychology
    'ESP':   { primary: 'Extrasensory perception',                secondary: 'ESP' },
    'PK':    { primary: 'Mind-over-matter ability',               secondary: 'PK — Psychokinesis' },
    'AC':    { primary: 'Anomalous cognition',                    secondary: 'AC' },
    'RV':    { primary: 'Remote viewing',                         secondary: 'RV' },
    // Drug-induced
    'DMT':   { primary: 'DMT experience',                         secondary: 'N,N-Dimethyltryptamine' },
    '5-MEO-DMT': { primary: '5-MeO-DMT experience',               secondary: '5-Methoxy-N,N-dimethyltryptamine' },
    'LSD':   { primary: 'LSD experience',                         secondary: 'Lysergic acid diethylamide' },
    'AYAHUASCA': { primary: 'Ayahuasca experience',               secondary: 'Plant-medicine ceremony' },
  }
  var trimmed = name.trim()
  var upper = trimmed.toUpperCase()
  if (aliasMap[upper]) {
    return { primary: aliasMap[upper].primary, secondary: aliasMap[upper].secondary }
  }
  // Names like "NDE — Tunnel Experience" → strip prefix, prepend friendly.
  var dashedAlias = trimmed.match(/^(NDE|OBE|STE|EVP|UAP|ITC|RV|PK|ESP|DMT|MJ-12)\s*[—–-]\s*(.+)$/i)
  if (dashedAlias) {
    var prefix = dashedAlias[1].toUpperCase()
    var rest = dashedAlias[2]
    if (aliasMap[prefix]) {
      return { primary: rest, secondary: aliasMap[prefix].primary }
    }
  }

  // Field-of-study Latin/Greek terms — single-word phenomena that are
  // technical but mass-market users probably haven't heard.
  var greekLatinMap: Record<string, { primary: string; secondary: string }> = {
    'clairaudience':  { primary: 'Hearing voices or sounds others can\'t', secondary: 'Clairaudience' },
    'clairsentience': { primary: 'Sensing things you shouldn\'t know',     secondary: 'Clairsentience' },
    'clairvoyance':   { primary: 'Seeing things at a distance',            secondary: 'Clairvoyance' },
    'precognition':   { primary: 'Knowing what will happen',               secondary: 'Precognition' },
    'retrocognition': { primary: 'Seeing into the past',                   secondary: 'Retrocognition' },
    'telepathy':      { primary: 'Mind-to-mind communication',             secondary: 'Telepathy' },
    'telekinesis':    { primary: 'Moving objects with the mind',           secondary: 'Telekinesis' },
    'psychokinesis':  { primary: 'Moving objects with the mind',           secondary: 'Psychokinesis' },
    'doppelganger':   { primary: 'Saw a double of a living person',        secondary: 'Doppelgänger' },
    'doppelgänger':   { primary: 'Saw a double of a living person',        secondary: 'Doppelgänger' },
    'apparition':     { primary: 'Saw a ghost or figure',                  secondary: 'Apparition' },
    'poltergeist':    { primary: 'Objects moving on their own',            secondary: 'Poltergeist (German: noisy ghost)' },
    'hypnagogic':     { primary: 'Visions while falling asleep',           secondary: 'Hypnagogic state' },
    'hypnopompic':    { primary: 'Visions while waking up',                secondary: 'Hypnopompic state' },
    'sleep paralysis':{ primary: 'Awake but unable to move',               secondary: 'Sleep paralysis' },
    'shadow people':  { primary: 'Saw a shadow figure',                    secondary: 'Shadow people' },
    'hat man':        { primary: 'Saw a tall figure in a hat',             secondary: 'The Hat Man' },
    'astral projection':{ primary: 'Out-of-body travel',                   secondary: 'Astral projection' },
    'lucid dream':    { primary: 'Dream you knew was a dream',             secondary: 'Lucid dream' },
    'lucid dreams':   { primary: 'Dream you knew was a dream',             secondary: 'Lucid dream' },
    'lucid dreaming': { primary: 'Dream you knew was a dream',             secondary: 'Lucid dream' },
    'déjà vu':        { primary: 'Sense you\'ve lived this moment before', secondary: 'Déjà vu' },
    'deja vu':        { primary: 'Sense you\'ve lived this moment before', secondary: 'Déjà vu' },
    'synchronicity':  { primary: 'Meaningful coincidence',                 secondary: 'Synchronicity' },
    'kundalini':      { primary: 'Spiritual energy awakening',             secondary: 'Kundalini awakening' },
    'kundalini awakening': { primary: 'Spiritual energy awakening',        secondary: 'Kundalini awakening' },
    // V9.11.5 #23
    'levitation':     { primary: 'Floating off the ground',                secondary: 'Levitation' },
    'levitating':     { primary: 'Floating off the ground',                secondary: 'Levitation' },
    'sensory deprivation': { primary: 'Float tank or isolation experience', secondary: 'Sensory deprivation' },
    'sensory deprivation experience': { primary: 'Float tank or isolation experience', secondary: 'Sensory deprivation' },
  }
  var lower = trimmed.toLowerCase()
  if (greekLatinMap[lower]) {
    return greekLatinMap[lower]
  }

  // Default: name as primary, short description as secondary if available.
  var desc = (description || '').trim()
  if (desc && desc.length <= 90) {
    return { primary: name, secondary: desc }
  }
  return { primary: name }
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

// V11.20 — MIME pick for the in-step webcam recorder (desktop/Android).
// webm is accepted by the video upload pipeline's ALLOWED_MIME list.
var REC_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
]
function pickRecorderMime(): string {
  for (var i = 0; i < REC_MIME_CANDIDATES.length; i++) {
    var m = REC_MIME_CANDIDATES[i]
    try {
      if (typeof MediaRecorder !== 'undefined' && (MediaRecorder as any).isTypeSupported && (MediaRecorder as any).isTypeSupported(m)) return m
    } catch { /* ignore */ }
  }
  return 'video/webm'
}

function saveDraft(draft: ExperienceDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    localStorage.setItem(DRAFT_TS_KEY, String(Date.now()))
  } catch {}
}
// True when a saved draft exists and was last written within DRAFT_TTL_MS.
function draftIsFresh(): boolean {
  try {
    var ts = parseInt(localStorage.getItem(DRAFT_TS_KEY) || '0', 10)
    return ts > 0 && (Date.now() - ts) < DRAFT_TTL_MS
  } catch { return false }
}
function loadDraft(): ExperienceDraft | null {
  try {
    var raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(DRAFT_TS_KEY); localStorage.removeItem(ACCOUNT_KEY) } catch {}
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

  // V10.10 — funnel step 2 of 3. landing_view fires on /index;
  // start_form_open fires here on /start mount; report_submitted
  // fires after the API returns success. PostHog funnel built from
  // these three step values shows landing → start → submitted
  // conversion.
  useEffect(function () {
    try {
      require('@/lib/posthog').capture('report_share_funnel', {
        step: 'start_form_open',
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      })
    } catch {}
  }, [])

  // Form state (step 1)
  var [draft, setDraft] = useState<ExperienceDraft>({
    title: '',
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
    location_precision: 'exact',
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
  // V12 — When/Where moved to the required 'details' step and default to
  // open there; the other three stay optional + collapsed.
  var [openSections, setOpenSections] = useState<{
    when: boolean; where: boolean; witnesses: boolean; related: boolean; evidence: boolean
  }>({ when: true, where: true, witnesses: false, related: false, evidence: false })

  // Related phenomena (cross-disciplinary tagging)
  var [typeAssociations, setTypeAssociations] = useState<{ type_id: string; score: number }[]>([])
  var [relatedSearch, setRelatedSearch] = useState('')
  var [showAllRelated, setShowAllRelated] = useState(false)

  // Geolocation state
  var [geolocating, setGeolocating] = useState(false)
  var [geoError, setGeoError] = useState('')

  // Panel-feedback (May 2026) — auto-title suggestion state. The user
  // pastes their experience body into the textarea, and after they
  // pause typing for ~1.2s with ≥120 chars and no title yet, we call
  // /api/onboarding/suggest-title to propose one. The user can accept
  // it with one click or write their own. Fully optional — empty
  // title is fine; the server falls back to the same logic.
  var [titleSuggestion, setTitleSuggestion] = useState<string>('')
  var [titleSuggesting, setTitleSuggesting] = useState(false)
  var [titleSuggestError, setTitleSuggestError] = useState<string | null>(null)
  // Track which description we suggested for, so a quick re-edit
  // doesn't immediately re-fire the suggest call. We only re-suggest
  // when the body has materially diverged from the cached one.
  var [titleSuggestedForBody, setTitleSuggestedForBody] = useState<string>('')

  useEffect(function () {
    var body = (draft.description || '').trim()
    // Don't auto-suggest if body too short, user already has a title,
    // or we've already suggested for an equivalent body.
    if (body.length < 120) return
    if (draft.title) return
    // Cheap fingerprint — first 200 chars. If body hasn't materially
    // changed since the last suggest, skip the network call.
    var bodyFingerprint = body.slice(0, 200)
    if (bodyFingerprint === titleSuggestedForBody) return

    var timer = setTimeout(function () {
      setTitleSuggesting(true)
      setTitleSuggestError(null)
      fetch('/api/onboarding/suggest-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: body, category: draft.category || null }),
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Couldn\'t suggest a title')) })
        .then(function (data: any) {
          if (data && typeof data.title === 'string' && data.title.length > 0) {
            setTitleSuggestion(data.title)
            setTitleSuggestedForBody(bodyFingerprint)
          }
        })
        .catch(function (err: any) {
          setTitleSuggestError(err?.message || 'Couldn\'t suggest a title')
        })
        .finally(function () { setTitleSuggesting(false) })
    }, 1200)
    return function () { clearTimeout(timer) }
  }, [draft.description, draft.category, draft.title, titleSuggestedForBody])

  // Pending media — staged in memory, uploaded after auth completes.
  // We can't persist File objects in localStorage, so the user has to
  // re-attach if they bounce away and come back via magic link. That's
  // an acceptable trade-off — most onboarders attach last anyway.
  var [pendingMedia, setPendingMedia] = useState<File[]>([])

  // V11.20 — capture mode + the staged video clip for the "Record on
  // camera" path. The clip is held in state AND stashed in IndexedDB
  // (video-stash) so it survives the magic-link sign-in round-trip; the
  // one-line description drives the pre-auth reveal, and post-auth the
  // clip runs the existing video pipeline (upload-url → PUT → finalize).
  var [captureMode, setCaptureMode] = useState<'text' | 'video'>('text')
  var [pendingVideo, setPendingVideo] = useState<File | null>(null)
  var [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('')
  var [videoDurationSec, setVideoDurationSec] = useState<number | null>(null)
  // Guards the text-submit effect from firing when we're routing the
  // staged video through the video pipeline on the 'submit' step.
  var videoFlowRef = useRef(false)

  // V11.20 — in-step webcam recorder (desktop / Android). 'off' = choose
  // record-vs-upload; 'live' = camera on, ready; 'recording' = capturing.
  var [recorderPhase, setRecorderPhase] = useState<'off' | 'live' | 'recording'>('off')
  var [recordSeconds, setRecordSeconds] = useState(0)
  var liveVideoRef = useRef<HTMLVideoElement | null>(null)
  var mediaStreamRef = useRef<MediaStream | null>(null)
  var mediaRecorderRef = useRef<MediaRecorder | null>(null)
  var recordedChunksRef = useRef<Blob[]>([])
  var recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // V9.11.5 #27.2 — archive stats for the trust signal under H1.
  // Reports is the magnitude that scales with ingestion (MUFON, NUFORC,
  // BFRO, Reddit, YouTube + user submissions, eventually millions).
  // The encyclopedia/schema (phenomenon_types, phenomena) is held by
  // /lab and curated by us — it's not what users care to hear about
  // when deciding to share their experience.
  var [archiveStats, setArchiveStats] = useState<{ reports: number }>({
    reports: 0,
  })

  // Submit + reveal state
  var [busy, setBusy] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [reportId, setReportId] = useState<string | null>(null)
  var [reportSlug, setReportSlug] = useState<string | null>(null)
  var [matches, setMatches] = useState<MatchedReport[]>([])
  var [matchStats, setMatchStats] = useState<{ total: number; nearby: number; database: number; overlap: number }>({
    total: 0, nearby: 0, database: 0, overlap: 0,
  })
  // V12 — best-guess phenomenon type inferred from the matcher (modal of
  // the strongest matches). Used to pre-select the REQUIRED details-step
  // type picker so it doesn't start empty (clearly labeled + editable).
  var [suggestedType, setSuggestedType] = useState<{ id: string; name: string; category: string } | null>(null)
  var [relatedTypeSuggestions, setRelatedTypeSuggestions] = useState<{ id: string; name: string; category: string }[]>([])
  var [typeWasAutofilled, setTypeWasAutofilled] = useState(false)
  // V11.23 — denser RADAR dot set (semantically gated server-side) so the
  // dial's density tracks the headline overlap count instead of the 8 cards.
  var [radarPoints, setRadarPoints] = useState<{ id: string; title: string; slug: string; category: string; match_score: number }[]>([])

  // Auto-resize textarea ref
  var textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // ---------------- mount: detect post-auth return + restore drafts

  // V10.13.1 — detect experienced users and skip the welcome /
  // category-picker steps. An experienced user is anyone with at
  // least one prior approved or pending submission. They land
  // directly on the experience-form step ('experience') with the
  // tighter copy expected of a returning contributor.
  useEffect(function () {
    // V11.21.5 — do NOT run the experienced-user redirect on the magic-link
    // return. That flow (the other effect) owns routing → 'submit' to save
    // the in-progress report; letting this effect also fire raced it back to
    // 'experience' mid-save and left the CTA stuck on "Searching the archive…".
    if (router.query.from === 'auth') return
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session || !session.user) return
      // Quick count query — if they have any non-deleted prior report,
      // they're "experienced." We use the head:true count pattern so
      // we don't pull row data we don't need.
      supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('submitted_by', session.user.id)
        .neq('status', 'deleted')
        .then(function (res: any) {
          var n = res && res.count ? res.count : 0
          if (n > 0) {
            // Land them in the experience form, not the welcome screen.
            // The form itself doesn't need a copy change — it's just
            // skipping the prior steps that hand-hold first-timers.
            setStep('experience')
          }
        })
    })
  }, [])

  useEffect(function () {
    // V11.20.2 — only restore a saved draft when returning from the
    // magic-link auth callback (the one flow that reloads the page mid-
    // onboarding). On a normal visit or refresh, start clean so input
    // from a prior/abandoned attempt doesn't linger in the fields.
    var d = loadDraft()
    if (router.query.from === 'auth') {
      if (d) setDraft(d)
      var a = loadAccount()
      if (a) setAccount(a)
    } else if (d && d.description && d.description.trim().length > 0 && draftIsFresh()) {
      // V11.21.9 — the user wrote something, then navigated away (e.g.
      // tapped a reveal match → report → Back) and returned within the
      // TTL. Restore their work so they don't lose it and bounce. Stale
      // drafts (past TTL) fall through to the clear branch below.
      setDraft(d)
      var ar = loadAccount()
      if (ar) setAccount(ar)
    } else {
      clearDraft()
      try { clearStashedVideo() } catch {}
      d = null
    }

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

          // T1.8 funnel event: user completed signup
          try {
            require('@/lib/posthog').capture('signup_complete', {
              referrer: typeof document !== 'undefined' ? document.referrer || null : null,
              had_draft: !!(d && d.description.trim().length >= 30),
            })
          } catch {}

          // V11.20 — a staged video clip (IndexedDB) takes priority:
          // run it through the video pipeline. Otherwise the text path.
          var accessToken = s.data.session.access_token
          ;(async function () {
            var stash = await loadStashedVideo()
            if (stash) { finishAuthedSubmission(accessToken); return }
            if (d && d.description.trim().length >= 30) {
              // Experience-first carryover: draft filled, run submit.
              setStep('submit')
            } else {
              // Post-auth user with no draft lands on the experience form.
              setStep('experience')
            }
          })()
        } else {
          // Auth not active yet (race) — show check-email again.
          setStep('check-email')
        }
      })
      return
    }

    // V11.19 — experience-first reorder. EVERYONE (authed or not) lands
    // on the 'experience' form (the default useState), captures, then
    // sees the RADAR 'reveal' BEFORE any email/account gate. This
    // reverses the T1.8 "account-first" flip: we now deliver the wow
    // ("you're not alone") first and ask for the email only after the
    // dopamine — the CRO-panel's highest-ROI activation fix.
    supabase.auth.getSession().then(function (s) {
      if (!s.data.session) {
        setStep('experience')
        try {
          require('@/lib/posthog').capture('signup_intent', {
            referrer: typeof document !== 'undefined' ? document.referrer || null : null,
          })
        } catch {}
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

  // ---------------- archive stats fetch (V9.11.5 #27.2)
  // Approved-reports count only. Reports = the data magnitude that
  // grows with mass ingestion. The encyclopedia/schema is curated
  // and not the right number for a public trust signal.
  useEffect(function () {
    if (step !== 'experience') return
    if (archiveStats.reports > 0) return // already loaded
    ;(supabase.from('reports') as any)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .then(function (result: any) {
        var rCount = (result && result.count) || 0
        if (rCount > 0) setArchiveStats({ reports: rCount })
      })
      .catch(function () { /* silent — trust signal is optional UX */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  //
  // V9.11.5 #1 — bump timeout to 20s + auto-retry once on timeout.
  // Mobile getCurrentPosition often takes 10-15s indoors when GPS is
  // cold. The original 10s timeout was too aggressive; we now allow
  // 20s + a single retry that doubles to 30s. maximumAge is also
  // expanded so a recent fix is reused if available.

  // V9.11.5 #15 — auto-geocode on city/state/country change.
  // When the user manually picks city + (optionally) state + country,
  // forward-geocode via Nominatim and update lat/lng so the map below
  // re-centers on the chosen location. Debounced 800ms so we don't
  // hammer Nominatim on every keystroke.
  useEffect(function () {
    if (step !== 'experience') return
    if (!draft.city) return
    var t = setTimeout(async function () {
      try {
        var q = [draft.city, draft.state_province, draft.country].filter(Boolean).join(', ')
        var res = await fetch(
          'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=1',
          { headers: { 'User-Agent': 'Paradocs-Onboarding/1.0' } }
        )
        if (!res.ok) return
        var data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          var lat = parseFloat(data[0].lat).toFixed(6)
          var lng = parseFloat(data[0].lon).toFixed(6)
          // Always update — if the user changes city, the map should
          // follow. If they want a precise pin, they can drop one
          // after, and a subsequent city change will overwrite that
          // (acceptable trade-off; precision pin is uncommon vs. city
          // changes).
          setDraft(function (d) { return { ...d, latitude: lat, longitude: lng } })
        }
      } catch {
        // Silent fail — user can still drop a pin manually.
      }
    }, 800)
    return function () { clearTimeout(t) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.city, draft.state_province, draft.country, step])

  async function detectLocation() {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser')
      return
    }
    setGeolocating(true)
    setGeoError('')

    function getOnce(timeoutMs: number): Promise<GeolocationPosition> {
      return new Promise<GeolocationPosition>(function (resolve, reject) {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: timeoutMs,
          maximumAge: 600000, // 10 min cache — recent fix is fine
        })
      })
    }

    try {
      var position: GeolocationPosition
      try {
        position = await getOnce(20000)
      } catch (firstErr: any) {
        // Retry once on timeout (code 3) with a longer window.
        if (firstErr && firstErr.code === 3) {
          position = await getOnce(30000)
        } else {
          throw firstErr
        }
      }
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
      var msg = 'Couldn\'t pin down your location automatically. You can fill the city below instead.'
      if (err && err.code === 1) {
        msg = 'Location access was denied. Enable it in your browser settings, or fill the city below.'
      } else if (err && err.code === 2) {
        msg = 'Your device couldn\'t determine its position. Fill the city below instead.'
      } else if (err && err.code === 3) {
        msg = 'Still couldn\'t get a location fix. Try again outdoors, or fill the city below.'
      }
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
  /**
   * V9.11.5 #14 — search synonyms.
   * Mass-market users type "ufo", "alien", "ghost" — but our DB types
   * have brand-aligned names like "Mass Sighting", "Close Encounter
   * Type 3", "Apparition". Without synonym mapping the search returns
   * nothing for the most common queries. Each synonym key expands the
   * effective query to also match the type's category, description,
   * and these alias terms.
   */
  var SEARCH_SYNONYMS: Record<string, string[]> = {
    ufo:    ['uap', 'craft', 'disc', 'triangle', 'sighting', 'light', 'orb', 'aliens'],
    ufos:   ['uap', 'craft', 'disc', 'triangle', 'sighting', 'light', 'orb', 'aliens'],
    uap:    ['ufo', 'craft', 'disc', 'triangle', 'sighting'],
    alien:  ['extraterrestrial', 'abduction', 'encounter', 'contactee', 'grey', 'nordic', 'reptilian', 'craft', 'ufo'],
    aliens: ['extraterrestrial', 'abduction', 'encounter', 'contactee', 'grey', 'nordic', 'reptilian', 'craft', 'ufo'],
    abduction: ['alien', 'extraterrestrial', 'encounter', 'taken', 'missing time'],
    sighting: ['encounter', 'observation', 'witness', 'craft', 'figure', 'object'],
    ghost:  ['apparition', 'haunting', 'spirit', 'specter', 'poltergeist', 'phantom'],
    ghosts: ['apparition', 'haunting', 'spirit', 'specter', 'poltergeist', 'phantom'],
    haunted: ['haunting', 'apparition', 'ghost', 'spirit'],
    psychic: ['telepathy', 'precognition', 'esp', 'clairvoyance', 'medium'],
    nde:    ['near death', 'tunnel', 'light', 'after life'],
    obe:    ['out of body', 'astral', 'projection'],
    cryptid: ['bigfoot', 'sasquatch', 'creature', 'unknown animal', 'monster'],
    bigfoot: ['cryptid', 'sasquatch', 'creature'],
    demon:  ['demonic', 'entity', 'oppression', 'possession'],
    // V9.11.5 #23 — levitation cluster
    levitation:  ['floating', 'hovering', 'telekinesis', 'psychokinesis', 'astral projection', 'obe', 'out of body'],
    levitating:  ['floating', 'hovering', 'telekinesis', 'psychokinesis'],
    floating:    ['levitation', 'hovering', 'astral projection', 'obe', 'out of body'],
    float:       ['levitation', 'hovering', 'floating'],
    hovering:    ['levitation', 'floating', 'craft', 'orb'],
  }

  var typeSearchResults: PhenomenonType[] = (function () {
    var q = typeSearch.trim().toLowerCase()
    if (q.length < 2) return []
    var words = q.split(/\s+/).filter(function (w) { return w.length >= 2 })

    // Expand query with synonyms for any matching word.
    var expandedTerms: string[] = words.slice()
    words.forEach(function (w) {
      var syns = SEARCH_SYNONYMS[w]
      if (syns) expandedTerms = expandedTerms.concat(syns)
    })
    // Dedupe.
    expandedTerms = Array.from(new Set(expandedTerms))

    var scored = submittableTypes
      .map(function (t) {
        var name = t.name.toLowerCase()
        var slug = (t.slug || '').toLowerCase()
        var desc = (t.description || '').toLowerCase()
        var category = (t.category || '').toLowerCase()
        var score = 0

        // Direct query match (highest weight) — name first, then slug.
        if (name === q) score += 100
        if (name.indexOf(q) === 0) score += 50
        if (name.indexOf(q) !== -1) score += 20
        if (slug.indexOf(q) !== -1) score += 10
        // Description + category match — softer, helps when type names
        // don't include the user's literal search term.
        if (desc.indexOf(q) !== -1) score += 8
        if (category.indexOf(q) !== -1) score += 6

        // Per-word matches across expanded synonym set.
        expandedTerms.forEach(function (term) {
          if (term === q) return // already counted above
          if (name.indexOf(term) !== -1) score += 4
          if (desc.indexOf(term) !== -1) score += 2
          if (category.indexOf(term) !== -1) score += 2
        })

        return { t: t, score: score }
      })
      .filter(function (s) { return s.score > 0 })
      .sort(function (a, b) { return b.score - a.score })

    // V9.11.5 #23 — dedupe near-identical names. The DB has cases
    // like "Sensory Deprivation" + "Sensory Deprivation Experience"
    // which both surface for the same query. Collapse them by
    // canonicalising the name (lowercase, drop trailing
    // ' Experience' / ' Phenomenon' / ' Event'), then keep only
    // the highest-scoring entry per canonical key.
    function canonicalKey(rawName: string): string {
      return rawName
        .toLowerCase()
        .replace(/\s+(experience|experiences|phenomenon|phenomena|event|events)\s*$/i, '')
        .trim()
    }
    var seenKeys: Record<string, boolean> = {}
    var deduped: typeof scored = []
    for (var entry of scored) {
      var key = canonicalKey(entry.t.name)
      if (seenKeys[key]) continue
      seenKeys[key] = true
      deduped.push(entry)
      if (deduped.length >= 10) break
    }
    return deduped.map(function (s) { return s.t })
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
    // User picked their own type — drop the "best guess" label.
    setTypeWasAutofilled(false)
  }

  function clearTypeSelection() {
    setDraft(function (d) { return { ...d, category: '', phenomenon_type_id: '' } })
    setTypeSearch('')
    // Cleared the autofilled guess — drop the "best guess" label.
    setTypeWasAutofilled(false)
  }

  // Rotate the example carousel.
  // V9.11.5 #22 — bumped 5s → 9s. Mass-market readers couldn't finish
  // a 30-50 word example in 5s; the rotation felt like the page was
  // racing them. 9s gives comfortable read time without making the
  // carousel feel static.
  useEffect(function () {
    if (examples.length < 2) return
    var t = setInterval(function () {
      setExampleIndex(function (i) { return (i + 1) % examples.length })
    }, 9000)
    return function () { clearInterval(t) }
  }, [examples])

  // Auto-resize textarea on change.
  useEffect(function () {
    var el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 480) + 'px'
  }, [draft.description])

  // V9.11.5 — scroll to top on every step change. Without this, users
  // who scrolled deep into Step 1 (deep-detail sections) inherit that
  // scroll position when Step 2/3/4 renders, hiding the new step's
  // header behind the sticky nav.
  useEffect(function () {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
  }, [step])

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

  // ---------------- details step: AI prefill (best-effort, non-blocking)

  // On entering 'details', infer event location from the captured
  // description and pre-fill the where fields IF the user hasn't already
  // provided a location. Uses the client-safe inferLocation util (pure
  // regex/landmark lookup — no server call, no API key). Date extraction
  // has no comparable client-callable helper, so we skip date prefill
  // rather than build new infra. // TODO prefill: wire a date-extraction
  // util here if/when one becomes client-callable.
  var prefilledForDetailsRef = useRef(false)
  useEffect(function () {
    if (step !== 'details') return
    if (prefilledForDetailsRef.current) return
    prefilledForDetailsRef.current = true
    // Don't clobber anything the user already entered.
    var hasLocation = !!(draft.latitude && draft.longitude) || !!draft.city || !!draft.state_province || !!draft.country
    if (hasLocation) return
    var text = (draft.description || '').trim()
    if (text.length < 20) return
    try {
      var inferred = inferLocation(draft.title || '', '', text, {
        location_name: draft.location_name,
        city: draft.city,
        state_province: draft.state_province,
        country: draft.country,
        latitude: draft.latitude ? parseFloat(draft.latitude) : undefined,
        longitude: draft.longitude ? parseFloat(draft.longitude) : undefined,
      })
      if (inferred) {
        var loc = inferred // non-null local so the closure keeps narrowing
        setDraft(function (d) {
          // Re-check inside the updater so we never overwrite a value the
          // user may have typed between render and this callback.
          var stillEmpty = !(d.latitude && d.longitude) && !d.city && !d.state_province && !d.country
          if (!stillEmpty) return d
          var nextCountry = loc.country && COUNTRIES.indexOf(loc.country) !== -1 ? loc.country : d.country
          return {
            ...d,
            location_name: loc.locationName || d.location_name,
            city: loc.city || d.city,
            country: nextCountry,
            latitude: loc.latitude != null ? String(loc.latitude) : d.latitude,
            longitude: loc.longitude != null ? String(loc.longitude) : d.longitude,
            // inferLocation returns 2-letter state codes which won't match
            // the US_STATES <select> (full names), so we leave the select
            // untouched and rely on lat/lng + city + country for precision.
          }
        })
      }
    } catch { /* prefill is best-effort */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // V12 — Pre-select a best-guess phenomenon type on the details step.
  // The type picker is REQUIRED but starts empty, which adds friction. We
  // infer a likely type from the matcher (modal of the strongest matches)
  // and apply it once, clearly labeled as a guess + fully editable. Runs
  // only when: on the details step, no type chosen yet, a suggestion
  // exists, and the phenomenon-types list has loaded (so selectedType can
  // resolve). Guarded by a ref so it fires at most once.
  var prefilledTypeRef = useRef(false)
  useEffect(function () {
    if (step !== 'details') return
    if (prefilledTypeRef.current) return
    if (draft.phenomenon_type_id) return
    if (!suggestedType) return
    if (phenomenonTypes.length === 0) return
    // Confirm the suggested type id actually exists in the loaded list so
    // the selector can render it; otherwise wait (don't burn the ref).
    var match = phenomenonTypes.find(function (t) { return t.id === suggestedType.id })
    if (!match) return
    prefilledTypeRef.current = true
    var guess = suggestedType
    setDraft(function (d) {
      // Never clobber a type the user picked between render and callback.
      if (d.phenomenon_type_id) return d
      return { ...d, category: guess.category as PhenomenonCategory, phenomenon_type_id: guess.id }
    })
    setTypeWasAutofilled(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, suggestedType, phenomenonTypes.length])

  // ---------------- step 1 (experience) → reveal  [V11.19 reorder]

  // Compute the mirror from the DRAFT, BEFORE any account gate. The
  // /api/constellation/match endpoint accepts category+description with
  // no report_id and no auth (unauth callers get up to FREE_UNLOCKED
  // results), so we can deliver "you're not alone" first and ask for the
  // email only after the user has felt the payoff.
  async function continueToReveal() {
    setError(null)
    if (captureMode === 'video') {
      if (!pendingVideo) {
        setError('Add a short clip first — or switch to “Type your story.”')
        return
      }
      if (draft.description.trim().length < 12) {
        setError('Add a quick line about what happens in the clip so we can find matches.')
        return
      }
    } else if (draft.description.trim().length < 50) {
      setError('Add a few more words so we can find good matches — even one extra sentence helps.')
      return
    }
    try { localStorage.removeItem(ACCOUNT_ONLY_KEY) } catch {}
    saveDraft(draft)
    // V11.20 — re-stash the clip with the final one-liner so the video
    // (and its matching text) survive the magic-link round-trip. On the
    // text path, clear any stale stash so an abandoned earlier video
    // session can't hijack this text submission post-auth.
    if (captureMode === 'video' && pendingVideo) {
      try {
        await stashVideo(pendingVideo, {
          oneLiner: draft.description.trim(),
          category: draft.category || 'psychological_experiences',
          mime: (pendingVideo.type || 'video/mp4').split(';')[0].trim(),
          size: pendingVideo.size,
          durationSec: videoDurationSec,
        })
      } catch { /* stash is best-effort */ }
    } else {
      try { await clearStashedVideo() } catch {}
    }
    try {
      require('@/lib/posthog').capture('reveal_started', {
        description_length: draft.description.length,
        category: draft.category || null,
      })
    } catch {}
    setBusy(true)
    try {
      // V11.20 — pass the FULL signal the user entered (type, location,
      // date), not just category+description. Without these the match
      // can't score phenomenon-type / location-proximity / time-period
      // and tops out around ~30% even for on-topic results.
      var params = new URLSearchParams()
      params.set('category', draft.category || 'psychological_experiences')
      params.set('description', draft.description.slice(0, 500))
      params.set('limit', '8')
      if (selectedType && selectedType.name) params.set('type_name', selectedType.name)
      if (draft.latitude && draft.longitude) {
        params.set('lat', draft.latitude)
        params.set('lng', draft.longitude)
      }
      if (draft.event_date) params.set('event_date', draft.event_date)
      var matchUrl = '/api/constellation/match?' + params.toString()
      // No Authorization header — unauthenticated match (teaser set).
      var mResp = await fetch(matchUrl)
      if (mResp.ok) {
        var mData = await mResp.json()
        setMatches(mData.matches || [])
        setMatchStats({
          total: mData.stats?.total_matched || 0,
          nearby: mData.stats?.nearby || 0,
          database: mData.stats?.total_database || 0,
          overlap: mData.stats?.overlap_count || 0,
        })
        // V12 — stash the inferred best-guess type + related types so the
        // details step can pre-select the required picker (editable).
        setSuggestedType(mData.stats?.suggested_type || null)
        setRelatedTypeSuggestions(mData.stats?.related_types || [])
        // V11.23 — denser RADAR dot set; fall back to the card matches.
        setRadarPoints(mData.radar_points || [])
      }
    } catch { /* reveal is best-effort; show the step regardless */ }
    setBusy(false)
    setStep('reveal')
  }

  // After the reveal: route to the new 'details' step (for BOTH text and
  // video) so we collect when/where + a category confirm before saving.
  // The draft (with the captured description and any staged clip stashed
  // in IndexedDB) survives the move. The 'details' step's own CTA then
  // handles the auth branch (account vs. finishAuthedSubmission/submit).
  function proceedFromReveal() {
    try {
      require('@/lib/posthog').capture('details_started', {
        description_length: draft.description.length,
        category: draft.category || null,
      })
    } catch {}
    setStep('details')
  }

  // CTA on the 'details' step. Mirrors the old proceedFromReveal auth
  // logic: authed users save straight away (video → pipeline, text →
  // submit); unauthed users create an account first (the post-auth
  // callback then runs 'submit' / the video pipeline). The draft now
  // includes when/where, persisted via saveDraft so it survives the
  // magic-link bounce.
  function proceedFromDetails() {
    saveDraft(draft)
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (session) {
        if (captureMode === 'video' && pendingVideo) {
          finishAuthedSubmission(session.access_token)
          return
        }
        try {
          require('@/lib/posthog').capture('submit_started', {
            description_length: draft.description.length,
            category: draft.category || null,
          })
        } catch {}
        setStep('submit')
      } else {
        setStep('account')
      }
    })
  }

  // V11.20 — staged-clip handler: preview + capture duration, hold the
  // File in state, and stash it in IndexedDB so it survives sign-in.
  function onSelectVideo(file: File | null) {
    setError(null)
    if (videoPreviewUrl) { try { URL.revokeObjectURL(videoPreviewUrl) } catch {} }
    if (!file) { setPendingVideo(null); setVideoPreviewUrl(''); setVideoDurationSec(null); return }
    setPendingVideo(file)
    setDraft(function (d) { return { ...d, has_photo_video: true } })
    var url = URL.createObjectURL(file)
    setVideoPreviewUrl(url)
    // Read duration off a detached <video> (best-effort).
    try {
      var probe = document.createElement('video')
      probe.preload = 'metadata'
      probe.onloadedmetadata = function () {
        setVideoDurationSec(isFinite(probe.duration) ? Math.round(probe.duration) : null)
      }
      probe.src = url
    } catch { setVideoDurationSec(null) }
  }

  // V11.20 — in-step webcam recorder controls (desktop / Android).
  function stopCameraTracks() {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(function (t) { t.stop() })
        mediaStreamRef.current = null
      }
    } catch { /* ignore */ }
    if (liveVideoRef.current) { try { liveVideoRef.current.srcObject = null } catch {} }
  }

  function clearRecordTimer() {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
  }

  function closeCamera() {
    clearRecordTimer()
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
    } catch {}
    mediaRecorderRef.current = null
    stopCameraTracks()
    setRecorderPhase('off')
    setRecordSeconds(0)
  }

  async function openCamera() {
    setError(null)
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      mediaStreamRef.current = stream
      setRecorderPhase('live')
      setTimeout(function () {
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream
          var p = liveVideoRef.current.play()
          if (p && (p as any).catch) (p as any).catch(function () {})
        }
      }, 0)
    } catch (e: any) {
      setError('Couldn’t open the camera (' + (e?.name || 'permission denied') + '). You can upload a file instead.')
      setRecorderPhase('off')
    }
  }

  function startRecording() {
    var stream = mediaStreamRef.current
    if (!stream) return
    var mime = pickRecorderMime()
    var base = mime.split(';')[0].trim()
    recordedChunksRef.current = []
    var rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_800_000 })
    } catch {
      try { rec = new MediaRecorder(stream) } catch {
        setError('Recording isn’t supported in this browser — please upload a file instead.')
        return
      }
    }
    mediaRecorderRef.current = rec
    rec.ondataavailable = function (e: BlobEvent) {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data)
    }
    rec.onstop = function () {
      var blob = new Blob(recordedChunksRef.current, { type: base })
      stopCameraTracks()
      clearRecordTimer()
      setRecorderPhase('off')
      if (blob.size > 0) {
        var ext = base.indexOf('mp4') >= 0 ? 'mp4' : 'webm'
        var file = new File([blob], 'clip-' + Date.now() + '.' + ext, { type: base })
        onSelectVideo(file)
      }
    }
    rec.start()
    setRecorderPhase('recording')
    setRecordSeconds(0)
    clearRecordTimer()
    recordTimerRef.current = setInterval(function () {
      setRecordSeconds(function (s) {
        var next = s + 1
        if (next >= 300) { try { stopRecording() } catch {} } // 5-minute cap
        return next
      })
    }, 1000)
  }

  function stopRecording() {
    clearRecordTimer()
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
    } catch {}
  }

  // Stop the camera + timer if the user leaves the page mid-capture.
  useEffect(function () {
    return function () {
      try { if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(function (t) { t.stop() }) } catch {}
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    }
  }, [])

  // V11.20 — run the existing video pipeline for a staged clip:
  // upload-url → PUT blob → finalize (Whisper + Haiku), then land on the
  // review page so the transcript-drafted report can be confirmed.
  async function runVideoUpload(accessToken: string, stash: StashedVideo): Promise<void> {
    var baseMime = (stash.mime || 'video/mp4').split(';')[0].trim()
    var urlResp = await fetch('/api/reports/video/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({ mime_type: baseMime, size_bytes: stash.size, duration_sec: stash.durationSec }),
    })
    var urlData = await urlResp.json()
    if (!urlResp.ok || !urlData.ok) throw new Error(urlData.error || 'Could not start the video upload.')

    var put = await fetch(urlData.signed_url, { method: 'PUT', headers: { 'Content-Type': baseMime }, body: stash.blob })
    if (!put.ok) throw new Error('Video upload failed (' + put.status + ').')

    var finResp = await fetch('/api/reports/video/' + encodeURIComponent(urlData.report_id) + '/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({ duration_sec: stash.durationSec, size_bytes: stash.size }),
    })
    var finData = await finResp.json()
    if (!finResp.ok || !finData.ok) throw new Error(finData.error || 'Could not finalize the video.')

    try { localStorage.setItem(COMPLETE_KEY, '1') } catch {}
    await clearStashedVideo()
    clearDraft()
    router.replace(urlData.review_url || ('/submit/video-review/' + urlData.report_id))
  }

  // Authed-submission dispatcher: a staged clip runs the video pipeline;
  // otherwise the text-report 'submit' step. Guards the text-submit
  // effect via videoFlowRef so it doesn't also save a text report.
  async function finishAuthedSubmission(accessToken: string) {
    var stash = await loadStashedVideo()
    if (stash) {
      videoFlowRef.current = true
      setStep('submit')
      try {
        await runVideoUpload(accessToken, stash)
      } catch (e: any) {
        videoFlowRef.current = false
        setError(e?.message || 'Something went wrong uploading your video. You can try again.')
      }
      return
    }
    videoFlowRef.current = false
    setStep('submit')
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
      // V12 — email is the ONLY required field. Name + username are
      // optional here; users can set/refine them later in their profile.
      var email = (account.email || '').trim().toLowerCase()
      if (!email || !/.+@.+\..+/.test(email)) {
        throw new Error('Please enter a valid email address.')
      }
      // Username stays optional, but if the user typed one we still
      // respect a taken/invalid result so we don't send a doomed handle.
      if (account.username && (usernameStatus === 'taken' || usernameStatus === 'invalid')) {
        throw new Error('That username is taken — pick another, or leave it blank.')
      }
      saveAccount(account)
      saveDraft(draft) // re-save in case anything changed

      // Supabase Auth — magic link with metadata for the profile-creation
      // trigger (handle_new_user reads username + display_name from
      // raw_user_meta_data). When the user leaves username blank we
      // derive a safe fallback handle from the email local-part so the
      // profile trigger always has something valid to claim.
      var fallbackUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) || ('user' + Date.now().toString(36))
      var finalUsername = account.username || fallbackUsername
      var displayName = account.display_name?.trim() || finalUsername
      var redirectTo = window.location.origin + '/auth/callback?next=' + encodeURIComponent('/start?from=auth')

      var { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectTo,
          data: {
            username: finalUsername,
            display_name: displayName,
          },
        },
      })
      if (otpErr) throw otpErr
      setStep('check-email')
    } catch (err: any) {
      setError(err?.message || 'Couldn\'t send the sign-in link. Try again?')
    } finally {
      setBusy(false)
    }
  }

  // ---------------- step 4 — actually submit the report (post-auth)

  useEffect(function () {
    if (step !== 'submit') return
    // V11.20 — when a staged video is being routed through the video
    // pipeline, skip the text-report save (the 'submit' step is reused
    // only to show the processing spinner).
    if (videoFlowRef.current) return
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
            title: draft.title || null,
            description: draft.description,
            // Default to 'psychological_experiences' when uncategorised —
            // 'combination' was removed in V11 (migration 20260520) so
            // the broadest experiencer-content bucket is the safest fallback.
            category: draft.category || 'psychological_experiences',
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
            // Panel-feedback (May 2026): derived client-side based on which
            // location fields are filled. The server re-derives if absent
            // but we send the client's view so the user's intent is preserved.
            location_precision: (function () {
              if (draft.latitude && draft.longitude) return 'exact'
              if (draft.city) return 'city'
              if (draft.state_province) return 'region'
              if (draft.country) return 'country'
              return draft.location_precision || 'exact'
            })(),
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
        // V10.10 — funnel step 3 of 3. Steps 1 (landing_view) and 2
        // (start_form_open) fire on /index and /start mount; this is
        // the conversion event we count when computing the
        // landing → start → submitted funnel in PostHog.
        try {
          // Lazy import so non-onboarded paths don't pull posthog into
          // the start.tsx bundle weight if the user never reaches
          // submit. (Bundle-wise this is mostly cosmetic since posthog
          // is loaded by _app, but the dynamic import keeps the
          // dependency obvious to a grep.)
          require('@/lib/posthog').capture('report_share_funnel', {
            step: 'report_submitted',
            report_id: result.report_id,
            category: draft.category || null,
            had_media: pendingMedia.length > 0,
            description_length: (draft.description || '').length,
          })
          // T1.8 — explicit submit_complete event for the account-first
          // funnel (signup_intent → signup_complete → submit_started →
          // submit_complete).
          require('@/lib/posthog').capture('submit_complete', {
            report_id: result.report_id,
            category: draft.category || null,
            description_length: (draft.description || '').length,
          })
        } catch {}

        // V11.19 — removed the auto-grant 7-day Basic trial on first
        // submission. Per the panel + the community/first-party plan, the
        // FREE tier IS the trial: a real, unlimited-time product, not a
        // feature unlock that gets yanked back after 7 days (which captured
        // no payment and fought the "free is real, subscribe for depth"
        // positioning). A proper card-on-file trial, if we ever want one,
        // belongs at Stripe checkout — not auto-granted here. The
        // /api/subscription/activate-trial endpoint is left in place but
        // is now uncalled.

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

        // V11.19 — the reveal already happened pre-auth (continueToReveal),
        // so we don't re-fetch matches or re-show the reveal step here.
        // The report is now saved; drop the user into their full RADAR
        // (/lab), where ALL matches for the saved report are unlocked —
        // the natural "you've unlocked the rest" payoff to the teaser.
        clearDraft()
        if (!cancelled) router.replace('/lab')
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
                  What have you experienced that you can&rsquo;t explain?
                </h1>
                <p className="text-sm sm:text-base text-gray-300 mt-2 leading-relaxed">
                  Share what you experienced. We&apos;ll show you who else has &mdash; matched against millions of real stories.
                </p>
                {/* V9.11.5 #27.2 — trust signal: reports-only.
                    Reports = the actual data magnitude — MUFON, NUFORC,
                    BFRO, Reddit, YouTube ingestion + user submissions —
                    will grow into the millions. The phenomena/encyclopedia
                    count is the SCHEMA and stays fixed or shrinks during
                    MVP cleanup, so showing it would shrink the trust
                    signal as we optimize. Threshold of 1,000 keeps a low
                    pre-ingestion value from undermining the message. */}
                {archiveStats.reports >= 1000 && (
                  <p className="text-[11px] text-gray-500 mt-3 flex items-center gap-1.5">
                    <span className="inline-block w-1 h-1 rounded-full bg-purple-400" />
                    {archiveStats.reports.toLocaleString()}+ reports already in the archive.
                  </p>
                )}
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

              {/* Panel-feedback (May 2026 — 2nd revision): visible
                  Type/Record segmented control at the top of the
                  experience step. Most mobile users prefer to
                  share on camera; burying the option as a small text
                  link hides the most-wanted path. */}
              <div className="flex w-full p-1 bg-gray-900/60 border border-gray-800 rounded-full">
                <button
                  type="button"
                  onClick={function () { setCaptureMode('text') }}
                  aria-pressed={captureMode === 'text'}
                  className={
                    'flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm transition-colors ' +
                    (captureMode === 'text' ? 'bg-purple-600 text-white font-semibold' : 'text-gray-300 hover:text-white font-medium')
                  }
                >
                  <FileText className="w-4 h-4" />
                  Type your story
                </button>
                <button
                  type="button"
                  onClick={function () { setCaptureMode('video') }}
                  aria-pressed={captureMode === 'video'}
                  className={
                    'flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm transition-colors ' +
                    (captureMode === 'video' ? 'bg-purple-600 text-white font-semibold' : 'text-gray-300 hover:text-white font-medium')
                  }
                >
                  <Camera className="w-4 h-4" />
                  Record on camera
                </button>
              </div>

              {/* V11.20 — in-step video capture. The clip is staged (not
                  uploaded); the one-liner below drives the reveal; the
                  clip transcribes after account creation. */}
              {captureMode === 'video' && (
                <div className="space-y-3">
                  {!pendingVideo ? (
                    recorderPhase === 'off' ? (
                      <div className="space-y-2.5">
                        <button
                          type="button"
                          onClick={openCamera}
                          className="w-full inline-flex items-center justify-center gap-2.5 rounded-2xl border border-purple-700/50 bg-gradient-to-br from-purple-950/50 to-gray-950/50 px-6 py-5 text-white hover:from-purple-900/50 transition-colors"
                        >
                          <Camera className="w-6 h-6 text-purple-200" />
                          <span className="text-base font-semibold">Record now</span>
                        </button>
                        <label
                          htmlFor="exp-video"
                          className="block w-full cursor-pointer rounded-2xl border border-dashed border-gray-700 bg-gray-900/40 px-6 py-4 text-center hover:border-gray-600 transition-colors"
                        >
                          <span className="text-sm font-medium text-gray-200 inline-flex items-center gap-2 justify-center">
                            <Upload className="w-4 h-4" /> Upload a file
                          </span>
                          <span className="block text-[11px] text-gray-500 mt-1">
                            Up to 5 minutes. We&rsquo;ll transcribe it after you create your account.
                          </span>
                          <input
                            id="exp-video"
                            type="file"
                            accept="video/*"
                            capture="environment"
                            className="hidden"
                            onChange={function (e) { onSelectVideo((e.target.files && e.target.files[0]) || null) }}
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-3 space-y-3">
                        <video ref={liveVideoRef} autoPlay muted playsInline className="w-full max-h-72 rounded-xl bg-black" />
                        {recorderPhase === 'recording' && (
                          <div className="flex items-center justify-center gap-2 text-sm text-red-300">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                            Recording · {Math.floor(recordSeconds / 60)}:{('0' + (recordSeconds % 60)).slice(-2)}
                          </div>
                        )}
                        <div className="flex items-center justify-center gap-3">
                          {recorderPhase === 'live' ? (
                            <>
                              <button
                                type="button"
                                onClick={startRecording}
                                className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors"
                              >
                                <span className="w-2.5 h-2.5 rounded-full bg-white" /> Start recording
                              </button>
                              <button
                                type="button"
                                onClick={closeCamera}
                                className="text-sm text-gray-400 hover:text-gray-200"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={stopRecording}
                              className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-full transition-colors"
                            >
                              <span className="w-3 h-3 rounded-sm bg-white" /> Stop
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-3">
                      {videoPreviewUrl && (
                        <video src={videoPreviewUrl} controls playsInline className="w-full max-h-72 rounded-xl bg-black" />
                      )}
                      <div className="flex items-center justify-between mt-2 gap-3">
                        <p className="text-xs text-gray-400 truncate">
                          {pendingVideo.name}{videoDurationSec ? ' · ' + videoDurationSec + 's' : ''}
                        </p>
                        <button
                          type="button"
                          onClick={function () { onSelectVideo(null) }}
                          className="flex-shrink-0 text-xs text-purple-300 hover:text-purple-200"
                        >
                          Retake / choose another
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Textarea — body of the report. Panel-feedback (May
                  2026): renamed label to "What happened?" because the
                  field maps to reports.description, which surfaces on
                  the report page under the same heading. The previous
                  "Your experience" label confused users into thinking
                  this single field was the entire report. */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="exp-desc">
                  {captureMode === 'video' ? 'In one line, what happens in the clip?' : 'What happened?'}
                </label>
                <textarea
                  id="exp-desc"
                  ref={textareaRef}
                  value={draft.description}
                  onChange={function (e) { setDraft(function (d) { return { ...d, description: e.target.value } }) }}
                  placeholder={captureMode === 'video' ? 'e.g. A triangular craft hovered over the highway, three white lights at the corners.' : 'It happened in… I saw… I felt…'}
                  rows={captureMode === 'video' ? 2 : 4}
                  maxLength={2000}
                  autoFocus={captureMode === 'text'}
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl p-4 text-base placeholder-gray-500 focus:outline-none focus:border-purple-500 leading-relaxed resize-none"
                />
                {/* V9.11.5 #27 — staged inline rewards. Each tier
                    gives the user a small dopamine hit for adding
                    detail, reinforcing the high-quality-report goal
                    without ever gating completion. Color subtly
                    escalates from neutral grey → emerald → purple. */}
                <div className="flex justify-between text-xs mt-1.5 px-1">
                  <span className={
                    draft.description.length === 0 ? 'text-gray-500'
                    : draft.description.length < 50 ? 'text-gray-500'
                    : draft.description.length < 100 ? 'text-emerald-400'
                    : draft.description.length < 250 ? 'text-emerald-300'
                    : draft.description.length < 500 ? 'text-purple-300'
                    : 'text-purple-200'
                  }>{
                    draft.description.length === 0 ? 'A few sentences is plenty.'
                    : draft.description.length < 50 ? 'A few more words…'
                    : draft.description.length < 100 ? '✓ Good — keep going if you want.'
                    : draft.description.length < 250 ? '✓ Great detail — your RADAR will sharpen.'
                    : draft.description.length < 500 ? '✓✓ Strong report — better matches incoming.'
                    : '★ This will match deeply across the archive.'
                  }</span>
                  <span className="text-gray-500">{draft.description.length} / 2000</span>
                </div>
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

              {/* Continue + Skip.
                  V12 — the experience step is now capture-only: as soon
                  as there's a usable description (or, in video mode, a
                  staged clip + one-liner) we let the user through to the
                  reveal. When/where + category confirm move to the new
                  'details' step, AFTER the payoff. */}
              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={continueToReveal}
                  disabled={busy || (function () {
                    // Video mode: a staged clip + a one-liner is enough.
                    if (captureMode === 'video') {
                      if (!pendingVideo) return true
                      if (draft.description.trim().length < 12) return true
                      return false
                    }
                    // Text mode: a usable description is the only gate.
                    if (draft.description.trim().length < 50) return true
                    return false
                  })()}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-40"
                >
                  {busy ? 'Searching the archive…' : 'See who else has experienced this'}
                  {!busy && <ArrowRight className="w-4 h-4" />}
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
            // T1.8 (May 2026) — onboarding is account-first by default
            // for unauthed visitors. The earlier 'one more step / save
            // your experience' copy assumed the user had already typed
            // an experience; in the account-first flow they haven't, so
            // that wording was vestigial and misleading. The
            // ACCOUNT_ONLY_KEY localStorage flag (set by the legacy
            // 'create my account, share later' CTA) is still respected
            // but the difference between the two paths is now just a
            // line of nuance, not two different headlines.
            var hasDraft = false
            try {
              hasDraft = !!(localStorage.getItem(DRAFT_KEY) && draft.description.trim().length > 0)
            } catch {}
            return (
            <div className="space-y-6">
              <div>
                {/* Back to experience only when there's actually a
                    draft to return to. For an unauthed account-first
                    visitor with no draft, the back button just dumped
                    them on an empty form they didn't intend to fill. */}
                {hasDraft && (
                  <button
                    type="button"
                    onClick={function () { setStep('experience') }}
                    className="text-sm text-gray-400 hover:text-white mb-3 inline-flex items-center gap-1"
                  >
                    ← Back to your experience
                  </button>
                )}
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                  Create your account.
                </h1>
                <p className="text-sm sm:text-base text-gray-300 mt-2 leading-relaxed">
                  {hasDraft
                    ? 'We’ll save what you wrote and email you a one-tap sign-in link. No password to remember.'
                    : 'We’ll email you a one-tap sign-in link. No password to remember. Share an experience whenever you’re ready.'}
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
                  Username <span className="text-gray-500 font-normal">(optional — we&rsquo;ll pick one if you skip it)</span>
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
                  // V12 — email is the only required field. Username is
                  // optional; we only block on a typed-but-invalid handle.
                  busy ||
                  !account.email ||
                  (!!account.username && (usernameStatus === 'taken' || usernameStatus === 'invalid' || usernameStatus === 'checking'))
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
                We email a one-tap sign-in link instead of asking you for a password.
              </p>
            </div>
            )
          })()}

          {/* ============= STEP 3 — CHECK EMAIL =============
              V9.11.5 #30 — Panel-driven copy revamp. Replaces the
              transactional "we'll save your experience" with a
              preview of what users actually unlock when they tap
              the link. Builds anticipation during dead time, eases
              passwordless anxiety, and hints at the archive scale
              + community without requiring a hardcoded number. */}
          {step === 'check-email' && (
            <div className="text-center py-8 space-y-6">
              <div className="inline-flex w-16 h-16 rounded-full bg-purple-600/20 border border-purple-500/30 items-center justify-center">
                <Mail className="w-7 h-7 text-purple-300" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">Check your email.</h1>
                <p className="text-sm sm:text-base text-gray-300 mt-3 leading-relaxed">
                  We sent a one-tap sign-in link to{' '}
                  <strong className="text-white">{account.email}</strong>.
                </p>
              </div>

              {/* Preview of what they unlock — anticipation builder.
                  T1.8 (May 2026): bullets adapt to whether the user
                  has actually typed an experience. Account-first
                  visitors see a "what's waiting for you" framing;
                  draft-first visitors see the original "your report
                  + matches" framing. */}
              <div className="max-w-sm mx-auto text-left bg-gray-900/40 border border-gray-800/60 rounded-xl p-4 space-y-2.5">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-400">
                  Once you tap the link
                </p>
                <ul className="space-y-2 text-sm text-gray-200 leading-relaxed">
                  {draft.description.trim().length >= 30 ? (
                    <>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Your experience joins the archive</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>We surface others who&rsquo;ve had something like it</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Your personal RADAR maps patterns across thousands of reports</span>
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Your account is created &mdash; no password needed</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Browse thousands of paranormal, UFO, and unexplained reports</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Share your own experience whenever you&rsquo;re ready &mdash; we&rsquo;ll match it to similar cases</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>

              <p className="text-[11px] text-gray-500 max-w-sm mx-auto leading-relaxed">
                No password to remember &mdash; your email keeps your account safe.
                If you don&rsquo;t see it in a minute, check your spam folder.
              </p>

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
              {/* V9.11.5 — only spin while we're actually working. When
                  an error has fired, drop the loader and show a recovery
                  path back to step 1 so the user isn't trapped. */}
              {!error && (
                <>
                  <Loader2 className="w-10 h-10 text-purple-300 animate-spin mx-auto" />
                  <p className="text-base text-gray-200">
                    {busy ? 'Saving your experience…' : 'Searching the archive…'}
                  </p>
                </>
              )}
              {error && (
                <>
                  <div className="inline-flex w-12 h-12 rounded-full bg-red-950/30 border border-red-900/50 items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6 text-red-300" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg sm:text-xl font-semibold text-white">
                      We hit a snag.
                    </h2>
                    <p className="text-sm text-gray-300 max-w-sm mx-auto leading-relaxed">
                      {error}
                    </p>
                  </div>
                  <div className="space-y-2 max-w-xs mx-auto">
                    <button
                      type="button"
                      onClick={function () {
                        setError(null)
                        setStep('experience')
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors"
                    >
                      Edit my description
                    </button>
                    <button
                      type="button"
                      onClick={function () {
                        // Re-trigger the submit effect by leaving + re-entering step.
                        setError(null)
                        setStep('account')
                        setTimeout(function () { setStep('submit') }, 0)
                      }}
                      className="w-full text-sm text-gray-400 hover:text-gray-200 transition-colors py-2"
                    >
                      Or try saving again
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ============= STEP 5 — RADAR REVEAL ============= */}
          {/* V9.11.5 #16 — animated mini-RADAR replaces the previous
              static list. Panel-driven (Onboarding/retention, Brand
              strategist, UX writer, CRO, Visual designer/motion).
              Visualisation IS the payoff; cards beneath are supporting.
              V9.11.5 #20 — vertically center the reveal content so the
              full payoff (radar + headline + match cards + CTA) sits
              in the viewport on first paint. Without this the H1 and
              CTA were pushed below the fold on standard laptop heights. */}
          {step === 'reveal' && (
            <div className="space-y-6 flex flex-col justify-center min-h-[calc(100dvh-200px)] -mt-6 sm:-mt-12">
              {/* Mini-RADAR visualization */}
              <div className="flex justify-center pt-2">
                <RadarVisualization
                  mode="reveal"
                  matches={(radarPoints.length > 0 ? radarPoints : matches).map(function (m) {
                    return {
                      id: m.id,
                      title: m.title,
                      slug: m.slug,
                      category: m.category,
                      match_score: m.match_score,
                    }
                  })}
                  user={{
                    latitude: draft.latitude ? parseFloat(draft.latitude) : null,
                    longitude: draft.longitude ? parseFloat(draft.longitude) : null,
                  }}
                  size={300}
                  centerLabel="YOU"
                  onMatchClick={function (m) {
                    if (typeof window !== 'undefined') window.location.href = '/report/' + m.slug
                  }}
                />
              </div>

              <div className="text-center">
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                  {matchStats.overlap > 0
                    ? 'You\'re not alone.'
                    : 'Yours is a rare one.'}
                </h1>
                <p className="text-sm sm:text-base text-gray-300 mt-2 leading-relaxed px-2">
                  {matchStats.overlap > 0
                    ? (matchStats.overlap === 1 ? '1 person' : matchStats.overlap.toLocaleString() + ' people') + ' reported something that overlaps with yours. Across ' + (matchStats.database || 0).toLocaleString() + ' patterns to explore.'
                    : matches.length > 0
                      ? 'Only loose echoes so far — nothing quite like yours yet. Create your account to save it, and we\'ll surface matches as more people share.'
                      : 'We haven\'t seen one quite like this yet. Create your account to save it — and we\'ll surface matches here as more people share.'}
                </p>
              </div>

              {/* Top 3 match cards (preview only — full list lives in /lab) */}
              {matches.length > 0 && (
                <div className="space-y-2">
                  {matches.slice(0, 3).map(function (m) {
                    return (
                      <Link
                        key={m.id}
                        href={'/report/' + m.slug}
                        className="block p-3 bg-gray-900/80 border border-gray-800 rounded-xl hover:border-purple-500/40 transition-colors"
                      >
                        <p className="text-sm font-medium text-white truncate">{m.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {Math.round(m.match_score * 100)}% match
                          {m.match_dimensions && m.match_dimensions.length > 0 && (
                            <> · {m.match_dimensions.map(function (d) { return d.label }).join(', ')}</>
                          )}
                        </p>
                      </Link>
                    )
                  })}
                  {matches.length > 3 && (
                    <p className="text-[11px] text-purple-300/80 text-center pt-1">
                      + {matches.length - 3} more — unlock your full RADAR with a free account
                    </p>
                  )}
                </div>
              )}

              {/* V9.11.6 Phase 1.C — peer-connection opt-in. Self-gates to
                  authed sessions (renders null pre-auth), so on the V11.19
                  pre-account reveal it stays hidden; it surfaces for a
                  returning authed user capturing again. The post-signup
                  peer-connection moment now lives on /lab. */}
              {matches.length > 0 && (
                <PeerConnectionOptIn />
              )}

              {/* V11.19 — reveal is now PRE-auth: this is the gate. Deliver
                  the save + "unlock the rest" as the reason to sign up. */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={proceedFromReveal}
                  className="block w-full text-center px-6 py-3.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors"
                >
                  {matches.length > 0
                    ? 'Create your free account to save this & unlock your full RADAR →'
                    : 'Create your free account to save this →'}
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="block w-full text-center text-xs text-gray-500 hover:text-gray-300 py-3 mt-1"
                >
                  not now — just browse the feed
                </button>
              </div>
            </div>
          )}

          {/* ============= STEP 3 — SHARPEN (details) =============
              V12 — inserted between reveal and account. We collect the
              required when/where (precision-flexible) + a category
              confirm here, AFTER the reveal payoff, so the saved report
              has a map pin + a date for the feed. Optional depth (title,
              witnesses, related, evidence, visibility) stays available
              but secondary. The draft is persisted via saveDraft so it
              survives the magic-link bounce. */}
          {step === 'details' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                  Add when &amp; where to sharpen your matches.
                </h1>
                <p className="text-sm sm:text-base text-gray-300 mt-2 leading-relaxed">
                  A rough date and place is all we need &mdash; even an approximate year or just a country. It puts your story on the map and tightens who you match with.
                </p>
              </div>

              {/* Phenomenology picker (V9.11.1).
                  Mirrors the /submit pattern: search-first, browse-by-category fallback.
                  Replaces the deprecated emoji chip strip.
                  V9.11.5 #28 — relabeled "What kind of experience was it?"
                  to avoid colliding with the new H1 ("What have you
                  experienced that you can't explain?"). The H1 asks them
                  to describe; this asks them to categorize. */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  What kind of experience was it? <span className="text-purple-300/70 font-normal">(required)</span>
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Search for an experience type, or browse by category.
                </p>

                {draft.category && selectedType ? (
                  /* Type selected — show chip with category context */
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={classNames(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border',
                        selectedCategoryConfig
                          ? selectedCategoryConfig.bgColor + ' border-current ' + selectedCategoryConfig.color
                          : 'bg-white/5 border-white/10'
                      )}>
                        <CategoryIcon category={draft.category as PhenomenonCategory} size={16} />
                        <span className="text-sm font-medium text-white">{friendlyTypeName(selectedType.name, selectedType.description).primary}</span>
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
                    {/* V12 — best-guess label, shown only when we auto-selected
                        this type from the user's story. Disappears once they
                        change it (clearTypeSelection / pick another). */}
                    {typeWasAutofilled && (
                      <p className="text-xs text-gray-400 mt-2">
                        Our best guess from your story &mdash; change if needed.
                      </p>
                    )}
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
                            setTypeWasAutofilled(false)
                          }}
                          className="w-full bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Select a specific type…</option>
                          {filteredTypes.map(function (type) {
                            return (
                              <option key={type.id} value={type.id}>{friendlyTypeName(type.name, type.description).primary}</option>
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
                              var friendly = friendlyTypeName(type.name, type.description)
                              return (
                                <button
                                  key={type.id}
                                  type="button"
                                  onClick={function () { selectTypeFromSearch(type) }}
                                  className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-start justify-between gap-3 border-b border-white/5 last:border-0"
                                >
                                  <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <CategoryIcon category={type.category as PhenomenonCategory} size={16} />
                                    <div className="min-w-0 flex-1">
                                      <span className="text-sm text-white block truncate">{friendly.primary}</span>
                                      {friendly.secondary && (
                                        <span className="text-[11px] text-gray-500 block truncate leading-snug mt-0.5">{friendly.secondary}</span>
                                      )}
                                    </div>
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
                        {Object.entries(CATEGORY_CONFIG).filter(function (entry) { return !(entry[1] as any).hidden }).map(function (entry) {
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
                <p className="text-[11px] font-semibold tracking-widest uppercase text-purple-300/70 mb-1">
                  Required &mdash; when &amp; where
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
                          max={(function () {
                            var d = new Date()
                            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
                          })()}
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
                      <LocationAutocomplete
                        field="city"
                        value={draft.city}
                        onChange={function (v) { setDraft(function (d) { return { ...d, city: v } }) }}
                        onSuggestionSelect={function (s) {
                          // Panel-feedback (May 2026 — 2nd round): force-
                          // fill structured fields even if user already
                          // typed in them. Explicit suggestion tap is
                          // the strongest possible opt-in.
                          setDraft(function (d) {
                            return {
                              ...d,
                              city: s.city || s.label,
                              state_province: s.state || d.state_province,
                              country: s.country || d.country,
                              latitude: s.latitude != null ? String(s.latitude) : d.latitude,
                              longitude: s.longitude != null ? String(s.longitude) : d.longitude,
                            }
                          })
                        }}
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

                    {/* V9.11.5 #25 — LocationPicker provides its own
                        internal label (with live coords) + hint copy.
                        Wrapper label/hint were duplicating those, so
                        the section showed the same string twice. Just
                        render the component directly. */}
                    <LocationPicker
                      latitude={draft.latitude}
                      longitude={draft.longitude}
                      onLocationChange={function (lat: string, lng: string) {
                        setDraft(function (d) { return { ...d, latitude: lat, longitude: lng } })
                      }}
                    />
                  </div>
                </DetailSection>

              {/* Panel-feedback (May 2026) — Title field.
                  Optional; auto-suggested via Haiku once the user has
                  ≥120 chars of body. Click the suggestion to accept it;
                  type your own to override. Leaving it blank is fine —
                  the server runs the same suggestion as a fallback.
                  Why we collect this: the report-page hero needs a
                  proper short title. Before this change, the body's
                  first sentence was being used as the title which made
                  the title field on the report page look like a
                  truncated body. */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="exp-title">
                  Title <span className="text-gray-500 font-normal">(optional — we&rsquo;ll suggest one)</span>
                </label>
                <input
                  id="exp-title"
                  type="text"
                  value={draft.title}
                  onChange={function (e) { setDraft(function (d) { return { ...d, title: e.target.value } }) }}
                  placeholder={titleSuggestion ? titleSuggestion : 'A short headline for your experience'}
                  maxLength={140}
                  className="w-full bg-gray-900/80 border border-gray-700 rounded-xl px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                {/* Suggestion affordance — only show when we have a
                    suggestion AND the user hasn't typed their own. */}
                {titleSuggestion && !draft.title && (
                  <div className="mt-2 flex items-center justify-between gap-2 px-1">
                    <p className="text-xs text-gray-400 leading-snug">
                      <span className="text-purple-300/80">Suggested:</span>{' '}
                      <span className="italic">&ldquo;{titleSuggestion}&rdquo;</span>
                    </p>
                    <button
                      type="button"
                      onClick={function () { setDraft(function (d) { return { ...d, title: titleSuggestion } }) }}
                      className="text-xs text-purple-300 hover:text-purple-200 underline underline-offset-2 whitespace-nowrap"
                    >
                      Use this
                    </button>
                  </div>
                )}
                {titleSuggesting && !titleSuggestion && (
                  <p className="text-xs text-gray-500 mt-2 px-1 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Drafting a title for you…
                  </p>
                )}
                {titleSuggestError && (
                  <p className="text-xs text-gray-500 mt-2 px-1">
                    Couldn&rsquo;t suggest a title — type your own, or leave blank and we&rsquo;ll handle it on save.
                  </p>
                )}
              </div>

                <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 mb-1 mt-4">
                  Add more details (optional)
                </p>

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
                    // Suggested types — V12: lead with the matcher's inferred
                    // related types (from the user's own story), then fall in
                    // behind the static primary-type associations. Deduped,
                    // primary excluded, editorial types dropped.
                    var matcherRelated = relatedTypeSuggestions
                      .map(function (r) { return phenomenonTypes.find(function (t) { return t.id === r.id }) })
                      .filter(function (t): t is PhenomenonType { return !!t })
                    var assocRelated = typeAssociations
                      .map(function (a) { return phenomenonTypes.find(function (t) { return t.id === a.type_id }) })
                      .filter(function (t): t is PhenomenonType { return !!t })
                    var suggestedSeen: Record<string, boolean> = {}
                    var suggestedTypes = matcherRelated.concat(assocRelated)
                      .filter(function (t) {
                        if (t.id === draft.phenomenon_type_id) return false
                        if (isEditorialType(t.name, t.slug)) return false
                        if (suggestedSeen[t.id]) return false
                        suggestedSeen[t.id] = true
                        return true
                      })
                      .slice(0, 6)

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
                            {(function () {
                              var f = friendlyTypeName(type.name, type.description)
                              return (
                                <>
                                  <span className={classNames(
                                    'text-sm block',
                                    isSelected ? 'text-purple-200 font-medium' : 'text-gray-300'
                                  )}>
                                    {f.primary}
                                  </span>
                                  {f.secondary && (
                                    <span className="text-[11px] text-gray-500 block mt-0.5 leading-snug">
                                      {f.secondary}
                                    </span>
                                  )}
                                </>
                              )
                            })()}
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
                                  .filter(function (entry) { return entry[0] !== draft.category && !(entry[1] as any).hidden })
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
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">Privacy</p>
                  {/* V9.11.5 #27 — Moderation reassurance. Calms users who
                      worry the public feed is a free-for-all, and signals
                      that we filter abuse / doxx / hate before publish. */}
                  <p className="text-[10px] text-gray-500 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-purple-400/70" />
                    Reviewed before publish
                  </p>
                </div>

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
                  {/* V9.11.5 #27 — Plain-language moderation note. We screen
                      for abuse, doxxing of private individuals, and hate
                      content; everything else is welcome regardless of how
                      strange it sounds. */}
                  <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                    We review reports for abuse, doxxing, and content targeting individuals — not for whether your experience seems strange.
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

              {/* Required-fields nudge — category + when + where. */}
              {(function () {
                var missing: string[] = []
                if (!draft.category) missing.push('the kind of experience')
                if (!draft.event_date) missing.push('when this happened (even a year is fine)')
                var hasLocation = !!(draft.latitude && draft.longitude) || !!draft.city || !!draft.state_province || !!draft.country
                if (!hasLocation) missing.push('where this happened (even just a country is fine)')
                if (missing.length === 0) return null
                return (
                  <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80 mb-1.5">A few more things</p>
                    <p className="text-xs text-amber-100/90 leading-relaxed">
                      To save your report, please add {missing.join('; ')}.
                    </p>
                  </div>
                )
              })()}

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={proceedFromDetails}
                  disabled={busy || (function () {
                    if (!draft.category) return true
                    if (!draft.event_date) return true
                    var hasLocation = !!(draft.latitude && draft.longitude) || !!draft.city || !!draft.state_province || !!draft.country
                    if (!hasLocation) return true
                    return false
                  })()}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-40"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={function () { setStep('reveal') }}
                  className="block w-full text-center text-xs text-gray-500 hover:text-gray-300 py-1"
                >
                  &larr; Back to your matches
                </button>
              </div>
            </div>
          )}


        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- subcomponents

/**
 * V9.11.6 Phase 1.C — peer-connection opt-in.
 *
 * Shown on the post-RADAR reveal step when matches exist. Lets the
 * user opt into receiving connection requests from other users with
 * similar matched experiences — without forcing a decision at
 * submission time (decision fatigue) or burying it in Settings
 * (low discoverability).
 *
 * Writes to profiles.allow_peer_connection. Default FALSE; one tap
 * sets TRUE. After opt-in, shows a quiet confirmation; the toggle
 * remains visible so users can flip back off without leaving the
 * page. Errors are silent and non-blocking — the reveal flow must
 * never feel like it's gating on a network call.
 */
function PeerConnectionOptIn() {
  var [state, setState] = useState<'idle' | 'saving' | 'on' | 'off' | 'error'>('idle')
  // V11.19 — the opt-in writes to profiles, so it requires a session.
  // On the new pre-account reveal there is no session; render nothing.
  var [hasSession, setHasSession] = useState(false)

  // Load current value on mount so we render the right state if the
  // user revisits this screen (e.g. after coming back from /lab).
  useEffect(function () {
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session) return
      setHasSession(true)
      ;(supabase.from('profiles') as any)
        .select('allow_peer_connection')
        .eq('id', session.user.id)
        .single()
        .then(function (result: any) {
          if (result && result.data) {
            setState(result.data.allow_peer_connection ? 'on' : 'off')
          } else {
            setState('off')
          }
        })
    })
  }, [])

  function toggle() {
    if (state === 'saving') return
    var nextOn = state !== 'on'
    setState('saving')
    supabase.auth.getSession().then(function (s) {
      var session = s.data.session
      if (!session) { setState('error'); return }
      ;(supabase.from('profiles') as any)
        .update({ allow_peer_connection: nextOn })
        .eq('id', session.user.id)
        .then(function (result: any) {
          if (result && result.error) { setState('error'); return }
          setState(nextOn ? 'on' : 'off')
        })
    })
  }

  if (!hasSession) return null

  return (
    <div className="bg-gray-900/50 border border-gray-800/60 rounded-xl p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium leading-snug">
            Open to hearing from others?
          </p>
          <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">
            When someone&rsquo;s experience matches yours, they can ask to compare notes &mdash; mediated through Paradocs, never your direct contact info. You can change this anytime in Settings.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={state === 'on'}
          aria-label={state === 'on' ? 'Disable peer connection' : 'Enable peer connection'}
          disabled={state === 'saving'}
          className={
            'flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ' +
            (state === 'on' ? 'bg-purple-600' : 'bg-gray-700') +
            (state === 'saving' ? ' opacity-60 cursor-wait' : '')
          }
        >
          <span
            className={
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ' +
              (state === 'on' ? 'translate-x-5' : 'translate-x-0')
            }
          />
        </button>
      </div>
      {state === 'on' && (
        <p className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1">
          <Check className="w-3 h-3" /> You&rsquo;re open to connecting.
        </p>
      )}
      {state === 'error' && (
        <p className="text-[11px] text-red-300 mt-2">Couldn&rsquo;t save &mdash; tap to retry.</p>
      )}
    </div>
  )
}

function StepIndicator({ step }: { step: Step }) {
  // V12 — progress dots across the pre-auth journey: capture → see your
  // matches → sharpen (when/where) → save (account). The 'check-email'
  // step is a hand-off (waiting for the email tap), and submit/done
  // redirect, so none of those show dots.
  var visible: Step[] = ['experience', 'reveal', 'details', 'account']
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
