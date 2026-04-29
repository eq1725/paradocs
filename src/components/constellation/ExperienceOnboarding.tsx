'use client'

/**
 * ExperienceOnboarding — Participation-first onboarding flow
 *
 * Replaces the old interest-picker onboarding with a guided
 * experience submission. The first thing a new user does is GIVE,
 * not consume.
 *
 * Flow:
 *   Step 1: "What did you notice first?" (sensory-first routing)
 *   Step 2: When & Where (streamlined from existing submit form)
 *   Step 3: "Tell us what happened" (free text)
 *   Step 4: Confidentiality + account creation
 *   → Triggers Constellation reveal
 *
 * Maps to the existing submit infrastructure (/api/reports) but with
 * a conversational UX wrapper.
 *
 * SWC: Uses var + function(){} for compatibility.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import {
  Eye, Ear, Heart, Brain, Zap, ChevronRight, ChevronLeft,
  MapPin, Calendar, Shield, Loader2, X, Locate,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PhenomenonCategory } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { generateSlug } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExperienceOnboardingProps {
  /** Called with the new report ID + slug when submission succeeds */
  onComplete: (reportId: string, slug: string, formData: ExperienceData) => void
  /** Called if user wants to skip and just browse */
  onSkip?: () => void
  /** Pre-fill if we already know the user */
  userId?: string
}

export interface ExperienceData {
  sensoryEntry: string
  category: PhenomenonCategory
  typeName: string
  typeId: string
  description: string
  eventDate: string
  eventDatePrecision: 'exact' | 'month' | 'year' | 'decade'
  city: string
  stateProvince: string
  country: string
  latitude: string
  longitude: string
  confidentiality: 'public' | 'anonymous' | 'private'
}

// ── Sensory entry points ──────────────────────────────────────────────────────

var SENSORY_ENTRIES = [
  {
    id: 'saw',
    label: 'Something I saw',
    icon: Eye,
    description: 'A figure, light, object, or visual anomaly',
    color: '#a855f7',
    categories: ['ghosts_hauntings', 'ufos_aliens', 'cryptids'] as PhenomenonCategory[],
  },
  {
    id: 'heard',
    label: 'Something I heard',
    icon: Ear,
    description: 'A voice, sound, or unexplained noise',
    color: '#3b82f6',
    categories: ['ghosts_hauntings', 'psychic_phenomena'] as PhenomenonCategory[],
  },
  {
    id: 'felt',
    label: 'Something I felt',
    icon: Heart,
    description: 'A presence, touch, temperature change, or emotion',
    color: '#ec4899',
    categories: ['ghosts_hauntings', 'psychic_phenomena', 'psychological_experiences'] as PhenomenonCategory[],
  },
  {
    id: 'knew',
    label: 'Something I just knew',
    icon: Brain,
    description: 'A premonition, déjà vu, or impossible knowledge',
    color: '#f59e0b',
    categories: ['psychic_phenomena', 'consciousness_practices'] as PhenomenonCategory[],
  },
  {
    id: 'happened',
    label: 'Something that happened around me',
    icon: Zap,
    description: 'Objects moved, electronics malfunctioned, time felt wrong',
    color: '#14b8a6',
    categories: ['ghosts_hauntings', 'perception_sensory'] as PhenomenonCategory[],
  },
]

// ── Sensory → Phenomenon type mapping ─────────────────────────────────────────

