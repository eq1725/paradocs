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
  // Optional: only set on user-added external artifacts (YouTube, Reddit, etc.).
  // Absent for Paradocs-curated report entries. Empty string / null at the
  // API level for externals where we have no report_id / slug.
  sourceType?: string
  sourcePlatform?: string | null
  externalUrl?: string | null
  // Everything the extract endpoint captured at save time — description,
  // oembed_html, author, published_date, and anything else stashed in
  // constellation_artifacts.metadata_json. Used by NodeDetailPanel for
  // platform-specific rendering (embedded players, summary text, etc.).
  sourceMetadata?: Record<string, any> | null
  // True for preview / teaser nodes rendered when the user has <5 real
  // saves. The canvas dims these and the hit-tester skips them so taps
  // on a ghost don't open a detail panel.
  isGhost?: boolean
  // For external artifacts this is the constellation_artifacts row id —
  // required for case file linkage. Paradocs-report entries don't expose
  // this yet (follow-up: unify the save flow).
  artifactId?: string
  /** Case files this entry belongs to, by id. Empty array if none. */
  caseFileIds?: string[]
  /** Count of OTHER researchers who saved the same URL (externals only). */
  communitySaveCount?: number
  /**
   * True when this node was folded in from the legacy saved_reports table
   * (the old "bookmark" button) and doesn't have a constellation_entry yet.
   * Surfaces as a "Bookmarked" badge in the UI — users can upgrade to a
   * richer logged entry by adding a verdict / note / tags.
   */
  isLegacyBookmark?: boolean
  /** Optional geo coordinates (from reports.latitude / longitude). Used by LabGeoMap for pins. */
  latitude?: number | null
  longitude?: number | null
}

/** A user-created case file — the "folder" primitive for investigations. */
export interface CaseFile {
  id: string
  title: string
  description: string | null
  cover_color: string
  icon: string
  sort_order: number
  artifact_count: number
  created_at: string
  updated_at: string
  /** When non-null, this case file is publicly viewable at /cases/public/{slug}. */
  public_slug?: string | null
  /** True when the user is a collaborator, not the owner, of this case file. */
  is_shared_with_me?: boolean
  /** Role the current user has on this case file. */
  role?: 'owner' | 'editor' | 'viewer'
  /** Owner profile info — only populated for shared case files. */
  owner?: {
    displayName: string | null
    username: string | null
    avatarUrl: string | null
  } | null
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
  caseFiles?: CaseFile[]
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
