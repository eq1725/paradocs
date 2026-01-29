'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Check, MapPin, Calendar, Users,
  FileText, Eye, Upload, AlertCircle, Camera
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ImageUpload, { UploadedFile } from '@/components/ImageUpload'
import { PhenomenonCategory, PhenomenonType } from '@/lib/database.types'
import { CATEGORY_CONFIG, COUNTRIES, US_STATES } from '@/lib/constants'
import { generateSlug, classNames } from '@/lib/utils'

type Step = 1 | 2 | 3 | 4

export default function SubmitPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [phenomenonTypes, setPhenomenonTypes] = useState<PhenomenonType[]>([])
  const [error, setError] = useState('')
  const [uploadedMedia, setUploadedMedia] = useState<UploadedFile[]>([])

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
    eventDateApproximate: false,
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

  function validateStep(s: Step): boolean {
    setError('')
    switch (s) {
      case 1:
        if (!formData.title.trim()) {
          setError('Please enter a title')
          return false
        }
        if (!formData.category) {
          setError('Please select a category')
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
        return true
      case 3:
        if (!formData.country) {
          setError('Please select a country')
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

    if (!validateStep(4)) return

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
          event_date: formData.eventDate || null,
          event_time: formData.eventTime || null,
          event_date_approximate: formData.eventDateApproximate,
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

  const filteredTypes = phenomenonTypes.filter(
    t => !formData.category || t.category === formData.category
  )

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
        <title>Submit a Report - ParaDocs</title>
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

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Category *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updateForm('category', key)}
                      className={classNames(
                        'p-3 rounded-lg border text-left transition-all',
                        formData.category === key
                          ? `${config.bgColor} border-current ${config.color}`
                          : 'bg-white/5 border-white/10 hover:border-white/20'
                      )}
                    >
                      <span className="text-xl">{config.icon}</span>
                      <p className="mt-1 text-sm font-medium text-white">
                        {config.label}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {formData.category && filteredTypes.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Specific Type (optional)
                  </label>
                  <select
                    value={formData.phenomenonTypeId}
                    onChange={(e) => updateForm('phenomenonTypeId', e.target.value)}
                    className="w-full"
                  >
                    <option value="">Select a type...</option>
                    {filteredTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.icon} {type.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cross-disciplinary tagging */}
              {formData.category && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Related Phenomena (Cross-Disciplinary)
                  </label>
                  <p className="text-xs text-gray-400 mb-3">
                    Does this experience relate to other phenomena? Select additional types that apply.
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1 p-3 bg-white/5 rounded-lg border border-white/10">
                    {Object.entries(CATEGORY_CONFIG)
                      .filter(([key]) => key !== formData.category)
                      .map(([catKey, catConfig]) => {
                        const catTypes = phenomenonTypes.filter(t => t.category === catKey)
                        if (catTypes.length === 0) return null
                        return (
                          <div key={catKey} className="mb-2">
                            <p className="text-xs text-gray-400 font-medium flex items-center gap-1 mb-1">
                              <span>{catConfig.icon}</span> {catConfig.label}
                            </p>
                            <div className="flex flex-wrap gap-1 ml-4">
                              {catTypes.slice(0, 5).map(type => {
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
                                      'text-xs px-2 py-1 rounded-full transition-colors',
                                      isSelected
                                        ? 'bg-primary-500/30 text-primary-300 border border-primary-500/50'
                                        : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20'
                                    )}
                                  >
                                    {type.icon} {type.name}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                  {formData.additionalTypeIds.length > 0 && (
                    <p className="text-xs text-primary-400 mt-2">
                      {formData.additionalTypeIds.length} additional type(s) selected
                    </p>
                  )}
                </div>
              )}

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

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Date of Event
                  </label>
                  <input
                    type="date"
                    value={formData.eventDate}
                    onChange={(e) => updateForm('eventDate', e.target.value)}
                    className="w-full"
                  />
                </div>
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
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.eventDateApproximate}
                  onChange={(e) => updateForm('eventDateApproximate', e.target.checked)}
                  className="rounded bg-white/5 border-white/20"
                />
                <span className="text-sm text-gray-300">Date is approximate</span>
              </label>

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
                    Number of Witnesses
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
                  City / Town
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

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Latitude (optional)
                  </label>
                  <input
                    type="number"
                    value={formData.latitude}
                    onChange={(e) => updateForm('latitude', e.target.value)}
                    placeholder="e.g., 33.4484"
                    className="w-full"
                    step="any"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Longitude (optional)
                  </label>
                  <input
                    type="number"
                    value={formData.longitude}
                    onChange={(e) => updateForm('longitude', e.target.value)}
                    placeholder="e.g., -112.0740"
                    className="w-full"
                    step="any"
                  />
                </div>
              </div>
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
                  Evidence Available
                </label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.hasPhotoVideo || uploadedMedia.length > 0}
                      onChange={(e) => updateForm('hasPhotoVideo', e.target.checked)}
                      className="rounded bg-white/5 border-white/20"
                      disabled={uploadedMedia.length > 0}
                    />
                    <span className="text-sm text-gray-300">
                      Photos or videos available
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

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Evidence Description
                </label>
                <textarea
                  value={formData.evidenceSummary}
                  onChange={(e) => updateForm('evidenceSummary', e.target.value)}
                  placeholder="Describe any evidence you have (photos, recordings, physical traces, etc.)"
                  className="w-full h-24 resize-none"
                />
              </div>

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
