'use client'

/**
 * LabCasesTab — Case files surface for the Lab.
 *
 * Two states:
 *   1. Grid of case file cards (default). Each card shows cover color,
 *      title, description, artifact count, and a preview strip of the
 *      first 3 artifact thumbnails. "+ New case file" at the top opens
 *      the create modal.
 *   2. Detail view (when a case file is selected). Shows header + list
 *      of artifacts in the case file (filtered ConstellationListView),
 *      edit / delete actions, case-file-scoped insights.
 */

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Plus, FolderOpen, MoreHorizontal, Edit3, Trash2,
  Compass, Sparkles as SparklesIcon, Loader2, X as XIcon, Check,
  Share2, Globe, Lock, Copy, Users, Mail, Crown,
} from 'lucide-react'
import type { EntryNode, UserMapData, CaseFile } from '@/lib/constellation-types'
import type { EmergentConnection, Insight } from '@/lib/constellation-data'
import { detectInsights } from '@/lib/constellation-data'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'
import ConstellationListView from './ConstellationListView'
import NodeDetailPanel from './NodeDetailPanel'
import PatternCard from './PatternCard'
import CaseFileBar, { CreateCaseFileModal } from './CaseFileBar'
import LabToolbar, { type LabViewMode, type LabSortMode } from './LabToolbar'

const COLOR_PRESETS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#ef4444', '#64748b',
]

interface LabCasesTabProps {
  userMapData: UserMapData | null
  caseFiles: CaseFile[]
  aiConnections: EmergentConnection[]
  onRefresh: () => void
  loading: boolean
}

