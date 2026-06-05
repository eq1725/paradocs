// V11.17.71 - Pro Dossier
//
// POST /api/lab/dossier/[id]/toggle-public
//
// Body: { public: boolean }
//
// Flips the is_public_shareable flag on a specific Dossier. When
// turning ON for the first time, the server mints a fresh
// share_token. When turning OFF, the token is preserved (so the user
// can flip back without breaking previously-shared URLs — though
// authoring a "regenerate token" affordance is a future option).

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveDossierContext } from '@/lib/lab/dossier/dossier-auth'
import { togglePublicShare } from '@/lib/lab/dossier/dossier-service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var ctx = await resolveDossierContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })
  if (ctx.tier !== 'pro') return res.status(403).json({ error: 'pro_tier_required', tier: ctx.tier })

  var dossierId = (req.query.id as string) || ''
  if (!dossierId) return res.status(400).json({ error: 'missing_id' })

  var body = req.body || {}
  var desired = !!body.public

  var row = await togglePublicShare(ctx.svc, ctx.user.id, dossierId, desired)
  if (!row) return res.status(404).json({ error: 'dossier_not_found' })

  return res.status(200).json({
    ok: true,
    is_public_shareable: row.is_public_shareable,
    share_token: row.share_token,
    public_url: row.share_token
      ? '/dossier/share/' + row.share_token
      : null,
  })
}
