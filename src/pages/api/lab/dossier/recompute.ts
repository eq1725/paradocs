// V11.17.71 - Pro Dossier
//
// POST /api/lab/dossier/recompute?experienceReportId=X
//
// Force-recompute even when the cached Dossier is fresh. Useful when
// the user has just edited their experience or wants the very latest
// Archive growth reflected. Auth: Pro.

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveDossierContext } from '@/lib/lab/dossier/dossier-auth'
import { forceRecompute } from '@/lib/lab/dossier/dossier-service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var ctx = await resolveDossierContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })
  if (ctx.tier !== 'pro') return res.status(403).json({ error: 'pro_tier_required', tier: ctx.tier })

  var experienceReportId = (req.query.experienceReportId as string) || ''
  if (!experienceReportId) return res.status(400).json({ error: 'missing_experienceReportId' })

  var row = await forceRecompute(ctx.svc, ctx.user.id, experienceReportId)
  if (!row) return res.status(404).json({ error: 'experience_not_found' })

  return res.status(200).json({ ok: true, dossier: row })
}
