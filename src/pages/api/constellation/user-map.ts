import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /api/constellation/user-map
 * Returns personalized constellation data built from the user's
 * deliberately logged constellation entries (not passive views).
 * Each logged entry = a star the user chose to add.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // Parallel fetch: constellation entries, total phenomena count, streak, connections, theories, research hub artifacts, case file memberships, case files list, legacy saved_reports
    const [entriesResult, totalResult, streakResult, connectionsResult, theoriesResult, artifactsResult, caseFileLinksResult, caseFilesListResult, savedReportsResult] = await Promise.all([
      // User's logged constellation entries with report details
      supabase
        .from('constellation_entries')
        .select(`
          id,
          report_id,
          note,
          verdict,
          tags,
          created_at,
          updated_at,
          report:reports(id, title, slug, category, location_name, event_date, summary, latitude, longitude, report_media(url, media_type, is_primary))
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),

      // Total phenomena count
      supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved'),

      // User streak (if table exists)
      supabase
        .from('user_streaks' as any)
        .select('current_streak, longest_streak, total_active_days')
        .eq('user_id', user.id)
        .single(),

      // User-drawn connections
      supabase
        .from('constellation_connections')
        .select('id, entry_a_id, entry_b_id, annotation, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),

      // User theories
      supabase
        .from('constellation_theories')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false }),

      // Research Hub artifacts (external URLs not linked to reports)
      supabase
        .from('constellation_artifacts')
        .select('id, source_type, source_platform, external_url, external_url_hash, title, thumbnail_url, user_note, verdict, tags, metadata_json, created_at, updated_at')
        .eq('user_id', user.id)
        .neq('source_type', 'paradocs_report')
        .order('created_at', { ascending: false }),

      // Case file memberships: every (case_file_id, artifact_id) pair for
      // case files owned by this user. Shared-case-file junction rows are
      // fetched separately below because we're using the service-role client
      // (which bypasses RLS) and need to manually scope.
      supabase
        .from('constellation_case_file_artifacts')
        .select('case_file_id, artifact_id, case_file:constellation_case_files!inner(user_id)')
        .eq('case_file.user_id', user.id),

      // Case files list — lets the client render the CaseFileBar without a
      // second round-trip on initial load.
      supabase
        .from('constellation_case_files')
        .select('id, title, description, cover_color, icon, sort_order, public_slug, user_id, created_at, updated_at')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),

      // Legacy "Save" button bookmarks — saved_reports. These existed before
      // the constellation flow and aren't automatically mirrored into
      // constellation_entries. We fold them into the unified feed so
      // nothing the user has saved is invisible.
      supabase
        .from('saved_reports')
        .select(`
          id,
          report_id,
          collection_name,
          created_at,
          report:reports(id, title, slug, category, location_name, event_date, summary, latitude, longitude, report_media(url, media_type, is_primary))
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    const entries = entriesResult.data || []
    const totalPhenomena = totalResult.count || 592
    const streak = (streakResult as any).data
    const userConnections = (connectionsResult as any).data || []
    const userTheories = (theoriesResult as any).data || []
    const externalArtifacts = (artifactsResult as any).data || []
    const caseFileLinks = (caseFileLinksResult as any).data || []
    const caseFilesList = (caseFilesListResult as any).data || []
    const savedReportsRows = (savedReportsResult as any).data || []

    // ── Shared-with-me case files ──
    // Case files where the current user is an ACCEPTED collaborator (not just
    // pending). We fetch these separately and tag them in the response so the
    // UI can render a "Shared with me" section distinct from "My case files."
    const { data: sharedRows } = await supabase
      .from('constellation_case_file_collaborators')
      .select(`
        role,
        accepted_at,
        case_file:constellation_case_files(
          id, title, description, cover_color, icon, sort_order, public_slug, user_id, created_at, updated_at
        ),
        owner:profiles!constellation_case_files_user_id_fkey(
          display_name, username, avatar_url
        )
      `)
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
    const sharedCaseFiles = (sharedRows || [])
      .filter((r: any) => r.case_file)
      .map((r: any) => ({ ...r.case_file, _sharedRole: r.role, _sharedOwner: r.owner || null }))

    // Fetch junction rows for shared case files so the UI can show their
    // artifact counts + filter artifacts by shared-case-file id. We scope
    // manually because we're using the service-role client.
    const sharedCaseFileIds = sharedCaseFiles.map((cf: any) => cf.id)
    let sharedJunctionRows: Array<{ case_file_id: string; artifact_id: string }> = []
    if (sharedCaseFileIds.length > 0) {
      const { data: sharedJuncData } = await supabase
        .from('constellation_case_file_artifacts')
        .select('case_file_id, artifact_id')
        .in('case_file_id', sharedCaseFileIds)
      sharedJunctionRows = (sharedJuncData as any) || []
    }
    const allJunctionRows = caseFileLinks.concat(sharedJunctionRows)

    // Fetch COLLABORATOR artifacts — artifacts owned by other users that
    // belong to case files shared with the current user. Without this, the
    // user sees the case file but none of the co-investigators' contributions.
    const myArtifactIds = new Set((externalArtifacts || []).map((a: any) => a.id as string))
    const collaboratorArtifactIds = sharedJunctionRows
      .map(r => r.artifact_id)
      .filter(id => !myArtifactIds.has(id))
    let collaboratorArtifacts: any[] = []
    if (collaboratorArtifactIds.length > 0) {
      const { data } = await supabase
        .from('constellation_artifacts')
        .select('id, user_id, source_type, source_platform, external_url, external_url_hash, title, thumbnail_url, user_note, verdict, tags, metadata_json, created_at, updated_at')
        .in('id', collaboratorArtifactIds)
      collaboratorArtifacts = (data as any) || []
    }

    // Index (artifact_id → case_file_ids[]) for fast lookup when building nodes.
    // Covers owned + shared case files.
    const caseFileIdsByArtifact: Record<string, string[]> = {}
    for (const link of allJunctionRows) {
      if (!caseFileIdsByArtifact[link.artifact_id]) caseFileIdsByArtifact[link.artifact_id] = []
      caseFileIdsByArtifact[link.artifact_id].push(link.case_file_id)
    }

    // Community convergence: look up save counts across ALL users for each
    // hash we see. Aggregated and anonymized via the signals table.
    const urlHashes = externalArtifacts
      .map((a: any) => a.external_url_hash)
      .filter((h: any) => typeof h === 'string' && h.length > 0) as string[]

    const signalsByHash: Record<string, number> = {}
    if (urlHashes.length > 0) {
      const { data: signals } = await supabase
        .from('constellation_external_url_signals')
        .select('url_hash, save_count')
        .in('url_hash', urlHashes)
      if (signals) {
        for (const sig of signals) {
          signalsByHash[sig.url_hash] = sig.save_count || 0
        }
      }
    }

    // Build category engagement from logged entries
    const categoryMap: Record<string, {
      entries: number
      verdicts: Record<string, number>
      reportIds: string[]
    }> = {}

    // Collect all tags and which entries use them (for tag-based connections)
    const tagToEntries: Record<string, string[]> = {}
    const allTags = new Set<string>()

    // Supabase's FK-joined data sometimes arrives as an array wrapper
    // ([{...}]) and sometimes as a plain object depending on how the
    // relationship is inferred. Normalize to a single object once here
    // so every downstream field read (name, latitude, title, etc.) works
    // regardless of which shape came back.
    const unwrapReport = (r: any) => (Array.isArray(r) ? r[0] : r) || null
    const toNum = (v: any): number | null => {
      if (v == null) return null
      const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
      return Number.isFinite(n) ? n : null
    }

    // Build entry nodes for the constellation
    const entryNodes = entries.map((entry: any) => {
      const report = unwrapReport(entry.report)
      const cat = report?.category || 'combination'

      // Category tracking
      if (!categoryMap[cat]) {
        categoryMap[cat] = { entries: 0, verdicts: {}, reportIds: [] }
      }
      categoryMap[cat].entries++
      categoryMap[cat].verdicts[entry.verdict] = (categoryMap[cat].verdicts[entry.verdict] || 0) + 1
      categoryMap[cat].reportIds.push(entry.report_id)

      // Tag tracking
      const entryTags = entry.tags || []
      for (const tag of entryTags) {
        allTags.add(tag)
        if (!tagToEntries[tag]) tagToEntries[tag] = []
        tagToEntries[tag].push(entry.id)
      }

      // Extract image from report_media
      const media = report?.report_media || []
      const images = media.filter((m: any) => m.media_type === 'image' || m.url?.match(/\.(jpg|jpeg|png|webp|gif)/i))
      const primaryImage = images.find((m: any) => m.is_primary) || images[0]

      return {
        id: entry.id,
        reportId: entry.report_id,
        name: report?.title || 'Unknown',
        slug: report?.slug || '',
        category: cat,
        imageUrl: primaryImage?.url || null,
        locationName: report?.location_name || null,
        latitude: toNum(report?.latitude),
        longitude: toNum(report?.longitude),
        eventDate: report?.event_date || null,
        summary: report?.summary || null,
        note: entry.note || '',
        verdict: entry.verdict || 'needs_info',
        tags: entryTags,
        loggedAt: entry.created_at,
        updatedAt: entry.updated_at,
      }
    })

    // ── Fold in legacy saved_reports that don't already have a constellation
    // entry. These are the user's raw bookmarks — no verdict, no tags, no
    // note — but they still belong in the unified feed so the user's "saves"
    // count matches what they'd expect.
    const constellationReportIds = new Set(entries.map((e: any) => e.report_id).filter(Boolean))
    const savedOnlyNodes = savedReportsRows
      .filter((s: any) => s.report_id && !constellationReportIds.has(s.report_id))
      .map(function(s: any) {
        const report = unwrapReport(s.report)
        const cat = report?.category || 'combination'
        if (!categoryMap[cat]) categoryMap[cat] = { entries: 0, verdicts: {}, reportIds: [] }
        categoryMap[cat].entries++
        categoryMap[cat].verdicts['needs_info'] = (categoryMap[cat].verdicts['needs_info'] || 0) + 1
        categoryMap[cat].reportIds.push(s.report_id)

        const media = report?.report_media || []
        const images = media.filter((m: any) => m.media_type === 'image' || m.url?.match(/\.(jpg|jpeg|png|webp|gif)/i))
        const primaryImage = images.find((m: any) => m.is_primary) || images[0]

        return {
          id: 'saved:' + s.id, // namespace to avoid collision with constellation_entry ids
          reportId: s.report_id,
          name: report?.title || 'Saved report',
          slug: report?.slug || '',
          category: cat,
          imageUrl: primaryImage?.url || null,
          locationName: report?.location_name || null,
          latitude: toNum(report?.latitude),
          longitude: toNum(report?.longitude),
          eventDate: report?.event_date || null,
          summary: report?.summary || null,
          note: '',
          verdict: 'needs_info',
          tags: [] as string[],
          loggedAt: s.created_at,
          updatedAt: s.created_at,
          // Flag so the UI can optionally show a "bookmarked" badge and
          // invite users to upgrade to a richer logged entry.
          isLegacyBookmark: true,
        }
      })

    // Build tag-based connections (entries that share tags)
    const tagConnections: Array<{
      tag: string
      entryIds: string[]
    }> = []

    for (const [tag, entryIds] of Object.entries(tagToEntries)) {
      if (entryIds.length > 1) {
        tagConnections.push({ tag, entryIds })
      }
    }

    // Build category stats
    const categoryStats: Record<string, {
      entries: number
      verdicts: Record<string, number>
    }> = {}
    for (const [cat, data] of Object.entries(categoryMap)) {
      categoryStats[cat] = {
        entries: data.entries,
        verdicts: data.verdicts,
      }
    }

    // Calculate explorer rank (new system: rewards depth, not just volume)
    const totalEntries = entries.length
    const categoriesExplored = Object.keys(categoryMap).length
    const uniqueTags = allTags.size
    const hasNotes = entries.filter((e: any) => e.note && e.note.trim().length > 0).length
    const connectionsFound = tagConnections.length

    // Rank system: Stargazer → Field Researcher → Pattern Seeker → Cartographer → Master Archivist
    // Updated to include theories (Phase 2)
    const theoryCount = userTheories.length
    const drawnConnections = userConnections.length
    let rank = 'Stargazer'
    let rankLevel = 1
    if (totalEntries >= 100 && theoryCount >= 5 && categoriesExplored >= 8) {
      rank = 'Master Archivist'; rankLevel = 5
    } else if (totalEntries >= 50 && theoryCount >= 3 && categoriesExplored >= 5) {
      rank = 'Cartographer'; rankLevel = 4
    } else if (totalEntries >= 25 && theoryCount >= 1) {
      rank = 'Pattern Seeker'; rankLevel = 3
    } else if (totalEntries >= 10 && categoriesExplored >= 3) {
      rank = 'Field Researcher'; rankLevel = 2
    }

    // Build trail (chronological logging order)
    const trail = entries
      .slice()
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((entry: any) => ({
        entryId: entry.id,
        reportId: entry.report_id,
        category: entry.report?.category || 'combination',
        timestamp: entry.created_at,
      }))

    // Include external artifacts (YouTube, Reddit, etc.) from Research Hub
    // PLUS artifacts from shared case files owned by collaborators.
    const combinedExternalArtifacts = (externalArtifacts || []).concat(collaboratorArtifacts)
    const externalEntryNodes = combinedExternalArtifacts.map(function(a: any) {
      // Count external artifact tags in the tag system too
      var artifactTags = a.tags || []
      for (var i = 0; i < artifactTags.length; i++) {
        var tag = artifactTags[i]
        allTags.add(tag)
        if (!tagToEntries[tag]) tagToEntries[tag] = []
        tagToEntries[tag].push(a.id)
      }

      // Don't auto-place external saves on the user map. A news article
      // ABOUT an event in Phoenix shouldn't pin to Phoenix — that would
      // mislead the user's research view. External artifacts only land
      // on the map once we add an explicit opt-in geo-intent flag.
      return {
        id: a.id,
        artifactId: a.id,  // external artifacts are their own artifact row
        reportId: '',
        name: a.title || 'External Source',
        slug: '',
        category: 'external',
        imageUrl: a.thumbnail_url || null,
        locationName: null,
        eventDate: null,
        summary: (a.metadata_json && a.metadata_json.description) || null,
        note: a.user_note || '',
        verdict: a.verdict || 'needs_info',
        tags: artifactTags,
        loggedAt: a.created_at,
        updatedAt: a.updated_at,
        sourceType: a.source_type,
        sourcePlatform: a.source_platform || null,
        externalUrl: a.external_url,
        sourceMetadata: a.metadata_json || null,
        caseFileIds: caseFileIdsByArtifact[a.id] || [],
        // Subtract 1 so the badge counts OTHER researchers who saved the
        // same URL, not including this user.
        communitySaveCount: a.external_url_hash ? Math.max(0, (signalsByHash[a.external_url_hash] || 1) - 1) : 0,
      }
    })

    // Merge all entry nodes: constellation logs + legacy bookmarks + external artifacts.
    var allEntryNodes = entryNodes.concat(savedOnlyNodes).concat(externalEntryNodes)

    // Build per-case-file artifact counts for the CaseFileBar.
    // Covers owned + shared case files.
    const artifactCountByCaseFile: Record<string, number> = {}
    for (const link of allJunctionRows) {
      artifactCountByCaseFile[link.case_file_id] = (artifactCountByCaseFile[link.case_file_id] || 0) + 1
    }
    const caseFiles = caseFilesList.map((cf: any) => ({
      id: cf.id,
      title: cf.title,
      description: cf.description,
      cover_color: cf.cover_color,
      icon: cf.icon,
      sort_order: cf.sort_order,
      public_slug: cf.public_slug || null,
      artifact_count: artifactCountByCaseFile[cf.id] || 0,
      created_at: cf.created_at,
      updated_at: cf.updated_at,
      is_shared_with_me: false,
      role: 'owner' as const,
      owner: null as null | { displayName: string | null; username: string | null; avatarUrl: string | null },
    })).concat(sharedCaseFiles.map((cf: any) => ({
      id: cf.id,
      title: cf.title,
      description: cf.description,
      cover_color: cf.cover_color,
      icon: cf.icon,
      sort_order: cf.sort_order,
      public_slug: cf.public_slug || null,
      // Artifact count for shared case files — count how many junction rows
      // reference this case file id, regardless of owner. RLS ensures we
      // only see counts for case files we have access to.
      artifact_count: artifactCountByCaseFile[cf.id] || 0,
      created_at: cf.created_at,
      updated_at: cf.updated_at,
      is_shared_with_me: true,
      role: cf._sharedRole as 'editor' | 'viewer',
      owner: cf._sharedOwner ? {
        displayName: cf._sharedOwner.display_name,
        username: cf._sharedOwner.username,
        avatarUrl: cf._sharedOwner.avatar_url,
      } : null,
    })))

    return res.status(200).json({
      entryNodes: allEntryNodes,
      caseFiles,
      categoryStats,
      tagConnections,
      trail,
      userConnections: userConnections.map((c: any) => ({
        id: c.id,
        entryAId: c.entry_a_id,
        entryBId: c.entry_b_id,
        annotation: c.annotation || '',
        createdAt: c.created_at,
      })),
      userTheories: userTheories.map((t: any) => ({
        id: t.id,
        title: t.title,
        thesis: t.thesis || '',
        entry_ids: t.entry_ids || [],
        connection_ids: t.connection_ids || [],
        is_public: t.is_public || false,
        created_at: t.created_at,
        updated_at: t.updated_at,
      })),
      stats: {
        totalEntries: totalEntries + externalArtifacts.length,
        totalPhenomena,
        categoriesExplored,
        totalCategories: 11,
        uniqueTags: allTags.size,
        notesWritten: hasNotes,
        connectionsFound,
        drawnConnections,
        theoryCount,
        externalArtifacts: externalArtifacts.length,
        currentStreak: streak?.current_streak || 0,
        longestStreak: streak?.longest_streak || 0,
        rank,
        rankLevel,
      },
    })
  } catch (err: any) {
    console.error('Constellation user-map error:', err)
    // Return empty data on error (table might not exist yet)
    return res.status(200).json({
      entryNodes: [],
      caseFiles: [],
      categoryStats: {},
      tagConnections: [],
      trail: [],
      stats: {
        totalEntries: 0,
        totalPhenomena: 592,
        categoriesExplored: 0,
        totalCategories: 11,
        uniqueTags: 0,
        notesWritten: 0,
        connectionsFound: 0,
        currentStreak: 0,
        longestStreak: 0,
        rank: 'Stargazer',
        rankLevel: 1,
      },
    })
  }
}
