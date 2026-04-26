'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Check, MapPin, Calendar, Users,
  FileText, Eye, Upload, AlertCircle, Camera, Search, X, ChevronDown, Locate, Loader2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ImageUpload, { UploadedFile } from '@/components/ImageUpload'
import { PhenomenonCategory, PhenomenonType } from '@/lib/database.types'
import { CATEGORY_CONFIG, COUNTRIES, US_STATES } from '@/lib/constants'
import { generateSlug, classNames } from '@/lib/utils'
import CategoryIcon from '@/components/ui/CategoryIcon'
import dynamic from 'next/dynamic'

const LocationPicker = dynamic(() => import('@/components/LocationPicker'), { ssr: false })

/**
 * Filter out phenomenon types that don't belong in a user submission form.
 *
 * The phenomenon_types table contains entries for both:
 *   (a) Personal experience types (what a user would self-select when reporting)
 *   (b) Editorial/classification labels used internally for content tagging
 *
 * This function returns TRUE for types that should be HIDDEN from the form.
 */
function isEditorialType(name: string, slug: string | null): boolean {
  const n = name.toLowerCase()
  const s = (slug || '').toLowerCase()

  // Pattern 1: "Historical ___" — editorial classification, not a personal experience
  // e.g. "Historical Sighting", "Historical Cryptid Report", "Historical Haunting"
  if (n.startsWith('historical ')) return true

  // Pattern 2: Case/classification labels — editorial, not experiencer language
  // e.g. "Notable Case", "Infamous Case", "Classic Case", "Famous Case"
  if (/\b(notable|infamous|classic|famous)\s+(case|report|incident)/i.test(name)) return true

  // Pattern 3: Specific well-known locations — these describe a place, not an experience type
  // Users should describe *what* they experienced; the location goes in the location field
  const locationSlugs = new Set([
    'bermuda-triangle', 'skinwalker-ranch', 'ley-line',
  ])
  if (locationSlugs.has(s)) return true
  const locationNames = new Set([
    'bermuda triangle', 'skinwalker ranch', 'ley line',
  ])
  if (locationNames.has(n)) return true

  return false
}

type Step = 1 | 2 | 3 | 4

