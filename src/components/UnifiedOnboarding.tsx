/**
 * UnifiedOnboarding — single post-auth onboarding flow
 *
 * Replaces the overlapping WelcomeOnboarding and ThreeTapOnboarding components.
 * Flow: Pick interests (up to 3) -> Location (auto-detect + manual) -> Done with reveal
 *
 * Session 7 consolidation: ThreeTapOnboarding's UX (tiles, auto-geo) +
 * WelcomeOnboarding's API persistence. Shared localStorage key so users
 * who completed either prior flow don't see this again.
 */

import React, { useState, useEffect } from 'react'
import { X, ChevronRight, MapPin, Sparkles, Check, Loader2, ExternalLink } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { PhenomenonCategory } from '@/lib/database.types'
import { classNames } from '@/lib/utils'

interface UnifiedOnboardingProps {
  onComplete: () => void
  authToken?: string
}

var STORAGE_KEY = 'paradocs_onboarding_v2'

// Also check legacy keys so existing users don't see onboarding again
export function hasCompletedUnifiedOnboarding(): boolean {
  if (typeof window === 'undefined') return true
  return !!(
    localStorage.getItem(STORAGE_KEY) ||
    localStorage.getItem('paradocs_welcome_complete') ||
    localStorage.getItem('paradocs_onboarding_v1')
  )
}

export function resetUnifiedOnboarding(): void {
  localStorage.removeItem(STORAGE_KEY)
}

var INTEREST_TILES = [
  { id: 'ufo_uap', label: 'Lights in the Sky', icon: '\uD83D\uDEF8', description: 'UFOs & unexplained aerial phenomena', color: 'from-indigo-600/30 to-blue-600/30', border: 'border-indigo-500/40' },
  { id: 'ghost_haunting', label: 'Life After Death', icon: '\uD83D\uDC7B', description: 'Ghosts, hauntings & NDEs', color: 'from-purple-600/30 to-violet-600/30', border: 'border-purple-500/40' },
  { id: 'cryptid', label: 'Things in the Woods', icon: '\uD83C\uDF32', description: 'Bigfoot, cryptids & unknown creatures', color: 'from-green-600/30 to-emerald-600/30', border: 'border-green-500/40' },
  { id: 'psychic_psi', label: 'The Mind Unlocked', icon: '\uD83E\uDDE0', description: 'Psychic phenomena & consciousness', color: 'from-pink-600/30 to-rose-600/30', border: 'border-pink-500/40' },
  { id: 'other_anomaly', label: 'Something Else', icon: '\u2728', description: 'Time slips, portals & the unexplained', color: 'from-amber-600/30 to-orange-600/30', border: 'border-amber-500/40' },
  { id: 'just_curious', label: 'Just Curious', icon: '\uD83D\uDC40', description: 'I\u2019m here to explore', color: 'from-gray-600/30 to-slate-600/30', border: 'border-gray-500/40' },
]

interface RevealReport {
  title: string
  slug: string
  location_text: string
  summary: string
  phenomenon_type?: { name: string; category: PhenomenonCategory }
}

