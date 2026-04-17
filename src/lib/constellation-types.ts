/**
 * Shared types for the constellation visualization.
 *
 * Extracted from src/pages/dashboard/constellation.tsx so that the canvas
 * renderer, force simulation, detail panel, and connection/theory drawers
 * don't depend on a page file. The page at /dashboard/constellation is now
 * a redirect stub; the live surface lives at /lab?tab=map.
 */

/** A logged constellation entry (one star on the map). */
export interface EntryNode {
  id: string
  reportId: string
  name: string
  slug: string
  category: string
  imageUrl: string | null
  locationName: string | null
  eventDate: string | null
  summary: string | null
  note: string
  verdict: string
  tags: string[]
  loggedAt: string
  updatedAt: string
}

/** A user-drawn connection between two entries. */
export interface ConnectionData {
  id: string
  entryAId: string
  entryBId: string
  annotation: string
  createdAt?: string
}

/** A user-authored theory built from entries and connections. */
export interface TheoryData {
  id: string
  title: string
  thesis: string
  entry_ids: string[]
  connection_ids: string[]
  is_public: boolean
  created_at: string
  updated_at: string
}

/** Full payload returned by GET /api/constellation/user-map. */
export interface UserMapData {
  entryNodes: EntryNode[]
  categoryStats: Record<string, { entries: number; verdicts: Record<string, number> }>
  tagConnections: Array<{ tag: string; entryIds: string[] }>
  trail: Array<{ entryId: string; reportId: string; category: string; timestamp: string }>
  userConnections?: ConnectionData[]
  userTheories?: TheoryData[]
  stats: {
    totalEntries: number
    totalPhenomena: number
    categoriesExplored: number
    totalCategories: number
    uniqueTags: number
    notesWritten: number
    connectionsFound: number
    drawnConnections?: number
    theoryCount?: number
    currentStreak: number
    longestStreak: number
    rank: string
    rankLevel: number
  }
}
