// V11.17.71 - Pro Dossier
//
// GET/POST /api/cron/recompute-dossiers
//
// Nightly cron that recomputes stale Pro Dossiers (per
// PRO_TIER_VALIDATION_V3 §3.5). Stale = computed_at older than 7
// days; the engine's getOrComputeDossier additionally retriggers
// when the checksum or report.updated_at changes.
//
// Auth: CRON_SECRET convention shared with the other cron endpoints.

import type { NextApiRequest, NextApiResponse } from 'next'
import { serviceContext } from '@/lib/lab/dossier/dossier-auth'
import {
  forceRecompute,
  listStaleDossiers,
} from '@/lib/lab/dossier/dossier-service'

var MAX_DOSSIERS_PER_RUN = 500
var CONCURRENCY = 4

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var cronSecret = process.env.CRON_SECRET
  var authHeader = req.headers.authorization || ''
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  var startedMs = Date.now()
  var svcCtx = serviceContext()

  try {
    var stale = await listStaleDossiers(svcCtx.svc, MAX_DOSSIERS_PER_RUN)

    var recomputed = 0
    var failed = 0
    var index = 0
    var worker = async function (): Promise<void> {
      while (index < stale.length) {
        var myIdx = index++
        var item = stale[myIdx]
        try {
          var row = await forceRecompute(svcCtx.svc, item.user_id, item.experience_report_id)
          if (row) recomputed++
          else failed++
        } catch (_e) {
          failed++
        }
      }
    }
    var workers: Promise<void>[] = []
    for (var w = 0; w < CONCURRENCY; w++) workers.push(worker())
    await Promise.all(workers)

    var duration_ms = Date.now() - startedMs
    var out = {
      ok: true,
      processed: stale.length,
      recomputed: recomputed,
      failed: failed,
      duration_ms: duration_ms,
    }
    console.log('[CronRecomputeDossiers] ' + JSON.stringify(out))
    return res.status(200).json(out)
  } catch (e: any) {
    console.error('[CronRecomputeDossiers] error: ' + (e && e.message ? e.message : e))
    return res.status(500).json({ error: 'internal_error', message: e && e.message ? e.message : String(e) })
  }
}
