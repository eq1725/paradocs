// V11.17.71 - Pro Dossier
//
// GET /api/lab/dossier?experienceReportId=X
//
// Lazy-fetch endpoint per PRO_TIER_VALIDATION_V3.md §3. Returns the
// cached Dossier when fresh; computes-and-persists when stale or
// missing. Auth: Pro tier required.
//
// Response shape:
//   { ok: true, dossier: ProDossierRow, computed: boolean,
//     stale_reason: string | null }

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveDossierContext } from '@/lib/lab/dossier/dossier-auth'
import { getOrComputeDossier } from '@/lib/lab/dossier/dossier-service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var ctx = await resolveDossierContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })
  if (ctx.tier !== 'pro') return res.status(403).json({ error: 'pro_tier_required', tier: ctx.tier })

  var experienceReportId = (req.query.experienceReportId as string) || ''
  if (!experienceReportId) return res.status(400).json({ error: 'missing_experienceReportId' })

  var out = await getOrComputeDossier(ctx.svc, ctx.user.id, experienceReportId)
  if (!out.row) return res.status(404).json({ error: 'experience_not_found' })

  return res.status(200).json({
    ok: true,
    dossier: out.row,
    computed: out.computed,
    stale_reason: out.stale_reason,
  })
}
