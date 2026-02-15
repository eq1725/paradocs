import React, { useState } from 'react'
import { X, ChevronRight, MapPin, Bell, Sparkles, Loader2, ExternalLink } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { PhenomenonCategory } from '@/lib/database.types'

interface RevealReport {
  title: string
  slug: string
  location_text: string
  summary: string
  phenomenon_type?: { name: string; category: PhenomenonCategory }
  report_count?: number
  avg_credibility?: number
}

interface WelcomeOnboardingProps {
  onComplete: () => void
  userId?: string
  authToken?: string
}

const INTEREST_CATEGORIES = Object.entries(CATEGORY_CONFIG)
  .filter(([key]) => key !== 'combination')
  .map(([key, val]) => ({
    key: key as PhenomenonCategory,
    label: val.label,
    icon: val.icon,
    description: val.description,
    color: val.color,
    bgColor: val.bgColor,
  }))

export default function WelcomeOnboarding({ onComplete, authToken }: WelcomeOnboardingProps) {
  const [step, setStep] = useState(0)
  const [selectedCategories, setSelectedCategories] = useState<PhenomenonCategory[]>([])
  const [locationInput, setLocationInput] = useState('')
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [digestOptIn, setDigestOptIn] = useState(true)
  const [revealReport, setRevealReport] = useState<RevealReport | null>(null)
  const [revealLoading, setRevealLoading] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  function toggleCategory(cat: PhenomenonCategory) {
    setSelectedCategories(prev =>
      prev.includes(cat)
        ? prev.filter(c => c !== cat)
        : prev.length < 3 ? [...prev, cat] : prev
    )
  }

  function requestGeolocation() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
          )
          const data = await res.json()
          const city = data.address?.city || data.address?.town || data.address?.village || ''
          const state = data.address?.state || ''
          const country = data.address?.country || ''
          setLocationInput([city, state, country].filter(Boolean).join(', '))
        } catch (_e) {
          setLocationInput(`${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`)
        }
        setGeoLoading(false)
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }

  async function saveAndReveal() {
    setRevealLoading(true)
    setStep(3)
    if (authToken) {
      try {
        const body: Record<string, unknown> = { interested_categories: selectedCategories }
        if (locationInput) {
          const parts = locationInput.split(',').map(s => s.trim())
          if (parts.length >= 2) {
            body.location_city = parts[0]
            body.location_state = parts.length >= 3 ? parts[1] : ''
            body.location_country = parts[parts.length - 1]
          }
          if (geoCoords) {
            body.location_latitude = geoCoords.lat
            body.location_longitude = geoCoords.lng
          }
        }
        await fetch('/api/user/personalization', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify(body),
        })
      } catch (e) { console.error('Failed to save personalization:', e) }
    }
    try {
      const catFilter = selectedCategories.length > 0 ? `&category=${selectedCategories[0]}` : ''
      const res = await fetch(`/api/reports?limit=1&sort=rating${catFilter}`)
      const data = await res.json()
      if (data.reports?.[0]) setRevealReport(data.reports[0])
    } catch (_e) { /* fallback */ }
    setRevealLoading(false)
  }

  function finish() {
    localStorage.setItem('paradocs_welcome_complete', 'true')
    setIsExiting(true)
    setTimeout(onComplete, 300)
  }

  function nextStep() {
    if (step === 0 && selectedCategories.length === 0) return
    if (step === 2) { saveAndReveal(); return }
    setStep(s => s + 1)
  }

  function prevStep() {
    if (step > 0 && step < 3) setStep(s => s - 1)
  }

  return (
    <div
      className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 transition-opacity duration-300 ${isExiting ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(12px)' }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(20, 20, 40, 0.98) 0%, rgba(10, 10, 25, 0.98) 100%)', borderColor: 'rgba(91, 99, 241, 0.2)', boxShadow: '0 0 60px rgba(91, 99, 241, 0.15), 0 25px 80px rgba(0, 0, 0, 0.6)' }}>
        <button onClick={finish} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-10"><X className="w-5 h-5" /></button>

        {step < 3 && (
          <div className="flex gap-1.5 px-6 pt-6">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-1 flex-1 rounded-full transition-all duration-500" style={{ background: i <= step ? 'linear-gradient(90deg, #5b63f1, #8b5cf6)' : 'rgba(255, 255, 255, 0.1)' }} />
            ))}
          </div>
        )}

        {step === 0 && (
          <div className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">What draws you in?</h2>
              <p className="text-gray-400 text-sm">Pick up to 3 topics that fascinate you</p>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[340px] overflow-y-auto pr-1">
              {INTEREST_CATEGORIES.map(cat => {
                const selected = selectedCategories.includes(cat.key)
                return (
                  <button key={cat.key} onClick={() => toggleCategory(cat.key)} className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all duration-200 ${selected ? 'border-purple-500/50 bg-purple-500/10' : 'border-gray-700/50 bg-gray-800/30 hover:border-gray-600/50 hover:bg-gray-800/50'}`}>
                    <span className="text-xl flex-shrink-0">{cat.icon}</span>
                    <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-gray-300'}`}>{cat.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between items-center mt-6">
              <span className="text-xs text-gray-500">{selectedCategories.length}/3 selected</span>
              <button onClick={nextStep} disabled={selectedCategories.length === 0} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: selectedCategories.length > 0 ? 'linear-gradient(135deg, #5b63f1, #4f46e5)' : 'rgba(91, 99, 241, 0.3)', boxShadow: selectedCategories.length > 0 ? '0 2px 12px rgba(91, 99, 241, 0.3)' : 'none' }}>
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 mb-3"><MapPin className="w-6 h-6 text-purple-400" /></div>
              <h2 className="text-2xl font-bold text-white mb-2">Where are you based?</h2>
              <p className="text-gray-400 text-sm">We&apos;ll show you reports near your area</p>
            </div>
            <div className="space-y-3">
              <input type="text" value={locationInput} onChange={e => setLocationInput(e.target.value)} placeholder="City, State, Country" className="w-full px-4 py-3 rounded-xl border border-gray-700/50 bg-gray-800/50 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30" />
              <button onClick={requestGeolocation} disabled={geoLoading} className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-gray-700/50 bg-gray-800/30 text-gray-300 text-sm hover:border-purple-500/30 hover:bg-gray-800/50 transition-all">
                {geoLoading ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <MapPin className="w-4 h-4 text-purple-400" />}
                {geoLoading ? 'Detecting location...' : 'Use my current location'}
              </button>
            </div>
            <div className="flex justify-between items-center mt-6">
              <button onClick={prevStep} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Back</button>
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Skip</button>
                <button onClick={nextStep} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all" style={{ background: 'linear-gradient(135deg, #5b63f1, #4f46e5)', boxShadow: '0 2px 12px rgba(91, 99, 241, 0.3)' }}>
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 mb-3"><Bell className="w-6 h-6 text-purple-400" /></div>
              <h2 className="text-2xl font-bold text-white mb-2">Stay in the loop</h2>
              <p className="text-gray-400 text-sm">Choose how you want to hear from us</p>
            </div>
            <div className="space-y-3">
              <label className="flex items-center justify-between p-4 rounded-xl border border-gray-700/50 bg-gray-800/30 cursor-pointer hover:border-purple-500/30 transition-all">
                <div className="flex items-center gap-3">
                  <span className="text-lg">\u{1F4E7}</span>
                  <div>
                    <div className="text-sm font-medium text-white">Weekly Digest</div>
                    <div className="text-xs text-gray-500">Curated paranormal insights, every week</div>
                  </div>
                </div>
                <div onClick={() => setDigestOptIn(!digestOptIn)} className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors duration-200 ${digestOptIn ? 'bg-purple-500' : 'bg-gray-600'}`}>
                  <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200" style={{ left: '2px', transform: digestOptIn ? 'translateX(20px)' : 'translateX(0)' }} />
                </div>
              </label>
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-700/30 bg-gray-800/20 opacity-50">
                <div className="flex items-center gap-3">
                  <span className="text-lg">\u{1F514}</span>
                  <div>
                    <div className="text-sm font-medium text-gray-400">Push Notifications</div>
                    <div className="text-xs text-gray-600">Coming soon</div>
                  </div>
                </div>
                <div className="w-11 h-6 rounded-full bg-gray-700" />
              </div>
            </div>
            <div className="flex justify-between items-center mt-6">
              <button onClick={prevStep} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Back</button>
              <button onClick={nextStep} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all" style={{ background: 'linear-gradient(135deg, #5b63f1, #4f46e5)', boxShadow: '0 2px 12px rgba(91, 99, 241, 0.3)' }}>
                Show Me What&apos;s Out There <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-6 text-center">
            {revealLoading ? (
              <div className="py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 mb-4 animate-pulse"><Sparkles className="w-8 h-8 text-purple-400" /></div>
                <h2 className="text-xl font-bold text-white mb-2">Searching the unknown...</h2>
                <p className="text-gray-400 text-sm">Finding something near you</p>
                <Loader2 className="w-6 h-6 animate-spin text-purple-400 mx-auto mt-4" />
              </div>
            ) : (
              <div className="py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 mb-4"><Sparkles className="w-8 h-8 text-purple-400" /></div>
                <h2 className="text-2xl font-bold text-white mb-2">We found something for you</h2>
                {locationInput ? (
                  <p className="text-gray-400 text-sm mb-4">Based on your interests near {locationInput.split(',')[0]}</p>
                ) : (
                  <p className="text-gray-400 text-sm mb-4">Based on your interests</p>
                )}
                {revealReport ? (
                  <a href={`/report/${revealReport.slug}`} className="block p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 hover:bg-purple-500/10 transition-all text-left group mt-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="text-white font-semibold text-base group-hover:text-purple-300 transition-colors">{revealReport.title}</h3>
                        {revealReport.location_text && <p className="text-gray-500 text-xs mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {revealReport.location_text}</p>}
                        {revealReport.summary && <p className="text-gray-400 text-sm mt-2 line-clamp-2">{revealReport.summary}</p>}
                        {revealReport.phenomenon_type && <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20">{revealReport.phenomenon_type.name}</span>}
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-purple-400 transition-colors flex-shrink-0 mt-1" />
                    </div>
                  </a>
                ) : (
                  <div className="p-4 rounded-xl border border-gray-700/30 bg-gray-800/20 mt-2">
                    <p className="text-gray-400 text-sm">Start exploring to discover reports tailored to you.</p>
                  </div>
                )}
                <button onClick={finish} className="mt-6 px-8 py-3 rounded-xl text-sm font-medium text-white transition-all" style={{ background: 'linear-gradient(135deg, #5b63f1, #4f46e5)', boxShadow: '0 2px 16px rgba(91, 99, 241, 0.4)' }}>
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

export function hasCompletedWelcome(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem('paradocs_welcome_complete') === 'true'
}

export function resetWelcome() {
  localStorage.removeItem('paradocs_welcome_complete')
}