export default function SubmitPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [phenomenonTypes, setPhenomenonTypes] = useState<PhenomenonType[]>([])
  const [error, setError] = useState('')
  const [uploadedMedia, setUploadedMedia] = useState<UploadedFile[]>([])

  // Geolocation state
  const [geolocating, setGeolocating] = useState(false)
  const [geoError, setGeoError] = useState('')

  // Smart type search state
  const [typeSearch, setTypeSearch] = useState('')
  const [typeSearchFocused, setTypeSearchFocused] = useState(false)
  const [showBrowseCategories, setShowBrowseCategories] = useState(false)

  // Related phenomena state
  const [relatedSearch, setRelatedSearch] = useState('')
  const [typeAssociations, setTypeAssociations] = useState<{ type_id: string; score: number }[]>([])
  const [showAllRelated, setShowAllRelated] = useState(false)

  // Form data
  const [formData, setFormData] = useState({
    // Step 1: Basic Info
    title: '',
    category: '' as PhenomenonCategory | '',
    phenomenonTypeId: '',
    additionalTypeIds: [] as string[], // Cross-disciplinary tags
    summary: '',

    // Step 2: Details
    description: '',
    eventDate: '',
    eventTime: '',
    eventDatePrecision: 'exact' as 'exact' | 'month' | 'year' | 'decade',
    durationMinutes: '',
    witnessCount: '1',
    submitterWasWitness: false,

    // Step 3: Location
    locationName: '',
    locationDescription: '',
    country: '',
    stateProvince: '',
    city: '',
    latitude: '',
    longitude: '',

    // Step 4: Evidence & Submit
    hasPhysicalEvidence: false,
    hasPhotoVideo: false,
    hasOfficialReport: false,
    evidenceSummary: '',
    tags: '',
    anonymousSubmission: false,
  })

  useEffect(() => {
    checkUser()
    loadPhenomenonTypes()
  }, [])

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user || null)
    setLoading(false)
  }

  async function loadPhenomenonTypes() {
    const { data } = await supabase
      .from('phenomenon_types')
      .select('*')
      .order('name')
    setPhenomenonTypes(data || [])
  }

  function updateForm(field: string, value: any) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Fetch associations when primary type changes
  useEffect(() => {
    if (!formData.phenomenonTypeId) {
      setTypeAssociations([])
      return
    }
    async function fetchAssociations() {
      const typeId = formData.phenomenonTypeId
      // Query both directions (type could be in type_id_a or type_id_b)
      const { data } = await supabase
        .from('phenomenon_type_associations')
        .select('type_id_a, type_id_b, association_score')
        .or(`type_id_a.eq.${typeId},type_id_b.eq.${typeId}`)
        .order('association_score', { ascending: false })
        .limit(10)

      if (data) {
        const mapped = data.map(row => ({
          type_id: row.type_id_a === typeId ? row.type_id_b : row.type_id_a,
          score: row.association_score
        }))
        setTypeAssociations(mapped)
      }
    }
    fetchAssociations()
  }, [formData.phenomenonTypeId])

  // Auto-geocode when city/country changes (debounced)
  useEffect(() => {
    if (!formData.city || !formData.country) return
    const timeout = setTimeout(async () => {
      try {
        const q = [formData.city, formData.stateProvince, formData.country].filter(Boolean).join(', ')
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
          { headers: { 'User-Agent': 'Paradocs-Submit/1.0' } }
        )
        if (res.ok) {
          const data = await res.json()
          if (data.length > 0) {
            updateForm('latitude', parseFloat(data[0].lat).toFixed(6))
            updateForm('longitude', parseFloat(data[0].lon).toFixed(6))
          }
        }
      } catch {}
    }, 1000) // Wait 1s after last keystroke
    return () => clearTimeout(timeout)
  }, [formData.city, formData.stateProvince, formData.country])

  // Country name mapping: Nominatim uses full English names, our dropdown may differ
  const COUNTRY_NAME_MAP: Record<string, string> = {
    'United States of America': 'United States',
    'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
    'Russian Federation': 'Russia',
    "People's Republic of China": 'China',
    'Republic of India': 'India',
  }

  async function detectLocation() {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser')
      return
    }
    setGeolocating(true)
    setGeoError('')

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000, // Cache for 5 min
        })
      })

      const { latitude, longitude } = position.coords
      updateForm('latitude', latitude.toFixed(6))
      updateForm('longitude', longitude.toFixed(6))

      // Reverse geocode with OpenStreetMap Nominatim
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`,
          { headers: { 'User-Agent': 'Paradocs-Submit/1.0' } }
        )
        if (res.ok) {
          const data = await res.json()
          const addr = data.address || {}

          // Map country name to our dropdown values
          const rawCountry = addr.country || ''
          const mappedCountry = COUNTRY_NAME_MAP[rawCountry] || rawCountry
          const knownCountry = COUNTRIES.includes(mappedCountry) ? mappedCountry : (rawCountry ? 'Other' : '')
          if (knownCountry) updateForm('country', knownCountry)

          // State (US-specific — Nominatim returns full state name)
          if (knownCountry === 'United States' && addr.state) {
            const stateName = addr.state.replace(/^State of /i, '')
            if (US_STATES.includes(stateName)) {
              updateForm('stateProvince', stateName)
            }
          }

          // City — Nominatim uses city, town, village, or municipality
          const city = addr.city || addr.town || addr.village || addr.municipality || ''
          if (city) updateForm('city', city)
        }
      } catch {
        // Reverse geocode failed — coords are still set, just no address
      }
    } catch (err: any) {
      if (err?.code === 1) {
        setGeoError('Location access denied — check that Location Services is enabled in macOS System Settings → Privacy & Security, and that your browser is allowed.')
      } else if (err?.code === 2) {
        setGeoError('Location unavailable — your device could not determine its position. Please enter manually.')
      } else if (err?.code === 3) {
        setGeoError('Location request timed out. Please try again or enter manually.')
      } else {
        setGeoError('Could not detect location. Please enter manually.')
      }
    } finally {
      setGeolocating(false)
    }
  }

  function validateStep(s: Step): boolean {
    setError('')
    switch (s) {
      case 1:
        if (!formData.title.trim()) {
          setError('Please enter a title')
          return false
        }
        if (!formData.category) {
          setError('Please search for or select an experience type')
          return false
        }
        if (!formData.summary.trim()) {
          setError('Please enter a summary')
          return false
        }
        return true
      case 2:
        if (!formData.description.trim()) {
          setError('Please describe the experience')
          return false
        }
        if (!formData.eventDate) {
          setError('Please enter when this happened')
          return false
        }
        if (formData.eventDatePrecision === 'exact' && formData.eventDate > new Date().toISOString().split('T')[0]) {
          setError('Date cannot be in the future')
          return false
        }
        if (!formData.witnessCount || parseInt(formData.witnessCount) < 1) {
          setError('Please enter the number of witnesses')
          return false
        }
        return true
      case 3:
        if (!formData.country) {
          setError('Please select a country')
          return false
        }
        if (!formData.city.trim()) {
          setError('Please enter a city or town')
          return false
        }
        return true
      case 4:
        return true
      default:
        return true
    }
  }

  function nextStep() {
    if (validateStep(step)) {
      setStep(prev => Math.min(4, prev + 1) as Step)
    }
  }

  function prevStep() {
    setStep(prev => Math.max(1, prev - 1) as Step)
  }

  async function handleSubmit() {
    if (!user) {
      router.push('/login?redirect=/submit')
      return
    }

    // Re-validate all steps before final submit
    for (const s of [1, 2, 3, 4] as Step[]) {
      if (!validateStep(s)) {
        setStep(s)
        return
      }
    }

    setSubmitting(true)
    setError('')

    try {
      const slug = generateSlug(formData.title)
      const tags = formData.tags
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean)

      const { data, error: insertError } = await supabase
        .from('reports')
        .insert({
          title: formData.title,
          slug,
          category: formData.category as PhenomenonCategory,
          phenomenon_type_id: formData.phenomenonTypeId || null,
          summary: formData.summary,
          description: formData.description,
          event_date: formData.eventDatePrecision === 'exact' ? (formData.eventDate || null) : null,
          event_date_raw: formData.eventDatePrecision !== 'exact' ? (formData.eventDate || null) : null,
          event_date_precision: formData.eventDatePrecision,
          event_time: formData.eventDatePrecision === 'exact' ? (formData.eventTime || null) : null,
          event_date_approximate: formData.eventDatePrecision !== 'exact',
          event_duration_minutes: formData.durationMinutes ? parseInt(formData.durationMinutes) : null,
          witness_count: parseInt(formData.witnessCount) || 1,
          submitter_was_witness: formData.submitterWasWitness,
          location_name: formData.locationName || null,
          location_description: formData.locationDescription || null,
          country: formData.country || null,
          state_province: formData.stateProvince || null,
          city: formData.city || null,
          latitude: formData.latitude ? parseFloat(formData.latitude) : null,
          longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          has_physical_evidence: formData.hasPhysicalEvidence,
          has_photo_video: formData.hasPhotoVideo,
          has_official_report: formData.hasOfficialReport,
          evidence_summary: formData.evidenceSummary || null,
          tags,
          anonymous_submission: formData.anonymousSubmission,
          submitted_by: user.id,
          source_type: 'user_submission',
          status: 'pending',
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Insert report_tags for primary and additional phenomenon types
      const reportTags = []

      if (formData.phenomenonTypeId) {
        reportTags.push({
          report_id: data.id,
          phenomenon_type_id: formData.phenomenonTypeId,
          is_primary: true,
          relevance_score: 1.0
        })
      }

      // Add additional cross-disciplinary tags
      for (const typeId of formData.additionalTypeIds) {
        if (typeId !== formData.phenomenonTypeId) {
          reportTags.push({
            report_id: data.id,
            phenomenon_type_id: typeId,
            is_primary: false,
            relevance_score: 0.8
          })
        }
      }

      if (reportTags.length > 0) {
        await supabase.from('report_tags').insert(reportTags)
      }

      // Save uploaded media
      if (uploadedMedia.length > 0) {
        const mediaRecords = uploadedMedia.map((file, index) => ({
          report_id: data.id,
          media_type: file.type,
          url: file.url,
          caption: null,
          is_primary: index === 0,
          uploaded_by: user.id,
        }))
        await supabase.from('report_media').insert(mediaRecords)
      }

      router.push(`/submit/success?id=${data.id}`)
    } catch (err: any) {
      console.error('Error submitting report:', err)
      setError(err.message || 'Failed to submit report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // All submittable types (editorial ones excluded)
  const submittableTypes = phenomenonTypes.filter(
    t => !isEditorialType(t.name, t.slug)
  )

  // Types filtered by selected category (for browse mode)
  const filteredTypes = submittableTypes.filter(
    t => !formData.category || t.category === formData.category
  )

  // Smart search results: match across ALL categories by name and description
  const typeSearchResults = (() => {
    const q = typeSearch.trim().toLowerCase()
    if (q.length < 2) return []
    const words = q.split(/\s+/).filter(w => w.length >= 2)

    const scored = submittableTypes
      .map(t => {
        const name = t.name.toLowerCase()
        const desc = (t.description || '').toLowerCase()
        let score = 0
        // Exact name match
        if (name === q) score = 100
        // Name starts with query
        else if (name.startsWith(q)) score = 80
        // Name contains full query
        else if (name.includes(q)) score = 60
        // Description contains full query
        else if (desc.includes(q)) score = 30
        // Multi-word: check if individual words match name or description
        if (score === 0 && words.length > 1) {
          const nameHits = words.filter(w => name.includes(w)).length
          const descHits = words.filter(w => desc.includes(w)).length
          if (nameHits === words.length) score = 55 // all words in name
          else if (nameHits > 0) score = 40 // some words in name
          else if (descHits === words.length) score = 25 // all words in desc
          else if (descHits > 0) score = 15 // some words in desc
        }
        return { type: t, score }
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    return scored.map(r => r.type)
  })()

  // Handler: select a type from search results (auto-assigns category)
  function selectTypeFromSearch(type: PhenomenonType) {
    updateForm('category', type.category)
    updateForm('phenomenonTypeId', type.id)
    setTypeSearch('')
    setTypeSearchFocused(false)
  }

  // Handler: clear selection and start over
  function clearTypeSelection() {
    updateForm('category', '')
    updateForm('phenomenonTypeId', '')
    updateForm('additionalTypeIds', [])
    setTypeSearch('')
    setShowBrowseCategories(false)
  }

  // Get the selected type object for display
  const selectedType = formData.phenomenonTypeId
    ? phenomenonTypes.find(t => t.id === formData.phenomenonTypeId)
    : null

  const selectedCategoryConfig = formData.category
    ? CATEGORY_CONFIG[formData.category as PhenomenonCategory]
    : null

  const steps = [
    { num: 1, label: 'Basic Info', icon: FileText },
    { num: 2, label: 'Details', icon: Eye },
    { num: 3, label: 'Location', icon: MapPin },
    { num: 4, label: 'Evidence', icon: Upload },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Submit a Report - Paradocs</title>
      </Head>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <h1 className="text-3xl font-display font-bold text-white mb-2">
          Submit a Report
        </h1>
        <p className="text-gray-400 mb-8">
          Share your paranormal experience with the community.
          All submissions are reviewed before publication.
        </p>

        {/* Progress steps */}
        <div className="flex items-center justify-between mb-8">
          {steps.map((s, i) => (
            <React.Fragment key={s.num}>
              <div className="flex flex-col items-center">
                <div
                  className={classNames(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                    step >= s.num
                      ? 'bg-primary-600 text-white'
                      : 'bg-white/5 text-gray-500'
                  )}
                >
                  {step > s.num ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <s.icon className="w-5 h-5" />
                  )}
                </div>
                <span className="mt-2 text-xs text-gray-400 hidden sm:block">
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={classNames(
                    'flex-1 h-0.5 mx-2',
                    step > s.num ? 'bg-primary-600' : 'bg-white/10'
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Form */}
        <div className="glass-card p-6 sm:p-8">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => updateForm('title', e.target.value)}
                  placeholder="e.g., Bright lights over Phoenix, Arizona"
                  className="w-full"
                  maxLength={200}
                />
              </div>

              {/* ── Type & Category Selection (Search-first, browse-as-fallback) ── */}
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  What did you experience? *
                </label>
                <p className="text-xs text-gray-400 mb-3">
                  Search for an experience type or browse by category below.
                </p>

                {/* Selected type chip (shown when a type is already picked) */}
                {formData.category && selectedType ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={classNames(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border',
                      selectedCategoryConfig ? `${selectedCategoryConfig.bgColor} border-current ${selectedCategoryConfig.color}` : 'bg-white/5 border-white/10'
                    )}>
                      <CategoryIcon category={formData.category as PhenomenonCategory} size={16} />
                      <span className="text-sm font-medium text-white">{selectedType.name}</span>
                      <span className="text-xs text-gray-400">
                        in {selectedCategoryConfig?.label}
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
                ) : formData.category && !selectedType ? (
                  /* Category selected but no specific type — show category chip + type dropdown */
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={classNames(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border',
                        selectedCategoryConfig ? `${selectedCategoryConfig.bgColor} border-current ${selectedCategoryConfig.color}` : 'bg-white/5 border-white/10'
                      )}>
                        <CategoryIcon category={formData.category as PhenomenonCategory} size={16} />
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
                          value={formData.phenomenonTypeId}
                          onChange={(e) => updateForm('phenomenonTypeId', e.target.value)}
                          className="w-full"
                        >
                          <option value="">Select a specific type...</option>
                          {filteredTypes.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Nothing selected yet — show search + browse */
                  <div className="space-y-3">
                    {/* Search input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      <input
                        type="text"
                        value={typeSearch}
                        onChange={(e) => setTypeSearch(e.target.value)}
                        onFocus={() => setTypeSearchFocused(true)}
                        onBlur={() => setTimeout(() => setTypeSearchFocused(false), 200)}
                        placeholder="e.g., lucid dream, shadow figure, abduction..."
                        className="w-full pl-10 pr-8"
                      />
                      {typeSearch && (
                        <button
                          type="button"
                          onClick={() => setTypeSearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}

                      {/* Search results dropdown */}
                      {typeSearchFocused && typeSearch.length >= 2 && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                          {typeSearchResults.length > 0 ? (
                            typeSearchResults.map((type) => {
                              const catConfig = CATEGORY_CONFIG[type.category as PhenomenonCategory]
                              return (
                                <button
                                  key={type.id}
                                  type="button"
                                  onClick={() => selectTypeFromSearch(type)}
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
                              No matching types found. Try different keywords or browse by category below.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Browse by category toggle */}
                    <button
                      type="button"
                      onClick={() => setShowBrowseCategories(!showBrowseCategories)}
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
                        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              updateForm('category', key)
                              setShowBrowseCategories(false)
                            }}
                            className="p-3 rounded-lg border text-left transition-all bg-white/5 border-white/10 hover:border-white/20"
                          >
                            <span className="text-xl"><CategoryIcon category={key as PhenomenonCategory} size={20} /></span>
                            <p className="mt-1 text-sm font-medium text-white">
                              {config.label}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cross-disciplinary tagging (shown once a category is selected) */}
              {formData.category && (() => {
                // Build suggested types from associations (exclude same category and already-selected primary)
                const suggestedTypes = typeAssociations
                  .map(a => phenomenonTypes.find(t => t.id === a.type_id))
                  .filter((t): t is PhenomenonType =>
                    !!t && t.id !== formData.phenomenonTypeId
                  )
                  .slice(0, 5)

                // Filter for related search
                const rq = relatedSearch.trim().toLowerCase()
                const rqWords = rq.split(/\s+/).filter(w => w.length >= 2)
                const crossTypes = submittableTypes.filter(t =>
                  t.id !== formData.phenomenonTypeId
                )
                const relatedSearchResults = rq.length >= 2
                  ? crossTypes
                      .map(t => {
                        const name = t.name.toLowerCase()
                        const desc = (t.description || '').toLowerCase()
                        let score = 0
                        if (name === rq) score = 100
                        else if (name.startsWith(rq)) score = 80
                        else if (name.includes(rq)) score = 60
                        else if (desc.includes(rq)) score = 30
                        if (score === 0 && rqWords.length > 1) {
                          const nameHits = rqWords.filter(w => name.includes(w)).length
                          const descHits = rqWords.filter(w => desc.includes(w)).length
                          if (nameHits === rqWords.length) score = 55
                          else if (nameHits > 0) score = 40
                          else if (descHits === rqWords.length) score = 25
                          else if (descHits > 0) score = 15
                        }
                        return { type: t, score }
                      })
                      .filter(r => r.score > 0)
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 10)
                      .map(r => r.type)
                  : []

                // Checkbox row renderer (reused for suggestions, search results, and browse)
                const renderTypeRow = (type: PhenomenonType) => {
                  const isSelected = formData.additionalTypeIds.includes(type.id)
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => {
                        const newIds = isSelected
                          ? formData.additionalTypeIds.filter(id => id !== type.id)
                          : [...formData.additionalTypeIds, type.id]
                        updateForm('additionalTypeIds', newIds)
                      }}
                      className={classNames(
                        'w-full text-left px-3 py-2 rounded-lg transition-colors flex items-start gap-3',
                        isSelected
                          ? 'bg-primary-500/15 border border-primary-500/40'
                          : 'hover:bg-white/5 border border-transparent'
                      )}
                    >
                      <div className={classNames(
                        'w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5',
                        isSelected
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-gray-500'
                      )}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="min-w-0">
                        <span className={classNames(
                          'text-sm block',
                          isSelected ? 'text-primary-300 font-medium' : 'text-gray-300'
                        )}>
                          {type.name}
                        </span>
                        {type.description && (
                          <span className="text-xs text-gray-500 block mt-0.5 leading-snug">
                            {type.description}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                }

                return (
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">
                      Related phenomena
                    </label>
                    <p className="text-xs text-gray-400 mb-3">
                      Did your experience also involve any of these? Search or pick from suggestions.
                    </p>

                    {/* Selected tags summary */}
                    {formData.additionalTypeIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {formData.additionalTypeIds.map(id => {
                          const t = phenomenonTypes.find(pt => pt.id === id)
                          if (!t) return null
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary-500/20 text-primary-300 border border-primary-500/40"
                            >
                              {t.name}
                              <button
                                type="button"
                                onClick={() => updateForm('additionalTypeIds', formData.additionalTypeIds.filter(x => x !== id))}
                                className="hover:text-white ml-0.5"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* Suggestions from associations */}
                    {suggestedTypes.length > 0 && !relatedSearch && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-2">
                          Others with similar experiences also reported:
                        </p>
                        <div className="space-y-0.5 bg-white/5 rounded-lg border border-white/10 p-2">
                          {suggestedTypes.map(renderTypeRow)}
                        </div>
                      </div>
                    )}

                    {/* Search for related phenomena */}
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input
                        type="text"
                        value={relatedSearch}
                        onChange={(e) => setRelatedSearch(e.target.value)}
                        placeholder="Search related phenomena (e.g., sleep paralysis, telepathy, missing time)"
                        className="w-full pl-10 pr-10 py-2.5 text-sm"
                      />
                      {relatedSearch && (
                        <button
                          type="button"
                          onClick={() => setRelatedSearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Search results */}
                    {relatedSearch.length >= 2 && (
                      <div className="bg-white/5 rounded-lg border border-white/10 p-2 mb-3">
                        {relatedSearchResults.length > 0 ? (
                          <div className="space-y-0.5">
                            {relatedSearchResults.map(renderTypeRow)}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 p-3 text-center">
                            No matches found for &ldquo;{relatedSearch}&rdquo;
                          </p>
                        )}
                      </div>
                    )}

                    {/* Browse all — collapsed by default */}
                    {!relatedSearch && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowAllRelated(!showAllRelated)}
                          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-2"
                        >
                          <ChevronDown className={classNames(
                            'w-4 h-4 transition-transform',
                            showAllRelated ? 'rotate-180' : ''
                          )} />
                          Browse all by category
                        </button>

                        {showAllRelated && (
                          <div className="max-h-72 overflow-y-auto space-y-3 p-3 bg-white/5 rounded-lg border border-white/10">
                            {Object.entries(CATEGORY_CONFIG)
                              .filter(([key]) => key !== formData.category)
                              .map(([catKey, catConfig]) => {
                                const catTypes = crossTypes.filter(t => t.category === catKey)
                                if (catTypes.length === 0) return null
                                return (
                                  <div key={catKey}>
                                    <p className="text-xs text-gray-400 font-medium flex items-center gap-1 mb-1.5 sticky top-0 bg-white/5 py-1 -mx-1 px-1 rounded">
                                      <CategoryIcon category={catKey as PhenomenonCategory} size={14} /> {catConfig.label}
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

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Brief Summary *
                </label>
                <textarea
                  value={formData.summary}
                  onChange={(e) => updateForm('summary', e.target.value)}
                  placeholder="A brief overview of the experience (1-2 sentences)"
                  className="w-full h-24 resize-none"
                  maxLength={500}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {formData.summary.length}/500 characters
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Full Description *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => updateForm('description', e.target.value)}
                  placeholder="Describe the experience in detail. What did you see/hear/feel? How did it start and end?"
                  className="w-full h-48 resize-none"
                />
              </div>

              {/* Date precision selector */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  How precisely do you remember when this happened? *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { value: 'exact', label: 'Exact date' },
                    { value: 'month', label: 'Month & year' },
                    { value: 'year', label: 'Year only' },
                    { value: 'decade', label: 'Approximate decade' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        updateForm('eventDatePrecision', opt.value)
                        // Clear date when switching precision so the right input shows empty
                        if (opt.value !== formData.eventDatePrecision) {
                          updateForm('eventDate', '')
                          updateForm('eventTime', '')
                        }
                      }}
                      className={classNames(
                        'px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
                        formData.eventDatePrecision === opt.value
                          ? 'bg-primary-500/20 text-primary-300 border-primary-500/50'
                          : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/20'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date input — adapts to precision */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    {formData.eventDatePrecision === 'exact' ? 'Date *' :
                     formData.eventDatePrecision === 'month' ? 'Month & Year *' :
                     formData.eventDatePrecision === 'year' ? 'Year *' : 'Approximate Decade *'}
                  </label>
                  {formData.eventDatePrecision === 'exact' ? (
                    <input
                      type="date"
                      value={formData.eventDate}
                      onChange={(e) => updateForm('eventDate', e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full"
                    />
                  ) : formData.eventDatePrecision === 'month' ? (
                    <input
                      type="month"
                      value={formData.eventDate}
                      onChange={(e) => updateForm('eventDate', e.target.value)}
                      max={new Date().toISOString().slice(0, 7)}
                      className="w-full"
                    />
                  ) : (
                    <select
                      value={formData.eventDate}
                      onChange={(e) => updateForm('eventDate', e.target.value)}
                      className="w-full"
                    >
                      <option value="">
                        {formData.eventDatePrecision === 'year' ? 'Select a year' : 'Select a decade'}
                      </option>
                      {formData.eventDatePrecision === 'year'
                        ? Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => new Date().getFullYear() - i).map(y => (
                            <option key={y} value={String(y)}>{y}</option>
                          ))
                        : ['2020s', '2010s', '2000s', '1990s', '1980s', '1970s', '1960s', '1950s', 'Before 1950'].map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))
                      }
                    </select>
                  )}
                </div>

                {/* Time — only show for exact date */}
                {formData.eventDatePrecision === 'exact' && (
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Time of Event
                    </label>
                    <input
                      type="time"
                      value={formData.eventTime}
                      onChange={(e) => updateForm('eventTime', e.target.value)}
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-500">Optional — leave blank if you don't remember</p>
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={formData.durationMinutes}
                    onChange={(e) => updateForm('durationMinutes', e.target.value)}
                    placeholder="e.g., 5"
                    className="w-full"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Number of Witnesses *
                  </label>
                  <input
                    type="number"
                    value={formData.witnessCount}
                    onChange={(e) => updateForm('witnessCount', e.target.value)}
                    className="w-full"
                    min="1"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.submitterWasWitness}
                  onChange={(e) => updateForm('submitterWasWitness', e.target.checked)}
                  className="rounded bg-white/5 border-white/20"
                />
                <span className="text-sm text-gray-300">I personally witnessed this event</span>
              </label>
            </div>
          )}

          {/* Step 3: Location */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Auto-detect location */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  type="button"
                  onClick={detectLocation}
                  disabled={geolocating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500/15 text-primary-300 border border-primary-500/40 hover:bg-primary-500/25 transition-colors disabled:opacity-50 text-sm font-medium"
                >
                  {geolocating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Locate className="w-4 h-4" />
                  )}
                  {geolocating ? 'Detecting...' : 'Use my current location'}
                </button>
                {geoError && (
                  <p className="text-xs text-red-400">{geoError}</p>
                )}
                {!geoError && !geolocating && formData.latitude && formData.longitude && (
                  <p className="text-xs text-gray-400">Location detected — adjust fields below if needed</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Location Name
                </label>
                <input
                  type="text"
                  value={formData.locationName}
                  onChange={(e) => updateForm('locationName', e.target.value)}
                  placeholder="e.g., Phoenix Sky Harbor, Highway 51 near Roswell"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Country *
                </label>
                <select
                  value={formData.country}
                  onChange={(e) => updateForm('country', e.target.value)}
                  className="w-full"
                >
                  <option value="">Select a country</option>
                  {COUNTRIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {formData.country === 'United States' && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    State
                  </label>
                  <select
                    value={formData.stateProvince}
                    onChange={(e) => updateForm('stateProvince', e.target.value)}
                    className="w-full"
                  >
                    <option value="">Select a state</option>
                    {US_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  City / Town *
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => updateForm('city', e.target.value)}
                  placeholder="e.g., Phoenix"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Location Description
                </label>
                <textarea
                  value={formData.locationDescription}
                  onChange={(e) => updateForm('locationDescription', e.target.value)}
                  placeholder="Describe the specific location (e.g., rural area, near a lake, suburban neighborhood)"
                  className="w-full h-24 resize-none"
                />
              </div>

              <LocationPicker
                latitude={formData.latitude}
                longitude={formData.longitude}
                onLocationChange={(lat, lng) => {
                  updateForm('latitude', lat)
                  updateForm('longitude', lng)
                }}
              />
            </div>
          )}

          {/* Step 4: Evidence & Submit */}
          {step === 4 && (
            <div className="space-y-6">
              {/* Media Upload */}
              {user && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    <Camera className="w-4 h-4 inline mr-2" />
                    Upload Evidence (Photos, Videos, Audio)
                  </label>
                  <p className="text-xs text-gray-400 mb-3">
                    Upload up to 5 files. Supported formats: JPEG, PNG, GIF, WebP, MP4, WebM, MP3, WAV
                  </p>
                  <ImageUpload
                    bucket="report-media"
                    folder={user.id}
                    onUpload={setUploadedMedia}
                    existingFiles={uploadedMedia}
                    maxFiles={5}
                    maxSizeMB={10}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white mb-3">
                  Do you have any evidence?
                </label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!formData.hasPhotoVideo && !formData.hasPhysicalEvidence && !formData.hasOfficialReport && uploadedMedia.length === 0}
                      onChange={() => {
                        updateForm('hasPhotoVideo', false)
                        updateForm('hasPhysicalEvidence', false)
                        updateForm('hasOfficialReport', false)
                      }}
                      className="rounded bg-white/5 border-white/20"
                      readOnly
                    />
                    <span className="text-sm text-gray-300">No evidence — testimony only</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.hasPhotoVideo || uploadedMedia.length > 0}
                      onChange={(e) => updateForm('hasPhotoVideo', e.target.checked)}
                      className="rounded bg-white/5 border-white/20"
                      disabled={uploadedMedia.length > 0}
                    />
                    <span className="text-sm text-gray-300">
                      Photos or videos
                      {uploadedMedia.length > 0 && (
                        <span className="text-primary-400 ml-1">({uploadedMedia.length} uploaded)</span>
                      )}
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.hasPhysicalEvidence}
                      onChange={(e) => updateForm('hasPhysicalEvidence', e.target.checked)}
                      className="rounded bg-white/5 border-white/20"
                    />
                    <span className="text-sm text-gray-300">Physical evidence collected</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.hasOfficialReport}
                      onChange={(e) => updateForm('hasOfficialReport', e.target.checked)}
                      className="rounded bg-white/5 border-white/20"
                    />
                    <span className="text-sm text-gray-300">Filed official report (police, FAA, etc.)</span>
                  </label>
                </div>
              </div>

              {/* Evidence description — only show if they have evidence */}
              {(formData.hasPhotoVideo || formData.hasPhysicalEvidence || formData.hasOfficialReport || uploadedMedia.length > 0) && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Evidence Description
                  </label>
                  <textarea
                    value={formData.evidenceSummary}
                    onChange={(e) => updateForm('evidenceSummary', e.target.value)}
                    placeholder="Describe the evidence you have (photos, recordings, physical traces, etc.)"
                    className="w-full h-24 resize-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Tags
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => updateForm('tags', e.target.value)}
                  placeholder="e.g., lights, triangle, night, multiple witnesses (comma separated)"
                  className="w-full"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Separate tags with commas
                </p>
              </div>

              <div className="pt-4 border-t border-white/10">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.anonymousSubmission}
                    onChange={(e) => updateForm('anonymousSubmission', e.target.checked)}
                    className="rounded bg-white/5 border-white/20 mt-0.5"
                  />
                  <div>
                    <span className="text-sm text-gray-300">Submit anonymously</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Your username will not be displayed with this report
                    </p>
                  </div>
                </label>
              </div>

              {!user && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-amber-400 text-sm">
                    You need to be signed in to submit a report.
                    <Link href="/login?redirect=/submit" className="underline ml-1">
                      Sign in now
                    </Link>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
            <button
              onClick={prevStep}
              disabled={step === 1}
              className="btn btn-ghost disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            {step < 4 ? (
              <button onClick={nextStep} className="btn btn-primary">
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting || !user}
                className="btn btn-primary disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
                <Check className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
