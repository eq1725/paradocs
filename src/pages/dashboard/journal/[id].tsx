'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import {
  ArrowLeft, Edit3, Trash2, Save, X,
  LinkIcon, Tag, Lock, Globe, Calendar,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import {
  JournalEntry,
  ENTRY_TYPE_CONFIG,
  getEntry,
  updateEntry,
  deleteEntry,
} from '@/lib/services/journal.service'
import { supabase } from '@/lib/supabase'
import { classNames, formatDate } from '@/lib/utils'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { PhenomenonCategory } from '@/lib/database.types'

interface LinkedReportDisplay {
  id: string
  title: string
  slug: string
  category: string
}

export default function JournalEntryPage() {
  const router = useRouter()
  const { id } = router.query

  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [linkedReportDetails, setLinkedReportDetails] = useState<LinkedReportDisplay[]>([])

  // Editable fields
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editHypothesis, setEditHypothesis] = useState('')
  const [editEvidenceNotes, setEditEvidenceNotes] = useState('')
  const [editConclusions, setEditConclusions] = useState('')

  // Load entry
  useEffect(() => {
    if (!id || typeof id !== 'string') return

    async function load() {
      setLoading(true)
      const data = await getEntry(id as string)
      if (data) {
        setEntry(data)
        setEditTitle(data.title)
        setEditBody(data.body)
        setEditHypothesis(data.hypothesis || '')
        setEditEvidenceNotes(data.evidence_notes || '')
        setEditConclusions(data.conclusions || '')

        // Load linked report details
        if (data.linked_report_ids && data.linked_report_ids.length > 0) {
          const { data: reports } = await supabase
            .from('reports')
            .select('id, title, slug, category')
            .in('id', data.linked_report_ids)

          setLinkedReportDetails((reports as LinkedReportDisplay[]) || [])
        }
      }
      setLoading(false)
    }

    load()
  }, [id])

  const handleSave = async () => {
    if (!entry || !editTitle.trim()) return

    setSaving(true)
    const updated = await updateEntry({
      id: entry.id,
      title: editTitle.trim(),
      body: editBody,
      hypothesis: editHypothesis || null,
      evidence_notes: editEvidenceNotes || null,
      conclusions: editConclusions || null,
    })

    if (updated) {
      setEntry(updated)
      setEditing(false)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!entry) return

    setDeleting(true)
    const success = await deleteEntry(entry.id)
    if (success) {
      router.push('/dashboard/journal')
    }
    setDeleting(false)
  }

  if (loading) {
    return (
      <DashboardLayout title="Journal Entry">
        <div className="max-w-3xl mx-auto">
          <div className="h-8 w-32 bg-gray-800 rounded animate-pulse mb-6" />
          <div className="h-64 bg-gray-900 rounded-xl animate-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  if (!entry) {
    return (
      <DashboardLayout title="Journal Entry">
        <div className="max-w-3xl mx-auto text-center py-16">
          <h2 className="text-white text-xl font-bold mb-2">Entry Not Found</h2>
          <p className="text-gray-400 mb-6">This journal entry doesn&apos;t exist or you don&apos;t have access.</p>
          <Link
            href="/dashboard/journal"
            scroll={false}
            className="text-primary-400 hover:text-primary-300 transition-colors"
          >
            Back to Journal
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const typeConfig = ENTRY_TYPE_CONFIG[entry.entry_type]

  return (
    <DashboardLayout title={entry.title}>
      <div className="max-w-3xl mx-auto">
        {/* Back + actions bar */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/dashboard/journal"
            scroll={false}
            className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Journal
          </Link>

          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => {
                    setEditing(false)
                    setEditTitle(entry.title)
                    setEditBody(entry.body)
                    setEditHypothesis(entry.hypothesis || '')
                    setEditEvidenceNotes(entry.evidence_notes || '')
                    setEditConclusions(entry.conclusions || '')
                  }}
                  className="flex items-center gap-1 px-3 py-2 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !editTitle.trim()}
                  className="flex items-center gap-1 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-400 rounded-lg text-sm transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-800/50 rounded-lg">
            <p className="text-red-300 text-sm mb-3">Are you sure you want to delete this entry? This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Entry content */}
        <article className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          {/* Header metadata */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className={classNames(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
              typeConfig.bgColor,
              typeConfig.color
            )}>
              <span>{typeConfig.icon}</span>
              {typeConfig.label}
            </span>
            <span className="flex items-center gap-1 text-gray-500 text-xs">
              <Calendar className="w-3 h-3" />
              {formatDate(entry.created_at)}
            </span>
            {entry.updated_at !== entry.created_at && (
              <span className="text-gray-600 text-xs">
                (edited {formatDate(entry.updated_at)})
              </span>
            )}
            {entry.is_private ? (
              <span className="flex items-center gap-1 text-gray-600 text-xs">
                <Lock className="w-3 h-3" /> Private
              </span>
            ) : (
              <span className="flex items-center gap-1 text-gray-500 text-xs">
                <Globe className="w-3 h-3" /> Public
              </span>
            )}
          </div>

          {/* Title */}
          {editing ? (
            <input
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="w-full text-2xl font-bold text-white bg-transparent border-b border-gray-700 pb-2 mb-6 focus:outline-none focus:border-primary-500"
            />
          ) : (
            <h1 className="text-2xl font-bold text-white mb-6">{entry.title}</h1>
          )}

          {/* Hypothesis */}
          {(entry.hypothesis || (editing && typeConfig.fields.includes('hypothesis'))) && (
            <div className="mb-5 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <h3 className="text-amber-400 font-medium text-sm mb-2">Hypothesis</h3>
              {editing ? (
                <textarea
                  value={editHypothesis}
                  onChange={e => setEditHypothesis(e.target.value)}
                  rows={3}
                  className="w-full bg-transparent text-gray-300 text-sm focus:outline-none resize-y"
                />
              ) : (
                <p className="text-gray-300 text-sm whitespace-pre-wrap">{entry.hypothesis}</p>
              )}
            </div>
          )}

          {/* Evidence notes */}
          {(entry.evidence_notes || (editing && typeConfig.fields.includes('evidence_notes'))) && (
            <div className="mb-5 p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
              <h3 className="text-green-400 font-medium text-sm mb-2">Supporting Evidence</h3>
              {editing ? (
                <textarea
                  value={editEvidenceNotes}
                  onChange={e => setEditEvidenceNotes(e.target.value)}
                  rows={4}
                  className="w-full bg-transparent text-gray-300 text-sm focus:outline-none resize-y"
                />
              ) : (
                <p className="text-gray-300 text-sm whitespace-pre-wrap">{entry.evidence_notes}</p>
              )}
            </div>
          )}

          {/* Body */}
          {(entry.body || editing) && (
            <div className="mb-5">
              {editing ? (
                <textarea
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  rows={10}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-gray-300 text-sm focus:outline-none focus:border-primary-500/50 resize-y font-mono"
                />
              ) : (
                <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {entry.body}
                </div>
              )}
            </div>
          )}

          {/* Conclusions */}
          {(entry.conclusions || (editing && typeConfig.fields.includes('conclusions'))) && (
            <div className="mb-5 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
              <h3 className="text-blue-400 font-medium text-sm mb-2">Conclusions</h3>
              {editing ? (
                <textarea
                  value={editConclusions}
                  onChange={e => setEditConclusions(e.target.value)}
                  rows={3}
                  className="w-full bg-transparent text-gray-300 text-sm focus:outline-none resize-y"
                />
              ) : (
                <p className="text-gray-300 text-sm whitespace-pre-wrap">{entry.conclusions}</p>
              )}
            </div>
          )}

          {/* Linked Reports */}
          {linkedReportDetails.length > 0 && (
            <div className="border-t border-gray-800 pt-5 mt-5">
              <h3 className="text-gray-400 font-medium text-sm flex items-center gap-1.5 mb-3">
                <LinkIcon className="w-3.5 h-3.5" />
                Linked Reports
              </h3>
              <div className="space-y-2">
                {linkedReportDetails.map(report => (
                  <Link
                    key={report.id}
                    href={`/report/${report.slug}`}
                    className="flex items-center gap-2 p-2.5 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors group"
                  >
                    <span>{CATEGORY_CONFIG[report.category as PhenomenonCategory]?.icon || '📄'}</span>
                    <span className="text-gray-300 text-sm group-hover:text-white transition-colors truncate">
                      {report.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <div className="border-t border-gray-800 pt-5 mt-5">
              <div className="flex items-center gap-1.5 mb-2">
                <Tag className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-gray-500 text-xs">Tags</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {entry.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 bg-gray-800 rounded-full text-xs text-gray-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Categories */}
          {entry.linked_categories && entry.linked_categories.length > 0 && (
            <div className="border-t border-gray-800 pt-5 mt-5">
              <div className="flex flex-wrap gap-1.5">
                {entry.linked_categories.map(cat => {
                  const config = CATEGORY_CONFIG[cat as PhenomenonCategory]
                  return config ? (
                    <span
                      key={cat}
                      className="px-2.5 py-1 bg-gray-800 rounded-full text-xs text-gray-400"
                    >
                      {config.icon} {config.label}
                    </span>
                  ) : null
                })}
              </div>
            </div>
          )}
        </article>
      </div>
    </DashboardLayout>
  )
}
