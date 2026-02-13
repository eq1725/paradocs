'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import {
  ArrowLeft, Save, LinkIcon, Tag, X, Search,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import {
  JournalEntryType,
  ENTRY_TYPE_CONFIG,
  createEntry,
} from '@/lib/services/journal.service'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { PhenomenonCategory } from '@/lib/database.types'

interface LinkedReport {
  id: string
  title: string
  slug: string
  category: string
}

export default function NewJournalEntryPage() {
  const router = useRouter()
  const { report_id, report_title, report_slug, report_category } = router.query

  const [entryType, setEntryType] = useState<JournalEntryType>('freeform')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [evidenceNotes, setEvidenceNotes] = useState('')
  const [conclusions, setConclusions] = useState('')
  const [linkedReports, setLinkedReports] = useState<LinkedReport[]>([])
  const [linkedCategories, setLinkedCategories] = useState<PhenomenonCategory[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)

  // Report search
  const [reportSearch, setReportSearch] = useState('')
  const [reportResults, setReportResults] = useState<LinkedReport[]>([])
  const [searchingReports, setSearchingReports] = useState(false)

  // Pre-fill from query params (when coming from "Add to Journal" on a report)
  useEffect(() => {
    if (report_id && report_title) {
      setLinkedReports([{
        id: report_id as string,
        title: report_title as string,
        slug: (report_slug as string) || '',
        category: (report_category as string) || '',
      }])
      if (report_category) {
        setLinkedCategories([report_category as PhenomenonCategory])
      }
      setEntryType('evidence_review')
      setTitle(`Notes on: ${report_title}`)
    }
  }, [report_id, report_title, report_slug, report_category])

  // Search reports for linking
  useEffect(() => {
    if (!reportSearch || reportSearch.length < 2) {
      setReportResults([])
      return
    }

    const timeout = setTimeout(async () => {
      setSearchingReports(true)
      const { data } = await supabase
        .from('reports')
        .select('id, title, slug, category')
        .ilike('title', `%${reportSearch}%`)
        .eq('status', 'approved')
        .limit(5)

      setReportResults((data as LinkedReport[]) || [])
      setSearchingReports(false)
    }, 300)

    return () => clearTimeout(timeout)
  }, [reportSearch])

  const addLinkedReport = (report: LinkedReport) => {
    if (!linkedReports.find(r => r.id === report.id)) {
      setLinkedReports(prev => [...prev, report])
      if (report.category && !linkedCategories.includes(report.category as PhenomenonCategory)) {
        setLinkedCategories(prev => [...prev, report.category as PhenomenonCategory])
      }
    }
    setReportSearch('')
    setReportResults([])
  }

  const removeLinkedReport = (id: string) => {
    setLinkedReports(prev => prev.filter(r => r.id !== id))
  }

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags(prev => [...prev, tag])
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag))
  }

  const handleSave = async () => {
    if (!title.trim()) return

    setSaving(true)
    const entry = await createEntry({
      title: title.trim(),
      entry_type: entryType,
      body,
      hypothesis: hypothesis || null,
      evidence_notes: evidenceNotes || null,
      conclusions: conclusions || null,
      linked_report_ids: linkedReports.map(r => r.id),
      linked_categories: linkedCategories,
      tags,
    })

    if (entry) {
      router.push(`/dashboard/journal/${entry.id}`)
    } else {
      setSaving(false)
      // TODO: show error toast
    }
  }

  const typeConfig = ENTRY_TYPE_CONFIG[entryType]

  return (
    <DashboardLayout title="New Journal Entry">
      <div className="max-w-3xl mx-auto">
        {/* Back link */}
        <Link
          href="/dashboard/journal"
          className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Journal
        </Link>

        {/* Entry type selector */}
        <div className="mb-6">
          <label className="block text-gray-300 text-sm font-medium mb-3">Entry Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.entries(ENTRY_TYPE_CONFIG) as [JournalEntryType, typeof ENTRY_TYPE_CONFIG[JournalEntryType]][]).map(([type, config]) => (
              <button
                key={type}
                onClick={() => setEntryType(type)}
                className={classNames(
                  'flex items-center gap-2 p-3 rounded-lg border text-left transition-all text-sm',
                  entryType === type
                    ? 'border-primary-500 bg-primary-500/10 text-white'
                    : 'border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700 hover:text-gray-300'
                )}
              >
                <span className="text-lg">{config.icon}</span>
                <div>
                  <div className="font-medium">{config.label}</div>
                  <div className="text-xs text-gray-500 line-clamp-1">{config.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="mb-4">
          <label className="block text-gray-300 text-sm font-medium mb-2">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Give your entry a descriptive title..."
            className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Hypothesis field (for hypothesis type) */}
        {typeConfig.fields.includes('hypothesis') && (
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Hypothesis
              <span className="text-gray-500 font-normal ml-1">— What do you think is happening?</span>
            </label>
            <textarea
              value={hypothesis}
              onChange={e => setHypothesis(e.target.value)}
              placeholder="State your hypothesis..."
              rows={3}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50 resize-y"
            />
          </div>
        )}

        {/* Evidence notes (for hypothesis type) */}
        {typeConfig.fields.includes('evidence_notes') && (
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Supporting Evidence
              <span className="text-gray-500 font-normal ml-1">— What supports or contradicts this?</span>
            </label>
            <textarea
              value={evidenceNotes}
              onChange={e => setEvidenceNotes(e.target.value)}
              placeholder="Document the evidence you've found..."
              rows={4}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50 resize-y"
            />
          </div>
        )}

        {/* Body (all types) */}
        {typeConfig.fields.includes('body') && (
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              {entryType === 'hypothesis' ? 'Additional Notes' : 'Notes'}
              <span className="text-gray-500 font-normal ml-1">— Markdown supported</span>
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your research notes..."
              rows={8}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50 resize-y font-mono text-sm"
            />
          </div>
        )}

        {/* Conclusions (for hypothesis, evidence_review, connection) */}
        {typeConfig.fields.includes('conclusions') && (
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Conclusions
              <span className="text-gray-500 font-normal ml-1">— What have you determined?</span>
            </label>
            <textarea
              value={conclusions}
              onChange={e => setConclusions(e.target.value)}
              placeholder="Summarize your findings..."
              rows={3}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50 resize-y"
            />
          </div>
        )}

        {/* Linked Reports */}
        <div className="mb-4">
          <label className="block text-gray-300 text-sm font-medium mb-2">
            <LinkIcon className="w-3.5 h-3.5 inline mr-1" />
            Linked Reports
          </label>

          {/* Linked reports list */}
          {linkedReports.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {linkedReports.map(report => (
                <span
                  key={report.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300"
                >
                  {report.category && CATEGORY_CONFIG[report.category as PhenomenonCategory]?.icon}
                  <span className="truncate max-w-[200px]">{report.title}</span>
                  <button
                    onClick={() => removeLinkedReport(report.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Report search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={reportSearch}
              onChange={e => setReportSearch(e.target.value)}
              placeholder="Search reports to link..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500/50"
            />
            {/* Search results dropdown */}
            {reportResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden z-10 shadow-xl">
                {reportResults.map(report => (
                  <button
                    key={report.id}
                    onClick={() => addLinkedReport(report)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-0"
                  >
                    <div className="text-white text-sm font-medium truncate">{report.title}</div>
                    <div className="text-gray-500 text-xs">{CATEGORY_CONFIG[report.category as PhenomenonCategory]?.label || report.category}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="mb-6">
          <label className="block text-gray-300 text-sm font-medium mb-2">
            <Tag className="w-3.5 h-3.5 inline mr-1" />
            Tags
          </label>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-800 rounded-full text-xs text-gray-300"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
              placeholder="Add a tag and press Enter..."
              className="flex-1 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500/50"
            />
            <button
              onClick={addTag}
              disabled={!tagInput.trim()}
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-30"
            >
              Add
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="mb-8">
          <label className="block text-gray-300 text-sm font-medium mb-2">Related Categories</label>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(CATEGORY_CONFIG) as [PhenomenonCategory, typeof CATEGORY_CONFIG[PhenomenonCategory]][])
              .filter(([key]) => key !== 'combination')
              .map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => {
                    setLinkedCategories(prev =>
                      prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
                    )
                  }}
                  className={classNames(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    linkedCategories.includes(key)
                      ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                      : 'border-gray-800 bg-gray-900 text-gray-500 hover:text-gray-300 hover:border-gray-700'
                  )}
                >
                  {config.icon} {config.label}
                </button>
              ))}
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-between border-t border-gray-800 pt-6">
          <Link
            href="/dashboard/journal"
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Entry'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
