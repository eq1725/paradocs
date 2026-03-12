import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ConstellationArtifact, ArtifactSourceType, ArtifactVerdict } from '@/lib/database.types'

interface UseArtifactActionsReturn {
  saving: boolean
  error: string | null
  saveReport(
    reportId: string,
    data: {
      user_note?: string
      verdict?: ArtifactVerdict
      tags?: string[]
      case_file_id?: string
    }
  ): Promise<ConstellationArtifact | null>
  saveExternalUrl(
    data: {
      external_url: string
      source_type: ArtifactSourceType
      title: string
      thumbnail_url?: string
      source_platform?: string
      user_note?: string
      verdict?: ArtifactVerdict
      tags?: string[]
      case_file_id?: string
    }
  ): Promise<ConstellationArtifact | null>
  updateArtifact(
    id: string,
    data: Partial<{
      user_note: string
      verdict: ArtifactVerdict
      tags: string[]
    }>
  ): Promise<boolean>
  deleteArtifact(id: string): Promise<boolean>
}

export function useArtifactActions(
  onMutate?: (action: 'add' | 'update' | 'delete', artifact: ConstellationArtifact) => void
): UseArtifactActionsReturn {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    return {
      'Authorization': 'Bearer ' + session.access_token,
      'Content-Type': 'application/json',
    }
  }, [])

  const saveReport = useCallback(
    async (
      reportId: string,
      data: {
        user_note?: string
        verdict?: ArtifactVerdict
        tags?: string[]
        case_file_id?: string
      }
    ): Promise<ConstellationArtifact | null> => {
      try {
        setSaving(true)
        setError(null)

        const headers = await getAuthHeaders()
        if (!headers) {
          setError('Not authenticated')
          return null
        }

        const response = await fetch('/api/research-hub/artifacts', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            report_id: reportId,
            ...data,
            source_type: 'paradocs_report',
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to save report as artifact')
        }

        const artifact = await response.json()
        onMutate?.('add', artifact)
        return artifact
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to save report'
        setError(errorMsg)
        return null
      } finally {
        setSaving(false)
      }
    },
    [getAuthHeaders, onMutate]
  )

  const saveExternalUrl = useCallback(
    async (data: {
      external_url: string
      source_type: ArtifactSourceType
      title: string
      thumbnail_url?: string
      source_platform?: string
      user_note?: string
      verdict?: ArtifactVerdict
      tags?: string[]
      case_file_id?: string
    }): Promise<ConstellationArtifact | null> => {
      try {
        setSaving(true)
        setError(null)

        const headers = await getAuthHeaders()
        if (!headers) {
          setError('Not authenticated')
          return null
        }

        const response = await fetch('/api/research-hub/artifacts', {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
        })

        if (!response.ok) {
          throw new Error('Failed to save external URL as artifact')
        }

        const artifact = await response.json()
        onMutate?.('add', artifact)
        return artifact
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to save external URL'
        setError(errorMsg)
        return null
      } finally {
        setSaving(false)
      }
    },
    [getAuthHeaders, onMutate]
  )

  const updateArtifact = useCallback(
    async (
      id: string,
      data: Partial<{
        user_note: string
        verdict: ArtifactVerdict
        tags: string[]
      }>
    ): Promise<boolean> => {
      try {
        setSaving(true)
        setError(null)

        const headers = await getAuthHeaders()
        if (!headers) {
          setError('Not authenticated')
          return false
        }

        const response = await fetch('/api/research-hub/artifacts/' + id, {
          method: 'PUT',
          headers,
          body: JSON.stringify(data),
        })

        if (!response.ok) {
          throw new Error('Failed to update artifact')
        }

        const artifact = await response.json()
        onMutate?.('update', artifact)
        return true
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update artifact'
        setError(errorMsg)
        return false
      } finally {
        setSaving(false)
      }
    },
    [getAuthHeaders, onMutate]
  )

  const deleteArtifact = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        setSaving(true)
        setError(null)

        const headers = await getAuthHeaders()
        if (!headers) {
          setError('Not authenticated')
          return false
        }

        const response = await fetch('/api/research-hub/artifacts?id=' + id, {
          method: 'DELETE',
          headers,
        })

        if (!response.ok) {
          throw new Error('Failed to delete artifact')
        }

        onMutate?.('delete', { id } as ConstellationArtifact)
        return true
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to delete artifact'
        setError(errorMsg)
        return false
      } finally {
        setSaving(false)
      }
    },
    [getAuthHeaders, onMutate]
  )

  return {
    saving,
    error,
    saveReport,
    saveExternalUrl,
    updateArtifact,
    deleteArtifact,
  }
}
