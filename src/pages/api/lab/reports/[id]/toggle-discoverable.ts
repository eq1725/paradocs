// V11.17.73 — Named-Match + DM
//
// POST /api/lab/reports/[id]/toggle-discoverable
//
// Body: { discoverable: boolean }
//
// Flips the per-experience opt-in flag for the named-match matcher.
// Only the report owner can toggle. Any tier may toggle — Free users
// can opt in even though they won't see offers themselves; their
// experience can still match into Basic+ contributors' rails. The
// inverse — a Basic contributor matching against a Free report — is
// allowed because the Free user has explicitly opted in via this
// toggle. (Open question: founder confirm Free-tier behavior.)

import type { NextApiRequest, NextApiResponse } from 'next'
import { resolveNamedMatchContext } from '@/lib/lab/named-match/named-match-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var ctx = await resolveNamedMatchContext(req)
  if (!ctx) return res.status(401).json({ error: 'unauthorized' })

  var reportId = (req.query.id as string) || ''
  if (!reportId) return res.status(400).json({ error: 'missing_id' })

  var body = req.body || {}
  if (typeof body.discoverable !== 'boolean') {
    return res.status(400).json({ error: 'discoverable_required' })
  }

  // Verify ownership via service role (RLS would also enforce this on
  // UPDATE; we double-check so we can return a clean 403).
  var rResp = await ctx.svc
    .from('reports')
    .select('id, submitted_by, source_type')
    .eq('id', reportId)
    .maybeSingle()
  if (rResp.error) return res.status(500).json({ error: 'fetch_failed', detail: rResp.error.message })
  var report: any = rResp.data
  if (!report) return res.status(404).json({ error: 'report_not_found' })
  if (report.submitted_by !== ctx.user.id) return res.status(403).json({ error: 'not_owner' })
  if (report.source_type !== 'user_submission') {
    return res.status(400).json({ error: 'not_user_submission' })
  }

  var upResp = await ctx.svc
    .from('reports')
    .update({ discoverable: body.discoverable } as any)
    .eq('id', reportId)
  if (upResp.error) return res.status(500).json({ error: 'update_failed', detail: upResp.error.message })

  return res.status(200).json({ ok: true, discoverable: body.discoverable })
}
