'use client'

import dynamic from 'next/dynamic'
import type {
  ConstellationArtifact,
  CaseFile,
  AiInsight,
} from '@/lib/database.types'

interface MapViewProps {
  artifacts: ConstellationArtifact[]
  caseFiles: CaseFile[]
  caseFileArtifactMap: Record<string, string[]>
  insights: AiInsight[]
  activeCaseFileId: string | null
  onSelectArtifact: (artifact: ConstellationArtifact) => void
  onAddArtifact: () => void
}

const MapViewInner = dynamic(
  () => import('./MapViewInner').then((mod) => mod.MapViewInner),
  { ssr: false }
)

export function MapView(props: MapViewProps) {
  return <MapViewInner {...props} />
}