export default function LabCasesTab({
  userMapData,
  caseFiles,
  aiConnections,
  onRefresh,
  loading,
}: LabCasesTabProps) {
  const [selectedCaseFileId, setSelectedCaseFileId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<EntryNode | null>(null)
  const [editingCaseFile, setEditingCaseFile] = useState<CaseFile | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  if (loading && !userMapData) {
    return <CasesSkeleton />
  }

  // DETAIL view
  if (selectedCaseFileId) {
    const cf = caseFiles.find(c => c.id === selectedCaseFileId)
    if (!cf) {
      // Case file got deleted / invalidated — bounce back to list
      setSelectedCaseFileId(null)
      return null
    }
    return (
      <CaseFileDetail
        caseFile={cf}
        userMapData={userMapData}
        caseFiles={caseFiles}
        aiConnections={aiConnections}
        selectedEntry={selectedEntry}
        onSelectEntry={setSelectedEntry}
        onBack={() => setSelectedCaseFileId(null)}
        onRefresh={onRefresh}
        onEdit={() => setEditingCaseFile(cf)}
      />
    )
  }

  // GRID view
  return (
    <div className="space-y-4">
      {/* Header — always shows a "+ New case file" CTA, regardless of whether
          the user has any case files yet. This is the primary entry point
          for creating a first case file. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white">Case Files</h2>
          <p className="text-xs text-gray-500 hidden sm:block">
            Organize your research into focused investigations.
          </p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New case file</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* CaseFileBar — horizontal filter strip, only shown when there's
          something to filter. The primary "+ New" button lives in the header
          above so empty-state users can always create. */}
      {caseFiles.length > 0 && (
        <CaseFileBar
          caseFiles={caseFiles}
          selectedCaseFileId={null}
          onSelectCaseFile={id => id && setSelectedCaseFileId(id)}
          onMutate={onRefresh}
        />
      )}

      {/* Case file cards — grouped into "My case files" and "Shared with me" */}
      {caseFiles.length === 0 ? (
        <CasesEmptyState onCreate={() => setCreateModalOpen(true)} />
      ) : (
        <>
          {(() => {
            const owned = caseFiles.filter(cf => !cf.is_shared_with_me)
            const shared = caseFiles.filter(cf => cf.is_shared_with_me)
            return (
              <>
                {owned.length > 0 && (
                  <div>
                    {shared.length > 0 && (
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
                        My case files ({owned.length})
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {owned.map(cf => (
                        <CaseFileCard
                          key={cf.id}
                          caseFile={cf}
                          userMapData={userMapData}
                          onClick={() => setSelectedCaseFileId(cf.id)}
                          onEdit={() => setEditingCaseFile(cf)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {shared.length > 0 && (
                  <div className={owned.length > 0 ? 'mt-5' : ''}>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      Shared with me ({shared.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {shared.map(cf => (
                        <CaseFileCard
                          key={cf.id}
                          caseFile={cf}
                          userMapData={userMapData}
                          onClick={() => setSelectedCaseFileId(cf.id)}
                          onEdit={() => {/* non-owners don't get edit access */}}
                          readOnly
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </>
      )}

      {/* Create modal — opens from the header button OR the empty state */}
      {createModalOpen && (
        <CreateCaseFileModal
          onClose={() => setCreateModalOpen(false)}
          onCreated={() => {
            setCreateModalOpen(false)
            onRefresh()
          }}
        />
      )}

      {/* Edit modal */}
      {editingCaseFile && (
        <EditCaseFileModal
          caseFile={editingCaseFile}
          onClose={() => setEditingCaseFile(null)}
          onSaved={() => {
            setEditingCaseFile(null)
            onRefresh()
          }}
          onDeleted={() => {
            setEditingCaseFile(null)
            if (editingCaseFile.id === selectedCaseFileId) setSelectedCaseFileId(null)
            onRefresh()
          }}
        />
      )}
    </div>
  )
}

// ── Grid card ──

function CaseFileCard({
  caseFile,
  userMapData,
  onClick,
  onEdit,
  readOnly,
}: {
  caseFile: CaseFile
  userMapData: UserMapData | null
  onClick: () => void
  onEdit: () => void
  readOnly?: boolean
}) {
  // Preview thumbnails — first 3 artifacts in this case file with images.
  const previews = useMemo(() => {
    if (!userMapData) return []
    return userMapData.entryNodes
      .filter(e => (e.caseFileIds || []).includes(caseFile.id) && e.imageUrl)
      .slice(0, 3)
  }, [userMapData, caseFile.id])

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className="group relative bg-gray-950 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 hover:bg-gray-900 transition-colors cursor-pointer"
      aria-label={'Open case file: ' + caseFile.title}
    >
      {/* Cover color strip */}
      <div className="h-2" style={{ backgroundColor: caseFile.cover_color }} />

      {/* Preview strip */}
      {previews.length > 0 ? (
        <div className="grid grid-cols-3 gap-0.5 h-24 bg-gray-900">
          {previews.map((p, i) => (
            <div key={p.id + '-' + i} className="relative overflow-hidden">
              <img
                src={p.imageUrl as string}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          ))}
          {/* Fill empty slots so grid stays even */}
          {previews.length < 3 && Array.from({ length: 3 - previews.length }).map((_, i) => (
            <div key={'fill-' + i} className="bg-gray-900/80" />
          ))}
        </div>
      ) : (
        <div className="h-24 bg-gradient-to-br from-gray-900 to-gray-950 flex items-center justify-center">
          <FolderOpen className="w-6 h-6 text-gray-700" />
        </div>
      )}

      {/* Body */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2 flex-1 group-hover:text-primary-200 transition-colors">
            {caseFile.title}
          </h3>
          {!readOnly && (
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 transition-colors flex-shrink-0"
              title="Edit case file"
              aria-label="Edit case file"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {caseFile.description && (
          <p className="text-xs text-gray-400 line-clamp-2 leading-snug">
            {caseFile.description}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
          <div className="flex items-center gap-1">
            <span className="tabular-nums">{caseFile.artifact_count}</span>
            <span>{caseFile.artifact_count === 1 ? 'save' : 'saves'}</span>
            {caseFile.role && caseFile.role !== 'owner' && (
              <span className="ml-1 text-[9px] uppercase tracking-wider text-gray-600">· {caseFile.role}</span>
            )}
          </div>
          {caseFile.is_shared_with_me && caseFile.owner && (
            <span className="flex items-center gap-1 truncate text-gray-400">
              {caseFile.owner.avatarUrl ? (
                <img
                  src={caseFile.owner.avatarUrl}
                  alt=""
                  className="w-3.5 h-3.5 rounded-full object-cover"
                />
              ) : (
                <Crown className="w-3 h-3" />
              )}
              <span className="truncate max-w-[80px]">
                {caseFile.owner.displayName || caseFile.owner.username || 'owner'}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Detail view ──

function CaseFileDetail({
  caseFile,
  userMapData,
  caseFiles,
  aiConnections,
  selectedEntry,
  onSelectEntry,
  onBack,
  onRefresh,
  onEdit,
}: {
  caseFile: CaseFile
  userMapData: UserMapData | null
  caseFiles: CaseFile[]
  aiConnections: EmergentConnection[]
  selectedEntry: EntryNode | null
  onSelectEntry: (e: EntryNode | null) => void
  onBack: () => void
  onRefresh: () => void
  onEdit: () => void
}) {
  // Toolbar state — scoped to this case file detail view.
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<LabSortMode>('newest')
  const [viewMode, setViewMode] = useState<LabViewMode>('grid')

  // Entries in this case file
  const caseEntries = useMemo(() => {
    return (userMapData?.entryNodes || [])
      .filter(e => (e.caseFileIds || []).includes(caseFile.id))
  }, [userMapData, caseFile.id])

  // Apply search + sort locally.
  const entries = useMemo(() => {
    let list = caseEntries
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(e =>
        (e.name && e.name.toLowerCase().includes(q)) ||
        (e.note && e.note.toLowerCase().includes(q)) ||
        (e.summary && e.summary.toLowerCase().includes(q)) ||
        (e.locationName && e.locationName.toLowerCase().includes(q)) ||
        (e.tags || []).some(t => t.toLowerCase().includes(q))
      )
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      switch (sort) {
        case 'oldest': return new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()
        case 'alphabetical': return (a.name || '').localeCompare(b.name || '')
        case 'compelling': {
          const av = a.verdict === 'compelling' ? 0 : a.verdict === 'inconclusive' ? 1 : a.verdict === 'needs_info' ? 2 : 3
          const bv = b.verdict === 'compelling' ? 0 : b.verdict === 'inconclusive' ? 1 : b.verdict === 'needs_info' ? 2 : 3
          if (av !== bv) return av - bv
          return new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
        }
        case 'newest':
        default:
          return new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
      }
    })
    return sorted
  }, [caseEntries, search, sort])

  // Case-file-scoped insights
  const scopedInsights = useMemo<Insight[]>(() => {
    return detectInsights(entries.map(e => ({
      id: e.id,
      category: e.category,
      verdict: e.verdict,
      tags: e.tags || [],
      eventDate: e.eventDate,
      locationName: e.locationName,
      latitude: e.latitude ?? null,
      longitude: e.longitude ?? null,
      loggedAt: e.loggedAt ?? null,
      title: e.name ?? null,
    })))
  }, [entries])

  // Synthesize a faux userMapData filtered to this case file, so the
  // ConstellationListView shows only the right entries.
  const scopedMapData = useMemo<UserMapData | null>(() => {
    if (!userMapData) return null
    return { ...userMapData, entryNodes: entries }
  }, [userMapData, entries])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-white rounded-md hover:bg-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All case files
        </button>
      </div>

      <div className="rounded-xl overflow-hidden border border-gray-800 bg-gray-950">
        <div className="h-1.5" style={{ backgroundColor: caseFile.cover_color }} />
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white leading-tight">{caseFile.title}</h1>
              {caseFile.description && (
                <p className="text-sm text-gray-400 mt-1 leading-relaxed">{caseFile.description}</p>
              )}
            </div>
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex-shrink-0"
              title="Edit case file"
            >
              <Edit3 className="w-3 h-3" />
              <span className="hidden sm:inline">Edit</span>
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 mt-3">
            <span className="flex items-center gap-1">
              <FolderOpen className="w-3 h-3" />
              {entries.length} {entries.length === 1 ? 'save' : 'saves'}
            </span>
            {scopedInsights.length > 0 && (
              <span className="flex items-center gap-1 text-cyan-300/80">
                <SparklesIcon className="w-3 h-3" />
                {scopedInsights.length} pattern{scopedInsights.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Scoped insights — up to 2 pattern cards, same component used by
          the top-of-Saves Patterns lane for visual consistency. */}
      {scopedInsights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {scopedInsights.slice(0, 2).map(ins => (
            <PatternCard
              key={ins.id}
              kind="insight"
              insight={ins}
              onHighlight={ids => {
                const e = entries.find(en => en.id === ids[0])
                if (e) onSelectEntry(e)
              }}
            />
          ))}
        </div>
      )}

      {/* Toolbar (only if there are entries to filter) */}
      {caseEntries.length > 0 && (
        <LabToolbar
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          searchPlaceholder={'Search within "' + caseFile.title + '"...'}
          totalCount={caseEntries.length}
          filteredCount={entries.length}
        />
      )}

      {/* Entry list */}
      {caseEntries.length === 0 ? (
        <CaseFileEmptyState caseFile={caseFile} />
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-6 text-center">
          <p className="text-sm text-gray-400">
            No saves match &ldquo;{search}&rdquo; in this case file.
          </p>
        </div>
      ) : (
        <ConstellationListView
          userMapData={scopedMapData}
          aiConnections={aiConnections}
          insights={scopedInsights}
          selectedCategory={null}
          selectedCaseFileId={null}
          selectedEntryId={selectedEntry?.id || null}
          onSelectEntry={onSelectEntry}
          onHighlight={ids => {
            const e = entries.find(en => en.id === ids[0])
            if (e) onSelectEntry(e)
          }}
          entriesOverride={entries}
          viewMode={viewMode}
          hideInterleavedInsights
        />
      )}

      {/* Detail panel floats over the viewport when a star is selected */}
      {selectedEntry && (
        <NodeDetailPanel
          entry={selectedEntry}
          userMapData={userMapData}
          aiConnections={aiConnections}
          caseFiles={caseFiles}
          onClose={() => onSelectEntry(null)}
          onTagClick={() => {}}
          onEntryClick={(entryId: string) => {
            const e = userMapData?.entryNodes.find(en => en.id === entryId)
            if (e) onSelectEntry(e)
          }}
          onCaseFilesChanged={onRefresh}
        />
      )}
    </div>
  )
}

// ── Empty states ──

function CasesEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-8 sm:p-12 text-center">
      <div className="inline-flex p-3 bg-primary-500/10 rounded-full mb-3">
        <FolderOpen className="w-6 h-6 text-primary-400" />
      </div>
      <h3 className="text-base font-semibold text-white mb-1">
        No case files yet
      </h3>
      <p className="text-sm text-gray-400 max-w-sm mx-auto mb-5 leading-relaxed">
        Case files let you group saves into focused investigations — &ldquo;Skinwalker Ranch,&rdquo;
        &ldquo;Arizona Wave,&rdquo; or whatever thread you&apos;re pulling. Invite collaborators to co-investigate.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Create your first case file
      </button>
    </div>
  )
}

function CaseFileEmptyState({ caseFile }: { caseFile: CaseFile }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-800 bg-gray-950/50 p-6 sm:p-8 text-center">
      <div className="text-xs text-gray-500 mb-2">
        <span
          className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: caseFile.cover_color }}
        />
        {caseFile.title}
      </div>
      <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
        This case file doesn't have any saves yet.
        Open any save's detail view and tap <span className="text-gray-300">Add to case file</span> to start building the investigation.
      </p>
      <Link
        href="/lab?tab=saves"
        className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-lg text-xs font-medium text-primary-300 bg-primary-500/10 border border-primary-500/20 hover:bg-primary-500/20 transition-colors"
      >
        <Compass className="w-3 h-3" />
        Go to your saves
      </Link>
    </div>
  )
}

function CasesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-32 rounded bg-gray-800 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
            <div className="h-2 bg-gray-800" />
            <div className="h-24 bg-gray-900 animate-pulse" />
            <div className="p-3 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-800 animate-pulse" />
              <div className="h-3 w-full rounded bg-gray-800/60 animate-pulse" />
              <div className="h-3 w-16 rounded bg-gray-800/60 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Edit modal (rename/recolor/delete) ──

function EditCaseFileModal({
  caseFile,
  onClose,
  onSaved,
  onDeleted,
}: {
  caseFile: CaseFile
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [title, setTitle] = useState(caseFile.title)
  const [description, setDescription] = useState(caseFile.description || '')
  const [color, setColor] = useState(caseFile.cover_color)
  // Track public state locally so the toggle feels instant, but treat the
  // slug as server-owned (we only know the slug after save).
  const [isPublic, setIsPublic] = useState<boolean>(!!caseFile.public_slug)
  const [publicSlug, setPublicSlug] = useState<string | null>(caseFile.public_slug || null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const publicUrl = publicSlug
    ? (typeof window !== 'undefined' ? window.location.origin : 'https://beta.discoverparadocs.com') + '/cases/public/' + publicSlug
    : null

  const handleCopyLink = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  const handleSave = async () => {
    const t = title.trim()
    if (!t) { setError('Title cannot be empty'); return }
    setSaving(true); setError(null)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) throw new Error('Sign in expired')
      // Only send make_public when it's actually changed from the stored state —
      // avoids regenerating the slug every time the modal is saved.
      const body: Record<string, unknown> = {
        title: t,
        description: description.trim(),
        cover_color: color,
      }
      const wasPublic = !!caseFile.public_slug
      if (isPublic !== wasPublic) body.make_public = isPublic
      const res = await fetch('/api/constellation/case-files/' + caseFile.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Update failed' }))
        throw new Error(err.error || 'Update failed')
      }
      const data = await res.json().catch(() => ({}))
      if (data?.case_file?.public_slug !== undefined) {
        setPublicSlug(data.case_file.public_slug || null)
      }
      onSaved()
    } catch (err: any) {
      setError(err?.message || 'Something went wrong')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true); setError(null)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) throw new Error('Sign in expired')
      const res = await fetch('/api/constellation/case-files/' + caseFile.id, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }))
        throw new Error(err.error || 'Delete failed')
      }
      onDeleted()
    } catch (err: any) {
      setError(err?.message || 'Could not delete')
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Edit case file</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">Name</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/50 transition-colors resize-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block">Cover color</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map(c => {
                const active = c === color
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={classNames(
                      'w-9 h-9 rounded-md border transition-all',
                      active ? 'border-white/50 scale-110' : 'border-white/10 hover:border-white/30'
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={'Pick color ' + c}
                  >
                    {active && <span className="block w-2 h-2 rounded-full bg-white mx-auto" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Collaborators section */}
          <div className="pt-2 border-t border-white/5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block flex items-center gap-1">
              <Users className="w-3 h-3" />
              Collaborators
            </label>
            <CollaboratorsSection caseFileId={caseFile.id} />
          </div>

          {/* Public sharing section */}
          <div className="pt-2 border-t border-white/5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 block flex items-center gap-1">
              <Share2 className="w-3 h-3" />
              Sharing
            </label>
            <button
              type="button"
              onClick={() => setIsPublic(v => !v)}
              className={classNames(
                'w-full flex items-start gap-2 p-3 rounded-lg border text-left transition-colors',
                isPublic
                  ? 'bg-primary-500/10 border-primary-500/30'
                  : 'bg-white/[0.03] border-white/10 hover:border-white/20'
              )}
              aria-pressed={isPublic}
            >
              <div className={classNames(
                'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center mt-0.5 transition-colors',
                isPublic ? 'bg-primary-500 border-primary-500' : 'border-white/20'
              )}>
                {isPublic && <Check className="w-3 h-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                  {isPublic ? <Globe className="w-3 h-3 text-primary-300" /> : <Lock className="w-3 h-3 text-gray-500" />}
                  <span>{isPublic ? 'Share publicly' : 'Keep private'}</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
                  {isPublic
                    ? 'Anyone with the link can view this case file, its saves, and your descriptions. Your private notes stay hidden.'
                    : 'Only you can see this case file. Toggle on to get a shareable link.'}
                </p>
              </div>
            </button>

            {/* Copy-link affordance appears once the slug is live on the server */}
            {publicUrl && isPublic && (
              <div className="mt-2 flex items-center gap-1.5 p-2 rounded-lg bg-black/40 border border-white/5">
                <input
                  readOnly
                  value={publicUrl}
                  onFocus={e => e.currentTarget.select()}
                  className="flex-1 bg-transparent text-[11px] text-gray-300 font-mono focus:outline-none truncate"
                  aria-label="Public link"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={classNames(
                    'flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                    copied ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-gray-300 hover:bg-white/10'
                  )}
                  aria-label="Copy public link"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-800 px-4 py-3 flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={saving || deleting}
            className={classNames(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
              confirmDelete
                ? 'text-white bg-red-600 hover:bg-red-500'
                : 'text-red-400 hover:bg-red-500/10'
            )}
          >
            {deleting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Trash2 className="w-3.5 h-3.5" />}
            {deleting ? 'Deleting...' : confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
          {error && <span className="text-[10px] text-red-400 flex-1 truncate">{error}</span>}
          {!error && <div className="flex-1" />}
          <button
            onClick={onClose}
            disabled={saving || deleting}
            className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || deleting || !title.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-colors disabled:opacity-40"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {!saving && <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Collaborators section (inside EditCaseFileModal)
// ─────────────────────────────────────────────────────────────────

interface Collaborator {
  id: string
  role: 'owner' | 'editor' | 'viewer'
  status: 'accepted' | 'pending'
  pendingEmail: string | null
  user: {
    id: string
    displayName: string | null
    username: string | null
    avatarUrl: string | null
  } | null
}

function CollaboratorsSection({ caseFileId }: { caseFileId: string }) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [acceptLink, setAcceptLink] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) return
      const res = await fetch('/api/constellation/case-files/' + caseFileId + '/collaborators', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setCollaborators(data.collaborators || [])
      }
    } catch (err) {
      console.error('[collaborators:load]', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [caseFileId])

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    setInviting(true); setInviteError(null); setInviteSuccess(null); setAcceptLink(null)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) throw new Error('Sign in expired')
      const res = await fetch('/api/constellation/case-files/' + caseFileId + '/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, role: inviteRole }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Invite failed' }))
        throw new Error(err.error || 'Invite failed')
      }
      const data = await res.json()
      setInviteEmail('')
      if (data.emailStatus === 'sent') {
        setInviteSuccess('Invite emailed to ' + email)
      } else if (data.emailStatus === 'skipped_no_resend') {
        setInviteSuccess('Invite created. Email not sent (Resend not configured).')
        if (data.acceptUrl) setAcceptLink(data.acceptUrl)
      } else {
        setInviteSuccess('Invite created, but email delivery failed.')
        if (data.acceptUrl) setAcceptLink(data.acceptUrl)
      }
      await load()
    } catch (err: any) {
      setInviteError(err?.message || 'Something went wrong')
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (cid: string) => {
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) return
      await fetch(
        '/api/constellation/case-files/' + caseFileId + '/collaborators?cid=' + cid,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      )
      await load()
    } catch (err) {
      console.error('[collaborators:remove]', err)
    }
  }

  const handleRoleChange = async (cid: string, role: 'editor' | 'viewer') => {
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) return
      await fetch(
        '/api/constellation/case-files/' + caseFileId + '/collaborators?cid=' + cid,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ role }),
        }
      )
      await load()
    } catch (err) {
      console.error('[collaborators:role]', err)
    }
  }

  return (
    <div className="space-y-2">
      {/* Existing collaborators */}
      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading collaborators...
        </div>
      ) : collaborators.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic">
          No collaborators yet. Invite someone to co-investigate this case file.
        </p>
      ) : (
        <ul className="space-y-1">
          {collaborators.map(c => (
            <li key={c.id} className="flex items-center gap-2 p-2 rounded-md bg-white/[0.03] border border-white/5">
              <div className="flex-shrink-0">
                {c.user?.avatarUrl ? (
                  <img src={c.user.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center">
                    <Mail className="w-3 h-3 text-gray-500" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white truncate">
                  {c.user?.displayName || c.user?.username || c.pendingEmail}
                </div>
                <div className="text-[10px] text-gray-500">
                  {c.status === 'pending' ? 'Pending · ' : ''}{c.role}
                </div>
              </div>
              <select
                value={c.role}
                onChange={e => handleRoleChange(c.id, e.target.value as 'editor' | 'viewer')}
                disabled={c.role === 'owner'}
                className="text-[10px] bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-gray-300 focus:outline-none focus:border-primary-500/50 disabled:opacity-40"
                aria-label="Change role"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button
                onClick={() => handleRemove(c.id)}
                className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                title="Remove collaborator"
                aria-label="Remove collaborator"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Invite by email */}
      <div className="flex items-center gap-1.5 mt-2">
        <input
          type="email"
          value={inviteEmail}
          onChange={e => setInviteEmail(e.target.value)}
          placeholder="collaborator@example.com"
          className="flex-1 px-2 py-1.5 bg-gray-900 border border-gray-800 rounded-md text-xs text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50"
        />
        <select
          value={inviteRole}
          onChange={e => setInviteRole(e.target.value as 'editor' | 'viewer')}
          className="text-[11px] bg-gray-900 border border-gray-800 rounded-md px-1.5 py-1.5 text-gray-300 focus:outline-none focus:border-primary-500/50"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button
          type="button"
          onClick={handleInvite}
          disabled={inviting || !inviteEmail.trim()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-white bg-primary-600 hover:bg-primary-500 transition-colors disabled:opacity-40"
        >
          {inviting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Invite
        </button>
      </div>
      {inviteError && <p className="text-[10px] text-red-400">{inviteError}</p>}
      {inviteSuccess && <p className="text-[10px] text-emerald-400">{inviteSuccess}</p>}
      {acceptLink && (
        <div className="flex items-center gap-1.5 p-1.5 rounded bg-black/40 border border-white/5">
          <input
            readOnly
            value={acceptLink}
            onFocus={e => e.currentTarget.select()}
            className="flex-1 bg-transparent text-[10px] text-gray-300 font-mono focus:outline-none truncate"
          />
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(acceptLink); setAcceptLink(null) }}
            className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-gray-300 hover:bg-white/10"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  )
}
