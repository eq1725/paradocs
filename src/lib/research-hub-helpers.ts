import type {
  ConstellationArtifact,
  CaseFile,
  ArtifactSourceType,
  ArtifactVerdict,
  ConnectionRelationshipType,
} from '@/lib/database.types'

export const SOURCE_TYPE_CONFIG: Record<
  ArtifactSourceType,
  { label: string; icon: string; color: string; bgColor: string }
> = {
  paradocs_report: {
    label: 'Paradocs Report',
    icon: 'FileText',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/20',
  },
  youtube: {
    label: 'YouTube',
    icon: 'Play',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
  },
  reddit: {
    label: 'Reddit',
    icon: 'MessageCircle',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
  },
  twitter: {
    label: 'X.com',
    icon: 'Twitter',
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/20',
  },
  tiktok: {
    label: 'TikTok',
    icon: 'Music',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/20',
  },
  instagram: {
    label: 'Instagram',
    icon: 'Camera',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/20',
  },
  podcast: {
    label: 'Podcast',
    icon: 'Headphones',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
  },
  news: {
    label: 'News',
    icon: 'Newspaper',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  archive: {
    label: 'Archive.org',
    icon: 'Archive',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
  },
  vimeo: {
    label: 'Vimeo',
    icon: 'Play',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
  },
  rumble: {
    label: 'Rumble',
    icon: 'Video',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
  },
  substack: {
    label: 'Substack',
    icon: 'BookOpen',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
  },
  medium: {
    label: 'Medium',
    icon: 'PenTool',
    color: 'text-white',
    bgColor: 'bg-gray-600/20',
  },
  wikipedia: {
    label: 'Wikipedia',
    icon: 'BookOpen',
    color: 'text-gray-300',
    bgColor: 'bg-gray-500/20',
  },
  website: {
    label: 'Website',
    icon: 'Globe',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
  },
  other: {
    label: 'Other',
    icon: 'Link',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
  },
}

export const VERDICT_CONFIG: Record<
  ArtifactVerdict,
  { label: string; color: string; bgColor: string; dotColor: string }
> = {
  compelling: {
    label: 'Compelling',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    dotColor: 'bg-amber-400',
  },
  inconclusive: {
    label: 'Inconclusive',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    dotColor: 'bg-blue-400',
  },
  skeptical: {
    label: 'Skeptical',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
    dotColor: 'bg-gray-400',
  },
  needs_info: {
    label: 'Needs Info',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    dotColor: 'bg-purple-400',
  },
}

export const RELATIONSHIP_CONFIG: Record<
  ConnectionRelationshipType,
  { label: string; color: string; icon: string }
> = {
  same_witness: { label: 'Same Witness', color: 'text-white', icon: 'User' },
  same_location: { label: 'Same Location', color: 'text-green-400', icon: 'MapPin' },
  same_timeframe: { label: 'Same Timeframe', color: 'text-blue-400', icon: 'Clock' },
  contradicts: { label: 'Contradicts', color: 'text-red-400', icon: 'X' },
  corroborates: { label: 'Corroborates', color: 'text-amber-400', icon: 'Check' },
  related: { label: 'Related', color: 'text-gray-400', icon: 'Link' },
  custom: { label: 'Custom', color: 'text-gray-400', icon: 'Edit3' },
}

export interface GroupedArtifacts {
  caseFileId: string | null
  caseFile: CaseFile | null
  artifacts: ConstellationArtifact[]
}

export function groupArtifactsByCaseFile(
  artifacts: ConstellationArtifact[],
  caseFiles: CaseFile[],
  junctionData: Array<{ case_file_id: string; artifact_id: string; sort_order: number }>
): GroupedArtifacts[] {
  // Create a map for quick lookup of junction data
  const artifactToCaseFileMap = new Map<string, string[]>()

  junctionData.forEach(junction => {
    const existing = artifactToCaseFileMap.get(junction.artifact_id) || []
    artifactToCaseFileMap.set(junction.artifact_id, [...existing, junction.case_file_id])
  })

  // Create result groups for each case file
  const groupedMap = new Map<string, GroupedArtifacts>()

  caseFiles.forEach(caseFile => {
    groupedMap.set(caseFile.id, {
      caseFileId: caseFile.id,
      caseFile,
      artifacts: [],
    })
  })

  // Assign artifacts to their case files
  artifacts.forEach(artifact => {
    const caseFileIds = artifactToCaseFileMap.get(artifact.id) || []

    caseFileIds.forEach(caseFileId => {
      const group = groupedMap.get(caseFileId)
      if (group) {
        group.artifacts.push(artifact)
      }
    })
  })

  return Array.from(groupedMap.values()).filter(group => group.artifacts.length > 0)
}

export function getUnsortedArtifacts(
  artifacts: ConstellationArtifact[],
  junctionData: Array<{ artifact_id: string }>
): ConstellationArtifact[] {
  const sortedArtifactIds = new Set(junctionData.map(j => j.artifact_id))

  return artifacts.filter(artifact => !sortedArtifactIds.has(artifact.id))
}
