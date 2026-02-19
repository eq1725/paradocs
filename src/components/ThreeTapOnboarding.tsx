import React, { useState, useEffect } from 'react'
import { X, MapPin, Sparkles, ChevronRight, Check } from 'lucide-react'
import { classNames } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const INTEREST_TILES = [
  { id: 'ufos_aliens', label: 'Lights in the Sky', icon: '\u{1F6F8}', description: 'UFOs & unexplained aerial phenomena', color: 'from-indigo-600/30 to-blue-600/30', border: 'border-indigo-500/40' },
  { id: 'ghosts_spirits', label: 'Life After Death', icon: '\u{1F47B}', description: 'Ghosts, hauntings & NDEs', color: 'from-purple-600/30 to-violet-600/30', border: 'border-purple-500/40' },
  { id: 'cryptids', label: 'Things in the Woods', icon: '\u{1F332}', description: 'Bigfoot, cryptids & unknown creatures', color: 'from-green-600/30 to-emerald-600/30', border: 'border-green-500/40' },
  { id: 'psychic_psi', label: 'The Mind Unlocked', icon: '\u{1F9E0}', description: 'Psychic phenomena & consciousness', color: 'from-pink-600/30 to-rose-600/30', border: 'border-pink-500/40' },
  { id: 'other', label: 'Something Else', icon: '\u{2728}', description: 'Time slips, portals & the unexplained', color: 'from-amber-600/30 to-orange-600/30', border: 'border-amber-500/40' },
  { id: 'just_curious', label: 'Just Curious', icon: '\u{1F440}', description: "I'm here to explore", color: 'from-gray-600/30 to-slate-600/30', border: 'border-gray-500/40' },
]

const TIMEFRAME_OPTIONS = [
  { id: 'recent', label: 'Recently', description: 'Within the last year', icon: '\u{1F525}' },
  { id: 'few_years', label: 'A Few Years Ago', description: '2-5 years back', icon: '\u{1F4C5}' },
  { id: 'long_ago', label: 'Long Time Ago', description: 'More than 5 years', icon: '\u{231B}' },
  { id: 'never', label: "I Haven't Had One", description: 'Just here to learn', icon: '\u{1F50D}' },
]

const STORAGE_KEY = 'paradocs_onboarding_v1'

export function hasCompletedThreeTap(): boolean {
  if (typeof window === 'undefined') return true
  return !!localStorage.getItem(STORAGE_KEY)
}

export default function ThreeTapOnboarding() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(1)
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [location, setLocation] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [timeframe, setTimeframe] = useState<string | null>(null)
  const [isJustCurious, setIsJustCurious] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    async function check() {
      if (hasCompletedThreeTap()) return
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setTimeout(() => setVisible(true), 600)
      }
    }
    check()
  }, [])

  function toggleInterest(id: string) {
    if (id === 'just_curious') {
      setSelectedInterests(['just_curious'])
      setIsJustCurious(true)
      return
    }
    setIsJustCurious(false)
    setSelectedInterests(prev => {
      const filtered = prev.filter(i => i !== 'just_curious')
      return filtered.includes(id) ? filtered.filter(i => i !== id) : [...filtered, id]
    })
  }

  function handleStep1Continue() {
    if (selectedInterests.length === 0) return
    setStep(2)
    if (navigator.geolocation) {
      setLocationLoading(true)
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const resp = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
            )
            const data = await resp.json()
            const city = data.address?.city || data.address?.town || data.address?.village || ''
            const state = data.address?.state || ''
            const country = data.address?.country || ''
            const name = [city, state, country].filter(Boolean).join(', ')
            setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, name })
          } catch {
            setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Location detected' })
          }
          setLocationLoading(false)
        },
        () => setLocationLoading(false),
        { timeout: 5000 }
      )
    }
  }

  function handleStep2Continue() {
    if (isJustCurious) {
      completeOnboarding()
    } else {
      setStep(3)
    }
  }

  function completeOnboarding() {
    const data = {
      interests: selectedInterests,
      location: location,
      timeframe: timeframe,
      completedAt: new Date().toISOString()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    setClosing(true)
    setTimeout(() => setVisible(false), 400)
  }

  function skipAll() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ skipped: true, completedAt: new Date().toISOString() }))
    setClosing(true)
    setTimeout(() => setVisible(false), 400)
  }

  if (!visible) return null

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
        <div className="flex items-center justify-center gap-2 pt-6 pb-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={classNames(
              'h-1.5 rounded-full transition-all duration-300',
              s === step ? 'w-8 bg-primary-400' :
              s < step ? 'w-4 bg-primary-400/50' :
              isJustCurious && s === 3 ? 'w-4 bg-gray-800' :
              'w-4 bg-gray-700'
            )} />
          ))}
        </div>

        <button onClick={skipAll} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Step 1: Interests */}
        {step === 1 && (
          <div className="px-6 pb-6 pt-4">
            <h2 className="text-2xl font-bold text-white text-center mb-1">What draws you in?</h2>
            <p className="text-gray-400 text-sm text-center mb-6">Pick one or more &mdash; we&apos;ll personalize your feed</p>
            <div className="grid grid-cols-2 gap-3">
              {INTEREST_TILES.map(tile => {
                const selected = selectedInterests.includes(tile.id)
                return (
                  <button
                    key={tile.id}
                    onClick={() => toggleInterest(tile.id)}
                    className={classNames(
                      'relative p-4 rounded-xl text-left transition-all duration-200 border',
                      selected
                        ? `bg-gradient-to-br ${tile.color} ${tile.border} scale-[0.98]`
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
            <p className="text-gray-400 text-sm text-center mb-6">We&apos;ll show nearby sightings and reports</p>
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
                <div className="glass-card p-6 text-center">
                  <MapPin className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 mb-3">Location access was denied or unavailable</p>
                  <p className="text-xs text-gray-500">You can set it later in your profile</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleStep2Continue} className="flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all">
                Skip
              </button>
              <button onClick={handleStep2Continue} className="flex-1 py-3 rounded-xl text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white transition-all">
                {location ? 'Use This Location' : 'Continue'} <ChevronRight className="w-4 h-4 inline ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Timeframe */}
        {step === 3 && (
          <div className="px-6 pb-6 pt-4">
            <h2 className="text-2xl font-bold text-white text-center mb-1">When did it happen?</h2>
            <p className="text-gray-400 text-sm text-center mb-6">Tell us about your experience</p>
            <div className="space-y-2">
              {TIMEFRAME_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setTimeframe(opt.id)}
                  className={classNames(
                    'w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border',
                    timeframe === opt.id
                      ? 'bg-primary-500/10 border-primary-500/30'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                  )}
                >
                  <span className="text-xl">{opt.icon}</span>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-white block">{opt.label}</span>
                    <span className="text-xs text-gray-400">{opt.description}</span>
                  </div>
                  {timeframe === opt.id && <Check className="w-4 h-4 text-primary-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
            <button
              onClick={completeOnboarding}
              disabled={!timeframe}
              className={classNames(
                'w-full mt-6 py-3 rounded-xl text-sm font-medium transition-all',
                timeframe ? 'bg-primary-500 hover:bg-primary-600 text-white' : 'bg-white/5 text-gray-500 cursor-not-allowed'
              )}
            >
              Let&apos;s Go! <Sparkles className="w-4 h-4 inline ml-1" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