var SENSORY_TYPE_SUGGESTIONS: Record<string, Array<{ name: string; category: PhenomenonCategory }>> = {
  saw: [
    { name: 'Shadow Figure / Dark Entity', category: 'ghosts_hauntings' },
    { name: 'Apparition / Full-Body Spirit', category: 'ghosts_hauntings' },
    { name: 'UFO / UAP Sighting', category: 'ufos_aliens' },
    { name: 'Orb / Light Anomaly', category: 'ghosts_hauntings' },
    { name: 'Cryptid Sighting', category: 'cryptids' },
    { name: 'Something else I saw', category: 'perception_sensory' },
  ],
  heard: [
    { name: 'Disembodied Voice', category: 'ghosts_hauntings' },
    { name: 'Unexplained Sounds / Knocking', category: 'ghosts_hauntings' },
    { name: 'Electronic Voice Phenomenon', category: 'ghosts_hauntings' },
    { name: 'Telepathic Communication', category: 'psychic_phenomena' },
    { name: 'Something else I heard', category: 'perception_sensory' },
  ],
  felt: [
    { name: 'Felt Presence / Sensed Entity', category: 'ghosts_hauntings' },
    { name: 'Sleep Paralysis with Entity', category: 'psychological_experiences' },
    { name: 'Temperature Anomaly / Cold Spot', category: 'ghosts_hauntings' },
    { name: 'Physical Touch by Unseen Force', category: 'ghosts_hauntings' },
    { name: 'Near-Death Experience', category: 'consciousness_practices' },
    { name: 'Out-of-Body Experience', category: 'consciousness_practices' },
    { name: 'Something else I felt', category: 'perception_sensory' },
  ],
  knew: [
    { name: 'Precognitive Dream', category: 'psychic_phenomena' },
    { name: 'Déjà Vu / Temporal Anomaly', category: 'psychic_phenomena' },
    { name: 'Meaningful Synchronicity', category: 'psychic_phenomena' },
    { name: 'Clairvoyant Experience', category: 'psychic_phenomena' },
    { name: 'Past Life Memory', category: 'consciousness_practices' },
    { name: 'Something else I knew', category: 'psychic_phenomena' },
  ],
  happened: [
    { name: 'Poltergeist Activity', category: 'ghosts_hauntings' },
    { name: 'Electronic Interference', category: 'ghosts_hauntings' },
    { name: 'Time Slip / Missing Time', category: 'perception_sensory' },
    { name: 'Spontaneous Object Movement', category: 'ghosts_hauntings' },
    { name: 'Something else that happened', category: 'perception_sensory' },
  ],
}

// ── Storage key ───────────────────────────────────────────────────────────────

var STORAGE_KEY = 'paradocs_onboarding_v3'

export function hasCompletedExperienceOnboarding(): boolean {
  if (typeof window === 'undefined') return true
  return !!(
    localStorage.getItem(STORAGE_KEY) ||
    localStorage.getItem('paradocs_onboarding_v2') ||
    localStorage.getItem('paradocs_welcome_complete') ||
    localStorage.getItem('paradocs_onboarding_v1')
  )
}