export default function UnifiedOnboarding({ onComplete, authToken }: UnifiedOnboardingProps) {
  var [step, setStep] = useState(1)
  var [selectedInterests, setSelectedInterests] = useState<string[]>([])
  var [location, setLocation] = useState<{ lat: number; lng: number; name: string } | null>(null)
  var [locationLoading, setLocationLoading] = useState(false)
  var [locationInput, setLocationInput] = useState('')
  var [revealReport, setRevealReport] = useState<RevealReport | null>(null)
  var [revealLoading, setRevealLoading] = useState(false)
  var [closing, setClosing] = useState(false)

  function toggleInterest(id: string) {
    if (id === 'just_curious') {
      setSelectedInterests(['just_curious'])
      return
    }
    setSelectedInterests(function(prev) {
      var filtered = prev.filter(function(i) { return i !== 'just_curious' })
      if (filtered.includes(id)) {
        return filtered.filter(function(i) { return i !== id })
      }
      if (filtered.length < 3) {
        return filtered.concat([id])
      }
      return filtered
    })
  }

  function handleStep1Continue() {
    if (selectedInterests.length === 0) return
    setStep(2)
    // Auto-detect location
    if (navigator.geolocation) {
      setLocationLoading(true)
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          var url = 'https://nominatim.openstreetmap.org/reverse?lat=' + pos.coords.latitude + '&lon=' + pos.coords.longitude + '&format=json'
          fetch(url).then(function(res) {
            return res.json()
          }).then(function(data) {
            var city = data.address?.city || data.address?.town || data.address?.village || ''
            var state = data.address?.state || ''
            var country = data.address?.country || ''
            var name = [city, state, country].filter(Boolean).join(', ')
            setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: name })
            setLocationInput(name)
          }).catch(function() {
            setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Location detected' })
            setLocationInput(pos.coords.latitude.toFixed(2) + ', ' + pos.coords.longitude.toFixed(2))
          }).finally(function() {
            setLocationLoading(false)
          })
        },
        function() { setLocationLoading(false) },
        { timeout: 5000, enableHighAccuracy: false }
      )
    }
  }

  function handleStep2Continue() {
    saveAndReveal()
  }

  function saveAndReveal() {
    setRevealLoading(true)
    setStep(3)

    // Persist to API if authenticated
    var doSave = authToken
      ? fetch('/api/user/personalization', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({
            interested_categories: selectedInterests.filter(function(i) { return i !== 'just_curious' }),
            location_city: locationInput ? locationInput.split(',')[0]?.trim() : undefined,
            location_latitude: location?.lat,
            location_longitude: location?.lng,
          }),
        }).catch(function(e) { console.error('Failed to save personalization:', e) })
      : Promise.resolve()

    doSave.then(function() {
      var catFilter = selectedInterests.length > 0 && selectedInterests[0] !== 'just_curious'
        ? '&category=' + selectedInterests[0]
        : ''
      return fetch('/api/reports?limit=1&sort=rating' + catFilter)
    }).then(function(res) {
      return res.json()
    }).then(function(data) {
      if (data.reports && data.reports[0]) {
        setRevealReport(data.reports[0])
      }
    }).catch(function() {
      /* fallback - no reveal report */
    }).finally(function() {
      setRevealLoading(false)
    })
  }

  function finish() {
    var data = {
      interests: selectedInterests,
      location: location,
      completedAt: new Date().toISOString()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    // Also set legacy keys so WelcomeOnboarding/ThreeTapOnboarding don't re-trigger
    localStorage.setItem('paradocs_welcome_complete', 'true')
    localStorage.setItem('paradocs_onboarding_v1', JSON.stringify({ migrated: true }))
    setClosing(true)
    setTimeout(onComplete, 300)
  }

  function skipAll() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ skipped: true, completedAt: new Date().toISOString() }))
    localStorage.setItem('paradocs_welcome_complete', 'true')
    localStorage.setItem('paradocs_onboarding_v1', JSON.stringify({ skipped: true }))
    setClosing(true)
    setTimeout(onComplete, 300)
  }

  return (
    <div className={classNames(
      'fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300',
      closing ? 'opacity-0' : 'opacity-100'
    )}>
      <div className={classNames(
        'relative w-full max-w-lg mx-4 rounded-2xl overflow-hidden transition-all duration-300',
        'bg-gradient-to-b from-gray-900 to-black border border-white/10',
        closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
      )}>
        {/* Progress dots */}
        {step < 3 && (
          <div className="flex items-center justify-center gap-2 pt-6 pb-2">
            {[1, 2].map(function(s) {
              return (
                <div key={s} className={classNames(
                  'h-1.5 rounded-full transition-all duration-300',
                  s === step ? 'w-8 bg-primary-400' :
                  s < step ? 'w-4 bg-primary-400/50' :
                  'w-4 bg-gray-700'
                )} />
              )
            })}
          </div>
        )}

        <button onClick={skipAll} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-10">
          <X className="w-5 h-5" />
        </button>

        {/* Step 1: Interests */}
        {step === 1 && (
          <div className="px-6 pb-6 pt-4">
            <h2 className="text-2xl font-bold text-white text-center mb-1">What draws you in?</h2>
            <p className="text-gray-400 text-sm text-center mb-6">Pick up to 3 topics to personalize your feed</p>
            <div className="grid grid-cols-2 gap-3">
              {INTEREST_TILES.map(function(tile) {
                var selected = selectedInterests.includes(tile.id)
                return (
                  <button
                    key={tile.id}
                    onClick={function() { toggleInterest(tile.id) }}
                    className={classNames(
                      'relative p-4 rounded-xl text-left transition-all duration-200 border',
                      selected
                        ? 'bg-gradient-to-br ' + tile.color + ' ' + tile.border + ' scale-[0.98]'
                        : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/10'
                    )}
                  >
                    {selected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <span className="text-2xl block mb-2">{tile.icon}</span>
                    <span className="text-sm font-medium text-white block">{tile.label}</span>
                    <span className="text-xs text-gray-400 block mt-0.5">{tile.description}</span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={handleStep1Continue}
              disabled={selectedInterests.length === 0}
              className={classNames(
                'w-full mt-6 py-3 rounded-xl text-sm font-medium transition-all',
                selectedInterests.length > 0
                  ? 'bg-primary-500 hover:bg-primary-600 text-white'
                  : 'bg-white/5 text-gray-500 cursor-not-allowed'
              )}
            >
              Continue <ChevronRight className="w-4 h-4 inline ml-1" />
            </button>
          </div>
        )}

        {/* Step 2: Location */}
        {step === 2 && (
          <div className="px-6 pb-6 pt-4">
            <h2 className="text-2xl font-bold text-white text-center mb-1">Where are you?</h2>
            <p className="text-gray-400 text-sm text-center mb-6">We{'\u2019'}ll show nearby sightings and reports</p>
            <div className="space-y-3">
              {locationLoading ? (
                <div className="flex items-center justify-center gap-3 py-8">
                  <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-gray-400 text-sm">Detecting location...</span>
                </div>
              ) : location ? (
                <div className="glass-card p-4 border border-primary-500/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{location.name}</p>
                      <p className="text-xs text-gray-400">Approximate location detected</p>
                    </div>
                    <Check className="w-5 h-5 text-primary-400 flex-shrink-0" />
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={locationInput}
                    onChange={function(e) { setLocationInput(e.target.value) }}
                    placeholder="City, State, Country"
                    className="w-full px-4 py-3 rounded-xl border border-gray-700/50 bg-gray-800/50 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30"
                  />
                  <p className="text-xs text-gray-500 mt-2 text-center">Location access was denied. Enter manually or skip.</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={function() { handleStep2Continue() }}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
              >
                Skip
              </button>
              <button
                onClick={function() { handleStep2Continue() }}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white transition-all"
              >
                {location ? 'Use This Location' : 'Continue'} <ChevronRight className="w-4 h-4 inline ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Reveal */}
        {step === 3 && (
          <div className="p-6 text-center">
            {revealLoading ? (
              <div className="py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 mb-4 animate-pulse">
                  <Sparkles className="w-8 h-8 text-purple-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Searching the unknown...</h2>
                <p className="text-gray-400 text-sm">Finding something for you</p>
                <Loader2 className="w-6 h-6 animate-spin text-purple-400 mx-auto mt-4" />
              </div>
            ) : (
              <div className="py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 mb-4">
                  <Sparkles className="w-8 h-8 text-purple-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">You{'\u2019'}re all set!</h2>
                {revealReport ? (
                  <>
                    <p className="text-gray-400 text-sm mb-4">Here{'\u2019'}s something to get you started</p>
                    <a
                      href={'/report/' + revealReport.slug}
                      className="block p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 hover:bg-purple-500/10 transition-all text-left group mt-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="text-white font-semibold text-base group-hover:text-purple-300 transition-colors">{revealReport.title}</h3>
                          {revealReport.location_text && (
                            <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {revealReport.location_text}
                            </p>
                          )}
                          {revealReport.summary && (
                            <p className="text-gray-400 text-sm mt-2 line-clamp-2">{revealReport.summary}</p>
                          )}
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-purple-400 transition-colors flex-shrink-0 mt-1" />
                      </div>
                    </a>
                  </>
                ) : (
                  <p className="text-gray-400 text-sm mb-4">Your feed is personalized. Start exploring!</p>
                )}
                <button
                  onClick={finish}
                  className="mt-6 px-8 py-3 rounded-xl text-sm font-medium text-white transition-all bg-primary-500 hover:bg-primary-600"
                >
                  Start Exploring
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
