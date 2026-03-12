import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  ConstellationArtifact,
  CaseFile,
  ConstellationConnection,
  AiInsight,
  ResearchHubView,
} from '@/lib/database.types'

interface CaseFileWithCount extends CaseFile {
  artifact_count: number
}

interface HubStats {
  totalArtifacts: number
  totalCaseFiles: number
  totalConnections: number
  activeInsights: number
  categoriesExplored: number
}

interface ResearchHubData {
  artifacts: ConstellationArtifact[]
  caseFiles: CaseFileWithCount[]
  connections: ConstellationConnection[]
  insights: AiInsight[]
  stats: HubStats
  loading: boolean
  error: string | null
}

export function useResearchHub(initialView: ResearchHubView = 'board'): ResearchHubData & {
  currentView: ResearchHubView
  setView: (view: ResearchHubView) => void
  addArtifact: (data: Partial<ConstellationArtifact>) => Promise<ConstellationArtifact | null>
  removeArtifact: (id: string) => Promise<boolean>
  updateArtifact: (id: string, data: Partial<ConstellationArtifact>) => Promise<boolean>
  addCaseFile: (data: Partial<CaseFile>) => Promise<CaseFile | null>
  updateCaseFile: (id: string, data: Partial<CaseFile>) => Promise<boolean>
  removeCaseFile: (id: string) => Promise<boolean>
  addArtifactToCaseFile: (caseFileId: string, artifactId: string) => Promise<boolean>
  removeArtifactFromCaseFile: (caseFileId: string, artifactId: string) => Promise<boolean>
  addConnection: (data: Partial<ConstellationConnection>) => Promise<ConstellationConnection | null>
  removeConnection: (id: string) => Promise<boolean>
  dismissInsight: (id: string) => Promise<boolean>
  rateInsight: (id: string, helpful: boolean) => Promise<boolean>
  refresh: () => Promise<void>
} {
  const [artifacts, setArtifacts] = useState<ConstellationArtifact[]>([])
  const [caseFiles, setCaseFiles] = useState<CaseFileWithCount[]>([])
  const [connections, setConnections] = useState<ConstellationConnection[]>([])
  const [insights, setInsights] = useState<AiInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentView, setCurrentViewState] = useState<ResearchHubView>(initialView)

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    return {
      'Authorization': 'Bearer ' + session.access_token,
      'Content-Type': 'application/json',
    }
  }, [])

  const calculateStats = useCallback((
    arts: ConstellationArtifact[],
    cfs: CaseFileWithCount[],
    conns: ConstellationConnection[],
    ins: AiInsight[]
  ): HubStats => {
    return {
      totalArtifacts: arts.length,
      totalCaseFiles: cfs.length,
      totalConnections: conns.length,
      activeInsights: ins.filter(i => !i.dismissed).length,
      categoriesExplored: cfs.length,
    }
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const headers = await getAuthHeaders()
      if (!headers) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const queryParams = new URLSearchParams({ view: currentView })
      const response = await fetch('/api/research-hub/hub-data?' + queryParams.toString(), {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        throw new Error('Failed to fetch research hub data')
      }

      const data = await response.json()

      // hub-data returns artifacts as an object grouped by case file for board view,
      // but we need a flat array. Normalize it here.
      var rawArtifacts = data.artifacts || []
      var caseFileArtifactsMap: Record<string, any[]> = {}
      if (!Array.isArray(rawArtifacts)) {
        // Board view format: { [caseFileId]: { caseFile, artifacts: [...] }, unsorted: { ... } }
        var flatList: any[] = []
        var seen = new Set<string>()
        Object.entries(rawArtifacts).forEach(function(entry: any) {
          var key = entry[0]
          var group = entry[1]
          if (group && Array.isArray(group.artifacts)) {
            if (key !== 'unsorted') {
              caseFileArtifactsMap[key] = group.artifacts
            }
            group.artifacts.forEach(function(a: any) {
              if (!seen.has(a.id)) {
                seen.add(a.id)
                flatList.push(a)
              }
            })
          }
        })
        rawArtifacts = flatList
      }

      setArtifacts(rawArtifacts)
      // Enrich case files with their artifacts so BoardView can render them
      var enrichedCaseFiles = (data.caseFiles || []).map(function(cf: any) {
        var cfArtifacts = caseFileArtifactsMap[cf.id] || []
        return Object.assign({}, cf, {
          artifact_count: cfArtifacts.length,
          artifacts: cfArtifacts
        })
      })
      console.log('[ResearchHub] enrichedCaseFiles:', JSON.stringify(enrichedCaseFiles.map(function(cf: any) { return { id: cf.id, title: cf.title, artifact_count: cf.artifact_count, artifactsLen: (cf.artifacts || []).length } })))
      console.log('[ResearchHub] caseFileArtifactsMap keys:', Object.keys(caseFileArtifactsMap), 'flat artifacts:', rawArtifacts.length)
      setCaseFiles(enrichedCaseFiles)
      setConnections(data.connections || [])
      setInsights(data.insights || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [currentView, getAuthHeaders])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const setView = useCallback((view: ResearchHubView) => {
    setCurrentViewState(view)
    try {
      localStorage.setItem('research-hub-view', view)
    } catch {
      // localStorage might not be available
    }
  }, [])

  // Initialize view from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('research-hub-view')
      if (stored && ['board', 'timeline', 'map', 'constellation'].includes(stored)) {
        setCurrentViewState(stored as ResearchHubView)
      }
    } catch {
      // localStorage might not be available
    }
  }, [])

  const addArtifact = useCallback(async (data: Partial<ConstellationArtifact>): Promise<ConstellationArtifact | null> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return null

      const response = await fetch('/api/research-hub/artifacts', {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      })

      if (!response.ok) throw new Error('Failed to add artifact')

      const responseData = await response.json()
      // API returns { artifact: {...}, created: true } — unwrap it
      const newArtifact = responseData.artifact || responseData
      setArtifacts(prev => [newArtifact, ...prev])
      return newArtifact
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add artifact')
      return null
    }
  }, [getAuthHeaders])

  const removeArtifact = useCallback(async (id: string): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return false

      setArtifacts(prev => prev.filter(a => a.id !== id))

      const response = await fetch('/api/research-hub/artifacts?id=' + id, {
        method: 'DELETE',
        headers,
      })

      if (!response.ok) {
        setArtifacts(prev => [...prev, artifacts.find(a => a.id === id)!])
        throw new Error('Failed to delete artifact')
      }

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete artifact')
      return false
    }
  }, [getAuthHeaders, artifacts])

  const updateArtifact = useCallback(async (id: string, data: Partial<ConstellationArtifact>): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return false

      const oldArtifact = artifacts.find(a => a.id === id)
      setArtifacts(prev => prev.map(a => a.id === id ? { ...a, ...data } : a))

      const response = await fetch('/api/research-hub/artifacts/' + id, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        if (oldArtifact) {
          setArtifacts(prev => prev.map(a => a.id === id ? oldArtifact : a))
        }
        throw new Error('Failed to update artifact')
      }

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update artifact')
      return false
    }
  }, [getAuthHeaders, artifacts])

  const addCaseFile = useCallback(async (data: Partial<CaseFile>): Promise<CaseFile | null> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return null

      const response = await fetch('/api/research-hub/case-files', {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      })

      if (!response.ok) throw new Error('Failed to add case file')

      const responseData = await response.json()
      // API returns { caseFile: {...}, created: true } — unwrap it
      const newCaseFile = responseData.caseFile || responseData
      setCaseFiles(prev => [...prev, { ...newCaseFile, artifact_count: newCaseFile.artifact_count || 0 }])
      return newCaseFile
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add case file')
      return null
    }
  }, [getAuthHeaders])

  const updateCaseFile = useCallback(async (id: string, data: Partial<CaseFile>): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return false

      const oldCaseFile = caseFiles.find(cf => cf.id === id)
      setCaseFiles(prev => prev.map(cf => cf.id === id ? { ...cf, ...data } : cf))

      const response = await fetch('/api/research-hub/case-files/' + id, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        if (oldCaseFile) {
          setCaseFiles(prev => prev.map(cf => cf.id === id ? oldCaseFile : cf))
        }
        throw new Error('Failed to update case file')
      }

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update case file')
      return false
    }
  }, [getAuthHeaders, caseFiles])

  const removeCaseFile = useCallback(async (id: string): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return false

      setCaseFiles(prev => prev.filter(cf => cf.id !== id))

      const response = await fetch('/api/research-hub/case-files?id=' + id, {
        method: 'DELETE',
        headers,
      })

      if (!response.ok) {
        setCaseFiles(prev => [...prev, caseFiles.find(cf => cf.id === id)!])
        throw new Error('Failed to delete case file')
      }

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete case file')
      return false
    }
  }, [getAuthHeaders, caseFiles])

  const addArtifactToCaseFile = useCallback(async (caseFileId: string, artifactId: string): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return false

      setCaseFiles(prev => prev.map(cf =>
        cf.id === caseFileId ? { ...cf, artifact_count: cf.artifact_count + 1 } : cf
      ))

      const response = await fetch('/api/research-hub/case-file-artifacts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ case_file_id: caseFileId, artifact_id: artifactId }),
      })

      if (!response.ok) {
        var errorBody = ''
        try { errorBody = await response.text() } catch (_e) { /* ignore */ }
        console.error('addArtifactToCaseFile failed:', response.status, errorBody)
        setCaseFiles(prev => prev.map(cf =>
          cf.id === caseFileId ? { ...cf, artifact_count: Math.max(0, cf.artifact_count - 1) } : cf
        ))
        throw new Error('Failed to add artifact to case file: ' + response.status)
      }

      return true
    } catch (err) {
      console.error('addArtifactToCaseFile error:', err)
      setError(err instanceof Error ? err.message : 'Failed to add artifact to case file')
      return false
    }
  }, [getAuthHeaders])

  const removeArtifactFromCaseFile = useCallback(async (caseFileId: string, artifactId: string): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return false

      setCaseFiles(prev => prev.map(cf =>
        cf.id === caseFileId ? { ...cf, artifact_count: Math.max(0, cf.artifact_count - 1) } : cf
      ))

      const response = await fetch('/api/research-hub/case-file-artifacts?case_file_id=' + caseFileId + '&artifact_id=' + artifactId, {
        method: 'DELETE',
        headers,
      })

      if (!response.ok) {
        setCaseFiles(prev => prev.map(cf =>
          cf.id === caseFileId ? { ...cf, artifact_count: cf.artifact_count + 1 } : cf
        ))
        throw new Error('Failed to remove artifact from case file')
      }

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove artifact from case file')
      return false
    }
  }, [getAuthHeaders])

  const addConnection = useCallback(async (data: Partial<ConstellationConnection>): Promise<ConstellationConnection | null> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return null

      const response = await fetch('/api/research-hub/connections', {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      })

      if (!response.ok) throw new Error('Failed to add connection')

      const newConnection = await response.json()
      setConnections(prev => [newConnection, ...prev])
      return newConnection
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add connection')
      return null
    }
  }, [getAuthHeaders])

  const removeConnection = useCallback(async (id: string): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return false

      setConnections(prev => prev.filter(c => c.id !== id))

      const response = await fetch('/api/research-hub/connections?id=' + id, {
        method: 'DELETE',
        headers,
      })

      if (!response.ok) {
        setConnections(prev => [...prev, connections.find(c => c.id === id)!])
        throw new Error('Failed to delete connection')
      }

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete connection')
      return false
    }
  }, [getAuthHeaders, connections])

  const dismissInsight = useCallback(async (id: string): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return false

      setInsights(prev => prev.map(i => i.id === id ? { ...i, dismissed: true } : i))

      const response = await fetch('/api/research-hub/insights/' + id + '/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({ dismissed: true }),
      })

      if (!response.ok) {
        setInsights(prev => prev.map(i => i.id === id ? { ...i, dismissed: false } : i))
        throw new Error('Failed to dismiss insight')
      }

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss insight')
      return false
    }
  }, [getAuthHeaders])

  const rateInsight = useCallback(async (id: string, helpful: boolean): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders()
      if (!headers) return false

      const response = await fetch('/api/research-hub/insights/' + id + '/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({ helpful }),
      })

      if (!response.ok) throw new Error('Failed to rate insight')

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rate insight')
      return false
    }
  }, [getAuthHeaders])

  const refresh = useCallback(async () => {
    await fetchData()
  }, [fetchData])

  const stats = calculateStats(artifacts, caseFiles, connections, insights)

  return {
    artifacts,
    caseFiles,
    connections,
    insights,
    stats,
    loading,
    error,
    currentView,
    setView,
    addArtifact,
    removeArtifact,
    updateArtifact,
    addCaseFile,
    updateCaseFile,
    removeCaseFile,
    addArtifactToCaseFile,
    removeArtifactFromCaseFile,
    addConnection,
    removeConnection,
    dismissInsight,
    rateInsight,
    refresh,
  }
}
