/**
 * Request Verification Component
 * 
 * Allows report owners to request expert verification
 */

import { useState } from 'react'
import { Shield, Loader2, CheckCircle, Eye, User, MapPin, Microscope, Camera } from 'lucide-react'

interface RequestVerificationProps {
  reportId: string
  isOwner: boolean
}

const REQUEST_TYPES = [
  { value: 'evidence_verification', label: 'Evidence Verification', icon: Eye, description: 'Verify photos, videos, or physical evidence' },
  { value: 'witness_interview', label: 'Witness Interview', icon: User, description: 'Request interview with witness(es)' },
  { value: 'location_survey', label: 'Location Survey', icon: MapPin, description: 'On-site investigation of the location' },
  { value: 'expert_analysis', label: 'Expert Analysis', icon: Microscope, description: 'Technical analysis by field experts' },
  { value: 'media_authentication', label: 'Media Authentication', icon: Camera, description: 'Verify authenticity of media files' },
]

export default function RequestVerification({ reportId, isOwner }: RequestVerificationProps) {
  const [showForm, setShowForm] = useState(false)
  const [requestType, setRequestType] = useState('')
  const [description, setDescription] = useState('')
  const [links, setLinks] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOwner) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!requestType) {
      setError('Please select a verification type')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          request_type: requestType,
          evidence_description: description,
          supporting_links: links.split('\n').filter(l => l.trim()),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setSubmitted(true)
      } else {
        setError(data.error || 'Failed to submit request')
      }
    } catch (err) {
      setError('Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="glass-card p-6">
        <div className="text-center py-4">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white mb-2">Verification Requested</h3>
          <p className="text-gray-400 text-sm">
            Your request has been submitted. Our expert team will review it and get back to you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card p-6">
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="text-lg font-display font-semibold text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-400" />
          Request Expert Verification
        </h3>
        <span className="text-xs text-gray-400">{showForm ? 'Hide' : 'Show'}</span>
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Verification Type *
            </label>
            <div className="grid gap-2">
              {REQUEST_TYPES.map((type) => {
                const Icon = type.icon
                return (
                  <label
                    key={type.value}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      requestType === type.value
                        ? 'bg-purple-500/20 ring-1 ring-purple-500/50'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <input
                      type="radio"
                      name="requestType"
                      value={type.value}
                      checked={requestType === type.value}
                      onChange={(e) => setRequestType(e.target.value)}
                      className="sr-only"
                    />
                    <Icon className={`w-5 h-5 ${requestType === type.value ? 'text-purple-400' : 'text-gray-500'}`} />
                    <div>
                      <div className="text-sm font-medium text-white">{type.label}</div>
                      <div className="text-xs text-gray-400">{type.description}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Evidence Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Describe the evidence you'd like verified..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Supporting Links (one per line)
            </label>
            <textarea
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              rows={2}
              className="w-full px-4 py-2 bg-surface-700 border border-surface-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="https://example.com/evidence&#10;https://example.com/source"
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full btn btn-primary flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                Submit Verification Request
              </>
            )}
          </button>
        </form>
      )}
    </div>
  )
}
