// V11.17.71 - Pro Dossier
//
// GET /api/lab/dossier/[id]/share-card.png
//
// Renders the 1080×1350 social-share PNG. Anonymized by default —
// shows phen-family, year, region (state-level only), rarity stat,
// Paradocs wordmark.
//
// Access:
//   - Owner can always fetch (logged-in).
//   - Public if the dossier has is_public_shareable = TRUE AND the
//     caller passes ?token=<share_token>.
//
// Fallback: when sharp rasterization fails, returns the SVG with
// Content-Type image/svg+xml so the artifact still loads in most
// clients.

import type { NextApiRequest, NextApiResponse } from 'next'
import {
  resolveDossierContext,
  serviceContext,
} from '@/lib/lab/dossier/dossier-auth'
import {
  getDossierById,
  getDossierByShareToken,
} from '@/lib/lab/dossier/dossier-service'
import {
  renderShareCardSvg,
  rasterizeSvgToPng,
} from '@/lib/lab/dossier/dossier-render'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var dossierId = (req.query.id as string) || ''
  if (!dossierId) return res.status(400).json({ error: 'missing_id' })
  var shareTokenParam = (req.query.token as string) || ''

  var row: import('@/lib/lab/dossier/dossier-types').ProDossierRow | null = null

  // Owner path first.
  var ctx = await resolveDossierContext(req)
  if (ctx) {
    row = await getDossierById(ctx.svc, dossierId, ctx.user.id)
  }
  // Public-share path.
  if (!row && shareTokenParam) {
    var svcCtx = serviceContext()
    row = await getDossierByShareToken(svcCtx.svc, shareTokenParam)
    if (row && row.id !== dossierId) row = null
  }
  if (!row) return res.status(404).json({ error: 'dossier_not_found' })

  var svg = renderShareCardSvg(row.sections_json)
  var png = await rasterizeSvgToPng(svg)
  if (png) {
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600')
    return res.status(200).send(png)
  }
  // Fallback to SVG.
  res.setHeader('Content-Type', 'image/svg+xml')
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600')
  return res.status(200).send(svg)
}