export function markExperienceOnboardingComplete(): void {
  localStorage.setItem(STORAGE_KEY, new Date().toISOString())
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExperienceOnboarding({
  onComplete,
  onSkip,
  userId,
}: ExperienceOnboardingProps) {
  var router = useRouter()
  var [step, setStep] = useState(1)
  var [submitting, setSubmitting] = useState(false)
  var [error, setError] = useState('')
  var [geolocating, setGeolocating] = useState(false)

  // Phenomenon types from DB (for matching ID)
  var [phenomenonTypes, setPhenomenonTypes] = useState<any[]>([])

  // Form state
  var [sensoryEntry, setSensoryEntry] = useState('')
  var [selectedType, setSelectedType] = useState<{ name: string; category: PhenomenonCategory } | null>(null)
  var [description, setDescription] = useState('')
  var [eventDate, setEventDate] = useState('')
  var [eventDatePrecision, setEventDatePrecision] = useState<'exact' | 'month' | 'year' | 'decade'>('exact')
  var [city, setCity] = useState('')
  var [stateProvince, setStateProvince] = useState('')
  var [country, setCountry] = useState('')
  var [latitude, setLatitude] = useState('')
  var [longitude, setLongitude] = useState('')
  var [confidentiality, setConfidentiality] = useState<'public' | 'anonymous' | 'private'>('anonymous')

  // Load phenomenon types on mount
  useEffect(function() {
    supabase
      .from('phenomenon_types')
      .select('id, name, slug, category')
      .order('name')
      .then(function(result) {
        if (result.data) setPhenomenonTypes(result.data)
      })
  }, [])

  // Try to auto-detect location
  var detectLocation = useCallback(function() {
    if (!navigator.geolocation) return
    setGeolocating(true)

    navigator.geolocation.getCurrentPosition(
      function(position) {
        var lat = position.coords.latitude
        var lng = position.coords.longitude
        setLatitude(lat.toFixed(6))
        setLongitude(lng.toFixed(6))

        // Reverse geocode
        fetch(
          'https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&accept-language=en',
          { headers: { 'User-Agent': 'Paradocs-Submit/1.0' } }
        )
          .then(function(res) { return res.json() })
          .then(function(data) {
            var addr = data.address || {}
            if (addr.country) setCountry(addr.country === 'United States of America' ? 'United States' : addr.country)
            if (addr.state) setStateProvince(addr.state)
            var c = addr.city || addr.town || addr.village || addr.municipality || ''
            if (c) setCity(c)
          })
          .catch(function() {})
          .finally(function() { setGeolocating(false) })
      },
      function() { setGeolocating(false) },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  }, [])

  // Find matching phenomenon type ID from our DB
  function findTypeId(name: string, category: PhenomenonCategory): string {
    // Try exact name match first
    var exact = phenomenonTypes.find(function(t) {
      return t.name.toLowerCase() === name.toLowerCase() && t.category === category
    })
    if (exact) return exact.id

    // Try partial match
    var partial = phenomenonTypes.find(function(t) {
      return t.category === category && (
        t.name.toLowerCase().includes(name.toLowerCase().split('/')[0].trim()) ||
        name.toLowerCase().includes(t.name.toLowerCase())
      )
    })
    if (partial) return partial.id

    // Fallback: first type in this category
    var fallback = phenomenonTypes.find(function(t) { return t.category === category })
    return fallback ? fallback.id : ''
  }

  // Submit the experience
  var handleSubmit = useCallback(async function() {
    if (!selectedType || !description.trim()) {
      setError('Please complete all required fields')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // Ensure user is logged in
      var sessionResult = await supabase.auth.getSession()
      var session = sessionResult.data.session
      if (!session) {
        setError('Please sign in to submit your experience')
        setSubmitting(false)
        return
      }

      var typeId = findTypeId(selectedType.name, selectedType.category)
      var title = selectedType.name + ' — ' + (city || stateProvince || 'Unknown Location')
      var slug = generateSlug(title)

      var reportData: any = {
        title: title,
        slug: slug,
        summary: description.slice(0, 300),
        description: description,
        category: selectedType.category,
        phenomenon_type_id: typeId || null,
        event_date: eventDate || null,
        event_date_precision: eventDatePrecision,
        city: city || null,
        state_province: stateProvince || null,
        country: country || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        location_description: [city, stateProvince, country].filter(Boolean).join(', ') || null,
        witness_count: 1,
        submitter_was_witness: true,
        anonymous_submission: confidentiality === 'anonymous',
        source_type: 'user_submission',
        status: 'pending',
        submitted_by: session.user.id,
      }

      var res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
        },
        body: JSON.stringify(reportData),
      })

      if (!res.ok) {
        var errData = await res.json().catch(function() { return { error: 'Submission failed' } })
        throw new Error(errData.error || 'Failed to submit')
      }

      var result = await res.json()
      var reportId = result.id || result.report?.id || ''
      var reportSlug = result.slug || result.report?.slug || slug

      // Mark onboarding complete
      markExperienceOnboardingComplete()

      // Pass data to parent for Constellation reveal
      onComplete(reportId, reportSlug, {
        sensoryEntry: sensoryEntry,
        category: selectedType.category,
        typeName: selectedType.name,
        typeId: typeId,
        description: description,
        eventDate: eventDate,
        eventDatePrecision: eventDatePrecision,
        city: city,
        stateProvince: stateProvince,
        country: country,
        latitude: latitude,
        longitude: longitude,
        confidentiality: confidentiality,
      })
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }, [selectedType, description, city, stateProvince, country, latitude, longitude, eventDate, eventDatePrecision, confidentiality, sensoryEntry, onComplete])

  var totalSteps = 4

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a14]/95 backdrop-blur-md">
        <div className="h-1 bg-gray-900">
          <div
            className="h-full bg-gradient-to-r from-purple-600 to-primary-500 transition-all duration-500"
            style={{ width: (step / totalSteps * 100) + '%' }}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          {step > 1 ? (
            <button
              onClick={function() { setStep(function(s) { return Math.max(1, s - 1) as any }) }}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div />
          )}
          <span className="text-xs text-gray-500 font-mono tracking-wider">
            {step} / {totalSteps}
          </span>
          {onSkip && step === 1 && (
            <button
              onClick={onSkip}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Skip for now
            </button>
          )}
          {(!onSkip || step > 1) && <div />}
        </div>
      </div>

      <div className="flex-1 pt-16 pb-32 px-5 max-w-lg mx-auto w-full">
        {/* ── Step 1: Sensory Entry ── */}
        {step === 1 && (
          <div className="animate-fadeIn">
            <h1 className="font-display text-2xl sm:text-3xl font-bold mb-3 mt-8">
              What did you notice first?
            </h1>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              Start with the first thing that stood out. We'll help you describe the full experience.
            </p>

            <div className="space-y-3">
              {SENSORY_ENTRIES.map(function(entry) {
                var Icon = entry.icon
                var isSelected = sensoryEntry === entry.id
                return (
                  <button
                    key={entry.id}
                    onClick={function() {
                      setSensoryEntry(entry.id)
                      setSelectedType(null)
                    }}
                    className={classNames(
                      'w-full p-4 rounded-2xl border text-left transition-all duration-200',
                      isSelected
                        ? 'border-primary-500/50 bg-primary-500/10'
                        : 'border-gray-800 bg-gray-900/50 hover:border-gray-700 hover:bg-gray-900'
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: entry.color + '15' }}
                      >
                        <Icon className="w-6 h-6" style={{ color: entry.color }} />
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">{entry.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{entry.description}</div>
                      </div>
                      {isSelected && (
                        <div className="ml-auto flex-shrink-0">
                          <div className="w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Type refinement — appears after sensory selection */}
            {sensoryEntry && SENSORY_TYPE_SUGGESTIONS[sensoryEntry] && (
              <div className="mt-8 animate-fadeIn">
                <h2 className="text-sm font-semibold text-gray-300 mb-3">
                  Can you tell us more specifically?
                </h2>
                <div className="flex flex-wrap gap-2">
                  {SENSORY_TYPE_SUGGESTIONS[sensoryEntry].map(function(type) {
                    var isActive = selectedType?.name === type.name
                    return (
                      <button
                        key={type.name}
                        onClick={function() { setSelectedType(type) }}
                        className={classNames(
                          'px-3 py-2 rounded-xl text-xs font-medium transition-all border',
                          isActive
                            ? 'bg-primary-600/20 border-primary-600/40 text-primary-300'
                            : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-300 hover:border-gray-700'
                        )}
                      >
                        {type.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: When & Where ── */}
        {step === 2 && (
          <div className="animate-fadeIn">
            <h1 className="font-display text-2xl sm:text-3xl font-bold mb-3 mt-8">
              When and where?
            </h1>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              Approximate is fine. Your precision level is your choice.
            </p>

            {/* When */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <Calendar className="w-4 h-4 inline mr-1.5 opacity-60" />
                When did this happen?
              </label>
              <div className="flex gap-2 mb-3">
                {(['exact', 'month', 'year', 'decade'] as const).map(function(p) {
                  return (
                    <button
                      key={p}
                      onClick={function() { setEventDatePrecision(p) }}
                      className={classNames(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                        eventDatePrecision === p
                          ? 'bg-primary-600/20 border-primary-600/40 text-primary-300'
                          : 'bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300'
                      )}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  )
                })}
              </div>
              <input
                type={eventDatePrecision === 'exact' ? 'date' : eventDatePrecision === 'year' || eventDatePrecision === 'decade' ? 'number' : 'month'}
                value={eventDate}
                onChange={function(e) { setEventDate(e.target.value) }}
                placeholder={eventDatePrecision === 'year' ? 'e.g. 2021' : eventDatePrecision === 'decade' ? 'e.g. 2010' : ''}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary-600 transition-colors"
              />
            </div>

            {/* Where */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <MapPin className="w-4 h-4 inline mr-1.5 opacity-60" />
                Where did this happen?
              </label>

              <button
                onClick={detectLocation}
                disabled={geolocating}
                className="w-full flex items-center justify-center gap-2 py-3 mb-3 rounded-xl border border-dashed border-gray-700 text-sm text-gray-400 hover:text-white hover:border-primary-600/50 transition-all"
              >
                {geolocating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Detecting...</>
                ) : (
                  <><Locate className="w-4 h-4" /> Auto-detect my location</>
                )}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="City"
                  value={city}
                  onChange={function(e) { setCity(e.target.value) }}
                  className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary-600 transition-colors"
                />
                <input
                  type="text"
                  placeholder="State / Province"
                  value={stateProvince}
                  onChange={function(e) { setStateProvince(e.target.value) }}
                  className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary-600 transition-colors"
                />
              </div>
              <input
                type="text"
                placeholder="Country"
                value={country}
                onChange={function(e) { setCountry(e.target.value) }}
                className="w-full mt-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary-600 transition-colors"
              />
              <p className="text-xs text-gray-600 mt-2">
                Precise location optional. Region-only is fine.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 3: Tell us what happened ── */}
        {step === 3 && (
          <div className="animate-fadeIn">
            <h1 className="font-display text-2xl sm:text-3xl font-bold mb-3 mt-8">
              Tell us what happened.
            </h1>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              Write it like you're telling a trusted friend. No clinical language needed.
            </p>

            <textarea
              value={description}
              onChange={function(e) { setDescription(e.target.value) }}
              placeholder="I was lying in bed when..."
              rows={8}
              className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-5 py-4 text-white text-sm leading-relaxed focus:outline-none focus:border-primary-600 transition-colors resize-none placeholder-gray-600"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-xs text-gray-600">Optional prompts:</span>
              {['What did you see?', 'What did you feel?', 'How long did it last?', 'Were there others?'].map(function(prompt) {
                return (
                  <button
                    key={prompt}
                    onClick={function() {
                      setDescription(function(d) { return d + (d ? '\n\n' : '') + prompt + ' ' })
                    }}
                    className="text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1 hover:text-gray-300 hover:border-gray-700 transition-colors"
                  >
                    {prompt}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 text-right">
              <span className="text-xs text-gray-600 font-mono">
                {description.length} characters
              </span>
            </div>
          </div>
        )}

        {/* ── Step 4: Confidentiality + Submit ── */}
        {step === 4 && (
          <div className="animate-fadeIn">
            <h1 className="font-display text-2xl sm:text-3xl font-bold mb-3 mt-8">
              Your experience. Your control.
            </h1>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              Choose how your account is shared. You can change this anytime.
            </p>

            <div className="space-y-3 mb-8">
              {[
                {
                  value: 'anonymous' as const,
                  label: 'Anonymous',
                  desc: 'Your experience is visible but your identity is hidden. Recommended.',
                  icon: Shield,
                },
                {
                  value: 'public' as const,
                  label: 'Public',
                  desc: 'Your username is shown alongside your experience.',
                  icon: Eye,
                },
                {
                  value: 'private' as const,
                  label: 'Private',
                  desc: 'Only you can see this. It still counts toward pattern matching.',
                  icon: X,
                },
              ].map(function(opt) {
                var Icon = opt.icon
                var isActive = confidentiality === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={function() { setConfidentiality(opt.value) }}
                    className={classNames(
                      'w-full p-4 rounded-2xl border text-left transition-all',
                      isActive
                        ? 'border-primary-500/50 bg-primary-500/10'
                        : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 flex-shrink-0" style={{ color: isActive ? '#c084fc' : '#555570' }} />
                      <div>
                        <div className="font-semibold text-sm text-white">{opt.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Review summary */}
            <div className="p-4 rounded-2xl bg-gray-900/80 border border-gray-800 mb-6">
              <div className="text-xs text-gray-500 font-mono tracking-wider uppercase mb-3">Your submission</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Type</span>
                  <span className="text-white font-medium">{selectedType?.name || '—'}</span>
                </div>
                {(city || stateProvince) && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Location</span>
                    <span className="text-white">{[city, stateProvince].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {eventDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">When</span>
                    <span className="text-white">{eventDate}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Visibility</span>
                  <span className="text-white">{confidentiality}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom action bar ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#0a0a14] via-[#0a0a14] to-transparent pt-8 pb-8 px-5">
        {error && (
          <div className="max-w-lg mx-auto mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <div className="max-w-lg mx-auto">
          {step < 4 ? (
            <button
              onClick={function() {
                setError('')
                if (step === 1 && !selectedType) {
                  setError('Please select what you experienced')
                  return
                }
                setStep(function(s) { return Math.min(4, s + 1) as any })
              }}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-primary-500 text-white font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Continue
              <ChevronRight className="w-4 h-4 inline ml-1" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-primary-500 text-white font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 inline mr-2 animate-spin" />Submitting...</>
              ) : (
                'Submit & See Your Constellation'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
