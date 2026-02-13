/**
 * Journal Service
 *
 * CRUD operations for investigation journal entries.
 * Entries support structured fields (hypothesis, evidence, conclusions)
 * plus freeform markdown body, with report linking and tagging.
 */

import { supabase } from '@/lib/supabase'
import { PhenomenonCategory } from '@/lib/database.types'

export type JournalEntryType =
  | 'observation'
  | 'hypothesis'
  | 'evidence_review'
  | 'field_note'
  | 'connection'
  | 'freeform'

export interface JournalEntry {
  id: string
  user_id: string
  title: string
  entry_type: JournalEntryType
  body: string
  hypothesis: string | null
  evidence_notes: string | null
  conclusions: string | null
  linked_report_ids: string[]
  linked_categories: string[]
  tags: string[]
  is_private: boolean
  created_at: string
  updated_at: string
}

export interface JournalEntryCreate {
  title: string
  entry_type: JournalEntryType
  body?: string
  hypothesis?: string | null
  evidence_notes?: string | null
  conclusions?: string | null
  linked_report_ids?: string[]
  linked_categories?: string[]
  tags?: string[]
  is_private?: boolean
}

export interface JournalEntryUpdate extends Partial<JournalEntryCreate> {
  id: string
}

export interface JournalListOptions {
  page?: number
  limit?: number
  entry_type?: JournalEntryType
  search?: string
  tag?: string
  category?: PhenomenonCategory
}

export const ENTRY_TYPE_CONFIG: Record<JournalEntryType, {
  label: string
  icon: string
  color: string
  bgColor: string
  description: string
  fields: string[]
}> = {
  observation: {
    label: 'Observation',
    icon: '👁️',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    description: 'Record something you noticed or witnessed',
    fields: ['body'],
  },
  hypothesis: {
    label: 'Hypothesis',
    icon: '💡',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    description: 'Propose an explanation and track evidence',
    fields: ['hypothesis', 'evidence_notes', 'conclusions', 'body'],
  },
  evidence_review: {
    label: 'Evidence Review',
    icon: '🔍',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    description: 'Analyze evidence from one or more reports',
    fields: ['body', 'conclusions'],
  },
  field_note: {
    label: 'Field Note',
    icon: '📋',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    description: 'Quick notes from research or investigation',
    fields: ['body'],
  },
  connection: {
    label: 'Connection',
    icon: '🔗',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    description: 'Document a link between phenomena or cases',
    fields: ['body', 'conclusions'],
  },
  freeform: {
    label: 'Freeform',
    icon: '📝',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
    description: 'Open-ended research notes',
    fields: ['body'],
  },
}

/**
 * List journal entries with pagination, filtering, and search
 */
export async function listEntries(options: JournalListOptions = {}): Promise<{
  entries: JournalEntry[]
  total: number
}> {
  const { page = 1, limit = 10, entry_type, search, tag, category } = options

  let query = supabase
    .from('journal_entries' as any)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (entry_type) {
    query = query.eq('entry_type', entry_type)
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%,hypothesis.ilike.%${search}%,conclusions.ilike.%${search}%`)
  }

  if (tag) {
    query = query.contains('tags' as any, [tag])
  }

  if (category) {
    query = query.contains('linked_categories' as any, [category])
  }

  const { data, count, error } = await query as any

  if (error) {
    console.error('Error listing journal entries:', error)
    return { entries: [], total: 0 }
  }

  return {
    entries: (data || []) as JournalEntry[],
    total: count || 0,
  }
}

/**
 * Get a single journal entry by ID
 */
export async function getEntry(id: string): Promise<JournalEntry | null> {
  const { data, error } = await supabase
    .from('journal_entries' as any)
    .select('*')
    .eq('id', id)
    .single() as any

  if (error) {
    console.error('Error fetching journal entry:', error)
    return null
  }

  return data as JournalEntry
}

/**
 * Create a new journal entry
 */
export async function createEntry(entry: JournalEntryCreate): Promise<JournalEntry | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null

  const { data, error } = await (supabase
    .from('journal_entries' as any) as any)
    .insert({
      user_id: session.user.id,
      title: entry.title,
      entry_type: entry.entry_type,
      body: entry.body || '',
      hypothesis: entry.hypothesis || null,
      evidence_notes: entry.evidence_notes || null,
      conclusions: entry.conclusions || null,
      linked_report_ids: entry.linked_report_ids || [],
      linked_categories: entry.linked_categories || [],
      tags: entry.tags || [],
      is_private: entry.is_private !== false,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating journal entry:', error)
    return null
  }

  return data as JournalEntry
}

/**
 * Update an existing journal entry
 */
export async function updateEntry(entry: JournalEntryUpdate): Promise<JournalEntry | null> {
  const { id, ...updates } = entry

  const { data, error } = await (supabase
    .from('journal_entries' as any) as any)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating journal entry:', error)
    return null
  }

  return data as JournalEntry
}

/**
 * Delete a journal entry
 */
export async function deleteEntry(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('journal_entries' as any)
    .delete()
    .eq('id', id) as any

  if (error) {
    console.error('Error deleting journal entry:', error)
    return false
  }

  return true
}

/**
 * Get the total journal entry count for current user
 */
export async function getEntryCount(): Promise<number> {
  const { count } = await supabase
    .from('journal_entries' as any)
    .select('*', { count: 'exact', head: true }) as any

  return count || 0
}
