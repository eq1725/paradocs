'use client'

import type {
  ConstellationArtifact,
  CaseFile,
  ConstellationConnection,
  ConstellationTheory,
} from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { SOURCE_TYPE_CONFIG, VERDICT_CONFIG, RELATIONSHIP_CONFIG } from '@/lib/research-hub-helpers'
import {
  X, Lightbulb, Plus, Check, Trash2, Globe, Lock,
  ChevronDown, ChevronUp, Loader2, Link2, FileText,
  AlertTriangle,
} from 'lucide-react'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

interface TheoryComposerProps {
  isOpen: boolean
  onClose: () => void
  artifacts: ConstellationArtifact[]
  caseFiles: CaseFile[]
  connections: ConstellationConnection[]
  editingTheory?: ConstellationTheory | null
  onSaved: () => void
}

interface TheoryDraft {
  title: string
  thesis: string
  artifact_ids: string[]
  connection_ids: string[]
  case_file_id: string | null
}

export function TheoryComposer({
  isOpen,
  onClose,
  artifacts,
  caseFiles,
  connections,
  editingTheory,
  onSaved,
}: TheoryComposerProps) {
  var [draft, setDraft] = useState<TheoryDraft>({
    title: '',
    thesis: '',
    artifact_ids: [],
    connection_ids: [],
    case_file_id: null,
  })
  var [saving, setSaving] = useState(false)
  var [error, setError] = useState<string | null>(null)
  var [showEvidencePicker, setShowEvidencePicker] = useState(false)
  var [showConnectionPicker, setShowConnectionPicker] = useState(false)
  var [publishConfirm, setPublishConfirm] = useState(false)
  var [publishing, setPublishing] = useState(false)

  // Populate draft when editing
  useEffect(function() {
    if (editingTheory) {
      setDraft({
        title: editingTheory.title,
        thesis: editingTheory.thesis,
        artifact_ids: editingTheory.artifact_ids || [],
        connection_ids: editingTheory.connection_ids || [],
        case_file_id: editingTheory.case_file_id || null,
      })
    } else {
      setDraft({
        title: '',
        thesis: '',
        artifact_ids: [],
        connection_ids: [],
        case_file_id: null,
      })
    }
    setError(null)
    setPublishConfirm(false)
  }, [editingTheory, isOpen])

  var selectedArtifacts = useMemo(function() {
    return artifacts.filter(function(a) {
      return draft.artifact_ids.includes(a.id)
    })
  }, [artifacts, draft.artifact_ids])

  var selectedConnections = useMemo(function() {
    return connections.filter(function(c) {
      return draft.connection_ids.includes(c.id)
    })
  }, [connections, draft.connection_ids])

  var unselectedArtifacts = useMemo(function() {
    return artifacts.filter(function(a) {
      return !draft.artifact_ids.includes(a.id)
    })
  }, [artifacts, draft.artifact_ids])

  var unselectedConnections = useMemo(function() {
    return connections.filter(function(c) {
      return !draft.connection_ids.includes(c.id)
    })
  }, [connections, draft.connection_ids])

  var getAuthToken = useCallback(async function() {
    var session = await supabase.auth.getSession()
    return session.data.session?.access_token || null
  }, [])

  var handleSave = useCallback(async function() {
    if (!draft.title.trim() || !draft.thesis.trim()) {
      setError('Title and thesis are required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      var token = await getAuthToken()
      if (!token) {
        setError('Not authenticated')
        return
      }

      var headers: Record<string, string> = {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      }

      var url = '/api/research-hub/theories'
      var method = 'POST'

      if (editingTheory) {
        url = '/api/research-hub/theories?id=' + editingTheory.id
        method = 'PUT'
      }

      var response = await fetch(url, {
        method: method,
        headers: headers,
        body: JSON.stringify({
          title: draft.title.trim(),
          thesis: draft.thesis.trim(),
          artifact_ids: draft.artifact_ids,
          connection_ids: draft.connection_ids,
          case_file_id: draft.case_file_id,
        }),
      })

      if (!response.ok) {
        var errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save theory')
      }

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [draft, editingTheory, getAuthToken, onSaved, onClose])

  var handlePublish = useCallback(async function() {
    if (!editingTheory) return

    setPublishing(true)
    setError(null)

    try {
      var token = await getAuthToken()
      if (!token) {
        setError('Not authenticated')
        return
      }

      var action = editingTheory.is_public ? 'unpublish' : 'publish'
      var response = await fetch(
        '/api/research-hub/theories?id=' + editingTheory.id + '&action=' + action,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        var errorData = await response.json()
        throw new Error(errorData.error || 'Failed to ' + action)
      }

      onSaved()
      setPublishConfirm(false)
    } catch (err: any) {
      setError(err.message || 'Failed to publish')
    } finally {
      setPublishing(false)
    }
  }, [editingTheory, getAuthToken, onSaved])

  var handleDelete = useCallback(async function() {
    if (!editingTheory) return
    if (!confirm('Delete this theory? This cannot be undone.')) return

    setSaving(true)
    setError(null)

    try {
      var token = await getAuthToken()
      if (!token) return

      var response = await fetch(
        '/api/research-hub/theories?id=' + editingTheory.id,
        {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token },
        }
      )

      if (!response.ok) throw new Error('Failed to delete')

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }, [editingTheory, getAuthToken, onSaved, onClose])

  var toggleArtifact = useCallback(function(artifactId: string) {
    setDraft(function(prev) {
      var ids = prev.artifact_ids.includes(artifactId)
        ? prev.artifact_ids.filter(function(id) { return id !== artifactId })
        : prev.artifact_ids.concat([artifactId])
      return { ...prev, artifact_ids: ids }
    })
  }, [])

  var toggleConnection = useCallback(function(connectionId: string) {
    setDraft(function(prev) {
      var ids = prev.connection_ids.includes(connectionId)
        ? prev.connection_ids.filter(function(id) { return id !== connectionId })
        : prev.connection_ids.concat([connectionId])
      return { ...prev, connection_ids: ids }
    })
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              {editingTheory ? 'Edit Theory' : 'New Theory'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {editingTheory && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Delete theory"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Theory Title
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={function(e) { setDraft(function(prev) { return { ...prev, title: e.target.value } }) }}
              placeholder="e.g. Triangle UFO sightings correlate with military bases"
              className={classNames(
                'w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-500',
                'bg-gray-800 border border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500',
                'outline-none transition-colors'
              )}
            />
          </div>

          {/* Thesis */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Thesis
            </label>
            <textarea
              value={draft.thesis}
              onChange={function(e) { setDraft(function(prev) { return { ...prev, thesis: e.target.value } }) }}
              placeholder="Describe your theory, the patterns you've noticed, and what you think they mean..."
              rows={5}
              className={classNames(
                'w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-500 resize-none',
                'bg-gray-800 border border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500',
                'outline-none transition-colors'
              )}
            />
          </div>

          {/* Case File */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Related Case File (optional)
            </label>
            <select
              value={draft.case_file_id || ''}
              onChange={function(e) {
                setDraft(function(prev) {
                  return { ...prev, case_file_id: e.target.value || null }
                })
              }}
              className={classNames(
                'w-full px-4 py-2.5 rounded-lg text-white',
                'bg-gray-800 border border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500',
                'outline-none transition-colors'
              )}
            >
              <option value="">None</option>
              {caseFiles.map(function(cf) {
                return (
                  <option key={cf.id} value={cf.id}>{cf.title}</option>
                )
              })}
            </select>
          </div>

          {/* Supporting Evidence (Artifacts) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">
                {"Supporting Evidence (" + draft.artifact_ids.length + ")"}
              </label>
              <button
                onClick={function() { setShowEvidencePicker(!showEvidencePicker) }}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Artifacts
              </button>
            </div>

            {/* Selected artifacts */}
            {selectedArtifacts.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {selectedArtifacts.map(function(artifact) {
                  var sourceConfig = SOURCE_TYPE_CONFIG[artifact.source_type] || SOURCE_TYPE_CONFIG.other
                  return (
                    <div
                      key={artifact.id}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg group"
                    >
                      <span className={classNames('text-xs font-medium', sourceConfig.color)}>
                        {sourceConfig.label}
                      </span>
                      <span className="text-sm text-gray-300 truncate flex-1">{artifact.title}</span>
                      <button
                        onClick={function() { toggleArtifact(artifact.id) }}
                        className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Artifact picker dropdown */}
            {showEvidencePicker && unselectedArtifacts.length > 0 && (
              <div className="bg-gray-800 border border-gray-700 rounded-lg max-h-40 overflow-y-auto">
                {unselectedArtifacts.map(function(artifact) {
                  var sourceConfig = SOURCE_TYPE_CONFIG[artifact.source_type] || SOURCE_TYPE_CONFIG.other
                  return (
                    <button
                      key={artifact.id}
                      onClick={function() { toggleArtifact(artifact.id) }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 transition-colors text-left"
                    >
                      <Plus className="w-3 h-3 text-gray-500 flex-shrink-0" />
                      <span className={classNames('text-xs font-medium flex-shrink-0', sourceConfig.color)}>
                        {sourceConfig.label}
                      </span>
                      <span className="text-sm text-gray-300 truncate">{artifact.title}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {showEvidencePicker && unselectedArtifacts.length === 0 && (
              <p className="text-xs text-gray-500 italic">All artifacts have been added</p>
            )}
          </div>

          {/* Supporting Connections */}
          {connections.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">
                  {"Supporting Connections (" + draft.connection_ids.length + ")"}
                </label>
                <button
                  onClick={function() { setShowConnectionPicker(!showConnectionPicker) }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Connections
                </button>
              </div>

              {selectedConnections.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {selectedConnections.map(function(conn) {
                    var relConfig = RELATIONSHIP_CONFIG[conn.relationship_type] || RELATIONSHIP_CONFIG.related
                    var artifactA = artifacts.find(function(a) { return a.id === conn.artifact_a_id })
                    var artifactB = artifacts.find(function(a) { return a.id === conn.artifact_b_id })
                    return (
                      <div
                        key={conn.id}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg group"
                      >
                        <Link2 className={classNames('w-3 h-3 flex-shrink-0', relConfig.color)} />
                        <span className="text-sm text-gray-300 truncate flex-1">
                          {(artifactA ? artifactA.title : 'Unknown') + ' \u2194 ' + (artifactB ? artifactB.title : 'Unknown')}
                        </span>
                        <span className={classNames('text-xs', relConfig.color)}>{relConfig.label}</span>
                        <button
                          onClick={function() { toggleConnection(conn.id) }}
                          className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {showConnectionPicker && unselectedConnections.length > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-lg max-h-40 overflow-y-auto">
                  {unselectedConnections.map(function(conn) {
                    var relConfig = RELATIONSHIP_CONFIG[conn.relationship_type] || RELATIONSHIP_CONFIG.related
                    var artifactA = artifacts.find(function(a) { return a.id === conn.artifact_a_id })
                    var artifactB = artifacts.find(function(a) { return a.id === conn.artifact_b_id })
                    return (
                      <button
                        key={conn.id}
                        onClick={function() { toggleConnection(conn.id) }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 transition-colors text-left"
                      >
                        <Plus className="w-3 h-3 text-gray-500 flex-shrink-0" />
                        <span className="text-sm text-gray-300 truncate flex-1">
                          {(artifactA ? artifactA.title : '?') + ' \u2194 ' + (artifactB ? artifactB.title : '?')}
                        </span>
                        <span className={classNames('text-xs flex-shrink-0', relConfig.color)}>{relConfig.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Publish section (only when editing) */}
          {editingTheory && (
            <div className="border-t border-gray-800 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {editingTheory.is_public ? (
                    <Globe className="w-4 h-4 text-green-400" />
                  ) : (
                    <Lock className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="text-sm text-gray-300">
                    {editingTheory.is_public ? 'Published \u2014 visible on your public profile' : 'Private \u2014 only you can see this'}
                  </span>
                </div>
                <button
                  onClick={function() { setPublishConfirm(!publishConfirm) }}
                  className={classNames(
                    'text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
                    editingTheory.is_public
                      ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                      : 'text-green-400 hover:text-green-300 hover:bg-green-500/10'
                  )}
                >
                  {editingTheory.is_public ? 'Unpublish' : 'Publish'}
                </button>
              </div>

              {publishConfirm && (
                <div className="mt-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-300">
                      {editingTheory.is_public
                        ? 'This will remove the theory from your public profile. Other researchers will no longer be able to see it.'
                        : 'This will make your theory visible on your public researcher profile. Other researchers will be able to read it and see the supporting evidence you\u2019ve linked.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={function() { setPublishConfirm(false) }}
                      className="text-xs text-gray-400 hover:text-white px-3 py-1.5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePublish}
                      disabled={publishing}
                      className={classNames(
                        'text-xs font-medium px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5',
                        editingTheory.is_public
                          ? 'bg-gray-700 text-white hover:bg-gray-600'
                          : 'bg-green-600 text-white hover:bg-green-500'
                      )}
                    >
                      {publishing && <Loader2 className="w-3 h-3 animate-spin" />}
                      {editingTheory.is_public ? 'Confirm Unpublish' : 'Confirm Publish'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !draft.title.trim() || !draft.thesis.trim()}
            className={classNames(
              'px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
              saving || !draft.title.trim() || !draft.thesis.trim()
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
            )}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingTheory ? 'Update Theory' : 'Create Theory'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TheoryComposer
