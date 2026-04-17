/**
 * GET /api/public/case-files/:slug
 *
 * Fetches a publicly-shared case file by its slug — no authentication
 * required. Returns the case file metadata plus all artifacts linked to it,
 * scrubbed of owner-identifying fields.
 *
 * Used by /cases/public/[slug] for the view-only public page. This is the
 * "share a case file with a friend" surface — Raindrop's public collections
 * reimagined for paranormal research.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const slug = (req.query.slug as string || '').trim()
  if (!slug) return res.status(400).json({ error: 'slug required' })

  // Use the service key so our query isn't subject to auth-user RLS —
  // the new public policies (SELECT WHERE public_slug IS NOT NULL) will
  // still scope results, but we're explicit about it here with the filter.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: caseFile, error: cfErr } = await supabase
    .from('constellation_case_files')
    .select('id, title, description, cover_color, icon, created_at, updated_at, public_slug')
    .eq('public_slug', slug)
    .maybeSingle()

  if (cfErr) {
    console.error('[public-case-file:fetch]', cfErr)
    return res.status(500).json({ error: 'Lookup failed' })
  }
  if (!caseFile) {
    return res.status(404).json({ error: 'Case file not found or not public' })
  }

  // Load artifacts + owner's public display name.
  const [{ data: links }, { data: owner }] = await Promise.all([
    supabase
      .from('constellation_case_file_artifacts')
      .select('artifact_id, added_at')
      .eq('case_file_id', caseFile.id)
      .order('added_at', { ascending: false }),
    supabase
      .from('constellation_case_files')
      .select('user_id')
      .eq('id', caseFile.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data?.user_id) return { data: null } as any
        return supabase
          .from('profiles')
          .select('display_name, username')
          .eq('id', data.user_id)
          .maybeSingle()
      }),
  ])

  const artifactIds = (links || []).map((l: any) => l.artifact_id)
  let artifacts: any[] = []
  if (artifactIds.length > 0) {
    const { data: artRows } = await supabase
      .from('constellation_artifacts')
      .select('id, source_type, source_platform, external_url, title, thumbnail_url, user_note, verdict, tags, metadata_json, created_at')
      .in('id', artifactIds)

    artifacts = (artRows || []).map((a: any) => ({
      id: a.id,
      title: a.title,
      thumbnailUrl: a.thumbnail_url,
      sourceType: a.source_type,
      sourcePlatform: a.source_platform,
      externalUrl: a.external_url,
      verdict: a.verdict || 'needs_info',
      tags: a.tags || [],
      // Deliberately scrub `user_note` — that's the owner's private commentary.
      // Only `metadata_json.description` (which came from the OG scrape, not
      // the user) is safe to show publicly.
      description: (a.metadata_json && a.metadata_json.description) || null,
      createdAt: a.created_at,
    }))
  }

  return res.status(200).json({
    caseFile: {
      id: caseFile.id,
      title: caseFile.title,
      description: caseFile.description,
      coverColor: caseFile.cover_color,
      icon: caseFile.icon,
      slug: caseFile.public_slug,
      createdAt: caseFile.created_at,
      updatedAt: caseFile.updated_at,
    },
    owner: owner
      ? {
          displayName: (owner as any)?.data?.display_name || null,
          username: (owner as any)?.data?.username || null,
        }
      : null,
    artifacts,
  })
}
