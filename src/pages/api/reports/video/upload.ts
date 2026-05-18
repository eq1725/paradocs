/**
 * POST /api/reports/video/upload — DEPRECATED
 *
 * Panel-feedback (May 2026). Replaced by the two-step signed-URL
 * upload flow:
 *
 *   1. POST /api/reports/video/upload-url     → returns signed URL
 *   2. PUT bytes directly to Supabase Storage (bypasses Vercel)
 *   3. POST /api/reports/video/[id]/finalize  → flips status
 *
 * Why: the raw-body POST pushed video bytes through a Vercel
 * serverless function, which caps request bodies at ~50 MB on Pro.
 * Direct-to-Storage uploads have no such limit and let us support
 * 5-minute iPhone HEVC recordings (~250–300 MB).
 *
 * This file returns 410 Gone so any stale clients fail loudly and
 * we can grep for stragglers in logs.
 */

import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  return res.status(410).json({
    error: 'This endpoint is deprecated. Use POST /api/reports/video/upload-url then PUT directly to Storage, then POST /api/reports/video/[id]/finalize.',
    superseded_by: ['/api/reports/video/upload-url', '/api/reports/video/[id]/finalize'],
  })
}
